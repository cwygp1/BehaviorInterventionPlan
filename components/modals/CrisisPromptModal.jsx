import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import PromptResultBlock from './PromptResultBlock';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import AIActionBar from '../ui/AIActionBar';
import { buildFullStudentContext } from '../../lib/tierContext';

function buildPrompt(stu, situation) {
  return `당신은 특수교육 위기관리 전문가입니다.
다음 학생의 위기 행동 상황에 대해 Acting-Out Cycle 7단계 기반 단계별 대응 시나리오를 작성해주세요.

## 학생 (비식별)
- ID: ${stu?.code || '미선택'}
- 학교급: ${stu?.level || ''}
- 주요 장애: ${stu?.disability || ''}
- 비식별 요약: ${stu?.note || '(없음)'}

## 묘사된 위기 상황
${situation}

## 작성 요구사항
다음 7단계 각각에 대해 구체적 대응을 한국어로 작성:

### 1. 안정 (Calm) — 예방
### 2. 전조 (Trigger) — 자극 제거
### 3. 흥분 (Agitation) — 공감적 경청
### 4. 가속 (Acceleration) — 안전 거리
### 5. 고조/위기 (Peak) — 안전 확보 / 위기관리팀
### 6. 탈고조 (De-escalation) — 독립 공간
### 7. 회복 (Recovery) — 복귀 / 사후 협의

각 단계마다 "교사가 구체적으로 어떤 말을 하고 어떤 행동을 하는가"를 한국어로 명시.
마지막에 "신체적 개입 5대 원칙(안전 최우선/최후의 수단/최소한의 힘/일시적 사용/기록·보고)"을 준수했는지 자가점검 체크리스트도 포함.`;
}

export default function CrisisPromptModal({ open, onClose }) {
  const { curStu, curStuId, curStuData, tier2Groups, curSemester } = useStudents();
  const { call, status } = useLLM();
  const toast = useToast();
  const [situation, setSituation] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  // 위기 대응이 실제 운영 중인 다층 지원(특히 Tier1/2 연동)을 고려하도록 맥락 접미부를 미리 만들어 둔다.
  const [tierSuffix, setTierSuffix] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!open || !curStu) { setTierSuffix(''); return undefined; }
    (async () => {
      try {
        const { text, linkage } = await buildFullStudentContext({ student: curStu, studentId: curStuId, data: curStuData, tier2Groups, semester: curSemester });
        // 위기 대응엔 Tier1/2 연동(linkage)을 핵심으로, 출발점 포함 text 도 함께 제공.
        const ctx = linkage && linkage.trim() ? (text || linkage) : (text || '');
        if (!cancelled) setTierSuffix(ctx && ctx.trim() ? '\n\n[참고 — 이 학생의 다층 지원·출발점 맥락 (운영 중인 Tier 1/2 지원과 일관되게 대응할 것)]\n' + ctx : '');
      } catch (_) { if (!cancelled) setTierSuffix(''); }
    })();
    return () => { cancelled = true; };
  }, [open, curStu, curStuId, curStuData, tier2Groups, curSemester]);

  const fullPrompt = situation.trim() ? buildPrompt(curStu, situation) + tierSuffix : '';

  async function runAI() {
    if (!situation.trim()) { toast('위기 상황을 묘사해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setBusy(true); setOutput('');
    try {
      const reply = await call(fullPrompt);
      setOutput(reply);
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={760}>
      <h3>🚨 위기 시나리오 AI 생성</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        학생의 위기 행동 상황을 구체적으로 묘사하면, Acting-Out Cycle 7단계 대응 시나리오를 AI가 작성합니다.
      </p>
      <div className="form-group">
        <label className="form-label">상황 묘사</label>
        <textarea className="form-textarea" rows={4} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="예: 수학 시간 중 익힘책 풀이 거부 → 책상 위로 올라가 소리 지르며 친구를 향해 연필 던짐. 교사가 다가가자 도주." />
      </div>
      <AIActionBar
        prompt={fullPrompt}
        onCallAI={runAI}
        busy={busy}
        callLabel="🤖 7단계 시나리오 생성"
        disabled={!situation.trim()}
        align="flex-start"
      />
      {(output || busy) && <PromptResultBlock prompt={fullPrompt} output={output} busy={busy} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
