// 빠른 기록 창 '로그인이 끝나 저장 못 함' 되살리기(1102, mds/57 #6).
//   저장 중 401(세션 만료·다른 곳에서 로그아웃)이면 앱이 로그인 화면으로 내려가 창이 사라진다. 그때
//   ① 어느 학생·어느 기록 종류였는지(kb_quick_resume)와 ② 수치 칸 값(kb_monq_<학생id>)을 이 탭 저장소에 남기고,
//   같은 선생님이 다시 로그인하면 창을 다시 열어 쓰던 값을 채운다(관찰은 원래 있던 abcQuickDraft 초안이 맡는다).
//   kb_ 접두라 '로그아웃' 단추를 누르면 지워진다(AuthContext clearTabState) — 공용 PC 다음 사람에게 남지 않게.
import { QUICK_RESUME_EVENT } from './authNotice.js';

export const QUICK_RESUME_KEY = 'kb_quick_resume';
export const monQuickKey = (sid) => `kb_monq_${sid}`;
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 반나절 지난 것은 버린다

function store(s) {
  if (s) return s;
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (_e) { return null; }
}

export function writeQuickResume({ uid, sid, mode }, s, now = Date.now()) {
  const st = store(s);
  if (!st || uid == null || sid == null) return;
  try { st.setItem(QUICK_RESUME_KEY, JSON.stringify({ uid, sid, mode: mode || 'obs', at: now })); } catch (_e) { /* 사생활 모드 */ }
  // 1103(mds/58 #32): 로그인 화면이 '기록 창을 다시 열어 드려요' 안내를 이 경우에만 띄우도록 알린다(AuthContext가 받음).
  try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent(QUICK_RESUME_EVENT)); } catch (_e) { /* noop */ }
}

/**
 * 되살릴 창이 있으면 {sid, mode}를 돌려주고 지운다. 다른 선생님 것·오래된 것·지금 고를 수 없는 학생이면 지우고 null.
 * @param {number} uid  지금 로그인한 선생님 id
 * @param {(sid:number)=>boolean} [canOpen]  이 화면에서 열 수 있는 학생인가
 */
export function takeQuickResume(uid, canOpen, s, now = Date.now()) {
  const st = store(s);
  if (!st) return null;
  let v = null;
  try { v = JSON.parse(st.getItem(QUICK_RESUME_KEY) || 'null'); } catch (_e) { v = null; }
  if (!v) return null;
  const fresh = typeof v.at === 'number' && now - v.at >= 0 && now - v.at < MAX_AGE_MS;
  if (v.uid !== uid || !fresh) { try { st.removeItem(QUICK_RESUME_KEY); } catch (_e) { /* noop */ } return null; }
  if (canOpen && !canOpen(v.sid)) return null; // 이 화면에서는 못 엶 — 다른 화면(오늘 표)이 열도록 남겨 둔다
  try { st.removeItem(QUICK_RESUME_KEY); } catch (_e) { /* noop */ }
  return { sid: v.sid, mode: v.mode || 'obs' };
}
