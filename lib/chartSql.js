// 사용자 선택 차트 — 서버 전용 SQL 조립 + 응답 다듬기 (1001, mds/45 §4).
//
// 원칙: 사용자 입력은 lib/chartCatalog.js 의 **키**만 받는다(validateChart 통과 후). 열 이름·집계식은
// 여기 고정 문자열 표에서 키로 고른다. @vercel/postgres 태그드 템플릿은 동적 열을 못 넣으므로
// 조립한 문장을 query(text, params) 로 실행한다(값은 전부 $n 파라미터).
//
// buildQuery(cfg, ctx) → { text, params, wantStudents }   ctx = { userId, classId, semester, from, to }
// shapeResponse(rows, cfg, ctx2)                            ctx2 = { students, semester, from, to }
import {
  SOURCES, dimOf, measureOf, semesterMonths, classifyChip, classifyTimePlace, OTHER_LABEL, chipList,
} from './chartCatalog.js';
import { todayKst, addDays, dow, monthInLabel } from './utils/calendarRules.js';

const WEEKDAY = ['', '월', '화', '수', '목', '금', '토', '일']; // ISODOW 1~7

// ── 기간 ────────────────────────────────────────────────────────────────
/** cfg.range → { from, to } (KST). 회기 번호·IEP 목표는 날짜 범위를 쓰지 않는다. */
export function rangeOf(cfg, semester, today = todayKst()) {
  const y = +today.slice(0, 4); const m = +today.slice(5, 7);
  if (cfg.range === 'sem') {
    const start = Number(semester) === 2 ? `${m >= 9 ? y : y - 1}-09-01` : `${m >= 3 ? y : y - 1}-03-01`;
    return { from: start, to: today };
  }
  const weeks = { '2w': 2, '4w': 4, '8w': 8 }[cfg.range] || 4;
  return { from: addDays(today, -(weeks * 7 - 1)), to: today };
}

// ── SQL 조각 표 ───────────────────────────────────────────────────────────
const TABLE = { cico: 'cico_records', abc: 'abc_records', mon: 'monitor_records', sz: 'sz_records', iep: 'iep_goals', session: 'program_sessions' };

const TIME_X = {
  day: "to_char(r.date, 'YYYY-MM-DD')",
  week: "to_char(date_trunc('week', r.date), 'YYYY-MM-DD')",
  month: 'EXTRACT(MONTH FROM r.date)::int::text',
  dow: 'EXTRACT(ISODOW FROM r.date)::int::text',
};
const DIM_X = {
  cico: { group: 'g.name', period: 'p.key' },
  abc: { timeband: 'r.time_context', place: 'r.time_context', a: 'r.antecedent', b: 'r.behavior', c: 'r.consequence' },
  mon: { behavior: 'r.behavior' },
  sz: { reason: 'r.reason', intv: 'r.intervention', hour: "split_part(r.in_time, ':', 1)" },
  iep: { subject: 'r.subject', month: "e->>'month'" },
  session: {},
};
const TIME_RE = String.raw`^\d{1,2}:\d{2}`;
const Y = {
  cico: {
    pct: 'AVG(CASE WHEN r.max_score > 0 THEN r.total_score * 100.0 / r.max_score END)',
    perScore: "AVG(CASE WHEN (p.value->>'score') ~ '^[0-9.]+$' THEN (p.value->>'score')::float END)",
    students: 'COUNT(DISTINCT r.student_id)',
    n: 'COUNT(*)',
  },
  abc: { n: 'COUNT(*)' },
  mon: {
    freq: 'COALESCE(SUM(r.frequency), 0)',
    dur: 'AVG(r.duration)',
    int: 'AVG(r.intensity)',
    dbr: 'AVG(r.dbr)',
    n: 'COUNT(*)',
  },
  sz: {
    n: 'COUNT(*)',
    stay: `AVG(CASE WHEN r.in_time ~ '${TIME_RE}' AND r.out_time ~ '${TIME_RE}' THEN (CASE WHEN r.out_time::time > r.in_time::time THEN EXTRACT(EPOCH FROM (r.out_time::time - r.in_time::time)) / 60 END) END)`,
    retRate: "AVG(CASE WHEN r.returned = 'Y' THEN 100.0 ELSE 0 END)",
  },
  iep: {
    goals: 'COUNT(DISTINCT r.id)',
    evalRate: "AVG(CASE WHEN e IS NULL THEN NULL WHEN COALESCE(e->>'eval', '') <> '' THEN 100.0 ELSE 0 END)",
  },
  session: {
    pct: 'AVG(r.pct)',
    indep: 'AVG(CASE WHEN r.scored_count > 0 THEN r.indep_count * 100.0 / r.scored_count END)',
    n: 'COUNT(*)',
  },
};
// 회기 번호 축(집계 없음)의 행 값
const SEQ_Y = {
  pct: 'r.pct',
  indep: 'CASE WHEN r.scored_count > 0 THEN r.indep_count * 100.0 / r.scored_count END',
};
const ALT_Y = 'COALESCE(SUM(COALESCE(r.alt_freq, 0)), 0)';

// ── 조립 ─────────────────────────────────────────────────────────────────
export function buildQuery(cfg, ctx) {
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const src = SOURCES[cfg.source];
  const dim = dimOf(cfg.source, cfg.x);
  const isGrid = cfg.chart === 'grid';
  const wantStudents = isGrid || dim.kind === 'student';
  const f = cfg.filter || {};

  const $user = p(ctx.userId); const $class = p(ctx.classId);
  let from = `${TABLE[cfg.source]} r JOIN students s ON s.id = r.student_id`;
  const where = [`s.class_id = ${$class}`, `s.user_id = ${$user}`];

  // 소스별 조인·범위
  if (cfg.source === 'cico') {
    if (cfg.x === 'period' || cfg.y === 'perScore') from += ' CROSS JOIN LATERAL jsonb_each(r.scores) p';
    if (cfg.x === 'group') from += ` JOIN tier2_group_members gm ON gm.student_id = s.id JOIN tier2_groups g ON g.id = gm.group_id AND g.class_id = ${$class} AND g.semester = ${p(ctx.semester)}`;
  }
  if (cfg.source === 'iep') {
    where.push(`r.semester = ${p(ctx.semester)}`);
    where.push(`(r.school_year = (SELECT school_year FROM classes WHERE id = ${$class} AND user_id = ${$user}) OR r.school_year = 0)`);
    if (cfg.x === 'month' || cfg.y === 'evalRate') from += " LEFT JOIN LATERAL jsonb_array_elements(COALESCE(r.monthly, '[]'::jsonb)) e ON true";
  } else if (dim.kind !== 'seq') {
    where.push(`r.date BETWEEN ${p(ctx.from)}::date AND ${p(ctx.to)}::date`);
  }

  // 필터(카탈로그 filters 안의 키만 — validateChart가 보장)
  if (f.student) where.push(`s.id = ${p(Number(f.student))}`);
  if (f.group) where.push(`s.id IN (SELECT gm2.student_id FROM tier2_group_members gm2 JOIN tier2_groups g2 ON g2.id = gm2.group_id WHERE gm2.group_id = ${p(Number(f.group))} AND g2.class_id = ${$class})`);
  if (f.behavior) where.push(`r.behavior = ${p(String(f.behavior))}`);
  if (f.phase) where.push(`r.phase = ${p(String(f.phase))}`);
  if (f.goal) where.push(`r.goal_id = ${p(Number(f.goal))}`);

  // 회기 목표 기준선(crit_type=rate 일 때만 %)
  const refCol = cfg.source === 'session' && f.goal
    ? `, (SELECT CASE WHEN g3.crit_type = 'rate' THEN g3.crit_end END FROM iep_goals g3 WHERE g3.id = ${p(Number(f.goal))}) AS ref`
    : '';

  // 회기 번호 축: 집계 없이 최근 N건
  if (dim.kind === 'seq') {
    const n = Math.min(50, Math.max(5, Number(cfg.range) || 10));
    const text = `SELECT to_char(r.date, 'YYYY-MM-DD') AS d, r.session_no AS sn, r.phase AS ph, ${SEQ_Y[cfg.y]} AS y${refCol}
      FROM ${from} WHERE ${where.join(' AND ')}
      ORDER BY r.date DESC, r.session_no DESC, r.id DESC LIMIT ${p(n)}`;
    return { text, params, wantStudents };
  }

  const xExpr = dim.kind === 'time' || dim.kind === 'dow' ? TIME_X[cfg.x]
    : dim.kind === 'student' ? 's.id::text'
      : DIM_X[cfg.source][cfg.x];
  const cols = [`${xExpr} AS x`];
  const groups = [xExpr];
  if (isGrid) { cols.push('s.id::text AS row'); groups.push('s.id'); }
  // CICO 교시 축의 수행률은 하루 총점이 아니라 그 교시 점수(0~3)의 비율 — 아니면 모든 교시가 같은 값으로 나온다
  const yExpr = cfg.source === 'cico' && cfg.x === 'period' && cfg.y === 'pct'
    ? "AVG(CASE WHEN (p.value->>'score') ~ '^[0-9.]+$' THEN (p.value->>'score')::float * 100.0 / 3 END)"
    : Y[cfg.source][cfg.y];
  cols.push(`${yExpr} AS y`, 'COUNT(*)::int AS cnt');
  if (cfg.alt) cols.push(`${ALT_Y} AS alt`);
  if (src.phase === true) cols.push('MODE() WITHIN GROUP (ORDER BY r.phase) AS ph');
  const text = `SELECT ${cols.join(', ')}${refCol} FROM ${from} WHERE ${where.join(' AND ')} GROUP BY ${groups.join(', ')}`;
  return { text, params, wantStudents };
}

export const STUDENTS_SQL = 'SELECT id, student_code AS code FROM students WHERE class_id = $1 AND user_id = $2 ORDER BY student_code';

// ── 응답 다듬기 ───────────────────────────────────────────────────────────
const num = (v) => (v == null || v === '' ? null : Number(v));
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const mdLabel = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

// 가로 항목 목록 만들기 — [{ key, label }]
function xItems(cfg, dim, ctx, rawKeys) {
  const { from, to, semester, students } = ctx;
  if (dim.kind === 'time' && cfg.x === 'day') {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) { const w = dow(d); if (w > 0 && w < 6) out.push({ key: d, label: mdLabel(d) }); }
    return out;
  }
  if (dim.kind === 'time' && cfg.x === 'week') {
    const out = [];
    let d = addDays(from, -((dow(from) + 6) % 7)); // 월요일로
    for (; d <= to; d = addDays(d, 7)) out.push({ key: d, label: mdLabel(d) + '~' });
    return out;
  }
  if (dim.kind === 'time' && cfg.x === 'month') {
    const out = [];
    let y = +from.slice(0, 4); let m = +from.slice(5, 7);
    const ey = +to.slice(0, 4); const em = +to.slice(5, 7);
    while (y < ey || (y === ey && m <= em)) { out.push({ key: String(m), label: `${m}월` }); m += 1; if (m > 12) { m = 1; y += 1; } }
    return out;
  }
  if (dim.kind === 'dow') return [1, 2, 3, 4, 5].map((i) => ({ key: String(i), label: WEEKDAY[i] }));
  if (dim.kind === 'student') return (students || []).map((s) => ({ key: String(s.id), label: s.code }));
  if (dim.values === 'semesterMonths') return semesterMonths(semester).map((m) => ({ key: String(m), label: `${m}월` }));
  if (Array.isArray(dim.values)) {
    const extra = rawKeys.filter((k) => !dim.values.includes(k) && k !== OTHER_LABEL);
    return [...dim.values, ...extra].map((k) => ({ key: k, label: k }));
  }
  return null; // chips·free → 값 보고 정한다
}

// 버킷 합치기 — avg·rate 는 cnt 가중, sum·count 는 더함
function makeAcc(agg) {
  const m = new Map();
  const add = (key, y, cnt, alt) => {
    if (key == null) return;
    const b = m.get(key) || { s: 0, c: 0, alt: 0, has: false };
    if (y != null) {
      if (agg === 'avg' || agg === 'rate') { b.s += y * cnt; b.c += cnt; } else { b.s += y; b.c += cnt; }
      b.has = true;
    } else b.c += cnt;
    if (alt != null) b.alt += alt;
    m.set(key, b);
  };
  const val = (key) => {
    const b = m.get(key);
    if (!b || !b.has) return null;
    return (agg === 'avg' || agg === 'rate') ? (b.c ? b.s / b.c : null) : b.s;
  };
  const altVal = (key) => (m.has(key) ? m.get(key).alt : null);
  return { m, add, val, altVal };
}

// 원문 → 버킷 키(칩 묶기·시간대/장소 나누기·IEP 월 라벨 펼치기)
function bucketKeys(cfg, dim, raw, ctx) {
  if (cfg.source === 'abc' && cfg.x === 'timeband') return [classifyTimePlace(raw).time];
  if (cfg.source === 'abc' && cfg.x === 'place') return [classifyTimePlace(raw).place];
  if (dim.chips) return [classifyChip(raw, dim.chips)];
  if (dim.values === 'semesterMonths') {
    if (raw == null) return [];
    return semesterMonths(ctx.semester).filter((m) => monthInLabel(raw, m)).map(String);
  }
  if (raw == null || String(raw).trim() === '') return [OTHER_LABEL];
  return [String(raw).trim()];
}

export function shapeResponse(rows, cfg, ctx) {
  const dim = dimOf(cfg.source, cfg.x);
  const meas = measureOf(cfg.source, cfg.y);
  const isGrid = cfg.chart === 'grid';
  const series0 = { key: cfg.y, label: meas.label, unit: meas.unit, max: meas.max || null, higherIsBetter: !!meas.higherIsBetter };
  const refLine = rows.length && rows[0].ref != null ? Number(rows[0].ref) : null;

  // 회기 번호 축
  if (dim.kind === 'seq') {
    const asc = [...rows].reverse();
    const x = asc.map((r, i) => ({ key: String(i + 1), label: String(i + 1), sub: `${mdLabel(r.d)} ${r.sn}회` }));
    const values = asc.map((r) => round1(num(r.y)));
    const bands = runs(asc.map((r) => (r.ph === 'baseline' ? 'A' : 'B')));
    return { x, rows: [], series: [{ ...series0, values }], cells: null, bands, refLine, meta: { n: asc.length, otherShare: 0 } };
  }

  const acc = makeAcc(meas.agg);
  const gridAcc = new Map(); // row → acc
  const phAcc = new Map(); // x → {A:n, B:n}
  const rawKeys = new Set();
  let total = 0;
  rows.forEach((r) => {
    const y = num(r.y); const cnt = Number(r.cnt) || 0; const alt = r.alt == null ? null : Number(r.alt);
    total += cnt;
    bucketKeys(cfg, dim, r.x, ctx).forEach((k) => {
      rawKeys.add(k);
      if (isGrid) {
        if (!gridAcc.has(r.row)) gridAcc.set(r.row, makeAcc(meas.agg));
        gridAcc.get(r.row).add(k, y, cnt, alt);
      }
      acc.add(k, y, cnt, alt);
      if (r.ph) { const o = phAcc.get(k) || { A: 0, B: 0 }; o[r.ph === 'A' ? 'A' : 'B'] += cnt; phAcc.set(k, o); }
    });
  });

  let x = xItems(cfg, dim, ctx, [...rawKeys]);
  let otherShare = 0;
  if (!x) {
    // 칩·자유 입력: 값 내림차순 topN + 기타(시간대는 칩 순서 유지, 시각대는 숫자 순)
    const keys = [...rawKeys];
    const topN = dim.topN || 8;
    let ordered;
    if (dim.chips === 'ABC_TIMES') ordered = chipList('ABC_TIMES').filter((k) => rawKeys.has(k));
    else if (dim.sortKey) ordered = keys.filter((k) => k !== OTHER_LABEL).sort((a, b) => Number(a) - Number(b));
    else if (cfg.x === 'period' || cfg.x === 'group') ordered = keys.filter((k) => k !== OTHER_LABEL).sort((a, b) => a.localeCompare(b, 'ko'));
    else ordered = keys.filter((k) => k !== OTHER_LABEL).sort((a, b) => (acc.val(b) || 0) - (acc.val(a) || 0));
    const keep = ordered.slice(0, topN);
    const rest = ordered.slice(topN);
    if (rest.length || rawKeys.has(OTHER_LABEL)) {
      // 넘치는 항목과 기타를 한 버킷으로
      rest.forEach((k) => { const b = acc.m.get(k); if (b) { const o = acc.m.get(OTHER_LABEL) || { s: 0, c: 0, alt: 0, has: false }; o.s += b.s; o.c += b.c; o.alt += b.alt; o.has = o.has || b.has; acc.m.set(OTHER_LABEL, o); } });
      keep.push(OTHER_LABEL);
      const ob = acc.m.get(OTHER_LABEL);
      otherShare = total && ob ? ob.c / total : 0;
    }
    x = keep.map((k) => ({ key: k, label: k }));
  }

  const values = x.map((it) => round1(acc.val(it.key)));
  const series = [{ ...series0, values }];
  if (cfg.alt) series.push({ key: 'alt', label: '대체행동 빈도(회)', unit: '회', values: x.map((it) => acc.altVal(it.key)) });

  let cells = null; let rowsOut = [];
  if (isGrid) {
    rowsOut = (ctx.students || []).map((s) => ({ key: String(s.id), label: s.code }));
    cells = rowsOut.map((rw) => { const a = gridAcc.get(rw.key); return x.map((it) => (a ? round1(a.val(it.key)) : null)); });
  }

  let bands = [];
  if (SOURCES[cfg.source].phase === true && dim.kind === 'time') {
    bands = runs(x.map((it) => { const o = phAcc.get(it.key); if (!o) return null; return o.B > o.A ? 'B' : 'A'; }));
  }

  return { x, rows: rowsOut, series, cells, bands, refLine, meta: { n: total, otherShare: Math.round(otherShare * 100) / 100 } };
}

// 'A','B',null 배열 → 연속 구간 [{from,to,phase}] (null은 앞 구간을 잇는다)
function runs(arr) {
  const out = [];
  let cur = null;
  arr.forEach((ph, i) => {
    const eff = ph || (cur ? cur.phase : null);
    if (!eff) return;
    if (cur && cur.phase === eff) cur.to = i;
    else { cur = { from: i, to: i, phase: eff }; out.push(cur); }
  });
  return out;
}
