import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { EditableChipGroup, makeAppender } from '../ui/QChip';
import { composeNote } from '../../lib/utils/splitNote';

const LEVELS = ['초등', '중등', '고등'];
const DISABILITIES = ['지적장애', '자폐스펙트럼(ASD)', '지체장애', '청각장애', '시각장애', '정서행동장애', '학습장애', 'ADHD', '발달지연', '중복중증'];
const STEPS = ['기본 정보', '프로파일·현행수준', '확인'];

const STRENGTH_CHIPS = ['시각자료 이해 우수', '규칙 준수 양호', '또래 관심 있음', '특정 주제 흥미 높음', '모방 능력 좋음', '신체활동 선호'];
const DIFFICULTY_CHIPS = ['언어적 설명 이해 어려움', '주의집중 시간 짧음', '긴 과제 수행 어려움', '일반화 어려움', '전이/변화 적응 어려움', '자기조절 어려움'];

export default function AddStudentModal({ open, onClose, onCreated }) {
  const { addStudent, selectStudent, curClass, curYear } = useStudents();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [level, setLevel] = useState(LEVELS[0]);
  const [dis, setDis] = useState(DISABILITIES[0]);
  const [strengths, setStrengths] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);

  // 비식별 요약(AI 전송용) — 강점/어려움/추가 요약을 합쳐 자동 구성.
  const note = composeNote(strengths, difficulties, extra);

  useEffect(() => { if (open) setStep(0); }, [open]);

  function next() {
    if (step === 0 && !code.trim()) { toast('익명 ID를 입력해주세요.'); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function onSubmit() {
    const c = code.trim();
    if (!c) { setStep(0); toast('익명 ID를 입력해주세요.'); return; }
    if (!curClass) { toast('먼저 학급을 선택하거나 추가해주세요. (상단 ⚙ 학급 관리)'); return; }
    setBusy(true);
    try {
      const created = await addStudent({ student_code: c, level, disability: dis, note, strengths, difficulties });
      toast(c + ' 등록 완료');
      setCode(''); setStrengths(''); setDifficulties(''); setExtra(''); setStep(0);
      if (created?.id) await selectStudent(created.id);
      onCreated?.(created);
      onClose();
    } catch (e) {
      toast('학생 등록 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={580}>
      <h3>➕ 새 학생 등록</h3>

      <div style={{ fontSize: 12.5, color: curClass ? '#1f6feb' : '#c0392b', background: curClass ? '#eef4ff' : '#fdecea', borderRadius: 8, padding: '7px 11px', margin: '4px 0 14px' }}>
        {curClass
          ? `등록 대상 학급: ${curYear}년 ${curClass.name}`
          : '⚠ 선택된 학급이 없습니다. 상단 ⚙ 학급 관리에서 학급을 먼저 추가해주세요.'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', margin: '6px 0 20px' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ ...dot, ...(i < step ? doneDot : i === step ? activeDot : {}) }}>{i < step ? '✓' : i + 1}</div>
            <span style={{ fontSize: 12.5, marginLeft: 6, color: i === step ? '#1f2430' : '#9aa1ad', fontWeight: i === step ? 700 : 500, whiteSpace: 'nowrap' }}>{s}</span>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 10px', background: i < step ? '#4f6bed' : '#e3e6eb' }} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="form-group">
            <label className="form-label">익명 ID (실명 금지)</label>
            <input className="form-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: A학생, 학생1" autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">학교급</label>
              <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
            </div>
            <div className="form-group">
              <label className="form-label">주요 장애 영역</label>
              <select className="form-select" value={dis} onChange={(e) => setDis(e.target.value)}>{DISABILITIES.map((d) => <option key={d}>{d}</option>)}</select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#6b7280' }}>※ 전년도 IEP는 등록 후 "IEP 계획서" 화면에서 업로드하면 AI가 목표로 파싱합니다.</div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="form-group">
            <label className="form-label">🌟 강점 (칩을 눌러 추가)</label>
            <EditableChipGroup storageKey="stu_strength" defaults={STRENGTH_CHIPS} onPick={makeAppender(strengths, setStrengths, false)} />
            <textarea className="form-textarea" rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="예: 시각자료 이해 우수, 규칙 준수 양호" />
          </div>
          <div className="form-group">
            <label className="form-label">⚠ 어려움 (칩을 눌러 추가)</label>
            <EditableChipGroup storageKey="stu_difficulty" defaults={DIFFICULTY_CHIPS} onPick={makeAppender(difficulties, setDifficulties, false)} />
            <textarea className="form-textarea" rows={2} value={difficulties} onChange={(e) => setDifficulties(e.target.value)} placeholder="예: 언어적 설명 이해 어려움, 주의집중 시간 짧음" />
          </div>
          <div className="form-group">
            <label className="form-label">추가 요약 / 현행수준 (선택)</label>
            <textarea className="form-textarea" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="이름·학년·민감정보 금지. 예: 수 개념 기초 단계." />
            <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 4 }}>
              ※ 강점은 출발점 분석의 '학생 강점'으로, 어려움은 '행동특성(교사관찰)'로 자동 연동됩니다. 비식별 요약(AI 전송용)은 위 내용으로 자동 구성됩니다.
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <div style={{ border: '1px solid #e3e6eb', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>입력 내용 확인</div>
          <Row k="익명 ID" v={code || '(미입력)'} />
          <Row k="학교급" v={level} />
          <Row k="주요 장애 영역" v={dis} />
          <Row k="강점" v={strengths || '(없음)'} />
          <Row k="어려움" v={difficulties || '(없음)'} />
          <Row k="비식별 요약" v={note || '(없음)'} />
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 8 }}>※ 등록 후 학생이 자동 선택되어 사이드바 기능(IEP·관찰·BIP 등)에서 바로 사용됩니다.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={step === 0 ? onClose : back} disabled={busy}>{step === 0 ? '취소' : '← 이전'}</button>
        {step < STEPS.length - 1
          ? <button className="btn btn-pri" onClick={next}>다음 →</button>
          : <button className="btn btn-pri" onClick={onSubmit} disabled={busy}>{busy ? '등록 중…' : '등록 완료'}</button>}
      </div>
    </Modal>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: 13 }}>
      <div style={{ width: 110, color: '#6b7280', flexShrink: 0 }}>{k}</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{v}</div>
    </div>
  );
}

const dot = { width: 26, height: 26, borderRadius: '50%', background: '#e3e6eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0 };
const activeDot = { background: '#4f6bed' };
const doneDot = { background: '#15a36e' };
