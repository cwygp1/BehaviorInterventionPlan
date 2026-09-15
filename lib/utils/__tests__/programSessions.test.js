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

import { normalizeTrials, scoreDtt, masteryOf, defaultDttMastery, itemHistory, stuckItem, nextDttCode, dttItemJudgement, dttSummary, dttDefaultsFromGoal } from '../../programSessions.js';

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

test('DTT 판정: 유지·일반화 표적이 기준 아래로 내려가면 막힘이 아니어도 다시 지도(dropped)', () => {
  const m = { pct: 80, runs: 2 };
  const h = [{ phase: 'teach', pct: 90 }, { phase: 'teach', pct: 80 }, { phase: 'maintain', pct: 60 }];
  assert.deepEqual(dttItemJudgement('maintain', h, m), { reached: false, stuck: false, dropped: true });
  assert.deepEqual(dttItemJudgement('maintain', h.slice(0, 2), m), { reached: true, stuck: false, dropped: false });
  assert.equal(dttItemJudgement('teach', h, m).dropped, false);
  assert.equal(dttItemJudgement('maintain', [], m).dropped, false);
});

test('DTT 요약(횟수형)은 표적을 합치지 않고 표적별 기회 중 성공으로', () => {
  const s = [{ phase: 'teach', correct_count: 14, scored_count: 20, pct: 70,
    steps_snapshot: [{ id: 'a', text: '빨강' }, { id: 'b', text: '파랑' }],
    item_stats: [{ correct: 8, prompted: 1, scored: 10, pct: 80 }, { correct: 6, prompted: 2, scored: 10, pct: 60 }] }];
  const items = [{ id: 'a', text: '빨강', status: 'teach' }, { id: 'b', text: '파랑', status: 'teach' }];
  assert.equal(dttSummary(items, s, { type: 'count', of: 10, min: 8, runs: 2 }), "지도 1회기 · 최근 회기 '빨강' 10회 기회 중 8회, '파랑' 10회 기회 중 6회 성공");
  assert.equal(dttSummary(items, s, { type: 'rate', pct: 80, runs: 2 }), '지도 1회기 · 최근 독립 수행 비율 70%');
});

test('IEP 목표에서 DTT 기본값: 기회 중 성공 횟수는 분모를 기회 수로, 학기말 목표 횟수를 학습기준으로', () => {
  assert.deepEqual(dttDefaultsFromGoal({ crit_type: 'freq', crit_of: 5, crit_end: 4 }), { trials: 5, mastery: { type: 'count', of: 5, min: 4, runs: 2 } });
  assert.deepEqual(dttDefaultsFromGoal({ crit_type: 'freq', crit_end: 80 }), { trials: 10, mastery: { type: 'count', of: 10, min: 8, runs: 2 } }); // 예전 % 저장본
  assert.deepEqual(dttDefaultsFromGoal({ crit_type: 'rate', crit_end: 90 }, 20), { trials: 20, mastery: { type: 'rate', pct: 90, runs: 2 } });
  assert.deepEqual(dttDefaultsFromGoal(null), { trials: 10, mastery: { type: 'rate', pct: 80, runs: 2 } });
});
