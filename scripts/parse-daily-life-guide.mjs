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
//   node scripts/parse-daily-life-guide.mjs /tmp/comm.txt /tmp/self.txt [/tmp/motor.txt /tmp/leisure.txt]
//   (신체활동·여가활동은 스캔본 → scripts/pdf-ocr.swift로 OCR한 텍스트. 표 구조가 흐트러져 'ocr' 방식으로 파싱)
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
  // 스캔본(OCR): 활동 체계 표가 두 단으로 섞여 나오므로 중활동은 '중활동 개관', 소활동은 '활동 자료' 줄(신체활동) 또는
  //   '소활동 ① 제목' 줄(여가활동)을 닻으로 잡는다. 단원↔성취기준은 '대활동의 개관' 쪽 번호 목록 문장으로 맞추고,
  //   못 맞추면 순서대로(신체활동 15개·여가활동 9개 성취기준 vs 단원 12개라 1:1이 아닐 수 있음 — standardMatch로 표시).
  { key: 'motor', area: '신체활동', elements: ['신체 인지와 움직임', '신체 조절과 이동', '생활 속 체력 증진'], mode: 'ocr' },
  { key: 'leisure', area: '여가활동', elements: ['개인 여가활동', '공동체 여가활동', '지역사회 여가활동'], mode: 'ocr', units: 9 }, // 여가활동 지도서는 단원 9개(성취기준 9개와 1:1)
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

// 두 문장이 같은 활동인가(OCR·표기 차이 흡수): 공백 제거, 하여→해, 끝의 '다/기' 어미 무시, 앞 8자 일치 또는 포함.
const same = (a, b) => {
  const n = (x) => norm(String(x || '').replace(/(을|를|이|가|은|는|의)(?=\s|$)/g, '')).replace(/하여/g, '해').replace(/\.$/, '').replace(/(한다|기)$/, '');
  const A = n(a), B = n(b);
  if (!A || !B) return false;
  return A === B || A.includes(B) || B.includes(A) || (A.length >= 8 && A.slice(0, 8) === B.slice(0, 8));
};

// "…한다." → "…하기" (활동 목록 문장 → 소활동 이름). 한글 받침 규칙으로 대부분 맞고, 틀려도 교사가 고칠 수 있는 이름값이다.
const RIEUL = new Set(['아', '노', '드', '여', '사', '거', '파', '나', '도', '우', '머', '흔드', '만드', '터', '기우', '무', '더']);
export function toGi(sentence) {
  let t = String(sentence || '').trim().replace(/\.$/, '');
  t = t.replace(/(\S+?)(을|를) (\S+다)$/, '$1 $3'); // 마지막 목적어의 을/를은 활동명에서 뺀다
  if (/(^|\s)민다$/.test(t)) return t.replace(/민다$/, '밀기');
  if (/한다$/.test(t)) return t.replace(/한다$/, '하기');
  if (/된다$/.test(t)) return t.replace(/된다$/, '되기');
  if (/는다$/.test(t)) return t.replace(/는다$/, '기');
  const m = t.match(/^(.*?)([가-힣])다$/);
  if (!m) return t;
  const code = m[2].charCodeAt(0) - 0xac00, jong = code % 28;
  if (jong !== 4) return t.replace(/다$/, '기'); // 받침이 ㄴ이 아니면 '다'만 뗀다(예: 즐긴다는 위에서 처리됨)
  const base = String.fromCharCode(0xac00 + code - jong);
  const stem = m[1] + base;
  const last2 = stem.slice(-2), last1 = stem.slice(-1);
  const r = RIEUL.has(last2) ? 2 : RIEUL.has(last1) ? 1 : 0;
  if (r) { const c = stem.charCodeAt(stem.length - 1) - 0xac00; return stem.slice(0, -1) + String.fromCharCode(0xac00 + c + 8) + '기'; } // 받침 ㄹ(8) 붙임
  return stem + '기';
}

function parseBookOcr(text, book, standards) {
  const L = text.split('\n')
    .map((l) => Array.from(l).filter((ch) => ch.charCodeAt(0) >= 32).join('').replace(/\s+$/, '').replace(/^[•·▪◦‣]\s*/, '• '))
    .map((l) => (/^===== p\d+ =====$/.test(l) ? '' : l));
  // 단원 경계: '대활동의 개관' 줄(OCR은 한 줄로 읽음; 띄어쓰기 변형 허용) — 제목은 그 앞의 비어 있지 않은 줄.
  // 머리말(교사용 지도서의 구성)에도 보기 쪽이 있어 표식이 12개보다 많을 수 있다 → 뒤에서 12개.
  let starts = [];
  for (let i = 1; i < L.length; i++) if (/^대\s*활동\s*의\s*개관$/.test(L[i])) { let t = i - 1; while (t > 0 && !L[t]) t--; starts.push(t); }
  const want = book.units || 12; // 책마다 단원 수(여가활동 9)
  if (starts.length > want) starts = starts.slice(-want);
  if (starts.length < want) console.warn(`${book.area}(OCR): 단원 경계 ${starts.length}개 — ${want}개 미만(OCR 누락). 찾은 것만 처리`);
  const units = [];
  const used = new Set();
  starts.forEach((s, k) => {
    const e = k + 1 < starts.length ? starts[k + 1] : L.length;
    const U = L.slice(s, e);
    // 단원 ↔ 성취기준: 개관 쪽 번호 목록에서 k+1번 문장을 찾아 성취기준과 맞춘다. 없으면 순서대로.
    let item = '';
    for (let i = 0; i < Math.min(U.length, 60); i++) { const m = U[i].match(new RegExp('^' + (k + 1) + '\\.\\s*(.+)$')); if (m) { item = m[1].trim(); break; } }
    let std = item ? standards.find((x) => !used.has(x.code) && same(x.text, item)) : null;
    if (!std) std = standards.find((x) => !used.has(x.code) && same(x.text, U[0])) || standards.filter((x) => !used.has(x.code))[0] || standards[standards.length - 1];
    used.add(std.code);
    const unit = {
      no: k + 1, title: U[0], code: std.code, standard: std.text, element: std.area,
      standardMatch: !!item && same(std.text, item),
      focus: '', relatedStandards: [...new Set([...U.join('\n').matchAll(CODE_RE)].map((m) => m[1]))],
      midActivities: [],
    };
    const fi = U.findIndex((l) => /주안점을 둔다\.$/.test(l)); if (fi >= 0) unit.focus = U[fi].trim();
    let cur = null;
    for (let i = 0; i < U.length; i++) {
      // 중활동: '중활동 개관' 앞의 비어 있지 않은 줄이 제목, 뒤의 '활동 목록' 번호 문장이 목표.
      if (U[i] === '중활동 개관') {
        let t = i - 1; while (t > 0 && (!U[t] || /^[\d ]+$/.test(U[t]))) t--;
        cur = { no: unit.midActivities.length + 1, title: U[t], page: null, goals: [], notes: [], subActivities: [], _start: i };
        unit.midActivities.push(cur);
        let j = i + 1; if (U[j] === '활동 목록') j++;
        for (; j < U.length && !/유의점$/.test(U[j]); j++) { const g = U[j].match(/^\d+\.\s*(.+)$/); if (g) cur.goals.push(g[1].trim()); else if (cur.goals.length && U[j]) cur.goals[cur.goals.length - 1] += ' ' + U[j].trim(); }
        const nb = []; for (j = j + 1; j < U.length && U[j] !== '참고 자료' && !/^소활동/.test(U[j]) && !/교수.?\s*학습의 실제$/.test(U[j]); j++) nb.push(U[j]);
        cur.notes = sentences(nb);
        continue;
      }
    }
    // 소활동: 활동 목록 문장 하나 = 소활동 하나(지도서 활동 체계 표와 같은 규칙). 이름은 '…기' 꼴로 바꾼다.
    // 본문은 중활동 범위(이 개관 ~ 다음 개관) 안에서 소활동 이름(또는 '소활동 N 이름' 줄)이 처음 보이는 자리부터 다음 소활동 자리 전까지.
    unit.midActivities.forEach((mid, mi) => {
      const mStart = mid._start, mEnd = mi + 1 < unit.midActivities.length ? unit.midActivities[mi + 1]._start : U.length;
      delete mid._start;
      mid.subActivities = mid.goals.map((g, gi) => ({ no: gi + 1, title: toGi(g), goal: g, headings: [], steps: [], tips: [], _at: -1 }));
      // 이름이 보이는 줄 찾기(참고 자료 이후부터). '소활동 ① 이름' 줄이나 이름만 있는 줄, 또는 '• 활동 자료' 바로 앞 6줄.
      const strip = (l) => l.replace(/^소활동\s*(\d{1,2}|[①-⑳])?\s*/, '').replace(/^•\s*/, '').trim();
      let from = mStart; for (let j = mStart; j < mEnd; j++) if (U[j] === '참고 자료' || /^소활동 예시$/.test(U[j])) { from = j; }
      const exact = (a, b) => norm(String(a).replace(/(을|를|이|가|은|는|의)(?=\s|$)/g, '')).replace(/(한다|기)$/, '') === norm(String(b).replace(/(을|를|이|가|은|는|의)(?=\s|$)/g, '')).replace(/(한다|기)$/, '');
      let cursor = from;
      mid.subActivities.forEach((sub) => {
        const cand = (j) => { const l = U[j]; if (!l || SIDEBAR.test(l) || FOOTER.test(l)) return ''; const t = strip(l); return t.length >= 4 && t.length <= 45 && !/다\.$/.test(t) ? t : ''; };
        let hit = -1;
        for (let j = cursor; j < mEnd && hit < 0; j++) { const t = cand(j); if (t && exact(t, sub.title)) hit = j; }
        for (let j = cursor; j < mEnd && hit < 0; j++) { const t = cand(j); if (t && same(t, sub.title)) hit = j; }
        if (hit >= 0) { sub._at = hit; cursor = hit + 1; }
      });
      const found = mid.subActivities.filter((x) => x._at >= 0).sort((a, b) => a._at - b._at);
      found.forEach((sub, fi) => {
        const end = fi + 1 < found.length ? found[fi + 1]._at : mEnd;
        let heading = null; const buf = [];
        for (let j = sub._at + 1; j < end; j++) {
          const l = U[j];
          if (!l || SIDEBAR.test(l) || FOOTER.test(l) || /\(예시\)$|활동 예$/.test(l) || /^소활동\s*(\d{1,2}|[①-⑳])?$/.test(l) || /^•?\s*활동 자료/.test(l)) continue;
          const body = l.replace(/^•\s*/, '');
          // ▶ 절차 제목도 OCR에서 '•'로 읽힌다 → '…기'로 끝나는 짧은 글머리표 줄은 제목, 나머지는 단계.
          if (l.startsWith('•') && /기$/.test(body) && body.length <= 45) { if (heading) sub.steps.push(...sentences(buf.splice(0))); heading = body; sub.headings.push(body); continue; }
          if (heading) buf.push(l);
        }
        sub.steps.push(...sentences(buf));
      });
      mid.subActivities.forEach((x) => { delete x._at; });
    });
    units.push(unit);
  });
  return units;
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
      if (c && cur) {
        let title = c[2].trim();
        // 긴 소활동명은 표에서 두 줄로 꺾인다("…실물·상징으로 나" / "타내기") — 다음 줄이 짧은 이어짐이면 붙인다.
        const nx = U[i + 1] || '';
        if (!/기\)?$/.test(title) && nx && nx.length <= 14 && !/^[①-⑳]|^\d|쪽$|^구분/.test(nx)) { title += nx.trim(); i++; }
        cur.subActivities.push({ no: circledNo(c[1]), title, headings: [], steps: [], tips: [] });
      }
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

const [commPath, selfPath, motorPath, leisurePath] = process.argv.slice(2);
if (!commPath || !selfPath) { console.error('usage: node scripts/parse-daily-life-guide.mjs <의사소통.txt> <자립생활.txt> [<신체활동.txt> <여가활동.txt>]'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(STANDARDS, 'utf8')).rows;
const paths = { comm: commPath, self: selfPath, motor: motorPath, leisure: leisurePath };
const books = BOOKS.filter((b) => paths[b.key]).map((b) => {
  const text = fs.readFileSync(paths[b.key], 'utf8');
  const parse = b.mode === 'ocr' ? parseBookOcr : parseBook;
  return { area: b.area, elements: b.elements, ocr: b.mode === 'ocr' || undefined, units: parse(text, b, standardsFor(b, rows)) };
});
const out = {
  version: '2022 개정 특수교육 교육과정 일상생활 활동 교사용 지도서(' + books.map((b) => b.area).join('·') + ')',
  source: '교육부·국립특수교육원 일상생활 활동 교사용 지도서 PDF(06_분석문서/) — scripts/parse-daily-life-guide.mjs로 추출',
  note: '생활적응은 미확보. 신체활동·여가활동은 스캔본 OCR(pdf-ocr.swift) 결과라 오탈자·누락이 있을 수 있음. 소활동 단계는 본문·옆단이 섞인 추출 텍스트에서 뽑은 최선 노력값.',
  generated: new Date().toISOString().slice(0, 10),
  books,
};
fs.writeFileSync(OUT, JSON.stringify(out));
for (const b of books) {
  const mids = b.units.reduce((n, u) => n + u.midActivities.length, 0);
  const subs = b.units.reduce((n, u) => n + u.midActivities.reduce((m, x) => m + x.subActivities.length, 0), 0);
  const filled = b.units.reduce((n, u) => n + u.midActivities.reduce((m, x) => m + x.subActivities.filter((s) => s.steps.length).length, 0), 0);
  const goals = b.units.reduce((n, u) => n + u.midActivities.filter((x) => x.goals.length).length, 0);
  console.log(`${b.area}${b.ocr ? '(OCR)' : ''}: 단원 ${b.units.length} · 성취기준 일치 ${b.units.filter((u) => u.standardMatch).length}/${b.units.length} · 중활동 ${mids}(활동 목록 있음 ${goals}) · 소활동 ${subs}(단계 있음 ${filled})`);
}
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
