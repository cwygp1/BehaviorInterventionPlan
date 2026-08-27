import jwt from 'jsonwebtoken';
import { sql } from './db';
import { ensureUserRoleColCached } from './ensureSchema';

// ---- Config ----
const COOKIE_NAME = 'seai_session';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
export function signSessionToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL_SECONDS });
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

export function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', buildCookie(token, TOKEN_TTL_SECONDS));
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', buildCookie('', 0));
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
export function getSessionFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || !payload.sub) return null;
  return payload; // { sub: userId, email, iat, exp }
}

// HOF: wrap a handler so it requires authentication. Adds `req.userId` and `req.session`.
export function requireAuth(handler) {
  return async function authed(req, res) {
    const session = getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.session = session;
    req.userId = session.sub;
    return handler(req, res);
  };
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
