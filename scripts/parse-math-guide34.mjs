// 기본교육과정 수학 3~4학년군 교사용 지도서(수학 ③·④ 합본 PDF, 652쪽) → public/data/curriculum-guide-math34.json
//
// 0929: 1~2학년군 수학(parse-math-guide.mjs, mds/39)에 이어 사용자가 준 3~4학년군 지도서. 글자 층이 온전해 OCR 대신
//   scripts/pdf-text-xy.mjs로 xy 파일을 만들고, 표는 괘선 격자(scripts/lib/guideGrid.mjs)로 읽는다. 단원 템플릿이 1~2학년군과 다르다:
//   단원 시작 쪽: 큰 번호 + 제목(x≈0.30, y≈0.13) + '단원 개관'(x≈0.14, y≈0.24) 문단
//   → 단원 핵심 아이디어(핵심 아이디어 문장 + 지식·이해 | 과정·기능 | 가치·태도 내용 요소 표, 괘선 없음) → 단원의 학습 계열
//   → 성취기준([4수학04-1] 목록, 뒷자리 한 자리·주요/관련 구분 없음) → 성취기준 적용 시 고려 사항(1. 2. …) → 단원의 흐름(그림)
//   → 단원 전개 계획 표: 구성(소단원, 병합) | 차시 | 주제(=차시명) | 내용 및 활동(•) | 교과서 쪽수 | 준비물  ※ 지도서 쪽수 열이 없다
//   → 단원 평가 중점 표(번호 | 지식·이해 | 과정·기능 | 가치·태도, "~는가?") → 단원 지도 시 유의 사항(1. 2. …) → 가정 및 생활과의 연계(1. 2. …)
//   차시 쪽(왼쪽 면 왼 단): 'N 차시'(x<0.15) + 차시 제목 · 학습 목표 · 수업의 흐름(도입/전개/정리) · 준비물 · 지도 중점 · 지도상의 유의점.
//     오른쪽 면 오른 단 아래에 '평가기준'(지식·이해/과정·기능/가치·태도). 1차시(단원 도입)는 학습 목표 대신 수업의 흐름만,
//     단원 평가 차시(배운 것을 확인해요)는 평가 중점·평가기준·평가 유의점, 놀이 마당(수학이랑 놀아요)은 놀이 목표·놀잇감·놀이할 때 유의점.
//   ③권 7단원 + ④권 7단원. 인쇄 쪽 = PDF 쪽 + 1(③) / + 2(④) — 꼬리말 "78 | 교수·학습의 실제" / "수학 | 79"로 잰다.
//   준비물의 '뜯'·'붙' 동그라미 표시(뜯기 자료·붙임딱지)는 글자로 들어오므로 '(뜯기 자료)'·'(붙임딱지)'로 바꾼다.
//   단계(stage) 자리에 소단원 이름(단원 소개 / 규칙대로 놓기 / … / 단원 평가 / 놀이 마당)을 넣는다.
//
// 사용법(PDF는 저장소 밖 06_분석문서/에 두고 커밋하지 않는다):
//   pdftotext -bbox-layout "…/수학34 지도서 PDF.pdf" /tmp/math34-bbox.html
//   node scripts/pdf-text-xy.mjs /tmp/math34-bbox.html > /tmp/math34-xy.txt
//   swiftc -O -o /tmp/pdf-rules scripts/pdf-rules.swift && /tmp/pdf-rules "…/수학34 지도서 PDF.pdf" > /tmp/math34-rules.txt   # 기본 문턱
//   node scripts/parse-math-guide34.mjs /tmp/math34-xy.txt /tmp/math34-rules.txt
//   DEBUG_GRID="쪽,yTop,yBottom" 로 표 하나를 찍어 볼 수 있다.

import fs from 'fs';
import path from 'path';
import { loadPages, norm, key, isBullet, fixText, joinItems, grid, runDebugGrid, sectionsOfPages, numberedItems, parseOutline, criteriaOf, sentenceItems, codesInFor, columnRoles, stripBullet, PARTICLE_END_EXT } from './lib/guideGrid.mjs';

const [xyPath, rulesPath] = process.argv.slice(2);
if (!xyPath || !rulesPath) { console.error('usage: node scripts/parse-math-guide34.mjs <math34-xy.txt> <math34-rules.txt>'); process.exit(1); }
const OUT = path.join(process.cwd(), 'public/data/curriculum-guide-math34.json');
const { pages, page } = loadPages(xyPath, rulesPath);
const codesIn = codesInFor('수\\s*학?', '4수학', '4');
const GRID = { clusterV: true, thinLeftEdge: true, headerExclude: ['단원', '관련'] };
const mgrid = (p, a, b, x) => grid(p, a, b, x, GRID);
runDebugGrid(page, GRID);
const P = { particle: PARTICLE_END_EXT };
const CATS = ['지식·이해', '과정·기능', '가치·태도'];
const catName = (t) => { const k = norm(t); return /지식/.test(k) ? CATS[0] : /과정/.test(k) ? CATS[1] : /가치/.test(k) ? CATS[2] : ''; };

// ---------- 단원 찾기 ----------
const sortedPages = [...pages.keys()].sort((a, b) => a - b);
const isStartPill = (l) => key(l.t) === '단원개관' && l.x0 >= 0.1 && l.x0 <= 0.2 && l.y > 0.18 && l.y < 0.3;
const unitStarts = sortedPages.filter((n) => page(n).lines.some(isStartPill));
// 권 경계: '교사용 지도서 구성' 안내 쪽의 '단원의 개관'(x≈0.20, 쪽 중간)이 권마다 한 번 나온다.
const introPages = sortedPages.filter((n) => page(n).lines.some((l) => key(l.t) === '단원의개관' && l.x0 < 0.27 && l.y > 0.4 && l.y < 0.8));
const bookBoundary = introPages[1] || Infinity;
if (unitStarts.length !== 14) console.warn(`단원 시작 쪽 ${unitStarts.length}개(14개 기대): ${unitStarts.join(' ')}`);

const HEADINGS = new Set(['단원개관', '단원핵심아이디어', '단원의학습계열', '성취기준', '성취기준적용시고려사항', '단원의흐름', '단원전개계획', '단원평가중점', '단원지도시유의사항', '가정및생활과의연계']);
const isHeading = (l) => HEADINGS.has(key(l.t)) && (l.x1 - l.x0) < 0.3 && l.x0 >= 0.1 && l.x0 <= 0.22 && l.y < 0.93;
const footerOffset = (n) => { for (const l of page(n).lines) if (l.y > 0.93 && /^\d{2,3}$/.test(l.t)) return +l.t - n; return null; };
const unitTitle = (n) => fixText(page(n).lines.filter((l) => l.y < 0.16 && l.x0 > 0.25 && l.x0 < 0.6 && !/^\d+$/.test(l.t)).sort((a, b) => a.y - b.y).map((l) => l.t).join(' ')).replace(/\s*\(\s*(\d)\s*\)$/, '($1)');

// 준비물·놀잇감의 '뜯'(뜯기 자료)·'붙'(붙임딱지) 동그라미 표시: "그림( 뜯 63)" → "그림(뜯기 자료 63)", "그림 뜯 ," → "그림(뜯기 자료),"
const badge = (t) => t
  .replace(/\(\s*뜯\s*([^)]*?)\s*\)/g, '(뜯기 자료 $1)').replace(/\(\s*붙\s*([^)]*?)\s*\)/g, '(붙임딱지 $1)')
  .replace(/\s*뜯(?=\s*,|\s*$)/g, '(뜯기 자료)').replace(/\s*붙(?=\s*,|\s*$)/g, '(붙임딱지)')
  .replace(/\(뜯기 자료 \)/g, '(뜯기 자료)').replace(/\(붙임딱지 \)/g, '(붙임딱지)').replace(/\s+,/g, ',');
function joinMaterials(lines, right) {
  let cur = null, prevX1 = 0;
  for (const l of [...lines].sort((a, b) => a.y - b.y)) {
    const t = badge(stripBullet(l.t.trim())); if (!t) continue;
    if (cur == null) cur = t;
    else cur += (prevX1 >= right - 0.013 && !PARTICLE_END_EXT.test(cur) && !/[,)]$/.test(cur) ? '' : ' ') + t;
    prevX1 = l.x1;
  }
  return fixText(cur || '').replace(/\s*,\s*/g, ', ');
}

// ---------- 차시 쪽 ----------
const LESSON_RE = /^(\d{1,2})\s*(?:[~〜∼]\s*(\d{1,2}))?\s*차시$/;
const lessonLabelOf = (l) => { const m = l.t.match(LESSON_RE); return m && l.x0 < 0.15 && l.y < 0.2 ? (m[2] ? `${m[1]}~${m[2]}` : m[1]) : null; };
const LESSON_LABELS = new Set(['학습목표', '수업의흐름', '준비물', '지도중점', '지도상의유의점', '평가중점', '평가기준', '평가유의점', '놀이목표', '놀잇감', '놀이할때유의점', '학습개요', '교수학습자료', '중점지도사항']);
// '평가기준' 상자: 지식·이해 / 과정·기능 / 가치·태도 이름표가 행 세로 가운데에 있고 오른쪽에 • 준거. 항목은 세로로 가장 가까운 이름표에 붙인다.
function evalCriteriaBlock(colLines, lab, right) {
  const below = colLines.filter((l) => l.y > lab.y + 0.004 && l.y < lab.y + 0.25).sort((a, b) => a.y - b.y);
  const isCat = (l) => catName(l.t) && (l.x1 - l.x0) < 0.08;
  const cats = below.filter(isCat);
  if (!cats.length) return [];
  const catX1 = Math.max(...cats.map((c) => c.x1));
  const lastCatY = cats[cats.length - 1].y;
  const body = [];
  for (const l of below) {
    if (isCat(l)) continue;
    if (l.x0 >= catX1 + 0.005 || isBullet(l.t)) { if (l.y < lastCatY + 0.03 || body.length) body.push(l); continue; } // 준거 줄(첫 이름표보다 위에 있을 수 있음)
    if (l.y > lastCatY + 0.012) break; // 상자 밖 문단
  }
  const buckets = cats.map(() => []);
  for (const l of body) { let bi = 0, bd = Infinity; cats.forEach((c, i) => { const d = Math.abs(c.y - l.y); if (d < bd) { bd = d; bi = i; } }); buckets[bi].push(l); }
  return cats.map((c, i) => ({ content: catName(c.t), criteria: criteriaOf(buckets[i], right, P) })).filter((e) => e.criteria.length);
}
function parseLessonPage(n) {
  const p = page(n); if (!p) return {};
  const left = p.lines.filter((l) => l.x0 < 0.47 && l.x1 < 0.5 && l.y < 0.93);
  const labels = left.filter((l) => LESSON_LABELS.has(key(l.t)) && (l.x1 - l.x0) < 0.2 && l.x0 < 0.16).sort((a, b) => a.y - b.y);
  const out = {};
  const SUBHEAD = /^(선수\s*학습|공부할\s*내용|활동\s*\d|교사\s*발문|의사소통\s*판\s*어휘|이렇게도|단원\s*도입\s*이야기|들어가기)/;
  const between = (a, b) => {
    const ls = left.filter((l) => l.y > a.y + 0.004 && (!b || l.y < b.y - 0.004) && !labels.includes(l));
    const cut = Math.min(Infinity, ...ls.filter((l) => SUBHEAD.test(l.t) && !isBullet(l.t)).map((l) => l.y));
    return ls.filter((l) => l.y < cut);
  };
  const rightOf = (ls) => Math.max(0.3, ...ls.map((l) => l.x1)) + 0.007; // 그 문단의 가장 긴 줄 = 칸 오른쪽 끝
  labels.forEach((lab, i) => {
    const k = key(lab.t), body = between(lab, labels[i + 1]), right = rightOf(body);
    if (k === '학습목표' || k === '놀이목표') { out.goal = joinItems(body, right, { bullets: false, ...P }).join(' '); if (/다$/.test(out.goal)) out.goal += '.'; }
    else if (k === '수업의흐름') {
      const o = parseOutline(body, { labels: [['도입', 'intro'], ['전개', 'activities'], ['정리', 'wrapup']], labelMaxX: 0.12, itemMinX: 0.11, right });
      if (!o.intro.length && !o.activities.length && !o.wrapup.length) o.activities = joinItems(body, right, { bullets: true, ...P }); // 1차시(단원 도입)는 도입/전개/정리 구분 없이 • 항목만
      Object.assign(out, o);
    }
    else if (k === '학습개요') out.activities = numberedItems(body, right, P);
    else if (k === '준비물' || k === '놀잇감' || k === '교수학습자료') out.materials = joinMaterials(body, right);
    else if (k === '지도중점' || k === '중점지도사항') out.focus = sentenceItems(body, right).join(' ');
    else if (k === '지도상의유의점' || k === '평가유의점' || k === '놀이할때유의점') out.notes = [...(out.notes || []), ...sentenceItems(body, right)];
    else if (k === '평가중점') out.evalPoints = sentenceItems(body, right);
    else if (k === '평가기준') { const refs = evalCriteriaBlock(left, lab, right); if (refs.length) out.evalRefs = refs; }
  });
  // 오른쪽 면 오른 단의 '평가기준' 상자(보통 차시 두 번째 쪽)
  if (!out.evalRefs) {
    for (const m of [n, n + 1]) {
      const q = page(m); if (!q) continue;
      const col = q.lines.filter((l) => l.x0 >= 0.5 && l.y < 0.93);
      const lab = col.find((l) => key(l.t) === '평가기준' && (l.x1 - l.x0) < 0.12);
      if (lab) { const box = col.filter((l) => l.y > lab.y && l.y < lab.y + 0.25); const refs = evalCriteriaBlock(col, lab, Math.max(0.6, ...box.map((l) => l.x1)) + 0.007); if (refs.length) { out.evalRefs = refs; break; } }
    }
  }
  return out;
}

// ---------- 단원 파싱 ----------
const books = [{ book: '수학 ③', key: 3, units: [] }, { book: '수학 ④', key: 4, units: [] }];
const warnings = [];
unitStarts.forEach((start, idx) => {
  const bookIdx = start < bookBoundary ? 0 : 1;
  const end = Math.min((unitStarts[idx + 1] || sortedPages[sortedPages.length - 1] + 1) - 1, bookIdx === 0 ? bookBoundary - 1 : Infinity);
  let offset = null;
  for (let n = start; n <= start + 2 && offset == null; n++) offset = footerOffset(n);
  if (offset == null) { offset = bookIdx === 0 ? 1 : 2; warnings.push(`p${start} 꼬리말 쪽 번호 못 찾음 → 오프셋 ${offset}`); }
  const no = String(books[bookIdx].units.length + 1);
  const unit = { no, title: unitTitle(start), id: `${books[bookIdx].key}-${no}`, guidePage: start + offset, standards: { primary: [], related: [] }, keyIdea: '', goals: [], lessons: [], evaluation: [], vocabulary: [], teachingPoints: [], cautions: [] };

  // 차시 쪽 목록('N 차시' 이름표) — 개관 쪽 범위는 첫 차시 쪽 앞까지
  const lessonPages = [];
  for (let n = start + 1; n <= end; n++) { const l = page(n).lines.find(lessonLabelOf); if (l) lessonPages.push({ n, no: lessonLabelOf(l) }); }
  const firstLesson = lessonPages[0]?.n ?? Math.min(end, start + 8);
  const overview = []; for (let n = start; n < firstLesson && n <= end; n++) overview.push(n);
  const secs = sectionsOfPages(page, overview, isHeading, { footerY: 0.93 });
  const sec = (name) => secs.find((s) => s.name === name);
  const rightOf = (lines) => Math.max(...lines.map((l) => l.x1), 0) + 0.007;

  const st = sec('성취기준');
  if (st) unit.standards.primary = codesIn(st.lines.map((l) => l.t).join(' '));
  else warnings.push(`${unit.id} 성취기준 절 없음`);
  const ov = sec('단원개관');
  if (ov) unit.commentary = joinItems(ov.lines.filter((l) => l.x0 < 0.3), rightOf(ov.lines), { bullets: false, ...P }).join(' ').slice(0, 400);

  // 단원 핵심 아이디어: 문장(x>0.33) + 내용 요소 표(괘선 없음 → 머리 글자 x로 세 열)
  const ki = sec('단원핵심아이디어');
  if (ki) {
    const heads = CATS.map((c) => ki.lines.find((l) => norm(l.t) === c.replace(/\s/g, '')));
    const headY = heads[0]?.y ?? Infinity;
    unit.keyIdea = joinItems(ki.lines.filter((l) => l.x0 > 0.25 && l.y < headY - 0.004), 0.9, { bullets: true, ...P }).join(' '); // 문장 하나(x≈0.38) 또는 • 둘(x≈0.27, ③-7)
    if (heads.every(Boolean)) {
      const body = ki.lines.filter((l) => l.y > headY + 0.004);
      const bx = [(heads[0].x0 + heads[1].x0) / 2, (heads[1].x0 + heads[2].x0) / 2];
      CATS.forEach((c, i) => {
        const col = body.filter((l) => (i === 0 ? l.x0 < bx[0] : i === 1 ? l.x0 >= bx[0] && l.x0 < bx[1] : l.x0 >= bx[1]));
        joinItems(col, rightOf(col), { bullets: true, ...P }).forEach((it) => unit.goals.push(`${c}: ${it}`));
      });
    } else warnings.push(`${unit.id} 핵심 아이디어 표 머리 못 찾음`);
  } else warnings.push(`${unit.id} 단원 핵심 아이디어 절 없음`);
  const co = sec('성취기준적용시고려사항'); if (co) unit.considerations = numberedItems(co.lines, rightOf(co.lines), P);
  const ca = sec('단원지도시유의사항'); if (ca) unit.cautions = numberedItems(ca.lines, rightOf(ca.lines), P);
  const hm = sec('가정및생활과의연계'); if (hm) unit.homeLinks = numberedItems(hm.lines.filter((l) => !['교사', '기록란', '교사기록란'].includes(norm(l.t))), rightOf(hm.lines), P); // 뒤에 오는 '교사 기록란' 빈 쪽 제외

  // 단원 전개 계획 표(구성 | 차시 | 주제 | 내용 및 활동 | 교과서 쪽수 | 준비물, 쪽을 넘길 수 있음)
  const pl = sec('단원전개계획');
  const planRows = [];
  if (pl) {
    const pgs = [pl.n]; if (pl.end && pl.end.n !== pl.n) for (let n = pl.n + 1; n <= pl.end.n; n++) pgs.push(n);
    let roles = null;
    for (const n of pgs) {
      const g = mgrid(page(n), n === pl.n ? pl.y + 0.012 : 0.05, pl.end && pl.end.n === n ? pl.end.y : 0.95);
      if (!g) continue;
      const nC = g.cols.length - 1;
      if (g.header) {
        const r = columnRoles(g, { stage: /구성|구분/, no: /^차시$/, title: /주제|차시명/, contents: /내용/, book: /교과서/, materials: /준비물|자료/ });
        if (r.title >= 0 && r.contents >= 0) roles = r; else if (!roles) { warnings.push(`${unit.id} 전개 계획 표 머리 못 읽음 p${n}: ${g.header.labels.join('|')}`); continue; }
      }
      if (!roles) { if (nC >= 6) roles = { stage: 0, no: 1, title: 2, contents: 3, book: 4, materials: 5 }; else continue; }
      const cell = (r, i) => (i >= 0 && i < nC ? r.cells[i] : { text: '', items: [], regionText: '', lines: [] });
      // 구성 칸이 안쪽 세로선으로 다시 나뉜 단원(③-5: 바깥 '하루 일과 알기' 병합 + 안쪽 '학교에서의 일과 알기'/'체험 학습일의 일과 알기') → 안쪽(더 구체적인) 이름
      const stageOf = (r) => {
        const ci = roles.stage; if (ci < 0) return '';
        const cl = g.cols[ci], cr = g.cols[ci + 1];
        const sub = page(n).v.find((v) => v.x > cl + 0.02 && v.x < cr - 0.02 && v.y0 <= r.y0 + 0.01 && v.y1 >= r.y1 - 0.01);
        if (sub) { const inner = r.cells[ci].lines.filter((l) => l.x0 > sub.x); if (inner.length) return fixText(joinItems(inner, cr, { bullets: false, centered: true, ...P }).join(' ')); }
        const reg = r.cells[ci].region, lines = g.rows.filter((row) => row.cells[ci].region === reg).flatMap((row) => row.cells[ci].lines);
        return fixText(joinItems(lines, cr, { bullets: false, centered: true, ...P }).join(' ')); // 가운데 맞춤 칸: 줄마다 띄어 잇되 '하기'만 붙인다(비교/하기)
      };
      const noOf = (c) => {
        const nums = c.lines.map((l) => norm(l.t)).filter((t) => /^\d{1,2}$/.test(t));
        if (nums.length >= 2) return `${nums[0]}~${nums[nums.length - 1]}`; // 한 칸에 번호가 세로로 쌓인 것(17 / 18) = 두 차시 묶음
        return (norm(c.text).match(/\d+(?:[~〜∼\-–]\d+)?/) || [''])[0].replace(/[〜∼\-–]/g, '~');
      };
      for (const r of g.rows) {
        const row = {
          stage: stageOf(r),
          no: noOf(cell(r, roles.no)),
          title: fixText(joinItems(cell(r, roles.title).lines, rightOf(cell(r, roles.title).lines), { bullets: false, ...P }).join(' ')), // 왼쪽 맞춤 칸: 가장 긴 줄이 칸 끝
          contents: joinItems(cell(r, roles.contents).lines, g.cols[roles.contents + 1], { bullets: true, ...P }),
          bookPages: (norm(cell(r, roles.book).text).match(/\d+(?:[~〜∼\-–]\d+)?/) || [''])[0].replace(/[〜∼\-–]/g, '~'),
          materials: joinMaterials(cell(r, roles.materials).lines, g.cols[roles.materials + 1]),
        };
        if (!row.title) continue;
        if (!row.no) { if (!row.contents.length) continue; row.no = '?'; }
        if (!row.stage && planRows.length) row.stage = planRows[planRows.length - 1].stage;
        planRows.push(row);
      }
    }
  }
  planRows.forEach((r, i) => {
    if (/\d/.test(r.no)) return;
    const prev = i > 0 ? +(planRows[i - 1].no.match(/\d+$/) || [0])[0] : 0;
    const nextRow = planRows.slice(i + 1).find((x) => /\d/.test(x.no));
    const next = nextRow ? +nextRow.no.match(/^\d+/)[0] : prev + 2;
    r.no = next - prev === 2 ? String(prev + 1) : `${prev + 1}~${next - 1}`;
    warnings.push(`${unit.id} 차시 번호 없는 행 → ${r.no} '${r.title}'로 추정`);
  });
  if (!planRows.length) warnings.push(`${unit.id} '${unit.title}' 전개 계획 표 없음`);

  // 단원 평가 중점 표(번호 | 지식·이해 | 과정·기능 | 가치·태도) → 구분별로 준거를 모은다
  const ev = sec('단원평가중점');
  if (ev) {
    const pgs = [ev.n]; if (ev.end && ev.end.n !== ev.n) for (let n = ev.n + 1; n <= ev.end.n; n++) pgs.push(n);
    const byCat = CATS.map(() => []);
    for (const n of pgs) {
      const g = mgrid(page(n), n === ev.n ? ev.y + 0.012 : 0.05, ev.end && ev.end.n === n ? ev.end.y : 0.95);
      if (!g || g.cols.length - 1 < 3) continue;
      const roles = columnRoles(g, { k: /지식/, p: /과정/, a: /가치/ });
      const idx = [roles.k, roles.p, roles.a].every((i) => i >= 0) ? [roles.k, roles.p, roles.a] : [g.cols.length - 4, g.cols.length - 3, g.cols.length - 2];
      for (const r of g.rows) idx.forEach((ci, i) => byCat[i].push(...criteriaOf(r.cells[ci].lines, g.cols[ci + 1], P)));
    }
    CATS.forEach((c, i) => { if (byCat[i].length) unit.evaluation.push({ stage: c, content: '', criteria: byCat[i] }); });
    if (!unit.evaluation.length) warnings.push(`${unit.id} 단원 평가 중점 표 못 읽음 p${ev.n}`);
  } else warnings.push(`${unit.id} 단원 평가 중점 절 없음`);

  // 차시 쪽 → 전개 계획 행에 붙인다(차시 번호로). 지도서 쪽 = 이름표 쪽부터 다음 이름표 쪽 앞까지.
  for (const r of planRows) {
    const lesson = { stage: r.stage, no: r.no, title: r.title, contents: r.contents, bookPages: r.bookPages, guidePages: '', materials: r.materials };
    let li = lessonPages.findIndex((x) => x.no === r.no);
    if (li < 0) li = lessonPages.findIndex((x) => x.no.split('~')[0] === r.no.split('~')[0]);
    if (li >= 0) {
      const lp = lessonPages[li], lastPdf = (lessonPages[li + 1]?.n ?? Math.min(end + 1, lp.n + 4)) - 1;
      lesson.guidePages = `${lp.n + offset}~${lastPdf + offset}`;
      const lpData = parseLessonPage(lp.n);
      if (lpData.materials && !lesson.materials) lesson.materials = lpData.materials;
      if (lpData.materials) lesson.pageMaterials = lpData.materials;
      delete lpData.materials;
      Object.assign(lesson, lpData);
    } else warnings.push(`${unit.id} ${r.no}차시 쪽을 못 찾음`);
    unit.lessons.push(lesson);
  }
  const noPage = lessonPages.filter((x) => !unit.lessons.some((l) => l.guidePages && l.guidePages.startsWith(String(x.n + offset))));
  if (noPage.length) warnings.push(`${unit.id} 전개 계획에 없는 차시 쪽: ${noPage.map((x) => `${x.no}(p${x.n})`).join(' ')}`);
  unit.standards.primary = [...new Set(unit.standards.primary)];
  books[bookIdx].units.push(unit);
});

// ---------- 출력 ----------
const counts = { units: 0, lessons: 0, contents: 0, evaluation: 0, lessonsWithGoal: 0 };
for (const b of books) for (const u of b.units) {
  counts.units++; counts.lessons += u.lessons.length; counts.evaluation += u.evaluation.reduce((n, e) => n + e.criteria.length, 0);
  for (const l of u.lessons) { counts.contents += l.contents.length; if (l.goal) counts.lessonsWithGoal++; }
}
const out = {
  _meta: {
    title: '꼬박꼬박 IEP — 기본교육과정 수학 초등 3~4학년군 교사용 지도서 단원·차시 자료 (curriculum-guide-math34)',
    subject: '수학', gradeCode: 4, gradeLabel: '초등 3~4학년군',
    createdAt: new Date().toISOString().slice(0, 10),
    source: '2022 개정 특수교육 기본교육과정 초등학교 3~4학년군 수학 ③·④ 교사용 지도서(교육부) — 사용자가 준 PDF(06_분석문서/수학34 지도서 PDF.pdf, 652쪽 합본)',
    method: 'PDF 글자 층(pdftotext -bbox-layout → scripts/pdf-text-xy.mjs) + 괘선 좌표로 표를 행·열로 나눠 읽음(scripts/parse-math-guide34.mjs, 공용 scripts/lib/guideGrid.mjs).',
    pageNote: '지도서 인쇄 쪽 = PDF 쪽 + 1(③권) / + 2(④권). guidePage/guidePages는 인쇄 쪽. 차시 쪽은 왼쪽 면 "N 차시" 이름표로 찾았다(전개 계획 표에 지도서 쪽수 열이 없음).',
    copyright: '단원명·성취기준 코드·핵심 아이디어·내용 요소·차시명·내용 및 활동·학습 목표·지도 중점·준비물·평가 기준만 담음(수업 절차 본문·해설은 없음). 내부 참고용.',
    schema: 'books[{book,key,units[{no,title,id,guidePage,standards{primary[],related[]},commentary,keyIdea,goals[(구분: 내용 요소)],considerations[],lessons[{stage(소단원),no,title,contents[],bookPages,guidePages,materials,pageMaterials,goal,focus,notes[],evalPoints[],intro[],activities[],wrapup[],evalRefs[{content(구분),criteria[]}]}],evaluation[{stage(구분),content,criteria[]}],cautions[],homeLinks[],vocabulary[],teachingPoints[]}]}]',
    counts,
  },
  books,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`, counts);
for (const b of books) for (const u of b.units) {
  const missing = u.lessons.filter((l) => !l.goal).map((l) => l.no);
  console.log(`${u.id} ${u.title} p${u.guidePage} 주요[${u.standards.primary}] 목표${u.goals.length} 차시${u.lessons.length}(${u.lessons.map((l) => l.no).join(' ')}) 평가${u.evaluation.map((e) => e.criteria.length).join('/')}${missing.length ? ` 목표없는차시[${missing}]` : ''}`);
}
if (warnings.length) console.log('warnings:\n  ' + warnings.join('\n  '));
