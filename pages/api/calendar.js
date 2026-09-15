import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { ensureSchema } from '../../lib/ensureSchema';
import { addDays, daysBetween, isIsoDate, todayKst, missingDays, semesterOf, monthlyGoalText } from '../../lib/utils/calendarRules';

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&class_id=
// 0915(mds/33 P0): 이미 저장된 날짜 기록을 달력용으로 모아 내려준다. 새 테이블 없음.
//   students   [{ id, code }]
//   events     [{ date, studentId, kind, n, info }]   kind: abc | mon | sz | fid | cico | letter | session
//   periods    [{ studentId, tier, start, end }]      관찰 기간(end=null이면 진행 중)
//   missing    [{ date, studentId, kind }]            빠진 날(규칙은 lib/utils/calendarRules.js)
//   iepMonthly [{ studentId, subject, text }]         조회 범위 가운데 날짜가 속한 달의 IEP 월별 목표
//   today
// 성능: @vercel/postgres는 쿼리 1개 = 왕복 1번 → 기록 UNION 1개 + 학생·기간·IEP 1개 + 회기 기록 1개를 병렬로.
// 빠진 날 판정에 앞 기록이 필요해 기록 쿼리는 from보다 LOOKBACK일 앞에서부터 읽고, 응답 events는 from~to만.

const LOOKBACK = 30;
const MAX_RANGE = 62;

let ensurePromise = null;
async function ensureOnce() {
  if (!ensurePromise) ensurePromise = ensureSchema().catch((err) => { ensurePromise = null; throw err; });
  return ensurePromise;
}

async function runQueries(userId, classId, readFrom, to, schoolYear, semester) {
  const qEvents = sql`
    SELECT 'abc' AS kind, a.student_id AS sid, to_char(a.date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n,
           json_build_object('beh', (array_agg(a.behavior ORDER BY a.id))[1]) AS info
      FROM abc_records a JOIN students s ON s.id = a.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND a.date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY a.student_id, a.date
    UNION ALL
    SELECT 'mon', m.student_id, to_char(m.date, 'YYYY-MM-DD'), COUNT(*)::int,
           json_build_object('freq', SUM(m.frequency)::int, 'alt', SUM(COALESCE(m.alt_freq, 0))::int,
                             'beh', (array_agg(m.behavior ORDER BY m.id))[1])
      FROM monitor_records m JOIN students s ON s.id = m.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND m.date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY m.student_id, m.date
    UNION ALL
    SELECT 'sz', z.student_id, to_char(z.date, 'YYYY-MM-DD'), COUNT(*)::int,
           json_build_object('reason', (array_agg(z.reason ORDER BY z.id))[1], 'in', (array_agg(z.in_time ORDER BY z.id))[1],
                             'out', (array_agg(z.out_time ORDER BY z.id))[1], 'returned', (array_agg(z.returned ORDER BY z.id))[1])
      FROM sz_records z JOIN students s ON s.id = z.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND z.date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY z.student_id, z.date
    UNION ALL
    SELECT 'fid', f.student_id, to_char(f.date, 'YYYY-MM-DD'), COUNT(*)::int,
           json_build_object('score', (array_agg(f.score ORDER BY f.id DESC))[1], 'total', (array_agg(f.total ORDER BY f.id DESC))[1])
      FROM fidelity_records f JOIN students s ON s.id = f.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND f.date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY f.student_id, f.date
    UNION ALL
    SELECT 'cico', c.student_id, to_char(c.date, 'YYYY-MM-DD'), COUNT(*)::int,
           json_build_object('score', MAX(c.total_score), 'max', MAX(c.max_score))
      FROM cico_records c JOIN students s ON s.id = c.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND c.date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY c.student_id, c.date
    UNION ALL
    SELECT 'letter', l.student_id, to_char(l.sent_date, 'YYYY-MM-DD'), COUNT(*)::int,
           json_build_object('subject', (array_agg(l.subject ORDER BY l.id))[1])
      FROM family_letters l JOIN students s ON s.id = l.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND l.sent_date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY l.student_id, l.sent_date
  `;
  const qStudents = sql`
    SELECT s.id, s.student_code AS code,
      (SELECT COALESCE(json_agg(json_build_object('tier', p.tier, 'start', to_char(p.start_date, 'YYYY-MM-DD'),
                                                 'end', to_char(p.end_date, 'YYYY-MM-DD')) ORDER BY p.start_date), '[]'::json)
         FROM observation_periods p
        WHERE p.student_id = s.id AND p.start_date <= ${to}::date
          AND (p.end_date IS NULL OR p.end_date >= ${readFrom}::date)) AS periods,
      (SELECT COALESCE(json_agg(json_build_object('subject', g.subject, 'monthly', g.monthly) ORDER BY g.id), '[]'::json)
         FROM iep_goals g
        WHERE g.student_id = s.id AND g.semester = ${semester}
          AND g.school_year IN (${schoolYear}, 0)) AS iep
    FROM students s
    WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
    ORDER BY s.student_code
  `;
  // 회기 기록은 0915 신설 테이블 — 아직 없는 DB에서도 달력 전체가 실패하지 않게 따로 받는다.
  const qSessions = sql`
    SELECT ps.student_id AS sid, to_char(ps.date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n,
           ROUND(AVG(ps.pct))::int AS pct
      FROM program_sessions ps JOIN students s ON s.id = ps.student_id
     WHERE s.user_id = ${userId} AND (${classId}::int IS NULL OR s.class_id = ${classId}::int)
       AND ps.date BETWEEN ${readFrom}::date AND ${to}::date
     GROUP BY ps.student_id, ps.date
  `.catch(() => ({ rows: [] }));
  return Promise.all([qEvents, qStudents, qSessions]);
}

export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { from, to } = req.query;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return res.status(400).json({ error: '조회 날짜(from·to)가 올바르지 않아요' });
  if (daysBetween(from, to) > MAX_RANGE) return res.status(400).json({ error: `한 번에 ${MAX_RANGE}일까지만 볼 수 있어요` });
  const classId = req.query.class_id ? parseInt(req.query.class_id, 10) : null;
  if (req.query.class_id && !Number.isFinite(classId)) return res.status(400).json({ error: 'class_id가 올바르지 않아요' });

  const today = todayKst();
  const readFrom = addDays(from, -LOOKBACK);
  const mid = addDays(from, Math.floor(daysBetween(from, to) / 2));
  const { schoolYear, semester } = semesterOf(mid);
  const month = +mid.slice(5, 7);

  let results;
  try {
    results = await runQueries(req.userId, classId, readFrom, to, schoolYear, semester);
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) {
      try {
        await ensureOnce();
        results = await runQueries(req.userId, classId, readFrom, to, schoolYear, semester);
      } catch (e2) {
        console.error('Calendar error (after ensure):', e2);
        return res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      console.error('Calendar error:', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
  const [evRes, stuRes, sesRes] = results;

  const cico = {}; const mon = {};
  const events = [];
  for (const r of evRes.rows) {
    const sid = String(r.sid);
    if (r.kind === 'cico') (cico[sid] = cico[sid] || []).push(r.d);
    if (r.kind === 'mon') (mon[sid] = mon[sid] || []).push(r.d);
    if (r.d >= from && r.d <= to) events.push({ date: r.d, studentId: sid, kind: r.kind, n: r.n, info: r.info || {} });
  }
  for (const r of sesRes.rows) {
    if (r.d >= from && r.d <= to) events.push({ date: r.d, studentId: String(r.sid), kind: 'session', n: r.n, info: { pct: r.pct } });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const students = [];
  const periods = [];
  const iepMonthly = [];
  for (const s of stuRes.rows) {
    const sid = String(s.id);
    students.push({ id: sid, code: s.code });
    for (const p of s.periods || []) periods.push({ studentId: sid, tier: p.tier, start: p.start, end: p.end || null });
    for (const g of s.iep || []) {
      const text = monthlyGoalText(g.monthly, month);
      if (text) iepMonthly.push({ studentId: sid, subject: g.subject || '', text });
    }
  }

  const missing = missingDays({ today, from, to, cico, mon, periods });
  return res.status(200).json({
    today, from, to, month,
    students,
    events,
    periods: periods.filter((p) => p.start <= to && (!p.end || p.end >= from)),
    missing,
    iepMonthly,
  });
});
