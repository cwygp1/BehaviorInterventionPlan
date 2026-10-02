import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricValue, availableMetrics, sortByDate, phaseRuns, runMean, phaseSeries, noteMarks, periodMarks, chartHeader } from '../scedChart.js';

const R = (date, phase, freq, extra = {}) => ({ date, phase, freq, ...extra });

test('지표 값: 시간당 발생률은 관찰 시간이 있을 때만, 없으면 null', () => {
  assert.equal(metricValue(R('2026-03-02', 'A', 6, { obs_hours: 4 }), 'rate'), 1.5);
  assert.equal(metricValue(R('2026-03-02', 'A', 6), 'rate'), null);
  assert.equal(metricValue(R('2026-03-02', 'A', 6, { obs_hours: 0 }), 'rate'), null);
  assert.equal(metricValue(R('2026-03-02', 'A', 6), 'freq'), 6);
  assert.equal(metricValue({ dur: '2.5' }, 'dur'), 2.5);
  assert.equal(metricValue({}, 'dbr'), null);
});

test('그릴 수 있는 지표: 관찰 시간 기록이 하나라도 있어야 시간당 발생률 칩이 보인다', () => {
  assert.equal(availableMetrics([R('2026-03-02', 'A', 6)]).some(([k]) => k === 'rate'), false);
  assert.equal(availableMetrics([R('2026-03-02', 'A', 6), R('2026-03-03', 'A', 5, { obs_hours: 5 })]).some(([k]) => k === 'rate'), true);
});

test('단계 구간: A→B 한 번이면 기초선(A)/중재(B), 되돌아오면(ABAB) 번호를 붙이고 경계마다 끊긴다', () => {
  const ab = phaseRuns(sortByDate([R('2026-03-03', 'A', 7), R('2026-03-02', 'A', 8), R('2026-03-04', 'B', 3)]));
  assert.deepEqual(ab.map((x) => [x.phase, x.start, x.end, x.label]), [['A', 0, 1, '기초선(A)'], ['B', 2, 2, '중재(B)']]);

  const abab = phaseRuns([R('d1', 'A', 8), R('d2', 'A', 7), R('d3', 'B', 3), R('d4', 'B', 2), R('d5', 'A', 7), R('d6', 'B', 2)]);
  assert.deepEqual(abab.map((x) => x.label), ['기초선 A1', '중재 B1', '기초선 A2', '중재 B2']);
  assert.deepEqual(abab.map((x) => [x.start, x.end]), [[0, 1], [2, 3], [4, 4], [5, 5]]);
});

test('단계 안 평균(수준선)과 단계별 시리즈: 다른 단계 자리는 null이라 선이 이어지지 않는다', () => {
  const s = [R('d1', 'A', 8), R('d2', 'A', 6), R('d3', 'B', 3), R('d4', 'B', 1)];
  const runs = phaseRuns(s);
  assert.equal(runMean(s, runs[0], 'freq'), 7);
  assert.equal(runMean(s, runs[1], 'freq'), 2);
  assert.equal(runMean(s, runs[0], 'rate'), null); // 관찰 시간 없음
  assert.deepEqual(phaseSeries(s, 'freq'), { a: [8, 6, null, null], b: [null, null, 3, 1] });
});

test('메모 표식: 메모 있는 점만, 짧은 글은 그대로·긴 글은 잘라서', () => {
  const s = [R('d1', 'A', 8), R('d2', 'A', 6, { note: '폭발' }), R('d3', 'B', 3, { note: '3시30분 기상, 고열로 조퇴' })];
  const m = noteMarks(s);
  assert.deepEqual(m.map((x) => [x.index, x.short]), [[1, '폭발'], [2, '3시30분 …']]);
  assert.equal(m[1].note, '3시30분 기상, 고열로 조퇴');
});

test('관찰 기간 구분선: 시작일 이후 첫 기록 자리에, 첫 기록 앞의 기간은 긋지 않음', () => {
  const s = [R('2026-03-02', 'A', 8), R('2026-03-05', 'A', 6), R('2026-03-09', 'B', 3), R('2026-03-12', 'B', 1)];
  const periods = [
    { tier: 'baseline', start_date: '2026-03-01' },
    { tier: 'tier3', start_date: '2026-03-08', note: 'BIP 적용' },
    { tier: 'tier3', start_date: '2026-03-20' }, // 데이터 범위 밖
  ];
  assert.deepEqual(periodMarks(s, periods), [{ index: 2, label: 'Tier 3', note: 'BIP 적용' }]);
  assert.deepEqual(periodMarks([], periods), []);
});

test('머리말: 행동 이름(중복 제거)·기간·건수', () => {
  const s = sortByDate([R('2026-03-05', 'A', 6, { beh: '소리 지르기' }), R('2026-03-02', 'A', 8, { beh: '소리 지르기' }), R('2026-03-09', 'B', 3, { beh: '자리 이탈' })]);
  assert.deepEqual(chartHeader(s), { behaviors: ['소리 지르기', '자리 이탈'], from: '2026-03-02', to: '2026-03-09', count: 3 });
});

// ── 1001 2차: 엑셀에서 더 가져온 것 ─────────────────────────────
import { semesterKey, semesterLabel, rangeOptions, filterByRange, semesterMarks, behaviorOptions, mergeByDate, filterByBehavior, parseGoalLine, BEH_ALL, RANGE_ALL } from '../scedChart.js';

test('학기 키: 3~8월 1학기, 9~12월 2학기, 1~2월은 전년도 2학기', () => {
  assert.equal(semesterKey('2023-03-21'), '2023-1');
  assert.equal(semesterKey('2023-08-22'), '2023-1');
  assert.equal(semesterKey('2023-09-04'), '2023-2');
  assert.equal(semesterKey('2024-01-15'), '2023-2');
  assert.equal(semesterLabel('2023-2'), '2023학년도 2학기');
  assert.equal(semesterKey(''), '');
});

test('기간 고르기와 학기 구분선: 3개합산그래프처럼 1학기·2학기가 섞인 1년치', () => {
  const s = [R('2023-03-21', 'A', 25), R('2023-07-10', 'B', 22), R('2023-08-22', 'B', 2), R('2023-09-04', 'B', 22), R('2023-11-28', 'B', 25)];
  assert.deepEqual(rangeOptions(s), [[RANGE_ALL, '전체'], ['2023-1', '1학기'], ['2023-2', '2학기']]);
  assert.equal(filterByRange(s, '2023-1').length, 3);
  assert.equal(filterByRange(s, '2023-2').length, 2);
  assert.equal(filterByRange(s, RANGE_ALL).length, 5);
  assert.deepEqual(semesterMarks(s), [{ index: 3, label: '2학기 시작' }]);
  assert.deepEqual(semesterMarks(filterByRange(s, '2023-1')), []);
});

test('행동 고르기: 행동이 2개 이상일 때만 선택지, 합산은 같은 날짜를 하나로 더한다', () => {
  const one = [R('d1', 'A', 3, { beh: '자해' })];
  assert.deepEqual(behaviorOptions(one), []);
  const s = [
    R('2023-05-02', 'A', 3, { beh: '자해', dur: 2, int: 2, obs_hours: 6, note: '폭발' }),
    R('2023-05-02', 'A', 5, { beh: '공격', dur: 1, int: 4, alt_freq: 1 }),
    R('2023-05-03', 'A', 2, { beh: '자해', dur: 1, int: 1, dbr: 6 }),
  ];
  assert.deepEqual(behaviorOptions(s), [[BEH_ALL, '합산 (2개 행동)'], ['자해', '자해'], ['공격', '공격']]);
  const merged = filterByBehavior(s, BEH_ALL);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].freq, 8);
  assert.equal(merged[0].dur, 3);
  assert.equal(merged[0].int, 4);
  assert.equal(merged[0].alt_freq, 1);
  assert.equal(merged[0].obs_hours, 6);
  assert.equal(merged[0].note, '폭발');
  assert.equal(merged[0].beh, '자해 + 공격');
  assert.equal(merged[1].dbr, 6);
  assert.equal(filterByBehavior(s, '자해').length, 2);
});

test('목표선 값: 숫자만, 빈 값·음수·글자는 null', () => {
  assert.equal(parseGoalLine('40'), 40);
  assert.equal(parseGoalLine(2.5), 2.5);
  assert.equal(parseGoalLine(''), null);
  assert.equal(parseGoalLine('-1'), null);
  assert.equal(parseGoalLine('abc'), null);
});

test('메모 표식 maxLen 0 = 글 없이 ▲만 · 머리말은 합산 행동 이름을 낱개로 푼다', () => {
  const s = [R('d1', 'A', 8, { note: '폭발', beh: '소리 + 이탈' }), R('d2', 'A', 6, { beh: '소리' })];
  assert.deepEqual(noteMarks(s, 0).map((m) => [m.index, m.short, m.note]), [[0, '', '폭발']]);
  assert.deepEqual(chartHeader(s).behaviors, ['소리', '이탈']);
});

// ── 1002 ② 기준변경 ─────────────────────────────────────────────
import { criterionRuns, criterionHit, criterionStats, criterionWarning, ccConfig } from '../scedChart.js';

const C = (date, phase, freq, criterion) => ({ date, phase, freq, criterion });

test('기준변경 구간: A는 한 구간, B는 기준값이 바뀔 때마다 새 구간, 기준 없는 B는 따로', () => {
  const s = [C('d1', 'A', 8), C('d2', 'A', 7), C('d3', 'B', 6, 6), C('d4', 'B', 5, 6), C('d5', 'B', 4, 4), C('d6', 'B', 3, 4), C('d7', 'B', 2)];
  const runs = criterionRuns(s);
  assert.deepEqual(runs.map((r) => [r.short, r.label, r.start, r.end]), [['A1', '기초선', 0, 1], ['C1', '기준1 · 6', 2, 3], ['C2', '기준2 · 4', 4, 5], ['B?', '중재(기준 없음)', 6, 6]]);
});

test('달성 판정: 근처 ✓ · 훨씬 아래 △(과잉) · 그 외 ✕ · 회기 부족 …', () => {
  const cfg = { direction: 'down', hitRuns: 3, nearPct: 30 };
  assert.equal(criterionHit([9, 8, 10], 10, cfg), 'hit');      // 7~10 안
  assert.equal(criterionHit([5, 6, 7], 10, cfg), 'miss');      // 하나(5·6)가 7 아래, 7은 안 → 섞임 ✕
  assert.equal(criterionHit([2, 1, 0], 10, cfg), 'over');      // 모두 7 아래
  assert.equal(criterionHit([12, 9, 9], 10, cfg), 'miss');
  assert.equal(criterionHit([9, 9], 10, cfg), 'pending');
  assert.equal(criterionHit([0, 0, 0], 0, cfg), 'hit');
  const up = { direction: 'up', hitRuns: 2, nearPct: 30 };
  assert.equal(criterionHit([10, 12], 10, up), 'hit');
  assert.equal(criterionHit([20, 25], 10, up), 'over');
});

test('구간별 표: 평균·평균−기준·기준 안 비율·판정', () => {
  const s = [C('d1', 'A', 8), C('d2', 'B', 6, 6), C('d3', 'B', 5, 6), C('d4', 'B', 6, 6), C('d5', 'B', 3, 4), C('d6', 'B', 4, 4), C('d7', 'B', 1, 4)];
  const st = criterionStats(s, ccConfig({ CC: { metric: 'freq', direction: 'down', hitRuns: 3, nearPct: 30 } }));
  assert.equal(st.length, 2);
  assert.deepEqual([st[0].criterion, st[0].sessions, st[0].mean, st[0].diff, st[0].insidePct, st[0].status], [6, 3, 5.7, -0.3, 100, 'hit']);
  assert.deepEqual([st[1].criterion, st[1].sessions, st[1].mean, st[1].insidePct, st[1].status], [4, 3, 2.7, 100, 'miss']); // 1은 2.8 아래라 섞임
});

test('기준값 경고: 방향 반대·2배 초과·음수', () => {
  const cfg = { direction: 'down' };
  assert.equal(criterionWarning(7, 5, cfg), null);
  assert.match(criterionWarning(7, 9, cfg), /큰 값/);
  assert.match(criterionWarning(7, 70, cfg), /큰 값/);
  assert.match(criterionWarning(10, 4, cfg), /크게 바뀌어요/);
  assert.match(criterionWarning(7, -1, cfg), /0 이상/);
  assert.equal(criterionWarning(null, 5, cfg), null);
  assert.match(criterionWarning(5, 3, { direction: 'up' }), /작은 값/);
});

test('CC 설정 정규화: 기본값·범위', () => {
  assert.deepEqual(ccConfig(null), { metric: 'freq', direction: 'down', hitRuns: 3, nearPct: 30, behavior: '' });
  assert.deepEqual(ccConfig({ CC: { metric: 'dur', direction: 'up', hitRuns: 99, nearPct: -5, behavior: '자해' } }), { metric: 'dur', direction: 'up', hitRuns: 10, nearPct: 0, behavior: '자해' });
  assert.equal(ccConfig({ CC: { metric: '없음' } }).metric, 'freq');
});

// ── 1002 ③ 교대중재 ─────────────────────────────────────────────
import { atdConfig, atdConditionList, conditionSeries, conditionStats, conditionPairs, suggestCondition, ATD_CONTROL } from '../scedChart.js';

const T = (date, phase, freq, condition) => ({ date, phase, freq, condition });
const CFG = atdConfig({ ATD: { conditions: [{ name: '일반 교수' }, { name: '시각 지원' }], control: true, baseline: true } });

test('교대중재 설정: 이름 정리·색·점 모양 자동, 무중재는 목록 끝에 회색 ○', () => {
  assert.deepEqual(CFG.conditions.map((c) => [c.name, c.marker]), [['일반 교수', 'circle'], ['시각 지원', 'triangle']]);
  assert.equal(CFG.control, true); assert.equal(CFG.baseline, true);
  const list = atdConditionList(CFG);
  assert.equal(list.length, 3); assert.equal(list[2].name, ATD_CONTROL); assert.equal(list[2].control, true);
  assert.equal(atdConfig({ ATD: { conditions: ['a', '', 'b', 'c', 'd', 'e'] } }).conditions.length, 4);
  assert.equal(atdConfig(null).baseline, true);
});

test('조건별 시리즈: 자기 회기만 값, 조건 없는 B는 none', () => {
  const s = [T('d1', 'A', 8), T('d2', 'B', 4, '일반 교수'), T('d3', 'B', 2, '시각 지원'), T('d4', 'B', 5, '일반 교수'), T('d5', 'B', 1, '시각 지원'), T('d6', 'B', 3)];
  const { series, none, hasNone } = conditionSeries(s, CFG, 'freq');
  assert.deepEqual(series[0].data, [null, 4, null, 5, null, null]);
  assert.deepEqual(series[1].data, [null, null, 2, null, 1, null]);
  assert.deepEqual(none, [null, null, null, null, null, 3]);
  assert.equal(hasNone, true);
});

test('조건별 표·조건 간 비교(평균 차·Tau-U)·권하는 조건(가장 적게 쓴 것, 직전과 다른 것 우선)', () => {
  const s = [T('d1', 'A', 8), T('d2', 'B', 4, '일반 교수'), T('d3', 'B', 2, '시각 지원'), T('d4', 'B', 5, '일반 교수'), T('d5', 'B', 1, '시각 지원'), T('d6', 'B', 4, '일반 교수')];
  const st = conditionStats(s, CFG, 'freq');
  assert.deepEqual(st.map((x) => [x.name, x.sessions, x.mean]), [['일반 교수', 3, 4.3], ['시각 지원', 2, 1.5], [ATD_CONTROL, 0, null]]);
  const pairs = conditionPairs(st);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a, pairs[0].b, pairs[0].diff, pairs[0].tau], ['일반 교수', '시각 지원', -2.8, -1]);
  assert.equal(suggestCondition(s, CFG), ATD_CONTROL); // 0회로 가장 적음
  const noCtrl = atdConfig({ ATD: { conditions: ['일반 교수', '시각 지원'] } });
  assert.equal(suggestCondition(s, noCtrl), '시각 지원'); // 2회 < 3회
  assert.equal(suggestCondition([T('d1', 'B', 1, '일반 교수')], noCtrl), '시각 지원');
});

// ── 1002 ④ 중다기초선 ───────────────────────────────────────────
import { mblConfig, tierKeyOf, mblTierNames, mblFilterBehavior, mblPanels, mblTierStats, mblTierState } from '../scedChart.js';

const M = (date, phase, freq, beh, tier) => ({ date, phase, freq, beh, tier });
const BEH_CFG = mblConfig({ MBL: { dimension: 'behavior' } });
const SET_CFG = mblConfig({ MBL: { dimension: 'setting', behavior: '소리', tiers: ['교실', '급식실'] } });

test('중다기초선 설정·층 읽기: 행동 간은 beh, 상황·사람 간은 tier', () => {
  assert.equal(BEH_CFG.dimension, 'behavior');
  assert.deepEqual(SET_CFG.tiers.map((t) => t.name), ['교실', '급식실']);
  assert.equal(mblConfig({ MBL: { dimension: '없음' } }).dimension, 'behavior');
  assert.equal(tierKeyOf(M('d', 'A', 1, '소리', '교실'), BEH_CFG), '소리');
  assert.equal(tierKeyOf(M('d', 'A', 1, '소리', '교실'), SET_CFG), '교실');
});

test('패널: 층마다 A/B 시리즈·단계 변경 위치·평균·결측, Y 최대 공통 · 행동 간은 기록 순 층', () => {
  const s = [M('d1', 'A', 8, '소리'), M('d1', 'A', 3, '이탈'), M('d2', 'B', 4, '소리'), M('d2', 'A', 3, '이탈'), M('d3', 'B', 2, '소리'), M('d3', 'B', 1, '이탈'), M('d4', 'B', 1, '소리')];
  assert.deepEqual(mblTierNames(s, BEH_CFG), ['소리', '이탈']);
  const p = mblPanels(s, BEH_CFG, 'freq');
  assert.equal(p.yMax, 8);
  assert.deepEqual(p.dates, ['d1', 'd2', 'd3', 'd4']); // X축은 날짜(중복 없음)
  assert.deepEqual(p.tiers.map((t) => [t.name, t.yAxisID, t.boundary, t.aMean, t.bMean, t.missing, t.phaseNow]), [['소리', 'y0', 1, 8, 2.3, 0, 'B'], ['이탈', 'y1', 2, 3, 1, 1, 'B']]);
  assert.deepEqual(p.tiers[0].a, [8, null, null, null]);
  assert.deepEqual(p.tiers[0].b, [null, 4, 2, 1]);
  const st = mblTierStats(p, 'freq');
  assert.equal(st[0].pnd, 100); assert.equal(st[0].tau, -1);
  assert.equal(st[1].bCount, 1);
});

test('상황 간: 표적행동 고정 · 층 상태 표', () => {
  const s = [M('d1', 'A', 5, '소리', '교실'), M('d1', 'A', 2, '이탈', '교실'), M('d2', 'B', 2, '소리', '교실'), M('d2', 'A', 4, '소리', '급식실')];
  const f = mblFilterBehavior(s, SET_CFG);
  assert.equal(f.length, 3);
  assert.deepEqual(mblTierNames(f, SET_CFG), ['교실', '급식실']);
  const state = mblTierState(f, SET_CFG, 'd2');
  assert.deepEqual(state, [{ name: '교실', count: 2, phase: 'B', bStart: 'd2', today: true }, { name: '급식실', count: 1, phase: 'A', bStart: '', today: true }]);
  assert.equal(mblFilterBehavior(s, BEH_CFG).length, 4);
});
