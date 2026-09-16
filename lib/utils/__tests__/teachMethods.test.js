import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECORD_FRAMES, READY_KINDS, frameOf, normalizeKind, frameForMethod,
  BST_SCALE, scoreBstSession, bstMasteryReached, bstSummaryText,
  scoreLessonRow, LESSON_FIELDS, normalizeScores, scaleMasteryText,
  guessWriteMode, resolveIepMode, flowModeOf, iepModeLabel,
  DAILY_AREAS, methodForDailyArea, dailyAreaNeedsChoice, METHOD,
} from '../../teachMethods.js';

test('기록 틀은 지금 화면이 있는 것만 ready이고, 모르는 kind는 저장하지 않는다', () => {
  assert.deepEqual(READY_KINDS, ['chain', 'dtt', 'scale']);
  assert.equal(RECORD_FRAMES.length, 5);
  assert.equal(normalizeKind('scale'), 'scale');
  assert.equal(normalizeKind('opp'), null);
  assert.equal(frameOf('scale').metric, 'scale');
  assert.equal(frameForMethod(METHOD.bst), 'scale');
  assert.equal(frameForMethod(METHOD.di), 'lesson');
});

test('BST 척도는 5점이 스스로, 1점이 전적 도움이고 0점은 없다', () => {
  assert.deepEqual(BST_SCALE.map((s) => s.score), [5, 4, 3, 2, 1]);
  assert.equal(BST_SCALE[0].label, '스스로');
  assert.equal(BST_SCALE[4].label, '전적 도움·수행 안 함');
  // 0915 초안에서 한 칸이던 시범과 부분 신체 도움이 나뉘었다.
  assert.equal(BST_SCALE[2].label, '가리키기(몸짓)·모델링');
  assert.equal(BST_SCALE[3].label, '부분 신체 도움');
});

test('회기 점수는 빈칸·범위 밖을 빼고 평균과 5점 비율을 낸다', () => {
  assert.deepEqual(scoreBstSession([5, 4, '', 5, 9]), { n: 3, avg: 4.7, topRate: 67 });
  assert.deepEqual(scoreBstSession([]), { n: 0, avg: null, topRate: null });
});

test('도달은 실제 상황 5점 2회기 연속 — 역할극과 기초선은 판정에서 뺀다', () => {
  const real = (scores, phase = 'teach') => ({ setting: 'real', phase, scores });
  const play = (scores) => ({ setting: 'roleplay', phase: 'teach', scores });
  assert.equal(bstMasteryReached([real([5, 5]), real([5])]), true);
  assert.equal(bstMasteryReached([real([5, 5]), real([5, 4])]), false);
  // 역할극이 아무리 좋아도 실제 상황 회기가 2회 아니면 도달이 아니다.
  assert.equal(bstMasteryReached([play([5, 5]), play([5, 5]), real([5])]), false);
  // 기초선은 건너뛰고 그 앞 지도 회기로 이어 본다.
  assert.equal(bstMasteryReached([real([5]), real([5, 5], 'baseline'), real([5, 5])]), true);
});

test('평가 칸 요약은 명사형으로 끝난다', () => {
  const text = bstSummaryText([{ setting: 'real', phase: 'teach', scores: [5, 5] }, { setting: 'real', phase: 'teach', scores: [5] }]);
  assert.match(text, /실제 상황 2회기/);
  assert.match(text, /도달 기준 충족함$/);
  assert.equal(bstSummaryText([]), '');
});

test('차시 기록에서 1분 정답 수는 적은 날만 값이 된다', () => {
  assert.deepEqual(scoreLessonRow({ correct: 8, items: 10, fluency: 12 }), { pct: 80, fluency: 12 });
  assert.deepEqual(scoreLessonRow({ correct: 6, items: 10, fluency: '' }), { pct: 60, fluency: null });
  assert.equal(LESSON_FIELDS.find((f) => f.key === 'fluency').required, false);
});

test('점수 칸은 1~5만 남기고 기회 수에 맞춰 길이를 맞춘다', () => {
  assert.deepEqual(normalizeScores([5, '4', 0, 9, 'x'], 5), [5, 4, '', '', '']);
  assert.deepEqual(normalizeScores([], 2), ['', '']);
  assert.equal(normalizeScores([5, 5, 5], 20).length, 10); // 한 회기 최대 10칸
  assert.match(scaleMasteryText(), /실제 상황에서 5점\(스스로\) 2회기 연속/);
});

test('예전 목표의 작성 방식은 저장된 내용으로 추정한다', () => {
  assert.equal(guessWriteMode({ funcAlt: '도움 요청하기' }), 'func');
  assert.equal(guessWriteMode({ subjects: ['일상생활 활동'] }), 'daily');
  assert.equal(guessWriteMode({ subjects: ['수학'] }), 'subject');
  assert.equal(guessWriteMode({}), '');
});

test('새 목표는 저장값 → 이 학생의 올해 목표 → 선생님 기본값 순으로 정해진다', () => {
  assert.deepEqual(resolveIepMode({ saved: 'daily', teacherDefault: 'func' }), { mode: 'daily', source: 'saved', notice: '' });
  assert.deepEqual(resolveIepMode({ goalModes: ['subject', 'subject'], teacherDefault: 'func' }), { mode: 'subject', source: 'student', notice: '' });
  // 학생의 올해 목표가 섞여 있으면 선생님 기본값으로 연다.
  assert.equal(resolveIepMode({ goalModes: ['subject', 'func'], teacherDefault: 'func' }).source, 'teacher');
  assert.equal(resolveIepMode({}).mode, 'subject');
  assert.equal(flowModeOf('func'), 'goal');
  assert.equal(flowModeOf('daily'), 'std');
  assert.equal(iepModeLabel('func'), '(행동)기능기반');
});

test('공통교육과정 학생에게 일상생활이 걸리면 교과로 열고 알려 준다', () => {
  const r = resolveIepMode({ teacherDefault: 'daily', studentCurriculum: '공통' });
  assert.equal(r.mode, 'subject');
  assert.equal(r.source, 'fit');
  assert.match(r.notice, /공통교육과정/);
});

test('일상생활 21개 중영역 — 정한 곳은 기본값, 애매한 네 곳은 고르기', () => {
  assert.equal(DAILY_AREAS.length, 21);
  assert.equal(methodForDailyArea('신변 자립').method, METHOD.chain);
  assert.equal(methodForDailyArea('신변 자립').frame, 'chain');
  assert.equal(methodForDailyArea('안전한 생활').frame, 'scale');
  assert.equal(methodForDailyArea('의사소통의 기초').frame, 'dtt');
  const needChoice = DAILY_AREAS.filter(dailyAreaNeedsChoice);
  assert.deepEqual(needChoice.sort(), ['개인 여가활동', '생활 속 체력 증진', '신체 인지와 움직임', '자기 결정과 상호 작용'].sort());
  needChoice.forEach((a) => {
    const e = methodForDailyArea(a);
    assert.equal(e.method, '', `${a}는 기본값을 두지 않는다`);
    assert.equal(e.candidates.length, 2, `${a}는 후보 둘을 준다`);
  });
  // 회색 '다른 후보'로 적어 둔 곳은 기본값을 그대로 두고 후보만 안내한다.
  assert.equal(methodForDailyArea('신체 조절과 이동').method, METHOD.prompt);
  assert.equal(methodForDailyArea('신체 조절과 이동').alt.method, METHOD.bst);
});
