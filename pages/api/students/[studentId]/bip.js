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
          SELECT * FROM bip_data WHERE student_id = ${studentId}
        `;
        if (result.rows.length === 0) {
          return res.status(200).json({ data: null });
        }
        return res.status(200).json({ data: result.rows[0] });
      }

      case 'POST':
      case 'PUT': {
        const { alt, fct, crit, prev, teach, reinf, resp } = req.body || {};
        const result = await sql`
          INSERT INTO bip_data (student_id, alt, fct, crit, prev, teach, reinf, resp, updated_at)
          VALUES (${studentId}, ${alt || ''}, ${fct || ''}, ${crit || ''}, ${prev || ''}, ${teach || ''}, ${reinf || ''}, ${resp || ''}, NOW())
          ON CONFLICT (student_id)
          DO UPDATE SET alt = ${alt || ''}, fct = ${fct || ''}, crit = ${crit || ''}, prev = ${prev || ''}, teach = ${teach || ''}, reinf = ${reinf || ''}, resp = ${resp || ''}, updated_at = NOW()
          RETURNING *
        `;
        return res.status(200).json({ data: result.rows[0] });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('BIP API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
