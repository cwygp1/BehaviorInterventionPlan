import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

const TIER_VALUES = new Set(['baseline', 'tier1', 'tier2', 'tier3']);

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`
        SELECT id, tier, start_date::text AS start_date, end_date::text AS end_date, note, created_at
        FROM observation_periods WHERE student_id = ${studentId}
        ORDER BY start_date DESC
      `;
      return res.status(200).json({ records: r.rows });
    }
    if (req.method === 'POST') {
      const { tier, start_date, end_date, note } = req.body || {};
      if (!tier || !TIER_VALUES.has(tier)) return res.status(400).json({ error: 'invalid tier' });
      if (!start_date) return res.status(400).json({ error: 'start_date required' });
      // Close any open periods (end_date IS NULL) for this student.
      await sql`
        UPDATE observation_periods SET end_date = ${start_date}::date - INTERVAL '1 day'
        WHERE student_id = ${studentId} AND end_date IS NULL
      `;
      const r = await sql`
        INSERT INTO observation_periods (student_id, tier, start_date, end_date, note)
        VALUES (${studentId}, ${tier}, ${start_date}, ${end_date || null}, ${note || ''})
        RETURNING *
      `;
      return res.status(201).json({ record: r.rows[0] });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM observation_periods WHERE id = ${id} AND student_id = ${studentId}`;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Periods error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
