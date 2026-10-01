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
