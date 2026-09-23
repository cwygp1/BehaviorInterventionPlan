import { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntryDate } from '../../lib/hooks/useEntryDate';
import {
  fetchIEP, fetchSessions, createSession, updateSession, deleteSession,
  fetchPrograms, createProgram, updateProgram, deleteProgram,
} from '../../lib/api/students';
import {
  DTT_CODES, codeMeta, codeText, nextDttCode, PHASES, TRIAL_OPTIONS, ITEM_STATUS, PROMPT_METHODS, ERROR_CORRECTIONS,
  normalizeTrials, scoreDtt, countText, masteryOf, masteryText, dttDefaultsFromGoal,
  itemHistory, dttSummary, dttItemJudgement,
} from '../../lib/programSessions';

// 0915(mds/32 · 현장 의견 "DTT면 독립 수행 비율이나 기회 중 성공 횟수"): DTT(개별시행) 기록.
// 프로그램 카드(A 지시·자료 · B 표적 · C 강화 · 기회 수 · 학습기준) → 회기마다 표적 × 시행 칸에 + P − 기록.
// 요약은 학습기준 형태를 따른다: 독립 수행 비율(%) 또는 "10회 기회 중 8회".
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const LINE_COLORS = ['#4f6bed', '#e8590c', '#0a7d4e', '#c43653', '#7c3aed', '#0891b2'];
const ANTECEDENT_EX = ['책상 위 그림 카드 3장 놓고 "○○ 주세요"', '"이름이 뭐예요?" 묻기', '사물 1개 보여 주고 "이게 뭐예요?"'];
const REINF_EX = ['+이면 칭찬 + 토큰 1개', 'P로 한 반응은 칭찬만(차별 강화)', '토큰 5개 모이면 선호 활동 2분'];
const blankProgram = () => ({
  title: '', goal_id: '', antecedent: '', reinforcement: '', trials: 10,
  items: [{ id: newId(), text: '', status: 'baseline' }],
  prompt_method: 'slp', error_correction: 'redo', presentation: 'rotate',
  mastery: { type: 'rate', pct: 80, runs: 2 }, status: 'active',
});

export default function DttPanel() {
  const { curStuId, curStuData } = useStudents();
  const toast = useToast();
  const [programs, setPrograms] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [programId, setProgramId] = useState('');
  const [draft, setDraft] = useState(null); // 프로그램 카드 편집 중이면 객체
  // 회기 입력
  const entryDate = useEntryDate('sessions'); // 기록 달력에서 고른 날짜(mds/33)
  const [date, setDate] = useState(() => entryDate || today());
  const [phase, setPhase] = useState('baseline');
  const [formItems, setFormItems] = useState([]); // [{id,text}] — 새 회기는 프로그램 표적, 고치기는 그 회기 스냅샷
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [quick, setQuick] = useState(false);
  const [undo, setUndo] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!curStuId) return;
    let alive = true;
    setPrograms(null); setSessions([]); setDraft(null); setEditingId(null);
    Promise.all([fetchPrograms(curStuId), fetchSessions(curStuId), fetchIEP(curStuId)])
      .then(([p, s, g]) => {
        if (!alive) return;
        // 0916: 5점 척도(BST) 프로그램은 이 화면에 섞이지 않게 뺀다.
        const list = (p.programs || []).filter((x) => (x.kind || 'dtt') === 'dtt');
        setPrograms(list);
        setSessions(s.sessions || []);
        setGoals(g.goals || []);
        const active = list.filter((x) => x.status !== 'closed');
        // 0915: IEP 목표의 'DTT 기록 열기'로 들어왔으면 그 목표에 연결된 프로그램을, 없으면 목표 기준 새 프로그램 설정을 연다.
        let wantGoal = '';
        try { wantGoal = sessionStorage.getItem('kb_dtt_goal') || ''; sessionStorage.removeItem('kb_dtt_goal'); } catch (_) { /* 무시 */ }
        const linked = wantGoal ? (active.find((x) => String(x.goal_id) === wantGoal) || list.find((x) => String(x.goal_id) === wantGoal)) : null;
        setProgramId(linked ? String(linked.id) : (active.length ? String(active[active.length - 1].id) : ''));
        const wantG = wantGoal && !linked ? (g.goals || []).find((x) => String(x.id) === wantGoal) : null;
        if (wantG) {
          setDraft({ ...blankProgram(), goal_id: String(wantG.id), title: String(wantG.semester_goal || '').slice(0, 60), ...dttDefaultsFromGoal(wantG) });
          toast('이 IEP 목표에 연결된 DTT 프로그램이 없어요 — 목표 기준으로 채운 새 프로그램을 확인하고 저장하세요.');
        }
      })
      .catch((e) => { if (alive) { setPrograms([]); toast('DTT 기록을 불러오지 못했어요: ' + e.message); } });
    return () => { alive = false; };
  }, [curStuId]); // eslint-disable-line react-hooks/exhaustive-deps

  const program = (programs || []).find((x) => String(x.id) === programId) || null;
  const items = program ? (Array.isArray(program.items) ? program.items : []) : [];
  const trials = Number(program?.trials) || 10;
  const mine = useMemo(() => sessions.filter((s) => s.kind === 'dtt' && String(s.program_id) === programId), [sessions, programId]);
  const mastery = masteryOf(program?.mastery);
  const isCount = program?.mastery?.type === 'count';

  function resetForm(list = mine) {
    const last = list[list.length - 1];
    setEditingId(null); setDate(today()); setNote(''); setUndo([]);
    setPhase(last?.phase || 'baseline');
    const its = items.map((x) => ({ id: x.id, text: x.text }));
    setFormItems(its);
    setRows(its.map(() => new Array(trials).fill('')));
  }
  useEffect(() => { if (program) resetForm(); }, [programId, programs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!curStuId) return null;
  if (programs === null) return <div className="card"><div className="empty-state">DTT 기록을 불러오는 중…</div></div>;

  const normalized = normalizeTrials(rows, formItems.length, rows[0]?.length || trials, phase);
  const live = scoreDtt(normalized);
  const sameDay = mine.filter((s) => s.date === date && s.id !== editingId);
  const summary = program ? dttSummary(items, mine, program.mastery) : '';

  // 빠른 기록 순서: 섞어서 제시면 시행마다 표적을 번갈아, 한 표적 집중이면 표적마다 시행을 이어서.
  const cellOrder = [];
  const nT = rows[0]?.length || trials;
  if (program?.presentation === 'massed') { for (let r = 0; r < formItems.length; r++) for (let t = 0; t < nT; t++) cellOrder.push([r, t]); }
  else { for (let t = 0; t < nT; t++) for (let r = 0; r < formItems.length; r++) cellOrder.push([r, t]); }
  const cursor = cellOrder.findIndex(([r, t]) => !normalized[r]?.[t]);

  function setCell(r, t, v) {
    setRows((prev) => prev.map((row, i) => (i === r ? row.map((c, j) => (j === t ? v : c)) : row)));
  }
  function quickMark(k) {
    if (cursor < 0) { toast('모든 칸을 채웠어요. 저장하세요.'); return; }
    const [r, t] = cellOrder[cursor];
    setCell(r, t, k);
    setUndo((u) => [...u, cursor]);
  }
  function quickUndo() {
    const last = undo[undo.length - 1];
    if (last == null) return;
    const [r, t] = cellOrder[last];
    setCell(r, t, '');
    setUndo((u) => u.slice(0, -1));
  }

  async function onSave() {
    if (!live.scored) { toast('시행 칸에 + P − 중 하나를 하나 이상 기록해 주세요.'); return; }
    setBusy(true);
    try {
      const body = { kind: 'dtt', program_id: program.id, date, phase, codes: normalized, note, item_ids: formItems.map((x) => x.id) };
      let saved;
      if (editingId) {
        saved = (await updateSession(curStuId, { ...body, id: editingId })).session;
        const next = sessions.map((s) => (s.id === editingId ? saved : s));
        setSessions(next); resetForm(next.filter((s) => s.kind === 'dtt' && String(s.program_id) === programId));
      } else {
        saved = (await createSession(curStuId, body)).session;
        const next = [...sessions, saved].sort((a, b) => (a.date + String(a.session_no).padStart(3, '0')).localeCompare(b.date + String(b.session_no).padStart(3, '0')));
        setSessions(next); resetForm(next.filter((s) => s.kind === 'dtt' && String(s.program_id) === programId));
      }
      toast(`${saved.date} ${saved.session_no}회기 ${editingId ? '고침' : '저장'} · ${isCount ? countText(saved.correct_count, saved.scored_count) + ' 성공' : `독립 수행 ${saved.pct}%`}`);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  function loadSession(s) {
    const snap = Array.isArray(s.steps_snapshot) ? s.steps_snapshot : [];
    setEditingId(s.id); setDate(s.date); setPhase(s.phase); setNote(s.note || ''); setUndo([]);
    setFormItems(snap.map((x) => ({ id: x.id, text: x.text })));
    setRows(snap.map((_, i) => (Array.isArray(s.codes?.[i]) ? [...s.codes[i]] : [])));
    const el = typeof document !== 'undefined' && document.getElementById('dtt-form');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onDeleteSession() {
    if (!editingId || !window.confirm('이 회기 기록을 삭제할까요?')) return;
    try {
      await deleteSession(curStuId, editingId);
      const next = sessions.filter((s) => s.id !== editingId);
      setSessions(next); resetForm(next.filter((s) => s.kind === 'dtt' && String(s.program_id) === programId));
      toast('삭제했어요.');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  // ── 프로그램 카드 ──
  function openEditor(p) {
    setDraft(p ? { ...p, goal_id: p.goal_id ? String(p.goal_id) : '', items: (p.items || []).map((x) => ({ ...x })), mastery: { ...(p.mastery || {}) } } : blankProgram());
  }
  const setD = (patch) => setDraft((d) => ({ ...d, ...patch }));
  function linkGoal(gid) {
    const g = goals.find((x) => String(x.id) === gid);
    // IEP 목표에 연결하면 그 평가 방식(독립 수행 비율 / 기회 중 성공 횟수)으로 학습기준을 맞춘다.
    setD({ goal_id: gid, ...(g ? { ...dttDefaultsFromGoal(g, Number(draft.trials) || 10), title: draft.title || String(g.semester_goal || '').slice(0, 60) } : {}) });
  }
  async function saveProgram() {
    const body = { ...draft, items: draft.items.filter((x) => String(x.text).trim()) };
    if (!String(body.title).trim()) { toast('프로그램 이름을 적어 주세요.'); return; }
    if (!body.items.length) { toast('표적(학습 항목)을 하나 이상 적어 주세요.'); return; }
    setBusy(true);
    try {
      if (draft.id) {
        const r = await updateProgram(curStuId, body);
        setPrograms((ps) => ps.map((x) => (x.id === r.program.id ? r.program : x)));
        toast('프로그램을 고쳤어요.');
      } else {
        const r = await createProgram(curStuId, body);
        setPrograms((ps) => [...ps, r.program]);
        setProgramId(String(r.program.id));
        toast('DTT 프로그램을 만들었어요. 이제 회기를 기록하세요.');
      }
      setDraft(null);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }
  async function removeProgram() {
    if (!draft?.id || !window.confirm('이 프로그램과 기록한 회기를 모두 삭제할까요?')) return;
    try {
      await deleteProgram(curStuId, draft.id);
      const rest = programs.filter((x) => x.id !== draft.id);
      setPrograms(rest); setSessions((ss) => ss.filter((s) => !(s.kind === 'dtt' && s.program_id === draft.id)));
      setProgramId(rest.length ? String(rest[rest.length - 1].id) : ''); setDraft(null);
      toast('삭제했어요.');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }
  // 표적 상태 바꾸기(습득 → 유지·일반화, 다시 지도 등) — 프로그램을 바로 저장한다.
  async function setItemStatus(itemId, status) {
    try {
      const next = items.map((x) => (x.id === itemId ? { ...x, status } : x));
      const r = await updateProgram(curStuId, { ...program, items: next });
      setPrograms((ps) => ps.map((x) => (x.id === r.program.id ? r.program : x)));
      toast(`표적 상태: ${ITEM_STATUS.find((x) => x.k === status)?.label}`);
    } catch (e) { toast('변경 실패: ' + e.message); }
  }

  const raisdTop = (curStuData?.raisd?.responses?._meta?.ranking || []).filter(Boolean).slice(0, 3);
  const cellStyle = (k) => {
    const m = codeMeta(k);
    return { width: 28, height: 30, borderRadius: 5, fontWeight: 800, border: '1.5px solid ' + (m ? m.color : 'var(--border)'), background: m ? m.bg : '#fff', color: m ? m.color : 'var(--muted)', cursor: 'pointer', padding: 0 };
  };
  const statusBadge = (st) => {
    const c = { baseline: '#b45309', teach: '#1d4ed8', mastered: '#15803d', maintain: '#7c3aed' }[st] || '#6b7280';
    return <span style={{ fontSize: '.7rem', fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 99, padding: '0 6px', whiteSpace: 'nowrap' }}>{ITEM_STATUS.find((x) => x.k === st)?.label || st}</span>;
  };

  return (
    <>
      <div className="card" data-help="mon-dtt-program">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          🎯 DTT (개별시행) 기록
          <button className="btn btn-ghost btn-sm" onClick={() => openEditor(null)}>+ 새 프로그램</button>
          {program && <button className="btn btn-ghost btn-sm" onClick={() => openEditor(program)}>✏ 프로그램 고치기</button>}
        </div>
        <div className="card-subtitle">
          학습 항목(표적)마다 기회를 여러 번 주고 칸마다 <strong>+ 정반응 · P 촉구 · − 오반응</strong>을 적습니다. 결과는 <strong>독립 수행 비율(%)</strong> 또는 <strong>기회 중 성공 횟수</strong>로 보여 줘요.
        </div>
        {programs.length > 0 ? (
          <div className="form-group">
            <label className="form-label">프로그램</label>
            <select className="form-input" value={programId} onChange={(e) => { setProgramId(e.target.value); setDraft(null); }}>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.title} ({(p.items || []).length}개 표적 · 기회 {p.trials}번){p.status === 'closed' ? ' · 종료' : ''}</option>)}
            </select>
          </div>
        ) : !draft && (
          <div className="empty-state" style={{ lineHeight: 1.7 }}>
            아직 DTT 프로그램이 없어요. <strong>+ 새 프로그램</strong>으로 지시·표적·강화·학습기준을 정해 주세요.
          </div>
        )}
        {program && !draft && (
          <div style={{ fontSize: '.82rem', color: 'var(--sub)', lineHeight: 1.7, background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
            {program.antecedent && <div><strong>A 지시·자료</strong> {program.antecedent}</div>}
            <div><strong>B 표적</strong> {items.map((x) => <span key={x.id} style={{ marginRight: 8 }}>{x.text} {statusBadge(x.status)}</span>)}</div>
            {program.reinforcement && <div><strong>C 강화</strong> {program.reinforcement}</div>}
            <div>
              <strong>학습기준</strong> {masteryText(program.mastery)} · 기회 {trials}번 · {PROMPT_METHODS.find((x) => x.k === program.prompt_method)?.label} · 오류 처리 {ERROR_CORRECTIONS.find((x) => x.k === program.error_correction)?.label} · {program.presentation === 'massed' ? '한 표적 집중' : '섞어서 제시'}
              {program.goal_id && goals.find((g) => g.id === program.goal_id) && <> · IEP 목표 연결됨</>}
            </div>
          </div>
        )}
      </div>

      {draft && (
        <div className="card" data-help="mon-dtt-editor" style={{ border: '2px solid var(--pri)' }}>
          <div className="card-title">{draft.id ? '✏ 프로그램 고치기' : '🆕 새 DTT 프로그램'}</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">프로그램 이름</label>
              <input className="form-input" value={draft.title} onChange={(e) => setD({ title: e.target.value })} placeholder="예: 수용언어 — 색 이름 듣고 고르기" />
            </div>
            <div className="form-group">
              <label className="form-label">IEP 목표 연결 (선택)</label>
              <select className="form-input" value={draft.goal_id} onChange={(e) => linkGoal(e.target.value)}>
                <option value="">연결 안 함</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.semester}학기 · {String(g.semester_goal || '').slice(0, 40)} ({g.crit_type === 'freq' ? `${g.crit_of || 10}회 중 성공 횟수` : g.crit_type === 'rate' ? '독립 수행 비율' : g.crit_type === 'task' ? '과제분석' : '질적'})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">A 지시·자료 (선행조건)</label>
            <input className="form-input" value={draft.antecedent} onChange={(e) => setD({ antecedent: e.target.value })} placeholder="예: 책상 위 색 카드 3장, &quot;빨강 주세요&quot;" />
            <div className="qchip-area" style={{ marginTop: 4 }}>{ANTECEDENT_EX.map((t) => <button key={t} type="button" className="qchip" onClick={() => setD({ antecedent: t })}>{t}</button>)}</div>
          </div>
          <div className="form-group">
            <label className="form-label">B 표적 (학습 항목) — 줄마다 하나</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {draft.items.map((x, i) => (
                <div key={x.id} data-help="mon-dtt-target" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 6 }}>
                  <input className="form-input" value={x.text} placeholder={i === 0 ? '예: 빨강' : '예: 파랑'}
                    onChange={(e) => setD({ items: draft.items.map((y) => (y.id === x.id ? { ...y, text: e.target.value } : y)) })} />
                  <select className="form-input" style={{ width: 'auto' }} value={x.status}
                    onChange={(e) => setD({ items: draft.items.map((y) => (y.id === x.id ? { ...y, status: e.target.value } : y)) })}>
                    {ITEM_STATUS.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
                  </select>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="표적 삭제" onClick={() => setD({ items: draft.items.filter((y) => y.id !== x.id) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ items: [...draft.items, { id: newId(), text: '', status: 'baseline' }] })}>+ 표적 추가</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">C 강화</label>
            <input className="form-input" value={draft.reinforcement} onChange={(e) => setD({ reinforcement: e.target.value })} placeholder="예: +이면 칭찬 + 토큰, P로 한 반응은 칭찬만" />
            <div className="qchip-area" style={{ marginTop: 4 }}>
              {[...REINF_EX, ...raisdTop.map((t) => `선호 강화제: ${t}`)].map((t) => (
                <button key={t} type="button" className="qchip" onClick={() => setD({ reinforcement: draft.reinforcement ? `${draft.reinforcement} · ${t}` : t })}>{t}</button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">표적별 기회 수</label>
              <select className="form-input" value={draft.trials} onChange={(e) => {
                const n = +e.target.value;
                setD({ trials: n, mastery: draft.mastery?.type === 'count' ? { ...draft.mastery, of: n, min: Math.round(n * 0.8) } : draft.mastery });
              }}>
                {TRIAL_OPTIONS.map((n) => <option key={n} value={n}>{n}번</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">촉구 방법</label>
              <select className="form-input" value={draft.prompt_method} onChange={(e) => setD({ prompt_method: e.target.value })}>
                {PROMPT_METHODS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">오류 처리</label>
              <select className="form-input" value={draft.error_correction} onChange={(e) => setD({ error_correction: e.target.value })}>
                {ERROR_CORRECTIONS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">제시 방식</label>
              <select className="form-input" value={draft.presentation} onChange={(e) => setD({ presentation: e.target.value })}>
                <option value="rotate">섞어서 제시</option>
                <option value="massed">한 표적 집중</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">학습기준</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: '.86rem' }}>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input type="radio" checked={draft.mastery?.type !== 'count'} onChange={() => setD({ mastery: { type: 'rate', pct: 80, runs: draft.mastery?.runs || 2 } })} /> 독립 수행 비율
              </label>
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input type="radio" checked={draft.mastery?.type === 'count'} onChange={() => setD({ mastery: { type: 'count', of: draft.trials, min: Math.round(draft.trials * 0.8), runs: draft.mastery?.runs || 2 } })} /> 기회 중 성공 횟수
              </label>
              {draft.mastery?.type === 'count' ? (
                <span>{draft.trials}회 기회 중 <input type="number" className="form-input" style={{ width: 60, display: 'inline-block' }} min={1} max={draft.trials} value={draft.mastery.min} onChange={(e) => setD({ mastery: { ...draft.mastery, min: +e.target.value } })} />회</span>
              ) : (
                <span><input type="number" className="form-input" style={{ width: 64, display: 'inline-block' }} min={10} max={100} step={5} value={draft.mastery?.pct ?? 80} onChange={(e) => setD({ mastery: { ...draft.mastery, pct: +e.target.value } })} />% 이상</span>
              )}
              <span><input type="number" className="form-input" style={{ width: 56, display: 'inline-block' }} min={1} max={5} value={draft.mastery?.runs ?? 2} onChange={(e) => setD({ mastery: { ...draft.mastery, runs: +e.target.value } })} />회기 연속</span>
            </div>
            <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>
              IEP 목표를 연결하면 그 평가 방식에 맞춰 기준이 바뀌어요. 기준에 도달한 표적은 끝이 아니라 <strong>유지·일반화</strong>로 옮겨 다른 사람·장소·자료로 점검합니다. 신체 촉구는 최소한으로, 학생·보호자 동의 안에서만 쓰세요.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>{draft.id && <button className="btn btn-ghost" onClick={removeProgram}>🗑 프로그램 삭제</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>취소</button>
              <button className="btn btn-pri" onClick={saveProgram} disabled={busy}>💾 프로그램 저장</button>
            </div>
          </div>
        </div>
      )}

      {program && !draft && (
        <>
          {/* 표적별 판정 배지 */}
          {items.some((x) => { const j = dttItemJudgement(x.status, itemHistory(mine, x.id), mastery); return j.reached || j.stuck || j.dropped; }) && (
            <div className="card" style={{ padding: '10px 14px' }}>
              {items.map((x) => {
                const { reached, stuck, dropped } = dttItemJudgement(x.status, itemHistory(mine, x.id), mastery);
                if (!reached && !stuck && !dropped) return null;
                return (
                  <div key={x.id} data-help="mon-dtt-judge" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '.84rem', padding: '3px 0' }}>
                    {reached && x.status !== 'maintain' && x.status !== 'mastered' && (
                      <><span style={{ color: '#15803d' }}>✅ ‘{x.text}’ 학습기준 도달({masteryText(program.mastery)})</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setItemStatus(x.id, 'mastered')}>습득으로 표시</button></>
                    )}
                    {x.status === 'mastered' && (
                      <><span style={{ color: '#15803d' }}>🏅 ‘{x.text}’ 습득</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setItemStatus(x.id, 'maintain')}>유지·일반화로 옮기기</button></>
                    )}
                    {dropped && (
                      <><span style={{ color: '#b45309' }}>↩ ‘{x.text}’ 유지 점검에서 기준 아래</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => setItemStatus(x.id, 'teach')}>다시 지도</button></>
                    )}
                    {stuck && <span style={{ color: '#b45309' }}>⚠ ‘{x.text}’ 지도 3회기 연속 50% 미만 — 촉구를 한 단계 올리거나 표적을 쪼개 보세요.</span>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="card" id="dtt-form" data-help="mon-dtt-form">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              ✏ {editingId ? '회기 기록 고치기' : '오늘 회기 입력'}
              {editingId && <span className="badge badge-purple">수정 중 · {date}</span>}
              <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.8rem', fontWeight: 600 }}>
                <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> 빠른 기록(태블릿)
              </label>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!editingId} />
              </div>
              <div className="form-group">
                <label className="form-label">단계</label>
                <div className="qchip-area" role="group" aria-label="회기 단계">
                  {PHASES.map((p) => (
                    <button key={p.k} type="button" className={'qchip' + (phase === p.k ? ' on' : '')} aria-pressed={phase === p.k} onClick={() => setPhase(p.k)}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>
            {phase === 'baseline' && (
              <div style={{ fontSize: '.8rem', color: '#b45309', marginBottom: 6 }}>기초선: 지시 뒤 도움 없이 <strong>5초</strong> 기다려 반응이 없거나 틀리면 − — 촉구(P)는 쓰지 않아요.</div>
            )}
            {sameDay.length > 0 && !editingId && (
              <div style={{ fontSize: '.8rem', color: 'var(--sub)', marginBottom: 6 }}>ℹ {date}에 이미 {sameDay.length}회기 기록이 있어요 — 저장하면 {sameDay.length + 1}회기로 추가됩니다.</div>
            )}

            {quick && (
              <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 10, marginBottom: 10, textAlign: 'center' }}>
                <div style={{ fontSize: '.9rem', marginBottom: 8 }}>
                  {cursor >= 0
                    ? <>지금: <strong>{formItems[cellOrder[cursor][0]]?.text}</strong> · {cellOrder[cursor][1] + 1}번째 기회</>
                    : <strong>모든 칸을 채웠어요 — 저장하세요</strong>}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {DTT_CODES.map((c) => (
                    <button key={c.k} type="button" disabled={phase === 'baseline' && c.k === 'P'} onClick={() => quickMark(c.k)}
                      style={{ width: 84, height: 64, fontSize: '1.6rem', fontWeight: 800, borderRadius: 12, border: `2px solid ${c.color}`, background: c.bg, color: c.color, opacity: phase === 'baseline' && c.k === 'P' ? 0.3 : 1 }}>
                      {codeText(c.k)}<div style={{ fontSize: '.7rem' }}>{c.label}</div>
                    </button>
                  ))}
                  <button type="button" className="btn btn-ghost" onClick={quickUndo} disabled={!undo.length}>↶ 되돌리기</button>
                </div>
              </div>
            )}

            <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginBottom: 4 }}>칸을 누를 때마다 + → P → − → 빈칸 순서로 바뀌어요. 빈칸은 계산에서 빠집니다.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: '.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', minWidth: 110 }}>표적</th>
                    {Array.from({ length: nT }, (_, t) => <th key={t} style={{ color: 'var(--muted)', fontWeight: 600 }}>{t + 1}</th>)}
                    <th style={{ minWidth: 80 }}>결과</th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((x, r) => {
                    const st = live.stats[r] || { correct: 0, scored: 0, pct: 0 };
                    return (
                      <tr key={x.id} data-help="mon-dtt-trial-row">
                        <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.text}>{x.text}</td>
                        {Array.from({ length: nT }, (_, t) => {
                          const k = normalized[r]?.[t] || '';
                          const here = quick && cursor >= 0 && cellOrder[cursor][0] === r && cellOrder[cursor][1] === t;
                          return (
                            <td key={t}>
                              <button type="button" aria-label={`${x.text} ${t + 1}번째 기회`}
                                onClick={() => { let v = nextDttCode(k); if (phase === 'baseline' && v === 'P') v = nextDttCode(v); setCell(r, t, v); }}
                                style={{ ...cellStyle(k), outline: here ? '2px solid var(--pri)' : 'none' }}>{codeText(k)}</button>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}>{st.scored ? (isCount ? `${st.correct}/${st.scored}` : `${st.pct}%`) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">메모 (선택)</label>
              <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 파랑에서 몸짓 촉구 필요, 강화제 교체" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.9rem' }}>
                회기 전체 {isCount ? <strong style={{ color: 'var(--pri)' }}>{countText(live.correct, live.scored)} 성공</strong> : <>독립 수행 <strong style={{ color: 'var(--pri)' }}>{live.pct}%</strong></>}
                <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}> (촉구 {live.prompted}번)</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingId && <button className="btn btn-ghost" onClick={onDeleteSession}>🗑 삭제</button>}
                {editingId && <button className="btn btn-ghost" onClick={() => resetForm()}>취소</button>}
                <button className="btn btn-pri" data-help="mon-session-save" onClick={onSave} disabled={busy}>{editingId ? '💾 수정 저장' : '💾 회기 저장'}</button>
              </div>
            </div>
          </div>

          <div className="card" data-help="mon-dtt-table">
            <div className="card-title">📊 기록표 <span className="badge badge-pri">{mine.length}회기</span></div>
            <div className="card-subtitle">칸 = 그 회기의 {isCount ? '성공 횟수/기회' : '독립 수행 비율'}. 회기 제목(날짜)을 누르면 위로 불러와 고칠 수 있어요.</div>
            {!mine.length ? (
              <div className="empty-state">아직 기록한 회기가 없어요. 기초선부터 2~3회기 기록해 보세요.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: '.8rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', minWidth: 120, position: 'sticky', left: 0, background: 'var(--card, #fff)' }}>표적</th>
                      {mine.slice(-12).map((s) => (
                        <th key={s.id} style={{ padding: 2 }}>
                          <button type="button" data-help="mon-session-col" onClick={() => loadSession(s)} title={s.note || ''}
                            style={{ border: '1px solid ' + (editingId === s.id ? 'var(--pri)' : 'var(--border)'), borderRadius: 4, background: s.phase === 'baseline' ? '#fff7ed' : '#fff', cursor: 'pointer', padding: '2px 4px', fontSize: '.72rem', lineHeight: 1.2 }}>
                            {s.date.slice(5)}{s.session_no > 1 ? `-${s.session_no}` : ''}<br />
                            <span style={{ color: 'var(--muted)' }}>{s.phase === 'baseline' ? '기초' : s.phase === 'maintain' ? '유지' : '지도'}</span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.id} data-help="mon-dtt-row">
                        <td style={{ padding: 4, position: 'sticky', left: 0, background: 'var(--card, #fff)', whiteSpace: 'nowrap' }}>{x.text} {statusBadge(x.status)}</td>
                        {mine.slice(-12).map((s) => {
                          const i = (s.steps_snapshot || []).findIndex((y) => y && y.id === x.id);
                          const st = i >= 0 ? (s.item_stats || [])[i] : null;
                          if (!st || !st.scored) return <td key={s.id} style={{ textAlign: 'center', color: 'var(--muted)' }}>·</td>;
                          const ok = Number(st.pct) >= mastery.pct;
                          return <td key={s.id} style={{ textAlign: 'center', fontWeight: 700, borderRadius: 4, background: ok ? '#dcfce7' : Number(st.pct) >= 50 ? '#fef3c7' : '#fee2e2', color: ok ? '#15803d' : 'inherit' }}>{isCount ? `${st.correct}/${st.scored}` : `${Math.round(st.pct)}%`}</td>;
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: 4, fontWeight: 700, position: 'sticky', left: 0, background: 'var(--card, #fff)' }}>회기 전체</td>
                      {mine.slice(-12).map((s) => <td key={s.id} style={{ textAlign: 'center', fontWeight: 700 }}>{isCount ? `${s.correct_count}/${s.scored_count}` : `${Math.round(s.pct)}%`}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {mine.length > 0 && (
              <details className="fold-inline" style={{ marginTop: 10 }}>
                <summary>📈 표적별 그래프 · IEP 평가 칸 요약</summary>
                <DttChart items={items} sessions={mine} goalPct={mastery.pct} />
                {summary && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: '.84rem' }}>
                    <span style={{ background: 'var(--surface2)', borderRadius: 6, padding: '4px 8px' }}>{summary}</span>
                    <button className="btn btn-ghost btn-sm" onClick={async () => {
                      try { await navigator.clipboard.writeText(summary); toast('요약을 복사했어요 — IEP 월별 평가 칸에 붙여 넣으세요.'); }
                      catch (_) { toast('복사가 막혔어요. 문장을 직접 선택해 복사하세요.'); }
                    }}>📋 복사</button>
                  </div>
                )}
              </details>
            )}
          </div>
        </>
      )}
    </>
  );
}

// 회기별 표적 독립 수행 비율 선 그래프(기초선 음영 · 기준 점선).
function DttChart({ items, sessions, goalPct }) {
  const W = 560, H = 190, P = 28;
  const n = sessions.length;
  const x = (i) => P + (n <= 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const y = (v) => H - P - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P);
  const lastBase = sessions.map((s) => s.phase === 'baseline').lastIndexOf(true);
  const lines = items.slice(0, LINE_COLORS.length).map((it, k) => {
    const pts = [];
    sessions.forEach((s, i) => {
      const j = (s.steps_snapshot || []).findIndex((z) => z && z.id === it.id);
      const st = j >= 0 ? (s.item_stats || [])[j] : null;
      if (st && st.scored) pts.push([x(i), y(Number(st.pct))]);
    });
    return { it, color: LINE_COLORS[k], pts };
  });
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, minWidth: 320 }} role="img" aria-label="표적별 독립 수행 비율 그래프">
        {lastBase >= 0 && <rect x={P} y={P / 2} width={Math.max(8, x(lastBase) - P + 6)} height={H - 1.5 * P} fill="#fff7ed" />}
        {[0, 50, 100].map((v) => (
          <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="#e5e7eb" /><text x={4} y={y(v) + 4} fontSize="10" fill="#6b7280">{v}</text></g>
        ))}
        <line x1={P} x2={W - P} y1={y(goalPct)} y2={y(goalPct)} stroke="#15803d" strokeDasharray="5 4" />
        <text x={W - P} y={y(goalPct) - 4} fontSize="10" fill="#15803d" textAnchor="end">기준 {goalPct}%</text>
        {lines.map((l) => (
          <g key={l.it.id}>
            {l.pts.length > 1 && <polyline points={l.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={l.color} strokeWidth="2" />}
            {l.pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={l.color} />)}
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '.76rem' }}>
        {lines.map((l) => <span key={l.it.id}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: l.color, marginRight: 4 }} />{l.it.text}</span>)}
        <span style={{ color: 'var(--muted)' }}>음영 = 기초선 · 초록 점선 = 기준</span>
      </div>
    </div>
  );
}
