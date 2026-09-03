import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuestionLine, isQuestionList, questionToObservation, guardEvalText, splitItems } from '../iepEvalGuard.js';

// 0904 갑 지적 화면 — 평가(서술형) 칸에 평가계획 질문이 그대로 들어간 실제 사례(첫 줄만 대시 없음).
const ECHOED = '손 씻기 순서 그림 카드를 보고 비누를 손바닥에 두 번 찍어 문질러 보는 과정을 따라하는가?\n- 물과 비누를 다루는 도중에도 자리에 안정적으로 머무는가?';
const RULE_EVAL = '- 평가초점: 손 씻기 순서 따르기\n- 수업 맥락(교사 중재·학생 반응·또래/환경 상호작용)을 포함해 학습 과정과 결과를 서술 평가\n- 초기 촉진 필요 → 반복 후 독립성 증가 등 변곡점을 내러티브로 기록';

test('질문문 판별: 물음표·~는가·~니까·~나요', () => {
  assert.equal(isQuestionLine('- 과정을 따라하는가?'), true);
  assert.equal(isQuestionLine('과정을 따라하는가'), true);
  assert.equal(isQuestionLine('자리에 있습니까?'), true);
  assert.equal(isQuestionLine('규칙을 지키나요'), true);
  assert.equal(isQuestionLine('- 촉구 수준의 변화를 함께 서술'), false);
  assert.equal(isQuestionLine(''), false);
});

test('질문 나열 판별: 되풀이된 평가계획은 true, 규칙 초안 평가·빈 값·서술 위주는 false', () => {
  assert.equal(isQuestionList(ECHOED), true);
  assert.equal(isQuestionList('- 두 물체 중 큰 것을 고를 수 있는가?\n- 비교 활동에 스스럼없이 참여하는가?'), true);
  assert.equal(isQuestionList(RULE_EVAL), false);
  assert.equal(isQuestionList(''), false);
  assert.equal(isQuestionList(null), false);
  // 3항목 중 질문 1개(절반 미만)는 서술로 본다.
  assert.equal(isQuestionList('- 성공 횟수 기록\n- 촉구 변화 서술\n- 스스로 시도하는가?'), false);
});

test('질문 → 관찰 절 변환(어미별)', () => {
  assert.equal(questionToObservation('- 손 씻기 순서 그림 카드를 보고 비누를 손바닥에 두 번 찍어 문질러 보는 과정을 따라하는가?'),
    '손 씻기 순서 그림 카드를 보고 비누를 손바닥에 두 번 찍어 문질러 보는 과정을 따라하는지');
  assert.equal(questionToObservation('물과 비누를 다루는 도중에도 자리에 안정적으로 머무는가?'), '물과 비누를 다루는 도중에도 자리에 안정적으로 머무는지');
  assert.equal(questionToObservation('두 물체 중 큰 것을 고를 수 있는가?'), '두 물체 중 큰 것을 고를 수 있는지');
  assert.equal(questionToObservation('교사의 언어 지시에 바르게 응하는가?'), '교사의 언어 지시에 바르게 응하는지');
  assert.equal(questionToObservation('친구가 많은가?'), '친구가 많은지');
  assert.equal(questionToObservation('이것이 정답인가?'), '이것이 정답인지');
  assert.equal(questionToObservation('활동 자료가 충분한가?'), '활동 자료가 충분한지');
  assert.equal(questionToObservation('지시를 따라합니까?'), '지시를 따라하는지');
  assert.equal(questionToObservation('자리에 있습니까?'), '자리에 있는지');
  assert.equal(questionToObservation('규칙을 지키나요?'), '규칙을 지키는지');
  assert.equal(questionToObservation('규칙 준수?'), '규칙 준수 여부를');
  assert.equal(questionToObservation(''), '');
});

test('guardEvalText: 질문 나열은 관찰·기록 서술로, 서술형은 그대로', () => {
  const out = guardEvalText(ECHOED, { last: false });
  assert.deepEqual(splitItems(out), [
    '손 씻기 순서 그림 카드를 보고 비누를 손바닥에 두 번 찍어 문질러 보는 과정을 따라하는지 관찰해 기록',
    '물과 비누를 다루는 도중에도 자리에 안정적으로 머무는지 관찰해 기록',
    '수업 맥락(교사 촉진·학생 반응)과 촉진 수준의 변화를 함께 서술 기록',
  ]);
  assert.ok(out.split('\n').every((l) => l.startsWith('- ')), '모든 줄이 "- "로 시작');
  assert.ok(!/[?？]/.test(out), '물음표가 남지 않음');
  assert.match(guardEvalText('- 배운 내용을 다른 상황에도 적용하는가?', { last: true }), /학기 전체의 변화/);
  // 질문 아닌 줄이 섞여 있으면 그 줄은 그대로 둔다.
  assert.equal(guardEvalText('- 스스로 시도하는가?\n- 촉구 변화 기록'), '- 스스로 시도하는지 관찰해 기록\n- 촉구 변화 기록\n- 수업 맥락(교사 촉진·학생 반응)과 촉진 수준의 변화를 함께 서술 기록');
  assert.equal(guardEvalText(RULE_EVAL), RULE_EVAL);
  assert.equal(guardEvalText(''), '');
});
