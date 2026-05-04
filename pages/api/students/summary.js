import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// GET /api/students/summary
//
// One round-trip's worth of data for the home dashboard:
//   {
//     summaries: { [studentId]: {
//       abc_count, mon_count, sz_count,
//       first_freq, last_freq, last_beh, last_date
//     } },
//     recent: [
//       { type: 'ABC' | 'MON' | 'SZ',
//         student_id, student_code,
//         desc, date, created_at }
//     ]
//   }
//
// Two parallel queries: one aggregates per-student counts/trend, the other
// pulls the most recent activity rows across ABC / monitor / SZ for the
// authenticated user. No per-record fetch needed for the home page.
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const userId = req.userId;
  try {
    const [summaryRes, recentRes] = await Promise.all([
      sql`
        SELECT
          s.id AS student_id,
          COALESCE((SELECT COUNT(*) FROM abc_records      WHERE student_id = s.id), 0)::int AS abc_count,
          COALESCE((SELECT COUNT(*) FROM monitor_records  WHERE student_id = s.id), 0)::int AS mon_count,
          COALESCE((SELECT COUNT(*) FROM sz_records       WHERE student_id = s.id), 0)::int AS sz_count,
          (SELECT frequency FROM monitor_records
             WHERE student_id = s.id ORDER BY date ASC,  id ASC  LIMIT 1) AS first_freq,
          (SELECT frequency FROM monitor_records
             WHERE student_id = s.id ORDER BY date DESC, id DESC LIMIT 1) AS last_freq,
          (SELECT behavior  FROM monitor_records
             WHERE student_id = s.id ORDER BY date DESC, id DESC LIMIT 1) AS last_beh,
          (SELECT date::text FROM monitor_records
             WHERE student_id = s.id ORDER BY date DESC, id DESC LIMIT 1) AS last_date
        FROM students s
        WHERE s.user_id = ${userId}
      `,
      sql`
        (
          SELECT 'ABC' AS type, st.id AS student_id, st.student_code,
                 abc.behavior AS "desc", abc.date::text AS date, abc.created_at
          FROM abc_records abc
          JOIN students st ON st.id = abc.student_id
          WHERE st.user_id = ${userId}
          ORDER BY abc.created_at DESC
          LIMIT 8
        )
        UNION ALL
        (
          SELECT 'MON' AS type, st.id AS student_id, st.student_code,
                 mon.behavior AS "desc", mon.date::text AS date, mon.created_at
          FROM monitor_records mon
          JOIN students st ON st.id = mon.student_id
          WHERE st.user_id = ${userId}
          ORDER BY mon.created_at DESC
          LIMIT 8
        )
        UNION ALL
        (
          SELECT 'SZ' AS type, st.id AS student_id, st.student_code,
                 sz.reason AS "desc", sz.date::text AS date, sz.created_at
          FROM sz_records sz
          JOIN students st ON st.id = sz.student_id
          WHERE st.user_id = ${userId}
          ORDER BY sz.created_at DESC
          LIMIT 8
        )
        ORDER BY created_at DESC
        LIMIT 8
      `,
    ]);

    const summaries = {};
    for (const row of summaryRes.rows) {
      summaries[row.student_id] = {
        abc_count: row.abc_count,
        mon_count: row.mon_count,
        sz_count: row.sz_count,
        first_freq: row.first_freq,
        last_freq: row.last_freq,
        last_beh: row.last_beh,
        last_date: row.last_date,
      };
    }

    return res.status(200).json({
      summaries,
      recent: recentRes.rows,
    });
  } catch (error) {
    console.error('Students summary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
