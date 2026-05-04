import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`SELECT * FROM raisd_assessments WHERE student_id = ${studentId}`;
      return res.status(200).json({ data: r.rows[0] || null });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { responses } = req.body || {};
      const json = JSON.stringify(responses || {});
      const r = await sql`
        INSERT INTO raisd_assessments (student_id, responses, updated_at)
        VALUES (${studentId}, ${json}::jsonb, NOW())
        ON CONFLICT (student_id)
        DO UPDATE SET responses = ${json}::jsonb, updated_at = NOW()
        RETURNING *
      `;
      return res.status(200).json({ data: r.rows[0] });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('RAISD error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
