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

  // Expose the row under BOTH `data` (current API shape) and `bip` (the key
  // expected by the legacy SPA's fetchStudentData).
  const toEnvelope = (row) => {
    if (!row) return { data: null, bip: null };
    const formatted = { ...row, updated_at: fmtKst(row.updated_at) };
    return { data: formatted, bip: formatted };
  };

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM bip_data WHERE student_id = ${studentId}
        `;
        return res.status(200).json(toEnvelope(result.rows[0] || null));
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
        return res.status(200).json(toEnvelope(result.rows[0]));
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('BIP API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
