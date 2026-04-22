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
          SELECT * FROM fidelity_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows });
      }

      case 'POST': {
        const { date, score, total } = req.body || {};
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        const result = await sql`
          INSERT INTO fidelity_records (student_id, date, score, total)
          VALUES (${studentId}, ${date}, ${score || 0}, ${total || 4})
          RETURNING *
        `;
        return res.status(201).json({ record: result.rows[0] });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Fidelity Records API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
