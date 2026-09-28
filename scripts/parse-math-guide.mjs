// 기본교육과정 수학 1~2학년군 교사용 지도서(수학 ①~② 합본 PDF, 670쪽) → public/data/curriculum-guide-math12.json
//
// 0928: 국어(parse-korean-guide.mjs, mds/38)에 이어 사용자가 준 수학 지도서. 같은 파이프라인(좌표 OCR + 괘선 격자,
//   scripts/lib/guideGrid.mjs)이되 단원 템플릿이 다르다:
//   단원 시작 쪽: 큰 번호 + '단원 개관' 알약(x≈0.31~0.34) + 왼 띠에 큰 단원 제목(꼬리말엔 제목이 없다)
//   → 핵심역량 → 성취기준 및 해설(주요/관련 표 + 해설 문단) → 단원 목표(구분: 지식·이해/과정·기능/가치·태도 | 목표)
//   → 단원의 전개 계획(차시 | 소단원(병합) | 차시명 | 주요 학습 내용 | 교수·학습 자료 | 교과서 쪽수 | 지도서 쪽수)
//   → 단원 연계 → 단원 평가(차시명 | 평가 기준 "- …는가?") → 단원 지도 시 유의 사항 → 가정 및 생활과의 연계. 핵심 어휘는 없다.
//   차시 쪽(왼쪽 면 왼 단): 학습 목표(1. 2.) · 학습 개요(1. 2. 3.) 또는 수업의 흐름(도입/활동/정리 표) · 교수·학습 자료(학급별/학생별)
//   · 중점 지도 사항(1. 2.). 오른쪽 면: 교과서 그림 + 도입/활동 N/정리 띠.
//   ①권 8단원, ②권 10단원. 인쇄 쪽 = PDF 쪽 + 1(①) / + 2(②) — 꼬리말 "72 | 교수·학습의 실제" / "수학 | 73"으로 잰다.
//   단계(stage) 자리에 소단원 이름을 넣는다(기초/기본/실천 구분이 없음).
//
// 사용법(PDF는 저장소 밖 06_분석문서/에 두고 커밋하지 않는다):
//   swiftc -O -o /tmp/pdf-ocr-xy scripts/pdf-ocr-xy.swift ; swiftc -O -o /tmp/pdf-rules scripts/pdf-rules.swift
//   /tmp/pdf-ocr-xy "…/수학 ①~② 교사용지도서.pdf" > /tmp/math-xy.txt   (약 7분)
//   /tmp/pdf-rules  "…/수학 ①~② 교사용지도서.pdf" > /tmp/math-rules.txt (약 1분)
//   node scripts/parse-math-guide.mjs /tmp/math-xy.txt /tmp/math-rules.txt
//   DEBUG_GRID="쪽,yTop,yBottom" 로 표 하나를 찍어 볼 수 있다.

import fs from 'fs';
import path from 'path';
import { loadPages, norm, key, fixText, joinItems, grid, runDebugGrid, sectionsOfPages, bulletsOf, splitMarked, numberedItems, parseOutline, criteriaOf, pageRange, codesInFor, columnRoles, stripBullet, PARTICLE_END } from './lib/guideGrid.mjs';

const [xyPath, rulesPath] = process.argv.slice(2);
if (!xyPath || !rulesPath) { console.error('usage: node scripts/parse-math-guide.mjs <math-xy.txt> <math-rules.txt>'); process.exit(1); }
const OUT = path.join(process.cwd(), 'public/data/curriculum-guide-math12.json');
const { pages, page } = loadPages(xyPath, rulesPath);
const codesIn = codesInFor('수\\s*학?', '2수학');
const GRID = { clusterV: true, thinLeftEdge: true, headerExclude: ['단원', '관련'] }; // 수학 표 특성(옅고 끊긴 세로선·'단원 도입' 칸)
const mgrid = (p, a, b, x) => grid(p, a, b, x, GRID);
runDebugGrid(page, GRID);

// ---------- 단원 찾기 ----------
const HEADINGS = new Set(['핵심역량', '성취기준및해설', '단원목표', '단원의전개계획', '단원연계', '단원평가', '단원지도시유의사항', '가정및생활과의연계']);
const isStartPill = (l) => key(l.t) === '단원개관' && l.x0 >= 0.29 && l.x0 <= 0.36 && l.y < 0.2;
const isHeading = (l) => (HEADINGS.has(key(l.t)) && l.x0 < 0.27 && (l.x1 - l.x0) < 0.3) || isStartPill(l);
const sectionsOf = (pageNos) => sectionsOfPages(page, pageNos, isHeading);

const sortedPages = [...pages.keys()].sort((a, b) => a - b);
const unitStarts = sortedPages.filter((n) => page(n).lines.some(isStartPill));
// 권 경계: '「수학 교사용 지도서」 구성 체제' 안내 쪽의 '단원 개관'(왼쪽 x≈0.19, 쪽 중간)이 권마다 한 번 나온다.
const guidePages = sortedPages.filter((n) => page(n).lines.some((l) => key(l.t) === '단원개관' && l.x0 < 0.25 && l.y > 0.3 && l.y < 0.5));
const bookBoundary = guidePages[1] || Infinity;
if (unitStarts.length !== 18) console.warn(`단원 시작 쪽 ${unitStarts.length}개(18개 기대): ${unitStarts.join(' ')}`);

const unitTitle = (n) => {
  const ls = page(n).lines.filter((l) => l.x1 < 0.3 && l.y > 0.17 && l.y < 0.5 && !/^[\dlI|.\s]+$/.test(l.t) && l.t.length >= 2).sort((a, b) => a.y - b.y);
  return fixText(ls.map((l) => l.t).join(' ')).replace(/\s*\(?\s*(\d)\s*\)$/, '($1)');
};
const pageOffset = (start) => {
  for (let n = start; n <= start + 3; n++) {
    for (const l of page(n).lines) {
      if (l.y < 0.93) continue;
      let m = l.t.match(/^(\d{2,3})\s*[|ㅣI1]?\s*교수/); if (m) return +m[1] - n;
      m = l.t.match(/수학\s*[|ㅣI]?\s*(\d{2,3})\s*$/); if (m) return +m[1] - n;
    }
  }
  return start < bookBoundary ? 1 : 2;
};
const catName = (t) => { const k = norm(t); return /지식/.test(k) ? '지식·이해' : /과정/.test(k) ? '과정·기능' : /가치/.test(k) ? '가치·태도' : k; };
const cleanMaterials = (items) => items.map((t) => t.replace(/[㉮㉯㉰㉱ⓐⓑ⊕㊉◎○●□■◆◇▶▷☞]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);

// ---------- 차시 쪽 ----------
const LESSON_LABELS = new Set(['학습목표', '학습개요', '수업의흐름', '교수학습자료', '중점지도사항', '단원도입이야기', '활용팁', '평가']);
function parseLessonPage(n) {
  const p = page(n); if (!p) return {};
  const left = p.lines.filter((l) => l.x0 < 0.47 && l.x1 < 0.5 && l.y < 0.945);
  const labels = left.filter((l) => LESSON_LABELS.has(key(l.t)) && (l.x1 - l.x0) < 0.22).sort((a, b) => a.y - b.y);
  const out = {};
  const between = (a, b) => left.filter((l) => l.y > a.y + 0.004 && (!b || l.y < b.y - 0.004) && !labels.includes(l));
  labels.forEach((lab, i) => {
    const k = key(lab.t), body = between(lab, labels[i + 1]);
    if (k === '학습목표') { const g = numberedItems(body, 0.44); out.goal = (g.length ? g : splitMarked(body, 0.44)).join(' '); if (/다$/.test(out.goal)) out.goal += '.'; }
    else if (k === '학습개요') out.activities = numberedItems(body, 0.44);
    else if (k === '수업의흐름') Object.assign(out, parseOutline(body, { labels: [['도입', 'intro'], ['활동', 'activities'], ['정리', 'wrapup']], labelMaxX: 0.13, itemMinX: 0.12, right: 0.44 }));
    else if (k === '교수학습자료') {
      // "㉮ 학급별: …" / "<활동 1> 학생별: …" 줄마다 항목, 이어지는 줄은 잇는다.
      const items = []; let cur = null, prevX1 = 0;
      for (const l of [...body].sort((a, b) => a.y - b.y)) {
        const t = l.t.replace(/^[㉮㉯㉰㉱ⓐⓑ⊕㊉◎○●•·+]\s*/, '').trim();
        if (!cur || /^(<\s*활동|\(활동|학급별|학생별|교사|학생)/.test(t) || l.x0 < 0.075) { if (cur) items.push(cur); cur = t; }
        else cur += (prevX1 >= 0.44 - 0.013 && !PARTICLE_END.test(cur) ? '' : ' ') + t;
        prevX1 = l.x1;
      }
      if (cur) items.push(cur);
      out.pageMaterials = cleanMaterials(items.map(fixText)).join('; ');
    }
    else if (k === '중점지도사항') out.focus = numberedItems(body, 0.44).join(' ');
  });
  return out;
}

// ---------- 단원 파싱 ----------
const books = [{ book: '수학 ①', key: 1, units: [] }, { book: '수학 ②', key: 2, units: [] }];
const warnings = [];
unitStarts.forEach((start, idx) => {
  const end = (unitStarts[idx + 1] || sortedPages[sortedPages.length - 1] + 1) - 1;
  const bookIdx = start < bookBoundary ? 0 : 1;
  const no = String(books[bookIdx].units.length + 1);
  const offset = pageOffset(start);
  const unit = { no, title: unitTitle(start), id: `${bookIdx + 1}-${no}`, guidePage: start + offset, standards: { primary: [], related: [] }, commentary: '', goals: [], lessons: [], evaluation: [], vocabulary: [], teachingPoints: [], cautions: [] };
  const overview = [...Array(Math.min(12, end - start + 1)).keys()].map((i) => start + i);
  const secs = sectionsOf(overview);
  const sec = (name) => secs.find((s) => s.name === name);

  // 성취기준 및 해설: 코드 줄마다 주요/관련 이름표에 가까운 쪽 + 표 아래 해설 문단
  const st = sec('성취기준및해설');
  if (st) {
    const secLines = st.lines.filter((l) => l.n === st.n);
    let lastCodeY = 0;
    for (const l of secLines) if (codesIn(l.t).length) lastCodeY = Math.max(lastCodeY, l.y);
    // 주요/관련은 괘선 행으로 가른다(관련 행의 첫 줄이 주요 이름표에 더 가까울 수 있어 거리로는 안 됨). 행을 못 찾으면 이름표 거리로.
    const g = mgrid(page(st.n), st.y + 0.012, st.end && st.end.n === st.n ? st.end.y : 0.95);
    let cur = null, done = false;
    if (g) for (const r of g.rows) {
      const all = r.cells.flatMap((c) => c.lines);
      if (all.some((l) => norm(l.t) === '주요')) cur = 'primary'; else if (all.some((l) => norm(l.t) === '관련')) cur = 'related';
      const codes = codesIn(all.map((l) => l.t).join(' '));
      if (cur && codes.length) { unit.standards[cur].push(...codes); done = true; }
    }
    if (!done) {
      const yP = secLines.find((l) => norm(l.t) === '주요')?.y, yR = secLines.find((l) => norm(l.t) === '관련')?.y;
      for (const l of secLines) {
        const codes = codesIn(l.t); if (!codes.length) continue;
        const toP = yP != null ? Math.abs(l.y - yP) : Infinity, toR = yR != null ? Math.abs(l.y - yR) : Infinity;
        if (toP === Infinity && toR === Infinity) continue;
        unit.standards[toP <= toR ? 'primary' : 'related'].push(...codes);
      }
      warnings.push(`${unit.id} 성취기준 표 행을 못 찾아 이름표 거리로 나눔`);
    }
    const tail = secLines.filter((l) => l.y > lastCodeY + 0.012 && l.x0 < 0.3 && !codesIn(l.t).length);
    unit.commentary = joinItems(tail, Math.max(...tail.map((l) => l.x1), 0) + 0.007, { bullets: false }).join(' ').slice(0, 400);
  } else warnings.push(`${unit.id} 성취기준 표 없음`);

  // 단원 목표(구분 열이 병합된 표, 쪽을 넘길 수 있음)
  const go = sec('단원목표');
  if (go) {
    const pgs = [go.n]; if (go.end && go.end.n !== go.n) for (let n = go.n + 1; n <= go.end.n; n++) pgs.push(n);
    for (const n of pgs) {
      const g = mgrid(page(n), n === go.n ? go.y + 0.012 : 0.05, go.end && go.end.n === n ? go.end.y : 0.95);
      if (!g || g.cols.length - 1 < 2) continue;
      for (const r of g.rows) {
        const cat = catName(r.cells[0].regionText);
        const items = g.cols.length - 1 >= 2 ? r.cells[1].items : r.cells[0].items;
        items.forEach((it) => unit.goals.push(['지식·이해', '과정·기능', '가치·태도'].includes(cat) ? `${cat}: ${it}` : it));
      }
    }
    if (!unit.goals.length) unit.goals = bulletsOf(go.lines);
  }
  const ca = sec('단원지도시유의사항'); if (ca) unit.cautions = bulletsOf(ca.lines);

  // 단원의 전개 계획 표(쪽을 넘길 수 있음) — 머리 글자로 열 역할을 잡고, 이어지는 쪽은 앞 쪽 역할을 쓴다.
  const pl = sec('단원의전개계획');
  const planRows = [];
  if (pl) {
    const pgs = [pl.n]; if (pl.end && pl.end.n !== pl.n) for (let n = pl.n + 1; n <= pl.end.n; n++) pgs.push(n);
    let roles = null;
    for (const n of pgs) {
      const g = mgrid(page(n), n === pl.n ? pl.y + 0.012 : 0.05, pl.end && pl.end.n === n ? pl.end.y : 0.95);
      if (!g) continue;
      const nC = g.cols.length - 1;
      if (g.header) {
        const r = columnRoles(g, { no: /^차시$/, sub: /소단원/, title: /차시명/, contents: /학습내용/, materials: /자료/, book: /교과서/, guide: /지도서/ });
        if (r.title >= 0 && r.contents >= 0) roles = r; else if (!roles) { warnings.push(`${unit.id} 전개 계획 표 머리 못 읽음 p${n}: ${g.header.labels.join('|')}`); continue; }
      }
      if (!roles) { if (nC >= 7) roles = { no: 0, sub: 1, title: 2, contents: 3, materials: 4, book: 5, guide: 6 }; else continue; }
      const cell = (r, i) => (i >= 0 && i < nC ? r.cells[i] : { text: '', items: [], regionText: '', lines: [] });
      const rangesIn = (t) => [...String(t).matchAll(/(\d{1,3})\s*(?:[~〜∼\-–]\s*(\d{1,3}))?/g)].map((m) => (m[2] ? `${m[1]}~${m[2]}` : m[1]));
      for (const r of g.rows) {
        // 교과서·지도서 쪽수는 세로선이 옅어 한 칸으로 읽히기도 한다 → 두 칸의 범위를 다 모아 작은 쪽이 교과서, 큰 쪽이 지도서.
        const pageCells = [...new Set([roles.book, roles.guide].filter((i) => i >= 0))].map((i) => cell(r, i));
        const ranges = pageCells.flatMap((c) => rangesIn(c.lines.map((l) => l.t).join(' '))).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        const noCell = cell(r, roles.no);
        const row = {
          no: (norm(noCell.text || noCell.regionText).match(/\d+(?:[~〜∼\-–]\d+)?/) || [''])[0].replace(/[〜∼\-–]/g, '~'),
          mergedNo: !noCell.text && !!noCell.regionText,
          stage: fixText(cell(r, roles.sub).regionText), title: cell(r, roles.title).text, contents: cell(r, roles.contents).items,
          materials: cleanMaterials(cell(r, roles.materials).items).join(', '),
          bookPages: ranges.length >= 2 ? ranges[0] : (roles.guide !== roles.book && ranges.length === 1 && cell(r, roles.book).text ? ranges[0] : ''),
          guidePages: ranges.length >= 2 ? ranges[ranges.length - 1] : (ranges.length === 1 && !cell(r, roles.book).text ? ranges[0] : ''),
        };
        if (!row.title) continue;
        // 차시는 펼침면 2쪽(왼쪽 짝수 인쇄 쪽에서 시작). 지도서 쪽이 홀수 하나로만 읽혔으면('309') 앞 쪽을 붙인다.
        if (/^\d+$/.test(row.guidePages)) { const n = +row.guidePages; row.guidePages = n % 2 ? `${n - 1}~${n}` : `${n}~${n + 1}`; }
        if (!row.stage && planRows.length) row.stage = planRows[planRows.length - 1].stage; // 병합 소단원 칸 사이에 괘선이 하나 더 잡힌 행
        if (/^\d{4,}$/.test(row.no)) row.no = ''; // 세로로 쌓인 번호(8 9 10 11 12)가 한 줄로 읽힌 것 — 이웃 번호로 채운다
        if (!row.no) { if (!row.contents.length) continue; row.no = '?'; }
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
  planRows.forEach((r, i) => {
    if (i === 0 || /~/.test(r.no) || /~/.test(planRows[i - 1].no)) return;
    const prev = +planRows[i - 1].no, cur = +r.no;
    if (cur <= prev && (i + 1 >= planRows.length || +planRows[i + 1].no.match(/^\d+/)[0] === prev + 2)) { warnings.push(`${unit.id} 차시 ${r.no} → ${prev + 1} (앞뒤 번호로 보정)`); r.no = String(prev + 1); }
  });
  if (!planRows.length) warnings.push(`${unit.id} '${unit.title}' 전개 계획 표 없음`);

  // 단원 평가(차시명 | 평가 기준)
  const ev = sec('단원평가');
  if (ev) {
    const pgs = [ev.n]; if (ev.end && ev.end.n !== ev.n) for (let n = ev.n + 1; n <= ev.end.n; n++) pgs.push(n);
    for (const n of pgs) {
      const g = mgrid(page(n), n === ev.n ? ev.y + 0.012 : 0.05, ev.end && ev.end.n === n ? ev.end.y : 0.95);
      if (!g || g.cols.length - 1 < 2) continue;
      const nC = g.cols.length - 1;
      for (const r of g.rows) {
        const content = r.cells[0].regionText; const crit = criteriaOf(r.cells[nC - 1].lines, g.cols[nC]);
        if (content && crit.length) unit.evaluation.push({ stage: '', content, criteria: crit });
      }
    }
  }

  // 차시 쪽
  for (const r of planRows) {
    const gp = pageRange(r.guidePages);
    const lesson = { stage: r.stage, no: r.no, title: fixText(r.title), contents: r.contents, bookPages: r.bookPages, guidePages: r.guidePages, materials: r.materials };
    if (r.mergedNo) lesson.sharedLesson = true; // 한 차시(예: 1~5)에 여러 활동 행이 병합된 것
    if (gp) {
      const pdf = [gp[0] - offset, gp[1] - offset];
      if (pdf[0] >= start && pdf[1] <= end + 1) {
        const lp = parseLessonPage(pdf[0]);
        if (!lesson.materials && lp.pageMaterials) lesson.materials = lp.pageMaterials;
        delete lp.pageMaterials;
        Object.assign(lesson, lp);
        const heads = [];
        for (let n = pdf[0]; n <= pdf[1]; n++) for (const l of page(n).lines) {
          const m = l.t.match(/^활동\s*(\d+)\s+(.+)$/);
          if (m && m[2].length <= 30 && (l.x1 - l.x0) < 0.4 && l.x0 > 0.45) heads.push({ k: +m[1], t: fixText(m[2]) });
        }
        heads.sort((a, b) => a.k - b.k);
        if (heads.length) lesson.activityHeads = [...new Map(heads.map((h) => [h.k, h.t])).values()];
        if (!(lesson.activities || []).length && lesson.activityHeads) lesson.activities = lesson.activityHeads;
      } else warnings.push(`${unit.id} ${r.no}차시 지도서 쪽 ${r.guidePages} 범위 밖`);
    }
    unit.lessons.push(lesson);
  }
  unit.standards.primary = [...new Set(unit.standards.primary)];
  unit.standards.related = [...new Set(unit.standards.related)].filter((c) => !unit.standards.primary.includes(c));
  books[bookIdx].units.push(unit);
});

// ---------- 출력 ----------
const counts = { units: 0, lessons: 0, contents: 0, evaluation: 0, lessonsWithGoal: 0 };
for (const b of books) for (const u of b.units) {
  counts.units++; counts.lessons += u.lessons.length; counts.evaluation += u.evaluation.length;
  for (const l of u.lessons) { counts.contents += l.contents.length; if (l.goal) counts.lessonsWithGoal++; }
}
const out = {
  _meta: {
    title: '꼬박꼬박 IEP — 기본교육과정 수학 초등 1~2학년군 교사용 지도서 단원·차시 자료 (curriculum-guide-math12)',
    createdAt: new Date().toISOString().slice(0, 10),
    source: '2022 개정 특수교육 기본교육과정 초등학교 1~2학년군 수학 ①·② 교사용 지도서(교육부, 국립특수교육원) — 사용자가 준 PDF(06_분석문서/수학 ①~② 교사용지도서.pdf, 670쪽 합본)',
    method: 'macOS Vision OCR(좌표 포함) + 괘선 좌표로 표를 행·열로 나눠 읽음(scripts/parse-math-guide.mjs, 공용 scripts/lib/guideGrid.mjs). OCR이라 오탈자·띄어쓰기 오류가 조금 있을 수 있음.',
    pageNote: '지도서 인쇄 쪽 = PDF 쪽 + 1(①권) / + 2(②권). guidePage/guidePages는 인쇄 쪽.',
    copyright: '단원명·성취기준 코드·단원 목표·차시명·주요 학습 내용·학습 목표·중점 지도 사항·자료·평가 기준만 담음(수업 절차 본문·해설은 없음). 내부 참고용.',
    schema: 'books[{book,key,units[{no,title,id,guidePage,standards{primary[],related[]},commentary,goals[],lessons[{stage(소단원),no,title,contents[],bookPages,guidePages,materials,goal,focus,intro[],activities[],wrapup[],activityHeads[]}],evaluation[{stage,content(차시명),criteria[]}],vocabulary[],teachingPoints[],cautions[]}]}]',
    counts,
  },
  books,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`, counts);
for (const b of books) for (const u of b.units) {
  const missing = u.lessons.filter((l) => !l.goal).map((l) => l.no);
  console.log(`${u.id} ${u.title} p${u.guidePage} 주요[${u.standards.primary}] 관련[${u.standards.related}] 목표${u.goals.length} 차시${u.lessons.length}(${u.lessons.map((l) => l.no).join(' ')}) 평가${u.evaluation.length}${missing.length ? ` 목표없는차시[${missing}]` : ''}`);
}
if (warnings.length) console.log('warnings:\n  ' + warnings.join('\n  '));
