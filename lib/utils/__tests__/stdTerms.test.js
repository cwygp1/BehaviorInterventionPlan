import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTermIndex, stdKeyTerms, goalCoverage, skeletonGoal, syncStdGoals, joinGoals, tokenize, toCanDoText } from '../stdTerms.js';

const file = path.join(process.cwd(), 'public/data/achievement-standards.json');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = d.rows.map((a) => ({ subject: a[0], gradeCode: a[1], area: a[2], code: a[3], text: a[4], curriculum: a[8] || '기본' }));
const index = buildTermIndex(rows);
const by = (code) => rows.find((r) => r.code === code);
const S = ['9수03-09', '9수03-10', '9수03-11', '9수03-12', '9수03-13'].map(by);
const cov = (text) => S.map((s) => goalCoverage(text, s, index).ok);

test('9수03-09~13 필수 낱말 스냅샷', () => {
  const k = S.map((s) => stdKeyTerms(s, index));
  assert.ok(k[0].nouns.includes('이등변삼각형') && k[0].verbs.includes('정당화'));
  assert.ok(k[1].nouns.includes('외심') && k[1].nouns.includes('내심') && k[1].verbs.includes('정당화'));
  assert.ok(k[2].nouns.includes('사각형') && k[2].verbs.includes('정당화'));
  assert.ok(k[3].nouns.includes('닮음비'));
  assert.ok(k[4].nouns.includes('조건') && k[4].verbs.includes('판별'));
  assert.ok(!k.some((x) => x.nouns.includes('도형') || x.nouns.includes('성질')), '범용어는 필수 낱말이 아니다');
});

test('포괄 문장은 0/5, 모범답안 2문장은 5/5', () => {
  assert.deepEqual(cov('주어진 도형의 성질을 설명할 수 있다.'), [false, false, false, false, false]);
  const good = '이등변삼각형·삼각형의 외심과 내심·사각형의 성질을 이해하고, 그림과 교사의 안내 질문을 바탕으로 그 성질이 성립하는 이유를 정당화하여 말할 수 있다.\n닮은 도형의 성질을 이해하여 닮음비를 구하고, 삼각형의 닮음 조건을 이용해 두 삼각형이 닮음인지 판별할 수 있다.';
  assert.deepEqual(cov(good), [true, true, true, true, true]);
});

test('동사 하향(정당화→설명)은 명사가 있어도 실패', () => {
  const r = cov('이등변삼각형·외심·내심·사각형의 성질과 도형의 닮음을 설명할 수 있다.');
  assert.deepEqual(r.slice(0, 3), [false, false, false]);
});

test('띄어쓰기 변형은 통과, 닮음⊂닮음비로 9수03-13이 통과하지 않음', () => {
  assert.equal(goalCoverage('이등변 삼각형의 성질을 정당화 할 수 있다.', S[0], index).ok, true);
  assert.equal(goalCoverage('닮음 비를 구할 수 있다.', S[3], index).ok, true);
  assert.equal(goalCoverage('닮은 도형의 닮음비를 구할 수 있다.', S[4], index).ok, false);
});

test('기본교육과정: 원문 그대로의 목표는 통과, 태도형은 항상 통과, 모범답안형 재구성은 명사 유지 시 통과', () => {
  const a = by('9수학02-01'); // 사각형, 삼각형, 원을 탐색한다.
  assert.equal(goalCoverage(skeletonGoal(a), a, index).ok, true);
  assert.equal(goalCoverage('교실에 있는 물건에서 사각형·삼각형·원 모양을 찾아 말할 수 있다.', a, index).ok, true);
  const att = by('2국01-05'); // 듣기와 말하기에 관심과 흥미를 가진다.
  assert.equal(stdKeyTerms(att, index).attitude, true);
  assert.equal(goalCoverage('무엇이든', att, index).ok, true);
});

test('전 행: 필수 낱말 0개 행은 2% 미만, 원문 시드는 자기 커버리지를 항상 통과, 조사만 바꿔도 통과', () => {
  let empty = 0, selfFail = 0, josaFail = 0;
  for (const r of rows) {
    const k = stdKeyTerms(r, index);
    if (!k.required.length && !k.attitude) empty++;
    if (!goalCoverage(skeletonGoal(r), r, index).ok) selfFail++;
    const alt = r.text.replace(/을 /g, '이 ').replace(/를 /g, '가 ').replace(/의 /g, '에 대한 ');
    if (!goalCoverage(alt, r, index).ok) josaFail++;
  }
  assert.ok(empty / rows.length < 0.015, `필수 낱말 0개 행 ${empty}`); // 2150행 중 ~23행: 소재가 교과 범용어뿐인 성취기준(검증은 정보 칩만)
  assert.equal(selfFail, 0);
  assert.equal(josaFail, 0);
});

test('tokenize: 관형어·통하여·1자 명사 처리', () => {
  const t = tokenize('여러 가지 모양의 삼각형에 대한 분류 활동을 통하여 이등변삼각형, 정삼각형을 이해하고');
  assert.ok(!t.some((x) => x.kind === 'verb' && x.t === '통'));
  const t2 = tokenize('자신과 관련된 간단한 질문에 대답한다.');
  assert.ok(t2.some((x) => x.kind === 'mod' && x.t === '관련된'));
  assert.ok(tokenize('원을 탐색한다').some((x) => x.kind === 'noun1' && x.t === '원'));
});

test('toCanDoText: 받침 ㄴ·불규칙 어간·태도형 missing', () => {
  assert.equal(toCanDoText('물건의 수를 센다.'), '물건의 수를 셀 수 있다.');
  assert.equal(toCanDoText('이야기를 듣는다.'), '이야기를 들을 수 있다.');
  assert.equal(toCanDoText('사물을 관련짓는다.'), '사물을 관련지을 수 있다.');
  assert.equal(toCanDoText('친구를 돕는다'), '친구를 도울 수 있다.');
  assert.equal(toCanDoText('책을 읽는다.'), '책을 읽을 수 있다.');
  assert.equal(toCanDoText('자석의 성질에 흥미를 갖는다.'), '자석의 성질에 흥미를 가질 수 있다.');
  assert.equal(toCanDoText('규칙을 믿는다.'), '규칙을 믿을 수 있다.');
  // 실제 명사(단어·국어)는 조각이 아니다 — 빠지면 missing에 잡혀야 한다.
  const w = by('2국03-01'); // 글자와 단어를 바르게 쓴다.
  assert.ok(goalCoverage('글자를 바르게 쓸 수 있다.', w, index).missing.includes('단어'));
  const u = by('4국04-01');
  assert.ok(goalCoverage('아무 관계없는 문장', u, index).missing.length > 0);
  const att = by('2국01-05');
  assert.deepEqual(goalCoverage('아무 문장', att, index).missing, []);
  assert.equal(joinGoals(['A를 한다.', 'B를 할 수 있다.']), 'A를 하고, B를 할 수 있다.');
});

test('skeletonGoal / syncStdGoals / joinGoals', () => {
  assert.equal(skeletonGoal({ text: '사각형, 삼각형, 원을 탐색한다.' }), '사각형, 삼각형, 원을 탐색할 수 있다.');
  assert.equal(skeletonGoal(S[0]), '이등변삼각형의 성질을 이해하고 정당화할 수 있다.');
  const list = syncStdGoals([{ code: '9수03-09', std: 'x', goal: '내가 고친 문장.' }], [S[0], S[1]]);
  assert.equal(list.length, 2);
  assert.equal(list[0].goal, '내가 고친 문장.');
  assert.equal(list[1].goal, skeletonGoal(S[1]));
  assert.equal(syncStdGoals(list, [S[1]]).length, 1);
  assert.equal(joinGoals(['A를 정당화할 수 있다.', 'B를 구할 수 있다.', 'C를 판별할 수 있다.']), 'A를 정당화하고, B를 구하고, C를 판별할 수 있다.');
  assert.equal(joinGoals(['A를 정당화할 수 있다.']), 'A를 정당화할 수 있다.');
});
