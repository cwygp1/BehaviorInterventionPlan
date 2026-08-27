import { sql } from '../../../../lib/db';
import { requireRole } from '../../../../lib/auth';

const VALID_ROLES = ['user', 'admin'];

// 관리자 페이지 — 역할 변경(승격/해제).
//   PATCH /api/admin/users/[id]  body: { role: 'admin' | 'user' }
export default requireRole(['admin'], async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const targetId = Number(req.query.id);
  const { role } = req.body || {};

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: "role은 'user' 또는 'admin'이어야 합니다." });
  }
  // 자기 자신 강등 금지 — 마지막 관리자가 스스로를 해제해 관리자가 0명이 되는
  // 잠금 사고 방지. 자기 강등만 막으면 관리자는 항상 1명 이상 남는다.
  if (targetId === Number(req.userId) && role !== 'admin') {
    return res.status(400).json({ error: '자기 자신의 관리자 권한은 해제할 수 없습니다. 필요하면 다른 관리자가 해제해야 합니다.' });
  }

  try {
    const result = await sql`
      UPDATE users SET role = ${role} WHERE id = ${targetId}
      RETURNING id, email, name, school, role, created_at
    `;
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    return res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Admin role change error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
