// 로그인 화면 안내 고르기(1103, mds/58 #8·#12·#14·#32) — contexts/AuthContext.jsx가 쓰는 순수 함수.
//   'expired'      쓰는 중 로그인이 끝남(일반) — 마지막으로 쓰던 내용이 저장 안 됐을 수 있다고만 알린다.
//   'expired-save' 빠른 기록 창 저장이 로그인이 끝나 실패했고, 다시 로그인하면 그 창을 되살린다(lib/quickResume).
//   'switched'     같은 브라우저 다른 탭에서 다른 계정으로 로그인함.

// 빠른 기록 창이 되살리기 재료를 남겼다고 알리는 창 이벤트 이름(lib/quickResume.js가 보냄).
export const QUICK_RESUME_EVENT = 'kb:quick-resume';
// 401 저장 실패와 되살리기 재료 기록 사이 허용 간격 — 같은 저장 흐름에서 나온 것만 잇는다.
export const RESUME_LINK_MS = 10000;

/** 401을 받았을 때 안내 — 로그인된 상태였을 때만 'expired', 이미 다른 안내가 있으면 그대로. */
export function noticeOn401(prev, hadUser) {
  if (prev) return prev;
  return hadUser ? 'expired' : '';
}

/** 저장(GET 아닌) 요청이 401이었나 — 빠른 기록 되살리기와 이을 수 있는 실패인지. */
export function isSaveRequest(method) {
  return !!method && String(method).toUpperCase() !== 'GET';
}

/**
 * 빠른 기록 창이 되살리기 재료를 남겼을 때 — 바로 앞 401이 저장 요청이었고 일반 만료 안내 중이면 'expired-save'로 바꾼다.
 * @param {string} prev  지금 안내
 * @param {{at:number}|null} lastSave401  마지막 저장 요청 401 시각(없으면 null)
 */
export function noticeOnQuickResume(prev, lastSave401, now = Date.now()) {
  if (prev !== 'expired' || !lastSave401) return prev;
  const gap = now - lastSave401.at;
  return gap >= 0 && gap <= RESUME_LINK_MS ? 'expired-save' : prev;
}

/**
 * 탭 돌아올 때 /api/me 확인 결과 — 로그아웃 상태 응답은 200 {user:null}이다(1103).
 * @returns {'switched'|'expired'|null} null이면 그대로 둔다
 */
export function noticeOnWhoCheck(cur, me) {
  if (!cur) return null;
  if (!me) return 'expired';
  if (me.id !== cur.id) return 'switched';
  return null;
}

export const NOTICE_TEXT = {
  expired: '로그인이 끝났어요. 다시 로그인해 주세요. 마지막으로 쓰던 내용은 저장되지 않았을 수 있어요.',
  'expired-save': '로그인이 끝나서 방금 기록을 저장하지 못했어요. 다시 로그인하면 쓰던 기록 창을 다시 열어 드려요. 내용을 확인하고 한 번 더 저장해 주세요.',
};
