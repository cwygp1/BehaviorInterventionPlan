// 기초 평가 3가지 작성 판정(lib/assessStatus.js) — AssessmentLauncher '✓ 작성됨'과 같은 규칙(3단계).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessStatus, assessStatusOfData, interviewDoneCount, reinforcerDone, priorityDone } from '../../assessStatus.js';

test('빈 재료는 셋 다 미작성', () => {
  const st = assessStatus({});
  assert.deepEqual([st.interview, st.reinf, st.prio, st.done], [false, false, false, 0]);
  assert.deepEqual(st.missing, ['초기면담', '강화제 평가', '표적행동 우선순위']);
  assert.equal(assessStatusOfData(null).done, 0);
});

test('초기면담: 8섹션 중 하나라도 채우면 작성(InitialInterviewModal interviewProgress done>0과 같음)', () => {
  assert.equal(interviewDoneCount({}), 0);
  assert.equal(interviewDoneCount({ interviewee: '어머니', date: '2026-10-01' }), 0, '면담자·날짜만으로는 섹션이 아님');
  assert.equal(interviewDoneCount({ traits: { selfcare: 0 } }), 0);
  assert.equal(interviewDoneCount({ traits: { selfcare: 3 } }), 1);
  assert.equal(interviewDoneCount({ referReason: ' 수업 방해 ', abcB: '소리' }), 2);
  assert.equal(interviewDoneCount({ concerns: { x: { self: 1 } }, envMethods: ['a'], expectation: '앉기' }), 3);
});

test('강화제: RAISD 순위나 체크리스트 4·5점 항목', () => {
  assert.equal(reinforcerDone(null), false);
  assert.equal(reinforcerDone({ _meta: { ranking: ['', null] } }), false);
  assert.equal(reinforcerDone({ _meta: { ranking: ['비눗방울'] } }), true);
});

test('우선순위: 새 9기준 총점>0, 옛 숫자 배열은 미작성', () => {
  assert.equal(priorityDone(null), false);
  assert.equal(priorityDone([3, 2, 1]), false, '옛 형식은 다시 평정');
  assert.equal(priorityDone([{ name: '때리기', responses: [0, 0, 0] }]), false, '이름만 있고 총점 0이면 미작성');
  assert.equal(priorityDone([{ name: '때리기', responses: [2, 1, 0] }]), true);
});
