// mds/58(1103) 묶음 A2 — 학생·학급 불러오기 실패 상태, 샘플 넣기 겹침, 학생 목록 학년 표기. 순수 로직 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listLoadView, listErrorWhat, shareInflight } from '../../listLoadState.js';
import { levelGradeLabel } from '../../schoolLevel.js';

test('#5 학생 목록 첫 받기 실패 — 불러오는 중에 멈추지 않고 오류', () => {
  assert.equal(listLoadView({ studentsLoaded: false, studentsError: '', classesError: '', count: 0 }), 'loading');
  assert.equal(listLoadView({ studentsLoaded: false, studentsError: '서버 오류', classesError: '', count: 0 }), 'error');
});

test("#6 학급 목록 실패 — 학생 0명으로 보여도 '처음이시네요'(empty)가 아니라 오류", () => {
  assert.equal(listLoadView({ studentsLoaded: true, studentsError: '', classesError: '서버 오류', count: 0 }), 'error');
  assert.equal(listLoadView({ studentsLoaded: true, studentsError: '', classesError: '', count: 0 }), 'empty');
});

test('#2 다시 받기 실패 — 받아 둔 목록은 그대로 보이고 안내만(stale)', () => {
  assert.equal(listLoadView({ studentsLoaded: true, studentsError: '서버 오류', classesError: '', count: 3 }), 'stale');
  assert.equal(listLoadView({ studentsLoaded: true, studentsError: '', classesError: '', count: 3 }), 'ok');
});

test('안내문은 무엇을 못 받았는지 말한다', () => {
  assert.equal(listErrorWhat('x', ''), '학생 목록');
  assert.equal(listErrorWhat('', 'x'), '학급 목록');
  assert.equal(listErrorWhat('x', 'y'), '학급과 학생 목록');
  assert.equal(listErrorWhat('', ''), '');
});

test('#11 샘플 넣기를 겹쳐 부르면 요청은 한 번, 같은 결과를 함께 받는다', async () => {
  const run = shareInflight();
  let calls = 0;
  let release;
  const job = () => { calls += 1; return new Promise((r) => { release = r; }); };
  const a = run(job);
  const b = run(job);
  assert.equal(a, b);
  release('샘플A');
  assert.equal(await a, '샘플A');
  assert.equal(await b, '샘플A');
  assert.equal(calls, 1);
  // 끝난 뒤에는 새로 돈다
  const c = run(async () => { calls += 1; return 'again'; });
  assert.equal(await c, 'again');
  assert.equal(calls, 2);
});

test('#11 실패도 함께 받고, 실패 뒤에는 다시 시도할 수 있다', async () => {
  const run = shareInflight();
  const a = run(async () => { throw new Error('409'); });
  const b = run(async () => 'never');
  await assert.rejects(a, /409/);
  await assert.rejects(b, /409/);
  assert.equal(await run(async () => 'ok'), 'ok');
});

test('#11 동기 throw도 거부된 Promise로 돌려준다(학급 없음 안내)', async () => {
  const run = shareInflight();
  await assert.rejects(run(() => { throw new Error('학급을 먼저 만들어주세요.'); }), /학급을 먼저/);
});

test("#30·#31 학생 목록 학년 — 샘플 '초4'·'초2'도 '초등학교 4학년'", () => {
  assert.equal(levelGradeLabel('초등', '초4'), '초등학교 4학년');
  assert.equal(levelGradeLabel('초등', '초2'), '초등학교 2학년');
  assert.equal(levelGradeLabel('중등', '3'), '중학교 3학년');
  assert.equal(levelGradeLabel('', ''), '');
});
