import { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntryDate } from '../../lib/hooks/useEntryDate';
import { fetchIEP, fetchSessions, createSession, updateSession, deleteSession } from '../../lib/api/students';
import {
  SESSION_CODES, codeMeta, codeText, PHASES, isScoredStep, normalizeCodes, scoreSession,
  defaultMastery, masteryReached, mergeCandidates, baselineLongEnough, sessionSummary,
} from '../../lib/programSessions';

// 0915(mds/31 · 갑 결정): 행동 데이터 기록 화면의 두 번째 탭 — IEP 과제분석 목표의 단계 × 회기 기록.
// 기본 표기 + 정반응 · − 오반응 · P 촉구 · I 독립. 하루 1회기가 기본이고, 같은 날 다시 저장하면 2회기로 추가된다.
const CHAIN_LABEL = { forward: '전진형', backward: '후진형', total: '전체과제 제시형' };
const today = () => new Date().toISOString().slice(0, 10);
const cleanSteps = (g) => (Array.isArray(g?.task_steps) ? g.task_steps : []).map((s) => String(s).trim()).filter(Boolean);
const readSS = (k) => { try { return sessionStorage.getItem(k) || ''; } catch (_) { return ''; } };

export default function ProgramSessionPanel({ onNavigate }) {
  const { curStuId } = useStudents();
  const toast = useToast();
  const [goals, setGoals] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [goalId, setGoalId] = useState('');
  const entryDate = useEntryDate('sessions'); // 기록 달력에서 고른 날짜(mds/33)
  const [date, setDate] = useState(() => entryDate || today());
  const [phase, setPhase] = useState('teach');
  const [targetStep, setTargetStep] = useState('');
  const [codes, setCodes] = useState([]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!curStuId) return;
    let alive = true;
    setGoals(null); setSessions([]); setEditingId(null);
    Promise.all([fetchIEP(curStuId), fetchSessions(curStuId)])
      .then(([g, s]) => {
        if (!alive) return;
        const list = (g.goals || []).filter((x) => cleanSteps(x).length > 0);
        setGoals(list);
        setSessions(s.sessions || []);
        const want = readSS('kb_session_goal');
        try { sessionStorage.removeItem('kb_session_goal'); } catch (_) { /* 무시 */ }
        const pick = list.find((x) => String(x.id) === want) || list[list.length - 1];
        setGoalId(pick ? String(pick.id) : '');
      })
      .catch((e) => { if (alive) { setGoals([]); toast('회기 기록을 불러오지 못했어요: ' + e.message); } });
    return () => { alive = false; };
  }, [curStuId]); // eslint-disable-line react-hooks/exhaustive-deps

  const goal = (goals || []).find((g) => String(g.id) === goalId) || null;
  const steps = cleanSteps(goal);
  const chainType = goal?.chain_type || 'forward';
  const mine = useMemo(() => sessions.filter((s) => (s.kind || 'chain') === 'chain' && String(s.goal_id) === goalId), [sessions, goalId]);
  const mastery = defaultMastery(chainType);

  // 목표를 바꾸거나 새 기록으로 돌아가면 입력 칸을 직전 회기 기준으로 준비한다(단계·목표 단계 이어받기).
  function resetForm(list = mine) {
    const last = list[list.length - 1];
    setEditingId(null);
    setDate(today());
    setPhase(last?.phase || (list.length ? 'teach' : 'baseline'));
    setTargetStep(chainType === 'total' ? '' : String(last?.target_step || Math.min(steps.length, Number(goal?.crit_start) || 1) || ''));
    setCodes(new Array(steps.length).fill(''));
    setNote('');
  }
  useEffect(() => { if (goal) resetForm(); }, [goalId, goals]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!curStuId) return null;
  if (goals === null) return <div className="card"><div className="empty-state">회기 기록을 불러오는 중…</div></div>;
  if (!goals.length) {
    return (
      <div className="card">
        <div className="card-title">📈 교수 회기 기록</div>
        <div className="empty-state" style={{ lineHeight: 1.7 }}>
          과제분석 단계가 있는 IEP 목표가 아직 없어요.<br />
          IEP 목표 만들기에서 평가 기준을 <strong>과제분석</strong>으로 고르고 단계를 만든 뒤 저장하면 여기서 회기마다 기록할 수 있어요.
          <div style={{ marginTop: 10 }}><button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('iep')}>📋 IEP 목표 만들기로</button></div>
        </div>
      </div>
    );
  }

  const normalized = normalizeCodes(codes, steps.length, { chainType, targetStep, phase });
  const live = scoreSession(normalized);
  const sameDay = mine.filter((s) => s.date === date && s.id !== editingId);
  const reached = masteryReached(mine, mastery);
  const merges = mergeCandidates(mine, steps.length);
  const summary = sessionSummary(mine);
  const shown = showAll ? mine : mine.slice(-12);

  function setCode(i, k) {
    setCodes((prev) => { const next = [...prev]; next[i] = next[i] === k ? '' : k; return next; });
  }
  function fillAll(k) {
    setCodes(steps.map((_, i) => (isScoredStep(i, steps.length, chainType, targetStep) ? k : '')));
  }

  async function onSave() {
    if (!live.scored) { toast('채점할 단계에 코드를 하나 이상 눌러 주세요.'); return; }
    setBusy(true);
    try {
      const body = { goal_id: goal.id, date, phase, target_step: targetStep ? +targetStep : null, codes: normalized, note };
      if (editingId) {
        const r = await updateSession(curStuId, { ...body, id: editingId });
        const next = sessions.map((s) => (s.id === editingId ? r.session : s));
        setSessions(next);
        toast(`회기 기록을 고쳤어요 · 정반응률 ${r.session.pct}%`);
        resetForm(next.filter((s) => (s.kind || 'chain') === 'chain' && String(s.goal_id) === goalId));
      } else {
        const r = await createSession(curStuId, body);
        const next = [...sessions, r.session].sort((a, b) => (a.date + String(a.session_no).padStart(3, '0')).localeCompare(b.date + String(b.session_no).padStart(3, '0')));
        setSessions(next);
        toast(`${r.session.date} ${r.session.session_no}회기 저장 · 정반응률 ${r.session.pct}%`);
        resetForm(next.filter((s) => (s.kind || 'chain') === 'chain' && String(s.goal_id) === goalId));
      }
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally { setBusy(false); }
  }

  function loadSession(s) {
    setEditingId(s.id);
    setDate(s.date);
    setPhase(s.phase);
    setTargetStep(s.target_step ? String(s.target_step) : '');
    setCodes(steps.map((t, i) => colCode(s, t, i, steps.length)));
    setNote(s.note || '');
    const el = typeof document !== 'undefined' && document.getElementById('ps-form');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onDelete() {
    if (!editingId || !window.confirm('이 회기 기록을 삭제할까요?')) return;
    try {
      await deleteSession(curStuId, editingId);
      const next = sessions.filter((s) => s.id !== editingId);
      setSessions(next);
      toast('삭제했어요.');
      resetForm(next.filter((s) => (s.kind || 'chain') === 'chain' && String(s.goal_id) === goalId));
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  async function copySummary() {
    try { await navigator.clipboard.writeText(summary); toast('요약을 복사했어요 — IEP 월별 평가 칸에 붙여 넣으세요.'); }
    catch (_) { toast('복사가 막혔어요. 문장을 직접 선택해 복사하세요.'); }
  }

  const cellStyle = (k, dim) => {
    const m = codeMeta(k);
    return {
      minWidth: 30, textAlign: 'center', fontWeight: 700, padding: '4px 2px', borderRadius: 4,
      background: m ? m.bg : 'transparent', color: m ? m.color : 'var(--muted)', opacity: dim ? 0.5 : 1,
    };
  };

  return (
    <>
      <div className="card">
        <div className="card-title">📈 교수 회기 기록 (과제분석 단계 × 회기)</div>
        <div className="card-subtitle">
          IEP 과제분석 목표를 회기마다 단계별로 기록합니다. 저장하면 정반응률이 계산되고, 기준 도달·단계 합치기를 알려 줘요.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '4px 0 8px' }} aria-label="기록 코드">
          {SESSION_CODES.map((c) => (
            <span key={c.k} style={{ ...cellStyle(c.k), padding: '2px 8px' }}>{codeText(c.k)} {c.label}</span>
          ))}
          <span style={{ ...cellStyle('T'), padding: '2px 8px' }}>T 교사 수행</span>
          <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>정반응률 = (+ · I) ÷ 채점 단계 · T·빈칸은 채점 제외</span>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">IEP 목표</label>
            <select className="form-input" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.school_year ? `${g.school_year} ` : ''}{g.semester}학기 · {String(g.semester_goal || '').slice(0, 40) || '(학기목표 없음)'} ({cleanSteps(g).length}단계)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--sub)' }}>
          {CHAIN_LABEL[chainType]} · 기준 <strong>{mastery.runs}회기 연속 {mastery.pct}%</strong> · 기록 {mine.length}회기
        </div>
        {/* 자동 판정 배지 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {reached && (
            <div style={{ fontSize: '.84rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px' }}>
              ✅ 기준 도달: 최근 {mastery.runs}회기 연속 {mastery.pct}% 이상
              {chainType !== 'total' && Number(targetStep) < steps.length ? ` → 다음 단계(${Number(targetStep) + 1}단계까지)로 넘어가세요.` : ' → 유지·일반화 회기로 넘어가세요.'}
            </div>
          )}
          {merges.length > 0 && (
            <div style={{ fontSize: '.84rem', color: '#5b3fb0', background: '#f7f4ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '6px 10px' }}>
              🧩 {merges.map(([a, b]) => `${a + 1}·${b + 1}단계`).join(', ')}가 3회기 연속 정반응이에요 — IEP 목표 만들기의 과제분석에서 합쳐 단계 수를 줄여 보세요.
            </div>
          )}
          {baselineLongEnough(mine) && (
            <div style={{ fontSize: '.84rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }}>
              ⏱ 기초선 {mine.length}회기 — 아직 못 하는 기술은 기초선을 오래 볼 필요가 없어요. 이제 ‘지도’ 회기로 기록해 보세요.
            </div>
          )}
        </div>
      </div>

      <div className="card" id="ps-form">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          ✏ {editingId ? '회기 기록 고치기' : '오늘 회기 입력'}
          {editingId && <span className="badge badge-purple">수정 중 · {date}</span>}
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
          {chainType !== 'total' && (
            <div className="form-group">
              <label className="form-label">{chainType === 'backward' ? '지도 범위 (끝에서부터)' : '지도 범위 (1단계부터)'}</label>
              <select className="form-input" value={targetStep} onChange={(e) => setTargetStep(e.target.value)}>
                <option value="">전 단계 채점</option>
                {steps.map((_, i) => <option key={i} value={i + 1}>{chainType === 'backward' ? `마지막 ${i + 1}단계` : `1~${i + 1}단계`}</option>)}
              </select>
            </div>
          )}
        </div>
        {phase === 'baseline' && (
          <div style={{ fontSize: '.8rem', color: '#b45309', marginBottom: 6 }}>
            기초선: 지시 뒤 도움 없이 <strong>5초</strong> 기다리고, 시작하지 않으면 −로 적은 뒤 환경만 만들어 주고 다음 단계로 — 촉구(P)는 쓰지 않아요.
          </div>
        )}
        {sameDay.length > 0 && !editingId && (
          <div style={{ fontSize: '.8rem', color: 'var(--sub)', marginBottom: 6 }}>
            ℹ {date}에 이미 {sameDay.length}회기 기록이 있어요 — 저장하면 {sameDay.length + 1}회기로 추가됩니다.
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fillAll('I')}>채점 단계 모두 I</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fillAll('+')}>모두 +</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCodes(new Array(steps.length).fill(''))}>비우기</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {steps.map((t, i) => {
            const scored = isScoredStep(i, steps.length, chainType, targetStep);
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
                <div style={{ fontWeight: 700, color: 'var(--muted)', textAlign: 'center' }}>{i + 1}</div>
                <div style={{ fontSize: '.86rem', color: scored ? 'inherit' : 'var(--muted)', overflowWrap: 'anywhere' }}>{t}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {scored ? SESSION_CODES.map((c) => {
                    const on = normalized[i] === c.k;
                    const off = phase === 'baseline' && c.k === 'P';
                    return (
                      <button key={c.k} type="button" disabled={off} onClick={() => setCode(i, c.k)} aria-pressed={on}
                        title={c.label} aria-label={`${i + 1}단계 ${c.label}`}
                        style={{ width: 36, height: 32, borderRadius: 6, fontWeight: 800, cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.3 : 1,
                          border: '1.5px solid ' + (on ? c.color : 'var(--border)'), background: on ? c.bg : '#fff', color: c.color }}>
                        {codeText(c.k)}
                      </button>
                    );
                  }) : <span style={{ ...cellStyle('T'), minWidth: 156 }} title="지도 범위 밖 — 교사가 대신 수행">T 교사 수행</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">메모 (선택)</label>
          <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 3단계에서 몸짓 촉구 필요, 강화제 교체" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ fontSize: '.9rem' }}>
            정반응률 <strong style={{ color: 'var(--pri)' }}>{live.pct}%</strong>
            <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}> ({live.correct}/{live.scored} · 독립 {live.indep} · 촉구 {live.prompted})</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editingId && <button className="btn btn-ghost" onClick={onDelete}>🗑 삭제</button>}
            {editingId && <button className="btn btn-ghost" onClick={() => resetForm()}>취소</button>}
            <button className="btn btn-pri" onClick={onSave} disabled={busy}>{editingId ? '💾 수정 저장' : '💾 회기 저장'}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          📊 기록표 <span className="badge badge-pri">{mine.length}회기</span>
          {mine.length > 12 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>{showAll ? '최근 12회기만' : '전체 보기'}</button>
          )}
        </div>
        <div className="card-subtitle">회기 제목(날짜)을 누르면 위 입력 칸으로 불러와 고칠 수 있어요.</div>
        {!mine.length ? (
          <div className="empty-state">아직 기록한 회기가 없어요. 위에서 첫 회기를 저장해 보세요.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: '.8rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 4, minWidth: 140, position: 'sticky', left: 0, background: 'var(--card, #fff)' }}>단계</th>
                  {shown.map((s) => (
                    <th key={s.id} style={{ padding: 2 }}>
                      <button type="button" onClick={() => loadSession(s)} title={`${s.date} ${s.session_no}회기 · ${PHASES.find((p) => p.k === s.phase)?.label || ''}${s.note ? ' · ' + s.note : ''}`}
                        style={{ border: '1px solid ' + (editingId === s.id ? 'var(--pri)' : 'var(--border)'), borderRadius: 4, background: s.phase === 'baseline' ? '#fff7ed' : '#fff', cursor: 'pointer', padding: '2px 4px', fontSize: '.72rem', lineHeight: 1.2 }}>
                        {s.date.slice(5)}{s.session_no > 1 ? `-${s.session_no}` : ''}<br />
                        <span style={{ color: 'var(--muted)' }}>{s.phase === 'baseline' ? '기초' : s.phase === 'maintain' ? '유지' : '지도'}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {steps.map((t, i) => (
                  <tr key={i}>
                    <td style={{ padding: 4, position: 'sticky', left: 0, background: 'var(--card, #fff)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t}>{i + 1}. {t}</td>
                    {shown.map((s) => {
                      const k = colCode(s, t, i, steps.length);
                      return <td key={s.id} style={cellStyle(k, k === 'T')}>{codeText(k) || '·'}</td>;
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: 4, fontWeight: 700, position: 'sticky', left: 0, background: 'var(--card, #fff)' }}>정반응률</td>
                  {shown.map((s) => (
                    <td key={s.id} style={{ textAlign: 'center', fontWeight: 700, color: Number(s.pct) >= mastery.pct ? '#15803d' : 'inherit' }}>{Math.round(s.pct)}%</td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: 4, color: 'var(--muted)', position: 'sticky', left: 0, background: 'var(--card, #fff)' }}>촉구(P) 단계 수</td>
                  {shown.map((s) => <td key={s.id} style={{ textAlign: 'center', color: 'var(--muted)' }}>{s.prompted_count}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {mine.length > 0 && (
          <details className="fold-inline" style={{ marginTop: 10 }}>
            <summary>📈 정반응률 그래프 · IEP 평가 칸 요약</summary>
            <PctChart sessions={mine} goalPct={mastery.pct} />
            {summary && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: '.84rem' }}>
                <span style={{ background: 'var(--surface2)', borderRadius: 6, padding: '4px 8px' }}>{summary}</span>
                <button className="btn btn-ghost btn-sm" onClick={copySummary}>📋 복사</button>
              </div>
            )}
          </details>
        )}
      </div>
    </>
  );
}

// 회기 스냅샷의 코드를 현재 단계에 맞춰 읽는다 — 같은 자리·같은 문구를 먼저 찾고, 문구가 바뀌었으면 단계 수가 같을 때만 같은 순번.
function colCode(s, stepText, i, n) {
  const snap = Array.isArray(s.steps_snapshot) ? s.steps_snapshot : [];
  const c = Array.isArray(s.codes) ? s.codes : [];
  if (snap[i] === stepText) return c[i] || '';
  const j = snap.indexOf(stepText);
  if (j >= 0) return c[j] || '';
  return snap.length === n ? (c[i] || '') : '';
}

function PctChart({ sessions, goalPct }) {
  const W = 560, H = 180, P = 28;
  const n = sessions.length;
  const x = (i) => P + (n <= 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const y = (v) => H - P - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P);
  const pts = sessions.map((s, i) => `${x(i)},${y(Number(s.pct))}`).join(' ');
  const lastBase = sessions.map((s) => s.phase === 'baseline').lastIndexOf(true);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, minWidth: 320 }} role="img" aria-label="회기별 정반응률 그래프">
        {lastBase >= 0 && <rect x={P} y={P / 2} width={Math.max(8, x(lastBase) - P + 6)} height={H - 1.5 * P} fill="#fff7ed" />}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="#e5e7eb" />
            <text x={4} y={y(v) + 4} fontSize="10" fill="#6b7280">{v}</text>
          </g>
        ))}
        <line x1={P} x2={W - P} y1={y(goalPct)} y2={y(goalPct)} stroke="#15803d" strokeDasharray="5 4" />
        <text x={W - P} y={y(goalPct) - 4} fontSize="10" fill="#15803d" textAnchor="end">기준 {goalPct}%</text>
        <polyline points={pts} fill="none" stroke="#4f6bed" strokeWidth="2" />
        {sessions.map((s, i) => <circle key={s.id} cx={x(i)} cy={y(Number(s.pct))} r="3.5" fill={s.phase === 'baseline' ? '#f59e0b' : '#4f6bed'} />)}
      </svg>
      <div style={{ fontSize: '.74rem', color: 'var(--muted)' }}>주황 점·음영 = 기초선, 파란 점 = 지도·유지 회기, 초록 점선 = 기준.</div>
    </div>
  );
}
