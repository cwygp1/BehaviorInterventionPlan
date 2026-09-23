// 기본교육과정 국어 1~2학년군 교사용 지도서(국어 ①·② 합본 PDF, 822쪽) → public/data/curriculum-guide-kor12.json
//
// 배경(0923): 0922의 1단계 교과 키워드(curriculum-content.json)는 공개 학교교육과정 문서에서 뽑아
//   전부 '지도서 미대조'였다. 사용자가 교과서 본문·부록·교사용 지도서 PDF를 주어 지도서 원본으로 바꾼다.
//   지도서 PDF는 글자 층이 제목만 있고 표·본문은 안 뽑혀서 OCR을 쓴다.
//
// 사용법(PDF는 저장소 밖 06_분석문서/에 두고 커밋하지 않는다):
//   swiftc -O -o /tmp/pdf-ocr-xy scripts/pdf-ocr-xy.swift   # 좌표 붙은 OCR (x0 x1 y text)
//   swiftc -O -o /tmp/pdf-rules scripts/pdf-rules.swift     # 표 괘선(가로·세로) 찾기
//   /tmp/pdf-ocr-xy "…/국어 1~2학년군 교사용 지도서.pdf" > /tmp/guide-xy.txt    (약 6분)
//   /tmp/pdf-rules  "…/국어 1~2학년군 교사용 지도서.pdf" > /tmp/guide-rules.txt (약 1분)
//   node scripts/parse-korean-guide.mjs /tmp/guide-xy.txt /tmp/guide-rules.txt
//
// 쪽 번호: 지도서 인쇄 쪽 = PDF 쪽 + 1 (단원 지도 계획 표의 '지도서 148~151쪽' = PDF 147~150).
//
// 지도서 구조(한 권 = 준비 단원 + 1~8단원 + 책 읽기 단원, 두 권이 합본):
//   단원 시작 쪽: 큰 단원 번호 + 교과서 펼침면 + '단원의 개관'(책 읽기는 '책 읽기 단원 설정의 배경')
//   → 성취기준(주요/관련 표) → 단원 목표 → 단원 연계 → 가정 및 생활과의 연계 → 단원 지도 계획(표:
//     구분·차시·차시명·차시별 학습 내용·쪽수·전자책등 유형) → 단원 지도 중점 → 단원 평가(표: 구분·평가 내용·
//     평가 준거) → 지도상의 유의점 → 핵심 어휘(그림 낱말)
//   차시 쪽(왼쪽 면 왼 단): 학습 목표 · 지도 중점 · 지도상의 유의점 · 교수·학습 자료 · 교수·학습 개요(도입/전개/정리)
//     + 뒤 쪽들에 [활동 N] 제목, '평가를 위한 참고 자료'(평가 내용·평가 준거 표).
// 표는 괘선 좌표로 행·열을 나누고(구분 열처럼 병합된 칸은 괘선이 안 지나가는 것으로 안다) OCR 줄을 칸에 넣는다.

import fs from 'fs';
import path from 'path';

const [xyPath, rulesPath] = process.argv.slice(2);
if (!xyPath || !rulesPath) { console.error('usage: node scripts/parse-korean-guide.mjs <guide-xy.txt> <guide-rules.txt>'); process.exit(1); }
const OUT = path.join(process.cwd(), 'public/data/curriculum-guide-kor12.json');
const STANDARDS = path.join(process.cwd(), 'public/data/achievement-standards.json');

const stdRows = JSON.parse(fs.readFileSync(STANDARDS, 'utf8')).rows;
const STD_TEXT = new Map(stdRows.map((r) => [r[3], r[4]]));

// ---------- 입력 읽기 ----------
const pages = new Map(); // n → { lines:[{x0,x1,y,t}], h:[{x0,x1,y,thick}], v:[{x,y0,y1,thick}] }
const page = (n) => { if (!pages.has(n)) pages.set(n, { lines: [], h: [], v: [] }); return pages.get(n); };
{
  let n = 0;
  for (const raw of fs.readFileSync(xyPath, 'utf8').split('\n')) {
    const m = raw.match(/^===== p(\d+) =====/);
    if (m) { n = +m[1]; continue; }
    const f = raw.split('\t'); if (f.length < 4 || !n) continue;
    const t = f.slice(3).join('\t').trim(); if (!t) continue;
    page(n).lines.push({ x0: +f[0], x1: +f[1], y: +f[2], t });
  }
  n = 0;
  for (const raw of fs.readFileSync(rulesPath, 'utf8').split('\n')) {
    const m = raw.match(/^===== p(\d+) =====/);
    if (m) { n = +m[1]; continue; }
    const f = raw.split('\t'); if (!n) continue;
    if (f[0] === 'V' && f.length >= 5) page(n).v.push({ x: +f[1], y0: +f[2], y1: +f[3], thick: +f[4] });
    else if (f.length >= 4) page(n).h.push({ x0: +f[0], x1: +f[1], y: +f[2], thick: +f[3] });
  }
}
const PAGE_H_PX = 1684; // A4 842pt × 2 (pdf-rules.swift scale 2) — 두께(px)를 비율로 바꿀 때

// ---------- 글자 다루기 ----------
const norm = (s) => String(s || '').replace(/\s+/g, '');
const key = (s) => norm(s).replace(/[^가-힣]/g, '');
const BULLET = /^[•·‧▪▸◦●○◎\-–]\s*/;
const MARK = /^[•·‧▪▸◦●○◎0°OoQ@)]\s*/; // ◎ 표시가 OCR에서 0·°·O 등으로 나옴
const PARTICLE_END = /[은는이가을를에의와과로도고며서게다요]$/; // 이 글자로 끝난 줄은 낱말 경계일 가능성이 높아 띄어 잇는다
const stripBullet = (t) => t.replace(BULLET, '').replace(/^'(?=.*[」』])/, '「').trim(); // "•'진짜 내 소원」" → 「진짜 내 소원」
const stripMark = (t) => t.replace(MARK, '').trim();
const isBullet = (t) => BULLET.test(t) || /^•'/.test(t);
const CODE_RE = /\[?\s*2\s*국\s*어?\s*(\d\d)\s*-\s*(\d\d)\s*\]?/g; // OCR이 "[2국 01-01]"처럼 깨져도 잡는다
const codesIn = (t) => { const out = []; for (const m of String(t).matchAll(CODE_RE)) out.push(`2국어${m[1]}-${m[2]}`); return [...new Set(out)]; };
const fixText = (t) => String(t)
  .replace(/[『「]\s*/g, (m) => m.trim()).replace(/\s*[』」]/g, (m) => m.trim())
  .replace(/'([^'」』]+)[」』]/g, '「$1」').replace(/`/g, '\'')
  .replace(/「([^「」『』]+)』/g, '「$1」').replace(/『([^「」『』]+)」/g, '『$1』') // 여닫는 괄호 짝 맞추기
  .replace(/불임딱지/g, '붙임딱지').replace(/PP[IT]T/g, 'PPT').replace(/실전/g, '실천')
  .replace(/[•·]{2,}|\.{3}/g, '…').replace(/^[,.\s'"]+(?=[가-힣「『\[])/, '')
  .replace(/\s+/g, ' ').trim();

/** 줄 여러 개를 문단으로: 글머리표(•)로 항목을 나누고, 줄이 칸 오른쪽 끝까지 찼으면 낱말이 잘린 것으로 보고 붙여 쓴다. */
function joinItems(lines, right, { bullets = true, centered = false } = {}) {
  const items = [];
  let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = l.t.trim(); if (!t) continue;
    if (!cur || (bullets && isBullet(t))) { if (cur) items.push(cur); cur = bullets ? stripBullet(t) : t; }
    else {
      const full = !centered && right != null && prevX1 >= right - 0.013 && !PARTICLE_END.test(cur);
      cur += (full ? '' : ' ') + t;
    }
    prevX1 = l.x1;
  }
  if (cur) items.push(cur);
  return items.map(fixText).filter(Boolean);
}

// ---------- 표 격자 ----------
/**
 * 쪽의 [yTop, yBottom] 사이에서 표를 찾아 행·열로 나눈다. xRange를 주면 그 안의 괘선만 본다(차시 쪽의 반쪽 표).
 * 반환: { rows:[{y0,y1,cells:[{lines,text,items,region}]}], cols:[x…], header:{y0,y1,labels[]} }
 */
function grid(p, yTop, yBottom, xRange) {
  const inX = (r) => !xRange || (r.x0 >= xRange[0] - 0.02 && r.x1 <= xRange[1] + 0.02);
  const H = p.h.filter((r) => r.y > yTop && r.y < yBottom && inX(r) && (r.x1 - r.x0) >= 0.15);
  if (!H.length) return null;
  const wide = H.reduce((a, r) => ((r.x1 - r.x0) > (a.x1 - a.x0) ? r : a));
  const tx0 = wide.x0, tx1 = wide.x1, tw = tx1 - tx0;
  const inTable = (r) => r.x0 >= tx0 - 0.02 && r.x1 <= tx1 + 0.02;
  // 머리띠: 위쪽의 두꺼운 조각들(흰 글자 사이로 끊긴다). 얇은 괘선 = 행 경계.
  const thick = H.filter((r) => r.thick >= 4 && inTable(r));
  const thin = H.filter((r) => r.thick <= 3 && inTable(r) && (r.x1 - r.x0) >= 0.5 * tw).sort((a, b) => a.y - b.y);
  let header = null;
  if (thick.length) {
    const top = thick.filter((r) => r.y < (thin[0]?.y ?? yBottom));
    if (top.length) header = { y0: Math.min(...top.map((r) => r.y - r.thick / 2 / PAGE_H_PX)), y1: Math.max(...top.map((r) => r.y + r.thick / 2 / PAGE_H_PX)) };
  }
  const HEADER_WORDS = new Set(['구분', '차시', '차시명', '차시별학습내용', '차시별학습(내용)', '쪽수', '쪽', '교과서', '지도서', '교과서지도서', '전자책등', '유형', '평가내용', '평가준거', '성취기준', '관련성취기준', '문학요소', '관련', '단원', '관련단원', '평가요소', '내용', '기능']);
  const isHeaderWord = (l) => HEADER_WORDS.has(norm(l.t));
  const firstThin = thin[0]?.y ?? yBottom;
  if (!header) {
    const hw = p.lines.filter((l) => isHeaderWord(l) && l.y > yTop && l.y < firstThin && (l.x0 + l.x1) / 2 > tx0 && (l.x0 + l.x1) / 2 < tx1);
    if (hw.length >= 2) header = { y0: Math.min(...hw.map((l) => l.y)) - 0.012, y1: Math.max(...hw.map((l) => l.y)) + 0.008 };
  } else {
    const hw = p.lines.filter((l) => isHeaderWord(l) && l.y >= header.y0 && l.y < Math.min(header.y1 + 0.035, firstThin) && (l.x0 + l.x1) / 2 > tx0 && (l.x0 + l.x1) / 2 < tx1);
    if (hw.length) header.y1 = Math.max(header.y1, ...hw.map((l) => l.y + 0.008));
  }
  const bounds = [];
  if (header) bounds.push(header.y1);
  else if (thin.length) {
    // 쪽을 넘겨 이어지는 표: 머리띠 없이 첫 행이 쪽 위에서 바로 시작하고 위쪽 괘선이 안 잡힐 수 있다 → 첫 괘선 위에 글자가 있으면 그 위를 경계로.
    const above = p.lines.filter((l) => l.y > yTop && l.y < thin[0].y - 0.004 && (l.x0 + l.x1) / 2 > tx0 && (l.x0 + l.x1) / 2 < tx1);
    if (above.length) bounds.push(Math.max(yTop, Math.min(...above.map((l) => l.y)) - 0.012));
  }
  for (const r of thin) if (!bounds.length || r.y - bounds[bounds.length - 1] > 0.008) bounds.push(r.y);
  if (bounds.length < 2) return null;
  const y0 = header ? header.y0 : bounds[0], y1 = bounds[bounds.length - 1];
  const th = y1 - y0;
  const vs = p.v.filter((v) => v.x > tx0 + 0.01 && v.x < tx1 - 0.01 && Math.min(v.y1, y1) - Math.max(v.y0, y0) >= 0.6 * th).map((v) => v.x).sort((a, b) => a - b);
  const cols = [tx0];
  for (const x of vs) if (x - cols[cols.length - 1] > 0.012) cols.push(x);
  cols.push(tx1);
  const nC = cols.length - 1;
  const rows = [];
  for (let i = 0; i + 1 < bounds.length; i++) rows.push({ y0: bounds[i], y1: bounds[i + 1], cells: Array.from({ length: nC }, () => ({ lines: [] })) });
  for (const l of p.lines) {
    if (l.y < bounds[0] || l.y > y1) continue;
    if (isHeaderWord(l)) continue; // 첫 행에 섞여 든 머리 글자
    const xc = (l.x0 + l.x1) / 2; if (xc < tx0 || xc > tx1) continue;
    const ri = rows.findIndex((r) => l.y >= r.y0 && l.y < r.y1); if (ri < 0) continue;
    let ci = cols.findIndex((x, i) => i < nC && xc >= x && xc < cols[i + 1]); if (ci < 0) ci = nC - 1;
    rows[ri].cells[ci].lines.push(l);
  }
  // 병합 칸: 행 경계 괘선이 그 열을 지나가지 않으면 위 행과 같은 영역.
  for (let c = 0; c < nC; c++) {
    const cl = cols[c], cr = cols[c + 1];
    let region = 0;
    for (let r = 0; r < rows.length; r++) {
      if (r > 0) {
        const rule = thin.find((t) => Math.abs(t.y - rows[r].y0) < 0.004);
        const crosses = rule && rule.x0 <= cl + 0.012 && rule.x1 >= cr - 0.012;
        if (crosses) region = r;
      }
      rows[r].cells[c].region = region;
    }
    for (let r = 0; r < rows.length; r++) {
      const reg = rows[r].cells[c].region;
      const lines = rows.filter((row) => row.cells[c].region === reg).flatMap((row) => row.cells[c].lines);
      const cell = rows[r].cells[c];
      cell.regionText = joinItems(lines, cr, { bullets: false, centered: true }).join(' ');
      cell.text = joinItems(cell.lines, cr, { bullets: false, centered: true }).join(' ');
      cell.items = joinItems(cell.lines, cr, { bullets: true });
    }
  }
  const labels = header ? p.lines.filter((l) => l.y >= header.y0 - 0.01 && l.y <= header.y1 + 0.01 && (l.x0 + l.x1) / 2 >= tx0 && (l.x0 + l.x1) / 2 <= tx1).map((l) => l.t) : [];
  return { rows, cols, header: header ? { ...header, labels } : null, x0: tx0, x1: tx1, y0, y1 };
}

// 디버그: DEBUG_GRID="쪽,yTop,yBottom[,x0,x1]" 로 표 하나를 찍어 본다.
if (process.env.DEBUG_GRID) {
  const [n, a, b, x0, x1] = process.env.DEBUG_GRID.split(',').map(Number);
  const g = grid(page(n), a, b, x0 != null && !Number.isNaN(x0) ? [x0, x1] : undefined);
  if (!g) { console.log('no grid'); process.exit(0); }
  console.log('cols', g.cols.map((x) => x.toFixed(3)).join(' '), 'header', g.header && g.header.labels.join('|'), 'y', g.y0.toFixed(3), g.y1.toFixed(3));
  g.rows.forEach((r, i) => console.log(`row${i} [${r.y0.toFixed(3)}-${r.y1.toFixed(3)}]`, r.cells.map((c) => `{${c.region}:${c.items.join(' / ')}}`).join(' | ')));
  process.exit(0);
}

// ---------- 단원 찾기 ----------
const HEADINGS = new Set(['단원의개관', '핵심역량', '성취기준', '단원목표', '단원지도목표', '단원연계', '가정및생활과의연계', '단원지도계획', '단원지도중점', '단원평가', '지도상의유의점', '핵심어휘', '참고자료', '책읽기단원설정의배경']);
const isHeading = (l) => HEADINGS.has(key(l.t)) && l.x0 < 0.27 && (l.x1 - l.x0) < 0.3;

const unitStarts = [];
for (const [n, p] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
  // 단원 시작 쪽의 '단원의 개관' 알약은 큰 번호 띠 옆(x≈0.29~0.33)에 있고, 앞부분 안내문의 같은 글귀는 더 왼쪽(0.23)에 있다.
  if (p.lines.some((l) => ['단원의개관', '책읽기단원설정의배경'].includes(key(l.t)) && l.x0 >= 0.28 && l.x0 <= 0.36)) unitStarts.push(n);
}
if (unitStarts.length !== 20) console.warn(`단원 시작 쪽 ${unitStarts.length}개(20개 기대): ${unitStarts.join(' ')}`);

const footerTitle = (n) => {
  for (const l of page(n).lines) {
    const m = l.t.match(/^(준비|책\s*읽기|\d{1,2})[.,．]\s*(.+?)\s*[|ㅣI]?\s*\d{2,3}\s*$/);
    if (m && l.y > 0.9) return { no: m[1].replace(/\s/g, ' ').trim(), title: fixText(m[2]) };
  }
  return null;
};

function sectionsOf(pageNos) {
  // (쪽, y, 제목) 순서 목록 → 각 구간의 줄들
  const heads = [];
  for (const n of pageNos) for (const l of page(n).lines) if (isHeading(l)) heads.push({ n, y: l.y, name: key(l.t) });
  const secs = [];
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i], nx = heads[i + 1];
    const lines = [];
    for (const n of pageNos) {
      if (n < h.n || (nx && n > nx.n)) continue;
      for (const l of page(n).lines) {
        if (n === h.n && l.y <= h.y + 0.004) continue;
        if (nx && n === nx.n && l.y >= nx.y - 0.004) continue;
        if (l.y > 0.945) continue; // 꼬리말
        lines.push({ ...l, n });
      }
    }
    secs.push({ ...h, end: nx ? { n: nx.n, y: nx.y } : null, lines });
  }
  return secs;
}
const bulletsOf = (lines) => { const right = Math.max(...lines.map((l) => l.x1), 0) ; return joinItems(lines, right + 0.007, { bullets: true }).filter((t) => t.length > 1); };

// ---------- 차시 쪽 ----------
const LESSON_LABELS = new Set(['학습목표', '지도중점', '교수학습중점요소', '지도상의유의점', '교수학습자료', '교수학습개요', '평가중점', '평가요소', '교수활동', '교수학습활동', '평가방법']);
function parseLessonPage(n) {
  const p = page(n); if (!p) return {};
  // 준비 단원 차시 쪽은 왼 단 아래로 본문([활동 1]…)이 이어지므로, 왼쪽에 짧게 나온 '[활동 N]' 제목에서 끊는다.
  const cut = Math.min(0.945, ...p.lines.filter((l) => /^\[활동\s*\d+\]/.test(l.t) && l.x0 < 0.47 && (l.x1 - l.x0) < 0.25).map((l) => l.y));
  const left = p.lines.filter((l) => l.x0 < 0.47 && l.x1 < 0.5 && l.y < cut);
  const labels = left.filter((l) => LESSON_LABELS.has(key(l.t)) && (l.x1 - l.x0) < 0.22).sort((a, b) => a.y - b.y);
  const out = {};
  const between = (a, b) => left.filter((l) => l.y > a.y + 0.004 && (!b || l.y < b.y - 0.004) && !labels.includes(l));
  labels.forEach((lab, i) => {
    const k = key(lab.t), body = between(lab, labels[i + 1]);
    if (k === '학습목표') { out.goal = splitMarked(body, 0.44)[0] || ''; if (/다$/.test(out.goal)) out.goal += '.'; } // OCR이 마침표를 놓치기도 함
    else if (k === '평가중점') out.focus = splitMarked(body, 0.44).join(' ');
    else if (k === '지도중점') out.focus = splitMarked(body, 0.44).join(' ');
    else if (k === '교수학습중점요소') out.focus = joinItems(body.filter((l) => l.x0 < 0.24), 0.24, { bullets: true }).join(' · ');
    else if (k === '지도상의유의점') out.notes = splitMarked(body, 0.44);
    else if (k === '교수학습자료') out.materials = splitMarked(body, 0.44).join(' ');
    else if (k === '교수학습개요') Object.assign(out, parseOutline(body));
  });
  return out;
}
/** ◎ 표시(0·°·O로 읽힘)로 항목을 나눈다. */
function splitMarked(lines, right) {
  const items = []; let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = l.t.trim();
    const marked = (MARK.test(t) && l.x0 < 0.075) || l.x0 < 0.058;
    if (!cur || marked) { if (cur) items.push(cur); cur = stripMark(t); }
    else cur += (prevX1 >= right - 0.013 && !PARTICLE_END.test(cur) ? '' : ' ') + t;
    prevX1 = l.x1;
  }
  if (cur) items.push(cur);
  return items.map(fixText).filter(Boolean);
}
/** 교수·학습 개요: 도입/전개/정리 표. 표 글자(이름표)는 칸 세로 가운데 → 가운데 맞춤으로 줄 수를 정한다. */
function parseOutline(lines0) {
  const lines = [];
  for (const l of lines0) {
    const m = l.t.match(/^(도입|전개|정리)\s*[•·‧▪▸]?\s*(.+)$/);
    if (m && l.x0 < 0.1) { lines.push({ ...l, t: m[1], x1: l.x0 + 0.03 }); lines.push({ ...l, t: '• ' + m[2], x0: 0.105 }); }
    else lines.push(l);
  }
  const labs = lines.filter((l) => ['도입', '전개', '정리'].includes(norm(l.t)) && l.x0 < 0.1).sort((a, b) => a.y - b.y);
  const items = lines.filter((l) => !labs.includes(l) && l.x0 >= 0.09).sort((a, b) => a.y - b.y);
  const out = { intro: [], activities: [], wrapup: [] };
  let i = 0;
  labs.forEach((lab, k) => {
    const keyName = norm(lab.t) === '도입' ? 'intro' : norm(lab.t) === '전개' ? 'activities' : 'wrapup';
    let best = null;
    if (k === labs.length - 1) best = items.length - i;
    else {
      for (let nn = 1; nn <= 8 && i + nn <= items.length; nn++) {
        const mean = items.slice(i, i + nn).reduce((s, l) => s + l.y, 0) / nn;
        const err = Math.abs(mean - lab.y);
        if (best == null || err < best.err) best = { n: nn, err };
      }
      best = best ? best.n : 0;
    }
    out[keyName] = joinItems(items.slice(i, i + best), 0.44, { bullets: true });
    i += best;
  });
  return out;
}
function evalRefs(pageNos) {
  const out = [];
  for (const n of pageNos) {
    const p = page(n);
    for (const lab of p.lines.filter((l) => key(l.t) === '평가를위한참고자료')) {
      const half = lab.x0 < 0.5 ? [0.04, 0.49] : [0.49, 0.96];
      const g = grid(p, lab.y + 0.005, 0.95, half);
      if (!g || g.cols.length - 1 < 2) continue;
      for (const r of g.rows) {
        const content = r.cells[0].regionText;
        const crit = criteriaOf(r.cells[g.cols.length - 2].lines, g.cols[g.cols.length - 1]);
        if (content && crit.length) out.push({ content, criteria: crit });
      }
    }
  }
  return out;
}
/** 평가 준거 칸: 문장 끝(.)에서 항목을 나눈다(줄바꿈된 문장은 잇는다). */
function criteriaOf(lines, right) {
  const items = []; let cur = '', prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = stripBullet(l.t.trim());
    cur = cur ? cur + (prevX1 >= right - 0.013 && !PARTICLE_END.test(cur) ? '' : ' ') + t : t;
    prevX1 = l.x1;
    if (/[.?]$/.test(t)) { items.push(fixText(cur)); cur = ''; }
  }
  if (cur) items.push(fixText(cur));
  return items.filter(Boolean);
}
const pageRange = (s) => { const m = String(s || '').replace(/\s/g, '').match(/(\d+)(?:~(\d+))?/); if (!m) return null; const a = +m[1], b = +(m[2] || m[1]); return [a, b >= a && b - a < 12 ? b : a + 1]; }; // 책 읽기 표는 교과서·지도서 쪽이 섞여 나오기도 함
// OCR이 아예 놓친 글자(그림 위 제목 등) — 지도서 원본과 대조해 손으로 채운 것.
const OVERRIDES = {
  '1-책 읽기': { '2~3': { title: '「비가 오는 날에…」 읽기' } },
  '2-책 읽기': { '9~10': { title: '발표회에서 이야기 속 동물 표현하기' } },
};

// ---------- 단원 파싱 ----------
const books = [{ book: '국어 ①', key: 1, units: [] }, { book: '국어 ②', key: 2, units: [] }];
const warnings = [];
unitStarts.forEach((start, idx) => {
  const end = (unitStarts[idx + 1] || pages.size + 1) - 1;
  const bookIdx = idx < 10 ? 0 : 1;
  const ft = [...Array(Math.min(12, end - start + 1)).keys()].map((i) => footerTitle(start + i)).find(Boolean);
  let offset = bookIdx === 0 ? 1 : 2;
  for (let n = start; n <= start + 4; n++) {
    const f = page(n).lines.find((l) => l.y > 0.94 && /^\d{2,3}\s*[|ㅣI]|[|ㅣI]\s*\d{2,3}\s*$/.test(l.t));
    if (f) { const m = f.t.match(/(\d{2,3})/); if (m) { offset = +m[1] - n; break; } } // offset = 인쇄 쪽 − PDF 쪽
  }
  const unitNo = ft ? ft.no : (idx % 10 === 0 ? '준비' : idx % 10 === 9 ? '책 읽기' : String(idx % 10));
  const unit = { no: unitNo, title: ft ? ft.title : '', id: `${bookIdx + 1}-${unitNo}`, guidePage: start + offset, standards: { primary: [], related: [] }, goals: [], lessons: [], evaluation: [], vocabulary: [], teachingPoints: [], cautions: [] };
  const isBook = unitNo === '책 읽기', isPrep = unitNo === '준비';

  // 개관 쪽 범위: 단원 시작부터 '단원 지도 계획' 표 뒤 몇 쪽(핵심 어휘까지). 차시 쪽은 표의 지도서 쪽수로 정한다.
  const overview = [...Array(Math.min(14, end - start + 1)).keys()].map((i) => start + i);
  const secs = sectionsOf(overview);
  const sec = (name) => secs.find((s) => s.name === name);

  // 성취기준 표(주요/관련)
  const st = sec('성취기준');
  if (st) {
    const g = grid(page(st.n), st.y + 0.015, st.end && st.end.n === st.n ? st.end.y : 0.95);
    // 주요/관련 이름표는 자기 행의 세로 가운데에 있으니, 코드 줄마다 더 가까운 이름표를 고른다(구분 열 세로선이 안 잡혀도 됨).
    const secLines = st.lines.filter((l) => l.n === st.n);
    const yP = secLines.find((l) => norm(l.t) === '주요')?.y, yR = secLines.find((l) => norm(l.t) === '관련')?.y;
    for (const l of secLines) {
      const codes = codesIn(l.t); if (!codes.length) continue;
      const toP = yP != null ? Math.abs(l.y - yP) : Infinity, toR = yR != null ? Math.abs(l.y - yR) : Infinity;
      if (toP === Infinity && toR === Infinity) continue;
      unit.standards[toP <= toR ? 'primary' : 'related'].push(...codes);
    }
    void g;
    if (!unit.standards.primary.length) {
      const codes = codesIn(st.lines.map((l) => l.t).join(' '));
      if (codes.length) { unit.standards.primary.push(codes[0]); unit.standards.related.push(...codes.slice(1)); warnings.push(`${unit.id} 성취기준 표 못 읽어 순서로 나눔`); }
    }
  }
  // 단원 목표
  const goalSec = sec('단원목표') || sec('단원지도목표');
  if (goalSec) unit.goals = bulletsOf(goalSec.lines.filter((l) => l.x0 < 0.3 || isBullet(l.t) || true));
  const tp = sec('단원지도중점'); if (tp) unit.teachingPoints = bulletsOf(tp.lines);
  const ca = sec('지도상의유의점'); if (ca) unit.cautions = bulletsOf(ca.lines);
  // 핵심 어휘: 그림 아래 짧은 낱말
  const vo = sec('핵심어휘');
  if (vo) unit.vocabulary = vo.lines.filter((l) => l.n === vo.n && !isBullet(l.t) && l.t.length <= 12 && (l.x1 - l.x0) < 0.2 && l.x0 > 0.14).map((l) => fixText(l.t)).filter((t) => t && !/^\d+$/.test(t) && !/[.쪽]$|교수|학습의 실제|성취기준|참고/.test(t));

  // 단원 지도 계획 표(쪽을 넘길 수 있음)
  const pl = sec('단원지도계획');
  const planRows = [];
  if (pl) {
    const pgs = [pl.n]; if (pl.end && pl.end.n !== pl.n) for (let n = pl.n + 1; n <= pl.end.n; n++) pgs.push(n);
    for (const n of pgs) {
      const g = grid(page(n), n === pl.n ? pl.y + 0.015 : 0.05, pl.end && pl.end.n === n ? pl.end.y : 0.95);
      if (!g) continue;
      const nC = g.cols.length - 1;
      const hl = g.header ? g.header.labels.map(norm).join('') : '';
      if (g.header && !/차시/.test(hl)) continue; // 다른 표
      // 단계 이름('실천 13~14'처럼 차시 번호와 한 줄로 읽혀 차시 칸에 들어간 것 포함)을 병합 영역별로 모아 둔다.
      const regionStage = {};
      for (const r of g.rows) {
        const reg = r.cells[0].region;
        const w = stageName(r.cells[0].regionText) || (norm(r.cells[1]?.text || '').match(/기초|기본|실천|실전|정리/) || [''])[0];
        if (w && !regionStage[reg]) regionStage[reg] = stageName(w);
      }
      for (const r of g.rows) {
        const c = r.cells;
        let row;
        if (isBook && nC >= 8) row = { stage: c[0].regionText, no: c[1].text, title: c[2].text, literary: c[3].items, codes: codesIn(c[4].regionText || c[4].text), contents: c[5].items, bookPages: c[6].text, guidePages: c[7].text, relatedUnits: c[8]?.regionText };
        else if (isPrep && nC <= 5) row = { stage: '진단', no: c[0].text, title: c[1].text, contents: c[2].items, bookPages: c[3]?.text, guidePages: c[4]?.text };
        else if (nC >= 6) row = { stage: c[0].regionText, no: c[1].text, title: c[2].text, contents: c[3].items, bookPages: c[4].text, guidePages: c[5].text, media: c[6]?.text };
        else { warnings.push(`${unit.id} 지도 계획 표 열 ${nC}개 — p${n}`); continue; }
        // '기본 9~10'처럼 구분·차시가 한 줄로 읽혀 구분 칸에 들어간 경우 → 차시 번호를 거기서 꺼낸다.
        if (!/\d/.test(row.no || '') && c[0]) { const m = norm(c[0].text).match(/\d+(?:[~〜∼]\d+)?/); if (m) row.no = m[0]; }
        // (a) '15~16 몸짓으로 마음'처럼 차시 번호가 차시명 줄 앞에 붙어 읽힌 경우 → 번호를 떼어 낸다.
        if (!/\d/.test(row.no || '')) {
          const tc = isBook || !isPrep ? c[2] : c[1];
          const hit = (tc?.lines || []).find((l) => /^\d+(?:[~〜∼]\d+)?\s+\S/.test(l.t) && l.x0 < g.cols[isPrep ? 1 : 2]);
          if (hit) { row.no = hit.t.match(/^\d+(?:[~〜∼]\d+)?/)[0]; row.title = fixText(tc.text.replace(hit.t.match(/^\d+(?:[~〜∼]\d+)?/)[0], '')); }
        }
        if (!isPrep) row.stage = regionStage[c[0].region] || row.stage;
        if (!row.title) continue;
        if (!/\d/.test(row.no || '')) { if (!row.contents?.length) continue; row.no = '?'; } // 번호를 OCR이 놓친 행(②-4 11차시) — 아래에서 이웃 번호로 채운다
        if (!norm(row.stage)) { const m = norm(row.no || '').match(/기초|기본|실천|실전|정리/); if (m) row.stage = m[0]; }
        row.no = (norm(row.no).match(/\d+(?:[~〜∼]\d+)?/) || [''])[0].replace(/[~〜∼]/g, '~');
        for (const k of ['bookPages', 'guidePages']) if (row[k]) {
          row[k] = (norm(row[k]).match(/\d+(?:[~〜∼]\d+)?/) || [''])[0].replace(/[〜∼]/g, '~');
          const m6 = row[k].match(/^(\d{2,3})(\d{2,3})$/); if (m6 && +m6[2] > +m6[1]) row[k] = `${m6[1]}~${m6[2]}`; // '~'가 OCR에서 빠진 것
        }
        if (row.media) row.media = norm(row.media).replace(/^유형/, '');
        row.stage = stageName(row.stage) || (planRows.length ? planRows[planRows.length - 1].stage : '');
        planRows.push(row);
      }
    }
  }
  planRows.forEach((r, i) => {
    if (/\d/.test(r.no)) return; // '?'는 뒤의 숫자 추출에서 ''가 된다
    const prev = i > 0 ? +(planRows[i - 1].no.match(/\d+$/) || [0])[0] : 0;
    const nextRow = planRows.slice(i + 1).find((x) => /\d/.test(x.no));
    const next = nextRow ? +nextRow.no.match(/^\d+/)[0] : prev + 2;
    r.no = next - prev === 2 ? String(prev + 1) : `${prev + 1}~${next - 1}`;
    warnings.push(`${unit.id} 차시 번호 없는 행 → ${r.no} '${r.title}'로 추정`);
  });
  if (!planRows.length) warnings.push(`${unit.id} '${unit.title}' 지도 계획 표 없음`);

  // 단원 평가 표
  const ev = sec('단원평가');
  if (ev && !isPrep) {
    const pgs = [ev.n]; if (ev.end && ev.end.n !== ev.n) for (let n = ev.n + 1; n <= ev.end.n; n++) pgs.push(n);
    for (const n of pgs) {
      const g = grid(page(n), n === ev.n ? ev.y + 0.015 : 0.05, ev.end && ev.end.n === n ? ev.end.y : 0.95);
      if (!g) continue;
      const nC = g.cols.length - 1;
      const hl = g.header ? g.header.labels.map(norm).join('') : '';
      if (g.header && !/평가/.test(hl)) continue;
      for (const r of g.rows) {
        const c = r.cells;
        const stage = stageName(c[0].regionText);
        if (isBook && nC >= 5) unit.evaluation.push({ stage, codes: codesIn(c[1].regionText || c[1].text), content: c[2].items.join(' / ') || c[2].text, skill: c[3].items.join(' / ') || c[3].text, criteria: criteriaOf(c[4].lines, g.cols[5]) });
        else if (nC >= 3) {
          // 한 행에 평가 내용이 둘(점선으로 나뉜 하위 행)이면 줄 간격으로 가른다.
          const groups = splitByGap(c[1].lines);
          const crit = c[nC - 1].lines;
          groups.forEach((gl, gi) => {
            const mine = groups.length === 1 ? crit : crit.filter((l) => {
              const d = groups.map((og) => Math.abs(og.reduce((s, x) => s + x.y, 0) / og.length - l.y));
              return d.indexOf(Math.min(...d)) === gi;
            });
            unit.evaluation.push({ stage, content: joinItems(gl, g.cols[2], { bullets: false, centered: true }).join(' '), criteria: criteriaOf(mine, g.cols[nC]) });
          });
        }
      }
    }
  }
  // 차시 쪽
  for (const r of planRows) {
    const gp = pageRange(r.guidePages);
    const lesson = { stage: r.stage, no: r.no, title: r.title, contents: r.contents, bookPages: norm(r.bookPages || '').replace(/[~〜∼]/g, '~'), guidePages: norm(r.guidePages || '').replace(/[~〜∼]/g, '~') };
    if (r.media) lesson.media = norm(r.media).replace(/,/g, ', ').replace(/PP[TI]T?/g, 'PPT');
    if (r.literary) lesson.literary = r.literary;
    if (r.codes) lesson.codes = r.codes;
    if (r.relatedUnits) lesson.relatedUnits = fixText(r.relatedUnits);
    if (gp) {
      const pdf = [gp[0] - offset, gp[1] - offset];
      if (pdf[0] >= start && pdf[1] <= end + 1) {
        Object.assign(lesson, parseLessonPage(pdf[0]));
        const pgs = []; for (let n = pdf[0]; n <= pdf[1]; n++) pgs.push(n);
        const heads = [];
        for (const n of pgs) for (const l of page(n).lines) { const m = l.t.match(/^\[활동\s*(\d+)\]\s*(.+)$/); if (m && m[2].length <= 30 && (l.x1 - l.x0) < 0.36) heads.push({ n, col: l.x0 < 0.5 ? 0 : 1, y: l.y, k: +m[1], t: fixText(m[2]) }); }
        heads.sort((a, b) => a.k - b.k);
        if (heads.length) lesson.activityHeads = [...new Map(heads.map((h) => [h.k, h.t])).values()];
        lesson.evalRefs = evalRefs(pgs);
        if (!(lesson.activities || []).length && lesson.activityHeads) {
          lesson.activities = lesson.activityHeads;
          const has = new Set(lesson.activityHeads.map(norm));
          lesson.wrapup = (lesson.wrapup || []).filter((w) => !has.has(norm(w)));
        }
      } else warnings.push(`${unit.id} ${r.no}차시 지도서 쪽 ${r.guidePages} 범위 밖`);
    }
    Object.assign(lesson, OVERRIDES[unit.id]?.[lesson.no] || {});
    unit.lessons.push(lesson);
  }
  if (isBook) {
    unit.standards.related = [...new Set([...unit.lessons.flatMap((l) => l.codes || []), ...unit.evaluation.flatMap((e) => e.codes || [])])];
  }
  unit.standards.primary = [...new Set(unit.standards.primary)];
  unit.standards.related = [...new Set(unit.standards.related)].filter((c) => !unit.standards.primary.includes(c));
  books[bookIdx].units.push(unit);
});
function stageName(t) {
  const n = norm(t || '').replace(/실전/, '실천');
  if (/체험/.test(n)) return '문학 체험하기';
  if (/반응|공유/.test(n)) return '문학 반응 표현 및 공유하기';
  const m = n.match(/기초|기본|실천|정리|진단/); return m ? m[0] : n;
}
function splitByGap(lines) {
  const s = [...lines].sort((a, b) => a.y - b.y); const groups = [];
  for (const l of s) { const g = groups[groups.length - 1]; if (g && l.y - g[g.length - 1].y < 0.0195) g.push(l); else groups.push([l]); }
  return groups;
}

// ---------- 출력 ----------
const counts = { units: 0, lessons: 0, contents: 0, evaluation: 0, evalRefs: 0, lessonsWithGoal: 0 };
for (const b of books) for (const u of b.units) {
  counts.units++; counts.lessons += u.lessons.length; counts.evaluation += u.evaluation.length;
  for (const l of u.lessons) { counts.contents += l.contents.length; counts.evalRefs += (l.evalRefs || []).length; if (l.goal) counts.lessonsWithGoal++; }
}
const out = {
  _meta: {
    title: '꼬박꼬박 IEP — 기본교육과정 국어 초등 1~2학년군 교사용 지도서 단원·차시 자료 (curriculum-guide-kor12)',
    createdAt: new Date().toISOString().slice(0, 10),
    source: '2022 개정 특수교육 기본교육과정 초등학교 1~2학년군 국어 ①·② 교사용 지도서(교육부, 국립특수교육원) — 사용자가 준 PDF(06_분석문서/국어 1~2학년군 교사용 지도서.pdf, 822쪽 합본)',
    method: 'PDF 글자 층에 표·본문이 없어 macOS Vision OCR(좌표 포함) + 괘선 좌표로 표를 행·열로 나눠 읽음(scripts/parse-korean-guide.mjs). OCR이라 오탈자·띄어쓰기 오류가 조금 있을 수 있음.',
    pageNote: '지도서 인쇄 쪽 = PDF 쪽 + 1. guidePage/guidePages는 인쇄 쪽.',
    copyright: '단원명·성취기준 코드·단원 목표·차시명·차시별 학습 내용·학습 목표·지도 중점·자료·평가 내용/준거·핵심 어휘만 담음(수업 절차 본문·해설·참고 자료는 없음). 교사가 지도서를 펴지 않고 IEP 교육내용을 고르게 하기 위한 내부 참고용.',
    schema: 'books[{book,key,units[{no,title,id,guidePage,standards{primary[],related[]},goals[],lessons[{stage,no,title,contents[],bookPages,guidePages,media,goal,focus,notes[],materials,intro[],activities[],wrapup[],activityHeads[],evalRefs[{content,criteria[]}],codes[],literary[]}],evaluation[{stage,content,criteria[],codes[],skill}],vocabulary[],teachingPoints[],cautions[]}]}]',
    counts,
  },
  books,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`, counts);
for (const b of books) for (const u of b.units) {
  const missing = u.lessons.filter((l) => !l.goal).map((l) => l.no);
  console.log(`${u.id} ${u.title} p${u.guidePage} 주요[${u.standards.primary}] 관련[${u.standards.related}] 목표${u.goals.length} 차시${u.lessons.length} 평가${u.evaluation.length} 어휘${u.vocabulary.length}${missing.length ? ` 목표없는차시[${missing}]` : ''}`);
}
if (warnings.length) console.log('warnings:\n  ' + warnings.join('\n  '));
