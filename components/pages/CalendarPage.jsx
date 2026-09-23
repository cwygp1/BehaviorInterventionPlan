import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { fetchCalendar } from '../../lib/api/calendar';
import { KINDS, KIND_ORDER, MISSING, PERIOD, CAL_VIEW_KEY, studentColor, goLabel } from '../../lib/calendarKinds';
import { monthGrid, shiftMonth, addDays, dow, todayKst, WEEKDAY_KO } from '../../lib/utils/calendarRules';
import { holidayName } from '../../lib/utils/holidays';
import { setEntryDate } from '../../lib/hooks/useEntryDate';

// 0915(mds/33 P0): 일정·기록 달력 — 이미 저장한 기록을 날짜별로 모아 보는 화면.
//   · 나이스 월간일정처럼 일~토 격자, 오늘 강조, 날짜를 누르면 오른쪽에 그날 기록.
//   · 새로 적는 칸 없음 — 항목을 누르면 그 학생을 선택하고 입력 화면으로 이동.
//   · 빠진 날(매일 기록 누락)은 빗금. 규칙은 lib/utils/calendarRules.js.
//   · 좁은 화면(≤720px)은 격자 대신 날짜 목록(CSS가 전환).
// 보던 달·선택한 날·고른 학생은 sessionStorage(CAL_VIEW_KEY)에 두어 입력 화면에 갔다 와도 그대로.
const KINDS_KEY = 'kb_cal_kinds';
const MAX_TAGS = 3;
// 날짜 패널 '기록하기' 칩 — 날짜 칸이 있는 입력 화면만(가정 통신은 날짜를 고르지 않음).
const ADD_KINDS = ['abc', 'mon', 'cico', 'sz', 'session'];

const readJson = (store, key) => { try { return JSON.parse(window[store].getItem(key) || 'null'); } catch (_e) { return null; } };
const writeJson = (store, key, v) => { try { window[store].setItem(key, JSON.stringify(v)); } catch (_e) { /* 사생활 모드 등 */ } };
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

export default function CalendarPage({ onNavigate }) {
  const { curClassId, curClass, selectStudent } = useStudents();
  const today = todayKst();
  // 보던 달·선택한 날 복원 — 로그인 뒤에만 그려지는 화면이라 첫 렌더에서 바로 읽는다(달 두 번 불러오기 방지).
  const [view] = useState(() => (typeof window === 'undefined' ? null : readJson('sessionStorage', CAL_VIEW_KEY)));
  const [month, setMonth] = useState(() => (/^\d{4}-\d{2}$/.test(view?.month || '') ? view.month : today.slice(0, 7)));
  const [sel, setSel] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(view?.sel || '') ? view.sel : today));
  const [stuSel, setStuSel] = useState(() => (typeof view?.stu === 'string' && view.stu ? view.stu : 'all'));
  const [kindsOn, setKindsOn] = useState(() => Object.fromEntries(KIND_ORDER.map((k) => [k, true])));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [iepAll, setIepAll] = useState(false); // 이달의 IEP 목표 — 기본 2줄, 더 보기로 전부

  // 종류 필터 복원(기기별)
  useEffect(() => {
    const k = readJson('localStorage', KINDS_KEY);
    if (k && typeof k === 'object') setKindsOn((cur) => ({ ...cur, ...k }));
  }, []);
  useEffect(() => { writeJson('sessionStorage', CAL_VIEW_KEY, { month, sel, stu: stuSel }); }, [month, sel, stuSel]);

  const grid = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchCalendar(grid.start, grid.end, curClassId));
    } catch (e) {
      setError(e.message || '불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  }, [grid.start, grid.end, curClassId]);
  useEffect(() => { load(); }, [load]);

  const students = data?.students || [];
  const stuIdx = useMemo(() => Object.fromEntries(students.map((s, i) => [s.id, i])), [students]);
  const stuCode = (sid) => students[stuIdx[sid]]?.code || '';
  // 학생 필터가 이 학급에 없는 학생을 가리키면(학급 전환) 전체로.
  useEffect(() => { if (stuSel !== 'all' && data && stuIdx[stuSel] === undefined) setStuSel('all'); }, [data, stuIdx, stuSel]);

  const stuOk = useCallback((sid) => stuSel === 'all' || stuSel === sid, [stuSel]);
  const byDate = useMemo(() => {
    const m = {};
    const slot = (d) => (m[d] = m[d] || { ev: [], miss: [] });
    (data?.events || []).forEach((e) => { if (stuOk(e.studentId) && kindsOn[e.kind]) slot(e.date).ev.push(e); });
    (data?.missing || []).forEach((x) => {
      const kindOn = x.kind === 'cico' ? kindsOn.cico : kindsOn.mon;
      if (stuOk(x.studentId) && kindOn) slot(x.date).miss.push(x);
    });
    return m;
  }, [data, stuOk, kindsOn]);
  const periods = useMemo(() => (data?.periods || []).filter((p) => stuOk(p.studentId) && PERIOD[p.tier]), [data, stuOk]);
  const periodsOn = (d) => periods.filter((p) => d >= p.start && d <= (p.end || today));

  const inMonth = (d) => d.slice(0, 7) === month;
  const monthEvents = (data?.events || []).filter((e) => inMonth(e.date) && stuOk(e.studentId) && kindsOn[e.kind]);
  const monthMissDays = new Set(Object.entries(byDate).filter(([d, v]) => inMonth(d) && v.miss.length).map(([d]) => d)).size;
  const openPeriods = periods.filter((p) => !p.end || p.end >= today).length;
  const iepLines = (data?.iepMonthly || []).filter((g) => stuOk(g.studentId));

  const days = [];
  for (let d = grid.start; d <= grid.end; d = addDays(d, 1)) days.push(d);

  // 항목 → 그 학생 선택 + (entry가 있으면) 이 날짜를 입력 화면 날짜 칸으로 넘기고 이동.
  const go = async (sid, page, monitorTab, entry) => {
    if (sid) await selectStudent(Number(sid));
    if (entry) setEntryDate(entry, sel);
    if (monitorTab) { try { sessionStorage.setItem('kb_monitor_tab', monitorTab); } catch (_e) { /* noop */ } }
    onNavigate(page);
  };
  // 한 줄 배치(≤1100px)에서는 날짜 패널이 목록 아래라, 누르면 패널로 스크롤한다.
  const dayRef = useRef(null);
  const pickDay = (d) => {
    setSel(d);
    if (!inMonth(d)) setMonth(d.slice(0, 7));
    try {
      if (window.matchMedia('(max-width: 1100px)').matches) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(() => dayRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }), 0);
      }
    } catch (_e) { /* noop */ }
  };
  const toggleKind = (k) => setKindsOn((cur) => { const next = { ...cur, [k]: !cur[k] }; writeJson('localStorage', KINDS_KEY, next); return next; });

  const Dot = ({ sid }) => <span className="cal-dot" style={{ background: studentColor(stuIdx[sid] ?? 0) }} aria-hidden="true" />;
  const Tag = ({ e }) => {
    const k = KINDS[e.kind];
    return (
      <span className={'cal-tag' + (k.warn ? ' warn' : '')} style={{ '--c': k.color, '--cs': k.soft }} title={`${stuCode(e.studentId)} · ${k.label}`}>
        {stuSel === 'all' && <Dot sid={e.studentId} />}{k.tag(e)}
      </span>
    );
  };
  // 칸 이름표: 한 학생만 보면 기록마다 1개. '전체'에서는 같은 종류를 묶어 'ABC 9 · 5명'(학생 1명이면 그 학생 이름표 그대로).
  const cellTags = (ev) => {
    if (stuSel !== 'all') return ev.map((e, i) => <Tag key={i} e={e} />);
    const groups = KIND_ORDER.map((k) => ev.filter((e) => e.kind === k)).filter((g) => g.length);
    return groups.map((g) => {
      if (g.length === 1) return <Tag key={g[0].kind} e={g[0]} />;
      const k = KINDS[g[0].kind];
      const sum = g.reduce((a, e) => a + (e.n || 0), 0);
      const text = g[0].kind === 'abc' ? `ABC ${sum} · ${g.length}명` : `${k.label} ${g.length}명`;
      return (
        <span key={g[0].kind} className={'cal-tag' + (k.warn ? ' warn' : '')} style={{ '--c': k.color, '--cs': k.soft }}
          title={g.map((e) => `${stuCode(e.studentId)} ${k.tag(e)}`).join(', ')}>{text}</span>
      );
    });
  };
  const missNames = (list) => {
    const names = [...new Set(list.map((x) => stuCode(x.studentId)))];
    return names.length > 1 ? `${names[0]} 외 ${names.length - 1}명` : names[0] || '';
  };

  const selSlot = byDate[sel] || { ev: [], miss: [] };
  const selIds = [...new Set([...selSlot.miss.map((x) => x.studentId), ...selSlot.ev.map((e) => e.studentId)])]
    .sort((a, b) => (stuIdx[a] ?? 0) - (stuIdx[b] ?? 0));
  const selPeriods = periodsOn(sel);
  const selW = dow(sel);

  const [y, m] = month.split('-').map(Number);

  return (
    <div className="cal-page">
      <div className="cal-bar">
        <div className="cal-mnav" data-help="cal-month">
          <button type="button" className="cal-arrow" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
          <h3>{y}년 {m}월</h3>
          <button type="button" className="cal-arrow" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMonth(today.slice(0, 7)); setSel(today); }}>오늘</button>
        </div>
        {data && (
          <div className="cal-stat" data-help="cal-stat">
            <span>{curClass ? `${curClass.name} · ` : ''}{m}월 기록 <b>{monthEvents.length}</b>건</span>
            <span className={monthMissDays ? 'w' : ''}>빠진 날 {monthMissDays}일</span>
            <span>진행 중 관찰 기간 <b>{openPeriods}</b>개</span>
          </div>
        )}
      </div>

      {students.length > 0 && (
        <div className="cal-filters">
          <div className="cal-fg" role="group" aria-label="학생 고르기" data-help="cal-stu-filter">
            <em>학생</em>
            <button type="button" className="cal-chip" aria-pressed={stuSel === 'all'} onClick={() => setStuSel('all')}>전체</button>
            {students.map((s) => (
              <button key={s.id} type="button" className="cal-chip" aria-pressed={stuSel === s.id} onClick={() => setStuSel(s.id)}>
                <Dot sid={s.id} />{s.code}
              </button>
            ))}
          </div>
          <div className="cal-fg" role="group" aria-label="보여줄 기록 종류" data-help="cal-kind-filter">
            <em>기록</em>
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" className="cal-chip kind" aria-pressed={!!kindsOn[k]} onClick={() => toggleKind(k)} title={kindsOn[k] ? '누르면 숨겨요' : '누르면 보여요'}>
                <span className="cal-sw" style={{ background: KINDS[k].color }} aria-hidden="true" />{KINDS[k].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {iepLines.length > 0 && (
        <div className="cal-iep" data-help="cal-iep">
          <span className="k">이달의 IEP 목표</span>
          <ul>
            {(iepAll ? iepLines : iepLines.slice(0, 2)).map((g, i) => (
              <li key={i} data-help="cal-iep-row">
                <button type="button" onClick={() => go(g.studentId, 'iep')} title={`${goLabel('iep')} 열기`}>
                  <Dot sid={g.studentId} /><b>{stuCode(g.studentId)}</b>{g.subject ? ` · ${g.subject}` : ''} — {g.text}
                </button>
              </li>
            ))}
            {iepLines.length > 2 && (
              <li><button type="button" className="more" onClick={() => setIepAll((o) => !o)}>{iepAll ? '접기' : `외 ${iepLines.length - 2}개 더 보기`}</button></li>
            )}
          </ul>
        </div>
      )}

      {error && (
        <div className="card cal-empty">
          달력을 불러오지 못했어요: {error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>다시 시도</button>
        </div>
      )}
      {!error && data && students.length === 0 && (
        <div className="card cal-empty">
          이 학급에 등록된 학생이 없어요. 학생을 등록하고 기록을 저장하면 날짜별로 여기에 모여요.
          <button type="button" className="btn btn-pri btn-sm" onClick={() => onNavigate('students')}>{goLabel('students')} →</button>
        </div>
      )}

      <div className={'cal-split' + (loading ? ' is-loading' : '')} aria-busy={loading}>
        <div>
          <div className="cal-grid-wrap" data-help="cal-grid">
            <div className="cal-dow" aria-hidden="true">{WEEKDAY_KO.map((w) => <div key={w}>{w}</div>)}</div>
            <div className="cal-grid">
              {days.map((d) => {
                const w = dow(d);
                const slot = byDate[d] || { ev: [], miss: [] };
                const hol = holidayName(d);
                const pr = periodsOn(d);
                const starts = pr.filter((p) => p.start === d);
                const cls = ['cal-cell', inMonth(d) ? '' : 'out', w === 0 || hol ? 'sun' : '', w === 6 && !hol ? 'sat' : '',
                  d === today ? 'today' : '', d === sel ? 'sel' : '', slot.miss.length ? 'miss' : ''].filter(Boolean).join(' ');
                return (
                  <button key={d} type="button" className={cls} onClick={() => pickDay(d)} aria-pressed={d === sel} data-help="cal-cell"
                    aria-label={`${+d.slice(5, 7)}월 ${+d.slice(8)}일 ${WEEKDAY_KO[w]}요일${hol ? ' ' + hol : ''}, 기록 ${slot.ev.length}건${slot.miss.length ? ', 빠진 기록 ' + slot.miss.length + '건' : ''}`}>
                    <span className="cal-dn">
                      <span className="num">{+d.slice(8)}</span>
                      {hol && <small>{hol}</small>}
                      {d === today && <small className="t">오늘</small>}
                    </span>
                    {(() => { const tags = cellTags(slot.ev); return (
                      <>{tags.slice(0, MAX_TAGS)}{tags.length > MAX_TAGS && <span className="cal-more">+{tags.length - MAX_TAGS}</span>}</>
                    ); })()}
                    {slot.miss.length > 0 && <span className="cal-misslbl">기록 없음 · {missNames(slot.miss)}</span>}
                    {starts.length > 0 && (
                      <span className="cal-bandlbl">{starts.map((p) => `${stuSel === 'all' ? stuCode(p.studentId) + ' ' : ''}${PERIOD[p.tier].label}`).join(' / ')} 시작</span>
                    )}
                    {pr.length > 0 && (
                      <span className="cal-bands" aria-hidden="true">
                        {pr.map((p, i) => (
                          <i key={i} style={{ background: PERIOD[p.tier].color }}
                            className={(p.start === d ? 's ' : '') + ((p.end || today) === d ? 'e' : '')} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 좁은 화면용 날짜 목록 — 기록·빠진 날·공휴일·오늘만 */}
          <div className="cal-agenda">
            {days.filter((d) => inMonth(d) && ((byDate[d] && (byDate[d].ev.length || byDate[d].miss.length)) || d === today || holidayName(d))).map((d) => {
              const w = dow(d);
              const slot = byDate[d] || { ev: [], miss: [] };
              return (
                <button key={d} type="button" className={'cal-ag' + (d === sel ? ' sel' : '') + (slot.miss.length ? ' miss' : '')} onClick={() => pickDay(d)} aria-pressed={d === sel}>
                  <span className={'d' + (w === 0 || holidayName(d) ? ' sun' : w === 6 ? ' sat' : '')}>
                    {+d.slice(8)}<small>{WEEKDAY_KO[w]}{d === today ? ' · 오늘' : ''}{holidayName(d) ? ' · ' + holidayName(d) : ''}</small>
                  </span>
                  <span className="ts">
                    {cellTags(slot.ev)}
                    {slot.miss.length > 0 && <span className="cal-misslbl">기록 없음 · {missNames(slot.miss)}</span>}
                    {!slot.ev.length && !slot.miss.length && <span className="cal-more">기록 없음</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="cal-legend">
            칸 아래 띠 = 관찰 기간 ({Object.values(PERIOD).map((p) => (
              <span key={p.label}><i style={{ background: p.color }} aria-hidden="true" />{p.label}</span>
            ))}) · 빗금 = 매일 해야 하는 기록(CICO, 관찰 기간의 행동 데이터)이 없는 지난 평일
          </p>
        </div>

        <aside className="cal-day" aria-live="polite" ref={dayRef} data-help="cal-day">
          <h4>
            {+sel.slice(5, 7)}월 {+sel.slice(8)}일 ({WEEKDAY_KO[selW]})
            {sel === today && <small>오늘</small>}
            {holidayName(sel) && <small className="hol">{holidayName(sel)}</small>}
          </h4>
          {selIds.length === 0 && (
            <div className="cal-day-empty">
              {sel > today ? '아직 오지 않은 날이에요.'
                : holidayName(sel) ? '공휴일이라 빠진 날로 치지 않아요.'
                  : selW === 0 || selW === 6 ? '주말이에요.'
                    : '이날 저장한 기록이 없어요.'}
            </div>
          )}
          {selIds.map((sid) => (
            <div className="cal-grp" key={sid}>
              <div className="cal-grp-h"><Dot sid={sid} />{stuCode(sid)}</div>
              {selSlot.miss.filter((x) => x.studentId === sid).map((x, i) => (
                <div className="cal-row miss" key={'m' + i} data-help="cal-miss-row">
                  <span className="kc" style={{ '--c': '#b7791f', '--cs': '#fff7e6' }}>기록 없음</span>
                  <p>{MISSING[x.kind].text}</p>
                  <button type="button" className="go" onClick={() => go(sid, MISSING[x.kind].page, MISSING[x.kind].monitorTab, MISSING[x.kind].entry)}>
                    {goLabel(MISSING[x.kind].page)}에서 {md(sel)} 입력 →
                  </button>
                </div>
              ))}
              {selSlot.ev.filter((e) => e.studentId === sid).map((e, i) => {
                const k = KINDS[e.kind];
                return (
                  <div className="cal-row" key={'e' + i} data-help="cal-rec-row">
                    <span className="kc" style={{ '--c': k.color, '--cs': k.soft }}>{k.label}</span>
                    <p>{k.detail(e)}</p>
                    <button type="button" className="go" onClick={() => go(sid, k.page, k.monitorTab, k.entry)}>{goLabel(k.page)}{k.entry ? ` · ${md(sel)}` : ''} 열기 →</button>
                  </div>
                );
              })}
            </div>
          ))}
          {/* 이 날짜로 새 기록 — 한 학생을 골랐을 때만(누구의 기록인지 분명해야 함). 미래 날짜는 제외. */}
          {sel <= today && (stuSel !== 'all' ? (
            <div className="cal-add" data-help="cal-add">
              <span className="k">{stuCode(stuSel)} · {md(sel)} 기록하기</span>
              {ADD_KINDS.map((k) => (
                <button key={k} type="button" className="cal-chip" onClick={() => go(stuSel, KINDS[k].page, KINDS[k].monitorTab, KINDS[k].entry)}>
                  <span className="cal-sw" style={{ background: KINDS[k].color }} aria-hidden="true" />{KINDS[k].label}
                </button>
              ))}
            </div>
          ) : students.length > 0 && (
            <div className="cal-add-hint">위에서 학생을 고르면 이 날짜로 바로 기록할 수 있어요.</div>
          ))}
          {selPeriods.length > 0 && (
            <div className="cal-pnote" data-help="cal-period">
              관찰 기간:{' '}
              {selPeriods.map((p, i) => (
                <button key={i} type="button" onClick={() => go(p.studentId, 'eval')} title={`${goLabel('eval')} 열기`}>
                  {stuSel === 'all' ? stuCode(p.studentId) + ' ' : ''}{PERIOD[p.tier].label} ({md(p.start)}~{p.end ? md(p.end) : '진행 중'})
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
