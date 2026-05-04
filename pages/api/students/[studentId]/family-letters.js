import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

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
const fmtDate = (d) => fmtKst(d).slice(0, 10);

const toResponse = (row) => ({
  ...row,
  sent_date: fmtDate(row.sent_date),
  created_at: fmtKst(row.created_at),
});

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`
        SELECT * FROM family_letters
        WHERE student_id = ${studentId}
        ORDER BY created_at DESC
      `;
      return res.status(200).json({ records: r.rows.map(toResponse) });
    }
    if (req.method === 'POST') {
      const { category, subject, body, sent_date } = req.body || {};
      if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
      const r = await sql`
        INSERT INTO family_letters (student_id, category, subject, body, sent_date)
        VALUES (${studentId}, ${category || ''}, ${subject || ''}, ${body}, ${sent_date || new Date().toISOString().slice(0, 10)})
        RETURNING *
      `;
      return res.status(201).json({ record: toResponse(r.rows[0]) });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM family_letters WHERE id = ${id} AND student_id = ${studentId}`;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Family letters error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
