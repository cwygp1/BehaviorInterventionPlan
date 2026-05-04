// API client — handles all fetch calls to /api/* endpoints.
// Cookie-based auth (httpOnly JWT) is automatic via credentials: 'same-origin'.
// 401 responses trigger an `onUnauthorized` callback so the UI can route to login.

let _onUnauthorized = null;

/**
 * Register a callback fired whenever an API call returns 401.
 * Used by AuthContext to clear local user state and show the login screen.
 */
export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
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
    if (_onUnauthorized) _onUnauthorized();
    const err = await r.json().catch(() => ({ error: '로그인이 필요합니다' }));
    throw new Error(err.error || '로그인이 필요합니다');
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: '요청 실패' }));
    throw new Error(err.error || '서버 오류');
  }
  return r.json();
}

/** Convenience wrappers — same shape as the legacy api() but typed by intent. */
export const apiGet = (path) => api(path, 'GET');
export const apiPost = (path, body) => api(path, 'POST', body);
export const apiPut = (path, body) => api(path, 'PUT', body);
export const apiDelete = (path, body) => api(path, 'DELETE', body);
