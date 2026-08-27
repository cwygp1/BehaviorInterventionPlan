import { sql } from '../../../../lib/db';
import { requireAuth, getUserRole } from '../../../../lib/auth';
import { ensureQaSchemaCached } from '../../../../lib/ensureSchema';

const QA_CATEGORIES = ['Tier1', 'Tier2', 'Tier3', 'IEP', '위기대응', '기타'];

// 질문 상세.
//   GET    /api/qa-board/[id] → { question, answers }  (비공개는 작성자·관리자만)
//   PATCH  /api/qa-board/[id] — 작성자, 답변 달리기 전(status='open')까지만 수정
//   DELETE /api/qa-board/[id] — 작성자 또는 관리자
export default requireAuth(async function handler(req, res) {
  await ensureQaSchemaCached();

  const qid = Number(req.query.id);
  if (!Number.isInteger(qid) || qid <= 0) {
    return res.status(400).json({ error: 'Invalid question id' });
  }

  const found = await sql`
    SELECT q.*, u.name AS author_name
      FROM qa_questions q
      LEFT JOIN users u ON u.id = q.user_id
     WHERE q.id = ${qid}
  `;
  if (found.rows.length === 0) {
    return res.status(404).json({ error: '질문을 찾을 수 없습니다.' });
  }
  const question = found.rows[0];
  const isOwner = question.user_id === Number(req.userId);
  const role = await getUserRole(req.userId);
  const isAdmin = role === 'admin';

  // 비공개 글 열람 제한 — 존재 여부를 숨기기 위해 403이 아니라 404로 응답.
  if (question.is_private && !isOwner && !isAdmin) {
    return res.status(404).json({ error: '질문을 찾을 수 없습니다.' });
  }

  if (req.method === 'GET') {
    const answers = await sql`
      SELECT a.id, a.user_id, a.body, a.created_at, a.updated_at, u.name AS author_name
        FROM qa_answers a
        LEFT JOIN users u ON u.id = a.user_id
       WHERE a.question_id = ${qid}
       ORDER BY a.id ASC
    `;
    return res.status(200).json({ question, answers: answers.rows });
  }

  if (req.method === 'PATCH') {
    if (!isOwner) return res.status(403).json({ error: '작성자만 수정할 수 있습니다.' });
    if (question.status !== 'open') {
      return res.status(400).json({ error: '답변이 달린 질문은 수정할 수 없습니다.' });
    }
    const { title, body, category, is_private } = req.body || {};
    const t = typeof title === 'string' ? title.trim() : '';
    const b = typeof body === 'string' ? body.trim() : '';
    if (!t) return res.status(400).json({ error: '제목을 입력해주세요.' });
    if (t.length > 200) return res.status(400).json({ error: '제목은 200자 이내로 입력해주세요.' });
    if (b.length > 20000) return res.status(400).json({ error: '내용이 너무 깁니다(2만 자 이내).' });
    const cat = QA_CATEGORIES.includes(category) ? category : '';
    const priv = is_private === true;

    const updated = await sql`
      UPDATE qa_questions
         SET title = ${t}, body = ${b}, category = ${cat}, is_private = ${priv}, updated_at = NOW()
       WHERE id = ${qid}
       RETURNING id, user_id, title, body, category, is_private, status, created_at, updated_at
    `;
    return res.status(200).json({ question: updated.rows[0] });
  }

  if (req.method === 'DELETE') {
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: '작성자 또는 관리자만 삭제할 수 있습니다.' });
    }
    await sql`DELETE FROM qa_questions WHERE id = ${qid}`; // 답변은 FK CASCADE로 함께 삭제
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
