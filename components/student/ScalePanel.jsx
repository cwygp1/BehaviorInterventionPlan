import { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntryDate } from '../../lib/hooks/useEntryDate';
import {
  fetchIEP, fetchSessions, createSession, updateSession, deleteSession,
  fetchPrograms, createProgram, updateProgram, deleteProgram,
} from '../../lib/api/students';
import { PHASES } from '../../lib/programSessions';
import {
  BST_SCALE, BST_SCORING_RULES, BST_SETTINGS, BST_TOP, SCALE_TRIAL_OPTIONS, SCALE_TRIALS_DEFAULT,
  normalizeScores, scoreBstSession, bstMasteryReached, bstSummaryText, scaleMasteryText,
} from '../../lib/teachMethods';

// 0916(mds/34 §15 · 햇살 답): 행동기술훈련(BST) 5점 척도 기록.
//   기술 하나를 정해 두고, 실제 상황에서 기회마다 5~1점을 매긴다(역할극은 연습 기록이라 판정에서 뺀다).
//   도달은 '실제 상황 5점 2회기 연속'. 점수 기준·채점 규칙은 lib/teachMethods.js 한 곳에 있다.
const today = () => new Date().toISOString().slice(0, 10);
const SCENE_EX = ['쉬는 시간 복도에서', '급식실에서 차례 기다릴 때', '모르는 사람이 말을 걸 때'];
const blankProgram = () => ({
  title: '', goal_id: '', antecedent: '', reinforcement: '',
  trials: SCALE_TRIALS_DEFAULT, mastery: { runs: 2 }, status: 'active',
});
const settingLabel = (k) => BST_SETTINGS.find((s) => s.k === k)?.label || '실제 상황';
const phaseLabel = (k) => PHASES.find((p) => p.k === k)?.label || '지도';

export default function ScalePanel() {
  const { curStuId } = useStudents();
  const toast = useToast();
  const [programs, setPrograms] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [programId, setProgramId] = useState('');
  const [draft, setDraft] = useState(null);
  const entryDate = useEntryDate('sessions'); // 기록 달력에서 고른 날짜(mds/33)
  const [date, setDate] = useState(() => entryDate || today());
  const [phase, setPhase] = useState('baseline');
  const [setting, setSetting] = useState('real');
  const [scores, setScores] = useState([]);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openGuide, setOpenGuide] = useState(false);

  useEffect(() => {
    if (!curStuId) return;
    let alive = true;
    setPrograms(null); setSessions([]); setDraft(null); setEditingId(null);
    Promise.all([fetchPrograms(curStuId), fetchSessions(curStuId), fetchIEP(curStuId)])
      .then(([p, s, g]) => {
        if (!alive) return;
        const list = (p.programs || []).filter((x) => x.kind === 'scale');
        setPrograms(list);
        setSessions((s.sessions || []).filter((x) => x.kind === 'scale'));
        setGoals(g.goals || []);
        const active = list.filter((x) => x.status !== 'closed');
        setProgramId(active.length ? String(active[active.length - 1].id) : '');
      })
      .catch((e) => { if (alive) { setPrograms([]); toast('5점 척도 기록을 불러오지 못했어요: ' + e.message); } });
    return () => { alive = false; };
  }, [curStuId]); // eslint-disable-line react-hooks/exhaustive-deps

  const program = (programs || []).find((x) => String(x.id) === programId) || null;
  const trials = Number(program?.trials) || SCALE_TRIALS_DEFAULT;
  const mine = useMemo(
    () => sessions.filter((s) => String(s.program_id) === programId),
    [sessions, programId],
  );
  // 판정·요약은 최신 회기가 앞에 오도록 뒤집어 넘긴다.
  const recent = useMemo(
    () => [...mine].reverse().map((s) => ({ setting: s.chain_type, phase: s.phase, scores: s.codes })),
    [mine],
  );
  const runs = Math.max(1, Math.min(5, Number(program?.mastery?.runs) || 2));
  const reached = bstMasteryReached(recent, { score: BST_TOP, runs, setting: 'real' });
  const live = scoreBstSession(scores);

  function resetForm(list = mine) {
    const last = list[list.length - 1];
    setEditingId(null); setDate(entryDate || today()); setNote('');
    setPhase(last?.phase || 'baseline');
    setSetting(last?.chain_type || 'real');
    setScores(normalizeScores([], trials));
  }
  useEffect(() => { resetForm(); }, [programId, trials]); // eslint-disable-line react-hooks/exhaustive-deps

  function editSession(s) {
    setEditingId(s.id); setDate(s.date); setPhase(s.phase || 'teach');
    setSetting(s.chain_type || 'real'); setNote(s.note || '');
    setScores(normalizeScores(Array.isArray(s.codes) ? s.codes : [], (s.codes || []).length || trials));
  }

  async function saveProgram() {
    if (!draft) return;
    setBusy(true);
    try {
      const body = { ...draft, kind: 'scale', goal_id: draft.goal_id || null, mastery: { runs: Number(draft.mastery?.runs) || 2 } };
      const saved = draft.id ? (await updateProgram(curStuId, body)).program : (await createProgram(curStuId, body)).program;
      setPrograms((prev) => {
        const list = (prev || []).filter((x) => x.id !== saved.id);
        return [...list, saved].sort((a, b) => a.id - b.id);
      });
      setProgramId(String(saved.id)); setDraft(null);
      toast(draft.id ? '기술 설정을 고쳤어요.' : '기술을 추가했어요 — 이제 회기를 기록하세요.');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function removeProgram() {
    if (!program) return;
    if (!window.confirm(`'${program.title}'과 이 기술의 기록을 모두 지울까요?`)) return;
    setBusy(true);
    try {
      await deleteProgram(curStuId, program.id);
      setPrograms((prev) => (prev || []).filter((x) => x.id !== program.id));
      setSessions((prev) => prev.filter((s) => String(s.program_id) !== String(program.id)));
      setProgramId('');
      toast('지웠어요.');
    } catch (e) { toast('삭제 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function saveSession() {
    if (!program) { toast('기술을 먼저 고르세요.'); return; }
    if (!live.n) { toast('점수를 매긴 기회가 없어요.'); return; }
    setBusy(true);
    try {
      const body = { kind: 'scale', program_id: program.id, date, phase, setting, codes: scores, note };
      let saved;
      if (editingId) {
        saved = (await updateSession(curStuId, { ...body, id: editingId })).session;
        setSessions((prev) => prev.map((s) => (s.id === editingId ? saved : s)));
      } else {
        saved = (await createSession(curStuId, body)).session;
        setSessions((prev) => [...prev, saved].sort((a, b) => (a.date + String(a.session_no).padStart(3, '0')).localeCompare(b.date + String(b.session_no).padStart(3, '0'))));
      }
      const r = scoreBstSession(saved.codes);
      toast(`${saved.date} ${saved.session_no}회기 ${editingId ? '고침' : '저장'} · ${settingLabel(saved.chain_type)} 평균 ${r.avg}점 · 스스로 ${r.topRate}%`);
      setEditingId(null); setNote(''); setScores(normalizeScores([], trials));
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function removeSession() {
    if (!editingId) return;
    if (!window.confirm('이 회기 기록을 지울까요?')) return;
    try {
      await deleteSession(curStuId, editingId);
      setSessions((prev) => prev.filter((s) => s.id !== editingId));
      resetForm(mine.filter((s) => s.id !== editingId));
      toast('지웠어요.');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  function copySummary() {
    const text = bstSummaryText(recent);
    if (!text) { toast('아직 실제 상황 기록이 없어요.'); return; }
    navigator.clipboard?.writeText(text)
      .then(() => toast('평가 칸에 붙여 넣을 요약을 복사했어요.'))
      .catch(() => toast('복사하지 못했어요: ' + text));
  }

  if (!curStuId) return null;
  if (programs === null) return <div className="card">불러오는 중…</div>;

  const goalTitle = (id) => goals.find((g) => String(g.id) === String(id))?.semester_goal || '';

  return (
    <>
      <div className="card" data-help="mon-scale-program">
        <div className="card-title">📶 5점 척도 기록 (행동기술훈련 · BST)</div>
        <div className="card-subtitle">
          기술 하나를 정해 두고 <strong>실제 상황</strong>에서 기회마다 5~1점을 매깁니다.
          도달 기준은 {scaleMasteryText({ score: BST_TOP, runs })}예요. 역할극은 연습 기록으로만 남습니다.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="stu-select" value={programId} onChange={(e) => { setProgramId(e.target.value); setDraft(null); }} aria-label="기술 고르기">
            <option value="">기술 고르기…</option>
            {(programs || []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}{p.status === 'closed' ? ' · 종료' : ''}</option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...blankProgram() })}>+ 기술 추가</button>
          {program && !draft && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...program, goal_id: program.goal_id || '', mastery: { runs } })}>⚙ 설정 고치기</button>
              <button type="button" className="btn btn-ghost btn-sm" data-help="mon-scale-copy" onClick={copySummary}>📋 평가 칸 요약 복사</button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={openGuide} onClick={() => setOpenGuide((v) => !v)}>
            점수 기준 {openGuide ? '▴' : '▾'}
          </button>
        </div>
        {program?.antecedent && !draft && (
          <div style={{ fontSize: '.84rem', color: 'var(--sub)', marginTop: 8 }}>
            <strong>점검 장면</strong> {program.antecedent}
            {program.goal_id ? ` · 연결 목표: ${goalTitle(program.goal_id)}` : ''}
          </div>
        )}
        {openGuide && (
          <div style={{ marginTop: 10, background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              {BST_SCALE.map((s) => (
                <div key={s.score} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, fontSize: '.86rem' }}>
                  <strong style={{ color: s.score === BST_TOP ? 'var(--pri)' : 'var(--sub)' }}>{s.score}</strong>
                  <span>{s.label} <span style={{ color: 'var(--muted)' }}>· {s.support}</span></span>
                </div>
              ))}
            </div>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: '.82rem', color: 'var(--sub)', lineHeight: 1.7 }}>
              {BST_SCORING_RULES.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>

      {draft && (
        <div className="card" data-help="mon-scale-editor">
          <div className="card-title">{draft.id ? '기술 설정 고치기' : '새 기술'}</div>
          <div className="form-group">
            <label className="form-label" htmlFor="sc-title">기술 이름</label>
            <input id="sc-title" className="form-input" value={draft.title} maxLength={200}
              placeholder="예: '싫어요' 말하고 선생님께 알리기"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sc-scene">점검 장면 (언제·어디서 보나)</label>
            <input id="sc-scene" className="form-input" value={draft.antecedent} maxLength={2000}
              placeholder={SCENE_EX[0]}
              onChange={(e) => setDraft({ ...draft, antecedent: e.target.value })} />
            <div className="qchip-area">
              {SCENE_EX.map((x) => (
                <button key={x} type="button" className="qchip" onClick={() => setDraft({ ...draft, antecedent: x })}>{x}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="sc-goal">연결할 IEP 목표 (선택)</label>
            <select id="sc-goal" className="form-input" value={draft.goal_id || ''} onChange={(e) => setDraft({ ...draft, goal_id: e.target.value })}>
              <option value="">연결 안 함</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.subject ? `[${g.subject}] ` : ''}{g.semester_goal}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">하루에 볼 기회 수</label>
            <div className="qchip-area">
              {SCALE_TRIAL_OPTIONS.map((n) => (
                <button key={n} type="button" className={'qchip' + (Number(draft.trials) === n ? ' on' : '')}
                  aria-pressed={Number(draft.trials) === n} onClick={() => setDraft({ ...draft, trials: n })}>{n}번</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">도달 기준 — {scaleMasteryText({ score: BST_TOP, runs: Number(draft.mastery?.runs) || 2 })}</label>
            <div className="qchip-area">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" className={'qchip' + ((Number(draft.mastery?.runs) || 2) === n ? ' on' : '')}
                  aria-pressed={(Number(draft.mastery?.runs) || 2) === n} onClick={() => setDraft({ ...draft, mastery: { runs: n } })}>{n}회기 연속</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-pri" disabled={busy} onClick={saveProgram}>저장</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>취소</button>
            {draft.id && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setDraft({ ...draft, status: draft.status === 'closed' ? 'active' : 'closed' })}>
                  {draft.status === 'closed' ? '다시 진행 중으로' : '종료로 표시'}
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--err)' }} disabled={busy} onClick={removeProgram}>기술 지우기</button>
              </>
            )}
          </div>
        </div>
      )}

      {program && !draft && (
        <>
          {reached && (
            <div className="card" style={{ background: 'var(--ok-l)', borderColor: 'var(--ok)' }}>
              ✅ 실제 상황에서 5점(스스로)이 {runs}회기 연속이에요 — 도달 기준을 채웠습니다. 유지·일반화 단계로 넘어가 보세요.
            </div>
          )}
          <div className="card" data-help="mon-scale-form">
            <div className="card-title">{editingId ? '회기 고치기' : '회기 기록'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="sc-date">날짜</label>
                <input id="sc-date" type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ minWidth: 150 }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <span className="form-label">단계</span>
                <div className="qchip-area" role="group" aria-label="단계">
                  {PHASES.map((p) => (
                    <button key={p.k} type="button" className={'qchip' + (phase === p.k ? ' on' : '')} aria-pressed={phase === p.k} onClick={() => setPhase(p.k)}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <span className="form-label">장면</span>
                <div className="qchip-area" role="group" aria-label="장면">
                  {BST_SETTINGS.map((s) => (
                    <button key={s.k} type="button" className={'qchip' + (setting === s.k ? ' on' : '')} aria-pressed={setting === s.k} onClick={() => setSetting(s.k)}
                      title={s.judge ? '도달 판정에 쓰는 장면' : '연습 기록 — 판정에는 쓰지 않아요'}>{s.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {scores.map((v, i) => (
                <div key={i} data-help="mon-scale-trial" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '.84rem', minWidth: 52 }}>{i + 1}번째</strong>
                  {BST_SCALE.map((s) => (
                    <button key={s.score} type="button"
                      className={'qchip' + (v === s.score ? ' on' : '')}
                      aria-pressed={v === s.score}
                      title={`${s.label} · ${s.support}`}
                      onClick={() => setScores((prev) => prev.map((x, j) => (j === i ? (x === s.score ? '' : s.score) : x)))}>
                      {s.score} {s.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScores((prev) => [...prev, ''])}>+ 기회 추가</button>
              {scores.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScores((prev) => prev.slice(0, -1))}>− 기회 빼기</button>
              )}
              <span style={{ fontSize: '.84rem', color: 'var(--sub)' }}>
                {live.n ? `기회 ${live.n}번 · 평균 ${live.avg}점 · 스스로(5점) ${live.topRate}%` : '점수를 매겨 주세요'}
              </span>
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="form-label" htmlFor="sc-note">메모 (선택)</label>
              <input id="sc-note" className="form-input" value={note} maxLength={2000} placeholder="예: 친구가 옆에 있을 때는 스스로 함"
                onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-pri" data-help="mon-session-save" disabled={busy} onClick={saveSession}>{editingId ? '고치기' : '저장'}</button>
              {editingId && <button type="button" className="btn btn-ghost" onClick={() => resetForm()}>새 회기로</button>}
              {editingId && <button type="button" className="btn btn-ghost" style={{ color: 'var(--err)' }} onClick={removeSession}>이 회기 지우기</button>}
            </div>
          </div>

          <div className="card" data-help="mon-scale-table">
            <div className="card-title">기록 ({mine.length}회기)</div>
            {!mine.length && <div className="card-subtitle">아직 기록이 없어요. 위에서 첫 회기를 저장해 보세요.</div>}
            {!!mine.length && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>날짜</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>단계</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>장면</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>점수</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>평균</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>스스로</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...mine].reverse().map((s) => {
                      const r = scoreBstSession(s.codes);
                      return (
                        <tr key={s.id} data-help="mon-scale-row" style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{s.date} <span style={{ color: 'var(--muted)' }}>{s.session_no}회기</span></td>
                          <td style={{ padding: '6px 8px' }}>{phaseLabel(s.phase)}</td>
                          <td style={{ padding: '6px 8px' }}>{settingLabel(s.chain_type)}</td>
                          <td style={{ padding: '6px 8px' }}>{(s.codes || []).filter((x) => x !== '' && x !== null).join(' · ')}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.avg ?? '-'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.topRate === null ? '-' : `${r.topRate}%`}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => editSession(s)}>고치기</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!program && !draft && (
        <div className="card">
          <div className="card-subtitle">
            행동기술훈련(BST)으로 가르치는 기술을 하나 추가하면 회기를 기록할 수 있어요.
            예: 안전한 생활·대인 관계처럼 상황 속에서 판단하고 주고받는 기술.
          </div>
        </div>
      )}
    </>
  );
}
