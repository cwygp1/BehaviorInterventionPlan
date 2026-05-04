import jwt from 'jsonwebtoken';
import { sql } from './db';

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
