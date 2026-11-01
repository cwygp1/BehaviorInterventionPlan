// 학생 수첩 진행 줄·처음 설정(lib/notebook.js) — 3단계.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planProgress, recordSetup, recentRecords, qabfAnswered } from '../../notebook.js';

test('진행 줄: 기록 0건이면 관찰부터, 그다음 이유·계획', () => {
  const p0 = planProgress({});
  assert.equal(p0.now, 'obs');
  assert.deepEqual(p0.steps.map((s) => s.state), ['now', 'later', 'later']);
  const q = new Array(25).fill(-1); q[0] = 2; q[1] = -2;
  const p1 = planProgress({ abc: [{ id: 1 }], qabf: q });
  assert.equal(p1.now, 'why');
  assert.equal(p1.steps[1].text, '2/25 답함');
  const full = new Array(25).fill(1);
  const p2 = planProgress({ mon: [{ id: 1 }], qabf: full });
  assert.equal(p2.now, 'plan');
  const p3 = planProgress({ mon: [{ id: 1 }], qabf: full, bip: { prev: '자리 바꾸기' } });
  assert.equal(p3.now, 'done');
  assert.deepEqual(p3.steps.map((s) => s.state), ['done', 'done', 'done']);
  assert.equal(qabfAnswered(null), 0);
});

test('처음 설정: 정의·관찰 기간·(소그룹이면)교시가 있어야 접힘', () => {
  const s0 = recordSetup({});
  assert.equal(s0.done, false);
  assert.equal(s0.open, true);
  const s1 = recordSetup({ bip: { opdef: '책상을 두드린다' }, periods: [{ start_date: '2026-10-01', end_date: null }] });
  assert.equal(s1.done, true);
  assert.equal(s1.open, false);
  assert.match(s1.items[1].text, /진행 중/);
  const s2 = recordSetup({ bip: { opdef: 'x' }, periods: [{}] }, { inGroup: true });
  assert.equal(s2.done, false, '소그룹인데 교시가 없음');
  const s3 = recordSetup({ bip: { opdef: 'x' }, periods: [{}], cico: [{ periods: ['1', '2'] }] }, { inGroup: true });
  assert.equal(s3.done, true);
  assert.equal(s3.items[3].text, '2교시');
});

test('최근 기록: 두 종류를 날짜 내림차순으로, 오늘 건수', () => {
  const r = recentRecords({
    abc: [{ id: 1, date: '2026-10-30', b: '소리 지름', created_at: '2026-10-30 09:00:00' }],
    mon: [{ id: 2, date: '2026-11-01', beh: '때리기', freq: 3, phase: 'A', created_at: '2026-11-01 10:00:00' }],
  }, '2026-11-01');
  assert.equal(r.todayN, 1);
  assert.equal(r.total, 2);
  assert.equal(r.rows[0].kind, 'mon');
  assert.match(r.rows[0].text, /기초선/);
});
