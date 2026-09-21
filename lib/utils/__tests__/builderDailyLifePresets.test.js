// 수업자료 주문서 추천 — 2025 일상생활 활동 수업 도움 자료 예시 32건 → 프리셋(lib/builderCatalog dailyLifePresets, 0921).
// 칩이 CATEGORIES에 있는 이름인지, 기본 추천과 id가 안 겹치는지, 설계 형태별 칩 규칙이 맞는지, 요청문이 조립되는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES, PRESETS, dailyLifePresets, DL_PRESET_TAG } from '../../builderCatalog.js';
import { buildBuilderPrompt } from '../../builderPrompt.js';

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/daily-life-lesson-examples.json'), 'utf8'));
const dl = dailyLifePresets(data.examples);
const byCat = {};
CATEGORIES.forEach((c) => c.groups.forEach((g) => g.items.forEach((it) => (byCat[g.cat] ||= new Set()).add(it))));
const byNo = (no) => dl.find((p) => p.no === no);

test('32개 프리셋 — id 101~132, 기본 추천과 안 겹침, 태그·영역·설계 형태', () => {
  assert.equal(dl.length, 32);
  assert.deepEqual(dl.map((p) => p.id), data.examples.map((e) => 100 + e.no));
  const base = new Set(PRESETS.map((p) => p.id));
  dl.forEach((p) => {
    assert.ok(!base.has(p.id), `id ${p.id}`);
    assert.equal(p.tag, DL_PRESET_TAG);
    assert.ok(p.dl && p.area && /^[A-D]$/.test(p.design) && p.designShort, `#${p.id}`);
    assert.match(p.title, /^\[일상생활·(의사소통|자립생활|신체활동|여가활동)\] /);
  });
});

test('칩은 모두 CATEGORIES에 있는 이름이고, 결과물은 지도안 하나·교과에 일상생활 활동', () => {
  dl.forEach((p) => {
    Object.entries(p.presets).forEach(([cat, items]) => {
      assert.ok(byCat[cat], `#${p.id} 모르는 칸 ${cat}`);
      assert.ok(items.length > 0, `#${p.id} ${cat} 빈 목록`);
      items.forEach((it) => assert.ok(byCat[cat].has(it), `#${p.id} ${cat}에 없는 칩 ${it}`));
      assert.equal(new Set(items).size, items.length, `#${p.id} ${cat} 중복`);
    });
    assert.deepEqual(p.presets.결과물, ['📜 특수교육 지도안']);
    assert.deepEqual(p.presets.교육과정, ['📗 기본 교육과정']);
    assert.ok(p.presets.교과.includes('🧺 일상생활 활동'));
    assert.ok((p.presets.EBP || []).length <= 3);
  });
});

test('설계 형태별 규칙 — C 교과 연계는 그 교과 칩, D는 창체, B는 이어 붙인 영역의 기능영역', () => {
  assert.ok(byNo(1).presets.교과.includes('📘 수학'), '1번 [2수학02-01]');
  assert.ok(byNo(26).presets.교과.includes('🎨 미술') && byNo(26).presets.교과.includes('💻 정보통신'), '26번 정보통신·미술');
  assert.ok(byNo(4).presets.교과.includes('🌟 창체'), '4번 창의적 체험활동');
  assert.ok(byNo(10).presets.기능영역.includes('🗣 의사소통'), '10번 식사 예절 ↔ 의사소통');
  assert.ok(byNo(32).presets.기능영역.includes('🏠 일상생활(ADL)') && byNo(32).presets.기능영역.includes('🏙 지역사회'), '32번 영화관 ↔ 자립생활·지역사회');
  assert.ok(byNo(2).presets.EBP.includes('🃏 PECS') && byNo(2).presets.일반화.includes('👨‍👩‍👧 가정 연계'), '2번 상징 요구·가정');
  assert.ok(byNo(30).presets.EBP.includes('👫 또래지원(PMI)'), '30번 보드게임');
  assert.ok(!byNo(26).presets.EBP?.includes('🃏 PECS'), '26번 "사진 찍으며 놀기"는 PECS 아님');
  assert.equal(byNo(9).presets.교과.length, 1, '9번 슬기로운 생활은 칩이 없어 일상생활 활동만');
});

test('2-B 주제 글 — 단원·활동 주제·설계 형태·연계·주안점·현재 수준 칸', () => {
  const t = byNo(1).topic;
  assert.match(t, /^단원: 의사소통 지도서 '상대방의 말소리'\(의사소통의 기초\) — 성취기준 \[일상01-02\]/);
  assert.match(t, /지도서 활동: 중활동 5\. 명칭을 듣고 가리키기/);
  assert.match(t, /활동 주제: 명칭 듣고 가리키기/);
  assert.match(t, /설계 형태: C 일상생활 활동·교과 연계형/);
  assert.match(t, /교육과정·생태학적 연계: \[수학\] \/ \[2수학02-01\]/);
  assert.match(t, /설계 주안점:\n- /);
  assert.match(t, /학생 현재 수준:/);
  assert.match(byNo(30).topic, /지도서 활동: 4\. 친구와 함께 보드게임 하기/, '중활동 연결이 없으면 자료 목록 이름');
});

test('요청문 조립 — 32개 모두 지도안 종류로, undefined 없이', () => {
  dl.forEach((p) => {
    const txt = buildBuilderPrompt({ sels: p.presets, topic: p.topic, student: { code: 'S01', note: '비식별 요약' } });
    assert.ok(txt.length > 800, `#${p.id} ${txt.length}`);
    assert.doesNotMatch(txt, /undefined|\[object/);
    assert.match(txt, /지도안/);
    assert.match(txt, /설계 주안점/);
  });
});
