// public/data/curriculum-content.json(교과 단원·활동 키워드, 1단계) 건전성 + 선택기·프롬프트 블록.
// 데이터는 지도서 원본 대조 전(전부 medium/false)이라, 주의 문구가 블록에 반드시 들어가는지도 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/curriculum-content.json'), 'utf8'));
const stds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/achievement-standards.json'), 'utf8'));
const byCode = new Map(stds.rows.map((r) => [r[3], r]));
const codes = Object.keys(data).filter((k) => k !== '_meta');

test('1단계 범위: 기본 국어 1~2학년군 10개, 코드·문장이 성취기준 데이터와 같다', () => {
  assert.equal(codes.length, 10);
  codes.forEach((c) => {
    const row = byCode.get(c);
    assert.ok(row, c + ' 성취기준 데이터에 없음');
    assert.equal(data[c].text, row[4], c);
    assert.equal(row[8], '기본'); assert.equal(row[0], '국어'); assert.equal(row[1], 2);
  });
});

test('저작권 상한·검증 표시: 코드당 키워드 300자 이내, 전부 지도서 미대조', () => {
  codes.forEach((c) => {
    const e = data[c];
    const chars = [...e.units.map((u) => u.unit), ...e.activities, ...e.materials].join('').length;
    assert.ok(chars <= 300, `${c} ${chars}자`);
    assert.equal(e.verifiedAgainstGuide, false);
    assert.ok(e.activities.length >= 3 && e.units.some((u) => u.role === 'primary'), c);
  });
});

test('선택기·블록: 있는 코드만, 상한 3개, 주의 문구 포함, 없는 코드는 빈 문자열', async () => {
  const m = await import('../../curriculumContent.js');
  const entries = m.contentEntries(data, ['2국어01-01', '일상01-01', '2국어01-01', '2국어02-01', '2국어03-01', '2국어03-02']);
  assert.deepEqual(entries.map((e) => e.code), ['2국어01-01', '2국어02-01', '2국어03-01', '2국어03-02']);
  const block = m.curriculumContentBlock(entries);
  assert.ok(block.includes('[교과 단원·활동 키워드 — [2국어01-01]'));
  assert.ok(!block.includes('[2국어03-02]'), '성취기준 3개 상한');
  assert.ok(block.includes(m.CONTENT_CAVEAT));
  assert.ok(block.length < 2000, `블록 ${block.length}자`);
  assert.equal(m.curriculumContentBlock(m.contentEntries(data, ['일상01-01', '4과학02-01'])), '');
});

test('예시 베끼기 가드가 키워드를 오탐하지 않는다', async () => {
  const g = await import('../../exampleGuard.js');
  const text = codes.flatMap((c) => [...data[c].units.map((u) => u.unit), ...data[c].activities, ...data[c].materials]).join(' ');
  assert.deepEqual(g.findExampleEchoes({ content: text }), []);
});
