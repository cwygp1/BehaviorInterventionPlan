import { sql } from '../../../../lib/db';
import { requireAuth } from '../../../../lib/auth';
import { ensureChatThreadsCached } from '../../../../lib/ensureSchema';

// AI 전문가 채팅 — 턴 저장 (본인 스레드만).
//   POST /api/chat-threads/[id]/messages { role: 'user'|'assistant', content }
// LLM 호출 자체는 브라우저가 직접 하므로(기존 구조), 서버는 완성된 턴만 저장한다.
// 첫 사용자 메시지가 저장되면 스레드 제목을 자동으로 채운다.
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  await ensureChatThreadsCached();

  const tid = Number(req.query.id);
  if (!Number.isInteger(tid) || tid <= 0) {
    return res.status(400).json({ error: 'Invalid thread id' });
  }
  const found = await sql`
    SELECT id, title FROM chat_threads WHERE id = ${tid} AND user_id = ${req.userId}
  `;
  if (found.rows.length === 0) {
    return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  }

  const { role, content } = req.body || {};
  if (role !== 'user' && role !== 'assistant') {
    return res.status(400).json({ error: "role은 'user' 또는 'assistant'여야 합니다." });
  }
  const c = typeof content === 'string' ? content.trim() : '';
  if (!c) return res.status(400).json({ error: '내용이 비어 있습니다.' });
  if (c.length > 100000) return res.status(400).json({ error: '메시지가 너무 깁니다.' });

  const inserted = await sql`
    INSERT INTO chat_history (user_id, thread_id, role, content)
    VALUES (${req.userId}, ${tid}, ${role}, ${c})
    RETURNING id, role, content, created_at
  `;

  // 제목 자동 생성(첫 사용자 메시지 기준) + 최근 대화 정렬용 updated_at 갱신.
  if (!found.rows[0].title && role === 'user') {
    const title = c.replace(/\s+/g, ' ').slice(0, 60);
    await sql`UPDATE chat_threads SET title = ${title}, updated_at = NOW() WHERE id = ${tid}`;
  } else {
    await sql`UPDATE chat_threads SET updated_at = NOW() WHERE id = ${tid}`;
  }

  return res.status(201).json({ message: inserted.rows[0] });
});
