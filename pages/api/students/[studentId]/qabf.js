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
          SELECT * FROM qabf_data WHERE student_id = ${studentId}
        `;
        if (result.rows.length === 0) {
          return res.status(200).json({ data: null });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'POST':
      case 'PUT': {
        const { responses } = req.body || {};
        if (!responses || !Array.isArray(responses)) {
          return res.status(400).json({ error: 'responses array is required' });
        }
        const jsonResponses = JSON.stringify(responses);
        const result = await sql`
          INSERT INTO qabf_data (student_id, responses, updated_at)
          VALUES (${studentId}, ${jsonResponses}::jsonb, NOW())
          ON CONFLICT (student_id)
          DO UPDATE SET responses = ${jsonResponses}::jsonb, updated_at = NOW()
          RETURNING *
        `;
        return res.status(200).json({ data: result.rows[0] });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('QABF API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
