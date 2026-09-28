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

// ---------- 공용 도구(scripts/lib/guideGrid.mjs) ----------
import { loadPages, norm, key, isBullet, fixText, joinItems, grid, runDebugGrid, sectionsOfPages, bulletsOf, splitMarked, parseOutline, criteriaOf, pageRange, splitByGap, codesInFor } from './lib/guideGrid.mjs';
const { pages, page } = loadPages(xyPath, rulesPath);
const codesIn = codesInFor('국\\s*어?', '2국어');
runDebugGrid(page);

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

const sectionsOf = (pageNos) => sectionsOfPages(page, pageNos, isHeading);

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
