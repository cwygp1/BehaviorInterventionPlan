// 길잡이(에스코트) 판정 — 순수 함수 (1001 사용자 결정, lib/escorts.js가 길을 정의).
//
// 길잡이는 선생님이 고른 일 하나를 실제 화면 위에서 한 단계씩 데려다 준다.
// 투어와 달리 '다음' 단추로 넘기지 않는다 — 선생님이 짚은 곳을 실제로 누르거나·화면에 도착하거나·
// 저장하면 저절로 넘어간다. 그래서 "지금 몇 번째 단계인가"를 매번 상태와 기록으로 다시 계산한다.
//
// 단계(step)의 done — 무엇이 되면 그 단계가 끝난 것인가:
//   상태(지금 화면을 보고 매번 다시 판정 — 되돌아가면 다시 '할 일'이 된다)
//     { hasClass: true }    반이 하나라도 골라져 있다
//     { hasStudents: true } 학생이 1명 이상 있다
//     { student: true }     학생이 골라져 있다
//     { page: 'observe' }   그 화면에 있다
//     { appear: '앵커' }    그 앵커가 화면에 있다(창·입력칸이 열림)
//   사건(한 번 일어나면 기록 — doneIds)
//     { click: true }       짚은 곳(el)을 눌렀다
//     { input: true }       짚은 곳(el) 안에서 글자를 썼다/골랐다
//     { signal: '종류' }    저장 신호(lib/escortSignal.js)가 왔다
//
// 상태 단계가 다시 안 맞게 되면(다른 화면으로 가거나 학생을 바꾸면) 커서가 그 단계로 돌아간다 —
// '길에서 벗어나면 돌아오는 길을 다시 짚는다'가 따로 구현 없이 된다.

/** 앵커 키 → 선택자. '#아이디'·'[속성]'은 그대로, 나머지는 data-help/data-tour (lib/helpText.js helpSelector와 같은 규칙). */
export const anchorSelector = (key) => (/^[#[.]/.test(key) ? key : `[data-help="${key}"],[data-tour="${key}"]`);

export const STATE_KINDS =['hasClass', 'hasStudents', 'student', 'page', 'appear'];
export const EVENT_KINDS = ['click', 'input', 'signal'];

/** 단계의 done 종류 하나 — 정의 검사(테스트)와 판정에 쓴다. */
export function doneKind(step) {
  const d = step && step.done;
  if (!d) return null;
  return [...STATE_KINDS, ...EVENT_KINDS].find((k) => d[k] !== undefined && d[k] !== false) || null;
}

export const isStateStep = (step) => STATE_KINDS.includes(doneKind(step));

/**
 * 상태 단계가 지금 맞는가.
 * @param {object} step
 * @param {{activePage:string, hasClass:boolean, studentCount:number, curStuId:any, has:(key:string)=>boolean}} ctx
 */
export function stateDone(step, ctx) {
  const d = step.done || {};
  switch (doneKind(step)) {
    case 'hasClass': return !!ctx.hasClass;
    case 'hasStudents': return (ctx.studentCount || 0) > 0;
    case 'student': return !!ctx.curStuId;
    case 'page': return ctx.activePage === d.page;
    case 'appear': return !!(ctx.has && ctx.has(d.appear));
    default: return false;
  }
}

/**
 * 이 단계가 지금 경로에 해당하는가 — onlyIf/skipIf { has: 앵커 } (IEP 경로 A/B처럼 화면에 따라 갈리는 길).
 */
export function applies(step, ctx) {
  const has = (k) => !!(ctx.has && ctx.has(k));
  if (step.onlyIf && step.onlyIf.has && !has(step.onlyIf.has)) return false;
  if (step.skipIf && step.skipIf.has && has(step.skipIf.has)) return false;
  return true;
}

/**
 * 지금 해야 할 단계의 번호 — 모두 끝났으면 steps.length.
 *   · 해당하지 않는 단계(applies=false)는 지나간다.
 *   · 상태 단계는 지금 맞으면 지나가고(선택 단계는 건너뛰기 기록도 인정),
 *   · 사건 단계는 doneIds에 있으면 지나간다. 또 뒤의 'appear' 단계가 이미 맞으면 지나간다 —
 *     화면이 그만큼 진행됐다면 앞의 누르기·쓰기는 (이전에) 한 것이다(예: 경로를 안 누르고 성취기준부터 고름,
 *     저장해 둔 목표를 불러와 고치는 중).
 * @param {Array} steps
 * @param {string[]|Set<string>} doneIds
 * @param {object} ctx  stateDone의 ctx
 */
export function escortCursor(steps, doneIds, ctx) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  const laterAppeared = (i) => steps.some((t, j) => j > i && doneKind(t) === 'appear' && applies(t, ctx) && stateDone(t, ctx));
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    if (!applies(s, ctx)) continue;
    if (isStateStep(s)) {
      if (stateDone(s, ctx)) continue;
      if (s.optional && done.has(s.id)) continue;
      return i;
    }
    if (done.has(s.id) || laterAppeared(i)) continue;
    return i;
  }
  return steps.length;
}

/**
 * 저장 신호가 왔을 때 끝난 것으로 칠 단계들 — 그 신호를 기다리는 단계(커서 뒤 첫 번째)와
 * 그 앞의 사건 단계 전부(저장까지 왔다면 앞의 '누르기·쓰기'도 한 것이다).
 * @returns {string[]} 새로 doneIds에 넣을 id들(없으면 빈 배열)
 */
export function idsDoneBySignal(steps, cursor, kind) {
  const at = steps.findIndex((s, i) => i >= cursor && s.done && s.done.signal === kind);
  if (at < 0) return [];
  return steps.slice(0, at + 1).filter((s) => !isStateStep(s)).map((s) => s.id);
}

/**
 * 짚을 앵커 — 단계에 el이 있으면 그것, '화면 가기' 단계면 사이드바 메뉴(nav-<화면>),
 * 홈에서는 영역 카드(pcard-<영역>)가 먼저 보이므로 그것을 짚는다.
 * 다른 영역에 있으면 그 영역 사이드바엔 메뉴가 없으므로 상단 영역 단추(tb-chip-<영역>)를 짚는다
 * (1001 실화면 확인: 행동 데이터 화면에서 IEP 길을 고르면 짚을 곳이 없었다).
 * @param {object} step
 * @param {string} activePage
 * @param {Record<string,string>} pageSection  lib/tiers.js PAGE_SECTION
 * @param {(key:string)=>boolean} [has]  화면에 그 앵커가 있는가(없으면 다음 후보)
 */
export function escortAnchor(step, activePage, pageSection, has) {
  if (!step) return null;
  if (step.el) return step.el;
  const page = step.done && step.done.page;
  if (!page) return null;
  const sec = pageSection[page];
  const cands = ['nav-' + page];
  if (activePage === 'home' && sec) cands.unshift('pcard-' + sec);
  else if (sec && pageSection[activePage] !== sec) cands.push('tb-chip-' + sec);
  if (!has) return cands[0];
  return cands.find((k) => has(k)) || null;
}

/**
 * 지금 추천할 길 — 기록 상태로 하나 고른다(없으면 null).
 * @param {{activePage:string, pageSection:Record<string,string>, hasClass:boolean, studentCount:number, totals?:{abc:number, mon:number}}} p
 */
export function recommendEscort({ activePage, pageSection, hasClass, studentCount, totals }) {
  if (!hasClass || !studentCount) return 'start';
  if (activePage === 'observe') return 'abc';
  if (activePage === 'monitor') return 'monitor';
  if ((pageSection || {})[activePage] === 'iep') return 'iep';
  const abc = totals?.abc || 0;
  const mon = totals?.mon || 0;
  if (abc === 0) return 'abc';
  if (mon === 0) return 'monitor';
  return null;
}
