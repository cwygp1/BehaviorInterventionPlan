// 지도서 단원·차시 자료(public/data/curriculum-guide-*.json) → 성취기준별 키워드(public/data/curriculum-content.json)
//
// 0922 1단계는 공개 학교교육과정 문서에서 뽑은 키워드였고(전부 verifiedAgainstGuide:false), 0923 사용자가 준
// 국어 교사용 지도서(parse-korean-guide.mjs), 0928 수학 지도서(parse-math-guide.mjs)로 만든 자료로 항목을 만든다.
// 화면·프롬프트가 읽는 모양(units/activities/materials/…)은 그대로 두고, 값만 지도서 것으로 채우며 verifiedAgainstGuide:true·confidence:high.
//
//   node scripts/build-curriculum-content.mjs
//
// 규칙: units = 그 코드가 '주요 성취기준'인 단원(primary) + '관련 성취기준'인 단원(related)(책 읽기 단원은 차시 관련 성취기준으로 related).
//   activities = primary 단원의 차시명(정리·놀이 마당 차시 제외, 두 권 순서, 중복 없이, 최대 20).
//   materials = primary 단원의 핵심 어휘(국어) 또는 차시 교수·학습 자료(수학) + 학습 내용에 나온 그림책·동요 제목(「」『』), 최대 12.
//   책 표기는 지도서와 같게 ①/②.

import fs from 'fs';
import path from 'path';

const GUIDES = [
  { subject: '국어', grade: 2, books: '①·②', file: 'public/data/curriculum-guide-kor12.json', source: 'guide-kor12', vocab: '핵심 어휘' },
  { subject: '수학', grade: 2, books: '①·②', file: 'public/data/curriculum-guide-math12.json', source: 'guide-math12', vocab: '교수·학습 자료' },
  { subject: '국어', grade: 4, books: '③·④', file: 'public/data/curriculum-guide-kor34.json', source: 'guide-kor34', vocab: '핵심 어휘' },
  { subject: '수학', grade: 4, books: '③·④', file: 'public/data/curriculum-guide-math34.json', source: 'guide-math34', vocab: '준비물' },
];
const OUT = path.join(process.cwd(), 'public/data/curriculum-content.json');
const STANDARDS = path.join(process.cwd(), 'public/data/achievement-standards.json');

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { _meta: {} };
const allStds = JSON.parse(fs.readFileSync(STANDARDS, 'utf8')).rows;
const uniq = (a) => [...new Set(a.filter(Boolean))];
const bookTitleOf = (u) => { const m = (u.lessons || []).map((l) => l.title).join(' ').match(/[「『]([^」』]+)[」』]/); return m ? m[1] : u.title; };
const unitLabel = (u) => (u.no === '책 읽기' ? `책 읽기 「${bookTitleOf(u)}」` : u.title);
const isWrapup = (l) => /공부한 내용 정리|학습 내용 정리|배운 것을 확인|놀이 마당|수학이랑 놀아요/.test(l.title || '') || /정리|단원 평가|놀이 마당/.test(l.stage || ''); // lib/curriculumContent.js isWrapupLesson과 같은 규칙

const entries = {};
const scopes = [];
for (const gdef of GUIDES) {
  const gp = path.join(process.cwd(), gdef.file);
  if (!fs.existsSync(gp)) { console.warn(`${gdef.file} 없음 — ${gdef.subject} 건너뜀`); continue; }
  const guide = JSON.parse(fs.readFileSync(gp, 'utf8'));
  const stds = allStds.filter((r) => r[8] === '기본' && r[0] === gdef.subject && r[1] === gdef.grade);
  scopes.push({ subject: gdef.subject, gradeCode: gdef.grade, standardCount: stds.length, guideUnits: guide.books.reduce((n, b) => n + b.units.length, 0) });
  for (const r of stds) {
    const code = r[3];
    const units = [], acts = [], mats = [];
    for (const b of guide.books) for (const u of b.units) {
      const prim = u.standards.primary.includes(code), rel = u.standards.related.includes(code);
      if (!prim && !rel) continue;
      units.push({ book: b.book, unitNo: /^\d+$/.test(u.no) ? +u.no : null, unit: unitLabel(u), role: prim ? 'primary' : 'related', id: u.id, guidePage: u.guidePage });
      if (prim) {
        acts.push(...u.lessons.filter((l) => !isWrapup(l)).map((l) => l.title));
        mats.push(...(u.vocabulary || []));
        if (!(u.vocabulary || []).length) for (const l of u.lessons) if (l.materials) mats.push(...String(l.materials).split(/[,;]\s*/).map((s) => s.replace(/^(학급별|학생별)\s*:\s*/, '').trim()).filter((s) => s.length >= 2 && s.length <= 14));
        for (const l of u.lessons) for (const c of l.contents || []) for (const m of c.matchAll(/[「『]([^」』]{2,20})[」』]/g)) mats.push(`『${m[1]}』`);
      }
    }
    units.sort((a, b) => (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1) || a.id.localeCompare(b.id));
    const activities = uniq(acts).slice(0, 20), materials = uniq(mats).slice(0, 12);
    entries[code] = {
      curriculum: '기본', subject: gdef.subject, gradeCode: gdef.grade, area: r[2], text: r[4],
      units, activities, materials,
      keywordChars: [...units.map((u) => u.unit), ...activities, ...materials].join('').length,
      confidence: 'high', sources: [gdef.source], verifiedAgainstGuide: true,
      notes: `교사용 지도서(${gdef.subject} ${gdef.books})의 단원별 성취기준 표${gdef.grade === 2 ? '(주요/관련)' : '(3~4학년군은 주요/관련 구분 없음)'}·단원 지도(전개) 계획 차시명·${gdef.vocab}에서 만듦. 차시별 학습 내용·학습 목표·평가 준거는 curriculum-guide-*.json의 같은 단원(id)에서 본다.`,
    };
    if (!units.some((u) => u.role === 'primary')) console.warn(`${code} 주요 단원 없음`);
    if (!units.length) console.warn(`${code} 단원 없음`);
  }
}

const out = {
  _meta: {
    ...prev._meta,
    title: '꼬박꼬박 IEP — 성취기준별 교과 단원·활동 키워드 (curriculum-content)',
    updatedAt: new Date().toISOString().slice(0, 10),
    scope: { curriculum: '기본', subjects: uniq(scopes.map((s) => s.subject)), gradeCodes: uniq(scopes.map((s) => s.gradeCode)), gradeLabel: '초등 1~2학년군 · 3~4학년군', bySubject: scopes, standardCount: Object.keys(entries).length, filledCount: Object.keys(entries).length, note: '0923 국어·0928 수학(1~2학년군)·0929 국어·수학(3~4학년군) — 교사용 지도서 원본으로 대조·재생성. 이후 다른 교과·학년군은 GUIDES에 파일만 더한다.' },
    sources: [
      { id: 'guide-kor12', type: '교사용 지도서(사용자 제공 PDF)', title: '2022 개정 특수교육 기본교육과정 초등학교 1~2학년군 국어 ①·② 교사용 지도서 — 단원별 성취기준 표·단원 지도 계획·단원 평가·핵심 어휘', file: '06_분석문서/국어 1~2학년군 교사용 지도서.pdf (저장소 밖)', accessed: '2026-09-23', detail: 'public/data/curriculum-guide-kor12.json (scripts/parse-korean-guide.mjs)' },
      { id: 'guide-math12', type: '교사용 지도서(사용자 제공 PDF)', title: '2022 개정 특수교육 기본교육과정 초등학교 1~2학년군 수학 ①·② 교사용 지도서 — 단원별 성취기준 및 해설·단원 목표·단원의 전개 계획·단원 평가', file: '06_분석문서/수학 ①~② 교사용지도서.pdf (저장소 밖)', accessed: '2026-09-28', detail: 'public/data/curriculum-guide-math12.json (scripts/parse-math-guide.mjs)' },
      { id: 'guide-kor34', type: '교사용 지도서(사용자 제공 PDF)', title: '2022 개정 특수교육 기본교육과정 초등학교 3~4학년군 국어 ③·④ 교사용 지도서(미래엔) — 단원별 교육과정의 성취기준·단원 목표·단원 지도 계획·단원 평가·핵심 어휘', file: '06_분석문서/초_지도서_국어 3_4 지도서_미래엔_교육부_2022개정특수_특수_2025_2025.pdf (저장소 밖)', accessed: '2026-09-29', detail: 'public/data/curriculum-guide-kor34.json (scripts/parse-korean-guide34.mjs)' },
      { id: 'guide-math34', type: '교사용 지도서(사용자 제공 PDF)', title: '2022 개정 특수교육 기본교육과정 초등학교 3~4학년군 수학 ③·④ 교사용 지도서 — 단원별 핵심 아이디어·성취기준·단원 전개 계획·단원 평가 중점', file: '06_분석문서/수학34 지도서 PDF.pdf (저장소 밖)', accessed: '2026-09-29', detail: 'public/data/curriculum-guide-math34.json (scripts/parse-math-guide34.mjs)' },
      ...(prev._meta.sources || []).filter((s) => !/^guide-/.test(s.id)).map((s) => ({ ...s, note: s.note || '1단계(0922) 출처 — 지도서 대조 뒤에는 참고용' })),
    ],
    sourceNotes: [
      '0923: 국어 단원·차시명·자료 전부를 교사용 지도서 원본(OCR)에서 다시 만들었고, 1단계의 공개 학교교육과정 문서 값은 버렸다(단원 구성은 같았음).',
      '0928: 수학 24개 성취기준을 같은 방식으로 추가. 수학 지도서엔 핵심 어휘가 없어 자료는 차시 교수·학습 자료에서 뽑았다.',
      '0929: 3~4학년군 국어 11개·수학 27개 성취기준 추가(글자 층 PDF, OCR 아님). 3~4학년군 지도서는 단원 성취기준에 주요/관련 구분이 없어 그 단원의 성취기준 전부를 주요(primary)로 둔다. 수학 자료는 전개 계획의 준비물.',
      '차시명은 단원 (지도·전개) 계획 표의 "차시명" 열이며 정리 차시(공부한 내용 정리하기·즐거운 놀이 마당)는 뺐다.',
      '1~2학년군 국어는 OCR이라 드물게 오탈자·띄어쓰기 오류가 있을 수 있다(원본 확인: 지도서 인쇄 쪽 = guidePage). 글자 층 판(수학 1~2 글자층 변환 전은 OCR)·3~4학년군은 줄 잇기에서 드물게 띄어쓰기가 어긋날 수 있다.',
    ],
    copyright: '단원명·차시명·핵심 어휘·자료 등 키워드 수준만 담음(지도서 본문·해설 없음). 내부 참고용.',
    schema: prev._meta.schema,
  },
  ...entries,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT}`, Object.keys(entries).length, 'codes', scopes);
for (const [c, e] of Object.entries(entries)) console.log(c, e.units.map((u) => `${u.role === 'primary' ? '★' : ''}${u.book} ${u.unit}`).join(' · '), `| 활동 ${e.activities.length} · 자료 ${e.materials.length} · ${e.keywordChars}자`);
