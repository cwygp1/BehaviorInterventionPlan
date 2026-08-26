import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import PromptResultBlock from './PromptResultBlock';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import AIActionBar from '../ui/AIActionBar';
import { buildFullStudentContext, raisdLines } from '../../lib/tierContext';
import { priorityLines } from '../../lib/priority';
import { studentProfileParts } from '../../lib/utils/splitNote';
import { ebpBlockForBehavior } from '../../lib/ebp';
import { functionSkillsBlock } from '../../lib/functionSkills';

// QABF 5기능 합계에서 최대 기능 라벨(EBP 매핑용). 없으면 ''.
function topQabfFunction(data) {
  const qabfArr = data?.qabf || [];
  const totals = { 관심: 0, 회피: 0, 자동감각: 0, 신체: 0, 강화물: 0 };
  const FUNC_BY_INDEX = ['관심', '회피', '자동감각', '신체', '강화물'];
  qabfArr.forEach((v, i) => { if (v >= 0) totals[FUNC_BY_INDEX[i % 5]] += v; });
  const max = Math.max(...Object.values(totals));
  if (max <= 0) return '';
  return Object.keys(totals).find((k) => totals[k] === max) || '';
}

function buildPrompt(stu, data) {
  const abc = (data?.abc || []).slice(0, 8).map((r, i) =>
    `[${i + 1}] ${r.date || ''} ${r.time || ''}\n  A: ${r.a || ''}\n  B: ${r.b || ''}\n  C: ${r.c || ''}`
  ).join('\n');
  const qabfArr = data?.qabf || [];
  const qabfTotals = { 관심: 0, 회피: 0, 자동감각: 0, 신체: 0, 강화물: 0 };
  const FUNC_BY_INDEX = ['관심', '회피', '자동감각', '신체', '강화물'];
  qabfArr.forEach((v, i) => {
    if (v >= 0) qabfTotals[FUNC_BY_INDEX[i % 5]] += v;
  });

  return `당신은 특수교육 PBS(긍정적 행동지원) 컨설턴트입니다.
다음 학생 정보·관찰 기록·QABF 결과를 분석하여 BIP(행동중재계획) 초안을 작성해주세요.

## 학생 프로필 (비식별)
- ID: ${stu?.code}
- 학교급: ${stu?.level}
- 주요 장애: ${stu?.disability}
- 강점: ${studentProfileParts(stu).strengths || '(미입력)'}
- 어려움(지원 요구): ${studentProfileParts(stu).difficulties || '(미입력)'}${raisdLines(data).length ? '\n' + raisdLines(data).map((l) => `- ${l}`).join('\n') + '\n※ [REINF] 강화 전략은 위 선호/강화물을 우선 활용하고, 사용 금지 항목은 절대 포함하지 마세요.' : ''}

## 표적행동 우선순위 (교사가 체크리스트로 선정)
${priorityLines(data?.priority?.responses).join('\n') || '(미작성 — 관찰된 행동 중 가장 시급한 것을 기준으로 작성)'}

## ABC 관찰 누적 (최근 ${(data?.abc || []).slice(0, 8).length}건)
${abc || '(기록 없음)'}

## QABF 5기능 점수 (각 0~15)
- 관심(Attention): ${qabfTotals.관심}
- 회피(Escape): ${qabfTotals.회피}
- 자동·감각(Automatic/Sensory): ${qabfTotals.자동감각}
- 신체(Physical/통증): ${qabfTotals.신체}
- 강화물 획득(Tangible): ${qabfTotals.강화물}

## 작성 요구사항
2024 서울시교육청 PBS 가이드북 기반으로 다음 7개 항목을 한국어로 작성합니다.
각 항목은 정확히 다음 형식으로 표시해주세요 (자동 인식):

※ 위 우선순위 1순위 행동이 있으면 그 행동을 표적행동으로 삼아 작성하세요.

[ALT] (대체 행동 — 한 문장)
[FCT] (FCT 기능적 의사소통 기술)
[CRIT] (성공 기준 — 빈도/기간)
[PREV] (예방 전략 — 줄바꿈으로 3~5가지)
[TEACH] (교수 전략 — 줄바꿈으로 3~5가지)
[REINF] (강화 전략 — 줄바꿈으로 3~5가지)
[RESP] (반응 절차 — 줄바꿈으로 3~5가지)`;
}

function parseResponse(text) {
  const out = {};
  const tags = ['ALT', 'FCT', 'CRIT', 'PREV', 'TEACH', 'REINF', 'RESP'];
  const map = { ALT: 'alt', FCT: 'fct', CRIT: 'crit', PREV: 'prev', TEACH: 'teach', REINF: 'reinf', RESP: 'resp' };
  tags.forEach((tag, i) => {
    const re = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\[(?:${tags.slice(i + 1).join('|') || 'NOTHING'})\\]|$)`, 'm');
    const m = text.match(re);
    if (m) out[map[tag]] = m[1].trim();
  });
  return out;
}

export default function BIPPromptModal({ open, onClose, onApply }) {
  const { curStu, curStuId, curStuData, tier2Groups, curSemester } = useStudents();
  const { call, status } = useLLM();
  const toast = useToast();
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const basePrompt = curStu ? buildPrompt(curStu, curStuData) : '';
  // 다층 지원 맥락(Tier1/2 + 출발점) + 행동중재 EBP 후보를 덧붙인 최종 프롬프트.
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!open || !curStu) { setPrompt(basePrompt); return undefined; }
    (async () => {
      let full = basePrompt;
      try {
        const { text: tierText } = await buildFullStudentContext({ student: curStu, studentId: curStuId, data: curStuData, tier2Groups, semester: curSemester });
        if (tierText && tierText.trim()) full += '\n\n[참고 — 이 학생의 다층 지원·출발점 맥락 (Tier 2 CICO 등 운영 중인 지원을 반영할 것)]\n' + tierText;
      } catch (_) { /* best-effort */ }
      const ebp = ebpBlockForBehavior({ qabfFunction: topQabfFunction(curStuData), behaviorText: curStuData?.abc?.[0]?.b || '' });
      if (ebp) full += '\n\n' + ebp;
      // 기능기반 IEPBS(0819): 추정 기능의 대체 핵심기술 + PBS 3전략(선행·교수·후속결과) 예시 주입 —
      // [ALT]/[FCT]는 이 핵심기술에서, [PREV]/[TEACH]/[REINF]는 해당 전략을 학생에 맞게 구체화하도록.
      const fs = functionSkillsBlock(topQabfFunction(curStuData));
      if (fs) full += '\n\n' + fs;
      if (!cancelled) setPrompt(full);
    })();
    return () => { cancelled = true; };
  }, [open, curStu, curStuId, curStuData, tier2Groups, curSemester, basePrompt]);

  async function runAI() {
    if (!curStu) { toast('학생을 먼저 선택해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요. (우상단 AI 버튼)'); return; }
    setBusy(true); setOutput('');
    try {
      const reply = await call(prompt || basePrompt);
      setOutput(reply);
    } catch (e) {
      toast('AI 호출 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function applyToBIP() {
    const parsed = parseResponse(output);
    if (Object.keys(parsed).length === 0) { toast('AI 응답에서 항목을 찾을 수 없습니다.'); return; }
    onApply?.(parsed);
    toast('BIP 칸에 적용했습니다. 검토 후 저장해주세요.');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={780}>
      <h3>📜 AI BIP 중재안 프롬프트</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        현재 학생의 ABC 누적 관찰과 QABF 점수를 바탕으로 PTR(예방·교수·강화) 전략과 반응 절차의 BIP 초안을 AI가 생성합니다.
        결과를 BIP 칸에 한 번에 적용할 수 있습니다.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <AIActionBar prompt={prompt} onCallAI={runAI} busy={busy} callLabel="🤖 AI로 초안 생성" align="flex-start" />
        {output && (
          <button className="btn btn-ok btn-sm" onClick={applyToBIP}>
            ✅ BIP 칸에 적용
          </button>
        )}
      </div>
      {(output || busy) && <PromptResultBlock prompt={prompt} output={output} busy={busy} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
