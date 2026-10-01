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
