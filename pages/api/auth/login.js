import { sql } from '../../../lib/db';
import bcrypt from 'bcryptjs';
import { signSessionToken, setAuthCookie } from '../../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached, bootstrapAdminIfNone, BOOTSTRAP_ADMIN_EMAIL } from '../../../lib/ensureSchema';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // used_tiers(메뉴 스코핑)·role(관리자)까지 함께 내려준다 — 컬럼이 없을 수 있어 자가치유 먼저.
    await ensureUserTierColCached();
    await ensureUserRoleColCached();
    // 소유자 이메일의 로그인은 관리자 부트스트랩(관리자 0명일 때만 승격)을 즉시
    // 반영한다 — SELECT 전에 실행해 이번 응답의 role부터 올바르게 내려가도록.
    if (email === BOOTSTRAP_ADMIN_EMAIL) await bootstrapAdminIfNone();
    const result = await sql`
      SELECT id, email, name, school, used_tiers, role, password_hash FROM users WHERE email = ${email}
    `;

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Issue session token (httpOnly cookie). The token's payload is
    // intentionally minimal — server re-fetches user data on /api/me.
    const token = signSessionToken({ sub: user.id, email: user.email });
    setAuthCookie(res, token);

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        school: user.school,
        used_tiers: user.used_tiers || '',
        role: user.role || 'user',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
