import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sql } from '../../../lib/db';
import { signSessionToken, setAuthCookie, DEMO_TTL_SECONDS, getSessionFromReq } from '../../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached, ensureUserDemoColCached } from '../../../lib/ensureSchema';

// POST /api/auth/demo — 로그인 창 '▶ 3분 체험하기'(mds/46 D1, 1001 사용자 결정 '나안').
//   누를 때마다 임시 사용자를 한 명 만든다. 데이터는 모두 user_id로 갈리므로 동시에 여러 사람이
//   체험해도 서로의 학생·기록이 보이지 않는다(실제 교사 계정끼리와 같은 원리).
//   · 24시간 지난 체험 사용자는 여기서(다음 체험 시작 때) 지운다 — 학급·학생·기록은 CASCADE로 함께.
//   · 학급 '1반'을 미리 만들어 둔다 — 학급이 생기기 전에 학생 등록 창이 열리는 경고(mds/44 S14)를 피한다.
//   · 토큰에 demo:true + 24시간 만료. 막아야 할 쓰기(Q&A 글쓰기·공용 AI 설정)는 isDemoReq로 거른다.
//   · 생성 횟수 제한: 같은 IP 1시간 60명(학교 공용 IP에서 연수 중 교사 여럿이 눌러도 되게, mds/48 #7), 전체 1시간 300명. IP는 해시만 저장한다.
//   · 1009(mds/48): 같은 사이트에서 온 요청만(Origin·Host 대조 — 로그인된 교사 세션이 다른 사이트의 폼 전송으로 체험 계정으로 바뀌지 않게),
//     직전 체험 세션이 있으면 그 사용자를 먼저 지워 행이 쌓이지 않게, 24h 정리는 묶음(LIMIT)으로 따로 감싸 실패해도 체험 시작은 되게.
const PER_IP_PER_HOUR = 60;
const TOTAL_PER_HOUR = 300;
const CLEANUP_BATCH = 50;

function hostOf(v) { try { return new URL(String(v)).host.toLowerCase(); } catch (_e) { return ''; } }
// Origin(없으면 Referer)의 host가 요청 Host와 같아야 한다. 둘 다 없는 요청(옛 브라우저·도구)은 통과시키지 않는다.
function sameSite(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const from = hostOf(req.headers.origin) || hostOf(req.headers.referer);
  return !!host && !!from && from === host;
}

// 24시간 지난 체험 사용자 정리 — 묶음으로, 사용량 로그(SET NULL이라 고아가 남음)도 함께. 실패해도 체험 시작은 계속.
async function cleanupExpired() {
  try {
    const old = await sql`SELECT id FROM users WHERE is_demo = TRUE AND created_at < NOW() - INTERVAL '24 hours' ORDER BY created_at LIMIT ${CLEANUP_BATCH}`;
    const ids = old.rows.map((r) => r.id);
    if (!ids.length) return 0;
    await sql`DELETE FROM ai_usage_log WHERE user_id = ANY(${ids}::int[])`;
    await sql`DELETE FROM users WHERE id = ANY(${ids}::int[]) AND is_demo = TRUE`;
    return ids.length;
  } catch (e) {
    console.error('Demo cleanup skipped:', e?.message || e);
    return 0;
  }
}

// 직전 체험 세션(쿠키)이 있으면 그 사용자를 바로 지운다 — '처음부터'·'가입하기'마다 행이 쌓이지 않게. 진짜 사용자는 절대 건드리지 않는다(is_demo 확인).
async function deletePreviousDemo(req) {
  try {
    const sess = getSessionFromReq(req);
    if (!sess || !sess.demo || !sess.sub) return false;
    await sql`DELETE FROM ai_usage_log WHERE user_id = ${sess.sub}`;
    const del = await sql`DELETE FROM users WHERE id = ${sess.sub} AND is_demo = TRUE RETURNING id`;
    return del.rows.length > 0;
  } catch (e) {
    console.error('Previous demo delete skipped:', e?.message || e);
    return false;
  }
}

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
  if (!sameSite(req)) {
    return res.status(403).json({ error: '이 사이트의 로그인 창에서만 체험을 시작할 수 있어요.' });
  }
  try {
    // 기본 표(classes 등)는 /api/migrate가 만든다(핫패스에서 ensureSchema를 부르지 않는 원칙, lib/db.js). 열 자가치유만.
    await ensureUserTierColCached();
    await ensureUserRoleColCached();
    await ensureUserDemoColCached();

    // 1) 지난 체험 정리(묶음·실패 무시) + 직전 체험 세션은 바로 지움.
    await cleanupExpired();
    await deletePreviousDemo(req);

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
    if (mine >= PER_IP_PER_HOUR) {
      return res.status(429).json({ error: '같은 학교(같은 인터넷 회선)에서 한 시간 안에 체험을 너무 많이 시작했어요. 잠시 뒤 다시 눌러 주시거나, 이미 열려 있는 체험 화면을 함께 보세요.' });
    }
    if (total >= TOTAL_PER_HOUR) {
      return res.status(429).json({ error: '지금 체험하는 분이 많아요. 몇 분 뒤 다시 눌러 주세요.' });
    }

    // 3) 임시 사용자 — 비밀번호는 아무도 모르는 난수(로그인 창으로는 들어올 수 없음). used_tiers '3' = 가입 계정과 같은 간단 모드(mds/48 #12 — 체험과 가입 뒤 화면이 같게).
    const email = `demo-${crypto.randomUUID()}@demo.local`;
    const password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4);
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);
    const ins = await sql`
      INSERT INTO users (email, password_hash, name, school, terms_version, user_agent, is_demo, demo_ip, used_tiers)
      VALUES (${email}, ${password_hash}, '체험 선생님', '', 'demo', ${ua}, TRUE, ${ipH}, '3')
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
