import { sql } from '../../../lib/db';
import bcrypt from 'bcryptjs';
import { signSessionToken, setAuthCookie } from '../../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached, bootstrapAdminIfNone, BOOTSTRAP_ADMIN_EMAIL } from '../../../lib/ensureSchema';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, name, school, consent } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }

    // Terms agreement (required per service policy v1.0)
    if (!consent || !consent.terms_version) {
      return res.status(400).json({ error: '이용약관 동의가 필요합니다.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const terms_version = String(consent.terms_version).slice(0, 20);
    const user_agent = String(consent.user_agent || req.headers['user-agent'] || '').slice(0, 300);

    // used_tiers(메뉴 스코핑) 컬럼 자가치유 — 신규 가입자는 ''(미설정)로 시작해
    // 홈에서 사용 단계 선택을 유도한다.
    await ensureUserTierColCached();
    await ensureUserRoleColCached();
    const result = await sql`
      INSERT INTO users (email, password_hash, name, school, terms_version, terms_agreed_at, user_agent)
      VALUES (${email}, ${password_hash}, ${name}, ${school || ''}, ${terms_version}, NOW(), ${user_agent})
      RETURNING id, email, name, school, used_tiers, role, terms_version, terms_agreed_at, created_at
    `;

    const user = result.rows[0];

    // 소유자 이메일로 가입하는 순간 관리자 부트스트랩을 즉시 반영한다
    // (관리자가 0명일 때만 승격 — 이미 관리자가 있으면 아무 일도 없음).
    if (email === BOOTSTRAP_ADMIN_EMAIL) {
      await bootstrapAdminIfNone();
      const rr = await sql`SELECT role FROM users WHERE id = ${user.id}`;
      if (rr.rows[0]) user.role = rr.rows[0].role;
    }

    const token = signSessionToken({ sub: user.id, email: user.email });
    setAuthCookie(res, token);

    return res.status(201).json({ user });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
