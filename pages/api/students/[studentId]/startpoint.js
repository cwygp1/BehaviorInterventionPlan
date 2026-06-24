import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

// IEPBS 모듈1 (출발점 / 학습자 분석) 상태 — 학생당 1행.
// data: { guardian, observation, fba, strengths, eco,  // 입력 5블록
//         supportNeeds, functions, perfLevel }          // 산출물 3블록
export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`SELECT * FROM student_startpoint WHERE student_id = ${studentId}`;
      return res.status(200).json({ data: r.rows[0] || null });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { data } = req.body || {};
      const json = JSON.stringify(data || {});
      const r = await sql`
        INSERT INTO student_startpoint (student_id, data, updated_at)
        VALUES (${studentId}, ${json}::jsonb, NOW())
        ON CONFLICT (student_id)
        DO UPDATE SET data = ${json}::jsonb, updated_at = NOW()
        RETURNING *
      `;
      return res.status(200).json({ data: r.rows[0] });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Startpoint error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
