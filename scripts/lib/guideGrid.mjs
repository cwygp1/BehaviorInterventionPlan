// 교사용 지도서 OCR(좌표) + 괘선 → 표 격자·글 잇기 공용 도구. parse-korean-guide.mjs / parse-math-guide.mjs가 함께 쓴다.
//
// 입력 형식(scripts/pdf-ocr-xy.swift, scripts/pdf-rules.swift):
//   xy:    "===== pN =====" 뒤에 "x0<TAB>x1<TAB>y<TAB>text" (0~1, y는 위에서)
//   rules: "===== pN =====" 뒤에 가로 괘선 "x0<TAB>x1<TAB>y<TAB>두께px", 세로 괘선 "V<TAB>x<TAB>y0<TAB>y1<TAB>두께px"
// 표 = 괘선 격자: 머리띠(두꺼운 조각 + 머리 글자), 행 경계 = 얇은 가로선(표 너비 50% 이상), 열 경계 = 표 높이 60% 이상 세로선,
//   병합 칸 = 행 경계선이 그 열을 지나가지 않음(regionText로 읽는다).
import fs from 'fs';

export const PAGE_H_PX = 1684; // A4 842pt × 2 (pdf-rules.swift scale 2) — 두께(px)를 비율로 바꿀 때

/** 두 파일을 읽어 쪽 지도 { pages: Map, page(n) } 를 만든다. */
export function loadPages(xyPath, rulesPath) {
  const pages = new Map(); // n → { lines:[{x0,x1,y,t}], h:[{x0,x1,y,thick}], v:[{x,y0,y1,thick}] }
  const page = (n) => { if (!pages.has(n)) pages.set(n, { lines: [], h: [], v: [] }); return pages.get(n); };
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
  return { pages, page };
}

// ---------- 글자 다루기 ----------
export const norm = (s) => String(s || '').replace(/\s+/g, '');
export const key = (s) => norm(s).replace(/[^가-힣]/g, '');
export const BULLET = /^[•·‧▪▸◦●○◎\-–]\s*/;
export const MARK = /^[•·‧▪▸◦●○◎0°OoQ@)]\s*/; // ◎ 표시가 OCR에서 0·°·O 등으로 나옴
export const PARTICLE_END = /[은는이가을를에의와과로도고며서게다요]$/; // 이 글자로 끝난 줄은 낱말 경계일 가능성이 높아 띄어 잇는다
export const stripBullet = (t) => t.replace(BULLET, '').replace(/^'(?=.*[」』])/, '「').trim(); // "•'진짜 내 소원」" → 「진짜 내 소원」
export const stripMark = (t) => t.replace(MARK, '').trim();
export const isBullet = (t) => BULLET.test(t) || /^•'/.test(t);
/** 성취기준 코드 찾기 — OCR이 "[2국 01-01]"처럼 깨져도 잡는다. subjectSrc: 교과 글자 정규식 조각('국\\s*어?'), label: 완성 이름('2국어'). */
export function codesInFor(subjectSrc, label, grade) {
  // grade를 주지 않으면 1~2학년군(2) 때 정규식 그대로(산출물 불변). 주면 그 학년 코드로 찾고, '[4수학04-1]'처럼 뒷자리가 한 자리면 두 자리로 맞춘다(0928 3~4학년군 수학 지도서).
  const re = grade == null
    ? new RegExp(`\\[?\\s*2\\s*${subjectSrc}\\s*(\\d\\d)\\s*-\\s*(\\d\\d)\\s*\\]?`, 'g')
    : new RegExp(`\\[?\\s*${grade}\\s*${subjectSrc}\\s*(\\d\\d)\\s*-\\s*(\\d\\d?)(?!\\d)\\s*\\]?`, 'g');
  return (t) => { const out = []; for (const m of String(t).matchAll(re)) out.push(`${label}${m[1]}-${m[2].padStart(2, '0')}`); return [...new Set(out)]; };
}
/** 줄 끝 글자가 이것이면 낱말 경계로 보고 띄어 잇는다 — 글자 층(3~4학년군) 지도서용 확장 목록('할 수'·'것'·'때'·'등'·'및'). */
export const PARTICLE_END_EXT = /[은는이가을를에의와과로도고며서게다요수것때등및지기록해후할어아여]$/;
const TAIL_ONLY = /^((가|지|까|는가|을까|나요|가요)\?|하기)$/; // 줄 끝에 홀로 남은 어미("…참여하는" + "가?", "비교" + "하기") — 앞 줄에 붙여 쓴다
const sep = (cur, t, full, particle) => (particle !== PARTICLE_END && (TAIL_ONLY.test(t) || (/에$/.test(cur) && /^서/.test(t)) || (/(알아|살펴)$/.test(cur) && /^보기/.test(t))) ? '' : full ? '' : ' '); // '…속에'+'서 …'=에서, '알아'+'보기'=알아보기
export const fixText = (t) => String(t)
  .replace(/[『「]\s*/g, (m) => m.trim()).replace(/\s*[』」]/g, (m) => m.trim())
  .replace(/'([^'」』]+)[」』]/g, '「$1」').replace(/`/g, '\'')
  .replace(/「([^「」『』]+)』/g, '「$1」').replace(/『([^「」『』]+)」/g, '『$1』') // 여닫는 괄호 짝 맞추기
  .replace(/불임딱지/g, '붙임딱지').replace(/PP[IT]T/g, 'PPT').replace(/실전/g, '실천')
  .replace(/[•·]{2,}|\.{3}/g, '…').replace(/^[,.\s'"]+(?=[가-힣「『\[])/, '')
  .replace(/\s+/g, ' ').trim();

/** 줄 여러 개를 문단으로: 글머리표(•)로 항목을 나누고, 줄이 칸 오른쪽 끝까지 찼으면 낱말이 잘린 것으로 보고 붙여 쓴다. */
export function joinItems(lines, right, { bullets = true, centered = false, particle = PARTICLE_END } = {}) {
  const items = [];
  let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = l.t.trim(); if (!t) continue;
    if (!cur || (bullets && isBullet(t))) { if (cur) items.push(cur); cur = bullets ? stripBullet(t) : t; }
    else {
      const full = !centered && right != null && prevX1 >= right - 0.013 && !particle.test(cur);
      cur += sep(cur, t, full, particle) + t;
    }
    prevX1 = l.x1;
  }
  if (cur) items.push(cur);
  return items.map(fixText).filter(Boolean);
}

/** 문단 글머리표 항목들(양쪽 맞춤 산문이라 구간 최대 x1을 오른쪽 끝으로). */
export const bulletsOf = (lines) => { const right = Math.max(...lines.map((l) => l.x1), 0); return joinItems(lines, right + 0.007, { bullets: true }).filter((t) => t.length > 1); };

/** ◎ 표시(0·°·O로 읽힘)로 항목을 나눈다. 표시가 OCR에서 빠져도 왼쪽 끝(x0<0.058)에서 시작하면 새 항목. */
export function splitMarked(lines, right, { markX = 0.075, startX = 0.058 } = {}) {
  const items = []; let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = l.t.trim();
    const marked = (MARK.test(t) && l.x0 < markX) || l.x0 < startX;
    if (!cur || marked) { if (cur) items.push(cur); cur = stripMark(t); }
    else cur += (prevX1 >= right - 0.013 && !PARTICLE_END.test(cur) ? '' : ' ') + t;
    prevX1 = l.x1;
  }
  if (cur) items.push(cur);
  return items.map(fixText).filter(Boolean);
}

/** "1. …" 번호 항목들(다음 번호 전까지 잇는다). */
export function numberedItems(lines, right, { particle = PARTICLE_END } = {}) {
  const items = []; let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = l.t.trim(); if (!t) continue;
    const m = t.match(/^\d{1,2}\s*[.．]\s*(.*)$/);
    if (!cur || m) { if (cur) items.push(cur); cur = m ? m[1] : t; }
    else cur += sep(cur, t, prevX1 >= right - 0.013 && !particle.test(cur), particle) + t;
    prevX1 = l.x1;
  }
  if (cur) items.push(cur);
  return items.map(fixText).filter(Boolean);
}

/**
 * 도입/전개/정리 같은 작은 표: 이름표는 칸 세로 가운데에 있으니, 가운데 맞춤으로 각 이름표의 줄 수를 정한다.
 * labels: 이름표 글자와 결과 키 [['도입','intro'],['전개','activities'],['정리','wrapup']].
 */
export function parseOutline(lines0, { labels = [['도입', 'intro'], ['전개', 'activities'], ['정리', 'wrapup']], labelMaxX = 0.1, itemMinX = 0.09, right = 0.44 } = {}) {
  const names = labels.map((l) => l[0]);
  const lines = [];
  for (const l of lines0) {
    const m = l.t.match(new RegExp(`^(${names.join('|')})\\s*[•·‧▪▸\\-–]?\\s*(.+)$`));
    if (m && l.x0 < labelMaxX) { lines.push({ ...l, t: m[1], x1: l.x0 + 0.03 }); lines.push({ ...l, t: '• ' + m[2], x0: itemMinX + 0.015 }); }
    else lines.push(l);
  }
  const labs = lines.filter((l) => names.includes(norm(l.t)) && l.x0 < labelMaxX).sort((a, b) => a.y - b.y);
  const items = lines.filter((l) => !labs.includes(l) && l.x0 >= itemMinX).sort((a, b) => a.y - b.y);
  const out = {}; labels.forEach((l) => { out[l[1]] = []; });
  let i = 0;
  labs.forEach((lab, k) => {
    const keyName = labels.find((l) => l[0] === norm(lab.t))[1];
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
    out[keyName] = joinItems(items.slice(i, i + best), right, { bullets: true });
    i += best;
  });
  return out;
}

/** 평가 준거 칸: 문장 끝(. ?)에서 항목을 나눈다(줄바꿈된 문장은 잇는다). */
export function criteriaOf(lines, right, { particle = PARTICLE_END } = {}) {
  const items = []; let cur = '', prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = stripBullet(l.t.trim());
    cur = cur ? cur + sep(cur, t, prevX1 >= right - 0.013 && !particle.test(cur), particle) + t : t;
    prevX1 = l.x1;
    if (/[.?]$/.test(t)) { items.push(fixText(cur)); cur = ''; }
  }
  if (cur) items.push(fixText(cur));
  return items.filter(Boolean);
}

/**
 * 글머리표가 그림이라 글자 층에 없는 문단(3~4학년군 지도서의 지도상의 유의점·평가·교수·학습 자료):
 * 앞 항목이 문장 끝(. ? ! ) 」 』)으로 끝났으면 다음 줄을 새 항목으로, 아니면 이어 쓴다(칸 오른쪽 끝까지 찬 줄은 낱말 절단).
 */
export function sentenceItems(lines, right, { particle = PARTICLE_END_EXT } = {}) {
  const items = []; let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = stripBullet(l.t.trim()); if (!t) continue;
    if (cur == null || /[.?!)」』]$/.test(cur)) { if (cur != null) items.push(cur); cur = t; }
    else cur += sep(cur, t, prevX1 >= right - 0.013 && !particle.test(cur), particle) + t;
    prevX1 = l.x1;
  }
  if (cur != null) items.push(cur);
  return items.map(fixText).filter(Boolean);
}

/**
 * 평가 준거 서술문 → 사이트 평가계획 짜임("~는가?"). 3~4학년군 국어 지도서의 준거는 "~할 수 있다." 서술이라(1~2학년군·수학은 "~는가?")
 * 0930 햇살 결정("지도서는 그렇게 나올 거예요. 우리 사이트에서는 평가계획에 '~는가?'로, '할 수 있다'는 목표에")에 따라 데이터에서 바꾼다.
 *   있다.→있는가? · 안다.→아는가?(끝 글자 받침 ㄴ을 떼고 "는가?") · 읽는다.→읽는가? · 이다.→인가? · 이미 "~는가?"면 그대로.
 */
export function toEvalQuestion(s) {
  const t = String(s || '').trim();
  if (!t || /[는은]가\?$/.test(t)) return t;
  const m = t.match(/^(.*?)([가-힣])다[.．]?$/);
  if (!m) return t;
  const [, head, syl] = m;
  if (syl === '는') return `${head}는가?`;
  if (syl === '이') return `${head}인가?`;
  const code = syl.charCodeAt(0) - 0xac00;
  if (code % 28 === 4) return `${head}${String.fromCharCode(0xac00 + code - 4)}는가?`; // 받침 ㄴ: 안다→아는가, 한다→하는가, 쓴다→쓰는가, 만든다→만드는가
  return `${head}${syl}는가?`; // 있다→있는가, 없다→없는가
}

/** "148~151" → [148,151]. 뒤 숫자가 이상하면(다른 열이 섞임) 앞 숫자+1. */
export const pageRange = (s) => { const m = String(s || '').replace(/\s/g, '').match(/(\d+)(?:~(\d+))?/); if (!m) return null; const a = +m[1], b = +(m[2] || m[1]); return [a, b >= a && b - a < 12 ? b : a + 1]; };

/** 줄 간격(≥0.0195)으로 덩어리 나누기 — 점선으로 나뉜 하위 행 등. */
export function splitByGap(lines, gap = 0.0195) {
  const s = [...lines].sort((a, b) => a.y - b.y); const groups = [];
  for (const l of s) { const g = groups[groups.length - 1]; if (g && l.y - g[g.length - 1].y < gap) g.push(l); else groups.push([l]); }
  return groups;
}

/** (쪽, y, 제목) 순서 목록 → 각 구간의 줄들. isHeading(line)으로 제목 줄을 판단한다. */
export function sectionsOfPages(page, pageNos, isHeading, { footerY = 0.945 } = {}) {
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
        if (l.y > footerY) continue; // 꼬리말
        lines.push({ ...l, n });
      }
    }
    secs.push({ ...h, end: nx ? { n: nx.n, y: nx.y } : null, lines });
  }
  return secs;
}

// ---------- 표 격자 ----------
const HEADER_WORDS = new Set(['구분', '차시', '차시명', '차시별학습내용', '차시별학습(내용)', '쪽수', '쪽', '교과서', '지도서', '교과서지도서', '전자책등', '유형', '평가내용', '평가준거', '성취기준', '관련성취기준', '문학요소', '관련', '단원', '관련단원', '평가요소', '내용', '기능',
  '소단원', '주요학습내용', '교수·학습자료', '교수•학습자료', '교수학습자료', '교과서쪽수', '지도서쪽수', '평가기준', '단원목표', '주요성취기준', '연계단원']);
export const isHeaderWord = (l, exclude) => { const a = norm(l.t), b = key(l.t); if (exclude && (exclude.has(a) || exclude.has(b))) return false; return HEADER_WORDS.has(a) || HEADER_WORDS.has(b); };

/**
 * 쪽의 [yTop, yBottom] 사이에서 표를 찾아 행·열로 나눈다. xRange를 주면 그 안의 괘선만 본다(차시 쪽의 반쪽 표).
 * opts(기본은 국어 지도서 때 동작 그대로 — 국어 산출물이 바뀌지 않게):
 *   clusterV: 행마다 끊긴 세로선 조각을 모아 열 경계로 삼는다(수학).  thinLeftEdge: 표 왼쪽 근처에서 시작하는 가로선만 행 경계로(알약 밑줄 제외).
 *   headerExclude: 머리 글자로 안 볼 낱말(수학: '단원'·'관련' — '단원 도입' 칸이 머리로 오인됨).
 * 반환: { rows:[{y0,y1,cells:[{lines,text,items,region,regionText}]}], cols:[x…], header:{y0,y1,labels[],labelLines[]}, x0,x1,y0,y1 }
 */
export function grid(p, yTop, yBottom, xRange, opts = {}) {
  const { clusterV = false, thinLeftEdge = false, headerExclude = null } = opts;
  const hx = headerExclude ? new Set(headerExclude) : null;
  const isHW = (l) => isHeaderWord(l, hx);
  const inX = (r) => !xRange || (r.x0 >= xRange[0] - 0.02 && r.x1 <= xRange[1] + 0.02);
  const H = p.h.filter((r) => r.y > yTop && r.y < yBottom && inX(r) && (r.x1 - r.x0) >= 0.15);
  if (!H.length) return null;
  const wide = H.reduce((a, r) => ((r.x1 - r.x0) > (a.x1 - a.x0) ? r : a));
  const tx0 = wide.x0, tx1 = wide.x1, tw = tx1 - tx0;
  const inTable = (r) => r.x0 >= tx0 - 0.02 && r.x1 <= tx1 + 0.02;
  // 머리띠: 위쪽의 두꺼운 조각들(흰 글자 사이로 끊긴다). 얇은 괘선 = 행 경계.
  const thick = H.filter((r) => r.thick >= 4 && inTable(r));
  // 행 경계선은 표 왼쪽 가장자리 근처에서 시작한다(병합 구분 열을 건너뛰어도 +0.1 안). 알약 제목 밑줄처럼 표 안쪽에서 시작하는 선은 뺀다.
  const thin = H.filter((r) => r.thick <= 3 && inTable(r) && (r.x1 - r.x0) >= 0.5 * tw && (!thinLeftEdge || r.x0 <= tx0 + 0.1)).sort((a, b) => a.y - b.y);
  let header = null;
  if (thick.length) {
    const top = thick.filter((r) => r.y < (thin[0]?.y ?? yBottom));
    if (top.length) header = { y0: Math.min(...top.map((r) => r.y - r.thick / 2 / PAGE_H_PX)), y1: Math.max(...top.map((r) => r.y + r.thick / 2 / PAGE_H_PX)) };
  }
  const firstThin = thin[0]?.y ?? yBottom;
  if (!header) {
    const hw = p.lines.filter((l) => isHW(l) && l.y > yTop && l.y < firstThin && (l.x0 + l.x1) / 2 > tx0 && (l.x0 + l.x1) / 2 < tx1);
    if (hw.length >= 2) header = { y0: Math.min(...hw.map((l) => l.y)) - 0.012, y1: Math.max(...hw.map((l) => l.y)) + 0.008 };
  } else {
    const hw = p.lines.filter((l) => isHW(l) && l.y >= header.y0 && l.y < Math.min(header.y1 + 0.035, firstThin) && (l.x0 + l.x1) / 2 > tx0 && (l.x0 + l.x1) / 2 < tx1);
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
  // 세로선은 행 경계마다 끊겨 조각으로 나오기도 한다 → x가 같은 조각을 모아 덮는 길이가 표 높이의 절반 이상이면 열 경계.
  let vs;
  if (clusterV) {
    const frags = p.v.filter((v) => v.x > tx0 + 0.01 && v.x < tx1 - 0.01 && Math.min(v.y1, y1) - Math.max(v.y0, y0) > 0.01).sort((a, b) => a.x - b.x);
    const clusters = [];
    for (const v of frags) {
      const c = clusters[clusters.length - 1];
      const cov = Math.min(v.y1, y1) - Math.max(v.y0, y0);
      if (c && v.x - c.x1 <= 0.004) { c.x1 = v.x; c.cov += cov; c.xs.push(v.x); } else clusters.push({ x0: v.x, x1: v.x, cov, xs: [v.x] });
    }
    vs = clusters.filter((c) => c.cov >= 0.5 * th).map((c) => c.xs.reduce((a, b) => a + b, 0) / c.xs.length);
  } else {
    vs = p.v.filter((v) => v.x > tx0 + 0.01 && v.x < tx1 - 0.01 && Math.min(v.y1, y1) - Math.max(v.y0, y0) >= 0.6 * th).map((v) => v.x).sort((a, b) => a - b);
  }
  const cols = [tx0];
  for (const x of vs) if (x - cols[cols.length - 1] > 0.012) cols.push(x);
  cols.push(tx1);
  const nC = cols.length - 1;
  const rows = [];
  for (let i = 0; i + 1 < bounds.length; i++) rows.push({ y0: bounds[i], y1: bounds[i + 1], cells: Array.from({ length: nC }, () => ({ lines: [] })) });
  for (const l of p.lines) {
    if (l.y < bounds[0] || l.y > y1) continue;
    if (isHW(l)) continue; // 첫 행에 섞여 든 머리 글자
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
      cell.regionItems = joinItems(lines, cr, { bullets: true });
      cell.text = joinItems(cell.lines, cr, { bullets: false, centered: true }).join(' ');
      cell.items = joinItems(cell.lines, cr, { bullets: true });
    }
  }
  const labelLines = header ? p.lines.filter((l) => l.y >= header.y0 - 0.01 && l.y <= header.y1 + 0.01 && (l.x0 + l.x1) / 2 >= tx0 && (l.x0 + l.x1) / 2 <= tx1) : [];
  return { rows, cols, header: header ? { ...header, labels: labelLines.map((l) => l.t), labelLines } : null, x0: tx0, x1: tx1, y0, y1 };
}

/** 머리 글자로 열 역할 찾기: roles = { title: /차시명/, no: /^차시$/, … } → { title: 2, no: 0, … } (없으면 -1). */
export function columnRoles(g, roles) {
  const out = {};
  const texts = g.cols.slice(0, -1).map((x, i) => (g.header?.labelLines || []).filter((l) => { const xc = (l.x0 + l.x1) / 2; return xc >= x && xc < g.cols[i + 1]; }).map((l) => norm(l.t)).join(''));
  for (const [name, re] of Object.entries(roles)) out[name] = texts.findIndex((t) => re.test(t));
  return out;
}

/** 디버그: DEBUG_GRID="쪽,yTop,yBottom[,x0,x1]" 로 표 하나를 찍어 보고 끝낸다. */
export function runDebugGrid(page, opts) {
  if (!process.env.DEBUG_GRID) return;
  const [n, a, b, x0, x1] = process.env.DEBUG_GRID.split(',').map(Number);
  const g = grid(page(n), a, b, x0 != null && !Number.isNaN(x0) ? [x0, x1] : undefined, opts);
  if (!g) { console.log('no grid'); process.exit(0); }
  console.log('cols', g.cols.map((x) => x.toFixed(3)).join(' '), 'header', g.header && g.header.labels.join('|'), 'y', g.y0.toFixed(3), g.y1.toFixed(3));
  g.rows.forEach((r, i) => console.log(`row${i} [${r.y0.toFixed(3)}-${r.y1.toFixed(3)}]`, r.cells.map((c) => `{${c.region}:${c.items.join(' / ')}}`).join(' | ')));
  process.exit(0);
}
