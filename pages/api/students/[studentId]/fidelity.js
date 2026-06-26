import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

// 어떤 항목을 체크했는지 복원하기 위한 items 컬럼을 보장한다 (프로세스당 1회).
let fidColReady;
function ensureItemsColumn() {
  if (!fidColReady) {
    fidColReady = sql`ALTER TABLE fidelity_records ADD COLUMN IF NOT EXISTS items VARCHAR(20) DEFAULT ''`
      .catch((e) => { fidColReady = null; throw e; });
  }
  return fidColReady;
}

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
    await ensureItemsColumn();

    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM fidelity_records WHERE student_id = ${studentId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ records: result.rows.map(toResponse) });
      }

      case 'POST': {
        const { date, score, total, items } = req.body || {};
        if (!date) {
          return res.status(400).json({ error: 'date is required' });
        }
        // 같은 날짜에 이미 기록이 있으면 갱신, 없으면 새로 생성 (하루 1건 유지 → 중복 방지)
        const existing = await sql`
          SELECT id FROM fidelity_records WHERE student_id = ${studentId} AND date = ${date} LIMIT 1
        `;
        let result;
        if (existing.rows.length > 0) {
          result = await sql`
            UPDATE fidelity_records
            SET score = ${score || 0}, total = ${total || 4}, items = ${items || ''}, created_at = NOW()
            WHERE id = ${existing.rows[0].id}
            RETURNING *
          `;
        } else {
          result = await sql`
            INSERT INTO fidelity_records (student_id, date, score, total, items)
            VALUES (${studentId}, ${date}, ${score || 0}, ${total || 4}, ${items || ''})
            RETURNING *
          `;
        }
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
