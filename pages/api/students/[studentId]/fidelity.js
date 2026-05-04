import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;

  // KST formatter
  const fmtKst = (d) => {
    if (d == null || d === '') return '';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(kst.getUTCDate()).padStart(2, '0');
    const h = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    const s = String(kst.getUTCSeconds()).padStart(2, '0');
    return `${y}-${mo}-${dy} ${h}:${mi}:${s}`;
  };
  const fmtDateKst = (d) => fmtKst(d).slice(0, 10);

  const toResponse = (row) => ({
    ...row,
    date: fmtDateKst(row.date),
    created_at: fmtKst(row.created_at),
  });

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM fidelity_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows.map(toResponse) });
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
        return res.status(201).json({ record: toResponse(result.rows[0]) });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Fidelity Records API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
