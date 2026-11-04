// mds/58 E2E 2차 수정 D(1103) — 주소 정리·교수 회기 주소·토스트 종류(순수 로직 단위 테스트).
//   #21·#28 모르는 해시·없는 탭·숫자 아닌 id의 정규형(normHash) · #29 교수 회기 기록 ?sub=sessions · #23 토스트 종류 추론
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normHash, parseHash, formatRoute, toNew, toOld, isStudentPage, STUDENT_TABS, SUB_LABELS, SUB_OLD, SUB_MONITOR_TAB, subOld, OLD_IDS,
} from '../../routes.js';
import { inferType } from '../../toastType.js';

test('#21·#28 정규형 — 모르는 해시는 #today, 없는 탭은 기록 탭, 숫자 아닌 id는 학생 목록, 없는 sub는 기본값', () => {
  assert.equal(normHash('#nonexistent-xyz'), '#today');
  assert.equal(normHash('#student/354/foo'), '#student/354/record');
  assert.equal(normHash('#student/abc/plan'), '#students');
  assert.equal(normHash('#student/354/record?sub=zzz'), '#student/354/record');
  assert.equal(normHash('#student/354/record?sub=observe'), '#student/354/record');
  // 이미 정규형이면 그대로(주소를 다시 쓰지 않는다)
  for (const h of ['#today', '#students', '#student/5/plan?sub=bip', '#class/status?sub=dash3', '#docs/builder', '#help/settings', '#menu', '#page/tier3']) {
    assert.equal(normHash(h), h, h);
  }
  // #go·옛 해시는 학생이 정해진 뒤 셸이 바꾸므로 그대로
  assert.equal(normHash('#go/iep'), '#go/iep');
  assert.equal(normHash('#iep'), '#iep');
});

test('#29 교수 회기 기록은 주소가 따로(?sub=sessions)이고 그리는 옛 화면은 행동 데이터(monitor)', () => {
  const rec = STUDENT_TABS.find((t) => t.key === 'record');
  assert.deepEqual(rec.subs, ['observe', 'monitor', 'sessions']);
  assert.deepEqual(parseHash('#student/7/record?sub=sessions'), { kind: 'student', sid: 7, tab: 'record', sub: 'sessions' });
  assert.equal(formatRoute({ kind: 'student', sid: 7, tab: 'record', sub: 'sessions' }), '#student/7/record?sub=sessions');
  assert.equal(normHash('#student/7/record?sub=sessions'), '#student/7/record?sub=sessions');
  assert.equal(formatRoute({ kind: 'student', sid: 7, tab: 'record', sub: 'monitor' }), '#student/7/record?sub=monitor');
  // 옛 id로 되돌리기 — 길잡이·PageFrame·PickStudentModal은 옛 id 32개만 안다
  assert.equal(toOld('#student/7/record?sub=sessions'), 'monitor');
  assert.equal(subOld('sessions'), 'monitor');
  assert.equal(subOld('observe'), 'observe');
  assert.equal(subOld(''), '');
  assert.equal(SUB_LABELS.sessions, '교수 회기 기록');
  assert.equal(SUB_MONITOR_TAB.sessions, 'sessions');
  assert.equal(SUB_MONITOR_TAB.monitor, 'behavior');
  // 'sessions'는 옛 화면 id가 아니다 — 옛 id 표(역매핑)에 들어가지 않는다
  assert.ok(!OLD_IDS.includes('sessions'));
  assert.equal(isStudentPage('sessions'), false);
  assert.equal(toNew('sessions', { sid: 7 }), null);
  for (const k of Object.keys(SUB_OLD)) assert.ok(OLD_IDS.includes(SUB_OLD[k]), k);
});

test('#29 옛 화면이 kb_monitor_tab에 회기 탭을 적고 monitor로 부르면(IEP→DTT·달력·그래프) 회기 주소로', () => {
  assert.equal(toNew('monitor', { sid: 7 }), '#student/7/record?sub=monitor');
  assert.equal(toNew('monitor', { sid: 7, monitorTab: 'behavior' }), '#student/7/record?sub=monitor');
  assert.equal(toNew('monitor', { sid: 7, monitorTab: null }), '#student/7/record?sub=monitor');
  assert.equal(toNew('monitor', { sid: 7, monitorTab: 'sessions' }), '#student/7/record?sub=sessions');
  // 다른 화면은 monitorTab과 상관없다
  assert.equal(toNew('observe', { sid: 7, monitorTab: 'sessions' }), '#student/7/record');
  assert.equal(toNew('monitor', { monitorTab: 'sessions' }), null); // 학생 없음 — 학생 고르기 창
});

test('#29 기록 탭의 교수 회기 칩은 key sessions, 길잡이 앵커 data-tour는 그대로', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components/workspace/tabs/RecordTab.jsx'), 'utf8');
  assert.match(src, /key: 'sessions', label: '교수 회기 기록'[^\n]*tour: 'ws-rec-sessions'/);
  assert.match(src, /key: 'monitor', label: '행동 데이터'[^\n]*tour: 'nav-monitor'/);
});

test('#23 토스트 종류 — 쉬운 말 "없어요"·"못했어요"는 성공 낱말이 있어도 ⚠, 성공 문구는 그대로 ✓', () => {
  assert.equal(inferType('저장된 통신문이 없어요 — ‘쓰기 · 인쇄 창 열기’로 먼저 써 주세요.'), 'error');
  assert.equal(inferType('과제분석 단계가 저장된 목표가 없어요 — IEP 탭 ③에서 단계를 만들어 저장해 주세요.'), 'error');
  assert.equal(inferType('저장된 위기 시나리오가 없어요 — 위기 대처 화면에서 만든 뒤 💾 저장해 주세요.'), 'error');
  assert.equal(inferType('아직 저장된 기록이 없어요. 첫 기록은 직접 입력해 주세요.'), 'error');
  assert.equal(inferType('저장하지 못했어요: 네트워크'), 'error');
  assert.equal(inferType('복사 권한이 없어요 — 화면의 내용을 직접 선택해 복사해 주세요.'), 'error');
  // 기존 분류는 그대로
  assert.equal(inferType('저장 실패'), 'error');
  assert.equal(inferType('출력할 목표가 없습니다.'), 'error');
  assert.equal(inferType('저장했어요'), 'success');
  assert.equal(inferType('샘플A 관찰 저장했어요 · 다음: 샘플B'), 'success');
  assert.equal(inferType('NEIS용 텍스트를 복사했어요.'), 'success');
  assert.equal(inferType('지웠어요.'), '');
  assert.equal(inferType(''), '');
});

test('#23 문서·자료 허브의 "없음" 안내 6곳은 종류를 직접 넘긴다', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components/docs/DocsPage.jsx'), 'utf8');
  for (const m of ['출력할 목표가 없습니다.', '복사할 내용이 없습니다.', '저장된 IEP 목표가 없습니다. 먼저 저장하세요.', '과제분석 단계가 저장된 목표가 없어요', '저장된 통신문이 없어요', '저장된 위기 시나리오가 없어요']) {
    const i = src.indexOf(m);
    assert.ok(i > 0, m);
    assert.match(src.slice(i, src.indexOf(')', i) + 1), /', 'error'\)$/, m);
  }
});

test('#39·#35 빠른 기록 창 — 회기 안내는 실제 단추 이름 둘 다, 저장 단추는 disabled 대신 aria-disabled', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components/quick/QuickRecordDrawer.jsx'), 'utf8');
  assert.match(src, /칸 안의 저장 단추\(💾 회기 저장 또는 저장\)로 저장해 주세요/);
  assert.doesNotMatch(src, /disabled=\{saving\}/);
  assert.match(src, /data-tour="quick-save" aria-disabled=\{saving \|\| undefined\}/);
  const ws = fs.readFileSync(path.join(process.cwd(), 'components/workspace/StudentWorkspace.jsx'), 'utf8');
  assert.match(ws, /<h2 className="kb-ws-name" ref=\{nameRef\} tabIndex=\{-1\}>/);
});
