// 도움말 모드(0923) — 문구 단일 출처(lib/helpText.js)와 '다음 할 일' 고르기(lib/nextStep.js) 건전성.
// 화면 코드의 data-help/data-tour 앵커와 문구가 서로 어긋나지 않는지(빈 앵커·없는 앵커)도 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PAGE_HELP, HELP_TEXT, resolveHelp, tourTextFor, buildTodoSteps, helpSelector } from '../../helpText.js';
import { pickHelpNextStep, pickReview, anchorForPage } from '../../nextStep.js';
import { PAGE_META, PAGE_SECTION, SECTIONS } from '../../tiers.js';
import { TOURS } from '../../tours.js';
import { GLOSSARY } from '../../glossary.js';

// ── 화면 코드에 실제로 있는 앵커 ─────────────────────────────
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(f.name)) out.push(p);
  }
  return out;
}
const SRC = walk(path.join(process.cwd(), 'components')).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const staticKeys = (attr) => new Set([...SRC.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]));
const HELP_KEYS = staticKeys('data-help');
// 현황판 위젯은 객체의 help: '키' 필드를 DashGrid가 data-help로 그린다.
[...SRC.matchAll(/\bhelp: '([a-z0-9-]+)'/g)].forEach((m) => HELP_KEYS.add(m[1]));
const TOUR_KEYS = staticKeys('data-tour');
// FoldCard tourAnchor="키"는 data-tour로 그려진다.
staticKeys('tourAnchor').forEach((k) => TOUR_KEYS.add(k));
// 동적 앵커: 사이드바 메뉴 nav-<id>, 홈 영역 카드 pcard-<영역>
Object.keys(PAGE_META).forEach((id) => TOUR_KEYS.add('nav-' + id));
Object.keys(SECTIONS).forEach((k) => TOUR_KEYS.add('pcard-' + k));
const exists = (k) => HELP_KEYS.has(k) || TOUR_KEYS.has(k);

const MENU_PAGES = Object.keys(PAGE_META).filter((id) => id !== 'admin');
const GLOSSARY_IDS = new Set(GLOSSARY.map((g) => g.id));

test('메뉴에 있는 모든 화면에 한 줄 소개와 할 일 1~3개가 있다', () => {
  for (const id of MENU_PAGES) {
    const ph = PAGE_HELP[id];
    assert.ok(ph && ph.what, `PAGE_HELP.${id}.what 없음`);
    assert.ok(Array.isArray(ph.todo) && ph.todo.length >= 1 && ph.todo.length <= 3, `PAGE_HELP.${id}.todo 1~3개`);
    ph.todo.forEach((t) => assert.ok(t.title && t.desc, `PAGE_HELP.${id}.todo 제목·설명`));
  }
});

test('할 일이 가리키는 앵커는 화면 코드에 실제로 있다', () => {
  for (const [id, ph] of Object.entries(PAGE_HELP)) {
    (ph.todo || []).forEach((t) => {
      if (t.el) assert.ok(exists(t.el), `PAGE_HELP.${id}.todo el '${t.el}'이 화면 코드에 없음`);
    });
  }
});

test('화면 코드의 data-help 앵커는 모두 설명 문구가 있다', () => {
  for (const k of HELP_KEYS) {
    if (k === 'page-title') continue;
    assert.ok(HELP_TEXT[k] && HELP_TEXT[k].desc, `data-help="${k}" 문구 없음`);
  }
});

test('HELP_TEXT는 쓰이는 키만 — 화면 코드에 없는 키는 남기지 않는다', () => {
  for (const k of Object.keys(HELP_TEXT)) assert.ok(exists(k), `HELP_TEXT '${k}'를 쓰는 앵커가 화면 코드에 없음`);
});

test('목록 한 줄 문구는 "이 목록의 한 줄은"으로 시작, 호버 문구에 순서 말 없음, 용어 id는 사전에 있음', () => {
  for (const [k, v] of Object.entries(HELP_TEXT)) {
    if (/-(row|item)$/.test(k)) assert.match(v.desc, /^이 목록의 한 줄은 /, `${k}`);
    // '마지막으로 고친 때'처럼 순서가 아닌 뜻도 있어 '마지막으로'는 보지 않는다.
    assert.doesNotMatch(v.desc, /(다음은|이제 |앞 단계)/, `${k} 순서 말`);
    if (v.term) assert.ok(GLOSSARY_IDS.has(v.term), `${k} term '${v.term}'`);
  }
  for (const [id, ph] of Object.entries(PAGE_HELP)) {
    (ph.todo || []).forEach((t) => { if (t.term) assert.ok(GLOSSARY_IDS.has(t.term), `${id} todo term '${t.term}'`); });
  }
});

test('resolveHelp: HELP_TEXT가 투어 문구보다 먼저, 없으면 투어, 둘 다 없으면 null', () => {
  assert.equal(resolveHelp('review-item', 'dash3').desc, HELP_TEXT['review-item'].desc);
  // 투어에만 있는 앵커 하나를 골라 투어 문구가 나오는지
  const onlyTour = [...TOUR_KEYS].find((k) => !HELP_TEXT[k] && !k.startsWith('nav-') && tourTextFor(k, 'home'));
  if (onlyTour) assert.equal(resolveHelp(onlyTour, 'home').desc, tourTextFor(onlyTour, 'home').desc);
  assert.equal(resolveHelp('no-such-key', 'home'), null);
  assert.equal(resolveHelp('', 'home'), null);
});

test('resolveHelp: 화면 제목·사이드바 메뉴는 그 화면의 한 줄 소개', () => {
  assert.equal(resolveHelp('page-title', 'observe').desc, PAGE_HELP.observe.what);
  assert.equal(resolveHelp('nav-qabf', 'home').desc, PAGE_HELP.qabf.what);
  assert.match(resolveHelp('nav-qabf', 'home').title, /QABF/);
});

test('tourTextFor: 같은 앵커가 여러 투어에 있으면 지금 화면 투어 문구를 쓴다', () => {
  const idx = new Map();
  Object.entries(TOURS).forEach(([page, steps]) => steps.forEach((s) => {
    const m = s.el && /^\[data-tour="([^"]+)"\]$/.exec(s.el);
    if (m) idx.set(m[1], [...(idx.get(m[1]) || []), { page, desc: s.desc }]);
  }));
  const multi = [...idx.entries()].find(([, v]) => new Set(v.map((x) => x.page)).size > 1);
  if (!multi) return;
  const [key, list] = multi;
  const last = list[list.length - 1];
  assert.equal(tourTextFor(key, last.page).desc, last.desc);
});

test('buildTodoSteps: 소개 카드 1장 + 할 일마다 스포트라이트 1장', () => {
  const steps = buildTodoSteps('observe');
  assert.equal(steps.length, 1 + PAGE_HELP.observe.todo.length);
  assert.equal(steps[0].el, null);
  assert.match(steps[0].sub, /^1\. /);
  const withEl = PAGE_HELP.observe.todo.findIndex((t) => t.el);
  if (withEl >= 0) assert.equal(steps[withEl + 1].el, helpSelector(PAGE_HELP.observe.todo[withEl].el));
  assert.equal(buildTodoSteps('no-such-page'), null);
});

// ── 다음 할 일 ───────────────────────────────────────────────
const CLASS = { id: 1, name: '1반' };
const STU = [{ id: 11, code: 'A학생' }, { id: 12, code: 'B학생' }];
const base = { pageSection: PAGE_SECTION, curClass: CLASS, students: STU, curStuId: null, tier2GroupCount: 1, totals: { abc: 5, mon: 3 }, aiOn: true, dash: null, reviewers: null };

test('pickReview: 칭찬 제외 · 선택 학생 우선 · 빨강 우선', () => {
  const items = [
    { level: 'ok', text: 'ok', sid: 11 },
    { level: 'warn', text: 'w11', sid: 11 },
    { level: 'err', text: 'e12', sid: 12 },
  ];
  assert.equal(pickReview(items, null).text, 'e12');
  assert.equal(pickReview(items, 11).text, 'w11');
  assert.equal(pickReview([{ level: 'ok' }], null), null);
});

test('anchorForPage: 홈이면 영역 카드, 아니면 사이드바 메뉴', () => {
  assert.equal(anchorForPage('qabf', 'home', PAGE_SECTION), 'pcard-t3');
  assert.equal(anchorForPage('qabf', 'observe', PAGE_SECTION), 'nav-qabf');
  assert.equal(anchorForPage('calendar', 'home', PAGE_SECTION), 'nav-calendar');
});

test('다음 할 일: 반 없음 → 학급 만들기, 학생 없음 → 학생 등록', () => {
  assert.equal(pickHelpNextStep({ ...base, activePage: 'home', curClass: null }).action, 'manageClasses');
  const n = pickHelpNextStep({ ...base, activePage: 'observe', students: [] });
  assert.equal(n.action, 'addStudent');
  assert.equal(n.anchor, 'add-student');
});

test('다음 할 일: 영역 화면이면 그 영역 검토 항목을 먼저, 같은 화면이면 짚지 않는다', () => {
  const reviewers = {
    t1: () => [], t2: () => [], iep: () => [],
    t3: () => [{ level: 'err', text: 'B학생 — BIP 미작성', sub: 's', cta: 'BIP 작성', page: 'bip', sid: 12 }],
  };
  const n = pickHelpNextStep({ ...base, activePage: 'observe', dash: {}, reviewers });
  assert.equal(n.page, 'bip');
  assert.equal(n.sid, 12);
  assert.equal(n.anchor, 'nav-bip');
  assert.equal(pickHelpNextStep({ ...base, activePage: 'bip', dash: {}, reviewers }).anchor, null);
});

test('다음 할 일: 영역 밖이면 홈 배너 규칙, 학생이 선택돼 있으면 입력 화면으로 직행', () => {
  const n = pickHelpNextStep({ ...base, activePage: 'calendar', totals: { abc: 0, mon: 0 } });
  assert.equal(n.page, 'dash3');
  const d = pickHelpNextStep({ ...base, activePage: 'calendar', curStuId: 11, totals: { abc: 0, mon: 0 } });
  assert.equal(d.page, 'observe');
  assert.equal(d.anchor, 'nav-observe');
});

test('다음 할 일: 배너 규칙도 없으면 전 영역에서 빨강 먼저, 그것도 없으면 "급한 할 일 없음"', () => {
  const reviewers = {
    t1: () => [{ level: 'warn', text: 't1w', page: 'classpbs' }],
    t2: () => [],
    t3: () => [],
    iep: () => [{ level: 'err', text: 'iepE', page: 'iep', sid: 11 }],
  };
  assert.equal(pickHelpNextStep({ ...base, activePage: 'calendar', dash: {}, reviewers }).text, 'iepE');
  const none = pickHelpNextStep({ ...base, activePage: 'calendar' });
  assert.match(none.text, /급한 할 일이 없어요/);
  assert.equal(none.cta, undefined);
});
