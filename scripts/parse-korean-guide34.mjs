// 기본교육과정 국어 3~4학년군 교사용 지도서(국어 ③·④ 합본 PDF, 884쪽, 미래엔) → public/data/curriculum-guide-kor34.json
//
// 0929: 1~2학년군(parse-korean-guide.mjs, mds/38)·수학(parse-math-guide.mjs, mds/39)에 이어 사용자가 준 3~4학년군 지도서.
//   이 PDF는 글자 층이 온전하므로(pdftotext) OCR 대신 scripts/pdf-text-xy.mjs로 xy 파일을 만들고, 표는 괘선 격자(scripts/lib/guideGrid.mjs)로 읽는다.
//   단원 템플릿이 1~2학년군과 다르다(출판사 미래엔):
//   단원 시작 쪽: 큰 번호 띠 + '단원의 개관'(x≈0.33/0.35) → 교육과정의 성취기준([4국어01-01] 목록, 주요/관련 구분 없음) → 단원 목표(총괄 목표 + • 하위 목표)
//   → (다음 쪽) 단원 지도 계획 표: 구분(소단원, 병합) | 차시 | 학습 내용(=차시명) | 학습 활동(•) | 교과서 쪽수  ※ 지도서 쪽수 열이 없다
//   → 단원 평가: 가. 평가 목표 · 나. 평가 기준 표(평가 내용 | 평가 준거 "~할 수 있다." | 성취기준) · 다. 평가의 유의점
//   → 단원 연계 표 · 가정 및 생활과의 연계 표(학습 목표 | 핵심역량 | 가정 및 일상생활) · 핵심 어휘(그림 낱말 8개)
//   차시 쪽(왼쪽 면 왼 단): 'N차시'(x<0.2) + '교과서 N~M쪽' · 학습 목표 · 교수•학습 자료 · 교수•학습 개요(도입/활동 이름/정리 및 확인 표)
//     · 지도상의 유의점 · 평가. 글머리표가 그림이라 글자 층에 없어 문장 끝으로 항목을 나눈다(sentenceItems).
//   ③권 10단원 + ④권 10단원(준비·책 읽기 단원 없음). 인쇄 쪽 = PDF 쪽 − 6(③) / − 14(④) — 꼬리말 숫자로 권마다 잰다.
//   ④권은 여백이 달라 제목·이름표 x가 0.04쯤 오른쪽이고 꼬리말이 y≈0.922에 있다.
//   단계(stage) 자리에 소단원 이름(단원 열기 / 소리 듣고 낱말 말하기 / … / 놀이로 배워요 / 단원 정리)을 넣는다.
//
// 사용법(PDF는 저장소 밖 06_분석문서/에 두고 커밋하지 않는다):
//   pdftotext -bbox-layout "…/초_지도서_국어 3_4 지도서_….pdf" /tmp/kor34-bbox.html     # 2초
//   node scripts/pdf-text-xy.mjs /tmp/kor34-bbox.html > /tmp/kor34-xy.txt
//   swiftc -O -o /tmp/pdf-rules scripts/pdf-rules.swift && /tmp/pdf-rules "…/초_지도서_국어 3_4 ….pdf" > /tmp/kor34-rules.txt   # 기본 문턱, 약 2분
//   node scripts/parse-korean-guide34.mjs /tmp/kor34-xy.txt /tmp/kor34-rules.txt
//   DEBUG_GRID="쪽,yTop,yBottom" 로 표 하나를 찍어 볼 수 있다.

import fs from 'fs';
import path from 'path';
import { loadPages, norm, key, isBullet, fixText, joinItems, grid, runDebugGrid, sectionsOfPages, bulletsOf, criteriaOf, sentenceItems, codesInFor, columnRoles, PARTICLE_END_EXT } from './lib/guideGrid.mjs';

const [xyPath, rulesPath] = process.argv.slice(2);
if (!xyPath || !rulesPath) { console.error('usage: node scripts/parse-korean-guide34.mjs <kor34-xy.txt> <kor34-rules.txt>'); process.exit(1); }
const OUT = path.join(process.cwd(), 'public/data/curriculum-guide-kor34.json');
const { pages, page } = loadPages(xyPath, rulesPath);
const codesIn = codesInFor('국\\s*어?', '4국어', '4');
const GRID = { headerExclude: ['단원'] }; // '단원 열기' 칸의 '단원'이 머리 글자로 오인돼 첫 행이 사라지던 것
const kgrid = (p, a, b, x) => grid(p, a, b, x, GRID);
runDebugGrid(page, GRID);
const P = { particle: PARTICLE_END_EXT };

// ---------- 단원 찾기 ----------
const sortedPages = [...pages.keys()].sort((a, b) => a - b);
const isStartPill = (l) => key(l.t) === '단원의개관' && l.x0 >= 0.3 && l.x0 <= 0.38 && l.y < 0.2;
const unitStarts = sortedPages.filter((n) => page(n).lines.some(isStartPill));
// 권 경계: 앞부분 '교사용 지도서 구성' 안내 쪽의 '단원의 개관'(x≈0.23, 쪽 중간)이 권마다 한 번 나온다.
const introPages = sortedPages.filter((n) => page(n).lines.some((l) => key(l.t) === '단원의개관' && l.x0 < 0.27 && l.y > 0.4 && l.y < 0.7));
const bookBoundary = introPages[1] || Infinity;
if (unitStarts.length !== 20) console.warn(`단원 시작 쪽 ${unitStarts.length}개(20개 기대): ${unitStarts.join(' ')}`);

const HEADINGS = new Set(['단원의개관', '교육과정의성취기준', '단원목표', '단원지도계획', '단원평가', '단원연계', '가정및생활과의연계', '핵심어휘']);
const START_ONLY = new Set(['단원의개관', '교육과정의성취기준', '단원목표']);
const MID_OK = new Set(['가정및생활과의연계', '핵심어휘']); // 단원 연계 쪽의 아래쪽에 이어지는 제목
// 알약 제목은 쪽 위(y<0.2)에 있고, 단원 시작 쪽의 세 제목만 큰 번호 띠 옆(x 0.30~0.38) 아무 높이에나 있다. 표 칸 글자(예: 구분 열 '단원 정리')는 제외.
const isHeading = (l) => HEADINGS.has(key(l.t)) && (l.x1 - l.x0) < 0.3 && l.x0 < 0.45
  && (l.y < 0.2 || (START_ONLY.has(key(l.t)) && l.x0 >= 0.3 && l.x0 <= 0.38) || (MID_OK.has(key(l.t)) && l.x0 < 0.3));

const footerNumber = (n) => { const l = page(n).lines.find((x) => x.y > 0.9 && /^\d{2,3}$/.test(x.t)); return l ? +l.t : null; };
const footerTitle = (n) => { for (const l of page(n).lines) { const m = l.y > 0.9 && l.x0 > 0.5 ? l.t.match(/^(\d{1,2})[.,．]\s*(.+?)\s*$/) : null; if (m) return { no: m[1], title: fixText(m[2]) }; } return null; };

// ---------- 차시 쪽 ----------
const LESSON_LABELS = new Set(['학습목표', '교수학습자료', '교수학습개요', '지도상의유의점', '평가', '지도중점', '교수학습중점요소', '평가중점']);
// 'N차시' 또는 'N~M차시' (④권 일부는 '13~14차시 교과서 138~141쪽'처럼 교과서 쪽과 한 줄로 붙는다)
const LESSON_RE = /^(\d{1,2})\s*(?:[~〜∼]\s*(\d{1,2}))?\s*차시(?:\s+교과서\s*(\d+(?:\s*[~〜∼]\s*\d+)?)\s*쪽)?$/;
const lessonLabelOf = (l) => { const m = l.t.match(LESSON_RE); return m && l.x0 < 0.2 && l.y < 0.25 ? (m[2] ? `${m[1]}~${m[2]}` : m[1]) : null; };
const lessonBookPages = (l) => { const m = l.t.match(LESSON_RE); return m && m[3] ? m[3].replace(/\s/g, '').replace(/[〜∼]/g, '~') : ''; };
function parseLessonPage(n, footerY) {
  const p = page(n); if (!p) return {};
  const left = p.lines.filter((l) => l.x0 < 0.47 && l.x1 < 0.5 && l.y < footerY);
  const labels = left.filter((l) => LESSON_LABELS.has(key(l.t)) && (l.x1 - l.x0) < 0.2 && l.x0 < 0.16).sort((a, b) => a.y - b.y);
  const lx = labels[0]?.x0 ?? 0.06; // 이름표 왼쪽 끝(③ 0.06 · ④ 0.11) — 개요 표의 이름표 열·항목 열을 이것에 상대적으로 잡는다
  const rightOf = (ls) => Math.max(0.3, ...ls.map((l) => l.x1)) + 0.007; // 그 문단의 가장 긴 줄 = 왼 단 오른쪽 끝(③ ≈0.427 · ④ ≈0.434)
  const out = {};
  const between = (a, b) => left.filter((l) => l.y > a.y + 0.004 && (!b || l.y < b.y - 0.004) && !labels.includes(l));
  labels.forEach((lab, i) => {
    const k = key(lab.t), body = between(lab, labels[i + 1]), right = rightOf(body);
    if (k === '학습목표') { out.goal = joinItems(body, right, { bullets: false, ...P }).join(' '); if (/다$/.test(out.goal)) out.goal += '.'; }
    else if (k === '교수학습자료') out.materials = sentenceItems(body, right).join('; ');
    else if (k === '지도상의유의점') out.notes = sentenceItems(body, right);
    else if (k === '평가') out.evalPoints = sentenceItems(body, right);
    else if (k === '지도중점' || k === '평가중점' || k === '교수학습중점요소') out.focus = sentenceItems(body, right).join(' ');
    else if (k === '교수학습개요') Object.assign(out, parseOutline34(body, lx, right, n));
  });
  return out;
}
// 교수•학습 개요 표: 왼쪽 좁은 열에 이름표(도입 / 활동 이름이 '학습·내용·살펴·보기'처럼 여러 줄로 쌓임 / 정리 및 확인), 오른쪽에 • 항목.
//   이름표 줄을 세로 간격으로 묶어 이름을 만들고, 항목은 세로로 가장 가까운 이름표 묶음에 붙인다.
//   쌓인 이름표는 낱말 사이가 끊겨 붙으므로(살펴 보기), 같은 펼침면에서 같은 글자열(띄어쓰기 무시)의 줄을 찾아 그 표기를 쓴다.
function parseOutline34(lines, lx, right, n) {
  const labs = lines.filter((l) => l.x0 < lx + 0.03 && l.x1 < lx + 0.08 && !isBullet(l.t)).sort((a, b) => a.y - b.y);
  const items = lines.filter((l) => !labs.includes(l) && l.x0 >= lx + 0.03).sort((a, b) => a.y - b.y);
  const groups = [];
  for (const l of labs) { const g = groups[groups.length - 1]; if (g && l.y - g.lines[g.lines.length - 1].y < 0.022) { g.lines.push(l); } else groups.push({ lines: [l] }); }
  const spread = [...(page(n)?.lines || []), ...(page(n + 1)?.lines || [])];
  for (const g of groups) {
    g.y0 = g.lines[0].y; g.y1 = g.lines[g.lines.length - 1].y; g.yc = (g.y0 + g.y1) / 2;
    const raw = g.lines.map((l) => l.t).join(' ');
    const hit = spread.find((l) => norm(l.t) === norm(raw) && l !== g.lines[0] && (l.x1 - l.x0) > 0.06);
    g.name = fixText(hit ? hit.t : raw);
  }
  const out = { intro: [], activities: [], wrapup: [], activityHeads: [] };
  const buckets = groups.map(() => []);
  for (const it of items) {
    let best = -1, bestD = Infinity;
    groups.forEach((g, gi) => { const d = it.y < g.y0 - 0.012 ? g.y0 - it.y : it.y > g.y1 + 0.012 ? it.y - g.y1 : 0; if (d < bestD) { bestD = d; best = gi; } });
    if (best >= 0) buckets[best].push(it);
  }
  groups.forEach((g, gi) => {
    const its = joinItems(buckets[gi], right, { bullets: true, ...P });
    const k = norm(g.name);
    if (/^도입/.test(k)) out.intro.push(...its);
    else if (/^정리/.test(k)) out.wrapup.push(...its);
    else if (/^전개/.test(k)) out.activities.push(...its);
    else { out.activities.push(...its); if (its.length) out.activityHeads.push(g.name); }
  });
  if (!out.activityHeads.length) delete out.activityHeads;
  return out;
}

// ---------- 단원 파싱 ----------
const books = [{ book: '국어 ③', key: 3, units: [] }, { book: '국어 ④', key: 4, units: [] }];
const warnings = [];
unitStarts.forEach((start, idx) => {
  const bookIdx = start < bookBoundary ? 0 : 1;
  const end = Math.min((unitStarts[idx + 1] || sortedPages[sortedPages.length - 1] + 1) - 1, bookIdx === 0 ? bookBoundary - 1 : Infinity);
  const footerY = bookIdx === 0 ? 0.945 : 0.915; // ④권 꼬리말 y≈0.922
  let offset = null;
  for (let n = start; n <= start + 2 && offset == null; n++) { const f = footerNumber(n); if (f != null) offset = f - n; }
  if (offset == null) { offset = bookIdx === 0 ? -6 : -14; warnings.push(`p${start} 꼬리말 쪽 번호 못 찾음 → 오프셋 ${offset}`); }
  const ft = [start + 1, start + 3, start + 5].map(footerTitle).find(Boolean);
  const no = ft ? ft.no : String(books[bookIdx].units.length + 1);
  const unit = { no, title: ft ? ft.title : '', id: `${books[bookIdx].key}-${no}`, guidePage: start + offset, standards: { primary: [], related: [] }, goals: [], lessons: [], evaluation: [], vocabulary: [], teachingPoints: [], cautions: [] };
  if (!ft) warnings.push(`${unit.id} 꼬리말 단원 제목 못 찾음`);

  // 차시 쪽 목록(왼쪽 면 'N차시' 이름표) — 개관 쪽 범위는 첫 차시 쪽 앞까지
  const lessonPages = [];
  for (let n = start + 1; n <= end; n++) { const l = page(n).lines.find(lessonLabelOf); if (l) lessonPages.push({ n, no: lessonLabelOf(l), bookPages: lessonBookPages(l) || (page(n).lines.find((x) => /^교과서\s*\d/.test(x.t) && Math.abs(x.y - l.y) < 0.01)?.t || '').replace(/교과서|쪽|\s/g, '').replace(/[〜∼]/g, '~') }); }
  const firstLesson = lessonPages[0]?.n ?? Math.min(end, start + 8);
  const overview = []; for (let n = start; n < firstLesson && n <= end; n++) overview.push(n);
  const secs = sectionsOfPages(page, overview, isHeading, { footerY });
  const sec = (name) => secs.find((s) => s.name === name);

  const st = sec('교육과정의성취기준');
  if (st) unit.standards.primary = codesIn(st.lines.map((l) => l.t).join(' '));
  else warnings.push(`${unit.id} 성취기준 절 없음`);
  const go = sec('단원목표');
  if (go) unit.goals = bulletsOf(go.lines.filter((l) => l.x0 > 0.28)); // 첫 줄(글머리표 없음)이 총괄 목표, 그 뒤 • 하위 목표

  // 단원 지도 계획 표(구분 | 차시 | 학습 내용 | 학습 활동 | 교과서 쪽수). 구분·차시 사이 세로선이 옅어 한 칸으로 잡히면 x로 나눈다.
  const pl = sec('단원지도계획');
  const planRows = [];
  if (pl) {
    const pgs = [pl.n]; if (pl.end && pl.end.n !== pl.n) for (let n = pl.n + 1; n <= pl.end.n; n++) pgs.push(n);
    let roles = null;
    for (const n of pgs) {
      const g = kgrid(page(n), n === pl.n ? pl.y + 0.015 : 0.05, pl.end && pl.end.n === n ? pl.end.y : 0.95);
      if (!g) continue;
      const nC = g.cols.length - 1;
      if (g.header) {
        const r = columnRoles(g, { stage: /구분|제재명|구성/, no: /^차시$/, title: /학습내용/, contents: /학습활동/, book: /교과서|쪽수/ }); // ④-4는 첫 열 머리가 '제재명'
        if (r.title >= 0 && r.contents >= 0) { roles = r; if (roles.stage < 0) roles.stage = 0; } else if (!roles) { warnings.push(`${unit.id} 지도 계획 표 머리 못 읽음 p${n}: ${g.header.labels.join('|')}`); continue; }
      }
      if (!roles) { if (nC >= 4) roles = nC >= 5 ? { stage: 0, no: 1, title: 2, contents: 3, book: 4 } : { stage: 0, no: -1, title: 1, contents: 2, book: 3 }; else continue; }
      const cell = (r, i) => (i >= 0 && i < nC ? r.cells[i] : { text: '', items: [], regionText: '', lines: [], region: -1 });
      const split = roles.no < 0 || roles.no === roles.stage; // 구분+차시 한 칸
      const splitX = g.cols[roles.stage] + 0.09;
      const stageOf = (r) => {
        const reg = cell(r, roles.stage).region;
        const ls = g.rows.filter((row) => cell(row, roles.stage).region === reg).flatMap((row) => cell(row, roles.stage).lines).filter((l) => !split || (l.x0 + l.x1) / 2 <= splitX);
        return fixText(joinItems(ls, g.cols[roles.stage + 1], { bullets: false, centered: true, ...P }).join(' ')).replace(/^\d{1,2}\.\s*/, '');
      };
      for (const r of g.rows) {
        const noLines = split ? cell(r, roles.stage).lines.filter((l) => (l.x0 + l.x1) / 2 > splitX) : cell(r, roles.no).lines;
        const row = {
          stage: stageOf(r),
          no: (norm(noLines.map((l) => l.t).join(' ')).match(/\d+(?:[~〜∼\-–]\d+)?/) || [''])[0].replace(/[〜∼\-–]/g, '~'),
          title: fixText(cell(r, roles.title).text), contents: joinItems(cell(r, roles.contents).lines, g.cols[roles.contents + 1], { bullets: true, ...P }),
          bookPages: (norm(cell(r, roles.book).text).match(/\d+(?:[~〜∼\-–]\d+)?/) || [''])[0].replace(/[〜∼\-–]/g, '~'),
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
  if (!planRows.length) warnings.push(`${unit.id} '${unit.title}' 지도 계획 표 없음`);

  // 단원 평가: 가. 평가 목표 / 나. 평가 기준 표 / 다. 평가의 유의점
  const ev = sec('단원평가');
  if (ev) {
    const sub = (re) => ev.lines.find((l) => re.test(norm(l.t)) && l.x0 < 0.3);
    const a = sub(/^가\.?평가목표/), b = sub(/^나\.?평가기준/), c = sub(/^다\.?평가의유의점/);
    if (a) unit.evalGoal = bulletsOf(ev.lines.filter((l) => l.n === a.n && l.y > a.y + 0.004 && (!b || l.y < b.y - 0.004))).join(' ');
    if (b) {
      const g = kgrid(page(b.n), b.y + 0.008, c && c.n === b.n ? c.y - 0.004 : 0.95);
      if (g && g.cols.length - 1 >= 2) {
        const nC = g.cols.length - 1;
        for (const r of g.rows) {
          const content = fixText(r.cells[0].regionText); if (!content) continue;
          const crit = criteriaOf(r.cells[1].lines, g.cols[2], P);
          const codes = nC >= 3 ? codesIn(r.cells[nC - 1].regionText) : [];
          unit.evaluation.push({ stage: '', content, criteria: crit, ...(codes.length ? { codes } : {}) });
        }
      } else warnings.push(`${unit.id} 평가 기준 표 못 읽음 p${b.n}`);
    }
    if (c) unit.evalNotes = bulletsOf(ev.lines.filter((l) => l.n === c.n && l.y > c.y + 0.004));
  } else warnings.push(`${unit.id} 단원 평가 절 없음`);

  // 가정 및 생활과의 연계 표(학습 목표 | 핵심역량 | 가정 및 일상생활) — 괘선이 없어 머리 글자 x로 열을 나눈다
  const hm = sec('가정및생활과의연계');
  if (hm) {
    const hc = hm.lines.find((l) => norm(l.t) === '핵심역량'), hh = hm.lines.find((l) => /^가정및일상생활/.test(norm(l.t)));
    if (hc && hh) {
      const body = hm.lines.filter((l) => l.y > hh.y + 0.004);
      unit.competencies = joinItems(body.filter((l) => l.x0 >= hc.x0 - 0.1 && l.x0 < hh.x0 - 0.08), hh.x0 - 0.08, { bullets: true, ...P });
      unit.homeLinks = joinItems(body.filter((l) => l.x0 >= hh.x0 - 0.08), 0.9, { bullets: true, ...P });
    }
  }
  // 핵심 어휘: 그림 아래 짧은 낱말
  const vo = sec('핵심어휘');
  if (vo) {
    const cand = vo.lines.filter((l) => !isBullet(l.t) && l.t.length <= 12 && (l.x1 - l.x0) < 0.2 && l.x0 > 0.14 && !/^\d+$/.test(l.t) && !/[.쪽]$|교수|학습의 실제|성취기준|참고/.test(l.t)).sort((a, b) => a.y - b.y);
    const rows = []; // 같은 높이(±0.006)의 낱말 묶음 — 그림 낱말은 한 줄에 4개씩 두 줄, 그림 속 글자는 홀로 있다
    for (const l of cand) { const r = rows[rows.length - 1]; if (r && Math.abs(l.y - r[0].y) < 0.006) r.push(l); else rows.push([l]); }
    unit.vocabulary = rows.filter((r) => r.length >= 3).flatMap((r) => r.sort((a, b) => a.x0 - b.x0).map((l) => fixText(l.t))).filter(Boolean);
  }

  // 차시 쪽 → 지도 계획 행에 붙인다(차시 번호로). 지도서 쪽 = 이름표 쪽부터 다음 이름표 쪽 앞까지.
  for (const r of planRows) {
    const lesson = { stage: r.stage, no: r.no, title: r.title, contents: r.contents, bookPages: r.bookPages, guidePages: '' };
    const li = lessonPages.findIndex((x) => x.no === r.no) >= 0 ? lessonPages.findIndex((x) => x.no === r.no) : lessonPages.findIndex((x) => x.no.split('~')[0] === r.no.split('~')[0]);
    if (li >= 0) {
      const lp = lessonPages[li], lastPdf = (lessonPages[li + 1]?.n ?? Math.min(end + 1, lp.n + 4)) - 1;
      lesson.guidePages = `${lp.n + offset}~${lastPdf + offset}`;
      if (!lesson.bookPages && lp.bookPages) lesson.bookPages = lp.bookPages;
      Object.assign(lesson, parseLessonPage(lp.n, footerY));
    } else warnings.push(`${unit.id} ${r.no}차시 쪽을 못 찾음`);
    unit.lessons.push(lesson);
  }
  const noPage = lessonPages.filter((x) => !unit.lessons.some((l) => l.guidePages && l.guidePages.startsWith(String(x.n + offset))));
  if (noPage.length) warnings.push(`${unit.id} 지도 계획에 없는 차시 쪽: ${noPage.map((x) => `${x.no}(p${x.n})`).join(' ')}`);
  unit.standards.primary = [...new Set(unit.standards.primary)];
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
    title: '꼬박꼬박 IEP — 기본교육과정 국어 초등 3~4학년군 교사용 지도서 단원·차시 자료 (curriculum-guide-kor34)',
    subject: '국어', gradeCode: 4, gradeLabel: '초등 3~4학년군',
    createdAt: new Date().toISOString().slice(0, 10),
    source: '2022 개정 특수교육 기본교육과정 초등학교 3~4학년군 국어 ③·④ 교사용 지도서(교육부, 미래엔) — 사용자가 준 PDF(06_분석문서/초_지도서_국어 3_4 지도서_미래엔_….pdf, 884쪽 합본)',
    method: 'PDF 글자 층(pdftotext -bbox-layout → scripts/pdf-text-xy.mjs) + 괘선 좌표로 표를 행·열로 나눠 읽음(scripts/parse-korean-guide34.mjs, 공용 scripts/lib/guideGrid.mjs). 글머리표가 그림인 문단은 문장 끝으로 항목을 나눴다.',
    pageNote: '지도서 인쇄 쪽 = PDF 쪽 − 6(③권) / − 14(④권). guidePage/guidePages는 인쇄 쪽. 차시 쪽은 왼쪽 면 "N차시" 이름표로 찾았다(지도 계획 표에 지도서 쪽수 열이 없음).',
    copyright: '단원명·성취기준 코드·단원 목표·차시명·학습 활동·학습 목표·자료·평가 내용/준거·핵심 어휘만 담음(수업 절차 본문·해설은 없음). 내부 참고용.',
    schema: 'books[{book,key,units[{no,title,id,guidePage,standards{primary[],related[]},goals[],lessons[{stage(소단원),no,title,contents[],bookPages,guidePages,goal,materials,notes[],evalPoints[],intro[],activities[],wrapup[],activityHeads[]}],evaluation[{stage,content,criteria[],codes[]}],evalGoal,evalNotes[],competencies[],homeLinks[],vocabulary[],teachingPoints[],cautions[]}]}]',
    counts,
  },
  books,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB)`, counts);
for (const b of books) for (const u of b.units) {
  const missing = u.lessons.filter((l) => !l.goal).map((l) => l.no);
  console.log(`${u.id} ${u.title} p${u.guidePage} 주요[${u.standards.primary}] 목표${u.goals.length} 차시${u.lessons.length}(${u.lessons.map((l) => l.no).join(' ')}) 평가${u.evaluation.length} 어휘${u.vocabulary.length}${missing.length ? ` 목표없는차시[${missing}]` : ''}`);
}
if (warnings.length) console.log('warnings:\n  ' + warnings.join('\n  '));
