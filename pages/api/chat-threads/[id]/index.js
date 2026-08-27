import { sql } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { ensureChatThreadsCached } from '../../../../lib/ensureSchema';

// AI 전문가 채팅 — 대화 상세 (본인 것만).
//   GET    /api/chat-threads/[id] → { thread, messages }
//   PATCH  /api/chat-threads/[id] { title } — 제목 변경
//   DELETE /api/chat-threads/[id] — 대화 삭제(메시지는 FK CASCADE)
export default requireAuth(async function handler(req, res) {
  await ensureChatThreadsCached();

  const tid = Number(req.query.id);
  if (!Number.isInteger(tid) || tid <= 0) {
    return res.status(400).json({ error: 'Invalid thread id' });
  }
  const found = await sql`
    SELECT id, title, mode, student_id, created_at, updated_at
      FROM chat_threads WHERE id = ${tid} AND user_id = ${req.userId}
  `;
  if (found.rows.length === 0) {
    return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  }
  const thread = found.rows[0];

  if (req.method === 'GET') {
    const messages = await sql`
      SELECT id, role, content, created_at
        FROM chat_history
       WHERE thread_id = ${tid}
       ORDER BY id ASC
    `;
    return res.status(200).json({ thread, messages: messages.rows });
  }

  if (req.method === 'PATCH') {
    const t = typeof (req.body || {}).title === 'string' ? req.body.title.trim().slice(0, 200) : '';
    if (!t) return res.status(400).json({ error: '제목을 입력해주세요.' });
    const updated = await sql`
      UPDATE chat_threads SET title = ${t}, updated_at = NOW()
       WHERE id = ${tid} AND user_id = ${req.userId}
       RETURNING id, title, mode, created_at, updated_at
    `;
    return res.status(200).json({ thread: updated.rows[0] });
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM chat_threads WHERE id = ${tid} AND user_id = ${req.userId}`;
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
