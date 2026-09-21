// public/data/daily-life-lesson-examples.json 건전성 + lib/dailyLifeGuide.js 예시 도우미.
// 「2025 일상생활 활동 수업 도움 자료 활용 안내」의 설계 카드 32장(scripts/parse-daily-life-lesson-examples.py)이
// 지도서 단원(code)·중활동(midNo)과 이어지고, 프롬프트 블록이 단원별로 고르게 뽑히는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { guideUnits, examplesForUnits, interleaveExamples, dailyLifeExamplesBlock, linkageText, DESIGN_TYPES } from '../../dailyLifeGuide.js';

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/daily-life-lesson-examples.json'), 'utf8'));
const guide = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/daily-life-guide.json'), 'utf8'));
const units = guide.books.flatMap((b) => b.units);
const byCode = new Map(units.map((u) => [u.code, u]));

test('예시 32건 — 영역별 8·11·6·7, 설계 형태 A~D, 주제·연계·주안점이 다 있다', () => {
  assert.equal(data.examples.length, 32);
  const perArea = data.examples.reduce((m, e) => ((m[e.area] = (m[e.area] || 0) + 1), m), {});
  assert.deepEqual(perArea, { 의사소통: 8, 자립생활: 11, 신체활동: 6, 여가활동: 7 });
  assert.deepEqual(data.designTypes.map((d) => d.code), ['A', 'B', 'C', 'D']);
  data.examples.forEach((e) => {
    assert.ok(DESIGN_TYPES[e.design], `${e.no} 설계 형태 ${e.design}`);
    assert.ok(e.topic && e.linkage.length && e.focus.length, `${e.no} 빈 칸`);
  });
});

test('예시마다 지도서 단원 코드가 붙고, 중활동 번호는 그 단원에 실제로 있다', () => {
  data.examples.forEach((e) => {
    const u = byCode.get(e.code);
    assert.ok(u, `${e.no} ${e.code}`);
    assert.equal(u.standard, e.standard);
    if (e.midNo != null) {
      const m = u.midActivities.find((x) => x.no === e.midNo);
      assert.ok(m, `${e.no} 중활동 ${e.midNo}`);
      assert.equal(m.title, e.midTitle);
    }
  });
  assert.ok(data.examples.filter((e) => e.midNo != null).length >= 31);
});

test('examplesForUnits·interleaveExamples — 단원 순서를 돌아가며 한 장씩', () => {
  const sel = guideUnits(guide, ['일상11-01', '일상08-02']);
  const by = examplesForUnits(data, sel);
  assert.deepEqual(Object.keys(by).sort(), ['일상08-02', '일상11-01']);
  assert.equal(by['일상08-02'].length, 4);
  assert.equal(by['일상11-01'].length, 3);
  const list = interleaveExamples(by, sel);
  assert.equal(list.length, 7);
  assert.deepEqual(list.slice(0, 4).map((e) => e.code), ['일상11-01', '일상08-02', '일상11-01', '일상08-02']);
  assert.deepEqual(examplesForUnits(data, guideUnits(guide, ['일상01-01'])), {});
  assert.deepEqual(examplesForUnits(null, sel), {});
});

test('dailyLifeExamplesBlock — 최대 3장, 주제·설계 형태·연계·주안점·참고 방식, 없으면 빈 문자열', () => {
  const sel = guideUnits(guide, ['일상08-02']);
  const list = interleaveExamples(examplesForUnits(data, sel), sel);
  const block = dailyLifeExamplesBlock(list);
  assert.equal((block.match(/^ {2}예시 \d/gm) || []).length, 3);
  assert.match(block, /설계 형태 A\(일상생활 활동 영역 내 선택형\)/);
  assert.match(block, /연계: /);
  assert.match(block, /주안점: /);
  assert.match(block, /참고 방식/);
  assert.ok(block.length < 2600, `블록 길이 ${block.length}`);
  assert.equal(dailyLifeExamplesBlock([]), '');
  assert.equal(dailyLifeExamplesBlock(null), '');
});

test('linkageText — 교과 머리표 "[  수학  ]"의 안쪽 공백을 없애고 한 줄로', () => {
  const e = data.examples.find((x) => x.no === 1);
  const t = linkageText(e);
  assert.match(t, /^\[수학\] \/ \[2수학02-01\]/);
});
