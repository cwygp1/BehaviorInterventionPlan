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
