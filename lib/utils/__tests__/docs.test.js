// 문서 허브 입력 만들기(lib/docs.js) — 기존 화면이 출력 함수에 넘기던 객체와 같은 모양인지(3단계).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_KINDS, iepFilter, iepYears, niceWordPayload, formWordPayload, taskGoals, taskSheetPayload,
  bipHasContent, bipPrintPayload, letterPrintPayload, contractBlankPayload, crisisPrintPayload, tier3Payload,
} from '../../docs.js';

const stu = { id: 3, code: '해님', level: '초등', grade: 3, disability: '자폐성장애', note: '[강점] 그림' };
const user = { name: '김교사', school: '꼬박초' };

test('문서 종류는 있는 출력만 — 10종, 알약 이름이 겹치지 않음', () => {
  assert.equal(DOC_KINDS.length, 10);
  for (const d of DOC_KINDS) {
    assert.ok(d.formats.length >= 1, d.key);
    assert.equal(new Set(d.formats.map((f) => f.key)).size, d.formats.length, d.key);
    for (const f of d.formats) assert.ok(['run', 'open'].includes(f.kind), `${d.key}.${f.key}`);
  }
});

test('IEP 거르기·학년도 목록은 IepReportPage와 같은 규칙', () => {
  const goals = [{ school_year: 2026, semester: 1 }, { school_year: 2026, semester: 2 }, { school_year: 2025, semester: '1' }];
  assert.equal(iepFilter(goals, { year: 2026, sem: '' }).length, 2);
  assert.equal(iepFilter(goals, { year: 0, sem: '1' }).length, 2);
  assert.deepEqual(iepYears(goals, 2026), [2026, 2025]);
  assert.deepEqual(niceWordPayload({ stu, user, year: 0, sem: '', goals: [], curYear: 2026 }), {
    student: { code: '해님', level: '초등', grade: 3 }, teacherName: '김교사', year: 2026, semester: '', goals: [],
  });
  assert.deepEqual(formWordPayload({ stu, user: null, goals: [1] }).student, { code: '해님', level: '초등', grade: 3, disability: '자폐성장애' });
  assert.equal(formWordPayload({ stu, user: null, goals: [] }).teacherName, '');
});

test('과제분석 기록지: 단계 있는 목표만, 빈 단계는 빼고', () => {
  const g = { semester_goal: '손 씻기', task_steps: [' 물 틀기 ', '', '비누'], chain_type: 'backward', prompt_system: 'ltm' };
  assert.deepEqual(taskGoals([g, { task_steps: ['  '] }]), [g]);
  assert.deepEqual(taskSheetPayload({ stu, user, goal: g }), {
    student: { code: '해님', level: '초등', grade: 3, disability: '자폐성장애' }, teacherName: '김교사',
    goalText: '손 씻기', steps: ['물 틀기', '비누'], chainType: 'backward', promptSystem: 'ltm',
  });
});

test('BIP: 화면이 읽는 칸 그대로, 내용 가드도 같음', () => {
  assert.equal(bipHasContent({ fct: '손들기', crit: '80%' }), false, '기능적 의사소통·기준만으로는 인쇄 안 함(화면과 같음)');
  assert.equal(bipHasContent({ resp: '무시' }), true);
  const p = bipPrintPayload({ stu, user, bip: { alt: '손들기', roles: 'x', extra: 1 } });
  assert.deepEqual(p, {
    studentId: '해님', level: '초등', disability: '자폐성장애', note: '[강점] 그림', teacherName: '김교사', school: '꼬박초',
    bip: { alt: '손들기', fct: '', crit: '', prev: '', teach: '', reinf: '', resp: '', roles: [] },
  });
});

test('통신문·계약서 빈 양식·위기 시나리오·Tier 3', () => {
  assert.deepEqual(letterPrintPayload({ stu, user, letter: { body: '안녕하세요', subject: '', category: '' } }), {
    studentId: '해님', teacherName: '김교사', school: '꼬박초', body: '안녕하세요', subject: '', category: '진행 보고',
  });
  const c = contractBlankPayload({ stu, user });
  assert.deepEqual(c.task, { who: '해님', what: '', when: '', howWell: '' });
  assert.equal(c.reward.who, '김교사');
  assert.equal(c.recordType, 'mf');
  assert.equal(c.weeks, 4);
  const cr = crisisPrintPayload({ stu, user, record: { situation: '상황', output: '결과', created_at: '2026-10-20 10:00:00' } });
  assert.equal(cr.level, '초등학교');
  assert.equal(cr.createdAt, '2026-10-20 10:00:00');
  const qabf = new Array(25).fill(0); qabf[1] = 3; // 문항 2 → 회피
  const t = tier3Payload({ stu, user, goals: [], data: { bip: { alt: 'a' }, abc: [{ b: '소리 지름' }], qabf }, linkage: 'L' });
  assert.equal(t.problemBehavior, '소리 지름');
  assert.ok(t.functionText.length > 0);
  assert.equal(t.tierLinkage, 'L');
  assert.equal(tier3Payload({ stu, user: null, goals: [], data: null, linkage: null }).functionText, '');
});
