// 0915(mds/33): 기록 달력 규칙 — 날짜 계산·빠진 날 판정·IEP 월 라벨 해석.
// DB·React 없는 순수 함수(서버 API와 화면이 같이 쓴다). 날짜는 전부 'YYYY-MM-DD' 문자열.
import { HOLIDAYS } from './holidays.js';

const D = (iso) => new Date(iso + 'T00:00:00Z');
export const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = (iso) => D(iso).getUTCDay();
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(D(s).getTime());
export const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 기록을 해야 하는 날 = 평일이면서 공휴일이 아닌 날.
export const isSchoolDay = (iso) => { const w = dow(iso); return w > 0 && w < 6 && !HOLIDAYS[iso]; };

// 월 격자 범위: 그달 1일이 든 주의 일요일 ~ 말일이 든 주의 토요일(나이스와 같은 일~토).
export function monthGrid(ym) {
  const first = ym + '-01';
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last, start: addDays(first, -dow(first)), end: addDays(last, 6 - dow(last)) };
}
export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
// 한국 학사일정: 1학기 3~8월, 2학기 9~2월(1·2월은 전년도 학년도).
export const semesterOf = (iso) => {
  const y = +iso.slice(0, 4); const m = +iso.slice(5, 7);
  return { schoolYear: m <= 2 ? y - 1 : y, semester: m >= 3 && m <= 8 ? 1 : 2 };
};

const ACTIVE_DAYS = 7; // 마지막 기록이 이 기간 안이면 '진행 중'으로 보고 그 뒤 날짜도 판정(아니면 멈춘 기록 — 마지막 기록일까지만)
const MON_TIERS = new Set(['baseline', 'tier3']); // 행동 데이터를 매일 모으는 관찰 기간

function gaps(dateSet, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isSchoolDay(d) && !dateSet.has(d)) out.push(d);
  return out;
}

/**
 * 빠진 날 — 매일 해야 하는 기록이 없는 지난 평일(오늘 제외, 공휴일 제외).
 *  ① CICO: 학생의 첫 CICO 기록일부터. 마지막 기록이 7일 안이면 어제까지, 아니면(끝난 중재) 마지막 기록일까지.
 *  ② 행동 데이터: 기초선·Tier 3 관찰 기간 안에서, 학생의 첫 행동 데이터 기록일 이후 ~ 기간 끝(열린 기간은 어제)까지.
 *     마지막 행동 데이터가 7일보다 오래됐으면 마지막 기록일까지만(열린 기간을 닫지 않고 기록만 멈춘 경우).
 *     기간 안에 기록이 하나도 없으면 판정하지 않는다(기간만 만들어 둔 경우의 헛경보 방지).
 * ABC는 문제행동이 있을 때만 적는 기록이라 대상이 아니다.
 * @param {{today:string, from:string, to:string,
 *   cico: Record<string,string[]>, mon: Record<string,string[]>,
 *   periods: {studentId:any, tier:string, start:string, end:string|null}[]}} p
 * @returns {{date:string, studentId:string, kind:'cico'|'mon'}[]}
 */
export function missingDays({ today, from, to, cico = {}, mon = {}, periods = [] }) {
  const yesterday = addDays(today, -1);
  const out = [];
  const push = (sid, kind, list) => list.forEach((date) => out.push({ date, studentId: String(sid), kind }));

  for (const [sid, dates] of Object.entries(cico)) {
    if (!dates.length) continue;
    const sorted = [...dates].sort();
    const first = sorted[0]; const last = sorted[sorted.length - 1];
    const upper = daysBetween(last, today) <= ACTIVE_DAYS ? yesterday : last;
    const a = first > from ? first : from; const b = upper < to ? upper : to;
    if (a <= b) push(sid, 'cico', gaps(new Set(sorted), a, b));
  }

  const seen = new Set();
  for (const p of periods) {
    if (!MON_TIERS.has(p.tier)) continue;
    const sid = String(p.studentId);
    const dates = mon[sid] || [];
    const pEnd = p.end && p.end < yesterday ? p.end : yesterday;
    const inPeriod = dates.filter((d) => d >= p.start && d <= (p.end || today)).sort();
    if (!inPeriod.length) continue;
    // 시작점: 기간 시작·학생의 첫 행동 데이터 기록일·조회 시작 중 가장 늦은 날(기초선→중재 전환일 공백도 잡힌다).
    const sortedAll = [...dates].sort();
    const lastRec = sortedAll[sortedAll.length - 1];
    // 끝: 기간 끝·조회 끝, 그리고 CICO와 같이 마지막 기록이 7일보다 오래됐으면(기록을 멈춘 학생) 마지막 기록일.
    const stop = daysBetween(lastRec, today) <= ACTIVE_DAYS ? pEnd : lastRec;
    const a = [p.start, sortedAll[0], from].sort()[2]; const b = [pEnd, stop, to].sort()[0];
    if (a > b) continue;
    gaps(new Set(dates), a, b).forEach((date) => {
      const key = sid + date;
      if (!seen.has(key)) { seen.add(key); out.push({ date, studentId: sid, kind: 'mon' }); }
    });
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

// IEP 월별 계획의 월 라벨('9', '9월', '9-10', '11-2', '9·11')에 month(1~12)가 들어가는가.
export function monthInLabel(label, month) {
  const s = String(label == null ? '' : label).replace(/월/g, '').trim();
  const r = s.match(/^(\d{1,2})\s*[-~]\s*(\d{1,2})$/);
  if (r) {
    const a = +r[1]; const b = +r[2];
    if (a <= b) return month >= a && month <= b;
    return month >= a || month <= b; // 11-2처럼 해를 넘는 구간
  }
  return s.split(/[·,\s]+/).filter(Boolean).map(Number).includes(month);
}

// monthly 배열에서 그달 항목의 목표 첫 줄(앞 '- ' 제거).
export function monthlyGoalText(monthly, month) {
  if (!Array.isArray(monthly)) return '';
  const hit = monthly.find((m) => m && monthInLabel(m.month, month));
  if (!hit) return '';
  const g = Array.isArray(hit.goal) ? hit.goal.join('\n') : String(hit.goal || '');
  const line = g.split('\n').map((x) => x.replace(/^\s*[-•·]\s*/, '').trim()).find(Boolean);
  return line || '';
}
