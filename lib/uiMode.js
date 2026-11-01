// 화면 모양(새 디자인 / 기존 디자인) 선택 — 단일 출처 (mds/54 §4).
//   저장: users.ui_mode('' | 'new' | 'legacy') + 쿠키 kb_ui=new|legacy(HttpOnly 아님, 1년, SameSite=Lax).
//   ''(고른 적 없음)은 기존 디자인으로 연다(갑 결정 Q1 추천 — 기존 사용자 화면을 갑자기 바꾸지 않음).
//   체험 계정(is_demo)은 1단계에서 항상 기존 디자인(대본 앵커가 옛 화면 기준, mds/54 §1 조건 6).
//   middleware.js(엣지)도 이 파일을 쓰므로 Node 전용 모듈을 넣지 말 것.

export const UI_COOKIE = 'kb_ui';
// 체험 세션 표시 — middleware가 체험 중에는 /new로 보내지 않게(체험 쿠키 seai_session은 HttpOnly·JWT라 엣지에서 안 읽음).
export const DEMO_COOKIE = 'kb_demo';
export const UI_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** 'new' | 'legacy' | '' — 그 밖의 값은 ''. */
export function normalizeUiMode(v) {
  return v === 'new' || v === 'legacy' ? v : '';
}

/** 실제로 열 화면 — 'new' | 'legacy'. */
export function effectiveUiMode(user) {
  if (!user || user.is_demo) return 'legacy';
  return user.ui_mode === 'new' ? 'new' : 'legacy';
}

export function wantsNewDesign(user) {
  return effectiveUiMode(user) === 'new';
}

/** 브라우저에서 kb_ui 쿠키 읽기(로그인 창 기본값용). 없으면 ''. */
export function readUiCookie() {
  if (typeof document === 'undefined') return '';
  const m = /(?:^|;\s*)kb_ui=([^;]*)/.exec(document.cookie || '');
  return normalizeUiMode(m ? decodeURIComponent(m[1]) : '');
}

/** Set-Cookie 한 줄 — 서버(API)에서 쓴다. */
export function buildUiCookie(mode, isProd) {
  const parts = [`${UI_COOKIE}=${normalizeUiMode(mode) || 'legacy'}`, 'Path=/', 'SameSite=Lax', `Max-Age=${UI_COOKIE_MAX_AGE}`];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function buildDemoCookie(on, maxAgeSec, isProd) {
  const parts = [`${DEMO_COOKIE}=${on ? '1' : ''}`, 'Path=/', 'SameSite=Lax', `Max-Age=${on ? maxAgeSec : 0}`];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}
