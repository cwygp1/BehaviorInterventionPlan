import { useState } from 'react';
import Modal from '../ui/Modal';
import PromptResultBlock from './PromptResultBlock';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import AIActionBar from '../ui/AIActionBar';

function buildPrompt(stu, data) {
  const abc = (data?.abc || []).slice(0, 8).map((r, i) =>
    `[${i + 1}] ${r.date || ''} ${r.time || ''}\n  A: ${r.a || ''}\n  B: ${r.b || ''}\n  C: ${r.c || ''}`
  ).join('\n');
  const qabfArr = data?.qabf || [];
  const qabfTotals = { 관심: 0, 회피: 0, 획득: 0, 감각: 0, 비사회적: 0 };
  const FUNC_BY_INDEX = ['관심', '회피', '획득', '감각', '비사회적'];
  qabfArr.forEach((v, i) => {
    if (v >= 0) qabfTotals[FUNC_BY_INDEX[i % 5]] += v;
  });

  return `당신은 특수교육 PBS(긍정적 행동지원) 컨설턴트입니다.
다음 학생 정보·관찰 기록·QABF 결과를 분석하여 BIP(행동중재계획) 초안을 작성해주세요.

## 학생 프로필 (비식별)
- ID: ${stu?.code}
- 학교급: ${stu?.level}
- 주요 장애: ${stu?.disability}
- 비식별 요약: ${stu?.note || '(없음)'}

## ABC 관찰 누적 (최근 ${(data?.abc || []).slice(0, 8).length}건)
${abc || '(기록 없음)'}

## QABF 5기능 점수 (각 0~15)
- 관심(Attention): ${qabfTotals.관심}
- 회피(Escape): ${qabfTotals.회피}
- 획득(Tangible): ${qabfTotals.획득}
- 감각/자동(Sensory): ${qabfTotals.감각}
- 비사회적(Non-social): ${qabfTotals.비사회적}

## 작성 요구사항
2024 서울시교육청 PBS 가이드북 기반으로 다음 7개 항목을 한국어로 작성합니다.
각 항목은 정확히 다음 형식으로 표시해주세요 (자동 파싱):

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
  const { curStu, curStuData } = useStudents();
  const { call, status } = useLLM();
  const toast = useToast();
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const prompt = curStu ? buildPrompt(curStu, curStuData) : '';

  async function runAI() {
    if (!curStu) { toast('학생을 먼저 선택해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요. (우상단 AI 버튼)'); return; }
    setBusy(true); setOutput('');
    try {
      const reply = await call(prompt);
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
        현재 학생의 ABC 누적 관찰과 QABF 점수를 바탕으로 예방·교수·강화·반응 4영역의 BIP 초안을 AI가 생성합니다.
        결과를 BIP 칸에 한 번에 적용하거나, 외부 AI에 프롬프트를 복사해서 사용할 수도 있습니다.
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
