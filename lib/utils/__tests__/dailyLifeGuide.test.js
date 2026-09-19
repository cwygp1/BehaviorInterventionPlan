// public/data/daily-life-guide.json 건전성 — 지도서 파서(scripts/parse-daily-life-guide.mjs) 산출물이
// 앱이 기대하는 모양(책 2권 × 단원 12 × 중활동 → 소활동)이고 성취기준과 1:1로 이어지는지.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const guide = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/daily-life-guide.json'), 'utf8'));
const stds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/achievement-standards.json'), 'utf8'));
const dailyCodes = new Set(stds.rows.filter((r) => r[0] === '일상생활 활동').map((r) => r[3]));

test('의사소통·자립생활 2권, 각 12단원', () => {
  assert.deepEqual(guide.books.map((b) => b.area), ['의사소통', '자립생활']);
  guide.books.forEach((b) => assert.equal(b.units.length, 12, b.area));
});

test('단원마다 일상생활 성취기준 코드가 1:1로 붙고 중복이 없다', () => {
  const codes = guide.books.flatMap((b) => b.units.map((u) => u.code));
  assert.equal(new Set(codes).size, 24);
  codes.forEach((c) => assert.ok(dailyCodes.has(c), c));
  guide.books.flatMap((b) => b.units).forEach((u) => assert.ok(u.standard && u.element && u.title, u.code));
});

test('중활동에는 활동 목록이, 소활동에는 제목이 있고 대부분 단계가 채워져 있다', () => {
  const mids = guide.books.flatMap((b) => b.units.flatMap((u) => u.midActivities));
  const subs = mids.flatMap((m) => m.subActivities);
  assert.ok(mids.length >= 120, `중활동 ${mids.length}`);
  assert.ok(subs.length >= 700, `소활동 ${subs.length}`);
  assert.ok(mids.filter((m) => m.goals.length).length / mids.length > 0.95);
  subs.forEach((s) => assert.ok(s.title && s.no > 0));
  assert.ok(subs.filter((s) => s.steps.length).length / subs.length > 0.95);
});

test('추출 찌꺼기(제어문자·쪽 표식·사진 설명)가 없다', () => {
  const all = JSON.stringify(guide);
  assert.equal((all.match(/\\u0007/g) || []).length, 0);
  assert.equal((all.match(/===== p\d+ =====/g) || []).length, 0);
});
