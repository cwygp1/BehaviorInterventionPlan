// 새 디자인 4단계 — IEP 목표 상태·월 평가 부분 갱신·카드 단계 판정(lib/iepCard.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normStatus, isDraft, activeGoals, resolveGoalStatus, expandMonthLabel, monthIndexFor,
  mergeMonthEval, goalSteps, monthEvalTodoCount, copyGoalBody, draftGoalBody, evalSafeText, kstToday,
} from '../../iepCard.js';
import { nounEndText, toNounEnding } from '../../iepEvalNoun.js';

test('상태 정규화 — 모르는 값·빈 값은 active', () => {
  assert.equal(normStatus('draft'), 'draft');
  assert.equal(normStatus(' draft '), 'draft');
  assert.equal(normStatus(''), 'active');
  assert.equal(normStatus(undefined), 'active');
  assert.equal(normStatus('DRAFT!'), 'active');
  assert.equal(isDraft({ status: 'draft' }), true);
  assert.equal(isDraft({}), false); // 열이 없던 옛 행
  assert.deepEqual(activeGoals([{ id: 1, status: 'draft' }, { id: 2 }, { id: 3, status: 'active' }]).map((g) => g.id), [2, 3]);
});

test('초안 → active 전이 규칙(서버 resolveGoalStatus)', () => {
  // 새 목표: 학기목표만(월별 없음) + draft → draft
  assert.equal(resolveGoalStatus({ hasBodyStatus: true, bodyStatus: 'draft', curStatus: undefined, monthlyLen: 0 }), 'draft');
  // 옛 화면이 status 없이 새로 저장 → active (예전과 같음)
  assert.equal(resolveGoalStatus({ hasBodyStatus: false, curStatus: undefined, monthlyLen: 3 }), 'active');
  assert.equal(resolveGoalStatus({ hasBodyStatus: false, curStatus: undefined, monthlyLen: 0 }), 'active');
  // 초안에 월별 계획이 생기면(옛 화면 저장이 status를 안 보내도) active
  assert.equal(resolveGoalStatus({ hasBodyStatus: false, curStatus: 'draft', monthlyLen: 5 }), 'active');
  // draft를 보내도 월별이 있으면 active
  assert.equal(resolveGoalStatus({ hasBodyStatus: true, bodyStatus: 'draft', curStatus: 'draft', monthlyLen: 1 }), 'active');
  // 부분 갱신(학기목표 글만 고침): status를 안 보내면 기존 값 유지
  assert.equal(resolveGoalStatus({ hasBodyStatus: false, curStatus: 'draft', monthlyLen: 0 }), 'draft');
  assert.equal(resolveGoalStatus({ hasBodyStatus: false, curStatus: 'active', monthlyLen: 0 }), 'active');
});

test('월 라벨 풀기·이 달 칸 찾기(묶은 달 포함)', () => {
  assert.deepEqual(expandMonthLabel('3-4', 1), [3, 4]);
  assert.deepEqual(expandMonthLabel('12-1', 2), [12, 1]);
  assert.deepEqual(expandMonthLabel('3·5', 1), [3, 5]);
  assert.deepEqual(expandMonthLabel('11', 2), [11]);
  const m = [{ month: '9-10' }, { month: '11' }, { month: '12-1' }];
  assert.equal(monthIndexFor(m, 10, 2), 0);
  assert.equal(monthIndexFor(m, 11, 2), 1);
  assert.equal(monthIndexFor(m, 1, 2), 2);
  assert.equal(monthIndexFor(m, 5, 2), -1);
  assert.equal(monthIndexFor(null, 5, 1), -1);
});

test('월 평가 부분 갱신 — 그 달 칸만 바뀌고 다른 달 평가는 그대로', () => {
  const monthly = [
    { month: '9', goal: 'g9', eval: '- 9월 결과 기록함', eval_at: '2026-09-30', eval_mark: '달성' },
    { month: '10', goal: 'g10', eval: '- 독립 수행 40% 기준 도달 여부 확인', eval_plan: '- …는가?' },
    { month: '11', goal: 'g11', eval: '' },
  ];
  const out = mergeMonthEval(monthly, 1, { mark: '부분', text: '5회 중 3회 스스로 읽었다.', date: '2026-10-31' });
  assert.notEqual(out, monthly); // 새 배열
  assert.deepEqual(out[0], monthly[0]);
  assert.deepEqual(out[2], monthly[2]);
  assert.equal(out[1].goal, 'g10');
  assert.equal(out[1].eval_plan, '- …는가?');
  assert.equal(out[1].eval, '5회 중 3회 스스로 읽었음'); // 명사형 종결
  assert.equal(out[1].eval_mark, '부분');
  assert.equal(out[1].eval_at, '2026-10-31');
  assert.equal(out[1].eval_method, '- 독립 수행 40% 기준 도달 여부 확인'); // 미리 채워진 평가 방법은 옮겨 둔다
  // 다시 고쳐 적어도 eval_method는 처음 것 그대로
  const again = mergeMonthEval(out, 1, { mark: '달성', text: '5회 중 5회 스스로 읽음', date: '2026-11-01' });
  assert.equal(again[1].eval_method, '- 독립 수행 40% 기준 도달 여부 확인');
  assert.equal(again[1].eval_mark, '달성');
  assert.deepEqual(again[0], monthly[0]);
  // 잘못된 칸 번호·모르는 표시
  assert.deepEqual(mergeMonthEval(monthly, 7, { text: 'x', date: 'd' }), monthly);
  assert.equal(mergeMonthEval(monthly, 2, { mark: '??', text: '참여함', date: 'd' })[2].eval_mark, '');
});

test('평가 문장 안전망 — 명사형 종결·질문 나열 바꾸기', () => {
  assert.equal(evalSafeText(''), '');
  assert.equal(evalSafeText('교사 촉진 후 스스로 읽는다.'), '교사 촉진 후 스스로 읽음');
  assert.equal(evalSafeText('3회 성공함'), '3회 성공함');
  const q = evalSafeText('- 낱말을 읽는가?\n- 그림을 찾는가?');
  assert.ok(!/[?？]/.test(q));
  assert.match(q, /관찰해 기록함/);
  assert.equal(toNounEnding('할 수 있다'), '할 수 있음');
  assert.equal(nounEndText('확인한다. 기술한다.'), '- 확인함\n- 기술함');
});

test('카드 4단계 줄 — 지금 할 단계', () => {
  assert.equal(goalSteps({ subject: '', semester_goal: '', monthly: [] }, 11).now, 0);
  assert.equal(goalSteps({ subject: '국어', semester_goal: '', monthly: [] }, 11).now, 1);
  assert.equal(goalSteps({ subject: '국어', semester_goal: '읽는다', monthly: [] }, 11).now, 2);
  const g = { subject: '국어', semester: 2, semester_goal: '읽는다', monthly: [{ month: '10', eval_at: '2026-10-31' }, { month: '11' }] };
  const s = goalSteps(g, 11);
  assert.equal(s.now, 3);
  assert.equal(s.monthIdx, 1);
  assert.equal(goalSteps({ ...g, monthly: [g.monthly[0], { month: '11', eval_mark: '달성' }] }, 11).now, 4);
  // 이번 달 칸이 없으면(학기 밖) 평가 표시가 하나라도 있으면 끝
  assert.equal(goalSteps(g, 5).now, 4);
});

test('이달 평가 남음 개수 — 초안·다른 학기·평가 표시한 칸은 빼고', () => {
  const goals = [
    { semester: 2, monthly: [{ month: '11' }] },
    { semester: 2, monthly: [{ month: '11-12', eval_at: '2026-11-01' }] },
    { semester: 2, status: 'draft', monthly: [] },
    { semester: 2, monthly: [{ month: '9' }, { month: '10' }] },
    { semester: 2, monthly: [{ month: '11-12', eval_mark: '' , eval_at: '' }] },
  ];
  assert.equal(monthEvalTodoCount(goals, 11), 2);
  assert.equal(monthEvalTodoCount([], 11), 0);
});

test('목표 복사·새 초안 body', () => {
  const src = { id: 9, student_id: 3, subject: '국어', standard_code: '2국02-01', semester_goal: '읽는다', plop: '학생 A만의 현행수준', monthly: [{ month: '3', eval: '결과' }], semestral_eval: 'x', crit_type: 'freq', crit_of: 5 };
  const b = copyGoalBody(src, { schoolYear: 2026, semester: 2 });
  assert.equal(b.status, 'draft');
  assert.equal(b.id, undefined);
  assert.equal(b.student_id, undefined);
  assert.deepEqual(b.monthly, []);
  assert.equal(b.plop, '');
  assert.equal(b.semestral_eval, '');
  assert.equal(b.semester_goal, '읽는다');
  assert.equal(b.crit_of, 5);
  assert.equal(b.school_year, 2026);
  const d = draftGoalBody({ subject: ' 수학 ', semesterGoal: ' 10까지 센다 ', schoolYear: 2026, semester: 2 });
  assert.deepEqual(d, { school_year: 2026, semester: 2, subject: '수학', semester_goal: '10까지 센다', monthly: [], status: 'draft' });
});

test('KST 오늘', () => {
  assert.deepEqual(kstToday(new Date('2026-10-31T16:00:00Z')), { date: '2026-11-01', month: 11 });
});
