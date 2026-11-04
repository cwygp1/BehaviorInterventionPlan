// API client — handles all fetch calls to /api/* endpoints.
// Cookie-based auth (httpOnly JWT) is automatic via credentials: 'same-origin'.
// 401 responses trigger an `onUnauthorized` callback so the UI can route to login.

let _onUnauthorized = null;

/**
 * Register a callback fired whenever an API call returns 401.
 * Used by AuthContext to clear local user state and show the login screen.
 * 1103(mds/58 #32): 실패한 요청을 { method, path }로 넘긴다 — 저장 실패인지에 따라 로그인 화면 안내를 고른다.
 */
export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

// 1102(mds/57 #6): 오류에 HTTP 상태를 붙여 둔다(메시지는 예전 그대로) — 부르는 쪽이 '로그인이 끝나 저장 안 됨'을 가려낼 수 있게.
function withStatus(e, status) {
  e.status = status;
  return e;
}

export async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (r.status === 401) {
    if (_onUnauthorized) _onUnauthorized({ method, path });
    const err = await r.json().catch(() => ({ error: '로그인이 필요합니다' }));
    throw withStatus(new Error(err.error || '로그인이 필요합니다'), 401);
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: '요청 실패' }));
    throw withStatus(new Error(err.error || '서버 오류'), r.status);
  }
  return r.json();
}

/** Convenience wrappers — same shape as the legacy api() but typed by intent. */
export const apiGet = (path) => api(path, 'GET');
export const apiPost = (path, body) => api(path, 'POST', body);
export const apiPut = (path, body) => api(path, 'PUT', body);
export const apiDelete = (path, body) => api(path, 'DELETE', body);
