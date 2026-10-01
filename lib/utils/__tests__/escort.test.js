// 🧭 길잡이(1001) — 길 정의(lib/escorts.js)가 화면 코드와 맞는지, 단계 판정(lib/escortEngine.js)이 맞는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ESCORTS, ESCORT_ORDER } from '../../escorts.js';
import {
  doneKind, STATE_KINDS, EVENT_KINDS, escortCursor, idsDoneBySignal, escortAnchor, recommendEscort, applies, anchorSelector,
} from '../../escortEngine.js';
import { PAGE_META, PAGE_SECTION, SECTIONS } from '../../tiers.js';

// ── 화면 코드에 실제로 있는 앵커·신호 (helpMode.test.js와 같은 방식) ──
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(f.name)) out.push(p);
  }
  return out;
}
const SRC = walk(path.join(process.cwd(), 'components')).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const keysOf = (attr) => new Set([...SRC.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]));
const ANCHORS = new Set([...keysOf('data-help'), ...keysOf('data-tour'), ...keysOf('tourAnchor')]);
Object.keys(PAGE_META).forEach((id) => ANCHORS.add('nav-' + id));
Object.keys(SECTIONS).forEach((k) => ANCHORS.add('pcard-' + k));
const IDS = keysOf('id');
const anchorExists = (k) => (k.startsWith('#') ? IDS.has(k.slice(1)) : ANCHORS.has(k));

const ALL = Object.values(ESCORTS);
const GO_ACTIONS = ['openAddStudent', 'openManageClasses', 'openPickStudent'];

test('메뉴 순서와 정의가 같고, 길마다 제목·설명·마침말·단계가 있다', () => {
  assert.deepEqual([...ESCORT_ORDER].sort(), Object.keys(ESCORTS).sort());
  for (const e of ALL) {
    assert.ok(e.id && e.icon && e.title && e.desc && e.finish, `${e.id} 머리 정보`);
    assert.ok(e.steps.length >= 2, `${e.id} 단계 2개 이상`);
    const ids = e.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${e.id} 단계 id 중복`);
    (e.next || []).forEach((n) => assert.ok(ESCORTS[n] && n !== e.id, `${e.id}.next '${n}'`));
  }
});

test('단계마다 안내 문구와 판정 종류가 하나 있다', () => {
  for (const e of ALL) {
    for (const s of e.steps) {
      assert.ok(s.title && s.say, `${e.id}.${s.id} 제목·안내`);
      const k = doneKind(s);
      assert.ok([...STATE_KINDS, ...EVENT_KINDS].includes(k), `${e.id}.${s.id} done 종류`);
      // 누르기·쓰기 단계는 짚을 곳이 있어야 감지할 수 있다
      if (k === 'click' || k === 'input') assert.ok(s.el, `${e.id}.${s.id} el 없음`);
    }
  }
});

test('짚는 앵커·나타남 앵커·경로 조건 앵커가 화면 코드에 실제로 있다', () => {
  for (const e of ALL) {
    for (const s of e.steps) {
      const keys = [s.el, s.done.appear, s.onlyIf?.has, s.skipIf?.has].filter(Boolean);
      keys.forEach((k) => assert.ok(anchorExists(k), `${e.id}.${s.id} 앵커 '${k}'가 화면 코드에 없음`));
    }
  }
});

test('화면 id·바로 가기·저장 신호가 실제로 있다', () => {
  const layout = fs.readFileSync(path.join(process.cwd(), 'components/layout/Layout.jsx'), 'utf8');
  for (const e of ALL) {
    for (const s of e.steps) {
      if (s.done.page) assert.ok(PAGE_META[s.done.page], `${e.id}.${s.id} 화면 '${s.done.page}'`);
      if (s.go) {
        assert.ok(GO_ACTIONS.includes(s.go.action) && s.go.label, `${e.id}.${s.id} go`);
        assert.match(layout, new RegExp(`${s.go.action}:`), `Layout guideActions에 ${s.go.action} 없음`);
      }
      if (s.done.signal) {
        assert.ok(SRC.includes(`escortSignal('${s.done.signal}')`), `${e.id}.${s.id} 신호 '${s.done.signal}'를 보내는 화면 없음`);
      }
    }
  }
});

// ── 판정 ──
const has = (...keys) => (k) => keys.includes(k);
const base = { activePage: 'home', hasClass: true, studentCount: 1, curStuId: null, has: has() };

test('상태 단계: 이미 맞으면 건너뛰고, 다시 안 맞으면 돌아간다', () => {
  const st = ESCORTS.abc.steps;
  assert.equal(escortCursor(st, [], base), 0, '학생 없음 → 학생 고르기');
  assert.equal(escortCursor(st, [], { ...base, curStuId: 1 }), 1, '학생 있음 → 화면 가기');
  assert.equal(escortCursor(st, [], { ...base, curStuId: 1, activePage: 'observe' }), 2, '화면 도착 → 쓰기');
  assert.equal(escortCursor(st, ['write'], { ...base, curStuId: 1, activePage: 'observe' }), 3, '쓰기 끝 → 저장');
  assert.equal(escortCursor(st, ['write'], { ...base, curStuId: 1, activePage: 'qabf' }), 1, '다른 화면으로 가면 화면 가기로 돌아감');
  assert.equal(escortCursor(st, ['write', 'save'], { ...base, curStuId: 1, activePage: 'observe' }), st.length, '모두 끝');
});

test('처음 시작: 반·학생이 이미 있으면 바로 학생 고르기, 고르면 끝', () => {
  const st = ESCORTS.start.steps;
  assert.equal(escortCursor(st, [], { ...base, hasClass: false, studentCount: 0 }), 0);
  assert.equal(escortCursor(st, [], { ...base, studentCount: 0 }), 1);
  assert.equal(escortCursor(st, [], base), 2);
  assert.equal(escortCursor(st, [], { ...base, curStuId: 7 }), st.length);
});

test('IEP: 경로 A는 성취기준, 경로 B는 기능 단계 — 뒤 단계가 나타났으면 앞의 선택 단계는 지나간다', () => {
  const st = ESCORTS.iep.steps;
  const on = { ...base, curStuId: 1, activePage: 'iep' };
  const idx = (id) => st.findIndex((s) => s.id === id);
  assert.equal(escortCursor(st, [], on), idx('path'), '경로 고르기');
  assert.equal(escortCursor(st, ['path'], on), idx('std'), '경로 A → 성취기준(기능 단계는 해당 없음)');
  assert.equal(escortCursor(st, ['path'], { ...on, has: has('iep-func') }), idx('func'), '경로 B → 기능');
  // 경로를 안 누르고 성취기준부터 골라 목표가 채워짐 → 월별 계획
  assert.equal(escortCursor(st, [], { ...on, has: has('iep-std-picked', '#iep-editor') }), idx('month'));
  // 저장해 둔 목표를 불러와 저장 단추가 보임 → 저장
  assert.equal(escortCursor(st, [], { ...on, has: has('iep-func', '#iep-editor', 'iep-save') }), idx('save'));
  assert.equal(applies(st[idx('std')], { has: has('iep-func') }), false);
  assert.equal(applies(st[idx('func')], { has: has() }), false);
});

test('저장 신호는 그 신호를 기다리는 단계와 앞의 사건 단계를 함께 끝낸다', () => {
  const st = ESCORTS.monitor.steps;
  assert.deepEqual(idsDoneBySignal(st, 3, 'monitor-saved'), ['write', 'save']);
  assert.deepEqual(idsDoneBySignal(st, 3, 'abc-saved'), [], '다른 길의 신호는 무시');
  assert.deepEqual(idsDoneBySignal(st, st.length, 'monitor-saved'), [], '끝난 뒤엔 무시');
});

test('짚을 곳: 단계 앵커 → 없으면 홈은 영역 카드, 그 밖은 사이드바 메뉴', () => {
  const page = ESCORTS.abc.steps.find((s) => s.id === 'page');
  assert.equal(escortAnchor(page, 'home', PAGE_SECTION, has('pcard-t3')), 'pcard-t3');
  assert.equal(escortAnchor(page, 'dash3', PAGE_SECTION, has('nav-observe')), 'nav-observe');
  assert.equal(escortAnchor(page, 'dash3', PAGE_SECTION, has()), null, '화면에 없으면 null(패널의 바로 가기로)');
  const iepPage = ESCORTS.iep.steps.find((s) => s.id === 'page');
  assert.equal(escortAnchor(iepPage, 'monitor', PAGE_SECTION, has('tb-chip-iep')), 'tb-chip-iep', '다른 영역이면 상단 영역 단추');
  assert.equal(escortAnchor(iepPage, 'dashIep', PAGE_SECTION, has('nav-iep', 'tb-chip-iep')), 'nav-iep', '같은 영역이면 메뉴');
  assert.equal(escortAnchor(ESCORTS.abc.steps[0], 'home', PAGE_SECTION), 'stu-bar');
  assert.equal(anchorSelector('#iep-editor'), '#iep-editor');
  assert.equal(anchorSelector('ob-save'), '[data-help="ob-save"],[data-tour="ob-save"]');
});

test('지금 추천: 학생 없으면 처음 시작, 화면·기록 상태 순', () => {
  const p = { activePage: 'home', pageSection: PAGE_SECTION, hasClass: true, studentCount: 2, totals: { abc: 3, mon: 4 } };
  assert.equal(recommendEscort({ ...p, studentCount: 0 }), 'start');
  assert.equal(recommendEscort({ ...p, hasClass: false }), 'start');
  assert.equal(recommendEscort({ ...p, activePage: 'observe' }), 'abc');
  assert.equal(recommendEscort({ ...p, activePage: 'monitor' }), 'monitor');
  assert.equal(recommendEscort({ ...p, activePage: 'dashIep' }), 'iep');
  assert.equal(recommendEscort({ ...p, totals: { abc: 0, mon: 0 } }), 'abc');
  assert.equal(recommendEscort({ ...p, totals: { abc: 2, mon: 0 } }), 'monitor');
  assert.equal(recommendEscort(p), null);
});

// ── 화면 투어(lib/tours.js)도 같은 방식으로 — 가리키는 대상이 화면 코드에 있어야 한다(1001 현장: 투어가 빈 카드로만 뜸) ──
import { TOURS } from '../../tours.js';
const CLASSES = new Set([...SRC.matchAll(/className=["'{`]([^"'}`]+)/g)].flatMap((m) => m[1].split(/\s+/)));
function selectorExists(sel) {
  return sel.split(',').map((x) => x.trim()).every((one) => {
    let m;
    if ((m = /^\[data-(tour|help)="([^"]+)"\]$/.exec(one))) return ANCHORS.has(m[2]);
    if ((m = /^#([\w-]+)$/.exec(one))) return IDS.has(m[1]);
    if ((m = /^\.([\w-]+)$/.exec(one))) return CLASSES.has(m[1]) || SRC.includes(m[1]);
    return false; // 그 밖의 복잡한 선택자는 쓰지 않는다
  });
}
test('투어 스텝이 가리키는 대상이 화면 코드에 실제로 있다', () => {
  const missing = [];
  for (const [page, steps] of Object.entries(TOURS)) {
    steps.forEach((s, i) => { if (s.el && !selectorExists(s.el)) missing.push(`${page} ${i + 1}/${steps.length} ${s.el}`); });
  }
  assert.deepEqual(missing, []);
});
