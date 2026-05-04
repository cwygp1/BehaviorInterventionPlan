import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;

  // KST formatter for DATE/TIMESTAMP columns.
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
  // names AND the short aliases used by the legacy SPA in public/index.html.
  // Frontend keys: beh, freq, dur, int, alt, lat (dbr/phase already match).
  const toResponse = (row) => ({
    ...row,
    date: fmtDateKst(row.date),
    created_at: fmtKst(row.created_at),
    beh: row.behavior,
    freq: row.frequency,
    dur: row.duration,
    int: row.intensity,
    alt: row.alternative,
    lat: row.latency,
  });

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM monitor_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows.map(toResponse) });
      }

      case 'POST': {
        const body = req.body || {};
        // Accept both naming conventions on input.
        const date = body.date;
        const behavior = body.behavior ?? body.beh ?? '';
        const frequency = body.frequency ?? body.freq ?? 0;
        const duration = body.duration ?? body.dur ?? 0;
        const intensity = body.intensity ?? body.int ?? 0;
        const alternative = body.alternative ?? body.alt ?? 'N';
        const latency = body.latency ?? body.lat ?? 0;
        const dbr = body.dbr ?? 0;
        const phase = body.phase ?? 'A';
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        const result = await sql`
          INSERT INTO monitor_records (student_id, date, behavior, frequency, duration, intensity, alternative, latency, dbr, phase)
          VALUES (${studentId}, ${date}, ${behavior}, ${frequency}, ${duration}, ${intensity}, ${alternative}, ${latency}, ${dbr}, ${phase})
          RETURNING *
        `;
        return res.status(201).json({ record: toResponse(result.rows[0]) });
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
});
