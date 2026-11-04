// E2E 2차 수정 G(mds/58 #8·#10·#12·#13·#14·#20·#32) — 로그인 화면 안내 고르기·분석 스크립트 끼울지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeOn401, isSaveRequest, noticeOnQuickResume, noticeOnWhoCheck, NOTICE_TEXT, RESUME_LINK_MS } from '../../authNotice.js';
import { isLocalHostname, shouldLoadAnalytics } from '../../analyticsGate.js';
import { writeQuickResume } from '../../quickResume.js';

test('401: 로그인된 상태였을 때만 일반 만료 안내, 이미 있는 안내는 그대로', () => {
  assert.equal(noticeOn401('', true), 'expired');
  assert.equal(noticeOn401('', false), '');
  assert.equal(noticeOn401('switched', true), 'switched');
  assert.equal(noticeOn401('expired-save', true), 'expired-save');
});

test('저장 요청 가르기 — GET만 저장 아님', () => {
  assert.equal(isSaveRequest('GET'), false);
  assert.equal(isSaveRequest('get'), false);
  assert.equal(isSaveRequest('POST'), true);
  assert.equal(isSaveRequest('PUT'), true);
  assert.equal(isSaveRequest('DELETE'), true);
  assert.equal(isSaveRequest(undefined), false);
});

test('빠른 기록 되살리기 재료가 남으면 바로 앞 저장 401과 이어 expired-save로', () => {
  const now = 1_000_000;
  assert.equal(noticeOnQuickResume('expired', { at: now - 50 }, now), 'expired-save');
  // 저장 401이 없었으면(학생만 바꾼 GET 401 등) 그대로
  assert.equal(noticeOnQuickResume('expired', null, now), 'expired');
  // 오래된 저장 401과는 잇지 않음
  assert.equal(noticeOnQuickResume('expired', { at: now - RESUME_LINK_MS - 1 }, now), 'expired');
  // 다른 안내는 덮지 않음
  assert.equal(noticeOnQuickResume('switched', { at: now }, now), 'switched');
  assert.equal(noticeOnQuickResume('', { at: now }, now), '');
});

test('탭 돌아올 때 확인 — 로그아웃 상태(user:null)도 만료로 알아챔(다른 탭 로그아웃)', () => {
  const cur = { id: 7 };
  assert.equal(noticeOnWhoCheck(cur, null), 'expired');
  assert.equal(noticeOnWhoCheck(cur, { id: 8 }), 'switched');
  assert.equal(noticeOnWhoCheck(cur, { id: 7 }), null);
  assert.equal(noticeOnWhoCheck(null, null), null);
});

test('문구 — 일반 만료는 창을 되살린다고 말하지 않음', () => {
  assert.ok(!NOTICE_TEXT.expired.includes('다시 열어'));
  assert.ok(NOTICE_TEXT.expired.includes('저장되지 않았을 수 있어요'));
  assert.ok(NOTICE_TEXT['expired-save'].includes('다시 열어 드려요'));
  assert.equal(NOTICE_TEXT.switched, undefined);
});

test('writeQuickResume는 창 이벤트로 알린다(창이 없는 곳에서는 조용히)', () => {
  const mem = new Map();
  const st = { setItem: (k, v) => mem.set(k, v), getItem: (k) => mem.get(k) ?? null, removeItem: (k) => mem.delete(k) };
  assert.doesNotThrow(() => writeQuickResume({ uid: 1, sid: 2, mode: 'obs' }, st));
  let fired = 0;
  const prevWin = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    globalThis.window.addEventListener('kb:quick-resume', () => { fired += 1; });
    writeQuickResume({ uid: 1, sid: 2, mode: 'obs' }, st);
    writeQuickResume({ uid: null, sid: 2 }, st); // 재료가 없으면 알리지 않음
  } finally {
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
  }
  assert.equal(fired, 1);
});

test('분석 스크립트 — 로컬·사설 주소에서는 끼우지 않고, 배포 주소·Vercel 변수면 끼움', () => {
  for (const h of ['localhost', 'fix-g.localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0', '10.0.0.5', '192.168.0.3', '172.20.1.1', '']) {
    assert.equal(isLocalHostname(h), true, h);
    assert.equal(shouldLoadAnalytics(undefined, h), false, h);
  }
  for (const h of ['kkobak.vercel.app', 'example.kr', '172.32.0.1', '8.8.8.8']) {
    assert.equal(isLocalHostname(h), false, h);
    assert.equal(shouldLoadAnalytics(undefined, h), true, h);
  }
  assert.equal(shouldLoadAnalytics('production', 'localhost'), true);
  assert.equal(shouldLoadAnalytics('preview', 'x.vercel.app'), true);
});
