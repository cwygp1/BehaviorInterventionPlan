// public/data/curriculum-guide-kor12.json(교사용 지도서 단원·차시 자료, 0923) 건전성 + 선택기·프롬프트 블록.
// 지도서 원본과 눈으로 대조한 값 몇 개를 고정한다(1단원 ①·2단원 ①·3단원 ②) — 파서를 고칠 때 이 값이 깨지면 회귀.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const guide = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/curriculum-guide-kor12.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/curriculum-content.json'), 'utf8'));
const units = guide.books.flatMap((b) => b.units.map((u) => ({ ...u, book: b.book })));
const byId = new Map(units.map((u) => [u.id, u]));

test('구조: 두 권 × (준비 + 1~8단원 + 책 읽기) = 20단원, 차시마다 차시명·학습 내용·학습 목표', () => {
  assert.equal(guide.books.length, 2);
  guide.books.forEach((b) => {
    assert.equal(b.units.length, 10);
    assert.deepEqual(b.units.map((u) => u.no), ['준비', '1', '2', '3', '4', '5', '6', '7', '8', '책 읽기']);
    b.units.forEach((u) => {
      assert.ok(u.title, u.id + ' 제목');
      assert.ok(u.lessons.length >= 5, `${u.id} 차시 ${u.lessons.length}`);
      u.lessons.forEach((l) => {
        assert.ok(/^\d+(~\d+)?$/.test(l.no), `${u.id} 차시 번호 ${l.no}`);
        assert.ok(l.title && l.contents.length >= 1, `${u.id} ${l.no}차시`);
        assert.ok(l.goal && /다\.$/.test(l.goal), `${u.id} ${l.no}차시 학습 목표: ${l.goal}`);
      });
    });
  });
});

test('성취기준 표: 1~8단원마다 주요 성취기준이 있고, 10개 코드 전부 어느 단원의 주요 성취기준이다', () => {
  const primary = new Set();
  units.filter((u) => /^\d$/.test(u.no)).forEach((u) => {
    assert.ok(u.standards.primary.length >= 1, u.id);
    u.standards.primary.forEach((c) => primary.add(c));
    u.standards.related.forEach((c) => assert.ok(!u.standards.primary.includes(c), `${u.id} ${c} 주요·관련 중복`));
  });
  ['01-01', '01-02', '01-03', '01-04', '02-01', '02-02', '02-03', '02-04', '03-01', '03-02'].forEach((k) => assert.ok(primary.has('2국어' + k), '2국어' + k));
});

test('지도서 원본과 대조한 값(1단원 ① · 2단원 ① · 3단원 ②)', () => {
  const u11 = byId.get('1-1');
  assert.equal(u11.title, '소리에는 뜻이 있어요');
  assert.deepEqual(u11.standards, { primary: ['2국어01-01'], related: ['2국어01-02', '2국어01-03', '2국어03-01'] });
  assert.equal(u11.guidePage, 108);
  assert.deepEqual(u11.lessons.map((l) => l.no), ['1~2', '3~4', '5~7', '8~9', '10~11', '12~13', '14~15', '16~17', '18']);
  assert.deepEqual(u11.lessons.map((l) => l.stage), ['기초', '기본', '기본', '실천', '실천', '실천', '실천', '실천', '정리']);
  assert.deepEqual(u11.evaluation.map((e) => [e.stage, e.criteria.length]), [['기초', 2], ['기본', 3], ['실천', 5], ['정리', 2]]);
  assert.equal(u11.evaluation[3].criteria[1], '다른 사람의 말소리를 듣고 상황에 따라 적절한 행동을 찾을 수 있는가?');

  const u12 = byId.get('1-2');
  assert.equal(u12.title, '마음대로 쓱쓱');
  assert.deepEqual(u12.standards.primary, ['2국어03-01']);
  assert.equal(u12.lessons.length, 13);
  assert.deepEqual(u12.lessons[0], { ...u12.lessons[0], stage: '기초', no: '1~2', title: '여러 가지 쓰기 도구로 끼적이기', bookPages: '48~49', guidePages: '148~151', goal: '여러 가지 쓰기 도구로 자유롭게 끼적일 수 있다.' });
  assert.deepEqual(u12.lessons[0].contents, ['여러 가지 쓰기 도구 살펴보기', '쓰기 도구 잡기', '여러 가지 쓰기 도구로 끼적이기', '좋아하는 쓰기 도구 고르기']);
  assert.deepEqual(u12.vocabulary, ['끼적이다', '색연필', '크레파스', '연필', '선', '모양']);
  assert.deepEqual(u12.goals, ['여러 가지 쓰기 도구를 사용해 자유롭게 끼적일 수 있다.', '여러 가지 끼적이는 놀이 활동에 재미를 느낄 수 있다.', '끼적이기로 떠오르는 생각과 느낌을 표현할 수 있다.', '끼적이며 선과 모양, 점, 선, 면의 형태를 탐색할 수 있다.']);

  const u23 = byId.get('2-3');
  assert.equal(u23.title, '마음을 나누어요');
  assert.equal(u23.guidePage, 588, '②권은 인쇄 쪽 = PDF 쪽 + 2');
  assert.equal(u23.evaluation.length, 9);
  assert.deepEqual(u23.vocabulary, ['기뻐요', '슬퍼요', '화나요', '무서워요', '하고 싶어요', '주세요']);
  assert.deepEqual(u23.lessons.map((l) => l.no), ['1~2', '3~4', '5~6', '7~8', '9~10', '11~12', '13~14', '15~16', '17~18'], '쪽을 넘긴 표의 첫 행(9~10)도 읽는다');
  assert.deepEqual(u23.lessons.map((l) => l.stage), ['기초', '기본', '기본', '기본', '기본', '실천', '실천', '실천', '정리']);
});

test('선택기·블록: 주요 단원만, 단원 2개·차시 6개 상한, 정리 차시 제외, 블록 2,600자 이내', async () => {
  const m = await import('../../curriculumContent.js');
  const entries = m.contentEntries(content, ['2국어03-01', '2국어01-01']);
  const gu = m.guideUnitsFor(guide, entries);
  assert.deepEqual(gu.map((u) => [u.code, u.id]), [['2국어03-01', '1-2'], ['2국어01-01', '1-1'], ['2국어01-01', '2-1']]);
  const picked = m.pickLessons(gu[1].lessons, 6);
  assert.equal(picked.length, 6);
  assert.ok(!picked.some((l) => l.stage === '정리'));
  const block = m.curriculumGuideBlock(gu);
  assert.ok(block.includes("[교과 지도서 단원·차시 — [2국어03-01] 국어 가 2단원 '마음대로 쓱쓱' (교사용 지도서 p.140)]"));
  assert.ok(block.includes('단원 평가 준거:') && block.includes('핵심 어휘:'));
  assert.ok(!block.includes('2-1'), '단원 2개 상한');
  assert.ok(block.length < 2600, `블록 ${block.length}자`);
  assert.equal(m.curriculumGuideBlock([]), '');
  assert.deepEqual(m.guideUnitsFor(null, entries), []);
});
