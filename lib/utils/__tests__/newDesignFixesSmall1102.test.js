// mds/56 독립 검토 '작음' 수정(1102) — 순수 로직 단위 테스트.
//   #32 카드 월 평가 칸을 번호+라벨로 확인 · #35 '끝' 줄 단추 낱말(todo.test.js에도 있음) · #38 '/'에서 새 디자인 주소 넘기기 규칙
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalIndexFor } from '../../iepCard.js';
import { doneBtn } from '../../todo.js';
import { parseHash } from '../../routes.js';

const M5 = [{ month: '3' }, { month: '4' }, { month: '5' }, { month: '6' }, { month: '7' }];

test('#32 번호 자리 라벨이 같으면 그 칸', () => {
  assert.equal(evalIndexFor(M5, { monthIdx: 2, monthLabel: '5' }), 2);
  assert.equal(evalIndexFor(M5, { monthIdx: 2, monthLabel: 5 }), 2); // 숫자·글자 섞여도
});

test('#32 월 묶기가 바뀌어 번호 자리 라벨이 다르면 같은 라벨 칸(하나뿐일 때)', () => {
  const M6 = [{ month: '3' }, { month: '3' + '-4' }, { month: '5' }, { month: '6' }, { month: '7' }, { month: '8' }];
  assert.equal(evalIndexFor(M6, { monthIdx: 3, monthLabel: '5' }), 2);
});

test('#32 라벨 칸을 못 찾거나 둘 이상이면 -2(저장하지 않고 새로고침 안내)', () => {
  const merged = [{ month: '3-4' }, { month: '5-6' }, { month: '7' }];
  assert.equal(evalIndexFor(merged, { monthIdx: 2, monthLabel: '5' }), -2);
  assert.equal(evalIndexFor([{ month: '5' }, { month: '5' }, { month: '6' }], { monthIdx: 2, monthLabel: '5' }), -2);
});

test('#32 라벨 없이 번호만 주면 예전처럼(범위 밖은 -1), 번호가 없으면 이번 달로 찾기', () => {
  assert.equal(evalIndexFor(M5, { monthIdx: 4 }), 4);
  assert.equal(evalIndexFor(M5, { monthIdx: 9 }), -1);
  assert.equal(evalIndexFor(M5, { month: 6, sem: 1 }), 3);
  assert.equal(evalIndexFor(M5, { month: 12, sem: 1 }), -1);
});

test('#35 끝 줄 단추 낱말', () => {
  assert.equal(doneBtn('chk'), '고쳐 쓰기');
  for (const m of ['obs', 'num', 'ses']) assert.equal(doneBtn(m), '하나 더 적기');
});

test('#38 /new가 받는 새 주소는 parseHash가 해석하고, 모르는 주소는 오늘로', () => {
  assert.equal(parseHash('#student/5/plan?sub=qabf').kind, 'student');
  assert.equal(parseHash('#gibberish').kind, 'today');
});
