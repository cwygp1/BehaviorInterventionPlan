import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached } from '../../lib/ensureSchema';
import { normalizeUsedTiers } from '../../lib/tiers';

// GET   /api/me — return the authenticated user's profile, or 401 if no session.
//                 Used by the frontend on bootstrap to restore session state.
// PATCH /api/me — update the teacher's menu scoping (used_tiers, '1,2,3' CSV).
export default requireAuth(async function handler(req, res) {
  // 자가치유: /api/migrate 전에도 used_tiers·role 컬럼 조회/수정이 동작하도록 보정.
  await ensureUserTierColCached();
  await ensureUserRoleColCached();

  if (req.method === 'GET') {
    const result = await sql`
      SELECT id, email, name, school, used_tiers, role FROM users WHERE id = ${req.userId}
    `;
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json({ user: result.rows[0] });
  }

  if (req.method === 'PATCH') {
    // '1,2,3'의 부분집합만 허용, 최소 1개. 정렬·중복 제거 후 저장.
    const csv = normalizeUsedTiers((req.body || {}).used_tiers);
    if (!csv) {
      return res.status(400).json({ error: '최소 1개의 지원 단계(Tier)를 선택해야 합니다.' });
    }
    const result = await sql`
      UPDATE users SET used_tiers = ${csv} WHERE id = ${req.userId}
      RETURNING id, email, name, school, used_tiers, role
    `;
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json({ user: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
