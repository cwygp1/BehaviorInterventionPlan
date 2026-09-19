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
