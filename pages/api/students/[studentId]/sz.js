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

  // Frontend (legacy SPA) keys: in_t / out_t / intv / ret.
  // DB columns: in_time / out_time / intervention / returned.
  const toResponse = (row) => ({
    ...row,
    date: fmtDateKst(row.date),
    created_at: fmtKst(row.created_at),
    in_t: row.in_time,
    out_t: row.out_time,
    intv: row.intervention,
    ret: row.returned,
  });

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM sz_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows.map(toResponse) });
      }

      case 'POST': {
        const body = req.body || {};
        const date = body.date;
        const reason = body.reason ?? '';
        const in_time = body.in_time ?? body.in_t ?? '';
        const out_time = body.out_time ?? body.out_t ?? '';
        const strategy = body.strategy ?? '';
        const intervention = body.intervention ?? body.intv ?? '';
        const returned = body.returned ?? body.ret ?? 'N';
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        const result = await sql`
          INSERT INTO sz_records (student_id, date, reason, in_time, out_time, strategy, intervention, returned)
          VALUES (${studentId}, ${date}, ${reason}, ${in_time}, ${out_time}, ${strategy}, ${intervention}, ${returned})
          RETURNING *
        `;
        return res.status(201).json({ record: toResponse(result.rows[0]) });
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
});
