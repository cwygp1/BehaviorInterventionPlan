// 교과 성취기준별 단원·활동·자료 키워드(public/data/curriculum-content.json)와
// 교사용 지도서 단원·차시 자료(public/data/curriculum-guide-kor12.json) 접근 — 단일 출처.
//
// 0922 1단계: 기본교육과정 국어 초등 1~2학년군 10개 성취기준(2국어01-01~03-02). 일상생활 지도서
// (lib/dailyLifeGuide.js)와 같은 역할 — 성취기준 코드로 찾아 (1) 화면에 단원·활동 목록을 보여 주고,
// (2) 학기 교육내용·월별 프롬프트에 재료로 넣는다. 데이터가 없는 코드는 조용히 건너뛴다(기존 동작 유지).
//
// 0923 2단계: 사용자가 준 교사용 지도서(국어 ①·②) 원본으로 키워드를 다시 만들었고(scripts/parse-korean-guide.mjs →
//   scripts/build-curriculum-content.mjs), 지도서의 단원 목표·차시(단계·차시명·학습 내용·학습 목표·자료)·단원 평가
//   준거·핵심 어휘를 담은 guide 파일을 따로 두어 화면 카드와 프롬프트에 붙인다. verifiedAgainstGuide:true인 항목에는
//   주의 문구를 붙이지 않는다(아직 대조 전인 항목이 섞이면 그 항목 때문에 붙는다).
//   저작권: 단원명·차시명·학습 내용·학습 목표·평가 준거·핵심 어휘 수준(수업 절차 본문·해설 없음, _meta.copyright).
//
// 키워드 데이터 모양: { _meta, "<코드>": { curriculum, subject, gradeCode, area, text,
//   units[{book, unitNo, unit, role:'primary'|'related', id, guidePage}], activities[], materials[], keywordChars,
//   confidence, sources[], verifiedAgainstGuide, notes } }
// 지도서 데이터 모양: { _meta, books[{book, key, units[{no, title, id, guidePage, standards{primary[],related[]}, goals[],
//   lessons[{stage, no, title, contents[], bookPages, guidePages, goal, focus, materials, activities[], …}],
//   evaluation[{stage, content, criteria[]}], vocabulary[], teachingPoints[], cautions[]}]}] }

let _contentPromise = null;
let _guidePromise = null;

/** 키워드 JSON을 한 번만 받아 둔다(실패하면 null — 기능은 조용히 꺼진다). */
export function loadCurriculumContent() {
  if (!_contentPromise) {
    _contentPromise = fetch('/data/curriculum-content.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return _contentPromise;
}

/** 지도서 단원·차시 JSON(약 490KB) — 성취기준을 골랐을 때만 받는다. */
export function loadCurriculumGuide() {
  if (!_guidePromise) {
    _guidePromise = fetch('/data/curriculum-guide-kor12.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return _guidePromise;
}

/** 선택한 성취기준 코드들에 해당하는 항목을 코드 순서대로(중복 없이). 데이터에 없는 코드는 건너뛴다. */
export function contentEntries(data, codes) {
  if (!data) return [];
  const seen = new Set();
  const out = [];
  (codes || []).forEach((c) => {
    const code = String(c || '').trim();
    const e = code && code !== '_meta' ? data[code] : null;
    if (e && !seen.has(code)) { seen.add(code); out.push({ code, ...e }); }
  });
  return out;
}

/** 화면·프롬프트 공용 주의 문구 — 지도서 대조 전 항목에만 붙는다. */
export const CONTENT_CAVEAT = '교사용 지도서 원본 대조 전 자료 — 단원·활동 이름은 참고만, 실제 지도서와 다를 수 있음';
export const hasUnverified = (entries) => (entries || []).some((e) => !e.verifiedAgainstGuide);

const unitLabel = (u) => `${u.book}${u.unitNo != null ? ` ${u.unitNo}단원` : ''} '${u.unit}'`;

/**
 * AI 프롬프트 주입용 블록 — 선택한 성취기준의 단원·활동·자료 키워드.
 * 일상생활 지도서 블록과 같은 상한(성취기준 3개), 항목당 활동 8개·자료 5개·단원은 primary 먼저 4개까지.
 */
export function curriculumContentBlock(entries, { maxUnits = 3, maxItems = 8 } = {}) {
  const list = (entries || []).slice(0, maxUnits);
  if (!list.length) return '';
  const parts = [];
  list.forEach((e) => {
    const units = [...(e.units || [])].sort((a, b) => (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1)).slice(0, 4);
    parts.push(`[교과 단원·활동 키워드 — [${e.code}] ${e.text} · ${e.curriculum}교육과정 ${e.subject} ${e.area}]`);
    if (units.length) parts.push(`  단원: ${units.map((u) => unitLabel(u) + (u.role === 'related' ? '(관련)' : '')).join(' · ')}`);
    const acts = (e.activities || []).slice(0, maxItems);
    if (acts.length) parts.push(`  활동(차시명): ${acts.join(' · ')}${(e.activities || []).length > maxItems ? ` … (총 ${e.activities.length}개)` : ''}`);
    const mats = (e.materials || []).slice(0, 5);
    if (mats.length) parts.push(`  자료: ${mats.join(', ')}`);
  });
  parts.push(
    (hasUnverified(list) ? `  ※ ${CONTENT_CAVEAT}.\n` : '') +
    '  → 교육내용은 위 활동 키워드를 소재로 이 학생 수준에 맞게 골라 "~하기" 문장으로 고쳐 쓸 것(그대로 베끼거나 전부 나열하지 말고, 학기목표에 맞는 것만). ' +
    '자료 키워드는 교육방법의 실제 자료·상황에 쓸 것. 여기 없는 단원·활동을 지어내지 말 것.\n'
  );
  return parts.join('\n') + '\n';
}

/**
 * 선택한 항목(entries)의 '주요 성취기준' 단원을 지도서 자료에서 찾는다 — 코드 순서, 단원 중복 없이.
 * 반환: [{ code, book, unitNo, ...단원(goals·lessons·evaluation·vocabulary…) }]. 관련(related) 단원은 키워드 카드에 이름만 나온다.
 */
export function guideUnitsFor(guide, entries, { maxPerCode = 2 } = {}) {
  if (!guide || !Array.isArray(guide.books) || !(entries || []).length) return [];
  const byId = new Map();
  guide.books.forEach((b) => (b.units || []).forEach((u) => byId.set(u.id, { ...u, book: b.book, bookKey: b.key })));
  const out = [];
  const seen = new Set();
  entries.forEach((e) => {
    (e.units || []).filter((u) => u.role === 'primary' && u.id && byId.has(u.id)).slice(0, maxPerCode).forEach((u) => {
      if (seen.has(u.id)) return;
      seen.add(u.id);
      out.push({ code: e.code, bookLabel: u.book, unitNo: u.unitNo, ...byId.get(u.id) });
    });
  });
  return out;
}

const STAGE_ORDER = { 기초: 0, 기본: 1, 실천: 2, 정리: 3 };
/** 차시가 많으면 단계별로 고르게 뽑는다(정리 차시는 뺀다). */
export function pickLessons(lessons, max = 6) {
  const list = (lessons || []).filter((l) => l.stage !== '정리' && !/공부한 내용 정리/.test(l.title || ''));
  if (list.length <= max) return list;
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.floor((i * list.length) / max)]);
  return out;
}

/**
 * AI 프롬프트 주입용 블록 — 지도서의 단원 목표·차시(단계·차시명→학습 내용)·차시 학습 목표·단원 평가 준거·핵심 어휘.
 * 단원 2개·차시 6개·차시당 학습 내용 3개·준거 4개 상한(블록 약 2,000자 이내).
 */
export function curriculumGuideBlock(units, { maxUnits = 2, maxLessons = 6, maxContents = 3, maxCriteria = 4 } = {}) {
  const list = (units || []).slice(0, maxUnits);
  if (!list.length) return '';
  const parts = [];
  list.forEach((u) => {
    parts.push(`[교과 지도서 단원·차시 — [${u.code}] ${u.bookLabel}${u.unitNo != null ? ` ${u.unitNo}단원` : ''} '${u.title}' (교사용 지도서 p.${u.guidePage})]`);
    if ((u.goals || []).length) parts.push(`  단원 목표: ${u.goals.slice(0, 4).join(' / ')}`);
    const lessons = pickLessons(u.lessons, maxLessons);
    if (lessons.length) {
      parts.push('  차시(단계 · 차시명 → 학습 내용):');
      lessons.forEach((l) => {
        const c = (l.contents || []).slice(0, maxContents).join(' · ');
        parts.push(`   - ${l.stage ? l.stage + ' ' : ''}${l.no}차시 ${l.title}${c ? ` → ${c}` : ''}`);
      });
      const goals = lessons.map((l) => l.goal).filter(Boolean).slice(0, 3);
      if (goals.length) parts.push(`  차시 학습 목표 예: ${goals.map((g) => `"${g}"`).join(' · ')}`);
    }
    const crit = (u.evaluation || []).flatMap((e) => (e.criteria || []).map((c) => (e.stage ? `(${e.stage}) ` : '') + c)).slice(0, maxCriteria);
    if (crit.length) parts.push(`  단원 평가 준거: ${crit.join(' · ')}`);
    if ((u.vocabulary || []).length) parts.push(`  핵심 어휘: ${u.vocabulary.slice(0, 10).join(', ')}`);
  });
  parts.push(
    '  → 교육내용은 위 차시명·학습 내용에서 이 학생의 학기목표에 맞는 것만 골라 학생 수준으로 고쳐 "~하기"로 쓸 것(단원 전체를 나열하지 말 것). ' +
    '월별 교육목표는 차시 학습 목표의 짜임("~을 ~할 수 있다")을, 평가계획은 단원 평가 준거의 짜임("~는가?")을 참고하되 이 학생의 활동·자료로 바꿔 쓸 것. ' +
    '지도서에 없는 단원·차시·자료를 지어내지 말 것.\n'
  );
  return parts.join('\n') + '\n';
}
