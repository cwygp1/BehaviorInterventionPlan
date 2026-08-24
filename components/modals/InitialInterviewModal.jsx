import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveBIP } from '../../lib/api/students';

// 초기면담지 — 개별 중재 워크플로 ①단계(0822 동료 피드백: Tier3 보드 개편).
// "중재가 필요한 행동·문제 상황 확인 및 기본 정보"를 보호자·담임 면담으로 수집한다.
// 저장: bip_data.interview(JSONB) — BIP API의 부분 업데이트로 이 필드만 저장한다.
export const INTERVIEW_FIELDS = [
  { key: 'concern', label: '1. 걱정되는 행동·문제 상황', ph: '어떤 행동이, 어떤 상황에서 걱정되나요? 관찰 가능한 모습으로 적어주세요.', rows: 3 },
  { key: 'onset', label: '2. 시작 시기와 지속 기간', ph: '언제부터 나타났나요? 점점 심해지고 있나요, 비슷한가요?', rows: 2 },
  { key: 'context', label: '3. 자주 일어나는 상황 (언제·어디서·누구와)', ph: '예: 국어 시간 과제 제시 직후 / 급식 줄 설 때 / 특정 친구와 있을 때', rows: 2 },
  { key: 'freq', label: '4. 빈도·강도·지속시간(대략)', ph: '예: 하루 3~4회, 한 번에 5분 정도, 소리 지르며 책상을 두드림', rows: 2 },
  { key: 'tried', label: '5. 지금까지 시도한 방법과 결과', ph: '가정·학교에서 해본 대응과 효과(효과 없던 것 포함)를 적어주세요.', rows: 3 },
  { key: 'health', label: '6. 건강·수면·식사·약물 등 배경 요인', ph: '예: 최근 수면 불규칙, 복용 약 변경, 알레르기, 감각 민감 등', rows: 2 },
  { key: 'family', label: '7. 가정·환경 변화 및 참고 사항', ph: '예: 이사, 가족 변화, 방학 후 적응 등 행동에 영향을 줄 만한 일', rows: 2 },
  { key: 'hope', label: '8. 면담자(보호자·교사)가 바라는 점', ph: '중재를 통해 어떤 변화를 가장 바라나요?', rows: 2 },
];

const EMPTY = Object.fromEntries(INTERVIEW_FIELDS.map((f) => [f.key, '']));

// 작성된 칸 수 — 진행 표시·완료 판정(AssessmentLauncher 공용).
export function interviewProgress(interview) {
  const iv = interview || {};
  const done = INTERVIEW_FIELDS.filter((f) => String(iv[f.key] || '').trim()).length;
  return { done, total: INTERVIEW_FIELDS.length };
}

export default function InitialInterviewModal({ open, onClose }) {
  const { curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [meta, setMeta] = useState({ interviewee: '', date: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const iv = curStuData?.bip?.interview || {};
    setF({ ...EMPTY, ...Object.fromEntries(INTERVIEW_FIELDS.map((x) => [x.key, iv[x.key] || ''])) });
    setMeta({ interviewee: iv.interviewee || '', date: iv.date || new Date().toISOString().slice(0, 10) });
  }, [open, curStuData]);

  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const interview = { ...f, interviewee: meta.interviewee, date: meta.date };
      const res = await saveBIP(curStuId, { interview }); // 부분 업데이트 — BIP 본문은 건드리지 않음
      updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), interview: res?.data?.interview || interview } }));
      toast('초기면담지 저장 완료 — 중재계획(BIP)·기능평가의 기초 정보로 활용됩니다.');
      onClose();
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}>
      <h3>📝 초기면담지 — 행동·문제 상황 확인</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 12px', lineHeight: 1.6 }}>
        개별 중재의 <strong>①단계</strong>입니다. 보호자·담임과의 면담으로 문제 상황과 배경 정보를 모읍니다.
        모든 칸을 채우지 않아도 되며, 아는 만큼 적고 저장하세요. (실명 등 식별정보는 적지 마세요)
      </p>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">면담 대상 (관계만)</label>
          <input className="form-input" value={meta.interviewee} onChange={(e) => setMeta((m) => ({ ...m, interviewee: e.target.value }))} placeholder="예: 보호자(모), 담임, 전담교사" />
        </div>
        <div className="form-group">
          <label className="form-label">면담일</label>
          <input type="date" className="form-input" value={meta.date} onChange={(e) => setMeta((m) => ({ ...m, date: e.target.value }))} />
        </div>
      </div>
      {INTERVIEW_FIELDS.map((x) => (
        <div key={x.key} className="form-group">
          <label className="form-label">{x.label}</label>
          <textarea className="form-textarea" rows={x.rows} value={f[x.key]} onChange={set(x.key)} placeholder={x.ph} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSave} disabled={busy}>{busy ? '저장 중…' : '💾 저장'}</button>
      </div>
    </Modal>
  );
}
