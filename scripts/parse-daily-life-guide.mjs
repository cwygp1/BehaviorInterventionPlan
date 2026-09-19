// 일상생활 활동 교사용 지도서(의사소통·자립생활) → public/data/daily-life-guide.json
//
// 배경(0919): IEP 교과 작성 때 교사가 지도서를 다시 펴야 하는 걸림돌 — 앱이 아는 교과 정보가
//   성취기준 한 문장뿐이어서. 지도서의 단원(=성취기준 문장) → 중활동(활동 목록·유의점) → 소활동
//   (절차 제목·단계·Tip)을 데이터로 만들어 교육내용·월별 프롬프트의 재료로 쓴다.
//
// 사용법(PDF는 저장소 밖 06_분석문서/에 두고 커밋하지 않는다 — 100MB 이상):
//   swiftc -O -o /tmp/pdf-text scripts/pdf-text.swift
//   /tmp/pdf-text "…/의사소통지도서.pdf" text 1 549 > /tmp/comm.txt
//   /tmp/pdf-text "…/자립생활지도서.pdf" text 1 557 > /tmp/self.txt
//   node scripts/parse-daily-life-guide.mjs /tmp/comm.txt /tmp/self.txt
//
// 구조(지도서 4권 공통 템플릿):
//   단원 12개(각 단원 = 일상생활 성취기준 1개, 단원 번호 = 그 영역 내용요소 순서의 성취기준 순서)
//   └ 활동 체계 표: 중활동 N(쪽) + 소활동 ①…  ← 이름은 이 표에서 확정(가장 깨끗함)
//   └ 중활동 개관: 활동 목록(목표 문장) · 지도 및 평가의 유의점
//   └ 소활동 N 제목 → 절차 제목(…하기) + • 단계 + Tip
// 텍스트 추출은 본문·옆단(유의점·교육과정 연계 등)이 섞여 나오므로 소활동 단계는 '최선 노력' 수준이다.
// 신체활동·여가활동 지도서는 스캔 이미지라 OCR 뒤 같은 파서를 쓴다(미착수).

import fs from 'fs';
import path from 'path';

const STANDARDS = path.join(process.cwd(), 'public/data/achievement-standards.json');
const OUT = path.join(process.cwd(), 'public/data/daily-life-guide.json');

// 책 → 내용요소(앱 성취기준 area) 순서. 단원 1~12가 이 순서의 성취기준과 1:1.
const BOOKS = [
  { key: 'comm', area: '의사소통', elements: ['의사소통의 기초', '보완대체의사소통의 탐색과 선택', '의사소통의 활용'] },
  { key: 'self', area: '자립생활', elements: ['신변 자립', '자기 관리', '안전한 생활', '자기 결정과 상호 작용'] },
];

const norm = (s) => String(s || '').replace(/\s+/g, '');
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circledNo = (ch) => CIRCLED.indexOf(ch) + 1;
const SIDEBAR = /^(교육과정 연계|유의점|전자저작물|생태학적 연계|참고 자료|일상생활 활동 연계|Tip)$/;
const FOOTER = /^(\d+ 교수·학습의 실제|\d+\. .{1,30}|\d+|[\d ]+|구분 중활동\/소활동|.{1,20}\s\d+$)$/;
const CODE_RE = /\[(\d{1,2}[가-힣]{1,4}\d{2}-\d{1,2})\]/g;

function standardsFor(book, rows) {
  const daily = rows.filter((r) => r[0] === '일상생활 활동').map((r) => ({ area: r[2], code: r[3], text: r[4] }));
  const out = [];
  for (const el of book.elements) out.push(...daily.filter((d) => d.area === el).sort((a, b) => a.code.localeCompare(b.code)));
  return out;
}

// 줄 배열 → 문장 배열(• 제거, 줄바꿈으로 끊긴 문장 잇기, '다.' 단위로 분리)
function sentences(lines) {
  const ls = lines.map((l) => l.replace(/^•\s?/, '').trim()).filter(Boolean);
  const maxLen = Math.max(0, ...ls.map((l) => l.length));
  let joined = '';
  ls.forEach((l, i) => {
    if (i === 0) { joined = l; return; }
    const prev = ls[i - 1];
    const full = prev.length >= maxLen - 3 && /[가-힣]$/.test(prev) && /^[가-힣]/.test(l);
    joined += (full ? '' : ' ') + l;
  });
  return joined.split(/(?<=다\.)\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
}

function parseBook(text, book, standards) {
  // 추출 텍스트 정리: 글머리표가 제어문자(BEL)로 나오고, 덤프의 쪽 표식(===== pN =====)이 섞여 있다.
  const L = text.split('\n')
    .map((l) => Array.from(l).filter((ch) => ch.charCodeAt(0) >= 32).join('').replace(/\s+$/, ''))
    .map((l) => (/^===== p\d+ =====$/.test(l) ? '' : l));
  // 단원 경계: "!" / <제목> / "대활동" / "의 개관"
  const starts = [];
  for (let i = 1; i + 2 < L.length; i++) {
    if (L[i + 1] === '대활동' && L[i + 2] === '의 개관' && !/^<표/.test(L[i])) starts.push(i);
  }
  if (starts.length !== 12) throw new Error(`${book.area}: 단원 경계 ${starts.length}개 (12 기대)`);
  const units = [];
  starts.forEach((s, k) => {
    const e = k + 1 < starts.length ? starts[k + 1] : L.length;
    const U = L.slice(s, e);
    const std = standards[k];
    const unitText = norm(U.join(''));
    const unit = {
      no: k + 1, title: L[s], code: std.code, standard: std.text, element: std.area,
      standardMatch: [norm(std.text), norm(std.text).replace(/하여/g, '해')].some((t) => unitText.includes(t.replace(/\.$/, ''))),
      focus: '', relatedStandards: [...new Set([...U.join('\n').matchAll(CODE_RE)].map((m) => m[1]))],
      midActivities: [],
    };
    // 주안점
    const fi = U.indexOf('주안점');
    if (fi >= 0) { const buf = []; for (let i = fi + 1; i < U.length && !FOOTER.test(U[i]); i++) buf.push(U[i]); unit.focus = buf.join(' ').trim(); }
    // 활동 체계 표 → 중활동·소활동 이름
    const ti = U.indexOf('활동 체계'), te = U.indexOf('평가의 기록과 활용');
    let cur = null;
    for (let i = ti + 1; i < (te > 0 ? te : U.length); i++) {
      const m = U[i].match(/^(\d{1,2}) (.+?) (\d+)쪽$/);
      if (m) { cur = { no: Number(m[1]), title: m[2].trim(), page: Number(m[3]), goals: [], notes: [], subActivities: [] }; unit.midActivities.push(cur); continue; }
      const c = U[i].match(/^([①-⑳]) (.+)$/);
      if (c && cur) cur.subActivities.push({ no: circledNo(c[1]), title: c[2].trim(), headings: [], steps: [], tips: [] });
    }
    // 중활동 개관 → 활동 목록·유의점
    let seen = 0;
    for (let i = 0; i < U.length; i++) {
      if (U[i] !== '중활동 개관') continue;
      let t = i - 1; while (t > 0 && /^[\d ]+$/.test(U[t])) t--;
      const mid = unit.midActivities.find((m) => norm(m.title) === norm(U[t]))
        || unit.midActivities.find((m) => norm(U[t]).includes(norm(m.title)))
        || unit.midActivities[seen]; // 제목이 줄바꿈 등으로 어긋나면 등장 순서(활동 체계 표 순서와 같음)로
      seen++;
      if (!mid) continue;
      let j = i + 1; if (U[j] === '활동 목록') j++;
      for (; j < U.length && !/유의점$/.test(U[j]); j++) { const g = U[j].match(/^\d+\.\s*(.+)$/); if (g) mid.goals.push(g[1].trim()); else if (mid.goals.length) mid.goals[mid.goals.length - 1] += ' ' + U[j].trim(); }
      const nb = []; for (j = j + 1; j < U.length && U[j] !== '참고 자료' && !/^소활동 예시$/.test(U[j]) && !FOOTER.test(U[j]); j++) nb.push(U[j]);
      mid.notes = sentences(nb);
    }
    // 소활동 본문 → 절차 제목·단계·Tip
    const subIdx = [];
    U.forEach((l, i) => { const m = l.match(/^소활동 (\d{1,2}) (.+)$/); if (m) subIdx.push({ i, no: Number(m[1]), title: m[2].trim() }); });
    subIdx.forEach((h, n) => {
      const end = n + 1 < subIdx.length ? subIdx[n + 1].i : U.length;
      // 같은 제목의 소활동을 활동 체계 표에서 찾는다(번호는 중활동마다 1부터 다시 시작).
      let sub = null;
      for (const m of unit.midActivities) { const f = m.subActivities.find((x) => norm(x.title) === norm(h.title)); if (f) { sub = f; break; } }
      if (!sub) { for (const m of unit.midActivities) { const f = m.subActivities.find((x) => x.no === h.no && !x.headings.length); if (f && norm(f.title).slice(0, 6) === norm(h.title).slice(0, 6)) { sub = f; break; } } }
      if (!sub) return;
      let mode = 'body', heading = null, tipBuf = [];
      const isHeading = (i) => { const l = U[i]; if (!l || l.startsWith('•') || SIDEBAR.test(l) || FOOTER.test(l) || /\(예시\)$|^\d+\.|^[①-⑳]/.test(l)) return false; if (l.length < 5 || l.length > 45 || !/기$/.test(l)) return false; return /^•/.test(U[i + 1] || '') || /^•/.test(U[i + 2] || ''); };
      for (let i = h.i + 1; i < end; i++) {
        const l = U[i];
        if (!l) continue;
        if (l === 'Tip') { mode = 'tip'; continue; }
        if (SIDEBAR.test(l)) { mode = 'side'; continue; }
        if (isHeading(i)) { heading = l; sub.headings.push(l); mode = 'body'; continue; }
        if (mode === 'side' || FOOTER.test(l) || /\(예시\)$/.test(l)) continue; // 사진 설명("…(예시)")은 단계가 아니다
        if (mode === 'tip') { tipBuf.push(l); continue; }
        if (heading) sub.steps.push(l);
      }
      sub.steps = sentences(sub.steps);
      sub.tips = sentences(tipBuf);
    });
    units.push(unit);
  });
  return units;
}

const [commPath, selfPath] = process.argv.slice(2);
if (!commPath || !selfPath) { console.error('usage: node scripts/parse-daily-life-guide.mjs <의사소통.txt> <자립생활.txt>'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(STANDARDS, 'utf8')).rows;
const texts = { comm: fs.readFileSync(commPath, 'utf8'), self: fs.readFileSync(selfPath, 'utf8') };
const books = BOOKS.map((b) => ({ area: b.area, elements: b.elements, units: parseBook(texts[b.key], b, standardsFor(b, rows)) }));
const out = {
  version: '2022 개정 특수교육 교육과정 일상생활 활동 교사용 지도서(의사소통·자립생활)',
  source: '교육부·국립특수교육원 일상생활 활동 교사용 지도서 PDF(06_분석문서/) — scripts/parse-daily-life-guide.mjs로 추출',
  note: '신체활동·여가활동·생활적응은 미수록(스캔 이미지·미확보). 소활동 단계는 본문·옆단이 섞인 추출 텍스트에서 뽑은 최선 노력값.',
  generated: new Date().toISOString().slice(0, 10),
  books,
};
fs.writeFileSync(OUT, JSON.stringify(out));
for (const b of books) {
  const mids = b.units.reduce((n, u) => n + u.midActivities.length, 0);
  const subs = b.units.reduce((n, u) => n + u.midActivities.reduce((m, x) => m + x.subActivities.length, 0), 0);
  const filled = b.units.reduce((n, u) => n + u.midActivities.reduce((m, x) => m + x.subActivities.filter((s) => s.steps.length).length, 0), 0);
  const goals = b.units.reduce((n, u) => n + u.midActivities.filter((x) => x.goals.length).length, 0);
  console.log(`${b.area}: 단원 ${b.units.length} · 성취기준 일치 ${b.units.filter((u) => u.standardMatch).length}/12 · 중활동 ${mids}(활동 목록 있음 ${goals}) · 소활동 ${subs}(단계 있음 ${filled})`);
}
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
