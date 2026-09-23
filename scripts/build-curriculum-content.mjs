// 지도서 단원·차시 자료(public/data/curriculum-guide-kor12.json) → 성취기준별 키워드(public/data/curriculum-content.json)
//
// 0922 1단계는 공개 학교교육과정 문서에서 뽑은 키워드였고(전부 verifiedAgainstGuide:false), 0923 사용자가 준
// 교사용 지도서로 parse-korean-guide.mjs가 만든 자료로 항목을 다시 만든다. 화면·프롬프트가 읽는 모양(units/activities/
// materials/…)은 그대로 두고, 값만 지도서 것으로 바꾸며 verifiedAgainstGuide:true·confidence:high로 올린다.
//
//   node scripts/build-curriculum-content.mjs
//
// 규칙: units = 그 코드가 '주요 성취기준'인 단원(primary) + '관련 성취기준'인 단원(related) + 책 읽기 단원에서 그 코드가
//   차시 관련 성취기준으로 나오면 related. activities = primary 단원의 차시명(정리 차시 제외, 두 권 순서, 중복 없이).
//   materials = primary 단원 핵심 어휘 + 차시 학습 내용에 나온 그림책·동요 제목(「」『』). 코드당 키워드 300자 상한은 지도서
//   원본이라 두지 않지만 activities 20개·materials 12개로 자른다(화면·프롬프트는 자기 상한을 따로 둔다).

import fs from 'fs';
import path from 'path';

const GUIDE = path.join(process.cwd(), 'public/data/curriculum-guide-kor12.json');
const OUT = path.join(process.cwd(), 'public/data/curriculum-content.json');
const STANDARDS = path.join(process.cwd(), 'public/data/achievement-standards.json');

const guide = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { _meta: {} };
const stds = JSON.parse(fs.readFileSync(STANDARDS, 'utf8')).rows.filter((r) => r[8] === '기본' && r[0] === '국어' && r[1] === 2);
const byCode = new Map(stds.map((r) => [r[3], r]));

const bookLabel = (b) => (b.key === 1 ? '국어 가' : '국어 나'); // 앱은 0922부터 '국어 가/나'로 표기(지도서 표기는 ①/②)
const unitLabel = (u) => (u.no === '책 읽기' ? `책 읽기 「${bookTitleOf(u)}」` : u.title);
const bookTitleOf = (u) => { const m = (u.lessons || []).map((l) => l.title).join(' ').match(/[「『]([^」』]+)[」』]/); return m ? m[1] : u.title; };
const uniq = (a) => [...new Set(a.filter(Boolean))];

const entries = {};
for (const r of stds) {
  const code = r[3];
  const units = [];
  const acts = [];
  const mats = [];
  for (const b of guide.books) for (const u of b.units) {
    const prim = u.standards.primary.includes(code), rel = u.standards.related.includes(code);
    if (!prim && !rel) continue;
    units.push({ book: bookLabel(b), unitNo: /^\d+$/.test(u.no) ? +u.no : null, unit: unitLabel(u), role: prim ? 'primary' : 'related', id: u.id, guidePage: u.guidePage });
    if (prim) {
      acts.push(...u.lessons.filter((l) => !/공부한 내용 정리/.test(l.title)).map((l) => l.title));
      mats.push(...(u.vocabulary || []));
      for (const l of u.lessons) for (const c of l.contents || []) for (const m of c.matchAll(/[「『]([^」』]{2,20})[」』]/g)) mats.push(`『${m[1]}』`);
    }
  }
  units.sort((a, b) => (a.role === 'primary' ? 0 : 1) - (b.role === 'primary' ? 0 : 1) || a.id.localeCompare(b.id));
  const activities = uniq(acts).slice(0, 20), materials = uniq(mats).slice(0, 12);
  entries[code] = {
    curriculum: '기본', subject: '국어', gradeCode: 2, area: r[2], text: r[4],
    units, activities, materials,
    keywordChars: [...units.map((u) => u.unit), ...activities, ...materials].join('').length,
    confidence: 'high', sources: ['guide-kor12'], verifiedAgainstGuide: true,
    notes: '교사용 지도서(국어 ①·②)의 단원별 성취기준 표(주요/관련)·단원 지도 계획 차시명·핵심 어휘에서 만듦. 차시별 학습 내용·학습 목표·평가 준거는 curriculum-guide-kor12.json의 같은 단원(id)에서 본다.',
  };
  if (!units.some((u) => u.role === 'primary')) console.warn(`${code} 주요 단원 없음`);
}

const out = {
  _meta: {
    ...prev._meta,
    title: '꼬박꼬박 IEP — 성취기준별 교과 단원·활동 키워드 (curriculum-content)',
    updatedAt: new Date().toISOString().slice(0, 10),
    scope: { ...(prev._meta.scope || {}), curriculum: '기본', subject: '국어', gradeCode: 2, gradeLabel: '초등 1~2학년군', textbooks: ['국어 가(①)', '국어 나(②)'], standardCount: stds.length, filledCount: Object.keys(entries).length, note: '2단계(0923). 교사용 지도서 원본으로 대조·재생성. 이후 다른 교과·학년군은 같은 파일에 코드만 추가.' },
    sources: [
      { id: 'guide-kor12', type: '교사용 지도서(사용자 제공 PDF)', title: '2022 개정 특수교육 기본교육과정 초등학교 1~2학년군 국어 ①·② 교사용 지도서 — 단원별 성취기준 표·단원 지도 계획·단원 평가·핵심 어휘', file: '06_분석문서/국어 1~2학년군 교사용 지도서.pdf (저장소 밖)', accessed: '2026-09-23', detail: 'public/data/curriculum-guide-kor12.json (scripts/parse-korean-guide.mjs)' },
      ...(prev._meta.sources || []).filter((s) => s.id !== 'guide-kor12').map((s) => ({ ...s, note: '1단계(0922) 출처 — 지도서 대조 뒤에는 참고용' })),
    ],
    sourceNotes: [
      '0923: 단원·차시명·자료 전부를 교사용 지도서 원본(OCR)에서 다시 만들었고, 1단계의 공개 학교교육과정 문서 값은 버렸다(단원 구성은 같았음).',
      '차시명은 단원 지도 계획 표의 "차시명" 열이며 정리 차시(공부한 내용 정리하기)는 뺐다. 자료는 핵심 어휘 + 학습 내용에 나온 그림책·동요 제목.',
      'OCR이라 드물게 오탈자·띄어쓰기 오류가 있을 수 있다(원본 확인: 지도서 인쇄 쪽 = guidePage).',
    ],
    copyright: '단원명·차시명·핵심 어휘 등 키워드 수준만 담음(지도서 본문·해설 없음). 내부 참고용.',
    schema: prev._meta.schema,
  },
  ...entries,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT}`, Object.keys(entries).length, 'codes');
for (const [c, e] of Object.entries(entries)) console.log(c, e.units.map((u) => `${u.role === 'primary' ? '★' : ''}${u.book} ${u.unit}`).join(' · '), `| 활동 ${e.activities.length} · 자료 ${e.materials.length} · ${e.keywordChars}자`);
