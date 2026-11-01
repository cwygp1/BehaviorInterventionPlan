import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { api } from '../../lib/api/client';
import { saveCICO } from '../../lib/api/students';
import { todayKst } from '../../lib/utils/calendarRules';
import { invalidateDashboard } from '../pages/dash/DashBits';
import { SCORES, SCORE_LABELS, defaultPeriods, readPeriodData, announceCicoSaved, CICO_SAVED_EVENT } from '../record/CicoRowForm';

// 우리 반 > 매일 점검표 — 소그룹 학생을 한 표에서(학생 × 교시 점수 알약, 프로토타입 7장, mds/52 §6 ①CICO).
//   읽기: GET /api/cico?class_id=&date= (그날 행 + 그 전 마지막 행의 교시·목표 틀) 한 번.
//   저장: 학생별 기존 POST /api/students/{id}/cico 업서트 그대로(saveCICO) — 본문 모양도 Tier2Page 폼과 같다
//         (date·goals·periods·scores{교시:{score,comment}}·check_in_time·check_out_time·comment). 점수는 기존 0~3점.
//   한 행 = 1행 업서트라 자동 저장(입력이 멎고 1.2초 뒤) + 칸 옆 '✓ 저장됨'. 실패하면 그 줄에 '저장 안 됨 — 다시 시도'.
//   교시·목표·소그룹 구성은 아래 기존 화면(소그룹·목표 설정)에서 바꾼다. 새 날은 목표·교시를 지난번 것으로 잇는다.

const SAVE_DELAY = 1200;
const fmtHM = () => { try { return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (_e) { return '방금'; } };

function cleanScores(periods, scores) {
  const out = {};
  periods.forEach((p) => {
    const d = readPeriodData(scores, p);
    if (d.score != null || (d.comment && d.comment.trim())) out[p] = { score: d.score, comment: d.comment || '' };
  });
  return out;
}

export default function ClassCicoTable({ onNavigate }) {
  const { curClassId, curSemester, tier2Groups, allStudents, studentDataCache, updateStudentData } = useStudents();
  const groups = useMemo(() => tier2Groups.filter((g) => Number(g.semester || curSemester) === Number(curSemester)), [tier2Groups, curSemester]);
  const [groupId, setGroupId] = useState(null);
  const [date, setDate] = useState(() => todayKst());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState({}); // sid → { periods, goals, scores, check_in_time, check_out_time, comment, exists }
  const [status, setStatus] = useState({}); // sid → 'saving' | 'HH:MM' | 'error' | 'pending'
  const timers = useRef({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (groupId && groups.some((g) => g.id === groupId)) return;
    setGroupId(groups[0] ? groups[0].id : null);
  }, [groups, groupId]);
  const group = groups.find((g) => g.id === groupId) || null;
  const members = useMemo(() => (group ? (group.members || []).map((m) => allStudents.find((s) => s.id === m.student_id)).filter(Boolean) : []), [group, allStudents]);

  const load = useCallback(async () => {
    if (!curClassId) return;
    setLoading(true); setError('');
    try {
      const d = await api(`/api/cico?class_id=${curClassId}&date=${date}`);
      const rec = Object.fromEntries((d.records || []).map((r) => [r.student_id, r]));
      const last = Object.fromEntries((d.last || []).map((r) => [r.student_id, r]));
      const next = {};
      allStudents.filter((s) => s.class_id === curClassId).forEach((s) => {
        const r = rec[s.id];
        if (r) {
          next[s.id] = {
            exists: true, goals: r.goals || [], scores: r.scores || {},
            periods: r.periods?.length ? r.periods : Object.keys(r.scores || {}).filter((k) => k !== '_periods'),
            check_in_time: r.check_in_time || '', check_out_time: r.check_out_time || '', comment: r.comment || '',
          };
        } else {
          const l = last[s.id];
          next[s.id] = {
            exists: false, goals: Array.isArray(l?.goals) ? l.goals : [], scores: {},
            periods: l?.periods?.length ? l.periods : defaultPeriods(s.level),
            check_in_time: '', check_out_time: '', comment: '',
          };
        }
      });
      setRows(next); setStatus({});
    } catch (e) {
      setError(e.message || '점검표를 불러오지 못했어요');
    } finally { setLoading(false); }
  }, [curClassId, date, allStudents]);
  useEffect(() => { load(); }, [load]);

  // 아래 기존 화면(학생 한 명 폼)이나 빠른 기록 창이 같은 날을 저장하면 그 줄을 새 값으로(고치는 중이 아니면).
  useEffect(() => {
    const h = (e) => {
      const d = e.detail || {};
      if (d.from === 'class-table' || d.date !== date || !d.record) return;
      if (status[d.sid] === 'pending' || status[d.sid] === 'saving') return;
      const r = d.record;
      setRows((prev) => ({ ...prev, [d.sid]: { exists: true, goals: r.goals || [], scores: r.scores || {}, periods: r.periods?.length ? r.periods : (prev[d.sid]?.periods || []), check_in_time: r.check_in_time || '', check_out_time: r.check_out_time || '', comment: r.comment || '' } }));
    };
    window.addEventListener(CICO_SAVED_EVENT, h);
    return () => window.removeEventListener(CICO_SAVED_EVENT, h);
  }, [date, status]);

  // 떠날 때 기다리던 저장은 바로 보낸다(그때의 날짜·값으로 — saveRowRef가 마지막 렌더의 함수).
  const saveRowRef = useRef(null);
  useEffect(() => () => { Object.keys(timers.current).forEach((sid) => { clearTimeout(timers.current[sid]); if (saveRowRef.current) saveRowRef.current(Number(sid), true); }); }, []);
  function flushPending() {
    Object.keys(timers.current).forEach((sid) => { clearTimeout(timers.current[sid]); saveRow(Number(sid), false); });
  }

  async function saveRow(sid, quiet) {
    const r = rowsRef.current[sid];
    if (!r) return;
    delete timers.current[sid];
    if (!quiet) setStatus((s) => ({ ...s, [sid]: 'saving' }));
    try {
      const res = await saveCICO(sid, {
        date, goals: r.goals, periods: r.periods, scores: cleanScores(r.periods, r.scores),
        check_in_time: r.check_in_time, check_out_time: r.check_out_time, comment: r.comment,
      });
      if (studentDataCache[sid]) {
        updateStudentData(sid, (cur) => {
          const others = (cur.cico || []).filter((x) => x.date !== date);
          return { ...cur, cico: [res.record, ...others].sort((a, b) => (b.date || '').localeCompare(a.date || '')) };
        });
      }
      invalidateDashboard();
      announceCicoSaved({ sid, date, record: res.record, from: 'class-table' });
      if (!quiet) setStatus((s) => ({ ...s, [sid]: fmtHM() }));
    } catch (_e) {
      if (!quiet) setStatus((s) => ({ ...s, [sid]: 'error' }));
    }
  }

  saveRowRef.current = saveRow;

  function setScore(sid, period, val) {
    setRows((prev) => {
      const r = prev[sid];
      const cur = readPeriodData(r.scores, period);
      const scores = { ...r.scores, [period]: { score: cur.score === val ? null : val, comment: cur.comment } };
      return { ...prev, [sid]: { ...r, scores } };
    });
    setStatus((s) => ({ ...s, [sid]: 'pending' }));
    clearTimeout(timers.current[sid]);
    timers.current[sid] = setTimeout(() => saveRow(sid, false), SAVE_DELAY);
  }

  // 표의 열 — 첫 학생의 교시 순서에 나머지 학생의 교시를 덧붙인다(학생마다 교시 구성이 다를 수 있음).
  const cols = useMemo(() => {
    const out = [];
    members.forEach((s) => (rows[s.id]?.periods || []).forEach((p) => { if (!out.includes(p)) out.push(p); }));
    return out;
  }, [members, rows]);

  if (!curClassId) return null;

  return (
    <div className="kb-stack" style={{ marginBottom: 24 }} data-tour="class-cico-table">
      <div className="kb-today-head">
        <h2 className="kb-h3">매일 점검표 <span className="kb-small">(CICO · 아침 목표 확인 → 교시별 점수 → 하교 때 함께 보기)</span></h2>
        <span className="kb-muted">소그룹 학생을 오늘 한 표에서 모두</span>
      </div>
      {groups.length === 0 ? (
        <div className="kb-card">
          <div className="kb-muted">이번 학기 소그룹이 아직 없어요. 아래 ‘소그룹·목표 설정’에서 소그룹을 만들고 학생을 넣으면 여기 표가 생겨요.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {groups.length > 1 && (
              <div className="kb-q-field">
                <span className="kb-q-lb" id="kb-cg-lb">소그룹</span>
                <div className="kb-q-grp" role="radiogroup" aria-labelledby="kb-cg-lb">
                  {groups.map((g) => (
                    <button key={g.id} type="button" role="radio" aria-checked={g.id === groupId} className="kb-pill" onClick={() => { flushPending(); setGroupId(g.id); }}>{g.name}</button>
                  ))}
                </div>
              </div>
            )}
            {groups.length === 1 && <div className="kb-muted">소그룹 ‘{groups[0].name}’</div>}
            <div className="kb-q-field">
              <label className="kb-q-lb" htmlFor="kb-cg-date">날짜</label>
              <input id="kb-cg-date" type="date" className="kb-input" value={date} onChange={(e) => { flushPending(); setDate(e.target.value); }} />
            </div>
          </div>
          <div className="kb-q-banner" id="kb-cg-desc">점수: 3 매우 잘함 · 2 잘함 · 1 노력 필요 · 0 못함. 누르면 잠시 뒤 저절로 저장돼요(같은 점수를 한 번 더 누르면 지워져요).</div>
          {error && <div className="kb-strip kb-err" role="alert">{error} <button type="button" className="kb-btn" onClick={load}>다시 불러오기</button></div>}
          {members.length === 0 ? (
            <div className="kb-card"><div className="kb-muted">이 소그룹에 학생이 없어요. 아래에서 학생을 넣어 주세요.</div></div>
          ) : loading && !Object.keys(rows).length ? (
            <div className="kb-loading">점검표를 불러오는 중…</div>
          ) : (
            <div className="kb-ctable" aria-describedby="kb-cg-desc">
              <table>
                <thead>
                  <tr>
                    <th scope="col" style={{ textAlign: 'left' }}>학생</th>
                    {cols.map((c) => <th key={c} scope="col">{c}</th>)}
                    <th scope="col">합계 · 저장</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((s) => {
                    const r = rows[s.id];
                    if (!r) return null;
                    const filled = r.periods.map((p) => readPeriodData(r.scores, p)).filter((d) => d.score != null);
                    const total = filled.reduce((a, d) => a + (Number(d.score) || 0), 0);
                    const max = filled.length * 3;
                    const st = status[s.id];
                    return (
                      <tr key={s.id}>
                        <th scope="row">
                          <button type="button" className="kb-nm" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, cursor: 'pointer', color: 'var(--kb-ink)' }} onClick={() => onNavigate(`#student/${s.id}/record`)}>{s.code}</button>
                        </th>
                        {cols.map((p) => {
                          if (!r.periods.includes(p)) return <td key={p} aria-label={`${s.code} ${p} 없음`}>—</td>;
                          const d = readPeriodData(r.scores, p);
                          return (
                            <td key={p}>
                              <div className="kb-q-grp" role="radiogroup" aria-label={`${s.code} ${p}`}>
                                {[...SCORES].reverse().map((v) => (
                                  <button key={v} type="button" role="radio" aria-checked={d.score === v} className="kb-pill" aria-label={`${s.code} ${p} ${v}점 ${SCORE_LABELS[v]}`} onClick={() => setScore(s.id, p, v)}>{v}</button>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                        <td className="kb-sum">
                          {max ? `${total}/${max} · ${Math.round((total / max) * 100)}%` : '—'}
                          <div aria-live="polite">
                            {st === 'pending' ? '입력 중…' : st === 'saving' ? '저장 중…' : st === 'error' ? (
                              <button type="button" className="kb-btn" onClick={() => saveRow(s.id, false)}>저장 안 됨 — 다시 시도</button>
                            ) : st ? `✓ ${st} 저장됨` : (r.exists ? '✓ 저장됨' : '')}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <h2 className="kb-h3" style={{ marginTop: 8 }}>소그룹·목표 설정 · 한 학생 자세히</h2>
    </div>
  );
}
