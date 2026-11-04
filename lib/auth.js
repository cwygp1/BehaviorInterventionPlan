import jwt from 'jsonwebtoken';
import { sql } from './db';
import { ensureUserRoleColCached, ensureUserTokenVersionColCached } from './ensureSchema';
import { buildUiCookie, buildDemoCookie } from './uiMode';
import { tokenVersionOf, isTokenVersionCurrent, createVersionCache } from './sessionVersion';

// ---- Config ----
const COOKIE_NAME = 'seai_session';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
// 체험 계정(mds/46 D1) — 24시간 뒤 다음 체험 시작 때 지워지므로 토큰·쿠키도 24시간만 산다.
export const DEMO_TTL_SECONDS = 24 * 60 * 60;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Fail loud — never silently fall back to a weak default in production.
    throw new Error(
      'JWT_SECRET is not set or is too short. Set a 64+ char random value in your environment.'
    );
  }
  return secret;
}

// ---- Token sign/verify ----
export function signSessionToken(payload, ttlSec = TOKEN_TTL_SECONDS) {
  return jwt.sign(payload, getSecret(), { expiresIn: ttlSec });
}

export function verifySessionToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (_err) {
    return null;
  }
}

// ---- Cookie helpers ----
function buildCookie(value, maxAgeSec) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function setAuthCookie(res, token, ttlSec = TOKEN_TTL_SECONDS) {
  res.setHeader('Set-Cookie', buildCookie(token, ttlSec));
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', buildCookie('', 0));
}

// 이미 붙은 Set-Cookie(세션 쿠키)를 덮지 않고 한 줄 더 붙인다.
export function appendCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  const list = prev == null ? [] : Array.isArray(prev) ? prev : [String(prev)];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

// 화면 모양 쿠키 kb_ui(new|legacy) — 로그인·가입·/api/me가 발급(mds/54 §4-2). 로그아웃은 지우지 않는다.
export function setUiCookie(res, mode) {
  appendCookie(res, buildUiCookie(mode, process.env.NODE_ENV === 'production'));
}

// 체험 세션 표시 kb_demo — middleware가 체험 중엔 /new로 보내지 않게. 체험 시작에 켜고, 로그인·가입·로그아웃에 끈다.
export function setDemoCookie(res, on, maxAgeSec = DEMO_TTL_SECONDS) {
  appendCookie(res, buildDemoCookie(on, maxAgeSec, process.env.NODE_ENV === 'production'));
}

// 요청 쿠키 하나 읽기(kb_ui 등).
export function readReqCookie(req, name) {
  return parseCookies(req)[name] || '';
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// ---- Request helpers ----
// 서명·만료만 본다(동기). 로그아웃으로 무효가 된 토큰인지까지 보려면 getVerifiedSessionFromReq.
export function getSessionFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || !payload.sub) return null;
  return payload; // { sub: userId, email, tv?, demo?, iat, exp }
}

// ---- 세션 토큰 버전(mds/58 auth-24, 1104) ----
// users.token_version을 사용자별로 짧게 캐시(lib/sessionVersion.js). 로그아웃한 인스턴스는 바로 새 값으로 덮는다.
const versionCache = createVersionCache();

// 현재 DB 버전. 사용자 행이 없으면 null. DB 오류는 throw. fresh=true면 캐시를 건너뛰고 DB에서 읽는다.
async function currentTokenVersion(userId, fresh = false) {
  if (!fresh) {
    const hit = versionCache.get(userId);
    if (hit) return hit.version;
  }
  await ensureUserTokenVersionColCached();
  const r = await sql`SELECT token_version FROM users WHERE id = ${userId}`;
  const v = r.rows[0] ? Number(r.rows[0].token_version) || 0 : null;
  versionCache.set(userId, v);
  return v;
}

// 로그인 때 JWT에 실을 버전(열이 없으면 만든 뒤 읽음). 실패하면 0(옛 동작과 같음).
//   반드시 DB에서 새로 읽는다 — 다른 인스턴스에서 로그아웃한 직후 이 인스턴스 캐시가 옛 값이면
//   옛 버전으로 발급돼 캐시가 끝나는 30초 뒤 갑자기 로그아웃되기 때문.
export async function tokenVersionForLogin(userId) {
  try {
    const v = await currentTokenVersion(userId, true);
    return v === null ? 0 : v;
  } catch (e) {
    console.error('token_version read skipped:', e?.message || e);
    return 0;
  }
}

// 이 세션 토큰이 아직 유효한 버전인지. DB를 못 읽으면(일시 장애) 통과시킨다 — 그때는 뒤 처리도 어차피 실패하므로
//   멀쩡한 교사를 로그아웃시키지 않는 쪽을 고른다. 버전이 다르거나 사용자 행이 없으면 false.
export async function isSessionCurrent(session) {
  if (!session || !session.sub) return false;
  let dbVersion;
  try {
    dbVersion = await currentTokenVersion(session.sub);
  } catch (e) {
    console.error('token_version check skipped (DB):', e?.message || e);
    return true;
  }
  return isTokenVersionCurrent(session, dbVersion);
}

// 서명·만료 + 로그아웃 여부까지 확인한 세션(비동기). 무효면 null.
export async function getVerifiedSessionFromReq(req) {
  const session = getSessionFromReq(req);
  if (!session) return null;
  return (await isSessionCurrent(session)) ? session : null;
}

// 사용자 행을 지웠을 때(체험 계정 정리) 이 인스턴스 캐시를 바로 비운다 — 30초 동안 지운 계정 토큰이 통과하지 않게.
export function forgetTokenVersion(userId) {
  if (userId !== undefined && userId !== null) versionCache.delete(userId);
}

// 로그아웃: 이 토큰의 버전이 지금 버전일 때만 +1(이미 무효인 옛 토큰으로 남의 현재 세션을 끊지 못하게).
//   이 인스턴스 캐시는 바로 새 값으로. 성공하면 true.
export async function revokeSessionsOf(session) {
  if (!session || !session.sub) return false;
  await ensureUserTokenVersionColCached();
  const tv = tokenVersionOf(session);
  const r = await sql`
    UPDATE users SET token_version = token_version + 1
    WHERE id = ${session.sub} AND token_version = ${tv}
    RETURNING token_version
  `;
  if (r.rows[0]) {
    versionCache.set(session.sub, Number(r.rows[0].token_version) || 0);
    return true;
  }
  versionCache.delete(session.sub);
  return false;
}

// HOF: wrap a handler so it requires authentication. Adds `req.userId` and `req.session`.
export function requireAuth(handler) {
  return async function authed(req, res) {
    // 1104(mds/58 auth-24): 서명·만료에 더해 로그아웃으로 무효가 된 토큰도 막는다.
    const session = await getVerifiedSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.session = session;
    req.userId = session.sub;
    return handler(req, res);
  };
}

// 체험 계정인지 — 토큰에 demo:true를 실어 두므로 DB 조회 없이 판단한다(requireAuth 뒤에서 사용).
export function isDemoReq(req) {
  return !!(req && req.session && req.session.demo);
}

// 체험 계정이 쓰면 안 되는 쓰기(Q&A 글쓰기·공용 AI 설정)를 막을 때 쓰는 공통 응답.
export function rejectDemo(res) {
  return res.status(403).json({ error: '체험 계정에서는 쓸 수 없는 기능이에요. 가입하면 바로 쓸 수 있어요.', demo: true });
}

// 1009(mds/48 #2): 공용 AI 설정·사용량 통계·단가 관리 비밀번호 — 서버에서만 비교한다(번들에 두지 않음).
//   값은 환경변수 AI_EDIT_PASSWORD, 없으면 종전 값. 클라이언트는 사용자가 친 비밀번호를 그대로 보내고 /api/usage/unlock으로 확인한다.
export function checkEditPassword(pw) {
  const want = process.env.AI_EDIT_PASSWORD || 'clsrnfkd';
  return typeof pw === 'string' && pw.length > 0 && pw === want;
}

// 현재 사용자의 role 조회 — requireAuth 이후, 권한으로 '차단'이 아니라
// '분기'가 필요한 API용(예: Q&A 목록의 비공개 글 필터).
export async function getUserRole(userId) {
  await ensureUserRoleColCached();
  const result = await sql`SELECT role FROM users WHERE id = ${userId}`;
  return (result.rows[0] && result.rows[0].role) || 'user';
}

// HOF: require auth AND one of the given roles (예: requireRole(['admin'], h)).
// Role은 JWT payload가 아니라 DB에서 요청마다 확인한다 — 토큰은 7일 유효라
// 중간에 승격/해제해도 반영되지 않기 때문("payload 최소, 서버 재조회" 원칙).
export function requireRole(roles, handler) {
  return requireAuth(async function roled(req, res) {
    const role = await getUserRole(req.userId);
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.role = role;
    return handler(req, res);
  });
}

// HOF: require auth AND verify the studentId in the URL belongs to the user.
// Use for /api/students/[studentId]/* routes.
export function requireStudentAccess(handler) {
  return requireAuth(async function (req, res) {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }
    const result = await sql`
      SELECT id FROM students WHERE id = ${studentId} AND user_id = ${req.userId}
    `;
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return handler(req, res);
  });
}
