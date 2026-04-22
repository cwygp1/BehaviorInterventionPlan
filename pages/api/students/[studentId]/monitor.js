import { sql } from '../../../../lib/db';

export default async function handler(req, res) {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM monitor_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows });
      }

      case 'POST': {
        const { date, behavior, frequency, duration, intensity, alternative, latency, dbr, phase } = req.body || {};
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        const result = await sql`
          INSERT INTO monitor_records (student_id, date, behavior, frequency, duration, intensity, alternative, latency, dbr, phase)
          VALUES (${studentId}, ${date}, ${behavior || ''}, ${frequency || 0}, ${duration || 0}, ${intensity || 0}, ${alternative || 'N'}, ${latency || 0}, ${dbr || 0}, ${phase || 'A'})
          RETURNING *
        `;
        return res.status(201).json({ record: result.rows[0] });
      }

      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        await sql`DELETE FROM monitor_records WHERE id = ${id} AND student_id = ${studentId}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Monitor Records API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
