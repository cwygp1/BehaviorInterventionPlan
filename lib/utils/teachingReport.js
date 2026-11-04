// 1104 현장 제보: 결과 평가 보고서에 교수 회기 기록(과제분석·DTT·5점 척도)도 넣는다.
// 화면 패널(ProgramSessionPanel·DttPanel·ScalePanel)과 같은 계산 규칙(lib/programSessions·lib/teachMethods)을 그대로 쓴다.
import {
  defaultMastery, masteryReached, sessionSummary, masteryOf, masteryText, dttSummary, itemHistory, dttItemJudgement,
} from '../programSessions.js';
import { BST_TOP, scoreBstSession, bstMasteryReached, bstSummaryText } from '../teachMethods.js';

const KIND_LABEL = { chain: '과제분석', dtt: 'DTT', scale: '5점 척도' };
const CHAIN_LABEL = { forward: '전진형', backward: '후진형', total: '전과제형' };
const r0 = (n) => Math.round(Number(n) || 0);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const range = (list) => {
  const d = list.map((s) => String(s.date || '').slice(0, 10)).filter(Boolean).sort();
  if (!d.length) return '';
  return d[0] === d[d.length - 1] ? d[0] : `${d[0]} ~ ${d[d.length - 1]}`;
};

/**
 * programs: teaching_programs 행, sessions: program_sessions 행(오래된→최근), goals: IEP 목표.
 * 결과: 기록이 1회기 이상 있는 프로그램마다
 *   { kind, kindLabel, title, unit:'%'|'점', max, points:[{phase, v}], baseCount, teachCount,
 *     baseMean, recent:[v…], criterion, reached, summary, dates }
 */
export function teachingRecordRows({ programs = [], sessions = [], goals = [] } = {}) {
  const rows = [];
  const all = Array.isArray(sessions) ? sessions : [];

  // 과제분석 — IEP 목표(과제분석 단계) 단위
  const chainByGoal = new Map();
  for (const s of all) {
    if ((s.kind || 'chain') !== 'chain') continue;
    const k = String(s.goal_id);
    if (!chainByGoal.has(k)) chainByGoal.set(k, []);
    chainByGoal.get(k).push(s);
  }
  for (const [gid, list] of chainByGoal) {
    const g = (goals || []).find((x) => String(x.id) === gid) || null;
    const chainType = g?.chain_type || list[list.length - 1]?.chain_type || 'forward';
    const m = defaultMastery(chainType);
    const pts = list.map((s) => ({ phase: s.phase, v: Number(s.pct) || 0 }));
    rows.push(build({
      kind: 'chain',
      title: String(g?.semester_goal || '').trim() || '(IEP 목표)',
      sub: CHAIN_LABEL[chainType] || '',
      unit: '%', max: 100, pts, list,
      criterion: `정반응률 ${m.pct}%, ${m.runs}회기 연속`,
      reached: masteryReached(list.map((s) => ({ phase: s.phase, pct: s.pct })), m),
      summary: sessionSummary(list),
    }));
  }

  for (const p of programs || []) {
    const list = all.filter((s) => s.kind === p.kind && String(s.program_id) === String(p.id));
    if (!list.length) continue;
    if (p.kind === 'dtt') {
      const items = Array.isArray(p.items) ? p.items : [];
      // 습득 = 교사가 '습득·유지'로 옮긴 표적 + 기록상 학습기준에 도달한 표적(화면 자동 판정과 같은 규칙).
      const m = masteryOf(p.mastery);
      const done = items.filter((x) => x.status === 'mastered' || x.status === 'maintain'
        || dttItemJudgement(x.status, itemHistory(list, x.id), m).reached).length;
      rows.push(build({
        kind: 'dtt',
        title: p.title || '(DTT 프로그램)',
        sub: items.length ? `표적 ${items.length}개 중 ${done}개 학습기준 도달` : '',
        unit: '%', max: 100,
        pts: list.map((s) => ({ phase: s.phase, v: Number(s.pct) || 0 })),
        list,
        criterion: masteryText(p.mastery),
        reached: items.length ? done === items.length : masteryReached(list, m),
        summary: dttSummary(items, list, p.mastery),
      }));
    } else if (p.kind === 'scale') {
      const runs = Math.max(1, Math.min(5, Number(p.mastery?.runs) || 2));
      const recent = [...list].reverse().map((s) => ({ setting: s.chain_type, phase: s.phase, scores: s.codes }));
      rows.push(build({
        kind: 'scale',
        title: p.title || '(기술)',
        sub: '',
        unit: '점', max: BST_TOP,
        pts: list.map((s) => ({ phase: s.phase, v: scoreBstSession(s.codes).avg ?? 0 })),
        list,
        criterion: `모두 ${BST_TOP}점(스스로), ${runs}회기 연속`,
        reached: bstMasteryReached(recent, { score: BST_TOP, runs, setting: 'real' }),
        summary: bstSummaryText(recent),
      }));
    }
  }
  return rows;
}

function build({ kind, title, sub, unit, max, pts, list, criterion, reached, summary }) {
  const base = pts.filter((x) => x.phase === 'baseline').map((x) => x.v);
  const teach = pts.filter((x) => x.phase !== 'baseline').map((x) => x.v);
  return {
    kind, kindLabel: KIND_LABEL[kind] || kind, title, sub, unit, max, points: pts,
    baseCount: base.length, teachCount: teach.length,
    baseMean: base.length ? Math.round(mean(base) * 10) / 10 : null,
    recent: teach.slice(-3),
    criterion, reached: !!reached, summary: summary || '', dates: range(list),
  };
}

const fmt = (v, unit) => (v == null ? '—' : unit === '%' ? `${r0(v)}%` : `${Math.round(v * 10) / 10}점`);
export const recentText = (row) => (row.recent.length ? row.recent.map((v) => fmt(v, row.unit)).join(' → ') : '—');
export const baseText = (row) => (row.baseCount ? `${fmt(row.baseMean, row.unit)} (${row.baseCount}회기)` : '—');

/** AI 종합 의견 프롬프트에 붙일 절. 기록이 없으면 빈 문자열. */
export function teachingRecordsForPrompt(rows) {
  if (!rows?.length) return '';
  return `## 교수 회기 기록 (IEP 기술 지도)\n${rows.map((r) => `- [${r.kindLabel}] ${r.title}${r.sub ? ` (${r.sub})` : ''}: 기초선 ${baseText(r)}, 지도 ${r.teachCount}회기, 최근 ${recentText(r)}, 학습기준 ${r.criterion} — ${r.reached ? '도달' : '진행 중'}`).join('\n')}`;
}

/** 회기별 꺾은선 SVG — 기초선은 주황, 지도·유지는 파랑, 단계가 바뀌는 곳에 점선. */
export function sessionChartSvg(row, { w = 340, h = 120 } = {}) {
  const pts = row.points || [];
  if (!pts.length) return '';
  const L = 28, R = 8, T = 8, B = 18;
  const iw = w - L - R, ih = h - T - B;
  const x = (i) => L + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1));
  const lo = row.unit === '%' ? 0 : 1; // 5점 척도는 1~5점
  const y = (v) => T + ih - ((Math.max(lo, Math.min(row.max, v)) - lo) / (row.max - lo)) * ih;
  const ticks = row.unit === '%' ? [0, 50, 100] : [1, 3, 5];
  const grid = ticks.map((t) => `<line x1="${L}" x2="${w - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e5e7eb"/><text x="${L - 4}" y="${y(t) + 3}" font-size="8" text-anchor="end" fill="#888">${t}${row.unit === '%' ? '%' : ''}</text>`).join('');
  // 단계가 이어지는 구간마다 선을 끊는다(SCED 관례).
  let seg = [], segs = [], prev = null, cuts = '';
  pts.forEach((p, i) => {
    const ph = p.phase === 'baseline' ? 'A' : 'B';
    if (prev && ph !== prev) {
      segs.push({ ph: prev, seg }); seg = [];
      const cx = (x(i - 1) + x(i)) / 2;
      cuts += `<line x1="${cx}" x2="${cx}" y1="${T}" y2="${T + ih}" stroke="#9ca3af" stroke-dasharray="3 3"/>`;
    }
    seg.push(i); prev = ph;
  });
  if (seg.length) segs.push({ ph: prev, seg });
  const color = (ph) => (ph === 'A' ? '#d97706' : '#2563eb');
  const lines = segs.map(({ ph, seg: s }) => `<polyline fill="none" stroke="${color(ph)}" stroke-width="1.6" points="${s.map((i) => `${x(i)},${y(pts[i].v)}`).join(' ')}"/>${s.map((i) => `<circle cx="${x(i)}" cy="${y(pts[i].v)}" r="2.6" fill="${color(ph)}"/>`).join('')}`).join('');
  const xs = pts.length <= 12 ? pts.map((_, i) => `<text x="${x(i)}" y="${h - 5}" font-size="8" text-anchor="middle" fill="#888">${i + 1}</text>`).join('') : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">${grid}${cuts}${lines}${xs}</svg>`;
}
