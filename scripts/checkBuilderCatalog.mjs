// 수업자료 주문서 데이터 검사 — node scripts/checkBuilderCatalog.mjs [--show <추천 id>]
// 추천 프리셋의 칩 이름이 CATEGORIES에 있는지, 설명·종류 표가 칩과 맞는지 대조하고 요청문을 시험 조립한다.
import { CATEGORIES, CHIP_TEXT, NEW_CHIPS, PRESETS, STUDENT_EXAMPLES } from '../lib/builderCatalog.js';
import { OUTPUT_KIND, buildBuilderPrompt } from '../lib/builderPrompt.js';

const byCat = {};
const all = new Set();
const dup = [];
for (const c of CATEGORIES) {
  for (const g of c.groups) {
    for (const it of g.items) {
      (byCat[g.cat] ||= new Set()).add(it);
      if (all.has(it)) dup.push(it);
      all.add(it);
    }
  }
}
const errs = [];
const warns = [];
if (dup.length) errs.push('칩 이름 중복: ' + dup.join(', '));
for (const k of Object.keys(CHIP_TEXT)) if (!all.has(k)) errs.push(`CHIP_TEXT에만 있는 칩: ${k}`);
for (const it of all) if (!CHIP_TEXT[it]) warns.push(`설명 없는 칩(이름만 씀): ${it}`);
for (const it of NEW_CHIPS) if (!all.has(it)) errs.push(`NEW_CHIPS에만 있는 칩: ${it}`);
for (const it of byCat['결과물']) if (!OUTPUT_KIND[it]) errs.push(`OUTPUT_KIND 없는 결과물: ${it}`);
for (const k of Object.keys(OUTPUT_KIND)) if (!byCat['결과물'].has(k)) errs.push(`OUTPUT_KIND에만 있는 결과물: ${k}`);

const ids = new Set();
for (const p of PRESETS) {
  if (ids.has(p.id)) errs.push(`추천 id 중복: ${p.id}`);
  ids.add(p.id);
  if (!p.presets?.['결과물']?.length) errs.push(`추천 #${p.id} 결과물 없음`);
  if ((p.presets?.['결과물'] || []).length > 1) errs.push(`추천 #${p.id} 결과물 2개`);
  for (const [cat, items] of Object.entries(p.presets || {})) {
    if (!byCat[cat]) { errs.push(`추천 #${p.id} 모르는 칸: ${cat}`); continue; }
    for (const it of items) if (!byCat[cat].has(it)) errs.push(`추천 #${p.id} ${cat}에 없는 칩: ${it}`);
  }
}
for (const ex of STUDENT_EXAMPLES) if (!ex.preset) errs.push(`학생 예시 프리셋 없음: ${ex.title}`);

// 요청문 시험 조립 — 종류마다 하나씩
for (const p of PRESETS) {
  const txt = buildBuilderPrompt({ sels: p.presets, topic: p.topic, student: { code: 'S01', note: '비식별 요약 예시' } });
  if (!txt || txt.length < 400) errs.push(`추천 #${p.id} 요청문이 너무 짧음`);
  if (/undefined|\[object/.test(txt)) errs.push(`추천 #${p.id} 요청문에 undefined`);
}
if (buildBuilderPrompt({}) !== '') errs.push('빈 입력인데 요청문이 나옴');

const showIdx = process.argv.indexOf('--show');
if (showIdx > 0) {
  const p = PRESETS.find((x) => x.id === Number(process.argv[showIdx + 1] || 21));
  console.log(buildBuilderPrompt({ sels: p.presets, topic: p.topic, student: { code: 'S01', note: '조용한 환경 선호, 그림 카드에 잘 반응' } }));
  console.log('\n────────\n');
}
console.log(`칩 ${all.size}개 · 설명 ${Object.keys(CHIP_TEXT).length}개 · 추천 ${PRESETS.length}개 · 결과물 종류 표 ${Object.keys(OUTPUT_KIND).length}개`);
warns.forEach((w) => console.log('warn:', w));
if (errs.length) { errs.forEach((e) => console.error('ERROR:', e)); process.exit(1); }
console.log('OK');
