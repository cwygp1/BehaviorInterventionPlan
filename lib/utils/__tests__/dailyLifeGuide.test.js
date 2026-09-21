// public/data/daily-life-guide.json 건전성 — 지도서 파서(scripts/parse-daily-life-guide.mjs) 산출물이
// 앱이 기대하는 모양(책 4권 × 단원 × 중활동 → 소활동)이고 성취기준과 1:1로 이어지는지.
// 의사소통·자립생활은 글자 층 PDF, 신체활동·여가활동은 스캔본 OCR(본문 채움률이 낮다 — 이름·활동 목록은 완전).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const guide = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/daily-life-guide.json'), 'utf8'));
const stds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/achievement-standards.json'), 'utf8'));
const dailyCodes = new Set(stds.rows.filter((r) => r[0] === '일상생활 활동').map((r) => r[3]));
const UNITS = { 의사소통: 12, 자립생활: 12, 신체활동: 12, 여가활동: 9 };

test('4권, 책마다 정해진 단원 수', () => {
  assert.deepEqual(guide.books.map((b) => b.area), Object.keys(UNITS));
  guide.books.forEach((b) => assert.equal(b.units.length, UNITS[b.area], b.area));
});

test('단원마다 일상생활 성취기준 코드가 1:1로 붙고 중복이 없다', () => {
  const units = guide.books.flatMap((b) => b.units);
  const codes = units.map((u) => u.code);
  assert.equal(new Set(codes).size, units.length);
  codes.forEach((c) => assert.ok(dailyCodes.has(c), c));
  units.forEach((u) => { assert.ok(u.standard && u.element && u.title, u.code); assert.ok(u.standardMatch, `${u.code} 성취기준 문장 확인 안 됨`); });
});

test('중활동에는 활동 목록이, 소활동에는 "…기" 이름이 있다', () => {
  const mids = guide.books.flatMap((b) => b.units.flatMap((u) => u.midActivities));
  const subs = mids.flatMap((m) => m.subActivities);
  assert.ok(mids.length >= 250, `중활동 ${mids.length}`);
  assert.ok(subs.length >= 1300, `소활동 ${subs.length}`);
  assert.ok(mids.filter((m) => m.goals.length).length / mids.length > 0.98);
  subs.forEach((s) => { assert.ok(s.title && s.no > 0); assert.match(s.title, /기\)?$/); });
});

test('본문(단계) 채움률 — 글자 층 책은 95% 이상, OCR 책은 30% 이상', () => {
  guide.books.forEach((b) => {
    const subs = b.units.flatMap((u) => u.midActivities.flatMap((m) => m.subActivities));
    const ratio = subs.filter((s) => s.steps.length).length / subs.length;
    assert.ok(ratio > (b.ocr ? 0.3 : 0.95), `${b.area} ${Math.round(ratio * 100)}%`);
  });
});

test('추출 찌꺼기(제어문자·쪽 표식)가 없다', () => {
  const all = JSON.stringify(guide);
  assert.equal((all.match(/\\u000[0-9a-f]|\\u001[0-9a-f]/g) || []).length, 0);
  assert.equal((all.match(/===== p\d+ =====/g) || []).length, 0);
});

// 0921: 스캔본(OCR) 책의 중활동 이름 앞에 동그라미 숫자 오독("Yo ", "1 ", ". ")이 붙어 있던 것을
// scripts/parse-daily-life-lesson-examples.py --fix-guide 로 걷어냈다 — 다시 붙지 않게.
test('중활동 이름은 한글(또는 따옴표·괄호)로 시작한다 — OCR 잡음 없음', () => {
  const mids = guide.books.flatMap((b) => b.units.flatMap((u) => u.midActivities.map((m) => `${u.code} ${m.no} ${m.title}`)));
  const bad = mids.filter((s) => !/^\S+ \d+ [가-힣‘'(]/.test(s));
  assert.deepEqual(bad, []);
});
