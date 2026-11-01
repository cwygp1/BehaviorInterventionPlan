import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { levelLabel } from '../../lib/schoolLevel';
import { computeTodos } from '../../lib/todo';
import { reviewCounts } from '../../lib/dashReviews';
import { loadDashboardCached, invalidateDashboard } from './dash/DashBits';
import { fetchCalendar } from '../../lib/api/calendar';
import { addDays, dow, todayKst, WEEKDAY_KO } from '../../lib/utils/calendarRules';
import { SECTIONS } from '../../lib/tiers';
import { escortSignal } from '../../lib/escortSignal';
import WeekStrip from '../ui/WeekStrip';
import QuickRecordDrawer from '../quick/QuickRecordDrawer';

// 새 디자인 '오늘'(#today) — 2단계 정식판(mds/52 §4, mds/54 §2-1 #1, 프로토타입 1~4장).
//   · 학생 0명: 입력칸 하나 + '샘플 학생으로 구경하기'·'3분 체험 보기'(선택 단추). 마법사·샘플 자동 주입은 없다(AppShell이 표시만 지움).
//   · 평소: 날짜 · 우리 반 N명 · 오늘 기록 d/N · 진행 막대 → 학생 표(할 일 한 가지, lib/todo.js) → 접힌 줄 2개.
//     학생 이름 = 학생 수첩, 줄 끝 단추 = 빠른 기록 창(관찰·점검표) 또는 수첩 IEP 탭(목표·평가).
//   · 인라인 '+ 학생 추가' — 추가해도 화면 이동 없음, 새 줄에 '무엇부터 해 볼까요?' 두 단추.
//   PortalHome이 하던 일 중 이어받는 것: 샘플 넣기·지우기, '검토할 일' 펼치기(kb_focus_reviews → 현황판),
//   영역 카드 앵커 pcard-iep·t1·t2·t3(투어·길잡이가 홈에서 짚는 곳), 이번 주 기록 띠(WeekStrip), 'next-step' 앵커.
//   재료는 GET /api/dashboard(반·학기) + GET /api/calendar(이번 주 월요일~오늘) 두 번.

const SECTION_ORDER = ['iep', 't1', 't2', 't3'];
const SECTION_SHORT = { iep: '개별화교육(IEP)', t1: '우리 반 전체', t2: '몇 명 더 챙기기', t3: '한 학생 집중' };

function weekStart(today) {
  const w = dow(today);
  return addDays(today, w === 0 ? -6 : 1 - w);
}

function useTodayData() {
  const { curClassId, curSemester, studentsLoaded, students } = useStudents();
  const [dash, setDash] = useState(null);
  const [cal, setCal] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const seq = useRef(0);
  const load = useCallback(async (force) => {
    if (!curClassId) { setDash(null); setCal(null); setLoaded(true); return; }
    const my = ++seq.current;
    const today = todayKst();
    try {
      if (force) invalidateDashboard();
      const [d, c] = await Promise.all([
        loadDashboardCached(curClassId, curSemester, !!force),
        fetchCalendar(weekStart(today), today, curClassId),
      ]);
      if (my !== seq.current) return;
      setDash(d); setCal(c); setError('');
    } catch (e) {
      if (my !== seq.current) return;
      setError(e.message || '오늘 할 일을 불러오지 못했어요');
    } finally {
      if (my === seq.current) setLoaded(true);
    }
  }, [curClassId, curSemester]);
  const nStu = students.length;
  useEffect(() => { if (studentsLoaded) load(false); }, [studentsLoaded, load, nStu]);
  return { dash, cal, error, loaded, reload: () => load(true) };
}

// 학생 0명 첫 화면(프로토타입 1장).
function FirstScreen({ onAdd, busy, onSeed, onDemo, onManageClasses }) {
  const { curClass } = useStudents();
  const [code, setCode] = useState('');
  const inputRef = useRef(null);
  const submit = async () => {
    const c = code.trim();
    if (!c) { inputRef.current && inputRef.current.focus(); return; }
    const ok = await onAdd(c);
    if (ok) setCode('');
  };
  return (
    <div className="kb-first" data-tour="next-step">
      <div className="kb-first-main">
        <div className="kb-muted">안녕하세요, 선생님. 처음이시네요.</div>
        <h2 className="kb-first-q">첫 학생의 코드(별명)를<br />적어 주세요</h2>
        <form className="kb-first-box" onSubmit={(e) => { e.preventDefault(); submit(); }} data-tour="add-student-first">
          <label htmlFor="kb-first-code" className="kb-sr">학생 코드</label>
          <input id="kb-first-code" ref={inputRef} className="kb-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: 가·1, 해님이" autoComplete="off" />
          <button type="submit" className="kb-btn kb-pri kb-big" disabled={busy}>추가</button>
        </form>
        <div className="kb-muted">
          학급은 ‘{curClass ? curClass.name : '1반'}’으로 만들어 두었어요. <button type="button" className="kb-btn" onClick={onManageClasses}>바꾸기</button>
          <br />학년·장애·강점은 나중에 학생 수첩에서 채우면 돼요. 이름 대신 코드(별명)로 적어요.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="kb-btn kb-out kb-big" onClick={onSeed} disabled={busy} data-help="ph-sample">샘플 학생으로 구경하기</button>
          <button type="button" className="kb-btn kb-big" onClick={onDemo} disabled={busy}>3분 체험 보기</button>
        </div>
      </div>
      <div className="kb-ghost" aria-hidden="true">
        <b className="kb-muted">학생을 추가하면 이렇게 보여요</b><i /><i /><i />
      </div>
    </div>
  );
}

function StatusChip({ tone, children }) {
  return <span className={'kb-status kb-tone-' + tone}>{children}</span>;
}

function TodayRow({ r, hl, onNavigate, onQuick }) {
  const goNote = () => onNavigate(`#student/${r.id}/record`);
  let act;
  if (r.task === 'fresh') {
    act = (
      <div className="kb-acts">
        <button type="button" className="kb-btn kb-pri" onClick={() => onNavigate(`#student/${r.id}/iep`)}>학기목표 한 줄 쓰기</button>
        <button type="button" className="kb-btn kb-out" onClick={(e) => onQuick(r, 'obs', e)}>행동 관찰 한 건 적기</button>
      </div>
    );
  } else if (r.action.type === 'go') {
    act = <button type="button" className="kb-btn kb-pri kb-rowbtn" onClick={() => onNavigate(r.action.hash)}>{r.btn}</button>;
  } else {
    act = (
      <button type="button" className={'kb-btn kb-rowbtn' + (r.task === 'done' ? '' : ' kb-pri')} onClick={(e) => onQuick(r, r.action.mode, e)} data-tour={'today-go-' + r.task}>
        {r.btn}
      </button>
    );
  }
  return (
    <div className={'kb-row' + (hl ? ' kb-hl' : '')}>
      <div className="kb-av1" aria-hidden="true">{String(r.code || '?').slice(0, 1)}</div>
      <div className="kb-t">
        <button type="button" className="kb-nm" onClick={goNote} title="학생 수첩 열기" data-today-sid={r.id}>{r.code}{r.isSample ? ' (샘플)' : ''}</button>
        <div className="kb-ms">
          {r.msg}
          {r.more > 0 && <span className="kb-more">외 {r.more}건</span>}
        </div>
      </div>
      <StatusChip tone={r.tone}>{r.chip}</StatusChip>
      {act}
    </div>
  );
}

export default function TodayPage({ onNavigate, actions }) {
  const { students, studentsLoaded, curClassId, addStudent, hasSamples, seedSamples, clearSamples } = useStudents();
  const { startDemo } = useAuth();
  const toast = useToast();
  const { dash, cal, error, loaded, reload } = useTodayData();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [justAdded, setJustAdded] = useState(null);
  const [quick, setQuick] = useState(null); // { sid, mode, nonce }
  const [weekOpen, setWeekOpen] = useState(false);
  const [pbsOpen, setPbsOpen] = useState(false);
  const addRef = useRef(null);

  const todo = useMemo(() => computeTodos({ students, dash, cal }), [students, dash, cal]);
  const today = todayKst();
  const [, mm, dd] = today.split('-').map(Number);
  const dateText = `${mm}월 ${dd}일 ${WEEKDAY_KO[dow(today)]}요일`;
  const weekCount = useMemo(() => (cal?.events || []).filter((e) => e.kind !== 'letter').reduce((a, e) => a + (e.n || 1), 0), [cal]);
  const pbs = dash?.t1?.pbs || null;
  const sampleIds = useMemo(() => new Set(students.filter((s) => s.is_sample).map((s) => s.id)), [students]);
  const badges = dash ? reviewCounts(sampleIds.size ? { ...dash, students: (dash.students || []).filter((s) => !sampleIds.has(s.id)) } : dash) : null;

  async function addOne(code) {
    if (!curClassId) { toast('학급을 먼저 만들어 주세요.'); return false; }
    setBusy(true);
    try {
      const s = await addStudent({ student_code: code, level: '', grade: '', disability: '', note: '', strengths: '', difficulties: '' });
      setJustAdded(s?.id || null);
      escortSignal('student-added');
      toast(`${code} 추가했어요. 오늘 표에 줄이 생겼어요.`);
      reload();
      return true;
    } catch (e) {
      toast('학생을 추가하지 못했어요: ' + e.message);
      return false;
    } finally { setBusy(false); }
  }
  const onSeed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await seedSamples();
      toast('샘플 학생 2명과 9주치 기록을 만들었어요. 이름을 누르면 학생 수첩이 열려요.');
      reload();
    } catch (e) { toast('샘플 만들기 실패: ' + e.message); } finally { setBusy(false); }
  };
  const onClear = async () => {
    if (busy) return;
    if (!window.confirm('샘플 학생 2명과 그 기록을 모두 삭제할까요?\n(선생님이 직접 등록한 학생은 그대로 남아요.)')) return;
    setBusy(true);
    try { await clearSamples(); toast('샘플을 정리했어요.'); reload(); } catch (e) { toast('샘플 삭제 실패: ' + e.message); } finally { setBusy(false); }
  };
  const onDemo = async () => {
    if (!window.confirm('3분 체험은 체험용 임시 계정으로 열려요(기존 디자인 화면).\n지금 계정에서는 로그아웃돼요 — 체험이 끝나면 다시 로그인하세요.\n열까요?')) return;
    setBusy(true);
    try { await startDemo(); window.location.href = '/'; } catch (e) { toast('체험을 열지 못했어요: ' + e.message); setBusy(false); }
  };
  const focusReviews = (dashId) => {
    try { sessionStorage.setItem('kb_focus_reviews', '1'); } catch (_e) { /* noop */ }
    onNavigate(dashId);
  };
  const onQuick = (r, mode) => {
    setJustAdded(null);
    setQuick({ sid: r.id, mode: mode || 'obs', nonce: Date.now() });
  };
  const onSaved = useCallback(() => { reload(); }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!studentsLoaded) return <div className="kb-loading">학생 목록을 불러오는 중…</div>;

  if (students.length === 0) {
    return (
      <div className="kb-stack">
        <FirstScreen onAdd={addOne} busy={busy} onSeed={onSeed} onDemo={onDemo} onManageClasses={actions.openManageClasses} />
      </div>
    );
  }

  const pct = todo.total ? Math.round((todo.recorded / todo.total) * 100) : 0;

  return (
    <div className="kb-stack kb-today">
      <div className="kb-today-head">
        <h2 className="kb-h3">{dateText}</h2>
        <span className="kb-muted">우리 반 {todo.total}명 · 오늘 기록 {todo.recorded}/{todo.total}</span>
      </div>
      <div className="kb-prog" role="progressbar" aria-label="오늘 기록한 학생" aria-valuemin={0} aria-valuemax={todo.total} aria-valuenow={todo.recorded}><i style={{ width: pct + '%' }} /></div>
      {error && <div className="kb-strip kb-err" role="alert">{error} <button type="button" className="kb-btn" onClick={reload}>다시 불러오기</button></div>}

      <div className="kb-list" data-tour="today-table" aria-busy={!loaded}>
        {!dash && !error ? (
          <div className="kb-loading">오늘 할 일을 계산하는 중…</div>
        ) : todo.rows.map((r) => (
          <TodayRow key={r.id} r={r} hl={justAdded === r.id} onNavigate={onNavigate} onQuick={onQuick} />
        ))}
        {adding ? (
          <form className="kb-row" onSubmit={async (e) => { e.preventDefault(); const c = newCode.trim(); if (!c) { addRef.current && addRef.current.focus(); return; } if (await addOne(c)) { setNewCode(''); setAdding(false); } }}>
            <label htmlFor="kb-next-code" className="kb-sr">다음 학생 코드</label>
            <input id="kb-next-code" ref={addRef} autoFocus className="kb-input" style={{ flex: 1, minWidth: 160 }} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="다음 학생 코드(별명)" autoComplete="off" />
            <button type="submit" className="kb-btn kb-out" disabled={busy}>+ 추가</button>
            <button type="button" className="kb-btn" onClick={() => { setAdding(false); setNewCode(''); }}>취소</button>
          </form>
        ) : (
          <div className="kb-row" style={{ minHeight: 60 }}>
            <button type="button" className="kb-btn kb-out" onClick={() => setAdding(true)} data-tour="today-add">+ 학생 추가</button>
            {hasSamples && <button type="button" className="kb-btn" onClick={onClear} disabled={busy} data-help="ph-sample-clear">샘플 학생 지우기</button>}
          </div>
        )}
      </div>

      {/* 접힌 줄 두 개 — 이번 주 기록(WeekStrip·달력), 우리 반 보상판 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <button type="button" className="kb-fold" aria-expanded={weekOpen} aria-controls="kb-fold-week" onClick={() => setWeekOpen((o) => !o)}>
            <span>이번 주 기록 {weekCount}건</span><span className="kb-go">{weekOpen ? '접기 ▾' : '펼치기 ▸'}</span>
          </button>
          {weekOpen && (
            <div id="kb-fold-week" className="kb-fold-body">
              <WeekStrip onNavigate={onNavigate} />
              <button type="button" className="kb-btn" onClick={() => onNavigate('#today/calendar')}>달력 크게 보기</button>
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <button type="button" className="kb-fold" aria-expanded={pbsOpen} aria-controls="kb-fold-pbs" onClick={() => setPbsOpen((o) => !o)}>
            <span>우리 반 보상판{pbs && pbs.target_points ? ` ${pbs.current_points || 0}/${pbs.target_points}` : ''}</span><span className="kb-go">{pbsOpen ? '접기 ▾' : '펼치기 ▸'}</span>
          </button>
          {pbsOpen && (
            <div id="kb-fold-pbs" className="kb-fold-body">
              <div className="kb-muted">{pbs && pbs.goal ? `이번 학기 목표: ${pbs.goal}` : '아직 우리 반 목표·보상판이 없어요.'}</div>
              <button type="button" className="kb-btn" onClick={() => onNavigate('#class/promise')}>보상판 열기</button>
            </div>
          )}
        </div>
      </div>

      {/* 영역별 현황 — 예전 홈 영역 카드 자리(투어·길잡이 앵커 pcard-*, '검토할 일' 펼치기) */}
      <div className="kb-card" style={{ padding: '14px 18px' }}>
        <div className="kb-small">영역별 현황 보기 (숫자는 검토할 일)</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SECTION_ORDER.map((k) => (
            <button key={k} type="button" className="kb-btn" data-tour={'pcard-' + k} onClick={() => (badges && badges[k] > 0 ? focusReviews(SECTIONS[k].dash) : onNavigate(SECTIONS[k].dash))}>
              {SECTION_SHORT[k]}{badges && badges[k] > 0 ? ` · ${badges[k]}` : ''}
            </button>
          ))}
        </div>
      </div>

      <QuickRecordDrawer
        start={quick}
        rows={todo.rows}
        summary={todo}
        onClose={() => setQuick(null)}
        onSaved={onSaved}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// 학생 목록 화면(#students)이 쓰던 목록 — 1단계와 같다(학생 메뉴).
export function StudentList({ onNavigate, actions }) {
  const { students, studentsLoaded, curClassId, hasSamples, clearSamples, homeSummary } = useStudents();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const onClear = async () => {
    if (busy) return;
    if (!window.confirm('샘플 학생 2명과 그 기록을 모두 삭제할까요?\n(선생님이 직접 등록한 학생은 그대로 남아요.)')) return;
    setBusy(true);
    try { await clearSamples(); toast('샘플을 정리했어요. 이제 내 학생으로 시작해 보세요!'); } catch (e) { toast('샘플 삭제 실패: ' + e.message); } finally { setBusy(false); }
  };
  if (!studentsLoaded) return <div className="kb-loading">학생 목록을 불러오는 중…</div>;
  return (
    <div className="kb-stack">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="kb-h3" style={{ flex: 1 }}>우리 반 학생 {students.length}명</h2>
        <button type="button" className="kb-btn kb-pri" onClick={actions.openAddStudent} disabled={!curClassId}>+ 학생 추가</button>
        {hasSamples && <button type="button" className="kb-btn" onClick={onClear} disabled={busy}>샘플 학생 지우기</button>}
      </div>
      {students.length === 0 ? (
        <div className="kb-card">
          <div className="kb-muted">아직 이 학급에 학생이 없어요. ‘오늘’ 화면에서 첫 학생을 추가하거나 샘플 학생으로 먼저 둘러보세요.</div>
          <div><button type="button" className="kb-btn kb-pri" onClick={() => onNavigate('#today')}>오늘 화면으로</button></div>
        </div>
      ) : (
        <div className="kb-list">
          {students.map((s) => {
            const sm = homeSummary?.summaries?.[s.id] || {};
            const go = (tab) => onNavigate(`#student/${s.id}/${tab}`);
            return (
              <div className="kb-row" key={s.id}>
                <div className="kb-av1" aria-hidden="true">{String(s.code || '?').slice(0, 1)}</div>
                <div className="kb-t">
                  <button type="button" className="kb-nm" onClick={() => go('record')}>{s.code}{s.is_sample ? ' (샘플)' : ''}</button>
                  <div className="kb-small">
                    {levelLabel(s.level)}{s.grade ? ` ${s.grade}학년` : ''} · {s.disability || '장애 영역 미입력'}
                    {' · '}관찰 {sm.abc_count || 0} · 데이터 {sm.mon_count || 0} · IEP 목표 {sm.iep_count || 0}
                  </div>
                </div>
                <div className="kb-acts">
                  <button type="button" className="kb-btn" onClick={() => go('record')}>수첩 열기</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

