import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM sz_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows });
      }

      case 'POST': {
        const { date, reason, in_time, out_time, strategy, intervention, returned } = req.body || {};
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        const result = await sql`
          INSERT INTO sz_records (student_id, date, reason, in_time, out_time, strategy, intervention, returned)
          VALUES (${studentId}, ${date}, ${reason || ''}, ${in_time || ''}, ${out_time || ''}, ${strategy || ''}, ${intervention || ''}, ${returned || 'N'})
          RETURNING *
        `;
        return res.status(201).json({ record: result.rows[0] });
      }

      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        await sql`DELETE FROM sz_records WHERE id = ${id} AND student_id = ${studentId}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('SZ Records API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
