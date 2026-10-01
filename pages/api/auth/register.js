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
    // 1001(mds/46 D3): 새 가입자는 '간단 모드'로 시작 — used_tiers='3'(IEP + Tier 3만 앞에, 나머지는 '더 보기').
    //   사이드바 아래 '모든 메뉴 보기'로 언제든 끈다(lib/onboarding.js isSimpleMode).
    const result = await sql`
      INSERT INTO users (email, password_hash, name, school, terms_version, terms_agreed_at, user_agent, used_tiers)
      VALUES (${email}, ${password_hash}, ${name}, ${school || ''}, ${terms_version}, NOW(), ${user_agent}, '3')
      RETURNING id, email, name, school, used_tiers, role, terms_version, terms_agreed_at, created_at
    `;

    const user = result.rows[0];

    // 1001(mds/46 방법 3): 학급 '1반'을 가입과 함께 만든다 — 화면이 학급을 만들기 전에 학생 등록 창이 열려
    //   '선택된 학급이 없습니다' 경고가 뜨던 틈(mds/44 S14 유력 원인)을 없앤다. 실패해도 가입은 그대로(화면이 다시 만든다).
    try {
      const kstYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
      await sql`INSERT INTO classes (user_id, school_year, name) VALUES (${user.id}, ${kstYear}, '1반') ON CONFLICT DO NOTHING`;
    } catch (e) {
      console.error('Register: default class create failed', e);
    }

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
