// mds/57 실제 브라우저 E2E 확정 문제 수정(1102) — 순수 로직 단위 테스트.
//   #1 학생 자료 실패를 빈 자료로 숨기지 않기 · #4 학생 코드 길이 · #6 로그인 끝남 뒤 빠른 기록 되살리기 · #9 학년 '초2' 읽기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT_CODE_MAX, studentCodeLength, studentCodeError } from '../../studentCode.js';
import { gradeOption, levelGradeLabel } from '../../schoolLevel.js';
import { writeQuickResume, takeQuickResume, QUICK_RESUME_KEY, monQuickKey } from '../../quickResume.js';
import { api } from '../../api/client.js';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('#4 학생 코드 100자까지는 통과, 101자부터 안내', () => {
  assert.equal(STUDENT_CODE_MAX, 100);
  assert.equal(studentCodeError('가'.repeat(100)), '');
  assert.match(studentCodeError('가'.repeat(101)), /100자까지/);
  assert.match(studentCodeError('   '), /적어 주세요/);
});

test('#4 길이는 DB(VARCHAR)처럼 글자 수로 센다 — 이모지 1개 = 1자', () => {
  assert.equal(studentCodeLength('😀'), 1);
  assert.equal(studentCodeError('😀'.repeat(100)), '');
});

test("#9 '초2'로 저장된 학년도 select 값 '2'로 읽는다", () => {
  assert.equal(gradeOption('초등', '초2'), '2');
  assert.equal(gradeOption('초등', '4'), '4');
  assert.equal(gradeOption('중등', '3'), '3');
  assert.equal(gradeOption('초등', ''), '');
  // 보기에 없는 값은 지우지 않고 그대로(저장 때 빈 값이 되지 않게)
  assert.equal(gradeOption('중등', '5'), '5');
  assert.equal(gradeOption('', '초2'), '초2');
  assert.equal(levelGradeLabel('초등', '초2'), '초등학교 2학년');
});

test('#6 되살리기 — 같은 선생님·열 수 있는 학생이면 한 번만 돌려준다', () => {
  const st = memStore();
  writeQuickResume({ uid: 7, sid: 31, mode: 'num' }, st, 1000);
  assert.deepEqual(takeQuickResume(7, (sid) => sid === 31, st, 2000), { sid: 31, mode: 'num' });
  assert.equal(takeQuickResume(7, null, st, 2000), null); // 한 번 쓰면 지워짐
});

test('#6 되살리기 — 다른 선생님 것·오래된 것은 버린다', () => {
  const st = memStore();
  writeQuickResume({ uid: 7, sid: 31, mode: 'obs' }, st, 1000);
  assert.equal(takeQuickResume(8, null, st, 2000), null);
  assert.equal(st.getItem(QUICK_RESUME_KEY), null);
  writeQuickResume({ uid: 7, sid: 31, mode: 'obs' }, st, 1000);
  assert.equal(takeQuickResume(7, null, st, 1000 + 13 * 3600 * 1000), null);
});

test('#6 되살리기 — 이 화면에서 못 여는 학생이면 남겨 둔다(다른 화면이 열도록)', () => {
  const st = memStore();
  writeQuickResume({ uid: 7, sid: 31, mode: 'obs' }, st, 1000);
  assert.equal(takeQuickResume(7, (sid) => sid === 99, st, 2000), null);
  assert.notEqual(st.getItem(QUICK_RESUME_KEY), null);
  assert.equal(monQuickKey(31), 'kb_monq_31');
});

test('#1·#6 API 오류에 HTTP 상태가 붙는다(메시지는 예전 그대로) — /all 실패를 빈 자료로 숨기지 않고, 401을 가려낸다', async () => {
  const orig = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: '시험용 500' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(() => api('/api/students/1/all'), (e) => e.message === '시험용 500' && e.status === 500);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(() => api('/api/students/1/monitor', 'POST', {}), (e) => e.message === 'Unauthorized' && e.status === 401);
  } finally {
    globalThis.fetch = orig;
  }
});
