// mds/59 검증 '부분'·'새 문제' 남은 작은 문제(1104) — 정적 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('월별 계획 표 — 넓은 화면에서 최소 폭 900px 없음, 좁을 때(600px 이하)만 최소 폭', () => {
  assert.doesNotMatch(css, /table:has\(\.line-table\.compact\) \{ min-width: 900px; \}/);
  assert.match(css, /@media \(max-width: 600px\) \{\s*\.kb-new \.content table:has\(\.line-table\.compact\) \{ min-width: 600px; \}/);
  // ✕는 초점 있는 줄에서만 44px로 보이고, 아니면 화면에서만 숨긴다(화면 읽기·Tab에는 남음 — display:none 아님)
  assert.match(css, /\.line-table\.compact tr:not\(:focus-within\) \.lt-del button \{[^}]*clip-path: inset\(50%\)/);
  assert.doesNotMatch(css, /\.lt-del button \{[^}]*display: none/);
});

test('LineTable 지우기 단추 — 누를 때 글 칸 초점 유지, 이름에 칸 이름 앞머리', () => {
  const src = read('components/ui/LineTable.jsx');
  assert.match(src, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(src, /aria-label=\{`\$\{ariaLabel \? `\$\{ariaLabel\} ` : ''\}\$\{i \+ 1\}번째 줄 지우기`\}/);
});

test('IepPage — LineTable마다 칸 이름(ariaLabel)을 넘긴다', () => {
  const src = read('components/pages/IepPage.jsx');
  const tags = [...src.matchAll(/<LineTable\b[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.ok(tags.length >= 8, `LineTable ${tags.length}개`);
  for (const t of tags) assert.match(t, /ariaLabel=/, t.slice(0, 80));
});

test('aria-disabled 단추 모양·#students 안내 한 곳·Tier 2 배지·BIP 칸 이름', () => {
  assert.match(css, /\.kb-new :is\(\.kb-btn, \.kb-pill\)\[aria-disabled="true"\] \{ opacity: \.55; cursor: default; border-style: dashed; \}/);
  assert.match(read('components/workspace/NewView.jsx'), /className="kb-students-legacy"/);
  assert.match(read('components/pages/StudentsPage.jsx'), /role="alert" data-list-load-error=""/);
  assert.match(css, /\.kb-new \.kb-students-legacy \[data-list-load-error\] \{ display: none !important; \}/);
  assert.match(css, /\.iep-tier-badge\[data-tier="2"\] \{ background: var\(--kb-hint\) !important; \}/);
  const bip = read('components/pages/BipPage.jsx');
  for (const n of ['행동기능 가설', '대체 행동', 'FCT 기술', '성공 기준', '행동목표']) assert.ok(bip.includes(`aria-label="${n}"`), n);
});

test('낮은 화면(높이 500px 이하) — .kb-main 통째로 스크롤, AppShell이 그것도 되감는다', () => {
  assert.match(css, /@media \(max-height: 500px\) \{\s*\.kb-new \.kb-main \{ overflow: auto; \}/);
  const shell = read('components/layout/AppShell.jsx');
  assert.match(shell, /<main className="kb-main" ref=\{mainRef\}>/);
  assert.match(shell, /if \(mainRef\.current\) mainRef\.current\.scrollTop = 0;/);
});
