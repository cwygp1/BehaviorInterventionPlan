import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingDays, monthGrid, monthInLabel, monthlyGoalText, isSchoolDay, semesterOf, shiftMonth } from '../calendarRules.js';

const TODAY = '2026-09-15';

test('2026년 9월 격자는 8/30(일)~10/3(토) 5주', () => {
  assert.deepEqual(monthGrid('2026-09'), { first: '2026-09-01', last: '2026-09-30', start: '2026-08-30', end: '2026-10-03' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('주말·추석은 학교 가는 날이 아니다', () => {
  assert.equal(isSchoolDay('2026-09-15'), true);
  assert.equal(isSchoolDay('2026-09-13'), false);
  assert.equal(isSchoolDay('2026-09-25'), false);
});

test('CICO: 첫 기록일부터 어제까지 비어 있는 평일만, 오늘은 제외', () => {
  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11', '2026-09-14'];
  const r = missingDays({ today: TODAY, from: '2026-08-30', to: '2026-10-03', cico: { 5: dates } });
  assert.deepEqual(r, [{ date: '2026-09-10', studentId: '5', kind: 'cico' }]);
});

test('CICO: 마지막 기록이 7일보다 오래됐으면 끝난 중재로 보고 그 뒤를 빠진 날로 치지 않는다', () => {
  const r = missingDays({ today: TODAY, from: '2026-08-30', to: '2026-10-03', cico: { 5: ['2026-08-31', '2026-09-01'] } });
  assert.deepEqual(r, []);
});

test('행동 데이터: 기초선 기간 안, 첫 기록일 이후만 판정 · 기록 없는 기간은 판정 안 함', () => {
  const periods = [
    { studentId: 7, tier: 'baseline', start: '2026-08-31', end: '2026-09-11' },
    { studentId: 7, tier: 'tier3', start: '2026-09-14', end: null },
    { studentId: 8, tier: 'baseline', start: '2026-09-01', end: null }, // 기록 0건
    { studentId: 7, tier: 'tier2', start: '2026-09-01', end: null },    // 행동 데이터 대상 아님
  ];
  const mon = { 7: ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-10', '2026-09-11', '2026-09-15'] };
  const r = missingDays({ today: TODAY, from: '2026-08-30', to: '2026-10-03', mon, periods });
  assert.deepEqual(r.map((x) => x.date), ['2026-09-09', '2026-09-14']);
});

test('IEP 월 라벨 해석(단일·구간·해 넘김·목록)', () => {
  assert.equal(monthInLabel('9', 9), true);
  assert.equal(monthInLabel('9월', 9), true);
  assert.equal(monthInLabel('9-10', 10), true);
  assert.equal(monthInLabel('11-2', 1), true);
  assert.equal(monthInLabel('11-2', 9), false);
  assert.equal(monthInLabel('9·11', 10), false);
  assert.equal(monthlyGoalText([{ month: '9-10', goal: '- 받아올림 덧셈 3문항 중 2문항\n- 둘째 줄' }], 10), '받아올림 덧셈 3문항 중 2문항');
  assert.deepEqual(semesterOf('2027-02-10'), { schoolYear: 2026, semester: 2 });
});

test('행동 데이터: 열린 기간이라도 기록을 7일 넘게 멈췄으면 마지막 기록일 뒤는 빠진 날이 아니다', () => {
  const periods = [{ studentId: 9, tier: 'baseline', start: '2026-08-17', end: null }];
  const mon = { 9: ['2026-08-17', '2026-08-18', '2026-08-20', '2026-09-02'] };
  const r = missingDays({ today: TODAY, from: '2026-08-02', to: '2026-10-03', mon, periods });
  assert.equal(r[0].date, '2026-08-19');
  assert.equal(r[r.length - 1].date, '2026-09-01');
});
