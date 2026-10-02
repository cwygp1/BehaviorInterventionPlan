import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designSummaryForPrompt, designTableForReport } from '../scedSummary.js';

const base = (design, design_cfg, mon) => ({ bip: { design, design_cfg }, mon });

test('AB·ABAB는 빈 요약(기존 A/B 요약 그대로)', () => {
  assert.equal(designSummaryForPrompt(base('AB', {}, [])), '');
  assert.equal(designTableForReport(base('ABAB', {}, [])), null);
});

test('기준변경 요약·표: 구간·판정이 들어간다', () => {
  const mon = [{ date: '2026-09-01', phase: 'A', freq: 8 }, { date: '2026-09-02', phase: 'B', freq: 5, criterion: 5 }, { date: '2026-09-03', phase: 'B', freq: 4, criterion: 5 }, { date: '2026-09-04', phase: 'B', freq: 5, criterion: 5 }];
  const d = base('CC', { CC: { metric: 'freq', direction: 'down', hitRuns: 3, nearPct: 30 } }, mon);
  const s = designSummaryForPrompt(d);
  assert.match(s, /## 설계: 기준변경/);
  assert.match(s, /기준1 = 5 .*3회기.*✓ 달성/);
  const t = designTableForReport(d);
  assert.equal(t.rows.length, 1); assert.equal(t.rows[0][1], 5);
});

test('교대중재 요약·표: 조건별·비교 쌍', () => {
  const mon = [{ date: 'd1', phase: 'B', freq: 4, condition: 'a' }, { date: 'd2', phase: 'B', freq: 1, condition: 'b' }, { date: 'd3', phase: 'B', freq: 5, condition: 'a' }, { date: 'd4', phase: 'B', freq: 2, condition: 'b' }];
  const d = base('ATD', { ATD: { conditions: ['a', 'b'], baseline: false } }, mon);
  const s = designSummaryForPrompt(d);
  assert.match(s, /- a: 2회기, 평균 4.5/);
  assert.match(s, /a vs b: 평균 차\(뒤−앞\) -3, Tau-U -1/);
  const t = designTableForReport(d);
  assert.equal(t.rows.length, 2); assert.equal(t.extra.rows.length, 1);
});

test('중다기초선 요약·표: 층별', () => {
  const mon = [{ date: 'd1', phase: 'A', freq: 6, beh: '소리' }, { date: 'd1', phase: 'A', freq: 3, beh: '이탈' }, { date: 'd2', phase: 'B', freq: 2, beh: '소리' }, { date: 'd2', phase: 'A', freq: 3, beh: '이탈' }];
  const d = base('MBL', { MBL: { dimension: 'behavior' } }, mon);
  const s = designSummaryForPrompt(d);
  assert.match(s, /행동 간/); assert.match(s, /층 "소리": 중재 시작 d2/); assert.match(s, /층 "이탈": 중재 시작 아직/);
  const t = designTableForReport(d);
  assert.equal(t.rows.length, 2); assert.equal(t.rows[1][1], '아직');
});
