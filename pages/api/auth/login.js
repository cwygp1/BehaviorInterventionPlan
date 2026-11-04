import { sql } from '../../../lib/db';
import bcrypt from 'bcryptjs';
import { signSessionToken, setAuthCookie, setUiCookie, setDemoCookie, tokenVersionForLogin } from '../../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached, ensureUserDemoColCached, ensureUserUiModeColCached, bootstrapAdminIfNone, BOOTSTRAP_ADMIN_EMAIL } from '../../../lib/ensureSchema';
import { normalizeUiMode, effectiveUiMode } from '../../../lib/uiMode';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};
    // 1101(mds/54 §4): 로그인 창에서 고른 화면 모양 — 'new' | 'legacy'. 없으면 저장값 그대로.
    const uiPick = normalizeUiMode((req.body || {}).ui_mode);

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // used_tiers(메뉴 스코핑)·role(관리자)까지 함께 내려준다 — 컬럼이 없을 수 있어 자가치유 먼저.
    await ensureUserTierColCached();
    await ensureUserRoleColCached();
    await ensureUserDemoColCached();
    await ensureUserUiModeColCached();
    // 소유자 이메일의 로그인은 관리자 부트스트랩(관리자 0명일 때만 승격)을 즉시
    // 반영한다 — SELECT 전에 실행해 이번 응답의 role부터 올바르게 내려가도록.
    if (email === BOOTSTRAP_ADMIN_EMAIL) await bootstrapAdminIfNone();
    const result = await sql`
      SELECT id, email, name, school, used_tiers, role, is_demo, ui_mode, password_hash FROM users WHERE email = ${email}
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
    // 1104(mds/58 auth-24): 토큰에 세션 버전(tv)을 싣는다 — 로그아웃하면 DB 값이 올라가 이 토큰은 무효.
    const tv = await tokenVersionForLogin(user.id);
    const token = signSessionToken({ sub: user.id, email: user.email, tv });
    setAuthCookie(res, token);

    // 화면 모양: 고른 값이 있으면 저장하고, 쿠키는 로그인 성공마다 덮어쓴다(공용 PC에서 전 사람 선택이 남지 않게).
    let uiMode = normalizeUiMode(user.ui_mode);
    if (uiPick && uiPick !== uiMode) {
      try {
        await sql`UPDATE users SET ui_mode = ${uiPick} WHERE id = ${user.id}`;
        uiMode = uiPick;
      } catch (e) {
        console.error('Login: ui_mode save skipped', e?.message || e);
      }
    }
    const effective = effectiveUiMode({ ui_mode: uiMode, is_demo: !!user.is_demo });
    setUiCookie(res, effective);
    setDemoCookie(res, false);

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        school: user.school,
        used_tiers: user.used_tiers || '',
        role: user.role || 'user',
        is_demo: !!user.is_demo,
        ui_mode: effective,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
