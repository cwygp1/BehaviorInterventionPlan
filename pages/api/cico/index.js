import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { isIsoDate } from '../../../lib/utils/calendarRules';

// GET /api/cico?class_id=&date=YYYY-MM-DD — 새 디자인 '우리 반 > 매일 점검표' 다학생 표(mds/54 §5, 2단계). 읽기 전용.
//   records  그날 이 학급 학생들의 점검표 행(학생당 0~1행 — (student_id, date) 유일)
//   last     그날 기록이 없는 학생의 교시·목표 틀을 잇기 위한, 그날 이전 가장 최근 행(학생당 1행)
//   권한: 학급이 내 것인지(classes.user_id) + 학생도 내 것(students.user_id)만. 저장은 학생별 기존 POST
//         /api/students/{id}/cico(업서트) 그대로 — 여기엔 쓰기가 없다.
const fmt = (r) => ({ ...r, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date });

export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const classId = parseInt(req.query.class_id, 10);
  const date = String(req.query.date || '');
  if (!Number.isFinite(classId) || classId <= 0) return res.status(400).json({ error: 'class_id가 필요합니다' });
  if (!isIsoDate(date)) return res.status(400).json({ error: '날짜(date)가 올바르지 않아요' });
  try {
    const own = await sql`SELECT id FROM classes WHERE id = ${classId} AND user_id = ${req.userId}`;
    if (own.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
    const [today, last] = await Promise.all([
      sql`
        SELECT c.id, c.student_id, to_char(c.date, 'YYYY-MM-DD') AS date, c.goals, c.periods, c.scores,
               c.check_in_time, c.check_out_time, c.comment, c.total_score, c.max_score
          FROM cico_records c JOIN students s ON s.id = c.student_id
         WHERE s.class_id = ${classId} AND s.user_id = ${req.userId} AND c.date = ${date}::date
      `,
      sql`
        SELECT DISTINCT ON (c.student_id) c.student_id, to_char(c.date, 'YYYY-MM-DD') AS date, c.goals, c.periods
          FROM cico_records c JOIN students s ON s.id = c.student_id
         WHERE s.class_id = ${classId} AND s.user_id = ${req.userId} AND c.date < ${date}::date
         ORDER BY c.student_id, c.date DESC
      `,
    ]);
    return res.status(200).json({ date, records: today.rows.map(fmt), last: last.rows.map(fmt) });
  } catch (e) {
    if (e && e.code === '42P01') return res.status(200).json({ date, records: [], last: [] }); // 점검표 테이블이 아직 없는 DB
    console.error('class CICO error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
