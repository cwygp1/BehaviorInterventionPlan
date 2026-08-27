import { sql } from '../../../../lib/db';
import { requireRole } from '../../../../lib/auth';
import { ensureQaSchemaCached } from '../../../../lib/ensureSchema';

// 답변 등록 — 관리자 전용.
//   POST /api/qa-board/[id]/answers { body } → { answer }
//   첫 답변이 달리면 질문 status가 'answered'로 바뀐다.
export default requireRole(['admin'], async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  await ensureQaSchemaCached();

  const qid = Number(req.query.id);
  if (!Number.isInteger(qid) || qid <= 0) {
    return res.status(400).json({ error: 'Invalid question id' });
  }
  const b = typeof (req.body || {}).body === 'string' ? req.body.body.trim() : '';
  if (!b) return res.status(400).json({ error: '답변 내용을 입력해주세요.' });
  if (b.length > 20000) return res.status(400).json({ error: '답변이 너무 깁니다(2만 자 이내).' });

  const q = await sql`SELECT id FROM qa_questions WHERE id = ${qid}`;
  if (q.rows.length === 0) {
    return res.status(404).json({ error: '질문을 찾을 수 없습니다.' });
  }

  const inserted = await sql`
    INSERT INTO qa_answers (question_id, user_id, body)
    VALUES (${qid}, ${req.userId}, ${b})
    RETURNING id, question_id, user_id, body, created_at, updated_at
  `;
  await sql`UPDATE qa_questions SET status = 'answered', updated_at = NOW() WHERE id = ${qid}`;

  // 답변자 이름을 붙여 반환(프론트가 즉시 목록에 반영할 수 있게).
  const named = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
  const answer = { ...inserted.rows[0], author_name: named.rows[0]?.name || '' };
  return res.status(201).json({ answer, status: 'answered' });
});
