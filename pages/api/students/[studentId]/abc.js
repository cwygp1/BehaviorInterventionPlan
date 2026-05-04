import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;

  // KST (UTC+9) formatter — Postgres DATE/TIMESTAMP columns come back as JS
  // Date objects which JSON-serialize to UTC ISO strings; we want a readable
  // local-time string instead.
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

  // Map a DB row to a response object that includes BOTH the canonical column
  // names (antecedent/behavior/consequence/time_context) AND the short aliases
  // (a/b/c/time) used by the legacy SPA in public/index.html.
  const toResponse = (row) => ({
    ...row,
    date: fmtDateKst(row.date),
    created_at: fmtKst(row.created_at),
    time: row.time_context,
    a: row.antecedent,
    b: row.behavior,
    c: row.consequence,
  });

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM abc_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows.map(toResponse) });
      }

      case 'POST': {
        const body = req.body || {};
        // Accept both naming conventions on input.
        const date = body.date;
        const time_context = body.time_context ?? body.time ?? '';
        const antecedent = body.antecedent ?? body.a ?? '';
        const behavior = body.behavior ?? body.b ?? '';
        const consequence = body.consequence ?? body.c ?? '';
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        const result = await sql`
          INSERT INTO abc_records (student_id, date, time_context, antecedent, behavior, consequence)
          VALUES (${studentId}, ${date}, ${time_context}, ${antecedent}, ${behavior}, ${consequence})
          RETURNING *
        `;
        return res.status(201).json({ record: toResponse(result.rows[0]) });
      }

      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        await sql`DELETE FROM abc_records WHERE id = ${id} AND student_id = ${studentId}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('ABC Records API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
