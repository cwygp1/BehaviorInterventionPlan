// 해시 화면 이동 공용 조각 — pages/index.js(기존 디자인)에서 떼어 내 새 디자인(pages/new.js)과 같이 쓴다(mds/54 §3-2).
//   동작은 옮기기 전과 같다(글자 하나 바꾸지 않고 옮김).

// 화면 id 전체 목록 — 주소 해시(#dash3 등)로 화면을 복원할 때 유효성 검사에 쓴다.
// LegacyPageRouter의 case와 반드시 일치해야 한다(새 페이지 추가 시 여기도 추가).
// lib/utils/__tests__/routes.test.js가 lib/tiers.js PAGE_META와 같은지 검사한다.
export const VALID_PAGES = new Set([
  'home', 'dash1', 'dash2', 'dash3', 'dashIep', 'students', 'calendar', 'startpoint',
  'observe', 'qabf', 'bip', 'monitor', 'eval', 'iep', 'priorIep', 'iepReport',
  'builder', 'crisis', 'support', 'classpbs', 'pbssurvey', 'schoolrules', 'classcheck', 'classcheck2',
  'tier2', 'contract', 'tier3', 'videos', 'generator', 'admin', 'qaBoard', 'chatExpert',
]);

// 없어진 화면 id의 후계 화면 — 북마크·히스토리의 옛 해시를 새 화면으로 보낸다.
//   qa: 'PBS Q&A 전문가'(단발) → 'AI 전문가 채팅'으로 흡수 (2026-08-27)
export const LEGACY_PAGES = { qa: 'chatExpert' };

// 현재 주소 해시에서 화면 id를 읽는다. 유효하지 않으면 홈.
export function pageFromHash() {
  if (typeof window === 'undefined') return 'home';
  const h = (window.location.hash || '').replace(/^#\/?/, '');
  if (LEGACY_PAGES[h]) return LEGACY_PAGES[h];
  return VALID_PAGES.has(h) ? h : 'home';
}

// AI 생성 중 이동 확인(기존 문구 유지) — navigate와 브라우저 뒤로가기 양쪽에서 쓴다.
export function confirmLeaveWhileBusy() {
  return window.confirm(
    'AI가 생성 중입니다. 지금 다른 메뉴로 이동하면 생성 중인 결과가 사라질 수 있어요.\n그래도 이동할까요?'
  );
}

// 히스토리 깊이 백업 — Next.js 라우터가 부팅 때 현재 히스토리 항목의 state를
// 자기 것으로 덮어써서, 새로고침하면 pushState에 실어둔 idx가 사라진다.
// 같은 탭 안에서만 유효한 sessionStorage에 깊이를 함께 적어 두고 복원한다.
//   key: 기존 디자인 'kkobak-nav-idx', 새 디자인 'kkobak-nav-idx-new'(두 화면의 깊이가 섞이지 않게).
export const NAV_IDX_KEY = 'kkobak-nav-idx';
export const NEW_NAV_IDX_KEY = 'kkobak-nav-idx-new'; // 새 디자인(lib/hooks/useNewRouter.js) 깊이 키 — 디자인 전환 때 0으로(mds/56 #17)
export function saveNavIdx(idx, key = NAV_IDX_KEY) {
  try { window.sessionStorage.setItem(key, String(idx)); } catch (_e) { /* noop */ }
}
export function loadNavIdx(key = NAV_IDX_KEY) {
  try {
    const n = parseInt(window.sessionStorage.getItem(key) || '', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (_e) { return 0; }
}
