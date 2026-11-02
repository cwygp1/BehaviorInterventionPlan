import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveCICO } from '../../lib/api/students';
import { useAutoSaveBody } from '../../lib/hooks/useAutoSave';
import { printDPRCard } from '../../lib/utils/printDPR';
import { EditableChipGroup } from '../ui/QChip';
import { isSecondary } from '../../lib/schoolLevel';
import { PillRadio, QField } from '../quick/QuickBits';
import { todayKst } from '../../lib/utils/calendarRules';

// 매일 점검표(CICO/DPR) 한 학생 하루치 입력 폼 — Tier2Page에서 떼어 냈다(새 디자인 2단계, mds/54 §2-1 #9).
//   · useCicoForm(studentId)  날짜·목표·교시·점수·입퇴실·코멘트 + 그날 기록 불러오기 + 자동 저장(useAutoSaveBody, resetKey에 학생 id)
//                             저장은 기존 saveCICO(학생별 POST 업서트) 그대로.
//   · CicoDailyCard           기존 화면(Tier2Page)의 '오늘의 CICO 기록' 카드 — 옮기기 전 JSX 그대로
//   · CicoRowForm(기본)       빠른 기록 창 '점검표' 모드 — 같은 훅 + 교시별 점수 알약. 학생이 바뀌면 key로 새로 마운트.
//   점수는 기존 그대로 0~3점(서버가 교시 수×3을 만점으로 계산 — 바꾸면 지난 기록 %가 틀어진다).

// 같은 학생·같은 날 점검표를 다른 칸(우리 반 다학생 표 ↔ 이 폼)에서 저장했다는 알림. 받는 쪽은 자기 칸이
//   '고치는 중'이 아닐 때만 새 값으로 다시 불러온다(서로 옛 값으로 덮어쓰지 않게). 기존 디자인에는 듣는 곳이 없다.
export const CICO_SAVED_EVENT = 'kb-cico-saved';
export function announceCicoSaved(detail) {
  try { window.dispatchEvent(new CustomEvent(CICO_SAVED_EVENT, { detail })); } catch (_e) { /* noop */ }
}

export const PRESETS = {
  '초등 (7교시 + 종례)': ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '종례'],
  '중·고등 (8교시 + 종례)': ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시', '8교시', '종례'],
  '오전 4교시': ['1교시', '2교시', '3교시', '4교시'],
  '오후 4교시': ['5교시', '6교시', '7교시', '종례'],
};

export const SCORES = [3, 2, 1, 0];
export const SCORE_COLORS = { 3: '#0a7d4e', 2: '#12b886', 1: '#f59f00', 0: '#ef476f' };
export const SCORE_LABELS = { 3: '매우 잘함', 2: '잘함', 1: '노력 필요', 0: '못함' };

export const COMMON_GOALS = [
  '자리에 앉아 과제 수행', '교사 지시 1회 따르기', '또래에게 친절한 말 사용',
  '시각 일과표 확인', '쉬어 카드 사용', '도와주세요 카드 사용',
  '활동 전환 시 따라가기', '4:1 긍정 행동',
];

export function defaultPeriods(level) {
  return isSecondary(level) // 1020: 전공과 포함
    ? PRESETS['중·고등 (8교시 + 종례)']
    : PRESETS['초등 (7교시 + 종례)'];
}

/** 점수 칸 정리 — 점수나 코멘트가 있는 교시만(저장 body·자동 저장 기준값이 같은 규칙을 쓴다). */
export function cleanCicoScores(periodList, scores) {
  const cleanScores = {};
  (periodList || []).forEach((p) => {
    const d = readPeriodData(scores, p);
    if (d.score != null || (d.comment && d.comment.trim())) {
      cleanScores[p] = { score: d.score, comment: d.comment || '' };
    }
  });
  return cleanScores;
}

/** 자동 저장 비교용 body — useCicoForm의 body와 같은 모양·같은 키 순서. */
export function cicoBody({ date, goals, periodList, scores, checkIn, checkOut, comment }) {
  return { date, goals, periods: periodList, scores: cleanCicoScores(periodList, scores), check_in_time: checkIn, check_out_time: checkOut, comment };
}

// Normalize legacy score values (number) into { score, comment } shape.
export function readPeriodData(scores, periodName) {
  const v = scores?.[periodName];
  if (v == null) return { score: null, comment: '' };
  if (typeof v === 'object') return { score: v.score ?? null, comment: v.comment || '' };
  return { score: Number(v), comment: '' };
}

/**
 * @param {object} p
 * @param {number|null} p.studentId
 * @param {string|null} [p.entryDate] 기록 달력에서 고른 날짜(부르는 쪽이 useEntryDate('tier2')로 받아 넘김)
 * @param {'page'|'quick'} [p.variant]
 */
export function useCicoForm({ studentId, entryDate = null, variant = 'page' }) {
  const { allStudents, studentDataCache, updateStudentData } = useStudents();
  const toast = useToast();
  const quick = variant === 'quick';
  const data = studentId ? studentDataCache[studentId] : null;
  const dataLoaded = !!data;
  const stu = allStudents.find((s) => s.id === studentId) || null;

  // 빠른 기록 창(새 디자인)은 한국 날짜 — 오전 9시 전 기록이 어제로 들어가 '오늘 표'와 어긋나지 않게(mds/56 #12).
  //   기존 화면(page)은 예전 그대로 둔다.
  const [date, setDate] = useState(() => entryDate || (quick ? todayKst() : new Date().toISOString().slice(0, 10)));
  const [goalsInput, setGoalsInput] = useState('');
  const [goals, setGoals] = useState([]);
  const [periodList, setPeriodList] = useState([]);
  const [scores, setScores] = useState({}); // { periodName: { score, comment } }
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(0); // 빠른 기록 창 '✓ 저장함' 표시용(자동 저장 포함)
  const [discarded, setDiscarded] = useState(false); // 빠른 기록 창 '버리고 닫기' — 닫힐 때 자동 저장하지 않게

  const cicoRecords = data?.cico || [];
  const todayRecord = cicoRecords.find((r) => r.date === date);
  // 자동 저장 무장 시점 + 폼 재초기화 트리거(삭제 등) — resetTick을 올리면 기준값 재무장.
  const [cicoLoaded, setCicoLoaded] = useState(false);
  const [resetTick, setResetTick] = useState(0);
  // 빠른 기록 창: 로더가 불러온 값으로 자동 저장 기준값을 직접 무장(mds/56 #8·#9) — 기존 화면은 쓰지 않는다.
  const [armed, setArmed] = useState(null);
  const armNRef = useRef(0);

  // Load existing record OR initialize defaults for new entries.
  // ⚠ 자동 저장 도입(0824): 저장 때마다 캐시가 갱신되는데, 그때마다 이 로더가
  //   재실행되면 저장 요청 중 입력한 값이 되돌아간다 → 날짜·학생·데이터 도착
  //   시에만 실행 (deps에서 todayRecord/cicoRecords.length 제외).
  useEffect(() => {
    setCicoLoaded(false);
    if (!studentId || !dataLoaded) return;
    const recs = data?.cico || [];
    const today = recs.find((r) => r.date === date);
    if (today) {
      const lp = today.periods?.length
        ? today.periods
        : Object.keys(today.scores || {}) // legacy fallback
            .filter((k) => k !== '_periods');
      setGoals(today.goals || []);
      setPeriodList(lp);
      setScores(today.scores || {});
      setCheckIn(today.check_in_time || '');
      setCheckOut(today.check_out_time || '');
      setComment(today.comment || '');
      if (quick) setArmed({ key: ++armNRef.current, json: JSON.stringify(cicoBody({ date, goals: today.goals || [], periodList: lp, scores: today.scores || {}, checkIn: today.check_in_time || '', checkOut: today.check_out_time || '', comment: today.comment || '' })) });
    } else {
      // For a new entry, copy structure from the most recent record (so the
      // teacher doesn't have to re-define periods every day) — fall back to
      // level-based defaults.
      const last = recs[0];
      const lastPeriods = last?.periods?.length ? last.periods : null;
      setGoals(quick && Array.isArray(last?.goals) ? last.goals : []); // 빠른 기록 창: 목표는 지난번 것 유지(mds/52 §6)
      setPeriodList(lastPeriods || defaultPeriods(stu?.level));
      setScores({});
      setCheckIn(''); setCheckOut(''); setComment('');
      if (quick) setArmed({ key: ++armNRef.current, json: JSON.stringify(cicoBody({ date, goals: quick && Array.isArray(last?.goals) ? last.goals : [], periodList: lastPeriods || defaultPeriods(stu?.level), scores: {}, checkIn: '', checkOut: '', comment: '' })) });
    }
    setCicoLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, studentId, dataLoaded, resetTick]);

  // 자동 저장(0824) — 오늘 기록이 로드 시점과 달라지면 입력이 멎은 뒤 upsert 저장.
  const { dirty: cicoDirty } = useAutoSaveBody({
    enabled: !!studentId && cicoLoaded && !discarded,
    resetKey: `${studentId}:${date}:${resetTick}`,
    body: { date, goals, periods: periodList, scores: buildCleanScores(), check_in_time: checkIn, check_out_time: checkOut, comment },
    save: saveCore,
    armWith: quick ? armed : undefined,
  });

  function addGoal(text) {
    const t = text.trim();
    if (!t) return;
    if (goals.includes(t)) { toast('이미 추가된 목표입니다.'); return; }
    setGoals((g) => [...g, t]);
    setGoalsInput('');
  }
  function removeGoal(i) { setGoals((g) => g.filter((_, idx) => idx !== i)); }

  function setScore(period, val) {
    setScores((prev) => {
      const cur = readPeriodData(prev, period);
      const next = { ...prev };
      next[period] = { score: cur.score === val ? null : val, comment: cur.comment };
      return next;
    });
  }
  function setPeriodComment(period, text) {
    setScores((prev) => {
      const cur = readPeriodData(prev, period);
      return { ...prev, [period]: { score: cur.score, comment: text } };
    });
  }

  function addPeriod() {
    setPeriodList((p) => [...p, `${p.length + 1}교시`]);
  }
  function renamePeriod(i, newName) {
    const oldName = periodList[i];
    if (!newName.trim() || oldName === newName) return;
    setPeriodList((p) => p.map((x, idx) => idx === i ? newName : x));
    if (scores[oldName] != null) {
      setScores((s) => {
        const next = { ...s };
        next[newName] = next[oldName];
        delete next[oldName];
        return next;
      });
    }
  }
  function removePeriod(i) {
    const name = periodList[i];
    setPeriodList((p) => p.filter((_, idx) => idx !== i));
    setScores((s) => {
      const next = { ...s }; delete next[name]; return next;
    });
  }
  function applyPreset(presetName) {
    const list = PRESETS[presetName];
    if (!list) return;
    if (Object.keys(scores).length > 0 && !window.confirm('기존 입력된 점수가 새 교시 구성에 맞지 않으면 사라질 수 있습니다. 계속할까요?')) return;
    setPeriodList(list);
    // Keep scores only for periods that still exist
    setScores((s) => Object.fromEntries(Object.entries(s).filter(([k]) => list.includes(k))));
  }

  // Compute totals (using only filled periods)
  const filledScores = periodList.map((p) => readPeriodData(scores, p)).filter((d) => d.score != null);
  const total = filledScores.reduce((a, d) => a + (Number(d.score) || 0), 0);
  const max = filledScores.length * 3;
  const pct = max ? Math.round((total / max) * 100) : 0;

  // Clean scores: only include periods that have at least a score or comment.
  // (함수 선언 호이스팅으로 위 useAutoSaveBody의 body에서도 참조 가능)
  function buildCleanScores() {
    return cleanCicoScores(periodList, scores);
  }

  async function saveCore() {
    const res = await saveCICO(studentId, {
      date, goals, periods: periodList, scores: buildCleanScores(),
      check_in_time: checkIn, check_out_time: checkOut, comment,
    });
    updateStudentData(studentId, (cur) => {
      const others = (cur.cico || []).filter((r) => r.date !== date);
      return { ...cur, cico: [res.record, ...others].sort((a, b) => (b.date || '').localeCompare(a.date || '')) };
    });
    const at = Date.now();
    setSavedAt(at);
    announceCicoSaved({ sid: studentId, date, record: res.record, from: formIdRef.current });
    return at; // 1102(mds/56 #36): 빠른 기록 창이 같은 저장을 두 번 알리지 않게(기존 화면은 반환값을 쓰지 않음)
  }

  async function onSave() {
    if (!studentId) return;
    setBusy(true);
    try {
      await saveCore();
      toast(`CICO 저장됨 — ${total}/${max}점 (${pct}%)`);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  function onPrintDPR() {
    printDPRCard({ studentId: stu?.code, date, periods: periodList, goals, level: stu?.level });
  }

  // 다른 칸(우리 반 다학생 표)에서 같은 학생·같은 날을 저장했으면, 이 폼이 고치는 중이 아닐 때 다시 불러온다.
  const formIdRef = useRef(Math.random().toString(36).slice(2));
  const dirtyRef = useRef(false);
  dirtyRef.current = cicoDirty;
  useEffect(() => {
    const h = (e) => {
      const d = e.detail || {};
      if (d.from === formIdRef.current || d.sid !== studentId || d.date !== date || dirtyRef.current) return;
      setResetTick((t) => t + 1);
    };
    window.addEventListener(CICO_SAVED_EVENT, h);
    return () => window.removeEventListener(CICO_SAVED_EVENT, h);
  }, [studentId, date]);

  // 빠른 기록 창 '저장' — 같은 saveCore. 알림은 창이 띄운다.
  async function saveQuick() {
    if (!studentId) return { ok: false, error: '학생이 없어요.' };
    if (!filledScores.length) return { ok: false, error: '교시 점수를 하나 이상 골라 주세요.' };
    setBusy(true);
    // 1102(mds/56 #36): 보낸 내용을 자동 저장 기준값으로 다시 무장 — 안 하면 점수 고를 때 걸린 2초 타이머가 같은 내용을 한 번 더 올리고
    //   표도 두 번 새로 고친다(닫거나 다음 학생으로 갈 때 언마운트 저장도 한 번 더). 기존 화면(page) 저장 단추는 예전 그대로.
    const sent = JSON.stringify(cicoBody({ date, goals, periodList, scores, checkIn, checkOut, comment }));
    try {
      const at = await saveCore();
      if (quick) setArmed({ key: ++armNRef.current, json: sent });
      return { ok: true, at };
    }
    catch (e) { return { ok: false, error: '저장하지 못했어요 — ' + e.message }; }
    finally { setBusy(false); }
  }
  function discard() { flushSync(() => setDiscarded(true)); }

  return {
    studentId, stu, data, cicoRecords, todayRecord, cicoLoaded, savedAt,
    date, setDate, goalsInput, setGoalsInput, goals, periodList, scores, checkIn, setCheckIn, checkOut, setCheckOut, comment, setComment,
    busy, cicoDirty, total, max, pct, filledScores,
    addGoal, removeGoal, setScore, setPeriodComment, addPeriod, renamePeriod, removePeriod, applyPreset, onSave, onPrintDPR,
    bumpReset: () => setResetTick((t) => t + 1),
    saveQuick, discard,
  };
}

/** 기존 화면(Tier2Page)의 '오늘의 CICO 기록' 카드 — 옮기기 전 JSX 그대로. */
export function CicoDailyCard({ f }) {
  const {
    date, setDate, goalsInput, setGoalsInput, goals, periodList, scores, checkIn, setCheckIn, checkOut, setCheckOut, comment, setComment,
    busy, cicoDirty, total, max, pct, todayRecord,
    addGoal, removeGoal, setScore, setPeriodComment, addPeriod, renamePeriod, removePeriod, applyPreset, onSave, onPrintDPR,
  } = f;
  return (
      <div className="card" data-tour="t2-daily">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📋 오늘의 CICO 기록</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" data-help="t2-print" onClick={onPrintDPR}>🖨 빈 DPR 카드 인쇄</button>
            {todayRecord && (
              <span style={{ fontSize: '.74rem', color: '#0a7d4e', background: '#e7f7ee', padding: '5px 12px', borderRadius: 99, fontWeight: 700 }}>
                ✓ 저장됨 ({todayRecord.total_score}/{todayRecord.max_score})
              </span>
            )}
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group"><label className="form-label">날짜</label><input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">🌅 입실(Check-In)</label><input type="time" className="form-input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">🌇 퇴실(Check-Out)</label><input type="time" className="form-input" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
        </div>

        {/* 오늘의 목표 */}
        <div className="form-group" data-help="t2-goal-pick">
          <label className="form-label" data-tour="t2-goals">🎯 오늘의 목표 행동 <span style={{ color: 'var(--muted)', fontSize: '.74rem', fontWeight: 500 }}>(1~3개 권장)</span></label>
          <EditableChipGroup storageKey="tier2_goals" defaults={COMMON_GOALS} onPick={(g) => addGoal(g)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={goalsInput}
              onChange={(e) => setGoalsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGoal(goalsInput); } }}
              placeholder="목표 직접 입력 후 Enter"
            />
            <button className="btn btn-ghost btn-sm" onClick={() => addGoal(goalsInput)}>추가</button>
          </div>
          {goals.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {goals.map((g, i) => (
                <div key={i} data-help="t2-goal-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0f3ff', borderRadius: 6, border: '1px solid var(--pri-l)' }}>
                  <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--pri)', background: '#fff', padding: '2px 8px', borderRadius: 99 }}>목표 {i + 1}</span>
                  <span style={{ flex: 1, fontSize: '.92rem' }}>{g}</span>
                  <button onClick={() => removeGoal(i)} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 교시 구성 + 점수 + 코멘트 */}
        <div className="form-group" data-tour="t2-periods">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>📊 교시별 점수 + 코멘트</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>프리셋:</span>
              {Object.keys(PRESETS).map((name) => (
                <button key={name} className="qchip" style={{ fontSize: '.72rem' }} onClick={() => applyPreset(name)}>{name}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {periodList.map((p, i) => {
              const data = readPeriodData(scores, p);
              const filled = data.score != null;
              return (
                <div key={i} data-help="t2-period-row" style={{
                  background: filled ? '#f6f8ff' : 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 8, padding: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => renamePeriod(i, e.target.value)}
                      placeholder="예: 1교시 수학"
                      style={{
                        width: 160, padding: '5px 10px', fontSize: '.86rem', fontWeight: 700,
                        border: '1px solid var(--border)', borderRadius: 6, background: '#fff',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                      {SCORES.map((v) => {
                        const on = data.score === v;
                        return (
                          <button
                            key={v}
                            onClick={() => setScore(p, v)}
                            style={{
                              flex: 1, padding: '6px 4px', borderRadius: 6, cursor: 'pointer', fontSize: '.78rem', fontWeight: 700,
                              border: '1px solid ' + (on ? SCORE_COLORS[v] : 'var(--border)'),
                              background: on ? SCORE_COLORS[v] : '#fff',
                              color: on ? '#fff' : SCORE_COLORS[v],
                              transition: '.15s',
                            }}
                          >
                            {v}점
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => removePeriod(i)}
                      title="이 교시 삭제"
                      style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: 0, flexShrink: 0 }}
                    >×</button>
                  </div>
                  <input
                    type="text"
                    value={data.comment}
                    onChange={(e) => setPeriodComment(p, e.target.value)}
                    placeholder={`💬 ${p} 코멘트 (선택) — 예: 자리이탈 2회, 도와주세요 카드 사용함`}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
                  />
                </div>
              );
            })}
          </div>

          <button className="btn btn-ghost btn-sm" onClick={addPeriod} style={{ marginTop: 10 }}>+ 교시 추가</button>

          <div data-help="t2-total" style={{ marginTop: 12, padding: 14, background: 'var(--pri-soft)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>오늘 합계 </span>
              <strong style={{ fontSize: '1.4rem', color: 'var(--pri)' }}>{total}</strong>
              <span style={{ color: 'var(--muted)' }}> / {max || periodList.length * 3}</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: pct >= 75 ? '#0a7d4e' : pct >= 50 ? '#f59f00' : '#ef476f' }}>{pct}%</div>
          </div>
        </div>

        {/* 종합 코멘트 */}
        <div className="form-group" data-help="t2-comment-box">
          <label className="form-label" data-tour="t2-comment">💬 하교 종합 코멘트 <span style={{ color: 'var(--muted)', fontSize: '.74rem', fontWeight: 500 }}>(가정에 전달)</span></label>
          <textarea className="form-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="예: 오늘 자리이탈 횟수가 줄었어요. 가정에서도 칭찬해 주세요." />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button
            data-help="t2-save"
            className={'btn ' + (cicoDirty ? 'btn-pri' : 'btn-ghost')}
            onClick={onSave}
            disabled={busy || !cicoDirty}
            title={cicoDirty ? '지금 바로 저장' : '변경 내용이 모두 자동 저장되었습니다'}
          >
            {busy ? '저장 중...' : (cicoDirty ? '💾 CICO 저장' : '✓ 저장됨')}
          </button>
        </div>
      </div>
  );
}

const SCORE_OPTS = SCORES.map((v) => ({ value: String(v), label: String(v), aria: `${v}점 ${SCORE_LABELS[v]}` }));

/**
 * 빠른 기록 창 '점검표' 모드 — 교시마다 0~3점 알약. 입력이 멎으면 자동 저장(기존 화면과 같은 규칙)되고,
 *   창 바닥 '저장'은 ref.save()로 바로 저장한다. 목표·교시 구성은 우리 반 > 매일 점검표에서 바꾼다.
 */
const CicoRowForm = forwardRef(function CicoRowForm({ studentId, onDirty, onSaved }, ref) {
  const f = useCicoForm({ studentId, variant: 'quick' });
  useEffect(() => { if (onDirty) onDirty(f.cicoDirty); }, [f.cicoDirty, onDirty]);
  // 저장 알림은 savedAt이 새로 바뀐 때 한 번만(mds/56 #1) — onSaved가 렌더마다 새 함수여도 같은 저장을 다시 알리지 않는다.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const notifiedRef = useRef(0);
  useEffect(() => {
    if (!f.savedAt || f.savedAt === notifiedRef.current) return;
    notifiedRef.current = f.savedAt;
    if (onSavedRef.current) onSavedRef.current(f.savedAt);
  }, [f.savedAt]);
  // 창 바닥 '저장': 같은 저장을 savedAt 알림(위 효과)과 창의 markSaved가 둘 다 알리면 표를 두 번 새로 고친다(mds/56 #36).
  //   이미 위 효과가 알렸으면 notified=true로 돌려 창이 다시 알리지 않게 하고, 아직이면 위 효과가 건너뛰게 표시한다.
  const saveOnce = async () => {
    const r = await f.saveQuick();
    if (r && r.ok && r.at) { r.notified = notifiedRef.current === r.at; notifiedRef.current = r.at; }
    return r;
  };
  useImperativeHandle(ref, () => ({ save: saveOnce, discard: f.discard, isDirty: () => f.cicoDirty }));
  if (!f.data || !f.cicoLoaded) return <div className="kb-loading">점검표를 불러오는 중…</div>;
  const id = (k) => `qc-${studentId}-${k}`;
  return (
    <div className="kb-q-body" data-tour="qr-chk">
      <div className="kb-q-banner">
        점수: 3 매우 잘함 · 2 잘함 · 1 노력 필요 · 0 못함. 고르면 잠시 뒤 저절로 저장돼요.
        {f.todayRecord ? <div className="kb-q-hint">오늘 기록이 있어요 — 고치면 그대로 바뀌어요.</div> : null}
      </div>
      {f.goals.length > 0 ? (
        <div className="kb-q-field">
          <span className="kb-q-lb">오늘의 목표</span>
          <ul className="kb-q-goals">{f.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      ) : (
        <div className="kb-q-hint">목표가 아직 없어요. 목표·교시는 우리 반 › 매일 점검표에서 정해요.</div>
      )}
      {f.periodList.map((p) => {
        const d = f.scores?.[p];
        const cur = d == null ? '' : String(typeof d === 'object' ? (d.score ?? '') : d);
        return (
          <PillRadio key={p} id={id(p)} label={p} options={SCORE_OPTS} value={cur} allowClear
            onChange={(v) => (v === '' ? f.setScore(p, Number(cur)) : f.setScore(p, Number(v)))} />
        );
      })}
      <div className="kb-q-total">오늘 합계 <b>{f.total}</b> / {f.max || f.periodList.length * 3} · {f.pct}%</div>
      <QField id={id('cmt')} label="하교 종합 코멘트 (가정에 전달 · 선택)">
        <textarea id={id('cmt')} className="kb-q-input" rows={2} value={f.comment} onChange={(e) => f.setComment(e.target.value)} placeholder="예: 오늘 자리이탈 횟수가 줄었어요." />
      </QField>
    </div>
  );
});

export default CicoRowForm;
