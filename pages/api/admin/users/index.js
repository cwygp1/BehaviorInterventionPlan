import { sql } from '../../../../lib/db';
import { requireRole } from '../../../../lib/auth';

// 관리자 페이지 — 가입자 목록.
//   GET /api/admin/users → { users: [{ id, email, name, school, role, created_at }] }
// 계정 관리 정보만 다룬다 — 학생 데이터 등 개인 작업물은 노출하지 않는다.
export default requireRole(['admin'], async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await sql`
      SELECT id, email, name, school, role, created_at
      FROM users
      ORDER BY created_at ASC, id ASC
    `;
    return res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error('Admin users list error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
