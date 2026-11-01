// 새 디자인 '오늘' 표 할 일 계산(lib/todo.js) — 규칙 순서·칩 낱말·다음 학생 고르기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTodos, todoListFor, nextQuickRow, TASKS, actionFor, isQuickTask } from '../../todo.js';

const TODAY = '2026-11-02';
const cal = (events) => ({ today: TODAY, events });
const ev = (sid, kind, date = TODAY) => ({ date, studentId: String(sid), kind, n: 1, info: {} });
const dash = (stu, { groups = [], cico = {} } = {}) => ({ stu, t2: { groups, cico } });

test('칩 낱말은 프로토타입과 같다', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, v.chip])), {
    fresh: '새 학생', goal: '아직 없음', obs: '오늘 꼭', chk: '오늘 남음', eval: '이달 안에', assess: '아직 안 함', done: '끝',
  });
  assert.deepEqual(Object.fromEntries(Object.entries(TASKS).map(([k, v]) => [k, v.btn])), {
    fresh: '', goal: '목표 쓰기', obs: '기록하기', chk: '점검표 쓰기', eval: '평가 쓰기', assess: '기초 평가 하기', done: '고쳐 쓰기',
  });
});

test('아무 기록도 없는 학생은 새 학생(fresh) 하나만', () => {
  const l = todoListFor({ d: {}, kinds: new Set() });
  assert.equal(l.length, 1);
  assert.equal(l[0].task, 'fresh');
});

test('규칙 순서: 목표 0 > 오늘 관찰 없음 > 점검표 > 이달 평가', () => {
  const l = todoListFor({ d: { abc: 3, iepGoals: 0, iepMonthEvalMissing: 2 }, kinds: new Set(), inGroup: true });
  assert.deepEqual(l.map((x) => x.task), ['goal', 'obs', 'chk', 'eval']);
  const l2 = todoListFor({ d: { abc: 3, iepGoals: 2, iepMonthEvalMissing: 2 }, kinds: new Set(['abc']), inGroup: true });
  assert.deepEqual(l2.map((x) => x.task), ['chk', 'eval']);
  assert.match(l2[0].msg, /기록은 했고/);
  const l3 = todoListFor({ d: { abc: 3, iepGoals: 2 }, kinds: new Set(['abc', 'cico']), inGroup: true });
  assert.deepEqual(l3, []);
});

test('행동 수치를 더 많이 쌓은 학생은 수치 모드로 연다', () => {
  const l = todoListFor({ d: { abc: 1, mon: 9, iepGoals: 1 }, kinds: new Set() });
  assert.equal(l[0].task, 'obs');
  assert.equal(l[0].mode, 'num');
  assert.match(l[0].msg, /행동 수치/);
});

test('회기 기록도 오늘 관찰로 친다, 점검표만으로는 관찰이 끝나지 않는다', () => {
  assert.deepEqual(todoListFor({ d: { abc: 1, iepGoals: 1 }, kinds: new Set(['session']) }), []);
  assert.equal(todoListFor({ d: { abc: 1, iepGoals: 1 }, kinds: new Set(['cico']) })[0].task, 'obs');
});

test('computeTodos: 줄 모양·오늘 기록 수·외 n건', () => {
  const students = [{ id: 1, code: '가' }, { id: 2, code: '나' }, { id: 3, code: '다' }, { id: 4, code: '라' }];
  const d = dash(
    { 1: { abc: 2, iepGoals: 1 }, 2: { abc: 2, iepGoals: 0, iepMonthEvalMissing: 1 }, 3: { abc: 5, iepGoals: 2 } },
    { groups: [{ id: 9, members: [{ student_id: 3 }] }], cico: { 3: { today: false } } },
  );
  const out = computeTodos({ students, dash: d, cal: cal([ev(1, 'abc'), ev(3, 'mon'), ev(2, 'abc', '2026-10-30')]) });
  assert.equal(out.total, 4);
  assert.equal(out.recorded, 2);
  const by = Object.fromEntries(out.rows.map((r) => [r.code, r]));
  assert.equal(by['가'].task, 'done');
  assert.equal(by['가'].btn, '고쳐 쓰기');
  assert.equal(by['나'].task, 'goal');
  assert.equal(by['나'].more, 2); // 관찰 + 평가
  assert.equal(by['나'].action.type, 'go');
  assert.equal(by['나'].action.hash, '#student/2/iep');
  assert.equal(by['다'].task, 'chk');
  assert.equal(by['다'].action.type, 'quick');
  assert.equal(by['다'].action.mode, 'chk');
  assert.equal(by['라'].task, 'fresh');
  assert.equal(out.doneCount, 1);
});

test('대시보드 cico.today가 참이면 점검표는 끝', () => {
  const out = computeTodos({
    students: [{ id: 3, code: '다' }],
    dash: dash({ 3: { abc: 5, iepGoals: 2 } }, { groups: [{ id: 9, members: [{ student_id: 3 }] }], cico: { 3: { today: true } } }),
    cal: cal([ev(3, 'abc')]),
  });
  assert.equal(out.rows[0].task, 'done');
});

test('재료가 아직 없으면(로딩 중) 오류 없이 새 학생으로', () => {
  const out = computeTodos({ students: [{ id: 1, code: '가' }], dash: null, cal: null });
  assert.equal(out.rows[0].task, 'fresh');
});

test('다음 학생: 관찰·점검표 할 일만, 지금 학생·방금 끝낸 학생 건너뜀, 한 바퀴', () => {
  const rows = [
    { id: 1, task: 'obs' }, { id: 2, task: 'goal' }, { id: 3, task: 'chk' }, { id: 4, task: 'done' }, { id: 5, task: 'obs' },
  ];
  assert.equal(nextQuickRow(rows, 1).id, 3);
  assert.equal(nextQuickRow(rows, 3).id, 5);
  assert.equal(nextQuickRow(rows, 5).id, 1);
  assert.equal(nextQuickRow(rows, 5, new Set([1, 3])), null);
  assert.equal(nextQuickRow([], 1), null);
  assert.ok(isQuickTask('obs') && isQuickTask('chk') && !isQuickTask('goal') && !isQuickTask('eval'));
});

test('주 단추: 평가는 IEP 계획서 다듬기, 새 학생은 고르기', () => {
  assert.deepEqual(actionFor('eval', 7), { type: 'go', hash: '#student/7/iep?sub=iepReport' });
  assert.deepEqual(actionFor('fresh', 7), { type: 'choose' });
  assert.deepEqual(actionFor('obs', 7, 'num'), { type: 'quick', mode: 'num' });
});

test('3단계: 기초 평가 남음은 이달 평가 뒤·끝 앞, 재료가 없으면 건너뜀', () => {
  const d = { abc: 2, iepGoals: 1 };
  const kinds = new Set(['abc']);
  // 재료 없음 → 끝(빈 목록)
  assert.deepEqual(todoListFor({ sid: 1, d, kinds }), []);
  const assess = { missing: ['초기면담', '강화제 평가'] };
  const l = todoListFor({ sid: 1, d, kinds, assess });
  assert.deepEqual(l.map((x) => x.task), ['assess']);
  assert.match(l[0].msg, /2가지/);
  // 다른 할 일이 있으면 뒤로
  const l2 = todoListFor({ sid: 1, d: { ...d, iepMonthEvalMissing: 1 }, kinds: new Set(), assess });
  assert.deepEqual(l2.map((x) => x.task), ['obs', 'eval', 'assess']);
  // 다 했으면 없음
  assert.deepEqual(todoListFor({ sid: 1, d, kinds, assess: { missing: [] } }), []);
  // 새 학생은 평가보다 '새 학생'
  assert.deepEqual(todoListFor({ sid: 1, d: {}, kinds: new Set(), assess }).map((x) => x.task), ['fresh']);
  assert.deepEqual(actionFor('assess', 9), { type: 'go', hash: '#student/9/profile' });
  const t = computeTodos({ students: [{ id: 5, code: '가' }], dash: { stu: { 5: d } }, cal: { today: '2026-11-01', events: [{ studentId: 5, date: '2026-11-01', kind: 'abc' }] }, assess: { 5: assess } });
  assert.equal(t.rows[0].task, 'assess');
  assert.equal(t.rows[0].action.hash, '#student/5/profile');
});
