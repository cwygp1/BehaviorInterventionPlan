// 사용자 선택 차트 (1001, mds/45) — 카탈로그 규칙·설정 검증·SQL 조립·응답 다듬기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCES, sourcesFor, dimsFor, measuresFor, chartsFor, validateChart, normalizeChart, titleOf,
  classifyChip, classifyTimePlace, OTHER_LABEL, MAX_CHARTS,
} from '../../chartCatalog.js';
import { buildQuery, shapeResponse, rangeOf } from '../../chartSql.js';

const cfgMon = { v: 1, source: 'mon', x: 'week', y: 'freq', chart: 'line', range: '4w', alt: true, filter: { student: 3 } };

test('대시보드별 소스 — Tier 1 없음, Tier 2 CICO, IEP 목표·회기', () => {
  assert.deepEqual(sourcesFor('dash1'), []);
  assert.deepEqual(sourcesFor('dash2').map((s) => s.key), ['cico']);
  assert.deepEqual(sourcesFor('dashIep').map((s) => s.key), ['mon', 'iep', 'session']);
  assert.equal(MAX_CHARTS, 3);
});

test('X·Y 목록 규칙 — 교시 점수는 교시 축에서만, 기록 학생 수는 시간 축에서만, 심리안정실 요일 없음', () => {
  assert.ok(measuresFor('cico', 'period').some((m) => m.key === 'perScore'));
  assert.ok(!measuresFor('cico', 'student').some((m) => m.key === 'perScore'));
  assert.ok(measuresFor('cico', 'day').some((m) => m.key === 'students'));
  assert.ok(!measuresFor('cico', 'period').some((m) => m.key === 'students'));
  assert.ok(!dimsFor('sz').some((d) => d.key === 'dow'));
  assert.deepEqual(chartsFor('session', 'seq'), ['line']);
  assert.deepEqual(chartsFor('iep', 'student'), ['bar']);
  assert.ok(chartsFor('iep', 'month').includes('grid'));
});

test('validateChart — 허용 조합만 통과', () => {
  assert.equal(validateChart(cfgMon, 'dash3'), null);
  assert.ok(validateChart(cfgMon, 'dash2')); // 행동 데이터는 Tier 2 대시보드에 없음
  assert.ok(validateChart({ ...cfgMon, chart: 'grid' })); // 격자는 x2=student 필요
  assert.equal(validateChart({ ...cfgMon, chart: 'grid', x2: 'student', alt: false }, 'dash3'), null);
  assert.ok(validateChart({ ...cfgMon, chart: 'grid', x2: 'student' })); // 격자 + 대체행동 토글 불가
  assert.ok(validateChart({ ...cfgMon, y: 'dur', alt: true })); // 토글은 빈도에서만
  assert.ok(validateChart({ ...cfgMon, filter: { goal: 1 } })); // 소스에 없는 조건
  assert.ok(validateChart({ v: 1, source: 'session', x: 'seq', y: 'pct', chart: 'line', range: '10', filter: {} })); // 목표 필수
  assert.equal(validateChart({ v: 1, source: 'session', x: 'student', y: 'pct', chart: 'bar', range: '4w', filter: {} }, 'dashIep'), null);
  assert.equal(validateChart({ v: 1, source: 'iep', x: 'month', y: 'evalRate', chart: 'grid', x2: 'student', range: '', filter: {} }, 'dashIep'), null);
});

test('normalizeChart — 모르는 필드 제거, 필터는 카탈로그 키만', () => {
  const n = normalizeChart({ ...cfgMon, junk: 1, filter: { student: 3, goal: 9, nope: 'x' }, title: 'a'.repeat(100) });
  assert.deepEqual(Object.keys(n).sort(), ['alt', 'chart', 'filter', 'range', 'source', 'title', 'v', 'x', 'x2', 'y']);
  assert.deepEqual(n.filter, { student: 3 });
  assert.equal(n.title.length, 60);
  assert.equal(normalizeChart({ v: 1, source: 'iep', x: 'month', y: 'goals', chart: 'bar', range: '4w' }).range, ''); // IEP는 기간 없음
});

test('titleOf — 자동 제목', () => {
  assert.equal(titleOf({ source: 'cico', x: 'period', y: 'pct', chart: 'bar', range: '4w' }), '교시별 수행률(%) · 최근 4주');
  assert.equal(titleOf({ source: 'iep', x: 'month', y: 'evalRate', chart: 'grid', x2: 'student', range: '' }), '학생×월 월별 평가 작성률(%)');
  assert.equal(titleOf(cfgMon, { studentCode: 'S01' }), 'S01 · 주별 문제행동 빈도(회) + 대체행동 · 최근 4주');
  assert.equal(titleOf({ ...cfgMon, title: '내 제목' }), '내 제목');
});

test('칩 묶기 — 먼저 맞는 칩 1개, 없으면 기타, 시간/장소 분리', () => {
  assert.equal(classifyChip('지시 받음, 또래와 갈등', 'A_CHIPS'), '지시 받음');
  assert.equal(classifyChip('선생님이 다른 학생을 봄', 'A_CHIPS'), OTHER_LABEL);
  assert.deepEqual(classifyTimePlace('3교시 / 교실'), { time: '3교시', place: '교실' });
  assert.deepEqual(classifyTimePlace('교실'), { time: OTHER_LABEL, place: '교실' });
  assert.deepEqual(classifyTimePlace(''), { time: OTHER_LABEL, place: OTHER_LABEL });
});

test('rangeOf — 주 단위 기간과 학기 시작', () => {
  assert.deepEqual(rangeOf({ range: '2w' }, 1, '2026-10-01'), { from: '2026-09-18', to: '2026-10-01' });
  assert.deepEqual(rangeOf({ range: 'sem' }, 2, '2026-10-01'), { from: '2026-09-01', to: '2026-10-01' });
  assert.deepEqual(rangeOf({ range: 'sem' }, 2, '2027-01-15'), { from: '2026-09-01', to: '2027-01-15' });
  assert.deepEqual(rangeOf({ range: 'sem' }, 1, '2026-05-10'), { from: '2026-03-01', to: '2026-05-10' });
});

test('buildQuery — 열 이름은 표에서만, 값은 파라미터', () => {
  const ctx = { userId: 7, classId: 2, semester: 1, from: '2026-09-01', to: '2026-10-01' };
  const q = buildQuery(normalizeChart(cfgMon), ctx);
  assert.match(q.text, /FROM monitor_records r JOIN students s/);
  assert.match(q.text, /date_trunc\('week'/);
  assert.match(q.text, /alt_freq/);
  assert.match(q.text, /MODE\(\) WITHIN GROUP/);
  assert.match(q.text, /s\.id = \$\d/);
  assert.deepEqual(q.params.slice(0, 2), [7, 2]);
  assert.ok(q.params.includes(3));
  assert.equal(q.wantStudents, false);

  const g = buildQuery(normalizeChart({ v: 1, source: 'cico', x: 'period', y: 'perScore', chart: 'grid', x2: 'student', range: '4w', filter: { group: 5 } }), ctx);
  assert.match(g.text, /jsonb_each\(r\.scores\) p/);
  assert.match(g.text, /s\.id::text AS row/);
  assert.match(g.text, /tier2_group_members gm2/);
  assert.equal(g.wantStudents, true);

  const s = buildQuery(normalizeChart({ v: 1, source: 'session', x: 'seq', y: 'pct', chart: 'line', range: '10', filter: { goal: 11 } }), ctx);
  assert.match(s.text, /ORDER BY r\.date DESC, r\.session_no DESC/);
  assert.match(s.text, /LIMIT \$\d/);
  assert.match(s.text, /crit_type = 'rate'/);
  assert.ok(!/BETWEEN/.test(s.text));

  const i = buildQuery(normalizeChart({ v: 1, source: 'iep', x: 'month', y: 'evalRate', chart: 'bar', range: '', filter: {} }), ctx);
  assert.match(i.text, /jsonb_array_elements\(COALESCE\(r\.monthly/);
  assert.match(i.text, /r\.semester = \$\d/);
});

test('shapeResponse — 시간 축 빈 칸 채움·phase 음영·대체행동 시리즈', () => {
  const cfg = normalizeChart({ ...cfgMon, x: 'day', range: '2w' });
  const rows = [
    { x: '2026-09-21', y: '5', cnt: 1, alt: '0', ph: 'A' },
    { x: '2026-09-22', y: '4', cnt: 1, alt: '1', ph: 'A' },
    { x: '2026-09-28', y: '2', cnt: 1, alt: '3', ph: 'B' },
  ];
  const r = shapeResponse(rows, cfg, { students: [], semester: 1, from: '2026-09-18', to: '2026-10-01' });
  assert.equal(r.x.length, 10); // 평일만
  assert.equal(r.x[0].key, '2026-09-18');
  assert.equal(r.series.length, 2);
  assert.equal(r.series[0].values[1], 5); // 9/21(월)
  assert.equal(r.series[0].values[0], null);
  assert.equal(r.series[1].values[6], 3); // 9/28
  assert.deepEqual(r.bands.map((b) => b.phase), ['A', 'B']);
  assert.equal(r.meta.n, 3);
});

test('shapeResponse — 칩 묶기 topN+기타, 격자, 회기 번호', () => {
  const cfgA = normalizeChart({ v: 1, source: 'abc', x: 'a', y: 'n', chart: 'bar', range: '4w', filter: {} });
  const rows = [
    { x: '지시 받음', y: '4', cnt: 4 }, { x: '지시 받음 후 거부', y: '2', cnt: 2 }, { x: '', y: '3', cnt: 3 }, { x: '친구가 놀림', y: '1', cnt: 1 },
  ];
  const a = shapeResponse(rows, cfgA, { students: [], semester: 1, from: '2026-09-01', to: '2026-10-01' });
  assert.deepEqual(a.x.map((it) => it.key), ['지시 받음', OTHER_LABEL]);
  assert.deepEqual(a.series[0].values, [6, 4]);
  assert.equal(a.meta.otherShare, 0.4);

  const cfgG = normalizeChart({ v: 1, source: 'iep', x: 'month', y: 'evalRate', chart: 'grid', x2: 'student', range: '', filter: {} });
  const g = shapeResponse([
    { x: '3', row: '1', y: '100', cnt: 2 }, { x: '4-5', row: '1', y: '50', cnt: 2 }, { x: '3', row: '2', y: '0', cnt: 1 },
  ], cfgG, { students: [{ id: 1, code: 'S01' }, { id: 2, code: 'S02' }], semester: 1, from: '', to: '' });
  assert.deepEqual(g.x.map((it) => it.label), ['3월', '4월', '5월', '6월', '7월']);
  assert.deepEqual(g.rows.map((r) => r.label), ['S01', 'S02']);
  assert.deepEqual(g.cells[0], [100, 50, 50, null, null]); // 4-5 구간은 4·5월 둘 다
  assert.deepEqual(g.cells[1], [0, null, null, null, null]);

  const cfgS = normalizeChart({ v: 1, source: 'session', x: 'seq', y: 'pct', chart: 'line', range: '10', filter: { goal: 1 } });
  const s = shapeResponse([
    { d: '2026-09-30', sn: 1, ph: 'teach', y: '70', ref: '80' }, { d: '2026-09-29', sn: 2, ph: 'baseline', y: '20', ref: '80' }, { d: '2026-09-29', sn: 1, ph: 'baseline', y: '10', ref: '80' },
  ], cfgS, { students: [], semester: 1, from: '', to: '' });
  assert.deepEqual(s.series[0].values, [10, 20, 70]);
  assert.deepEqual(s.bands, [{ from: 0, to: 1, phase: 'A' }, { from: 2, to: 2, phase: 'B' }]);
  assert.equal(s.refLine, 80);
  assert.equal(s.x[2].sub, '9/30 1회');
});

test('buildQuery — CICO 교시 축 수행률은 교시 점수(0~3) 기준', () => {
  const ctx = { userId: 7, classId: 2, semester: 1, from: '2026-09-01', to: '2026-10-01' };
  const q = buildQuery(normalizeChart({ v: 1, source: 'cico', x: 'period', y: 'pct', chart: 'bar', range: '4w', filter: {} }), ctx);
  assert.match(q.text, /\* 100\.0 \/ 3/);
  assert.ok(!/total_score/.test(q.text));
});
