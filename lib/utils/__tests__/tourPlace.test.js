// 투어 위치 계산(lib/tourPlace.js) — 1001 현장 스크린샷(기초조사① '문제행동 실태 적기'):
// 긴 표를 화면 절반에서 잘라 밝히고 팝오버가 나머지를 덮던 문제.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeTour } from '../../tourPlace.js';

const VW = 1800, VH = 1000, POP = { popW: 340, popH: 190 };
const overlap = (h, p) => {
  const ix = Math.max(0, Math.min(h.left + h.width, p.left + POP.popW) - Math.max(h.left, p.left));
  const iy = Math.max(0, Math.min(h.top + h.height, p.top + POP.popH) - Math.max(h.top, p.top));
  return ix * iy;
};
const inside = (p) => p.left >= 0 && p.top >= 0 && p.left + POP.popW <= VW && p.top + POP.popH <= VH;

test('화면보다 긴 넓은 표: 팝오버 바로 위까지 밝히고, 줄 경계에서 끊고, 팝오버는 밝힌 곳을 가리지 않는다', () => {
  const rect = { top: 100, bottom: 1400, left: 280, right: 1760 };
  const rows = Array.from({ length: 25 }, (_, i) => 160 + i * 52); // 줄 아래 경계
  const { hole, pop, placement } = placeTour({ rect, vw: VW, vh: VH, ...POP, snaps: rows });
  assert.equal(placement, 'bottom');
  const holeBottom = hole.top + hole.height - 6;
  assert.ok(rows.includes(holeBottom), `줄 경계에서 끊음(${holeBottom})`);
  assert.ok(holeBottom - 100 > VH * 0.5, '예전(화면 절반)보다 넓게 밝힌다');
  assert.equal(overlap(hole, pop), 0);
  assert.ok(inside(pop));
});

test('화면보다 긴 좁은 카드: 옆에 자리가 있으면 보이는 부분 전체를 밝히고 팝오버를 옆에', () => {
  const rect = { top: 80, bottom: 1600, left: 280, right: 900 };
  const { hole, pop, placement } = placeTour({ rect, vw: VW, vh: VH, ...POP });
  assert.equal(placement, 'right');
  assert.equal(hole.top + hole.height - 6, VH, '화면 아래 끝까지');
  assert.equal(overlap(hole, pop), 0);
  assert.ok(inside(pop));
});

test('보통 크기 요소는 예전처럼 아래에', () => {
  const rect = { top: 200, bottom: 320, left: 400, right: 900 };
  const { hole, pop, placement } = placeTour({ rect, vw: VW, vh: VH, ...POP });
  assert.equal(placement, 'bottom');
  assert.equal(hole.height, 120 + 12);
  assert.equal(overlap(hole, pop), 0);
});
