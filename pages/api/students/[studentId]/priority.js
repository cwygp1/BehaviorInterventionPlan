import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`SELECT * FROM priority_checklist WHERE student_id = ${studentId}`;
      return res.status(200).json({ data: r.rows[0] || null });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { responses } = req.body || {};
      const arr = Array.isArray(responses) ? responses : [];
      const total = arr.reduce((a, b) => a + (Number(b) || 0), 0);
      const json = JSON.stringify(arr);
      const r = await sql`
        INSERT INTO priority_checklist (student_id, responses, total, updated_at)
        VALUES (${studentId}, ${json}::jsonb, ${total}, NOW())
        ON CONFLICT (student_id)
        DO UPDATE SET responses = ${json}::jsonb, total = ${total}, updated_at = NOW()
        RETURNING *
      `;
      return res.status(200).json({ data: r.rows[0] });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Priority error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
