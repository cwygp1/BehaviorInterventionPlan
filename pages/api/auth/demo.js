import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sql } from '../../../lib/db';
import { signSessionToken, setAuthCookie, DEMO_TTL_SECONDS } from '../../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached, ensureUserDemoColCached } from '../../../lib/ensureSchema';

// POST /api/auth/demo — 로그인 창 '▶ 3분 체험하기'(mds/46 D1, 1001 사용자 결정 '나안').
//   누를 때마다 임시 사용자를 한 명 만든다. 데이터는 모두 user_id로 갈리므로 동시에 여러 사람이
//   체험해도 서로의 학생·기록이 보이지 않는다(실제 교사 계정끼리와 같은 원리).
//   · 24시간 지난 체험 사용자는 여기서(다음 체험 시작 때) 지운다 — 학급·학생·기록은 CASCADE로 함께.
//   · 학급 '1반'을 미리 만들어 둔다 — 학급이 생기기 전에 학생 등록 창이 열리는 경고(mds/44 S14)를 피한다.
//   · 토큰에 demo:true + 24시간 만료. 막아야 할 쓰기(Q&A 글쓰기·공용 AI 설정)는 isDemoReq로 거른다.
//   · 생성 횟수 제한: 같은 IP 1시간 10명, 전체 1시간 300명. IP는 해시만 저장한다.
const PER_IP_PER_HOUR = 10;
const TOTAL_PER_HOUR = 300;

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function ipHash(ip) {
  const salt = process.env.JWT_SECRET || 'demo';
  return crypto.createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32);
}

// 한국 시간 기준 올해 — 서버(UTC)에서 1월 1일 새벽에 작년으로 잡히지 않게.
function kstYear() {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    await ensureUserTierColCached();
    await ensureUserRoleColCached();
    await ensureUserDemoColCached();

    // 1) 지난 체험 정리 — 24시간 지난 것만.
    await sql`DELETE FROM users WHERE is_demo = TRUE AND created_at < NOW() - INTERVAL '24 hours'`;

    // 2) 생성 횟수 제한.
    const ipH = ipHash(clientIp(req));
    const cnt = await sql`
      SELECT
        COUNT(*) FILTER (WHERE demo_ip = ${ipH})::int AS mine,
        COUNT(*)::int AS total
      FROM users
      WHERE is_demo = TRUE AND created_at > NOW() - INTERVAL '1 hour'
    `;
    const { mine = 0, total = 0 } = cnt.rows[0] || {};
    if (mine >= PER_IP_PER_HOUR || total >= TOTAL_PER_HOUR) {
      return res.status(429).json({ error: '체험 계정을 너무 많이 만들었어요. 잠시 뒤 다시 눌러 주세요.' });
    }

    // 3) 임시 사용자 — 비밀번호는 아무도 모르는 난수(로그인 창으로는 들어올 수 없음).
    const email = `demo-${crypto.randomUUID()}@demo.local`;
    const password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4);
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    const ins = await sql`
      INSERT INTO users (email, password_hash, name, school, terms_version, user_agent, is_demo, demo_ip)
      VALUES (${email}, ${password_hash}, '체험 선생님', '', 'demo', ${ua}, TRUE, ${ipH})
      RETURNING id, email, name, school, used_tiers, role, is_demo
    `;
    const user = ins.rows[0];

    // 4) 학급 '1반' 미리 만들기.
    await sql`
      INSERT INTO classes (user_id, school_year, name)
      VALUES (${user.id}, ${kstYear()}, '1반')
      ON CONFLICT DO NOTHING
    `;

    const token = signSessionToken({ sub: user.id, email: user.email, demo: true }, DEMO_TTL_SECONDS);
    setAuthCookie(res, token, DEMO_TTL_SECONDS);
    return res.status(201).json({ user });
  } catch (error) {
    console.error('Demo account error:', error);
    return res.status(500).json({ error: '체험 계정을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.' });
  }
}
