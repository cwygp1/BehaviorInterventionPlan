// 0903(B안): 문서(인쇄·Word)에 학기목표를 어떻게 찍을지 — 교사 브라우저 설정(로컬 저장).
//   'full'    = 학기목표 한 문장 + 성취기준별 목표 나열(기본값 — 줄은 문서에서 지우기 쉽지만 새로 쓰기는 어려우므로)
//   'summary' = 학기목표 한 문장만
const KEY = 'iep_goal_style';
export function getGoalStyle() {
  try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : ''; return v === 'summary' ? 'summary' : 'full'; } catch (_) { return 'full'; }
}
export function setGoalStyle(v) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, v === 'summary' ? 'summary' : 'full'); } catch (_) { /* 저장 불가 환경 */ }
}
/** 문서에 함께 찍을 성취기준별 목표 — 2개 이상일 때만(단일 성취기준은 학기목표 = 그 줄이라 종전 문서와 같다). */
export function stdGoalsForDoc(g) {
  if (getGoalStyle() === 'summary') return [];
  const sg = (Array.isArray(g?.std_goals) ? g.std_goals : []).filter((x) => x && x.code && String(x.goal || '').trim());
  return sg.length >= 2 ? sg : [];
}
