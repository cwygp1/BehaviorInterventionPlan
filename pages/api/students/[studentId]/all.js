import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

// GET /api/students/[studentId]/all
//
// Aggregates all per-student data in ONE serverless function call. Replaces 9
// parallel calls (abc / monitor / qabf / bip / fidelity / sz / raisd / priority /
// periods) — collapses 9 cold starts into 1 and runs the queries in parallel
// inside the function.
//
// Date/timestamp formatting matches what the individual endpoints would return.
export default requireStudentAccess(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { studentId } = req.query;

  // KST formatter — same logic as the per-table endpoints.
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

  try {
    const [abcRes, monRes, qabfRes, bipRes, fidRes, szRes, raisdRes, priorityRes, periodsRes, lettersRes, cicoRes] = await Promise.all([
      sql`SELECT * FROM abc_records WHERE student_id = ${studentId} ORDER BY created_at DESC`,
      sql`SELECT * FROM monitor_records WHERE student_id = ${studentId} ORDER BY created_at DESC`,
      sql`SELECT * FROM qabf_data WHERE student_id = ${studentId}`,
      sql`SELECT * FROM bip_data WHERE student_id = ${studentId}`,
      sql`SELECT * FROM fidelity_records WHERE student_id = ${studentId} ORDER BY created_at DESC`,
      sql`SELECT * FROM sz_records WHERE student_id = ${studentId} ORDER BY created_at DESC`,
      sql`SELECT * FROM raisd_assessments WHERE student_id = ${studentId}`,
      sql`SELECT * FROM priority_checklist WHERE student_id = ${studentId}`,
      sql`SELECT id, tier, start_date::text AS start_date, end_date::text AS end_date, note, created_at FROM observation_periods WHERE student_id = ${studentId} ORDER BY start_date DESC`,
      sql`SELECT * FROM family_letters WHERE student_id = ${studentId} ORDER BY created_at DESC`,
      sql`SELECT id, date::text AS date, goals, periods, scores, check_in_time, check_out_time, comment, total_score, max_score, created_at FROM cico_records WHERE student_id = ${studentId} ORDER BY date DESC`,
    ]);

    return res.status(200).json({
      abc: abcRes.rows.map((r) => ({
        ...r,
        date: fmtDate(r.date),
        created_at: fmtKst(r.created_at),
        time: r.time_context,
        a: r.antecedent,
        b: r.behavior,
        c: r.consequence,
      })),
      mon: monRes.rows.map((r) => ({
        ...r,
        date: fmtDate(r.date),
        created_at: fmtKst(r.created_at),
        beh: r.behavior,
        freq: r.frequency,
        dur: r.duration,
        int: r.intensity,
        alt: r.alternative,
        lat: r.latency,
      })),
      qabf: (qabfRes.rows[0]?.responses) || new Array(25).fill(-1),
      bip: bipRes.rows[0] ? { ...bipRes.rows[0], updated_at: fmtKst(bipRes.rows[0].updated_at) } : {},
      fid: fidRes.rows.map((r) => ({ ...r, date: fmtDate(r.date), created_at: fmtKst(r.created_at) })),
      sz: szRes.rows.map((r) => ({
        ...r,
        date: fmtDate(r.date),
        created_at: fmtKst(r.created_at),
        in_t: r.in_time,
        out_t: r.out_time,
        intv: r.intervention,
        ret: r.returned,
      })),
      raisd: raisdRes.rows[0] || null,
      priority: priorityRes.rows[0] || null,
      periods: periodsRes.rows,
      letters: lettersRes.rows.map((r) => ({
        ...r,
        sent_date: fmtDate(r.sent_date),
        created_at: fmtKst(r.created_at),
      })),
      cico: cicoRes.rows.map((r) => ({ ...r, created_at: fmtKst(r.created_at) })),
    });
  } catch (e) {
    console.error('Bulk student data error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
