import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesign, designTitle, stageLabel, stageTabsFor, runIndexOfRecord, suggestsABAB, sinceRangeKey, DESIGNS } from '../../scedDesigns.js';
import { filterByRange, rangeOptions, RANGE_ALL } from '../scedChart.js';

const R = (date, phase, id) => ({ id, date, phase, freq: 1 });

test('설계 코드 정규화·이름', () => {
  assert.equal(normalizeDesign(''), 'AB');
  assert.equal(normalizeDesign('abab'), 'ABAB');
  assert.equal(normalizeDesign('없음'), 'AB');
  assert.equal(designTitle('ABAB'), 'ABAB (반전설계)');
  assert.equal(DESIGNS.filter((d) => d.ready).map((d) => d.code).join(','), 'AB,ABAB');
});

test('단계 이름: A1 기초선 · B1 중재 · A2 중재 철회 · B2 중재 재개 · A3 2차 철회', () => {
  assert.equal(stageLabel('A', 1), '기초선');
  assert.equal(stageLabel('B', 1), '중재');
  assert.equal(stageLabel('A', 2), '중재 철회');
  assert.equal(stageLabel('B', 2), '중재 재개');
  assert.equal(stageLabel('A', 3), '2차 철회');
  assert.equal(stageLabel('B', 3), '2차 재개');
});

test('단계 탭: 기록 없으면 기초선이 현재, AB는 2개·ABAB는 4개', () => {
  const ab = stageTabsFor('AB', []);
  assert.deepEqual(ab.tabs.map((t) => [t.short, t.state]), [['A1', 'current'], ['B1', 'next']]);
  assert.equal(ab.current, 0);
  const abab = stageTabsFor('ABAB', []);
  assert.deepEqual(abab.tabs.map((t) => t.label), ['기초선', '중재', '중재 철회', '중재 재개']);
  assert.deepEqual(abab.tabs.map((t) => t.state), ['current', 'next', 'future', 'future']);
});

test('단계 탭: 현재 구간은 날짜순 마지막 구간(작성 순서가 아님) · 다음만 열림', () => {
  // 작성 순서는 B가 마지막이지만 날짜순 마지막은 A2(과거 A를 뒤늦게 채운 경우가 아니라, 실제로 철회 중)
  const recs = [R('2026-09-10', 'B', 3), R('2026-09-01', 'A', 1), R('2026-09-20', 'A', 4), R('2026-09-05', 'A', 2)];
  const t = stageTabsFor('ABAB', recs);
  assert.deepEqual(t.tabs.map((x) => x.short), ['A1', 'B1', 'A2', 'B2']);
  assert.equal(t.current, 2);
  assert.deepEqual(t.tabs.map((x) => x.state), ['done', 'done', 'current', 'next']);
});

test('단계 탭: 과거 A를 뒤늦게 채워도(작성은 마지막) 현재 단계는 B1 그대로', () => {
  const recs = [R('2026-09-01', 'A', 1), R('2026-09-10', 'B', 2), R('2026-09-11', 'B', 3), R('2026-09-03', 'A', 9 /* 나중에 만든 과거 기록 */)];
  const t = stageTabsFor('AB', recs);
  assert.equal(t.current, 1);
  assert.equal(t.tabs[t.current].label, '중재');
});

test('단계 탭: 기초선 없이 B로 시작한 기록도 순서가 어긋나지 않음 · + 단계로 ABAB 확장', () => {
  const recs = [R('2026-09-01', 'B', 1), R('2026-09-02', 'B', 2)];
  const t = stageTabsFor('ABAB', recs);
  assert.deepEqual(t.tabs.map((x) => x.short), ['B1', 'A1', 'B2', 'A2']);
  assert.equal(t.tabs[0].label, '중재');
  const long = [R('d1', 'A'), R('d2', 'B'), R('d3', 'A'), R('d4', 'B')];
  assert.equal(stageTabsFor('ABAB', long).tabs.length, 4);
  assert.equal(stageTabsFor('ABAB', long).tabs[3].state, 'current');
  const ext = stageTabsFor('ABAB', long, { extra: 1 });
  assert.equal(ext.tabs.length, 5);
  assert.deepEqual([ext.tabs[4].short, ext.tabs[4].label, ext.tabs[4].state], ['A3', '2차 철회', 'next']);
});

test('수정 중인 기록의 구간 · AB에서 되돌아간 기록이 있으면 ABAB 제안', () => {
  const recs = [R('2026-09-01', 'A', 1), R('2026-09-02', 'A', 2), R('2026-09-10', 'B', 3), R('2026-09-20', 'A', 4)];
  const t = stageTabsFor('AB', recs);
  assert.equal(t.tabs.length, 3); // AB인데 구간이 3개면 탭도 3개로 늘어 보인다
  assert.equal(runIndexOfRecord(t.runs, t.sorted, recs[1]), 0);
  assert.equal(runIndexOfRecord(t.runs, t.sorted, recs[2]), 1);
  assert.equal(runIndexOfRecord(t.runs, t.sorted, { id: 999 }), -1);
  assert.equal(suggestsABAB('AB', t.runs), true);
  assert.equal(suggestsABAB('ABAB', t.runs), false);
  assert.equal(suggestsABAB('AB', t.runs.slice(0, 2)), false);
});

test("'현재 설계' 기간: since 키·필터·칩 목록 맨 앞", () => {
  assert.equal(sinceRangeKey('2026-10-02'), 'since:2026-10-02');
  assert.equal(sinceRangeKey('2026-10-02 00:00:00'), 'since:2026-10-02');
  assert.equal(sinceRangeKey(null), null);
  const s = [R('2026-09-01', 'A'), R('2026-10-01', 'B'), R('2026-10-05', 'B')];
  assert.equal(filterByRange(s, 'since:2026-10-02').length, 1);
  assert.equal(filterByRange(s, RANGE_ALL).length, 3);
  const opts = rangeOptions(s, { since: '2026-10-02' });
  assert.deepEqual(opts[0], ['since:2026-10-02', '현재 설계(10-02~)']);
  assert.equal(opts[1][0], RANGE_ALL);
  assert.equal(rangeOptions(s)[0][0], RANGE_ALL);
});
