// 일상생활 활동 교사용 지도서 데이터(public/data/daily-life-guide.json) 접근 — 단일 출처.
//
// 0919 현장 질문 "교과 작성 때 교육내용을 쓰려면 지도서를 다시 펴야 한다": 앱이 아는 교과 정보가
// 성취기준 한 문장뿐이어서였다. 지도서를 파싱한 데이터(scripts/parse-daily-life-guide.mjs)를
// 성취기준 코드로 찾아 (1) 화면에 중활동·소활동 목록을 보여 주고, (2) 학기 교육내용·월별 프롬프트에
// 재료로 넣는다. 의사소통·자립생활(글자 층)·신체활동·여가활동(스캔본 OCR) 4권, 생활적응은 미확보.
//
// 데이터 모양: books[{area, units[{no,title,code,standard,element,focus,relatedStandards[],
//   midActivities[{no,title,page,goals[],notes[],subActivities[{no,title,headings[],steps[],tips[]}]}]}]}]

let _guidePromise = null;

/** 지도서 JSON을 한 번만 받아 둔다(실패하면 null — 기능은 조용히 꺼진다). */
export function loadDailyLifeGuide() {
  if (!_guidePromise) {
    _guidePromise = fetch('/data/daily-life-guide.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return _guidePromise;
}

/** 일상생활 활동 성취기준 코드인가('일상01-01' 형태). */
export const isDailyCode = (code) => /^일상\d{2}-\d{2}$/.test(String(code || '').trim());

/** 선택한 성취기준 코드들에 해당하는 단원을 코드 순서대로(중복 없이) 돌려준다. 지도서에 없는 코드는 건너뛴다. */
export function guideUnits(guide, codes) {
  if (!guide?.books?.length) return [];
  const byCode = new Map();
  guide.books.forEach((b) => b.units.forEach((u) => byCode.set(u.code, { ...u, bookArea: b.area })));
  const seen = new Set();
  const out = [];
  (codes || []).forEach((c) => {
    const u = byCode.get(String(c || '').trim());
    if (u && !seen.has(u.code)) { seen.add(u.code); out.push(u); }
  });
  return out;
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = (n) => CIRCLED[n - 1] || `${n}`;

/**
 * AI 프롬프트 주입용 블록 — 선택한 성취기준의 지도서 단원을 중활동·소활동 이름 중심으로 요약.
 * 절차 문장 전문은 넣지 않는다(프롬프트 길이·저작권) — 소활동 이름과 절차 제목만으로도 교육내용의
 * 소재·순서가 정해진다. 단원 3개, 중활동당 소활동 8개까지.
 */
export function dailyLifeGuideBlock(units, { maxUnits = 3, maxSubs = 8 } = {}) {
  const list = (units || []).slice(0, maxUnits);
  if (!list.length) return '';
  const parts = [];
  list.forEach((u) => {
    parts.push(`[지도서 활동 — [${u.code}] ${u.standard} · ${u.bookArea || u.element} 지도서 '${u.title}' 단원]`);
    if (u.focus) parts.push(`  주안점: ${u.focus}`);
    u.midActivities.forEach((m) => {
      const subs = m.subActivities.slice(0, maxSubs).map((s) => `${circ(s.no)} ${s.title}`).join(' · ');
      const more = m.subActivities.length > maxSubs ? ` … (총 ${m.subActivities.length}개)` : '';
      parts.push(`  중활동 ${m.no} ${m.title}: ${subs}${more}`);
    });
    const first = u.midActivities[0]?.subActivities?.find((s) => s.headings.length);
    if (first) parts.push(`  (소활동 절차 제목 예 — '${first.title}': ${first.headings.slice(0, 4).join(' → ')})`);
  });
  parts.push(
    '  → 교육내용은 위 소활동 이름·순서를 재료로 이 학생 수준에 맞게 골라 고쳐 쓸 것(그대로 베끼거나 전부 나열하지 말고, 학기목표에 맞는 것만). ' +
    '교육방법의 활동 절차는 소활동 절차 제목의 흐름(탐색 → 시범 → 연습 → 생활 속 적용)을 참고할 것.\n'
  );
  return parts.join('\n') + '\n';
}

/** 한 중활동의 소활동 이름을 교육내용 줄("- …")로. */
export function contentLinesFor(mid) {
  return (mid?.subActivities || []).map((s) => `- ${s.title}`);
}

// ── 2025 수업 도움 자료 예시(public/data/daily-life-lesson-examples.json) ──────────────────────────
// 0921 현장 요청 "이것도 예제로 활용해 달라": 「2025 일상생활 활동 수업 도움 자료 활용 안내」의 설계 카드 32장.
// 카드 하나 = 지도서 중활동 하나를 실제 수업으로 설계한 현장 예시(활동 주제 · 설계 형태 A~D · 교육과정 및
// 생태학적 연계 내용 · 활동 설계 및 자료 제작의 주안점). 파서: scripts/parse-daily-life-lesson-examples.py
// 데이터 모양: {designTypes[{code,label}], examples[{no, area, element, unitTitle, code, standard, midNo, midTitle,
//   subNo, subTitle, listTitle, topic, design, designLabel, linkage[], linkageCodes[], focus[]}]}

let _examplesPromise = null;

/** 예시 JSON을 한 번만 받아 둔다(실패하면 null — 기능은 조용히 꺼진다). */
export function loadDailyLifeExamples() {
  if (!_examplesPromise) {
    _examplesPromise = fetch('/data/daily-life-lesson-examples.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return _examplesPromise;
}

/** 설계 형태 A~D — 화면 뱃지·프롬프트 설명 공용. */
export const DESIGN_TYPES = {
  A: { short: '영역 내 선택', label: '일상생활 활동 영역 내 선택형', hint: '일상생활 활동 안에서 학생에게 맞는 활동을 골라 가정·지역사회 장면으로 넓힘' },
  B: { short: '영역 간 통합', label: '일상생활 활동의 영역간 통합형', hint: '의사소통·자립생활·신체활동·여가활동 중 두 영역의 활동을 한 수업으로 묶음' },
  C: { short: '교과 연계', label: '일상생활 활동·교과 연계형', hint: '교과 성취기준(예: [2수학02-01])의 내용과 이어 설계' },
  D: { short: '창체 연계', label: '일상생활 활동·창의적 체험활동 연계형', hint: '창의적 체험활동(자율·자치, 진로 등)과 이어 설계' },
};

/** 선택한 단원(guideUnits 결과)별 예시 — { [code]: examples[] } (단원에 예시가 없으면 키 없음). */
export function examplesForUnits(data, units) {
  const out = {};
  if (!data?.examples?.length || !units?.length) return out;
  const codes = new Set(units.map((u) => u.code));
  data.examples.forEach((e) => {
    if (!e.code || !codes.has(e.code)) return;
    (out[e.code] = out[e.code] || []).push(e);
  });
  return out;
}

/** 단원 순서를 돌아가며 한 장씩 뽑아 한 줄로 — 단원 하나가 예시 자리를 다 차지하지 않게(프롬프트는 앞 3장만 쓴다). */
export function interleaveExamples(byUnit, units) {
  const queues = (units || []).map((u) => [...(byUnit?.[u.code] || [])]).filter((q) => q.length);
  const out = [];
  while (queues.some((q) => q.length)) queues.forEach((q) => { if (q.length) out.push(q.shift()); });
  return out;
}

const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** 연계 내용 줄에서 "[  수학  ]" 같은 교과 머리표는 앞 줄에 붙여 한 줄로. */
export function linkageText(ex, max = 170) {
  const lines = (ex?.linkage || []).map((l) => String(l).trim()).filter(Boolean);
  return cut(lines.join(' / ').replace(/\[\s+/g, '[').replace(/\s+\]/g, ']'), max);
}

/**
 * AI 프롬프트 주입용 블록 — 선택한 단원의 예시 카드(최대 maxExamples장)를 "주제 → 설계 형태 → 연계 → 주안점" 순으로.
 * 예시의 소재를 베끼게 하려는 게 아니라, 지도서 소활동 하나를 학생 맥락으로 좁히고(주제) 연계·주안점을 어떻게
 * 드러내는지 서술 방식을 보이려는 것이라, 끝에 "참고 방식"을 못 박는다.
 */
export function dailyLifeExamplesBlock(list, { maxExamples = 3, maxFocus = 280 } = {}) {
  const items = (list || []).slice(0, maxExamples);
  if (!items.length) return '';
  const parts = ['[수업 도움 자료 예시 — 2025 일상생활 활동 수업 도움 자료의 실제 설계 카드(같은 단원)]'];
  items.forEach((e, i) => {
    const d = DESIGN_TYPES[e.design];
    const where = e.midNo ? `중활동 ${e.midNo} ${e.midTitle}` : `'${e.listTitle || e.topic}'`;
    parts.push(`  예시 ${i + 1} · [${e.code}] ${where} → 활동 주제 '${e.topic}' · 설계 형태 ${e.design}${d ? `(${d.label})` : ''}`);
    const link = linkageText(e);
    if (link) parts.push(`    연계: ${link}`);
    if (e.focus?.length) parts.push(`    주안점: ${cut(e.focus.join(' '), maxFocus)}`);
  });
  parts.push(
    '  → 참고 방식: 이 예시처럼 (1) 지도서 소활동 하나를 이 학생의 생활 환경·기능 수준에 맞는 활동 주제로 좁히고, ' +
    '(2) 설계 형태(A 영역 내 선택 / B 영역 간 통합 / C 교과 연계 / D 창의적 체험활동 연계)에 따라 이어지는 교과 성취기준이나 가정·지역사회 장면을 교육내용·교육방법에 담고, ' +
    '(3) 주안점처럼 "무엇에 초점을 두고 무엇은 목표가 아닌지"가 교육방법에 드러나게 쓸 것. 예시의 소재·문장을 그대로 옮기지 말 것.\n'
  );
  return parts.join('\n') + '\n';
}
