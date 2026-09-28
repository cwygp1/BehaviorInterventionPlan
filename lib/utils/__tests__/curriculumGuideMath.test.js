// public/data/curriculum-guide-math12.json(수학 교사용 지도서 단원·차시 자료, 0928) 건전성.
// 지도서 원본 쪽 그림과 눈으로 대조한 값(①-1 숨기기와 찾기 · ①-7 규칙 경험하기 · ②-1 비교하기(2))을 고정한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const guide = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/curriculum-guide-math12.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/curriculum-content.json'), 'utf8'));
const units = guide.books.flatMap((b) => b.units.map((u) => ({ ...u, book: b.book })));
const byId = new Map(units.map((u) => [u.id, u]));

test('구조: ①권 8단원 + ②권 10단원, 차시마다 차시명·학습 내용, 놀이 마당 빼고 학습 목표', () => {
  assert.equal(guide.books.length, 2);
  assert.deepEqual(guide.books.map((b) => b.units.length), [8, 10]);
  units.forEach((u) => {
    assert.ok(u.title && /^\d+$/.test(u.no), u.id);
    assert.ok(u.lessons.length >= 4, `${u.id} 차시 ${u.lessons.length}`);
    assert.ok(u.standards.primary.length >= 1, u.id + ' 주요 성취기준');
    assert.ok(u.goals.length >= 3 && u.goals.every((g) => /^(지식·이해|과정·기능|가치·태도): /.test(g)), u.id + ' 단원 목표(구분 붙음)');
    u.lessons.forEach((l) => {
      assert.ok(/^\d+(~\d+)?$/.test(l.no), `${u.id} 차시 번호 ${l.no}`);
      assert.ok(l.title && l.contents.length >= 1, `${u.id} ${l.no}차시`);
      if (!/놀이 마당/.test(l.title)) assert.ok(l.goal && /다\.$/.test(l.goal), `${u.id} ${l.no}차시 학습 목표: ${l.goal}`);
    });
    const nos = u.lessons.map((l) => +l.no.split('~')[0]);
    nos.forEach((n, i) => { if (i) assert.ok(n > nos[i - 1], `${u.id} 차시 번호 순서 ${nos.join(' ')}`); });
  });
});

test('24개 수학 성취기준 전부 어느 단원의 주요 성취기준이다', () => {
  const primary = new Set(units.flatMap((u) => u.standards.primary));
  const stds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/achievement-standards.json'), 'utf8')).rows.filter((r) => r[3].startsWith('2수학'));
  assert.equal(stds.length, 24);
  stds.forEach((r) => assert.ok(primary.has(r[3]), r[3]));
  units.forEach((u) => u.standards.related.forEach((c) => assert.ok(!u.standards.primary.includes(c), `${u.id} ${c} 주요·관련 중복`)));
});

test('지도서 원본과 대조한 값(①-1 · ①-7 · ②-1)', () => {
  const u11 = byId.get('1-1');
  assert.equal(u11.title, '숨기기와 찾기');
  assert.equal(u11.guidePage, 72);
  assert.deepEqual(u11.standards.primary, ['2수학01-01']);
  assert.deepEqual(u11.standards.related, ['2수학01-02', '2수학01-06', '2수학02-01', '2수학02-02', '2수학02-03', '2수학01-04', '2수학02-04', '2수학02-05']);
  assert.deepEqual(u11.lessons.map((l) => l.no), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(u11.lessons.map((l) => l.stage), ['단원 도입', '움직이는 물건 찾기', '움직이는 물건 찾기', '숨기기와 찾기', '숨기기와 찾기', '놀이 중심 단원 평가']);
  const l2 = u11.lessons[1];
  assert.equal(l2.title, '움직이는 물건을 볼 수 있어요');
  assert.deepEqual(l2.contents, ['바닥에 굴린 공 보기', '움직이는 탁구공 따라 보기']);
  assert.equal(l2.bookPages, '8~9'); assert.equal(l2.guidePages, '80~81');
  assert.equal(l2.goal, '움직이는 물건을 끝까지 볼 수 있다.');
  assert.deepEqual(l2.activities, ['바닥에 굴린 공 보기', '움직이는 탁구공 따라 보기']);
  assert.equal(u11.goals[0], '지식·이해: 물건이 시야에서 사라짐을 인식할 수 있다.');
  assert.equal(u11.goals.length, 10);
  assert.deepEqual(u11.evaluation.map((e) => [e.content, e.criteria.length]), [['움직이는 물건 보기', 1], ['움직이는 물건 찾기', 1], ['가려진 물건 찾기', 1], ['숨겨진 물건 찾기', 1], ['즐거운 놀이 마당', 4]]);
  assert.equal(u11.evaluation[0].criteria[0], '물건이 움직이는 것을 끝까지 볼 수 있는가?');

  const u17 = byId.get('1-7');
  assert.equal(u17.title, '규칙 경험하기');
  assert.deepEqual(u17.lessons.slice(0, 5).map((l) => [l.no, l.bookPages, l.guidePages]), [['1', '194~195', '304~305'], ['2', '196~197', '306~307'], ['3', '198~199', '308~309'], ['4', '200~201', '310~311'], ['5', '202~203', '312~313']]);
  assert.equal(u17.lessons[1].title, '색, 모양, 크기로 규칙을 경험할 수 있어요');
  assert.ok(u17.goals.includes('과정·기능: 일상생활에서 반복되는 배열에서 질서와 규칙을 경험하며 학습 활동을 통해 문제 해결 능력과 융합적 사고 능력을 키운다.'));

  const u21 = byId.get('2-1');
  assert.equal(u21.title, '비교하기(2)');
  assert.equal(u21.guidePage, 410, '②권은 인쇄 쪽 = PDF 쪽 + 2');
  assert.deepEqual(u21.standards.primary, ['2수학01-03']);
  assert.deepEqual(u21.lessons.map((l) => [l.no, l.title, l.guidePages]), [['1', '많고, 적음에 관심을 가질 수 있어요', '414~415'], ['2', '많고 적음을 비교할 수 있어요(1)', '416~417'], ['3', '많고 적음을 비교할 수 있어요(2)', '418~419'], ['4', '즐거운 놀이 마당', '420~421']]);
});

test('키워드 파일: 수학 24개 코드가 지도서 값으로 들어갔고 주요 단원이 있다', () => {
  const codes = Object.keys(content).filter((k) => k.startsWith('2수학'));
  assert.equal(codes.length, 24);
  codes.forEach((c) => {
    const e = content[c];
    assert.equal(e.subject, '수학'); assert.equal(e.verifiedAgainstGuide, true); assert.equal(e.sources[0], 'guide-math12');
    assert.ok(e.units.some((u) => u.role === 'primary' && /^수학 [①②]$/.test(u.book)), c);
    assert.ok(e.activities.length >= 3, c);
  });
});
