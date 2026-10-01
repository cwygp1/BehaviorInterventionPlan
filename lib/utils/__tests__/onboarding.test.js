import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSimpleMode, SIMPLE_COMMON, firstSentence, softLockFor, FIRST_STEPS, firstStepFor, buildChecklist, checklistProgress,
} from '../../onboarding.js';
import { PAGE_META } from '../../tiers.js';
import { PAGE_HELP } from '../../helpText.js';

// 처음 쓰는 선생님 안내(mds/46 방법 1~7) — 판단 로직 검사.

test('간단 모드: used_tiers가 정확히 3일 때만', () => {
  assert.equal(isSimpleMode({ used_tiers: '3' }), true);
  assert.equal(isSimpleMode({ used_tiers: '' }), false);
  assert.equal(isSimpleMode({ used_tiers: '1,2,3' }), false);
  assert.equal(isSimpleMode({ used_tiers: '2,3' }), false);
  assert.equal(isSimpleMode(null), false);
});

test('간단 모드 공통 메뉴는 실제 화면 id', () => {
  SIMPLE_COMMON.forEach((id) => assert.ok(PAGE_META[id], id));
});

test('잠금 표시: 행동 데이터가 없을 때 결과 평가, IEP 목표가 0개일 때 계획서', () => {
  assert.ok(softLockFor('eval', { curStuData: { mon: [] } }));
  assert.equal(softLockFor('eval', { curStuData: { mon: [{ id: 1 }] } }), null);
  assert.ok(softLockFor('iepReport', { iepCount: 0 }));
  assert.equal(softLockFor('iepReport', { iepCount: null }), null, '개수를 모르면 잠그지 않음');
  assert.equal(softLockFor('iepReport', { iepCount: 2 }), null);
  assert.equal(softLockFor('observe', { curStuData: {} }), null);
});

test('빈 화면 첫 할 일: 대상 화면 id가 실제 화면이고, 가는 곳·앵커가 있다', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const src = ['components/pages/ObservePage.jsx', 'components/pages/MonitorPage.jsx', 'components/pages/IepPage.jsx']
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  Object.entries(FIRST_STEPS).forEach(([page, c]) => {
    assert.ok(PAGE_META[page], page);
    assert.ok(c.anchor || c.go, page + ': anchor 또는 go');
    if (c.go) assert.ok(PAGE_META[c.go], page + ' → ' + c.go);
    if (c.anchor) assert.match(src, new RegExp(`data-(help|tour)="${c.anchor}"`), page + ' 앵커 ' + c.anchor);
  });
});

test('빈 화면 첫 할 일: 기록 0건일 때만, 데이터 도착 전에는 안 보임', () => {
  const curStu = { id: 1 };
  assert.equal(firstStepFor('observe', { curStu, curStuData: { abc: [] }, curStuDataLoaded: false }), null);
  assert.equal(firstStepFor('observe', { curStu, curStuData: { abc: [] }, curStuDataLoaded: true }).anchor, 'ob-form');
  assert.equal(firstStepFor('observe', { curStu, curStuData: { abc: [{}] }, curStuDataLoaded: true }), null);
  assert.equal(firstStepFor('observe', { curStu: null, curStuData: {}, curStuDataLoaded: true }), null, '학생 없으면 화면이 따로 안내');
  assert.equal(firstStepFor('iep', { curStu, curStuData: {}, curStuDataLoaded: true, iepCount: null }), null, 'IEP 개수 모르면 안 보임');
  assert.ok(firstStepFor('iep', { curStu, curStuData: {}, curStuDataLoaded: true, iepCount: 0 }));
  assert.equal(firstStepFor('bip', { curStu, curStuData: { abc: [], qabf: { responses: {} } }, curStuDataLoaded: true }), null, 'QABF가 있으면 근거 있음');
  assert.equal(firstStepFor('home', { curStu, curStuData: {}, curStuDataLoaded: true }), null);
});

test('시작하기 체크리스트: 샘플 학생은 "내 학생"으로 치지 않는다', () => {
  const classes = [{ id: 1, name: '1반' }];
  const students = [{ id: 10, is_sample: true }, { id: 11, is_sample: true }];
  const summaries = { 10: { abc_count: 5, mon_count: 30, iep_count: 2 }, 11: { abc_count: 3 } };
  const items = buildChecklist({ classes, students, summaries });
  const by = Object.fromEntries(items.map((i) => [i.id, i.done]));
  assert.deepEqual(by, { class: true, student: false, abc: false, iep: false, monitor: false });
  const p = checklistProgress(items);
  assert.equal(p.done, 1);
  assert.equal(p.next.id, 'student');
  assert.equal(p.complete, false);
});

test('시작하기 체크리스트: 내 학생 기록이 다 있으면 완료', () => {
  const items = buildChecklist({
    classes: [{ id: 1, name: '1반' }],
    students: [{ id: 1 }, { id: 2, is_sample: true }],
    summaries: { 1: { abc_count: 1, mon_count: 1, iep_count: 1 } },
  });
  assert.equal(checklistProgress(items).complete, true);
  items.filter((i) => i.page).forEach((i) => assert.ok(PAGE_META[i.page], i.page));
});

test('화면 소개 줄: 문구 출처(PAGE_HELP.what)의 첫 문장이 해요체 한 문장', () => {
  Object.entries(PAGE_HELP).forEach(([page, h]) => {
    const first = firstSentence(h.what);
    assert.ok(first.endsWith('.') && /요[(.]/.test(first), page + ': ' + first);
    assert.ok(first.length < 140, page + ' 너무 김');
  });
  assert.equal(firstSentence('곳이에요(출발점 분석). 둘째.'), '곳이에요(출발점 분석).');
});
