import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodes, scoreSession, masteryReached, mergeCandidates, defaultMastery } from '../../programSessions.js';

test('정반응률은 + 와 I 를 정반응으로, P·− 는 채점만 하고 T·빈칸은 제외한다', () => {
  const r = scoreSession(['+', 'I', 'P', '-', 'T', '']);
  assert.deepEqual(r, { correct: 2, indep: 1, prompted: 1, scored: 4, pct: 50 });
});

test('전진형은 목표 단계 뒤를, 후진형은 목표 단계 앞을 T로 두고 기초선에서는 P를 쓰지 않는다', () => {
  assert.deepEqual(normalizeCodes(['+', 'P', '+', '+'], 4, { chainType: 'forward', targetStep: 2 }), ['+', 'P', 'T', 'T']);
  assert.deepEqual(normalizeCodes(['+', 'P', 'I', '-'], 4, { chainType: 'backward', targetStep: 1 }), ['T', 'T', 'T', '-']);
  assert.deepEqual(normalizeCodes(['P', 'I'], 2, { chainType: 'total', phase: 'baseline' }), ['-', 'I']);
});

test('기준 도달은 기초선을 빼고 최근 연속 회기로 판정한다(전과제형 3회기 100%)', () => {
  const s = [{ phase: 'teach', pct: 90 }, { phase: 'baseline', pct: 20 }, { phase: 'teach', pct: 80 }];
  assert.equal(masteryReached(s, defaultMastery('forward')), true);
  assert.equal(masteryReached(s, defaultMastery('total')), false);
});

test('3회기 연속 정반응인 인접 단계 쌍만 합치기 제안', () => {
  const row = (codes) => ({ phase: 'teach', codes });
  const s = [row(['I', '+', 'P', '+']), row(['+', 'I', '-', '+']), row(['I', 'I', '+', '+'])];
  assert.deepEqual(mergeCandidates(s, 4), [[0, 1]]);
  assert.deepEqual(mergeCandidates(s.slice(1), 4), []);
});

import { normalizeTrials, scoreDtt, masteryOf, defaultDttMastery, itemHistory, stuckItem, nextDttCode } from '../../programSessions.js';

test('DTT: I는 +로, 기초선 P는 −로 바꾸고 빈칸은 분모에서 뺀다', () => {
  const rows = normalizeTrials([['+', 'I', 'P', '-', ''], ['P']], 2, 5, 'teach');
  assert.deepEqual(rows[0], ['+', '+', 'P', '-', '']);
  assert.deepEqual(normalizeTrials([['P', '+']], 1, 2, 'baseline')[0], ['-', '+']);
  const s = scoreDtt(rows);
  assert.deepEqual(s.stats[0], { correct: 2, prompted: 1, scored: 4, pct: 50 });
  assert.equal(s.scored, 5); assert.equal(s.correct, 2);
  assert.equal(nextDttCode(''), '+'); assert.equal(nextDttCode('-'), '');
});

test('DTT 학습기준: 기회 중 성공(10회 중 8회)은 80%로 환산, IEP freq 목표면 횟수형 기본', () => {
  assert.deepEqual(masteryOf({ type: 'count', of: 5, min: 4, runs: 2 }), { pct: 80, runs: 2 });
  assert.deepEqual(defaultDttMastery('freq', 10), { type: 'count', of: 10, min: 8, runs: 2 });
  assert.equal(defaultDttMastery('rate').type, 'rate');
});

test('표적 이력은 스냅샷 id로 찾고, 지도 3회기 연속 50% 미만이면 막힘', () => {
  const ses = (phase, pct) => ({ phase, steps_snapshot: [{ id: 'a' }, { id: 'b' }], item_stats: [{ scored: 10, correct: pct / 10, pct }, { scored: 10, correct: 9, pct: 90 }] });
  const h = itemHistory([ses('baseline', 0), ses('teach', 40), ses('teach', 30), ses('teach', 20)], 'a');
  assert.equal(h.length, 4);
  assert.equal(stuckItem(h), true);
  assert.equal(stuckItem(itemHistory([ses('teach', 90)], 'b')), false);
});
