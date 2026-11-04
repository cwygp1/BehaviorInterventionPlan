// mds/58 auth-24(1104) — 로그아웃한 세션 토큰 무효화: 순수 함수·캐시 + 연결 정적 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tokenVersionOf, isTokenVersionCurrent, createVersionCache, TOKEN_VERSION_TTL_MS } from '../../sessionVersion.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('tv 없는 옛 토큰은 버전 0으로 본다', () => {
  assert.equal(tokenVersionOf({ sub: 1, email: 'a' }), 0);
  assert.equal(tokenVersionOf(null), 0);
  assert.equal(tokenVersionOf({ tv: 'x' }), 0);
  assert.equal(tokenVersionOf({ tv: -1 }), 0);
  assert.equal(tokenVersionOf({ tv: 1.5 }), 0);
  assert.equal(tokenVersionOf({ tv: 3 }), 3);
});

test('DB 버전 0이면 tv 없는 옛 토큰도 통과(배포 직후 모두 로그아웃되지 않음)', () => {
  assert.equal(isTokenVersionCurrent({ sub: 1 }, 0), true);
  assert.equal(isTokenVersionCurrent({ sub: 1, tv: 0 }, 0), true);
});

test('로그아웃으로 DB 버전이 오르면 옛 토큰은 무효, 새 토큰은 유효', () => {
  assert.equal(isTokenVersionCurrent({ sub: 1 }, 1), false);
  assert.equal(isTokenVersionCurrent({ sub: 1, tv: 0 }, 1), false);
  assert.equal(isTokenVersionCurrent({ sub: 1, tv: 1 }, 1), true);
  assert.equal(isTokenVersionCurrent({ sub: 1, tv: 1 }, '1'), true); // 드라이버가 문자열로 줘도
});

test('사용자 행이 없으면(지운 체험 계정 등) 무효', () => {
  assert.equal(isTokenVersionCurrent({ sub: 1 }, null), false);
  assert.equal(isTokenVersionCurrent({ sub: 1 }, undefined), false);
});

test('버전 캐시 — TTL 안에서는 값, 지나면 없음, 덮어쓰기·지우기', () => {
  let t = 1000;
  const c = createVersionCache({ ttlMs: 30000, now: () => t });
  assert.equal(c.get(7), undefined);
  c.set(7, 0);
  assert.deepEqual(c.get(7), { version: 0 });
  assert.deepEqual(c.get('7'), { version: 0 }); // 숫자·문자 id 같게
  t += 29999;
  assert.deepEqual(c.get(7), { version: 0 });
  c.set(7, 1); // 로그아웃한 인스턴스는 바로 새 값
  assert.deepEqual(c.get(7), { version: 1 });
  t += 30001;
  assert.equal(c.get(7), undefined);
  c.set(8, null);
  assert.deepEqual(c.get(8), { version: null });
  c.delete(8);
  assert.equal(c.get(8), undefined);
  assert.equal(TOKEN_VERSION_TTL_MS, 30000);
});

test('버전 캐시 — 상한을 넘으면 비우고 다시 채운다(메모리 무한 증가 없음)', () => {
  const c = createVersionCache({ max: 3 });
  c.set(1, 0); c.set(2, 0); c.set(3, 0);
  c.set(4, 0);
  assert.equal(c.size(), 1);
  assert.deepEqual(c.get(4), { version: 0 });
});

test('연결 — requireAuth는 버전까지 확인, 로그인은 tv를 싣고, 로그아웃은 버전을 올림', () => {
  const auth = read('lib/auth.js');
  const requireAuthBody = auth.slice(auth.indexOf('export function requireAuth'), auth.indexOf('export function isDemoReq'));
  assert.match(requireAuthBody, /await getVerifiedSessionFromReq\(req\)/);
  assert.match(auth, /WHERE id = \$\{session\.sub\} AND token_version = \$\{tv\}/); // 옛 토큰으로 현재 세션을 끊지 못함
  assert.match(auth, /currentTokenVersion\(userId, true\)/); // 로그인은 캐시 건너뜀
  const login = read('pages/api/auth/login.js');
  assert.match(login, /signSessionToken\(\{ sub: user\.id, email: user\.email, tv \}\)/);
  const logout = read('pages/api/auth/logout.js');
  assert.match(logout, /revokeSessionsOf\(sess\)/);
  assert.ok(logout.indexOf('revokeSessionsOf(sess)') < logout.indexOf('clearAuthCookie(res)'));
});

test('DB는 추가만 — token_version 열 자가치유 + runMigrations 연결', () => {
  const s = read('lib/ensureSchema.js');
  assert.match(s, /ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0/);
  assert.match(s, /export function ensureUserTokenVersionColCached/);
  const run = s.slice(s.indexOf('async function runMigrations'), s.indexOf('await ensureQaSchema();'));
  assert.match(run, /await ensureUserTokenVersionCol\(\);/);
});

test('/api/me — 쿠키 없을 때 200 { user: null }은 그대로', () => {
  const me = read('pages/api/me.js');
  assert.match(me, /if \(req\.method === 'GET' && !getSessionFromReq\(req\)\) \{\s*return res\.status\(200\)\.json\(\{ user: null \}\);/);
});
