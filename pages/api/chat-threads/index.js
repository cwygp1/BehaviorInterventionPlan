import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureChatThreadsCached } from '../../../lib/ensureSchema';

const VALID_MODES = ['pbs', 'iep', 'crisis', 'free', 'guide'];

// AI 전문가 채팅 — 대화(스레드) 목록/생성 (mds/28 P2).
//   GET  /api/chat-threads → { threads: [{ id, title, mode, msg_count, created_at, updated_at }] }
//   POST /api/chat-threads { mode } → { thread }
export default requireAuth(async function handler(req, res) {
  await ensureChatThreadsCached();

  if (req.method === 'GET') {
    const result = await sql`
      SELECT t.id, t.title, t.mode, t.student_id, s.student_code, t.created_at, t.updated_at,
             (SELECT COUNT(*)::int FROM chat_history h WHERE h.thread_id = t.id) AS msg_count
        FROM chat_threads t
        LEFT JOIN students s ON s.id = t.student_id
       WHERE t.user_id = ${req.userId}
       ORDER BY t.updated_at DESC
       LIMIT 100
    `;
    return res.status(200).json({ threads: result.rows });
  }

  if (req.method === 'POST') {
    const { mode, student_id } = req.body || {};
    const m = VALID_MODES.includes(mode) ? mode : 'pbs';
    // 학생 맞춤 상담(P3): student_id는 본인 소유 학생일 때만 연결한다.
    let sid = null;
    const n = Number(student_id);
    if (Number.isInteger(n) && n > 0) {
      const own = await sql`SELECT id FROM students WHERE id = ${n} AND user_id = ${req.userId}`;
      if (own.rows.length > 0) sid = n;
    }
    const result = await sql`
      INSERT INTO chat_threads (user_id, mode, student_id)
      VALUES (${req.userId}, ${m}, ${sid})
      RETURNING id, title, mode, student_id, created_at, updated_at
    `;
    return res.status(201).json({ thread: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
