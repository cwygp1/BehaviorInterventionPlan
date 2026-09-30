// public/data/curriculum-guide-kor34.json · curriculum-guide-math34.json(3~4학년군 교사용 지도서 단원·차시 자료, 0929) 건전성.
// 지도서 원본 쪽 그림과 눈으로 대조한 값(국어 ③-1 소리로 여는 하루 · ④-1 생각을 말해요 · 수학 ③-1 규칙 찾기 · ④-1 위치와 방향)을 고정한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const load = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf8'));
const kor = load('curriculum-guide-kor34.json');
const math = load('curriculum-guide-math34.json');
const stds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/achievement-standards.json'), 'utf8')).rows;
const flat = (g) => g.books.flatMap((b) => b.units.map((u) => ({ ...u, book: b.book })));
const byId = (g) => new Map(flat(g).map((u) => [u.id, u]));

test('국어 ③·④: 10단원씩, 차시마다 소단원·차시명·학습 활동·학습 목표, 단원마다 성취기준·목표·평가·핵심 어휘', () => {
  assert.deepEqual(kor.books.map((b) => [b.book, b.key, b.units.length]), [['국어 ③', 3, 10], ['국어 ④', 4, 10]]);
  flat(kor).forEach((u) => {
    assert.ok(u.title && /^\d+$/.test(u.no) && /^[34]-\d+$/.test(u.id), u.id);
    assert.ok(u.standards.primary.length >= 2 && u.standards.primary.every((c) => /^4국어\d\d-\d\d$/.test(c)), u.id + ' 성취기준');
    assert.ok(u.goals.length >= 3 && u.goals.every((g) => /다\.$/.test(g)), u.id + ' 단원 목표');
    assert.ok(u.evaluation.length >= 2 && u.evaluation.every((e) => e.content && e.criteria.length >= 1 && e.codes.length >= 1), u.id + ' 단원 평가');
    // 0930 햇살: 사이트 평가계획은 "~는가?" 짜임 — 지도서의 "~할 수 있다." 준거를 바꿔 담고 원문은 criteriaOriginal에 남긴다.
    u.evaluation.forEach((e) => { e.criteria.forEach((c) => assert.ok(/는가\?$/.test(c), `${u.id} 평가 준거: ${c}`)); assert.equal(e.criteriaOriginal.length, e.criteria.length); e.criteriaOriginal.forEach((c) => assert.ok(/다\.$/.test(c), `${u.id} 준거 원문: ${c}`)); });
    assert.ok(u.vocabulary.length >= 8, u.id + ' 핵심 어휘');
    assert.ok(u.lessons.length >= 10, `${u.id} 차시 ${u.lessons.length}`);
    u.lessons.forEach((l) => {
      assert.ok(/^\d+(~\d+)?$/.test(l.no), `${u.id} 차시 번호 ${l.no}`);
      assert.ok(l.stage && l.title && l.contents.length >= 1, `${u.id} ${l.no}차시`);
      assert.ok(l.goal && /다\.$/.test(l.goal), `${u.id} ${l.no}차시 학습 목표: ${l.goal}`);
      assert.ok(/^\d+~\d+$/.test(l.guidePages) && /^\d+(~\d+)?$/.test(l.bookPages), `${u.id} ${l.no}차시 쪽 ${l.guidePages} ${l.bookPages}`);
    });
    assert.equal(u.lessons[0].stage, '단원 열기'); assert.equal(u.lessons[u.lessons.length - 1].stage, '단원 정리');
    const nos = u.lessons.map((l) => +l.no.split('~')[0]);
    nos.forEach((n, i) => { if (i) assert.ok(n > nos[i - 1], `${u.id} 차시 번호 순서 ${nos.join(' ')}`); });
  });
});

test('수학 ③·④: 7단원씩, 구분별 단원 목표(내용 요소)·평가 중점, 차시마다 소단원·주제·내용, 단원 도입·단원 평가 빼고 학습 목표', () => {
  assert.deepEqual(math.books.map((b) => [b.book, b.key, b.units.length]), [['수학 ③', 3, 7], ['수학 ④', 4, 7]]);
  flat(math).forEach((u) => {
    assert.ok(u.title && /^[34]-\d+$/.test(u.id), u.id);
    assert.ok(u.standards.primary.length >= 2 && u.standards.primary.every((c) => /^4수학\d\d-\d\d$/.test(c)), u.id + ' 성취기준');
    assert.ok(u.keyIdea && u.goals.length >= 3 && u.goals.every((g) => /^(지식·이해|과정·기능|가치·태도): /.test(g)), u.id + ' 핵심 아이디어·내용 요소');
    assert.deepEqual(u.evaluation.map((e) => e.stage), ['지식·이해', '과정·기능', '가치·태도'], u.id + ' 평가 중점');
    u.evaluation.forEach((e) => e.criteria.forEach((c) => assert.ok(/는가\?$/.test(c), `${u.id} 평가 기준: ${c}`)));
    assert.ok(u.considerations.length >= 3 && u.cautions.length >= 3, u.id + ' 고려 사항·유의 사항');
    assert.ok(u.lessons.length >= 6, `${u.id} 차시 ${u.lessons.length}`);
    u.lessons.forEach((l) => {
      assert.ok(/^\d+(~\d+)?$/.test(l.no), `${u.id} 차시 번호 ${l.no}`);
      assert.ok(l.stage && l.title && l.contents.length >= 1 && /^\d+~\d+$/.test(l.guidePages), `${u.id} ${l.no}차시`);
      if (!/단원 소개|단원 평가/.test(l.stage)) assert.ok(l.goal && /다\.$/.test(l.goal), `${u.id} ${l.no}차시 학습 목표: ${l.goal}`);
    });
    assert.deepEqual([u.lessons[0].stage, u.lessons[u.lessons.length - 2].stage, u.lessons[u.lessons.length - 1].stage], ['단원 소개', '단원 평가', '놀이 마당'], u.id);
    const nos = u.lessons.map((l) => +l.no.split('~')[0]);
    nos.forEach((n, i) => { if (i) assert.ok(n > nos[i - 1], `${u.id} 차시 번호 순서 ${nos.join(' ')}`); });
  });
});

test('3~4학년군 성취기준 국어 11개·수학 27개 전부 어느 단원의 성취기준이다', () => {
  for (const [g, prefix, n] of [[kor, '4국어', 11], [math, '4수학', 27]]) {
    const primary = new Set(flat(g).flatMap((u) => u.standards.primary));
    const rows = stds.filter((r) => r[3].startsWith(prefix));
    assert.equal(rows.length, n);
    rows.forEach((r) => assert.ok(primary.has(r[3]), r[3]));
    primary.forEach((c) => assert.ok(rows.some((r) => r[3] === c), c + ' 성취기준 데이터에 없음'));
  }
});

test('국어 원본 대조값(③-1 소리로 여는 하루 · ④-1 생각을 말해요)', () => {
  const u = byId(kor).get('3-1');
  assert.equal(u.title, '소리로 여는 하루'); assert.equal(u.guidePage, 94);
  assert.deepEqual(u.standards, { primary: ['4국어01-01', '4국어01-03'], related: [] });
  assert.deepEqual(u.goals, ['자주 사용하는 낱말로 마음을 표현할 수 있다.', '소리를 듣고 낱말을 말할 수 있다.', '이름을 듣고 대답할 수 있다.', '낱말로 자신의 마음을 표현할 수 있다.']);
  assert.deepEqual(u.lessons.map((l) => l.no), ['1', '2', '3', '4~5', '6', '7~8', '9', '10', '11', '12', '13', '14~15', '16', '17']);
  assert.deepEqual([...new Set(u.lessons.map((l) => l.stage))], ['단원 열기', '소리 듣고 낱말 말하기', '이름 듣고 대답하기', '놀이로 배워요', '낱말로 표현하기', '단원 정리']);
  const l2 = u.lessons[1];
  assert.equal(l2.title, '소리 듣고 물건 이름 말하기');
  assert.deepEqual(l2.contents, ['소리가 나는 물건 찾기', '물건 이름 따라 말하기', '소리 듣고 물건 찾기']);
  assert.equal(l2.bookPages, '8~9'); assert.equal(l2.guidePages, '100~101');
  assert.equal(l2.goal, '소리를 듣고 물건 이름을 따라 말할 수 있다.');
  const l1 = u.lessons[0];
  assert.equal(l1.guidePages, '98~99');
  assert.equal(l1.goal, '단원에서 공부할 내용을 알고 주요 낱말을 익힐 수 있다.');
  assert.deepEqual(l1.intro, ['「우리 주변의 소리를 들어 보아요」 보기']);
  assert.deepEqual(l1.activityHeads, ['학습 내용 살펴보기']);
  assert.deepEqual(l1.wrapup, ['공부한 내용 되돌아보기']);
  assert.equal(l1.notes[0], '교과서를 전체적으로 살펴보며 앞으로 배울 내용을 확인한다.');
  assert.deepEqual(u.evaluation.map((e) => [e.content, e.criteria.length, e.codes.join(',')]), [
    ['소리를 듣고 낱말을 말할 수 있다.', 3, '4국어01-01'], ['이름을 듣고 대답할 수 있다.', 3, '4국어01-01,4국어01-03'], ['낱말로 자신의 마음을 표현할 수 있다.', 3, '4국어01-01,4국어01-03']]);
  assert.equal(u.evaluation[0].criteria[0], '소리를 듣고 흉내 낼 수 있는가?');
  assert.equal(u.evaluation[0].criteriaOriginal[0], '소리를 듣고 흉내 낼 수 있다.');
  assert.deepEqual(u.vocabulary, ['공', '딸기', '버스', '사과', '시계', '인형', '병아리', '자전거']);
  assert.deepEqual(u.homeLinks, ['일상생활 속 여러 가지 소리 듣기', '소리 듣고 낱말 말하기', '이름 듣고 대답하기', '좋아하는 것 표현하기']);

  const v = byId(kor).get('4-1');
  assert.equal(v.title, '생각을 말해요'); assert.equal(v.guidePage, 524);
  assert.deepEqual(v.lessons.map((l) => l.no), ['1', '2', '3', '4', '5', '6', '7~8', '9', '10~11', '12~13', '14', '15~16', '17']);
  assert.deepEqual(v.lessons.map((l) => l.stage).slice(0, 7), ['단원 열기', '여러 가지 이름 말하기', '여러 가지 이름 말하기', '여러 가지 이름 말하기', '여러 가지 이름 말하기', '놀이로 배워요', '이름 넣어 표현하기']);
  assert.deepEqual([v.lessons[6].title, v.lessons[6].bookPages, v.lessons[6].guidePages], ['여러 가지 낱말 넣어 이름 만들기', '18~20', '542~543']);
  assert.deepEqual(v.lessons[12].contents, ['생각이 커져요', '단원 학습 내용 되돌아보기']);
  assert.equal(v.lessons[0].guidePages, '528~529');
  assert.deepEqual(v.evaluation.map((e) => e.codes.join(',')), ['4국어01-01', '4국어01-01', '4국어01-01,4국어01-03']);
  assert.equal(v.evaluation[0].criteria[0], '봄에 볼 수 있는 꽃 이름을 아는가?'); // 지도서 원문 "…안다."
  assert.equal(v.evaluation[0].criteriaOriginal[0], '봄에 볼 수 있는 꽃 이름을 안다.');
  assert.deepEqual(v.vocabulary, ['모자', '생일', '안경', '개나리', '경찰차', '발가락', '소방차', '코끼리']);
});

test('수학 원본 대조값(③-1 규칙 찾기 · ④-1 위치와 방향)', () => {
  const u = byId(math).get('3-1');
  assert.equal(u.title, '규칙 찾기'); assert.equal(u.guidePage, 78);
  assert.deepEqual(u.standards, { primary: ['4수학04-01', '4수학04-02', '4수학04-03'], related: [] });
  assert.equal(u.keyIdea, '생활 주변의 여러 규칙적인 현상을 경험하고 탐구하는 활동은 변화하는 현상과 대상 간의 관계를 이해하는 기초가 된다.');
  assert.deepEqual(u.goals, ['지식·이해: 물체 배열의 규칙', '과정·기능: 규칙 경험하고 모방하기', '과정·기능: 다음에 올 것을 추측하고 확인하기', '과정·기능: 규칙에 맞게 배열하기', '과정·기능: 물체 배열에서 규칙 찾기', '가치·태도: 규칙적 배열에 대한 흥미와 호기심', '가치·태도: 규칙 찾기 활동에서의 성공 경험']);
  assert.deepEqual(u.lessons.map((l) => l.no), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  assert.deepEqual([...new Set(u.lessons.map((l) => l.stage))], ['단원 소개', '규칙대로 놓기', '규칙 찾기', '학교에서 규칙 찾기', '단원 평가', '놀이 마당']);
  const l2 = u.lessons[1];
  assert.equal(l2.title, '색의 규칙대로 놓기');
  assert.deepEqual(l2.contents, ['반복되는 두 가지 색의 물체 배열을 보고 똑같이 놓는다.']);
  assert.equal(l2.bookPages, '8~9'); assert.equal(l2.guidePages, '86~87');
  assert.equal(l2.materials, '색판, 블록, 클레이, 뽁뽁이 장난감, 블록 그림(뜯기 자료), 그림(붙임딱지)');
  assert.equal(l2.goal, '색의 규칙을 보고 똑같이 놓을 수 있다.');
  assert.deepEqual([l2.intro, l2.activities, l2.wrapup], [['색 구별하기'], ['색의 규칙을 보고 똑같이 놓기', '색의 규칙을 보고 똑같이 연결하기'], ['색의 규칙을 보고 똑같이 붙이기']]);
  assert.deepEqual(l2.evalRefs.map((e) => [e.content, e.criteria[0]]), [['지식·이해', '색의 규칙을 아는가?'], ['과정·기능', '색의 규칙대로 똑같이 놓을 수 있는가?'], ['가치·태도', '색의 규칙에 집중하면서 똑같이 놓기 활동에 적극적으로 참여하는가?']]);
  assert.equal(u.lessons[0].guidePages, '84~85'); assert.equal(u.lessons[0].goal, undefined);
  assert.equal(u.lessons[9].evalPoints.length, 4); assert.equal(u.lessons[10].goal, '발바닥 그림으로 여러 가지 규칙을 찾고 신체의 움직임으로 표현하며 재미있게 규칙을 익힐 수 있다.');
  assert.deepEqual(u.evaluation.map((e) => e.criteria.length), [3, 3, 3]);
  assert.equal(u.evaluation[0].criteria[0], '색, 모양, 크기의 규칙을 아는가?');
  assert.equal(u.cautions.length, 7); assert.equal(u.considerations.length, 6); assert.equal(u.homeLinks.length, 2);

  const v = byId(math).get('4-1');
  assert.equal(v.title, '위치와 방향'); assert.equal(v.guidePage, 406);
  assert.deepEqual(v.standards.primary, ['4수학02-05', '4수학02-06']);
  assert.equal(v.lessons.length, 18);
  assert.deepEqual([...new Set(v.lessons.map((l) => l.stage))], ['단원 소개', '위와 아래 알기', '앞과 뒤 알기', '왼쪽과 오른쪽 알기', '안과 밖 알기', '방향 표시 알아보기', '단원 평가', '놀이 마당']);
  assert.deepEqual([v.lessons[1].title, v.lessons[1].bookPages, v.lessons[1].guidePages], ['위와 아래를 알아볼까요', '8~9', '416~417']);
  assert.equal(v.lessons[16].materials, '축구공(붙임딱지), 식판(뜯기 자료), 음식(뜯기 자료), 화살표(붙임딱지)');
  assert.deepEqual(v.evaluation.map((e) => e.criteria.length), [5, 10, 5]);
});

test('선택기·프롬프트: 3~4학년군 단원도 같은 함수로 붙고, 정리·평가·놀이 차시는 뽑지 않는다', async () => {
  const m = await import('../../curriculumContent.js');
  const content = load('curriculum-content.json');
  const entries = m.contentEntries(content, ['4수학04-01', '4국어01-01']);
  const withSubject = (g, subject) => g.books.map((b) => ({ ...b, subject }));
  const units = m.guideUnitsFor({ books: [...withSubject(math, '수학'), ...withSubject(kor, '국어')] }, entries);
  assert.deepEqual(units.map((u) => [u.code, u.id, u.bookLabel]), [['4수학04-01', '3-1', '수학 ③'], ['4국어01-01', '3-1', '국어 ③'], ['4국어01-01', '3-10', '국어 ③']]);
  const picked = m.pickLessons(units[0].lessons, 6);
  assert.ok(picked.every((l) => !/단원 평가|놀이 마당/.test(l.stage)), picked.map((l) => l.stage).join());
  assert.ok(m.pickLessons(units[1].lessons, 20).every((l) => l.stage !== '단원 정리'));
  const block = m.curriculumGuideBlock(units);
  assert.ok(block.includes("수학 ③ 1단원 '규칙 찾기' (교사용 지도서 p.78)") && block.includes('(지식·이해) 색, 모양, 크기의 규칙을 아는가?'), block.slice(0, 400));
  assert.ok(block.length < 2600, `블록 ${block.length}자`);
});
