import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teachingRecordRows, teachingRecordsForPrompt, sessionChartSvg } from '../teachingReport.js';

const dtt = (phase, pct, i, stats) => ({ id: i, kind: 'dtt', program_id: 7, date: `2026-10-${10 + i}`, session_no: 1, phase, pct,
  steps_snapshot: [{ id: 'a', text: '싸인펜' }, { id: 'b', text: '가위' }], item_stats: stats });

test('DTT 프로그램: 기초선·지도 회기를 나누고, 기록상 기준에 도달한 표적도 도달로 센다', () => {
  const sessions = [
    dtt('baseline', 20, 1, [{ correct: 2, scored: 10, pct: 20 }, { correct: 2, scored: 10, pct: 20 }]),
    dtt('teach', 85, 2, [{ correct: 9, scored: 10, pct: 90 }, { correct: 8, scored: 10, pct: 80 }]),
    dtt('teach', 90, 3, [{ correct: 9, scored: 10, pct: 90 }, { correct: 5, scored: 10, pct: 50 }]),
  ];
  const programs = [{ id: 7, kind: 'dtt', title: '물건 요청', items: [{ id: 'a', text: '싸인펜', status: 'teach' }, { id: 'b', text: '가위', status: 'teach' }], mastery: { type: 'rate', pct: 80, runs: 2 } }];
  const [r] = teachingRecordRows({ programs, sessions });
  assert.equal(r.baseCount, 1);
  assert.equal(r.teachCount, 2);
  assert.equal(r.sub, '표적 2개 중 1개 학습기준 도달');
  assert.equal(r.reached, false);
  assert.match(teachingRecordsForPrompt([r]), /\[DTT\] 물건 요청/);
});

test('기록 없는 프로그램은 빼고, 과제분석은 IEP 목표 단위로 묶는다', () => {
  const sessions = [
    { kind: 'chain', goal_id: 3, date: '2026-10-01', phase: 'teach', pct: 80 },
    { kind: 'chain', goal_id: 3, date: '2026-10-02', phase: 'teach', pct: 85 },
  ];
  const rows = teachingRecordRows({ programs: [{ id: 1, kind: 'dtt', title: '빈', items: [] }], sessions, goals: [{ id: 3, semester_goal: '손 씻기', chain_type: 'forward' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kindLabel, '과제분석');
  assert.equal(rows[0].reached, true);
  assert.match(sessionChartSvg(rows[0]), /^<svg/);
  assert.equal(teachingRecordsForPrompt([]), '');
});
