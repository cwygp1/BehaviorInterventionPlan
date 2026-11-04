// mds/58 E2E 2차 묶음 B(1103) — 접근성·대비·크기 수정의 정적 검사.
//   ① styles/tokens.css의 모든 규칙은 새 디자인 래퍼(.kb-new / .kb-auth) 아래에서만 — 기존 사이트(/)에 닿지 않게.
//   ② 칸 이름(label htmlFor)과 입력칸(id)을 이은 화면에서 htmlFor마다 같은 id가 있다.
//   ③ Modal 초점 되돌리기는 open 전환 때 1회만(deps [open]) — 0825 '커서가 튄다' 재발 방지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 괄호 밖 쉼표로만 나눈다(:is(a, b) 안 쉼표는 그대로).
function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// { } 짝을 따라 규칙의 선택자만 모은다. @media·@supports 안은 들어가고, @keyframes 안은 건너뛴다.
function selectorsOf(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [];
  let i = 0;
  function block(stopAtClose) {
    let buf = '';
    while (i < src.length) {
      const ch = src[i];
      if (ch === '{') {
        const head = buf.trim(); buf = ''; i += 1;
        if (/^@keyframes/.test(head)) { skip(); continue; }
        if (/^@(media|supports)/.test(head)) { block(true); continue; }
        sels.push(...splitTop(head));
        skip();
        continue;
      }
      if (ch === '}') { i += 1; if (stopAtClose) return; continue; }
      buf += ch; i += 1;
    }
  }
  function skip() { let d = 1; while (i < src.length && d > 0) { if (src[i] === '{') d += 1; if (src[i] === '}') d -= 1; i += 1; } }
  block(false);
  return sels;
}

test('① tokens.css 선택자는 모두 .kb-new·.kb-auth 아래(또는 글씨 크게·새 셸 :has 래퍼)', () => {
  const sels = selectorsOf(read('styles/tokens.css'));
  assert.ok(sels.length > 200, `선택자를 충분히 읽었다(${sels.length})`);
  const ok = /^(\.kb-new|\.kb-auth|html\[data-font="lg"\] \.kb-new|body:has\(\.app\.kb-new\))(?=$|[\s.:[>])/;
  const bad = sels.filter((s) => !ok.test(s));
  assert.deepEqual(bad, []);
});

test('① 1103 추가분 — 로그인 창 규칙은 .kb-auth(새 디자인 /new 래퍼)에서만', () => {
  const css = read('styles/tokens.css');
  assert.match(read('pages/new.js'), /className="kb-new kb-auth"/);
  assert.doesNotMatch(read('pages/index.js'), /kb-auth/); // 기존 사이트 로그인 창은 래퍼 없음
  assert.match(css, /\.kb-new \.kb-dmodes \.kb-pill\[aria-pressed="true"\]::before \{ content: ''; \}/);
});

const LABELED = [
  'components/record/BehaviorForm.jsx', 'components/pages/CrisisPage.jsx', 'components/modals/AddStudentModal.jsx',
  'components/pages/PbsSurveyPage.jsx', 'components/pages/IepReportPage.jsx', 'components/pages/ContractPage.jsx',
  'components/pages/PriorIepPage.jsx', 'components/pages/IepPage.jsx', 'components/pages/QabfPage.jsx',
];

test('② htmlFor={…}마다 같은 식의 id={…}가 같은 파일에 있다', () => {
  for (const f of LABELED) {
    const src = read(f);
    const fors = [...src.matchAll(/htmlFor=\{([^}]+)\}/g)].map((m) => m[1]);
    assert.ok(fors.length > 0, `${f}: htmlFor가 있다`);
    for (const x of fors) assert.ok(src.includes(`id={${x}}`), `${f}: htmlFor={${x}}에 맞는 id가 없다`);
    if (fors.some((x) => x.includes('uid'))) assert.match(src, /const uid = useId\(\);/, `${f}: uid = useId()`);
  }
});

test('③ Modal — 닫힐 때 초점 되돌리기는 [open] 전환 때만, 창 이름은 aria-labelledby', () => {
  const src = read('components/ui/Modal.jsx');
  const m = src.match(/useEffect\(\(\) => \{\n\s+if \(open\) return undefined;[\s\S]*?\}, \[([^\]]*)\]\);/);
  assert.ok(m, '닫힘 효과를 찾음');
  assert.equal(m[1].trim(), 'open');
  assert.match(src, /aria-labelledby=\{titleId \|\| undefined\}/);
});
