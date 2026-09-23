// public/data/curriculum-content.json(교과 단원·활동 키워드) 건전성 + 선택기·프롬프트 블록.
// 0923(2단계)부터 교사용 지도서 원본으로 만든 자료라 전부 verifiedAgainstGuide:true — 주의 문구가 블록에 안 들어가는지 본다
// (대조 전 항목이 섞이면 들어가야 한다).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/curriculum-content.json'), 'utf8'));
const stds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/achievement-standards.json'), 'utf8'));
const byCode = new Map(stds.rows.map((r) => [r[3], r]));
const codes = Object.keys(data).filter((k) => k !== '_meta');

test('범위: 기본 국어 1~2학년군 10개, 코드·문장이 성취기준 데이터와 같다', () => {
  assert.equal(codes.length, 10);
  codes.forEach((c) => {
    const row = byCode.get(c);
    assert.ok(row, c + ' 성취기준 데이터에 없음');
    assert.equal(data[c].text, row[4], c);
    assert.equal(row[8], '기본'); assert.equal(row[0], '국어'); assert.equal(row[1], 2);
  });
});

test('지도서 대조 표시·키워드 수준: 전부 verifiedAgainstGuide, 주요 단원 1개 이상, 활동 3개 이상, 코드당 500자 이내', () => {
  codes.forEach((c) => {
    const e = data[c];
    const chars = [...e.units.map((u) => u.unit), ...e.activities, ...e.materials].join('').length;
    assert.ok(chars <= 500, `${c} ${chars}자`);
    assert.equal(e.verifiedAgainstGuide, true, c);
    assert.equal(e.sources[0], 'guide-kor12');
    assert.ok(e.activities.length >= 3 && e.units.some((u) => u.role === 'primary'), c);
    e.units.forEach((u) => assert.ok(u.id && /^[12]-/.test(u.id), `${c} 단원 id ${u.id}`));
    assert.ok(!e.activities.some((a) => /공부한 내용 정리/.test(a)), c + ' 정리 차시는 활동에서 뺀다');
  });
});

test('선택기·블록: 있는 코드만, 상한 3개, 검증된 자료엔 주의 문구 없음, 없는 코드는 빈 문자열', async () => {
  const m = await import('../../curriculumContent.js');
  const entries = m.contentEntries(data, ['2국어01-01', '일상01-01', '2국어01-01', '2국어02-01', '2국어03-01', '2국어03-02']);
  assert.deepEqual(entries.map((e) => e.code), ['2국어01-01', '2국어02-01', '2국어03-01', '2국어03-02']);
  const block = m.curriculumContentBlock(entries);
  assert.ok(block.includes('[교과 단원·활동 키워드 — [2국어01-01]'));
  assert.ok(block.includes('소리에는 뜻이 있어요'));
  assert.ok(!block.includes('[2국어03-02]'), '성취기준 3개 상한');
  assert.ok(!block.includes(m.CONTENT_CAVEAT), '지도서 대조 자료엔 주의 문구 없음');
  assert.ok(block.length < 2200, `블록 ${block.length}자`);
  assert.equal(m.curriculumContentBlock(m.contentEntries(data, ['일상01-01', '4과학02-01'])), '');
  // 대조 전 항목이 섞이면 주의 문구가 붙는다.
  const mixed = m.curriculumContentBlock([{ ...entries[0], verifiedAgainstGuide: false }]);
  assert.ok(mixed.includes(m.CONTENT_CAVEAT));
});

test('예시 베끼기 가드가 키워드를 오탐하지 않는다', async () => {
  const g = await import('../../exampleGuard.js');
  const text = codes.flatMap((c) => [...data[c].units.map((u) => u.unit), ...data[c].activities, ...data[c].materials]).join(' ');
  assert.deepEqual(g.findExampleEchoes({ content: text }), []);
});
