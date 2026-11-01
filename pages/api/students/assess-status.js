import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { assessStatus } from '../../../lib/assessStatus';

// GET /api/students/assess-status?class_id= — 새 디자인 '오늘' 표의 '기초 평가 남음' 할 일 재료(3단계). 읽기 전용.
//   학급 학생마다 초기면담·강화제 평가·표적행동 우선순위를 작성했는지만 돌려준다(내용은 보내지 않음).
//     { status: { [student_id]: { interview, reinf, prio, done, missing:[이름…] } } }
//   판정은 lib/assessStatus.js — 학생 수첩 AssessmentLauncher 카드의 '✓ 작성됨'과 같은 규칙.
//   권한: 학급이 내 것(classes.user_id) + 학생도 내 것(students.user_id)만. 기존 API·테이블은 건드리지 않는다.
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const classId = parseInt(req.query.class_id, 10);
  if (!Number.isFinite(classId) || classId <= 0) return res.status(400).json({ error: 'class_id가 필요합니다' });
  try {
    const own = await sql`SELECT id FROM classes WHERE id = ${classId} AND user_id = ${req.userId}`;
    if (own.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
    const r = await sql`
      SELECT s.id AS student_id,
             b.interview AS interview,
             ra.responses AS raisd,
             p.responses AS priority
        FROM students s
        LEFT JOIN bip_data b ON b.student_id = s.id
        LEFT JOIN raisd_assessments ra ON ra.student_id = s.id
        LEFT JOIN priority_checklist p ON p.student_id = s.id
       WHERE s.class_id = ${classId} AND s.user_id = ${req.userId}
    `;
    const status = {};
    r.rows.forEach((row) => {
      status[row.student_id] = assessStatus({ interview: row.interview, raisd: row.raisd, priority: row.priority });
    });
    return res.status(200).json({ status });
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) return res.status(200).json({ status: {} }); // 표·열이 아직 없는 DB
    console.error('assess-status error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
