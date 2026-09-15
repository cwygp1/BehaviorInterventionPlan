import { useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { fetchCalendar } from '../../lib/api/calendar';
import { KINDS, CAL_VIEW_KEY } from '../../lib/calendarKinds';
import { addDays, dow, todayKst, WEEKDAY_KO } from '../../lib/utils/calendarRules';
import { holidayName } from '../../lib/utils/holidays';

// 0915(mds/33 P0): 홈 '이번 주 기록' 한 줄 띠 — 월~금 칸마다 기록 종류 점 + 빠진 날 빗금.
// 칸·칩을 누르면 그 날짜를 선택한 채로 기록 달력 화면으로 간다(CAL_VIEW_KEY로 전달).
// 학생이 없는 학급(샘플 체험 전)에서는 그리지 않는다 — 홈은 단순하게(mds/30).
export default function WeekStrip({ onNavigate }) {
  const { curClassId, students, studentsLoaded } = useStudents();
  const today = todayKst();
  const w = dow(today);
  const mon = addDays(today, w === 0 ? 1 : 1 - w); // 일요일이면 다가오는 주
  const fri = addDays(mon, 4);
  const [data, setData] = useState(null);

  const hasStudents = studentsLoaded && students.length > 0;
  useEffect(() => {
    if (!hasStudents) return undefined;
    let alive = true;
    fetchCalendar(mon, fri, curClassId).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, [hasStudents, mon, fri, curClassId]);

  if (!hasStudents || !data) return null;

  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  const missDates = [...new Set(data.missing.map((x) => x.date))];
  const code = (sid) => data.students.find((s) => s.id === sid)?.code || '';
  const open = (date) => {
    try { sessionStorage.setItem(CAL_VIEW_KEY, JSON.stringify({ month: date.slice(0, 7), sel: date })); } catch (_e) { /* noop */ }
    onNavigate('calendar');
  };
  const missText = data.missing.length
    ? `빠진 날 ${missDates.length}일 · ${data.missing.slice(0, 2).map((x) => `${code(x.studentId)} ${x.kind === 'cico' ? 'CICO' : '행동 데이터'} ${+x.date.slice(8)}일`).join(', ')}${data.missing.length > 2 ? ' 외' : ''}`
    : '';

  return (
    <div className="wk-strip" data-tour="week-strip">
      <div className="wk-k">📅 이번 주 기록<small>{+mon.slice(5, 7)}월 {+mon.slice(8)}일 – {+fri.slice(8)}일</small></div>
      <div className="wk-days">
        {days.map((d) => {
          const ev = data.events.filter((e) => e.date === d);
          const miss = data.missing.filter((x) => x.date === d);
          const kinds = [...new Set(ev.map((e) => e.kind))];
          const hol = holidayName(d);
          return (
            <button key={d} type="button" onClick={() => open(d)}
              className={'wk-d' + (d === today ? ' today' : '') + (miss.length ? ' miss' : '') + (d > today ? ' fut' : '')}
              title={`${ev.length}건${miss.length ? ` · 기록 없음 ${miss.map((x) => code(x.studentId)).join('·')}` : ''}${hol ? ' · ' + hol : ''}`}
              aria-label={`${+d.slice(8)}일 ${WEEKDAY_KO[dow(d)]}요일, 기록 ${ev.length}건${miss.length ? ', 빠진 기록 있음' : ''}`}>
              <span className="l">{WEEKDAY_KO[dow(d)]}{hol ? ' · 휴일' : ''}</span>
              <span className="n">{+d.slice(8)}</span>
              <span className="dots" aria-hidden="true">
                {kinds.slice(0, 5).map((k) => <i key={k} style={{ background: KINDS[k].color }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="wk-act">
        {missText
          ? <button type="button" className="wk-miss" onClick={() => open(data.missing[0].date)}>{missText}</button>
          : <span className="wk-ok">{data.events.length ? `이번 주 ${data.events.length}건 · 빠진 날 없음` : '이번 주 기록이 아직 없어요'}</span>}
        <button type="button" className="btn btn-pri btn-sm" onClick={() => open(today)}>달력 열기 →</button>
      </div>
    </div>
  );
}
