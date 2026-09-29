// 교과 성취기준별 단원·활동·자료 키워드(public/data/curriculum-content.json)와
// 교사용 지도서 단원·차시 자료(public/data/curriculum-guide-{kor12,math12,kor34,math34}.json) 접근 — 단일 출처.
//
// 0929: 3~4학년군 국어·수학 지도서 추가(mds/40). 지도서 파일은 `교과:학년군` 키로 나뉘고(GUIDE_FILES), 항목의 gradeCode로 고른다.
//   3~4학년군은 성취기준에 주요/관련 구분이 없어 related가 비고, stage는 소단원 이름, 수학 evaluation은 지식·이해/과정·기능/가치·태도 구분별.
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
const _guidePromises = new Map(); // 교과 → Promise<지도서 JSON|null>

/** 키워드 JSON을 한 번만 받아 둔다(실패하면 null — 기능은 조용히 꺼진다). */
export function loadCurriculumContent() {
  if (!_contentPromise) {
    _contentPromise = fetch('/data/curriculum-content.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return _contentPromise;
}

/**
 * 교과·학년군별 지도서 단원·차시 파일 — 키는 `교과:학년군코드`(0923 국어 1~2, 0928 수학 1~2, 0929 국어·수학 3~4).
 * 새 지도서는 여기에 파일만 더한다. 학년군마다 파일을 나눈 것은 고른 성취기준의 학년군 것만 받기 위해서(파일당 400~550KB).
 * 단원 id는 파일을 합쳐도 겹치지 않게 권 번호를 쓴다(1~2학년군 '1-3'·'2-3', 3~4학년군 '3-3'·'4-3').
 */
export const GUIDE_FILES = {
  '국어:2': '/data/curriculum-guide-kor12.json', '수학:2': '/data/curriculum-guide-math12.json',
  '국어:4': '/data/curriculum-guide-kor34.json', '수학:4': '/data/curriculum-guide-math34.json',
};
/** 항목(성취기준)의 교과·학년군 → 지도서 파일 키. 옛 호출처럼 교과 이름만 주면 1~2학년군으로 본다. */
export const guideKeyOf = (subject, gradeCode) => (String(subject || '').includes(':') ? String(subject) : `${subject}:${gradeCode ?? 2}`);

/** 한 지도서 JSON(`교과:학년군` 키) — 그 성취기준을 골랐을 때만 받는다. 파일이 없는 키는 null. */
export function loadCurriculumGuide(key = '국어:2') {
  const k = guideKeyOf(key);
  const url = GUIDE_FILES[k];
  if (!url) return Promise.resolve(null);
  if (!_guidePromises.has(k)) {
    _guidePromises.set(k, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return _guidePromises.get(k);
}

/** 여러 지도서(키 목록)를 받아 books를 합친 한 객체로(없는 키는 건너뜀). 아무것도 없으면 null. */
export function loadCurriculumGuides(keys) {
  const list = [...new Set((keys || []).map((k) => guideKeyOf(k)).filter((k) => GUIDE_FILES[k]))];
  if (!list.length) return Promise.resolve(null);
  return Promise.all(list.map((k) => loadCurriculumGuide(k).then((g) => [k, g]))).then((pairs) => {
    // 권마다 교과·학년군을 붙인다(단원 id '1-1'은 국어·수학 파일에 다 있어 교과로 구분해야 한다).
    const books = pairs.filter(([, g]) => g).flatMap(([k, g]) => (g.books || []).map((b) => ({ ...b, subject: k.split(':')[0], gradeCode: +k.split(':')[1] })));
    return books.length ? { books } : null;
  });
}

/** 항목들이 쓰는 지도서 키 목록(`교과:학년군`, 파일이 있는 것만). */
export const guideKeysOf = (entries) => [...new Set((entries || []).map((e) => guideKeyOf(e.subject, e.gradeCode)).filter((k) => GUIDE_FILES[k]))];
/** 0923 이름 — 지금은 `교과:학년군` 키를 돌려준다(loadCurriculumGuides에 그대로 넘긴다). */
export const guideSubjectsOf = guideKeysOf;

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
  // 단원 id는 교과 안에서만 유일하다('1-1'이 국어·수학에 다 있음) → 권의 subject가 있으면 '교과|id'로, 없으면(옛 호출) id만으로 찾는다.
  const byId = new Map();
  guide.books.forEach((b) => (b.units || []).forEach((u) => { const v = { ...u, book: b.book, bookKey: b.key, subject: b.subject }; byId.set(`${b.subject || ''}|${u.id}`, v); if (!byId.has(`|${u.id}`)) byId.set(`|${u.id}`, v); }));
  const out = [];
  const seen = new Set();
  entries.forEach((e) => {
    const find = (u) => byId.get(`${e.subject || ''}|${u.id}`) || byId.get(`|${u.id}`);
    (e.units || []).filter((u) => u.role === 'primary' && u.id && find(u)).slice(0, maxPerCode).forEach((u) => {
      const hit = find(u), k = `${hit.subject || ''}|${u.id}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ code: e.code, bookLabel: u.book, unitNo: u.unitNo, ...hit });
    });
  });
  return out;
}

const STAGE_ORDER = { 기초: 0, 기본: 1, 실천: 2, 정리: 3 };
/** 정리·단원 평가·놀이 마당 차시(1~2학년군 '정리'·'공부한 내용 정리하기'·'즐거운 놀이 마당', 3~4학년군 '단원 정리'·'단원 평가'·'놀이 마당') — 교육내용 재료에서 뺀다. */
export const isWrapupLesson = (l) => /정리|단원 평가|놀이 마당/.test(l?.stage || '') || /공부한 내용 정리|학습 내용 정리|배운 것을 확인|놀이 마당|수학이랑 놀아요/.test(l?.title || '');
/** 차시가 많으면 단계별로 고르게 뽑는다(정리·평가·놀이 차시는 뺀다). */
export function pickLessons(lessons, max = 6) {
  const list = (lessons || []).filter((l) => !isWrapupLesson(l));
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
