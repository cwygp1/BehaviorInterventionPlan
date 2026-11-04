// 새 디자인 4단계 — IEP 목표 카드·초안 저장·'이달 평가'의 판단만 모은 순수 모듈(mds/54 §5·§7, mds/52 §5-2·§9 D1).
//   React·DB 없음 → node --test(lib/utils/__tests__/iepCard.test.js). 서버(iep API 상태 정규화)와 화면이 같은 함수를 쓴다.
//
//   · 상태(status): 'active'(기본 — 기존 행 전부) | 'draft'(학기목표만 적고 저장, 월별 계획 없음)
//       규칙: 월별 계획이 하나라도 있으면 언제나 'active'. 없으면 body에 보낸 값 → 없으면 기존 값 유지(부분 갱신) → 새 행은 'active'.
//       그래서 옛 화면(IepPage는 월별 없으면 저장을 막음·IepReportPage·PriorIepPage)은 status를 보내지 않아도 예전과 같다.
//   · 월 평가 부분 갱신: 목표의 monthly 배열에서 '그 달 칸 하나'만 바꾼 새 배열 — 다른 달 평가는 그대로.
//       저장은 { id, monthly } 만 보내고(서버 부분 갱신 규약), 보내기 직전에 서버의 최신 목표를 다시 받아 그 위에 합친다.
//   · 이달 평가 표시(eval_at·eval_mark): 규칙 초안·AI가 평가 칸(eval)에 '평가 방법' 문장을 미리 채우므로 '빈 칸'으로는
//       평가했는지 알 수 없다 → 새 디자인에서 평가를 적으면 그 칸에 eval_at(날짜)·eval_mark(달성/부분/미달)를 함께 둔다.
//       monthly는 JSONB라 열 추가 없이 칸 안 키만 늘어난다(기존 출력 함수는 모르는 키를 무시).
import { guardEvalText, isQuestionList } from './utils/iepEvalGuard.js';
import { nounEndText } from './iepEvalNoun.js';

export const STATUS_ACTIVE = 'active';
export const STATUS_DRAFT = 'draft';

/** 아무 값 → 'active' | 'draft'. 모르는 값은 'active'. */
export function normStatus(v) {
  return String(v || '').trim() === STATUS_DRAFT ? STATUS_DRAFT : STATUS_ACTIVE;
}

/** 초안인가(열이 없던 옛 행은 status가 없으니 active). */
export function isDraft(g) {
  return !!g && normStatus(g.status) === STATUS_DRAFT;
}

/** 초안이 아닌 목표만(목표 수·인쇄·나이스 복사·현황판에 쓰는 목록). */
export function activeGoals(goals) {
  return (Array.isArray(goals) ? goals : []).filter((g) => !isDraft(g));
}

/**
 * 저장할 상태 결정(서버 iep API가 쓴다).
 * @param {{hasBodyStatus:boolean, bodyStatus?:any, curStatus?:any, monthlyLen:number}} p
 */
export function resolveGoalStatus({ hasBodyStatus, bodyStatus, curStatus, monthlyLen }) {
  if ((Number(monthlyLen) || 0) > 0) return STATUS_ACTIVE;
  if (hasBodyStatus) return normStatus(bodyStatus);
  if (curStatus != null && curStatus !== '') return normStatus(curStatus);
  return STATUS_ACTIVE;
}

// ── 월 라벨 ─────────────────────────────────────────────────────────
// IepPage와 같은 학사일정 순서(IepPage.jsx MONTH_POOL·expandMonthLabel — 그 파일은 고치지 않으려고 같은 규칙을 둔다).
export const monthPool = (sem) => (String(sem) === '2' ? [9, 10, 11, 12, 1, 2] : [3, 4, 5, 6, 7, 8]);

/** 저장된 월 라벨("3-4", "5", "3·5") → 월 배열. */
export function expandMonthLabel(label, sem) {
  const pool = monthPool(sem);
  const s = String(label == null ? '' : label).trim();
  const mm = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (mm) {
    const a = pool.indexOf(+mm[1]); const b = pool.indexOf(+mm[2]);
    if (a >= 0 && b >= 0 && a <= b) return pool.slice(a, b + 1);
  }
  return s.split(/[·,]/).map((x) => parseInt(x, 10)).filter((n) => pool.includes(n));
}

/** 이 달(1~12)이 들어 있는 monthly 칸 번호, 없으면 -1. */
export function monthIndexFor(monthly, month, sem) {
  const list = Array.isArray(monthly) ? monthly : [];
  const m = Number(month);
  return list.findIndex((e) => expandMonthLabel(e && e.month, sem).includes(m));
}

/**
 * 카드 월 평가가 들어갈 칸 — 화면의 칸 번호(monthIdx)와 그 칸의 월 라벨(monthLabel)을 함께 받아 서버 최신 배열에서 확인한다(mds/56 #32).
 *   다른 탭·기기에서 월 묶기를 바꿔 배열이 달라졌으면 번호만 믿고 엉뚱한 달에 쓰지 않는다.
 *   monthIdx가 없으면 이번 달(month)로 찾는다(빠른 기록 '이달 평가'와 같은 규칙).
 * @returns {number} 칸 번호 · -1 = 그 달 칸 없음 · -2 = 월별 계획이 바뀜(번호 자리의 라벨이 다르고 같은 라벨 칸도 하나로 안 정해짐)
 */
export function evalIndexFor(monthly, { monthIdx, monthLabel, month, sem } = {}) {
  const list = Array.isArray(monthly) ? monthly : [];
  if (monthIdx != null && monthIdx >= 0) {
    if (monthLabel === undefined) return monthIdx < list.length ? monthIdx : -1;
    const e = list[monthIdx];
    if (e && String(e.month) === String(monthLabel)) return monthIdx;
    const same = [];
    list.forEach((x, i) => { if (x && String(x.month) === String(monthLabel)) same.push(i); });
    return same.length === 1 ? same[0] : -2;
  }
  return monthIndexFor(list, month, sem);
}

/** 이 칸을 새 디자인에서 평가했는가(eval_at 또는 eval_mark). */
export const isMonthMarked = (e) => !!(e && (e.eval_at || e.eval_mark));

export const EVAL_MARKS = ['달성', '부분', '미달'];

/**
 * 표시만 고르고 한 줄 평가를 비웠을 때 넣는 기본 문장(개조식 명사형 — evalSafeText를 그대로 통과).
 *   옛 IEP 현황판·그래프·계획서는 eval 글만 보므로, 글이 비면 그 달이 '평가 안 함'으로 세어지던 문제(mds/56 #4).
 */
export const MARK_DEFAULT_EVAL = { 달성: '이달 목표 달성함', 부분: '이달 목표 일부 달성함', 미달: '이달 목표 미달성함' };
export const isDefaultEval = (t) => Object.values(MARK_DEFAULT_EVAL).includes(String(t || '').trim());

/** 저장할 eval 글 — 적은 글이 있으면 안전망을 거친 그 글, 비었거나 기본 문장 그대로면 표시에 맞는 기본 문장(표시도 없으면 ''). */
export function evalTextFor(text, mark) {
  const m = EVAL_MARKS.includes(mark) ? mark : '';
  const t = String(text || '').trim();
  if (!t || isDefaultEval(t)) return m ? MARK_DEFAULT_EVAL[m] : '';
  return evalSafeText(t);
}

/**
 * 교사가 적은 한 줄 평가 → 개조식 명사형 종결(질문 나열이면 관찰 서술로). 빈 글은 ''.
 *   기존 안전망 guardEvalText(질문 되풀이) + 명사형 이식본 nounEndText(lib/iepEvalNoun.js).
 */
export function evalSafeText(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return nounEndText(isQuestionList(t) ? guardEvalText(t) : t);
}

/**
 * monthly 배열에서 idx 칸의 평가만 바꾼 새 배열(다른 칸·같은 칸의 다른 키는 그대로).
 *   처음 평가를 적을 때 그 칸에 미리 있던 평가 방법 문장(규칙 초안·AI)은 eval_method로 옮겨 남긴다(지우지 않음).
 * @param {Array} monthly
 * @param {number} idx
 * @param {{mark?:string, text:string, date:string}} p
 */
export function mergeMonthEval(monthly, idx, { mark = '', text, date }) {
  const list = Array.isArray(monthly) ? monthly : [];
  if (idx < 0 || idx >= list.length) return list.slice();
  return list.map((e, i) => {
    if (i !== idx) return e;
    const cur = e || {};
    const next = { ...cur, eval: evalTextFor(text, mark), eval_at: String(date || ''), eval_mark: EVAL_MARKS.includes(mark) ? mark : '' };
    if (!isMonthMarked(cur) && String(cur.eval || '').trim() && cur.eval_method === undefined) next.eval_method = cur.eval;
    return next;
  });
}

/**
 * 카드 4단계 줄(1 교과 → 2 목표 → 3 월별 계획 → 4 평가). now = 지금 할 단계(0~3), 다 했으면 4.
 *   평가 단계는 '이번 달 칸을 새 디자인에서 평가했는가'(이번 달 칸이 없으면 평가 칸이 하나라도 표시됐는가).
 */
export function goalSteps(g, month) {
  const monthly = Array.isArray(g && g.monthly) ? g.monthly : [];
  const idx = monthIndexFor(monthly, month, g && g.semester);
  const evalDone = idx >= 0 ? isMonthMarked(monthly[idx]) : monthly.some(isMonthMarked);
  const done = [
    !!String((g && g.subject) || '').trim(),
    !!String((g && g.semester_goal) || '').trim(),
    monthly.length > 0,
    monthly.length > 0 && evalDone,
  ];
  const labels = ['1 교과', '2 목표', '3 월별 계획', '4 평가'];
  const now = done.findIndex((d) => !d);
  return { steps: labels.map((label, i) => ({ label, done: done[i] })), now: now < 0 ? 4 : now, monthIdx: idx };
}

/**
 * '이달 평가 남음' 개수 — 초안 아닌 이번 학기 목표 중, 이번 달 칸이 있고 아직 평가 표시가 없는 것.
 * @param {Array<{semester:number, monthly:Array}>} goals
 */
export function monthEvalTodoCount(goals, month) {
  return activeGoals(goals).filter((g) => {
    const idx = monthIndexFor(g.monthly, month, g.semester);
    return idx >= 0 && !isMonthMarked(g.monthly[idx]);
  }).length;
}

/** 다른 학생 목표 복사(고쳐 쓰기) — 교과·성취기준·학기목표·평가 방식만, 학생마다 다른 것(현행수준·월별·평가)은 비운 초안. */
export function copyGoalBody(src, { schoolYear, semester }) {
  const s = src || {};
  return {
    school_year: Number(schoolYear) || 0,
    semester: Number(semester) || 1,
    subject: s.subject || '', grade_code: s.grade_code || 0, area: s.area || '',
    standard_code: s.standard_code || '', standard_text: s.standard_text || '',
    related_stds: Array.isArray(s.related_stds) ? s.related_stds : [],
    std_goals: Array.isArray(s.std_goals) ? s.std_goals : [],
    semester_goal: s.semester_goal || '',
    crit_type: s.crit_type || 'rate', crit_start: s.crit_start ?? 30, crit_end: s.crit_end ?? 80, crit_of: s.crit_of ?? 10,
    eval_foci: Array.isArray(s.eval_foci) ? s.eval_foci : [],
    task_steps: Array.isArray(s.task_steps) ? s.task_steps : [],
    chain_type: s.chain_type || 'forward', prompt_system: s.prompt_system || 'mtl',
    plop: '', monthly: [], semestral_eval: '',
    status: STATUS_DRAFT,
  };
}

/** 새 목표(학기목표 한 줄) 저장 body — 초안. */
export function draftGoalBody({ subject, semesterGoal, schoolYear, semester }) {
  return {
    school_year: Number(schoolYear) || 0, semester: Number(semester) || 1,
    subject: String(subject || '').trim(), semester_goal: String(semesterGoal || '').trim(),
    monthly: [], status: STATUS_DRAFT,
  };
}

/** 오늘(KST) 'YYYY-MM-DD'와 달(1~12). */
export function kstToday(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}`, month: k.getUTCMonth() + 1 };
}

// '자세히 고치기(기존 화면)' — 옛 IepPage가 열릴 때 이 목표를 불러오게 남겨 두는 sessionStorage 키.
//   값: {"sid":12,"goalId":34,"gen":"rule"|""} — gen='rule'이면 불러온 뒤 '규칙 초안'을 한 번 만든다(월별 계획 만들기).
export const IEP_OPEN_KEY = 'kb_iep_open';

/**
 * 1104(mds/58 #27): 규칙 하나 — '평가 글(eval)이 비면 그 달은 평가 안 함'. 글이 빈 칸은 평가 표시(eval_at·eval_mark)도 ''로 비운 사본을 돌려준다.
 *   옛 화면(IepPage)에서 평가 글만 지우면 표시가 남아, 새 디자인(isMonthMarked → '평가함')과 옛 IEP 현황판(dashboard.js eval 글이 빈 칸 = 미작성)이
 *   서로 다르게 세던 문제. 새 디자인 카드·빠른 기록은 표시만 고를 때 기본 문장을 채워 보내므로(evalTextFor) 이 규칙에 걸리지 않는다.
 *   키가 없던 칸에는 키를 새로 만들지 않는다(그대로 돌려줌). 표시가 없는 칸(옛 화면만 쓰던 칸)은 공백 글이어도 손대지 않는다.
 */
export function clearEmptyEvalMark(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
  if (String(e.eval ?? '').trim() !== '') return e;
  const hasAt = Object.prototype.hasOwnProperty.call(e, 'eval_at');
  const hasMark = Object.prototype.hasOwnProperty.call(e, 'eval_mark');
  if ((!hasAt || e.eval_at === '') && (!hasMark || e.eval_mark === '')) return e;
  const next = { ...e };
  // 공백뿐인 글은 옛 현황판(COALESCE(eval,'')='')에서는 '작성'으로 세어지므로, 표시를 비울 때 글도 ''로 맞춰 두 곳이 같은 답을 내게 한다.
  if (e.eval != null && e.eval !== '') next.eval = '';
  if (hasAt) next.eval_at = '';
  if (hasMark) next.eval_mark = '';
  return next;
}

/** monthly 배열 전체에 clearEmptyEvalMark — 서버(iep.js)가 저장 직전에 한 번 더 정리한다. 배열이 아니면 []. */
export function normalizeMonthlyEvals(monthly) {
  return (Array.isArray(monthly) ? monthly : []).map(clearEmptyEvalMark);
}

/**
 * 옛 화면이 보낸 monthly 전체 저장에서 새 디자인 월 평가를 지키기(서버 iep.js UPDATE에서 쓴다, mds/56 #10).
 *   같은 달 라벨(같은 라벨이 여럿이면 같은 차례)의 기존 칸이 새 디자인에서 평가된 칸(eval_at·eval_mark)인데,
 *     ① 보낸 칸에 eval_at·eval_mark 키가 아예 없거나(평가 전에 화면을 연 옛 사본·다시 만든 월별 계획)
 *     ② 보낸 칸의 eval_at이 기존 것보다 오래됐으면(그 뒤에 새 디자인에서 또 평가함)
 *   그 칸의 평가 4개(eval·eval_at·eval_mark·eval_method)는 기존 값을 지킨다. ①에서 보낸 eval 글이 기존 평가와 다르면
 *   그 글은 버리지 않고 eval_method(계획 때 적은 평가 방법)로 남긴다. 나머지 칸·나머지 키(목표·내용·방법 등)는 보낸 그대로.
 *   보낸 칸이 기존과 같은 eval_at을 들고 있으면(평가 뒤에 연 사본) 보낸 그대로 — 옛 화면에서 일부러 고치거나 지운 평가는 존중.
 *   단 글을 지웠으면 표시도 비운다(clearEmptyEvalMark, mds/58 #27).
 * @param {Array} curMonthly 서버에 있는 값
 * @param {Array} bodyMonthly 이번에 보낸 값
 * @returns {Array}
 */
export function keepMarkedEvals(curMonthly, bodyMonthly) {
  const cur = Array.isArray(curMonthly) ? curMonthly : [];
  const body = Array.isArray(bodyMonthly) ? bodyMonthly : [];
  if (!cur.some(isMonthMarked)) return body;
  const seen = {};
  const curSeen = {};
  const curByKey = {};
  cur.forEach((e) => {
    const lb = String((e && e.month) ?? '');
    const n = (curSeen[lb] = (curSeen[lb] || 0) + 1);
    curByKey[lb + '#' + n] = e;
  });
  return body.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const lb = String(e.month ?? '');
    const n = (seen[lb] = (seen[lb] || 0) + 1);
    const c = curByKey[lb + '#' + n];
    if (!isMonthMarked(c)) return e;
    const hasKeys = Object.prototype.hasOwnProperty.call(e, 'eval_at') || Object.prototype.hasOwnProperty.call(e, 'eval_mark');
    const older = hasKeys && String(e.eval_at || '') < String(c.eval_at || '');
    // 1104(mds/58 #27): 평가 뒤에 연 사본에서 평가 글을 지웠으면 '그 달은 평가 안 함' — 표시(eval_at·eval_mark)도 같이 비운다.
    if (hasKeys && !older) return clearEmptyEvalMark(e);
    const next = { ...e, eval: c.eval ?? '', eval_at: c.eval_at ?? '', eval_mark: c.eval_mark ?? '' };
    if (c.eval_method !== undefined) next.eval_method = c.eval_method;
    const sent = String(e.eval || '').trim();
    if (!hasKeys && sent && sent !== String(c.eval || '').trim() && sent !== String(c.eval_method || '').trim()) next.eval_method = e.eval;
    return next;
  });
}
