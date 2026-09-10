import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTermIndex, goalCoverage, skeletonGoal } from '../stdTerms.js';
import { goalLadder, activityPhrase, goalLadderBlock, GOAL_LEVELS, LADDER_EXAMPLES } from '../goalLadder.js';
import { findCriterion } from '../aiText.js';

const file = path.join(process.cwd(), 'public/data/achievement-standards.json');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = d.rows.map((a) => ({ subject: a[0], gradeCode: a[1], area: a[2], code: a[3], text: a[4], curriculum: a[8] || '기본' }));
const index = buildTermIndex(rows);
const by = (code) => rows.find((r) => r.code === code);

test('현장 예시(2국02-01) 다섯 문장은 모두 낱말 게이트를 통과한다 — 수준이 달라도 성취기준을 바꿀 필요가 없다', () => {
  const s = by('2국02-01');
  assert.ok(s && /소리 내어 읽는다/.test(s.text));
  for (const line of LADDER_EXAMPLES.read.lines) {
    const c = goalCoverage(line, s, index);
    assert.equal(c.ok, true, line);
    assert.deepEqual(c.missing, [], line);
  }
  // 수학 본보기도 자기 성취기준(2수01-06)의 낱말을 지킨다.
  const m = by('2수01-06');
  for (const line of LADDER_EXAMPLES.math.lines) assert.equal(goalCoverage(line, m, index).ok, true, line);
});

test('0910 갑 결정: 공통교육과정도 범위를 좁힌 목표를 허용 — 변별 명사 1개 이상 + 인지 동사 유지면 ok(빠진 명사는 정보만)', () => {
  const s = by('9수03-10'); // 삼각형의 외심과 내심의 성질을 이해하고 정당화할 수 있다.
  const narrow = goalCoverage('교사의 안내 질문을 받아 삼각형의 외심의 성질을 정당화할 수 있다.', s, index);
  assert.equal(narrow.ok, true);
  assert.deepEqual(narrow.missing, ['내심']);
  // 동사를 낮추면(정당화→설명) 범위를 좁히지 않아도 통과하지 않는다.
  assert.equal(goalCoverage('삼각형의 외심과 내심의 성질을 설명할 수 있다.', s, index).ok, false);
});

test('goalLadder: ④는 원문 스켈레톤과 같고, 다섯 줄 모두 "~할 수 있다."로 끝나며 필수 낱말을 지킨다', () => {
  const s = by('9수03-09'); // 이등변삼각형의 성질을 이해하고 정당화할 수 있다.
  const L = goalLadder(s.text);
  assert.equal(L.length, 5);
  assert.equal(L[3], skeletonGoal(s));
  assert.equal(L[0], '이등변삼각형의 성질을 이해하고 정당화하는 활동에 자신의 방식으로 참여할 수 있다.');
  assert.equal(L[1], '교사의 시범과 단서를 받아 이등변삼각형의 성질을 이해하고 정당화할 수 있다.');
  assert.equal(L[2], '익숙한 자료·상황에서 이등변삼각형의 성질을 이해하고 정당화할 수 있다.');
  assert.equal(L[4], '새로운 자료·상황에서도 스스로 이등변삼각형의 성질을 이해하고 정당화할 수 있다.');
  for (const line of L) {
    assert.ok(/할 수 있다\.$/.test(line), line);
    const c = goalCoverage(line, s, index);
    assert.equal(c.ok && c.missing.length === 0, true, line);
  }
  const a = by('9수학02-01'); // 사각형, 삼각형, 원을 탐색한다.
  assert.equal(goalLadder(a.text)[0], '사각형, 삼각형, 원을 탐색하는 활동에 자신의 방식으로 참여할 수 있다.');
  assert.equal(goalLadder(a.text)[1], '교사의 시범과 단서를 받아 사각형, 삼각형, 원을 탐색할 수 있다.');
  // 원문이 '스스로'로 시작하면 접두어와 겹치지 않는다.
  assert.equal(goalLadder('스스로 옷을 입는다.')[4], '새로운 자료·상황에서도 스스로 옷을 입을 수 있다.');
  // 태도형·'활동에' 포함 원문은 ①이 관형구 겹침("활동에 … 활동에 참여") 대신 전면 지원 접두어.
  assert.equal(goalLadder('읽기에 흥미를 가지고 즐겨 읽는 태도를 지닌다.')[0], '교사와 함께 하는 활동에서 읽기에 흥미를 가지고 즐겨 읽는 태도를 지닐 수 있다.');
  assert.equal(goalLadder('실물, 그림, 상징이 소리로 표현되는 것을 알고, 읽는 활동에 관심을 가진다.')[0], '교사와 함께 하는 활동에서 실물, 그림, 상징이 소리로 표현되는 것을 알고, 읽는 활동에 관심을 가질 수 있다.');
  assert.deepEqual(goalLadder(''), ['', '', '', '', '']);
  assert.equal(GOAL_LEVELS.length, 5);
});

test('activityPhrase: 어미별 관형형', () => {
  assert.equal(activityPhrase('사각형, 삼각형, 원을 탐색한다.'), '사각형, 삼각형, 원을 탐색하는 활동');
  assert.equal(activityPhrase('책을 읽는다.'), '책을 읽는 활동');
  assert.equal(activityPhrase('□의 값을 구할 수 있다.'), '□의 값을 구하는 활동');
  assert.equal(activityPhrase('덧셈과 뺄셈을 할 수 있다.'), '덧셈과 뺄셈을 하는 활동');
  assert.equal(activityPhrase('글자를 읽을 수 있다.'), '글자를 읽는 활동');
  assert.equal(activityPhrase('이야기를 들을 수 있다.'), '이야기를 듣는 활동');
  assert.equal(activityPhrase('규칙을 만들 수 있다.'), '규칙을 만드는 활동');
  assert.equal(activityPhrase('물건의 수를 셀 수 있다.'), '물건의 수를 세는 활동');
  assert.equal(activityPhrase('읽기에 흥미를 가진다.'), '읽기에 흥미를 가지는 활동');
  assert.equal(activityPhrase('글자와 단어를 바르게 쓴다.'), '글자와 단어를 바르게 쓰는 활동');
  assert.equal(activityPhrase('올바른 읽기 습관을 기른다.'), '올바른 읽기 습관을 기르는 활동');
  assert.equal(activityPhrase('손 씻기'), '손 씻기 활동'); // 알 수 없는 꼴은 ' 활동'만 붙인다
  assert.equal(activityPhrase(''), '');
});

test('전 행: 사다리 다섯 줄이 자기 성취기준의 커버리지를 통과한다(원문 낱말을 그대로 품으므로)', () => {
  let fail = 0;
  for (const r of rows) {
    for (const line of goalLadder(r.text)) if (!goalCoverage(line, r, index).ok) fail++;
  }
  // 예외 3줄(2150행×5줄 중): "나눌 수 있다·나타낼 수 있다"의 ㄹ 관형형을 stdTerms 토크나이저가 명사로 잡아,
  // ①참여 문장("나누는 활동")에서 그 조각이 사라진다 — 토크나이저의 기존 한계이지 사다리 문제가 아니다.
  assert.ok(fail <= 3, `실패 ${fail}줄`);
});

test('goalLadderBlock: 교과에 따라 다른 교과의 본보기를 보여 준다 + 세 축·기준 금지 문구', () => {
  const math = goalLadderBlock({ hint: '수학 이등변삼각형의 성질을 이해하고 정당화할 수 있다.' });
  assert.ok(math.includes('2국02-01') && math.includes('소리 내어 읽는다'));
  const kor = goalLadderBlock({ hint: '국어 글자, 단어, 문장, 짧은 글을 정확하게 소리 내어 읽는다.' });
  assert.ok(kor.includes('2수01-06') && !kor.includes('소리 내어'));
  const comm = goalLadderBlock({ hint: '의사소통 몸짓으로 요구를 표현한다.' });
  assert.ok(comm.includes('2수01-06'));
  for (const b of [math, kor]) {
    assert.ok(b.includes('지원의 정도') && b.includes('다루는 범위') && b.includes('붙는 조건'));
    assert.ok(b.includes('목표 문장에 넣지 말 것'));
    assert.ok(b.includes('①') && b.includes('⑤'));
  }
  assert.ok(goalLadderBlock({ hint: '수학', monthly: true }).includes('월별 교육목표도 같은 원칙'));
  assert.ok(!goalLadderBlock({ hint: '수학' }).includes('월별 교육목표도'));
});

test('findCriterion: 도달 기준 수치는 잡고, 범위 수치는 잡지 않는다', () => {
  assert.deepEqual(findCriterion('10회 기회 중 8회 이상 스스로 수행할 수 있다.'), ['10회 기회 중 8회 이상']);
  assert.deepEqual(findCriterion('5개 중 4개를 정확하게 읽을 수 있다.'), ['5개 중 4개']);
  assert.deepEqual(findCriterion('80% 이상의 정확도로 읽을 수 있다.'), ['80% 이상']);
  assert.deepEqual(findCriterion('3회 연속 성공할 수 있다.'), ['3회 연속']);
  assert.deepEqual(findCriterion('정확도 90%로 계산할 수 있다.'), ['정확도 90']);
  assert.deepEqual(findCriterion('받침 없는 낱말 20개를 그림 단서와 함께 소리 내어 읽을 수 있다.'), []);
  assert.deepEqual(findCriterion('구체물을 사용하여 10 이하의 덧셈을 해결할 수 있다.'), []);
  assert.deepEqual(findCriterion('두 자리 수의 범위에서 덧셈과 뺄셈을 할 수 있다.'), []);
  assert.deepEqual(findCriterion('급식 시간 5분 동안 자리에 앉아 밥을 먹을 수 있다.'), []);
  assert.deepEqual(findCriterion(''), []);
  assert.deepEqual(findCriterion(null), []);
});
