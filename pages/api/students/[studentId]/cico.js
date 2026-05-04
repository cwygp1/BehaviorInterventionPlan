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
  return `${y}-${mo}-${dy}`;
};

const toResponse = (row) => ({ ...row, date: fmtKst(row.date) });

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`
        SELECT * FROM cico_records WHERE student_id = ${studentId}
        ORDER BY date DESC
      `;
      return res.status(200).json({ records: r.rows.map(toResponse) });
    }
    if (req.method === 'POST') {
      const { date, goals, periods, scores, check_in_time, check_out_time, comment } = req.body || {};
      if (!date) return res.status(400).json({ error: 'date required' });
      const goalsJson = JSON.stringify(goals || []);
      const periodsJson = JSON.stringify(periods || []);
      const scoresJson = JSON.stringify(scores || {});
      // scores values are objects { score, comment } in new format, but might
      // be plain numbers in legacy records. Tolerate both.
      const scoreVals = Object.values(scores || {}).map((v) =>
        typeof v === 'object' ? Number(v?.score) : Number(v)
      ).filter((n) => Number.isFinite(n));
      const total = scoreVals.reduce((a, b) => a + b, 0);
      const max = scoreVals.length * 3;
      const r = await sql`
        INSERT INTO cico_records (student_id, date, goals, periods, scores, check_in_time, check_out_time, comment, total_score, max_score)
        VALUES (${studentId}, ${date}, ${goalsJson}::jsonb, ${periodsJson}::jsonb, ${scoresJson}::jsonb, ${check_in_time || ''}, ${check_out_time || ''}, ${comment || ''}, ${total}, ${max})
        ON CONFLICT (student_id, date)
        DO UPDATE SET goals = ${goalsJson}::jsonb, periods = ${periodsJson}::jsonb, scores = ${scoresJson}::jsonb,
                      check_in_time = ${check_in_time || ''}, check_out_time = ${check_out_time || ''},
                      comment = ${comment || ''}, total_score = ${total}, max_score = ${max}
        RETURNING *
      `;
      return res.status(200).json({ record: toResponse(r.rows[0]) });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM cico_records WHERE id = ${id} AND student_id = ${studentId}`;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('CICO error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
