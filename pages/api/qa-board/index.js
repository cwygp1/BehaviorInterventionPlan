import { query, sql } from '../../../lib/db';
import { requireAuth, getUserRole } from '../../../lib/auth';
import { ensureQaSchemaCached } from '../../../lib/ensureSchema';

export const QA_CATEGORIES = ['Tier1', 'Tier2', 'Tier3', 'IEP', '위기대응', '기타'];

// 질문 게시판 (사람 관리자가 답변) — mds/28 Part B.
//   GET  /api/qa-board?status=&category=&mine=1 → { questions }
//        비공개(is_private) 글은 작성자·관리자에게만 보인다.
//   POST /api/qa-board { title, body, category, is_private } → { question }
export default requireAuth(async function handler(req, res) {
  await ensureQaSchemaCached();

  if (req.method === 'GET') {
    const role = await getUserRole(req.userId);
    const isAdmin = role === 'admin';
    const { status = '', category = '', mine = '' } = req.query;

    // 동적 필터 — 태그드 템플릿은 조건부 조립이 안 되므로 파라미터 쿼리 사용.
    const where = ['(NOT q.is_private OR q.user_id = $1 OR $2)'];
    const params = [req.userId, isAdmin];
    if (status === 'open' || status === 'answered') {
      params.push(status);
      where.push(`q.status = $${params.length}`);
    }
    if (category) {
      params.push(String(category).slice(0, 50));
      where.push(`q.category = $${params.length}`);
    }
    if (mine === '1') {
      where.push('q.user_id = $1');
    }
    const result = await query(
      `SELECT q.id, q.user_id, q.title, q.category, q.is_private, q.status,
              q.created_at, q.updated_at,
              u.name AS author_name,
              (SELECT COUNT(*)::int FROM qa_answers a WHERE a.question_id = q.id) AS answer_count
         FROM qa_questions q
         LEFT JOIN users u ON u.id = q.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY q.id DESC
        LIMIT 300`,
      params
    );
    return res.status(200).json({ questions: result.rows, role });
  }

  if (req.method === 'POST') {
    const { title, body, category, is_private } = req.body || {};
    const t = typeof title === 'string' ? title.trim() : '';
    const b = typeof body === 'string' ? body.trim() : '';
    if (!t) return res.status(400).json({ error: '제목을 입력해주세요.' });
    if (t.length > 200) return res.status(400).json({ error: '제목은 200자 이내로 입력해주세요.' });
    if (b.length > 20000) return res.status(400).json({ error: '내용이 너무 깁니다(2만 자 이내).' });
    const cat = QA_CATEGORIES.includes(category) ? category : '';
    const priv = is_private === true;

    const result = await sql`
      INSERT INTO qa_questions (user_id, title, body, category, is_private)
      VALUES (${req.userId}, ${t}, ${b}, ${cat}, ${priv})
      RETURNING id, user_id, title, body, category, is_private, status, created_at, updated_at
    `;
    return res.status(201).json({ question: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
