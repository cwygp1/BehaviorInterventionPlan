import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureIepStatusCol, ensureIepStatusColCached } from '../../../lib/ensureSchema';

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
  // 1101: 초안 상태 열 자가 치유(첫 요청 1번) — 실패하면 기록만 남기고, 아래 쿼리가 열 없음(42703)으로 죽으면 한 번 더 고친 뒤 다시 묻는다(mds/56 #16·#21).
  try { await ensureIepStatusColCached(); } catch (e) { console.error('Students summary ensure status col:', e); }
  const runQueries = () => Promise.all([
      sql`
        SELECT
          s.id AS student_id,
          COALESCE((SELECT COUNT(*) FROM abc_records      WHERE student_id = s.id), 0)::int AS abc_count,
          COALESCE((SELECT COUNT(*) FROM monitor_records  WHERE student_id = s.id), 0)::int AS mon_count,
          COALESCE((SELECT COUNT(*) FROM sz_records       WHERE student_id = s.id), 0)::int AS sz_count,
          -- 1101(새 디자인 4단계 D1): 초안(status='draft')은 목표 수에서 뺀다 — 홈 IEP 카드·softLock·시작하기 목록 수치 불변.
          COALESCE((SELECT COUNT(*) FROM iep_goals        WHERE student_id = s.id AND status <> 'draft'), 0)::int AS iep_count,
          COALESCE((SELECT COUNT(*) FROM iep_goals        WHERE student_id = s.id AND status = 'draft'), 0)::int AS iep_draft_count,
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
  try {
    let summaryRes, recentRes;
    try {
      [summaryRes, recentRes] = await runQueries();
    } catch (err) {
      // 열 없음(42703)일 때만 status 열을 (캐시 없이) 다시 만들고 1회 재시도 — dashboard·calendar와 같은 규칙.
      if (err?.code !== '42703') throw err;
      await ensureIepStatusCol();
      [summaryRes, recentRes] = await runQueries();
    }

    const summaries = {};
    for (const row of summaryRes.rows) {
      summaries[row.student_id] = {
        abc_count: row.abc_count,
        mon_count: row.mon_count,
        sz_count: row.sz_count,
        iep_count: row.iep_count, // 1001(mds/46): 홈 '시작하기' 체크리스트·IEP 빈 화면 안내 (1101: 초안 제외)
        iep_draft_count: row.iep_draft_count, // 1101(추가): 초안 목표 수 — 새 디자인만 읽는다
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
