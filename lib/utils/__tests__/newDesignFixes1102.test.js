// mds/56 독립 검토 수정(1102) — 순수 로직 단위 테스트.
//   #4 표시만 저장해도 eval이 비지 않음 · #10 옛 화면 monthly 전체 저장에서 새 디자인 월 평가 지키기 · #11 '다음 학생' 건너뛰기 좁히기
//   #12 빠른 기록 기본 날짜(KST)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMonthEval, evalTextFor, evalSafeText, MARK_DEFAULT_EVAL, isDefaultEval, keepMarkedEvals } from '../../iepCard.js';
import { nextQuickRow } from '../../todo.js';
import { todayKst } from '../calendarRules.js';

test('#4 표시만 고르고 글을 비우면 표시에 맞는 기본 문장(명사형 안전망을 그대로 통과)', () => {
  const out = mergeMonthEval([{ month: '11', eval: '- 관찰 평가' }], 0, { mark: '달성', text: '', date: '2026-11-02' });
  assert.equal(out[0].eval, '이달 목표 달성함');
  assert.equal(out[0].eval_method, '- 관찰 평가');
  for (const v of Object.values(MARK_DEFAULT_EVAL)) assert.equal(evalSafeText(v), v);
  assert.equal(evalTextFor('', '부분'), '이달 목표 일부 달성함');
  assert.equal(evalTextFor('  ', ''), '');
  // 기본 문장 그대로 다시 저장하며 표시만 바꾸면 기본 문장도 바뀜, 직접 쓴 글은 안전망만
  assert.equal(evalTextFor('이달 목표 달성함', '미달'), '이달 목표 미달성함');
  assert.equal(evalTextFor('5회 중 4회 스스로 읽었다.', '달성'), evalSafeText('5회 중 4회 스스로 읽었다.'));
  assert.ok(isDefaultEval('이달 목표 일부 달성함') && !isDefaultEval('스스로 읽음'));
});

const marked = (month, ev, at, mark = '달성', method) => ({ month, goal: 'g' + month, eval: ev, eval_at: at, eval_mark: mark, ...(method !== undefined ? { eval_method: method } : {}) });

test('#10 평가 전에 연 옛 사본(평가 키 없음)이 보낸 monthly는 그 달 평가만 기존 값으로', () => {
  const cur = [{ month: '9', goal: 'g9', eval: '' }, marked('10', '스스로 읽음', '2026-10-31', '달성', '- 관찰 평가')];
  const body = [{ month: '9', goal: 'g9 고침', eval: '' }, { month: '10', goal: 'g10 고침', eval: '- 관찰 평가' }];
  const out = keepMarkedEvals(cur, body);
  assert.deepEqual(out[0], body[0]);
  assert.equal(out[1].goal, 'g10 고침');
  assert.equal(out[1].eval, '스스로 읽음');
  assert.equal(out[1].eval_at, '2026-10-31');
  assert.equal(out[1].eval_mark, '달성');
  assert.equal(out[1].eval_method, '- 관찰 평가');
});

test('#10 다시 만든 월별 계획의 새 평가 방법 글은 eval_method로 남김', () => {
  const cur = [marked('10', '스스로 읽음', '2026-10-31', '달성', '- 옛 방법')];
  const out = keepMarkedEvals(cur, [{ month: '10', goal: 'new', eval: '- 새 방법' }]);
  assert.equal(out[0].eval, '스스로 읽음');
  assert.equal(out[0].eval_method, '- 새 방법');
});

test('#10 평가 뒤에 연 사본(같은 eval_at)은 보낸 그대로 — 옛 화면에서 일부러 고치거나 지운 평가 존중', () => {
  const cur = [marked('10', '스스로 읽음', '2026-10-31')];
  const edited = [{ ...cur[0], eval: '고친 평가함' }];
  assert.deepEqual(keepMarkedEvals(cur, edited), edited);
  // 1104(mds/58 #27): 글을 지우면 '그 달은 평가 안 함' — 지운 것은 존중하되 표시(eval_at·eval_mark)도 같이 비운다.
  const cleared = [{ ...cur[0], eval: '' }];
  assert.deepEqual(keepMarkedEvals(cur, cleared), [{ ...cur[0], eval: '', eval_at: '', eval_mark: '' }]);
});

test('#10 보낸 사본의 eval_at이 더 오래됐으면(그 뒤 새 디자인에서 또 평가) 기존 평가', () => {
  const cur = [marked('10', '새 평가함', '2026-11-02', '부분')];
  const stale = [marked('10', '옛 평가함', '2026-10-31', '달성')];
  const out = keepMarkedEvals(cur, stale);
  assert.equal(out[0].eval, '새 평가함');
  assert.equal(out[0].eval_mark, '부분');
  assert.equal(out[0].eval_at, '2026-11-02');
});

test('#10 기존에 새 디자인 평가가 없으면 보낸 그대로(예전 동작), 라벨이 같은 칸이 여럿이면 차례대로 맞춤', () => {
  const plain = [{ month: '10', eval: 'a' }];
  const body = [{ month: '10', eval: '' }];
  assert.equal(keepMarkedEvals(plain, body), body);
  const cur = [{ month: '3-4', eval: '' }, marked('3-4', '둘째 평가함', '2026-04-30')];
  const out = keepMarkedEvals(cur, [{ month: '3-4', eval: 'x' }, { month: '3-4', eval: 'y' }]);
  assert.equal(out[0].eval, 'x');
  assert.equal(out[1].eval, '둘째 평가함');
  assert.deepEqual(keepMarkedEvals(null, []), []);
});

test('#11 다음 학생: Map이면 저장한 할 일과 지금 할 일이 같을 때만 건너뜀', () => {
  const rows = [{ id: 1, task: 'chk' }, { id: 2, task: 'obs' }, { id: 3, task: 'done' }];
  // 1에게 관찰을 저장했는데(표 새로 고침 뒤) 이제 점검표가 남음 → 다시 다음 학생
  assert.equal(nextQuickRow(rows, 2, new Map([[1, 'obs']])).id, 1);
  // 표가 아직 안 바뀌어 같은 할 일이면 건너뜀
  assert.equal(nextQuickRow(rows, 2, new Map([[1, 'chk']])), null);
  assert.equal(nextQuickRow(rows, 2, new Map([['1', 'chk']])), null);
  // Set은 예전처럼 무조건 건너뜀
  assert.equal(nextQuickRow(rows, 2, new Set([1])), null);
});

test('#12 빠른 기록 기본 날짜 — UTC 자정~오전 9시(KST)에도 한국 날짜', () => {
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-11-01T23:40:00Z'); // KST 11/2 08:40
    assert.equal(todayKst(), '2026-11-02');
    assert.equal(new Date(Date.now()).toISOString().slice(0, 10), '2026-11-01'); // 고치기 전 방식은 어제
  } finally { Date.now = realNow; }
});
