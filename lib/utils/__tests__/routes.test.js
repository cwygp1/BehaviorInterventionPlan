// 새 디자인(/new) 주소 어댑터(lib/routes.js) — 옛 화면 id 32개 전수 검사 (mds/54 §1 조건 1, §6 위험 1).
//   하나라도 빠지면 화면 안 onNavigate('옛 id')·길잡이·FirstRun 단추가 새 셸에서 죽는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PAGE_META } from '../../tiers.js';
import {
  OLD_IDS, toNew, toOld, parseHash, formatRoute, STUDENT_TABS, CLASS_TABS, isStudentPage, requiresStudent, menuOf, withStudent,
} from '../../routes.js';

test('PAGE_META 32개가 OLD_IDS와 같다', () => {
  assert.equal(OLD_IDS.length, 32);
  assert.deepEqual([...OLD_IDS].sort(), Object.keys(PAGE_META).sort());
});

test('pages/index.js VALID_PAGES(옛 라우터)와 PAGE_META가 같다 — 새 화면을 옛 쪽에만 넣지 않게', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'lib/nav/legacyNav.js'), 'utf8');
  const m = /VALID_PAGES = new Set\(\[([\s\S]*?)\]\)/.exec(src);
  assert.ok(m, 'VALID_PAGES 목록을 찾지 못함');
  const ids = [...m[1].matchAll(/'([A-Za-z0-9]+)'/g)].map((x) => x[1]);
  assert.deepEqual(ids.sort(), [...OLD_IDS].sort());
});

test('옛 id 32개 전부: 학생이 있으면 toNew가 주소를 내고, toOld로 같은 id가 돌아온다', () => {
  for (const id of OLD_IDS) {
    const h = toNew(id, { sid: 7 });
    assert.ok(h && h.startsWith('#'), `${id}: 주소 없음`);
    const back = toOld(h);
    assert.equal(back, id, `${id} → ${h} → ${back}`);
    // 주소 → 경로 → 주소가 같은 글자여야 뒤로가기·새로고침이 같은 화면을 연다.
    assert.equal(formatRoute(parseHash(h)), h, `${id}: ${h} 왕복 불일치`);
  }
});

test('학생 없이: 학생 필요 화면은 null(학생 고르기), 절차 안내는 옛 화면 한 장, 나머지는 주소', () => {
  for (const id of OLD_IDS) {
    const h = toNew(id, {});
    if (requiresStudent(id)) assert.equal(h, null, `${id}: 학생 없이 주소가 나오면 안 됨`);
    else {
      assert.ok(h, `${id}: 학생 없어도 열려야 함`);
      assert.equal(toOld(h), id, `${id}: 학생 없이 → ${h}`);
    }
  }
  assert.equal(toNew('tier3', {}), '#page/tier3');
});

test('학생 수첩 화면은 #student/{id}/{탭} 꼴, 탭 이름은 6개 중 하나', () => {
  const tabs = STUDENT_TABS.map((t) => t.key);
  assert.deepEqual(tabs, ['record', 'plan', 'iep', 'chart', 'docs', 'profile']);
  for (const id of OLD_IDS.filter(isStudentPage)) {
    const h = toNew(id, { sid: 12 });
    const m = /^#student\/12\/([a-z]+)(\?sub=[A-Za-z0-9]+)?$/.exec(h);
    assert.ok(m, `${id}: ${h}`);
    assert.ok(tabs.includes(m[1]));
  }
  assert.equal(toNew('monitor', { sid: 12 }), '#student/12/record?sub=monitor');
  assert.equal(toNew('observe', { sid: 12 }), '#student/12/record');
  assert.equal(toNew('iep', { sid: 3 }), '#student/3/iep');
  assert.equal(toNew('eval', { sid: 3 }), '#student/3/chart');
});

test('대표 대응: 홈→오늘, 현황판 4종→우리 반 현황, 자료·도움', () => {
  assert.equal(toNew('home'), '#today');
  assert.equal(toOld('#today'), 'home');
  assert.equal(toNew('calendar'), '#today/calendar');
  assert.equal(toNew('dash1'), '#class/status');
  assert.equal(toNew('dash3'), '#class/status?sub=dash3');
  assert.equal(toNew('dashIep'), '#class/status?sub=dashIep');
  assert.equal(toNew('schoolrules'), '#class/survey?sub=schoolrules');
  assert.equal(toNew('classcheck2'), '#class/check?sub=classcheck2');
  assert.equal(toNew('tier2'), '#class/cico');
  assert.equal(toNew('builder'), '#docs/builder');
  assert.equal(toNew('qaBoard'), '#help/board');
  assert.equal(toNew('chatExpert'), '#help/ai');
  assert.equal(toNew('admin'), '#help/admin');
  assert.equal(toNew('crisis'), '#crisis');
  assert.equal(toNew('qa'), '#help/ai', '없어진 qa는 chatExpert로');
  assert.equal(toNew('없는화면'), null);
});

test('옛 해시 북마크(#iep 등)는 go 경로 — 학생이 정해진 뒤 새 자리로', () => {
  assert.deepEqual(parseHash('#iep'), { kind: 'go', old: 'iep' });
  assert.deepEqual(parseHash('#dash3'), { kind: 'go', old: 'dash3' });
  assert.deepEqual(parseHash('#go/monitor'), { kind: 'go', old: 'monitor' });
  assert.deepEqual(parseHash('#students'), { kind: 'students' });
  assert.deepEqual(parseHash(''), { kind: 'today' });
  assert.deepEqual(parseHash('#엉뚱'), { kind: 'today' });
  // 탭에 없는 sub는 기본값으로
  assert.deepEqual(parseHash('#student/5/record?sub=iep'), { kind: 'student', sid: 5, tab: 'record', sub: 'observe' });
  assert.deepEqual(parseHash('#student/abc/iep'), { kind: 'students' });
});

test('모음 화면은 옛 id가 없다(빈 글자), 메뉴 소속은 5개 중 하나', () => {
  assert.equal(toOld('#docs'), '');
  assert.equal(toOld('#help'), '');
  assert.equal(toOld('#menu'), '');
  assert.equal(toOld('#student/2/docs'), '');
  assert.equal(toOld('#student/2/profile'), '');
  const menus = new Set(['today', 'students', 'class', 'docs', 'help']);
  for (const id of OLD_IDS) assert.ok(menus.has(menuOf(parseHash(toNew(id, { sid: 1 })))), id);
  assert.equal(withStudent(parseHash('#student/2/iep?sub=startpoint'), 9), '#student/9/iep?sub=startpoint');
});

test('우리 반 탭의 하위 화면은 겹치지 않는다(한 옛 화면 = 한 자리)', () => {
  const all = [...STUDENT_TABS, ...CLASS_TABS].flatMap((t) => t.subs);
  assert.equal(new Set(all).size, all.length);
});
