// mds/59 범위 밖 남은 것(1104) — 옛 IEP '③ 목표 만들기·✏ 수정' 화면 접근성 + 640x400 보안 안내 띠. 정적 검사.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const iep = read('components/pages/IepPage.jsx');
const css = read('styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('라벨 — 동사 입력은 label htmlFor로, 평가초점·평어 입력과 평어 수준 select는 aria-label', () => {
  assert.match(iep, /htmlFor=\{`\$\{uid\}-verb`\}>측정 가능한 동사/);
  assert.match(iep, /<input id=\{`\$\{uid\}-verb`\} className="form-input"[^>]*value=\{verb\}/);
  assert.match(iep, /aria-label=\{`평가초점 \$\{i \+ 1\}번째`\} value=\{f\}/);
  assert.match(iep, /aria-label=\{`평가초점 \$\{i \+ 1\}번째 삭제`\}>✕/);
  assert.match(iep, /<select className="form-input" aria-label="평어 수준"/);
  assert.match(iep, /aria-label=\{`평어 \$\{i \+ 1\}번째 문장`\} value=\{l\}/);
});

test('성취기준 고르기 칸(div)은 키보드로도 고를 수 있다', () => {
  for (const tag of ['iep-std-rec-row', 'iep-std-row']) {
    const at = iep.indexOf(`data-help="${tag}" onClick`);
    assert.ok(at > 0, tag);
    const chunk = iep.slice(at, at + 400);
    assert.match(chunk, /role="button" tabIndex=\{0\} aria-pressed=\{isOn\}/);
    assert.match(chunk, /e\.key === 'Enter' \|\| e\.key === ' '/);
  }
});

test('색·크기는 새 디자인(.kb-new) 안에서만 — 평어 생성 대비, 칩 ×·✕ 44px', () => {
  assert.match(iep, /className="btn btn-sm iep-pyeong-gen" style=\{\{ background: '#ea580c', color: '#fff' \}\}/); // 옛 사이트 모양 그대로
  assert.match(css, /\.kb-new \.content \.iep-pyeong-gen:not\(:disabled\) \{ background: var\(--kb-hint\) !important; \}/);
  assert.match(css, /--kb-hint: #c2410c;/);
  assert.match(css, /\.kb-new \.content \[data-help="iep-std-picked"\] \.qchip > button \{[^}]*width: 44px; height: 44px;/);
  assert.match(css, /\.kb-new \.content :is\(\.btn, \.btn-sm\) \{ min-width: 44px; \}/);
  assert.match(css, /\.kb-new \.content \[data-help="iep-verb-tool"\] span > button \{[^}]*min-width: 44px; min-height: 44px;/);
  // 옛 사이트용 규칙(.kb-new 없이)으로 새 클래스를 꾸미지 않는다
  const globals = read('styles/globals.css');
  assert.doesNotMatch(globals, /iep-pyeong-gen/);
  assert.doesNotMatch(css.replace(/\.kb-new[^{]*\{[^}]*\}/g, ''), /iep-pyeong-gen/);
});

test('640x400 — 높이 500px 이하에서 보안 안내 띠를 얇게(문구는 자르지 않음)', () => {
  const m = css.match(/@media \(max-height: 500px\) \{\s*\.kb-new \.sec-banner \{([^}]*)\}/);
  assert.ok(m, '낮은 화면 띠 규칙');
  assert.match(m[1], /padding-top: 4px !important; padding-bottom: 4px !important; line-height: 1\.3;/);
  assert.doesNotMatch(m[1], /text-overflow|white-space: nowrap|display: none/);
  assert.match(css, /\.kb-new \.sec-banner-x \{ margin: -4px -8px -4px 0; \}/);
});
