import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useGuide } from '../guide/GuideContext';
import { DISABILITIES } from '../../lib/disability';
import { GRADES_BY_LEVEL } from '../modals/EditStudentModal';

// 가입 직후 1회(mds/46 방법 3·5) — AuthContext.signup이 남긴 표시를 읽는다.
//   방법 3  첫 설정 마법사: ① 반 이름 → ② 첫 학생 등록(나중에 해도 됨) → ③ 무엇부터 해 볼지 고르기.
//           마법사가 첫 방문 홈 투어를 대신하므로 투어는 '봤음'으로 적는다(❓ 메뉴에서 언제든 다시 봄).
//   방법 5  본보기 학생(D4 가입 즉시): 기존 '샘플로 체험'과 같은 샘플A·B를 뒤에서 넣는다.
//           홈의 '샘플 체험 중' 안내·'샘플 삭제' 단추가 그대로 따라온다(이 안내가 두 명 기준이라 둘 다 넣음).

const FIRST_RUN_KEY = 'kb_first_run';
const SEED_KEY = 'kb_seed_samples';
const LEVELS = ['초등', '중등', '고등'];
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch (_e) { return null; } };
const ssDel = (k) => { try { sessionStorage.removeItem(k); } catch (_e) { /* noop */ } };

function SampleSeeder() {
  const { curClassId, studentsLoaded, hasSamples, seedSamples } = useStudents();
  const toast = useToast();
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || ssGet(SEED_KEY) !== '1') return;
    if (!curClassId || !studentsLoaded) return;
    startedRef.current = true;
    ssDel(SEED_KEY);
    if (hasSamples) return;
    (async () => {
      try {
        await seedSamples();
        toast("본보기 학생 '샘플A'·'샘플B'를 넣어 두었어요 — 9주치 기록이 채워져 있어 화면을 미리 볼 수 있어요. 홈에서 언제든 지울 수 있어요.");
      } catch (_e) {
        // 실패해도 조용히 — 홈의 '샘플로 체험' 단추로 언제든 다시 넣을 수 있다.
      }
    })();
  }, [curClassId, studentsLoaded, hasSamples, seedSamples, toast]);
  return null;
}

function Wizard({ onNavigate, onDone }) {
  const { curClass, curYear, renameClass, addStudent, selectStudent, students, hasSamples } = useStudents();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [className, setClassName] = useState('');
  const [code, setCode] = useState('');
  const [level, setLevel] = useState(LEVELS[0]);
  const [grade, setGrade] = useState('');
  const [dis, setDis] = useState(DISABILITIES[2] || DISABILITIES[0]); // 기본 '지적장애'(가장 흔한 배치)
  const [created, setCreated] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (curClass && !className) setClassName(curClass.name || ''); }, [curClass, className]);
  useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(t); }, [step]);

  const own = (students || []).filter((s) => !s.is_sample);
  const hasOwn = !!created || own.length > 0;

  async function saveClass() {
    const nm = className.trim();
    if (curClass && nm && nm !== curClass.name) {
      setBusy(true);
      try { await renameClass(curClass.id, nm); } catch (e) { toast('반 이름을 바꾸지 못했어요: ' + e.message); setBusy(false); return; }
      setBusy(false);
    }
    setStep(1);
  }

  async function saveStudent() {
    const c = code.trim();
    if (!c) { toast('학생 코드를 적어 주세요. 예: 학생A'); inputRef.current && inputRef.current.focus(); return; }
    setBusy(true);
    try {
      const s = await addStudent({ student_code: c, level, grade, disability: dis, note: '', strengths: '', difficulties: '' });
      if (s?.id) await selectStudent(s.id);
      setCreated(s);
      toast(c + ' 등록 완료');
      setStep(2);
    } catch (e) {
      toast('학생 등록 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function go(page, sampleFirst) {
    if (sampleFirst) {
      const sample = (students || []).find((s) => s.is_sample);
      if (sample) await selectStudent(sample.id);
    }
    onDone();
    if (page) onNavigate(page);
  }

  const steps = ['우리 반', '첫 학생', '무엇부터'];
  return (
    <div className="ob-wiz-bg" role="dialog" aria-modal="true" aria-label="처음 설정">
      <div className="ob-wiz">
        <button type="button" className="ob-wiz-x" onClick={() => onDone()} aria-label="닫기" title="나중에 할게요">×</button>
        <div className="ob-wiz-steps" aria-hidden="true">
          {steps.map((s, i) => <span key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>{i < step ? '✓' : i + 1} {s}</span>)}
        </div>

        {step === 0 && (
          <>
            <h3>환영해요! 1분이면 준비가 끝나요</h3>
            <p>먼저 우리 반 이름을 확인해요. 모든 화면은 여기서 고른 반을 기준으로 움직여요.</p>
            {!curClass ? (
              <p className="ob-wiz-wait">반을 준비하는 중…</p>
            ) : (
              <label className="ob-wiz-field">
                <span>{curYear}년 반 이름</span>
                <input ref={inputRef} className="form-input" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="예: 1반, 햇살반" onKeyDown={(e) => { if (e.key === 'Enter') saveClass(); }} />
              </label>
            )}
            <div className="ob-wiz-btns">
              <button type="button" className="btn btn-ghost" onClick={() => onDone()}>나중에 할게요</button>
              <button type="button" className="btn btn-pri" onClick={saveClass} disabled={!curClass || busy}>다음 →</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3>첫 학생을 등록해요</h3>
            <p>실명 대신 <b>학생 코드</b>로 적어요. 강점·어려움은 나중에 학생 관리에서 채워도 돼요.</p>
            <label className="ob-wiz-field">
              <span>학생 코드 (실명 금지)</span>
              <input ref={inputRef} className="form-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: 학생A" onKeyDown={(e) => { if (e.key === 'Enter') saveStudent(); }} />
            </label>
            <div className="ob-wiz-row">
              <label className="ob-wiz-field">
                <span>학교급</span>
                <select className="form-select" value={level} onChange={(e) => { setLevel(e.target.value); setGrade(''); }}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
              </label>
              <label className="ob-wiz-field">
                <span>학년 (선택)</span>
                <select className="form-select" value={grade} onChange={(e) => setGrade(e.target.value)}>
                  <option value="">미지정</option>
                  {GRADES_BY_LEVEL(level).map((g) => <option key={g} value={g}>{g}학년</option>)}
                </select>
              </label>
              <label className="ob-wiz-field">
                <span>장애 영역</span>
                <select className="form-select" value={dis} onChange={(e) => setDis(e.target.value)}>{DISABILITIES.map((d) => <option key={d}>{d}</option>)}</select>
              </label>
            </div>
            <div className="ob-wiz-btns">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)} disabled={busy}>나중에 할게요</button>
              <button type="button" className="btn btn-pri" onClick={saveStudent} disabled={busy}>{busy ? '등록 중…' : '등록하고 다음 →'}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3>무엇부터 해 볼까요?</h3>
            <p>{hasOwn ? `${created?.student_code || own[0]?.student_code || '학생'} 학생으로 시작해요. 고른 화면에서 할 일을 한 줄씩 안내해 드려요.` : '학생을 등록하면 IEP·관찰 기록을 바로 쓸 수 있어요. 홈의 시작하기 목록에서 이어서 할 수 있어요.'}</p>
            <div className="ob-wiz-choices">
              <button type="button" className="ob-wiz-choice" onClick={() => go('iep')} disabled={!hasOwn}>
                <b>📘 IEP 학기 목표 쓰기</b><span>성취기준 하나 고르고 규칙 초안으로 바로 채워요</span>
              </button>
              <button type="button" className="ob-wiz-choice" onClick={() => go('observe')} disabled={!hasOwn}>
                <b>✍️ 행동 관찰 기록 남기기</b><span>행동 앞·행동·뒤를 칩으로 눌러 남겨요</span>
              </button>
              {hasSamples && (
                <button type="button" className="ob-wiz-choice" onClick={() => go('dash3', true)}>
                  <b>🧪 본보기 학생 둘러보기</b><span>9주치 기록이 채워진 샘플A로 화면을 미리 봐요</span>
                </button>
              )}
              <button type="button" className="ob-wiz-choice ghost" onClick={() => go('home')}>
                <b>🏠 홈에서 천천히</b><span>홈 맨 위 '시작하기' 목록을 따라가요</span>
              </button>
            </div>
            <p className="ob-wiz-foot">처음에는 <b>간단 모드</b>로 꼭 필요한 메뉴만 보여요. 왼쪽 메뉴의 '모든 메뉴 보기'로 언제든 다 볼 수 있어요.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function FirstRun({ onNavigate }) {
  const guide = useGuide();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (ssGet(FIRST_RUN_KEY) !== '1') return;
    // 마법사가 첫 방문 홈 투어(·길잡이 '처음 시작')를 대신한다 — 투어가 마법사 뒤에 깔리지 않게 먼저 적는다.
    try { localStorage.setItem('kb_tour_done:home', '1'); } catch (_e) { /* noop */ }
    setShow(true);
  }, []);
  // 혹시 이미 떠 버린 자동 투어는 닫는다('봤음' 기록 없이).
  useEffect(() => { if (show && guide.tourKey) guide.stopTour(); }, [show, guide]);

  const done = () => { ssDel(FIRST_RUN_KEY); setShow(false); };

  return (
    <>
      <SampleSeeder />
      {show && typeof document !== 'undefined' && createPortal(<Wizard onNavigate={onNavigate} onDone={done} />, document.body)}
    </>
  );
}
