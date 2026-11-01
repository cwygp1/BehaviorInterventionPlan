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

/** 이 칸을 새 디자인에서 평가했는가(eval_at 또는 eval_mark). */
export const isMonthMarked = (e) => !!(e && (e.eval_at || e.eval_mark));

export const EVAL_MARKS = ['달성', '부분', '미달'];

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
    const next = { ...cur, eval: evalSafeText(text), eval_at: String(date || ''), eval_mark: EVAL_MARKS.includes(mark) ? mark : '' };
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
