// 교과 성취기준별 단원·활동·자료 키워드(public/data/curriculum-content.json) 접근 — 단일 출처.
//
// 0922 1단계: 기본교육과정 국어 초등 1~2학년군 10개 성취기준(2국어01-01~03-02). 일상생활 지도서
// (lib/dailyLifeGuide.js)와 같은 역할 — 성취기준 코드로 찾아 (1) 화면에 단원·활동 목록을 보여 주고,
// (2) 학기 교육내용·월별 프롬프트에 재료로 넣는다. 데이터가 없는 코드는 조용히 건너뛴다(기존 동작 유지).
//
// ⚠ 출처가 교사용 지도서가 아니라 공개 학교교육과정 문서(부산혜남학교 2024·2025)라 전부 confidence:
//   medium · verifiedAgainstGuide: false. 화면·프롬프트 양쪽에 "지도서 원본 대조 전" 표시를 남긴다.
//   저작권: 단원명·차시명·자료명 수준의 키워드만(코드당 300자 이내), 본문·해설은 없음(_meta.copyright).
//
// 데이터 모양: { _meta, "<코드>": { curriculum, subject, gradeCode, area, text,
//   units[{book, unitNo, unit, role:'primary'|'related'}], activities[], materials[], keywordChars,
//   confidence, sources[], verifiedAgainstGuide, notes } }

let _contentPromise = null;

/** 키워드 JSON을 한 번만 받아 둔다(실패하면 null — 기능은 조용히 꺼진다). */
export function loadCurriculumContent() {
  if (!_contentPromise) {
    _contentPromise = fetch('/data/curriculum-content.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return _contentPromise;
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

/** 화면·프롬프트 공용 주의 문구 — 검증되지 않은 데이터임을 교사가 알게. */
export const CONTENT_CAVEAT = '교사용 지도서 원본 대조 전 · 공개 학교교육과정 자료(부산혜남학교 2024·2025) 기반 — 단원·활동 이름은 참고만, 실제 지도서와 다를 수 있음';

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
    if (acts.length) parts.push(`  활동: ${acts.join(' · ')}${(e.activities || []).length > maxItems ? ` … (총 ${e.activities.length}개)` : ''}`);
    const mats = (e.materials || []).slice(0, 5);
    if (mats.length) parts.push(`  자료: ${mats.join(', ')}`);
  });
  parts.push(
    `  ※ ${CONTENT_CAVEAT}.\n` +
    '  → 교육내용은 위 활동 키워드를 소재로 이 학생 수준에 맞게 골라 "~하기" 문장으로 고쳐 쓸 것(그대로 베끼거나 전부 나열하지 말고, 학기목표에 맞는 것만). ' +
    '자료 키워드는 교육방법의 실제 자료·상황에 쓸 것. 여기 없는 단원·활동을 지어내지 말 것.\n'
  );
  return parts.join('\n') + '\n';
}
