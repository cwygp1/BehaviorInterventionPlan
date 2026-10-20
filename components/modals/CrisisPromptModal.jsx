import { useEffect, useState } from 'react';
import { levelLabel } from '../../lib/schoolLevel';
import Modal from '../ui/Modal';
import PromptResultBlock from './PromptResultBlock';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import AIActionBar from '../ui/AIActionBar';
import { buildFullStudentContext } from '../../lib/tierContext';
import { useAuth } from '../../contexts/AuthContext';
import { printCrisisScenario } from '../../lib/utils/printCrisisScenario';
import { createCrisisScenario, updateCrisisScenario } from '../../lib/api/students';

function buildPrompt(stu, situation) {
  return `당신은 특수교육 위기관리 전문가입니다.
다음 학생의 위기 행동 상황에 대해 Acting-Out Cycle 7단계 기반 단계별 대응 시나리오를 작성해주세요.

## 학생 (비식별)
- ID: ${stu?.code || '미선택'}
- 학교급: ${levelLabel(stu?.level)}
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

// initial: CrisisPage '저장된 시나리오' 목록에서 '다시 보기'로 열 때 넘기는 기록({id, situation, output}).
export default function CrisisPromptModal({ open, onClose, initial }) {
  const { curStu, curStuId, curStuData, tier2Groups, curSemester, updateStudentData } = useStudents();
  const { call, status } = useLLM();
  const { user } = useAuth();
  const toast = useToast();
  const [situation, setSituation] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  // 위기 대응이 실제 운영 중인 다층 지원(특히 Tier1/2 연동)을 고려하도록 맥락 접미부를 미리 만들어 둔다.
  const [tierSuffix, setTierSuffix] = useState('');
  // 1020(피드백 3차 ①): 저장된 기록 id — 있으면 '저장'이 그 기록을 덮어쓴다(교사 편집본). 새로 생성하면 null로.
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);

  // 다시 보기로 열리면 저장된 상황·결과를 채운다.
  useEffect(() => {
    if (!open || !initial) return;
    setSituation(initial.situation || '');
    setOutput(initial.output || '');
    setSavedId(initial.id || null);
  }, [open, initial]);

  async function onSave() {
    if (!curStuId) { toast('학생을 먼저 선택해주세요.'); return; }
    if (!output.trim()) { toast('저장할 시나리오가 아직 없어요.'); return; }
    setSaving(true);
    try {
      if (savedId) {
        const res = await updateCrisisScenario(curStuId, { id: savedId, situation, output });
        updateStudentData(curStuId, (cur) => ({ ...cur, crisis: (cur.crisis || []).map((r) => (r.id === savedId ? res.record : r)) }));
        toast('시나리오를 고쳐 저장했어요. 위기행동 대처 화면의 "저장된 위기 시나리오"에서 다시 볼 수 있어요.');
      } else {
        const res = await createCrisisScenario(curStuId, { situation, output });
        setSavedId(res.record.id);
        updateStudentData(curStuId, (cur) => ({ ...cur, crisis: [res.record, ...(cur.crisis || [])] }));
        toast('저장했어요. 위기행동 대처 화면의 "저장된 위기 시나리오"에서 다시 볼 수 있어요.');
      }
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setSaving(false); }
  }

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

  // 1020(피드백 3차 ②): 결과를 그대로 인쇄. 교사 편집본(PromptResultBlock onChange)이 output에 반영된다.
  function onPrint() {
    if (!output.trim()) { toast('인쇄할 시나리오가 아직 없어요.'); return; }
    printCrisisScenario({
      studentId: curStu?.code, level: levelLabel(curStu?.level), disability: curStu?.disability,
      situation, output, teacherName: user?.name, school: user?.school,
    });
  }

  async function runAI() {
    if (!situation.trim()) { toast('위기 상황을 묘사해주세요.'); return; }
    if (status !== 'on') { toast('AI가 지금 꺼져 있어요. 직접 쓰기는 그대로 돼요 — 연결은 관리자에게 알려 주세요.'); return; }
    setBusy(true); setOutput('');
    setSavedId(null); // 새로 만든 결과는 새 기록으로 저장
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
      {(output || busy) && <PromptResultBlock prompt={fullPrompt} output={output} busy={busy} onChange={setOutput} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        {output && !busy && (
          <>
            <button className="btn btn-ghost" onClick={onPrint} title="시나리오 전체를 인쇄 창으로 (PDF 저장도 여기서)" data-help="cr-ai-print">🖨 인쇄 / PDF</button>
            <button className="btn btn-ok" onClick={onSave} disabled={saving} title={savedId ? '고친 내용을 같은 기록에 덮어써요' : '이 학생의 위기 시나리오 이력에 저장해요'} data-help="cr-ai-save">
              {saving ? '저장 중...' : savedId ? '💾 고쳐 저장' : '💾 저장'}
            </button>
          </>
        )}
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
