import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strategyValue, replaceAutoStrategy } from '../semStrategy.js';

const LIST = '차별강화, 자기관리전략, 사회적기술훈련, 행동기술훈련(BST), 배경 및 선행사건 기반 중재, 기능적 의사소통 훈련(FCT)';
const FCT = '기능적 의사소통 훈련(FCT)';
const BST = '행동기술훈련(BST)';
const sem = (s) => [`- 지도전략: ${s}`, '- 지원수준: 현행 수준에서 시작해 촉구를 점차 줄여', '- 강화: 즉시 강화 → 간헐 강화'].join('\n');

test('strategyValue: 첫 지도전략 줄 값', () => {
  assert.equal(strategyValue(sem(FCT)), FCT);
  assert.equal(strategyValue('- 지도 전략 ： 자기관리전략 '), '자기관리전략');
  assert.equal(strategyValue('지도전략: 직접교수'), '직접교수');
  assert.equal(strategyValue('- 지원수준: …\n- 강화: …'), '');
  assert.equal(strategyValue(''), '');
  assert.equal(strategyValue(null), '');
});

test('replaceAutoStrategy: 장애영역 목록 자동값이면 핵심기술 방법 하나로', () => {
  const out = replaceAutoStrategy(sem(LIST), FCT, [LIST]);
  assert.equal(out, sem(FCT));
  assert.equal(strategyValue(out), FCT);
});

test('replaceAutoStrategy: 이전 핵심기술 방법(자동값)이면 새 방법으로', () => {
  assert.equal(replaceAutoStrategy(sem(FCT), BST, [LIST, FCT]), sem(BST));
});

test('replaceAutoStrategy: 교사가 고친 값은 그대로', () => {
  const edited = sem('기능적 의사소통 훈련(FCT) + 시각적 지원');
  assert.equal(replaceAutoStrategy(edited, BST, [LIST, FCT]), edited);
  const trimmed = sem('차별강화, 자기관리전략');
  assert.equal(replaceAutoStrategy(trimmed, FCT, [LIST]), trimmed);
});

test('replaceAutoStrategy: 지도전략 줄이 없거나 비었거나 이미 같으면 원문', () => {
  const noLine = '- 지원수준: …\n- 강화: …';
  assert.equal(replaceAutoStrategy(noLine, FCT, [LIST]), noLine);
  assert.equal(replaceAutoStrategy('', FCT, [LIST]), '');
  assert.equal(replaceAutoStrategy(sem(FCT), FCT, [FCT]), sem(FCT));
  assert.equal(replaceAutoStrategy(sem(LIST), '', [LIST]), sem(LIST));
});

test('replaceAutoStrategy: 첫 지도전략 줄만, 앞머리 유지', () => {
  const two = `  • 지도전략: ${LIST}\n- 지도전략: ${LIST}`;
  assert.equal(replaceAutoStrategy(two, FCT, [LIST]), `  • 지도전략: ${FCT}\n- 지도전략: ${LIST}`);
});
