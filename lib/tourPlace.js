// 화면 안내(투어) 팝오버·스포트라이트 위치 계산 — 순수 함수 (mds/23 기능③).
//
// 왜 분리했나: 예전엔 SpotlightTour 안에서 좌표를 즉석 계산했는데,
// "화면보다 큰 요소"(누적 ABC 기록·25문항 체크리스트처럼 아주 긴 카드)를 가리킬 때
// rect.top이 음수·rect.bottom이 화면 밖이라 팝오버가 화면 밖으로 밀려나 보이지 않았다.
// 좌표 규칙을 순수 함수로 빼서 (a) 어떤 입력에도 화면 안에 있도록 보장하고
// (b) 브라우저 없이 테스트할 수 있게 했다.
//
// 보장(불변식): 반환된 pop은 항상 화면 안에 있다.
//   margin <= pop.left, pop.left + popW <= vw - margin   (팝오버가 화면보다 넓지 않은 한)
//   margin <= pop.top,  pop.top  + popH <= vh - margin   (팝오버가 화면보다 높지 않은 한)

export const TOUR_PAD = 6;    // 하이라이트 여백
const GAP = 10;               // 하이라이트와 팝오버 사이 간격
const MARGIN = 12;            // 화면 가장자리 최소 여백
const MAX_HOLE_RATIO = 0.5;   // 하이라이트가 화면 높이의 이 비율을 넘으면 윗부분만 강조

/**
 * @param {object} p
 * @param {{top,bottom,left,right}|null} p.rect  대상 요소의 뷰포트 좌표(getBoundingClientRect). null이면 중앙 카드.
 * @param {number} p.vw  뷰포트 너비
 * @param {number} p.vh  뷰포트 높이
 * @param {number} p.popW 팝오버 실측 너비
 * @param {number} p.popH 팝오버 실측 높이
 * @returns {{hole:{top,left,width,height}|null, pop:{left,top}, placement:string}}
 */
export function placeTour({ rect, vw, vh, popW, popH, pad = TOUR_PAD, gap = GAP, margin = MARGIN }) {
  // 팝오버가 화면보다 크면 가장자리에 붙인다(넘치는 부분은 CSS max-height로 스크롤).
  const clampX = (x) => Math.max(margin, Math.min(x, Math.max(margin, vw - popW - margin)));
  const clampY = (y) => Math.max(margin, Math.min(y, Math.max(margin, vh - popH - margin)));
  const centered = () => ({ left: Math.round(clampX((vw - popW) / 2)), top: Math.round(clampY((vh - popH) / 2)) });

  if (!rect) return { hole: null, pop: centered(), placement: 'center' };

  // 1) 화면에 실제로 보이는 부분만 사용 — 요소가 화면 위아래로 넘쳐도 안전하게.
  const top = Math.max(0, Math.min(rect.top, vh));
  const bottom = Math.max(0, Math.min(rect.bottom, vh));
  const left = Math.max(0, Math.min(rect.left, vw));
  const right = Math.max(0, Math.min(rect.right, vw));
  const w = right - left;
  const h = bottom - top;
  // 화면 밖(접힌 사이드바 등)이면 하이라이트 없이 중앙 카드로 설명만 보여준다.
  if (w <= 0 || h <= 0) return { hole: null, pop: centered(), placement: 'center' };

  // 2) 화면을 거의 다 덮는 요소(긴 목록 카드)는 윗부분만 강조해 팝오버 자리를 남긴다.
  const holeH = Math.min(h, vh * MAX_HOLE_RATIO);
  const holeBottom = top + holeH;
  const hole = {
    top: Math.round(top - pad),
    left: Math.round(left - pad),
    width: Math.round(w + pad * 2),
    height: Math.round(holeH + pad * 2),
  };

  // 3) 아래 → 위 → 오른쪽 → 왼쪽 순으로 "완전히 들어가는" 자리를 찾는다.
  const cx = left + w / 2 - popW / 2;
  const cy = top + holeH / 2 - popH / 2;
  const fitsX = (x) => x >= margin && x + popW <= vw - margin;
  const fitsY = (y) => y >= margin && y + popH <= vh - margin;
  const candidates = [
    { placement: 'bottom', left: clampX(cx), top: holeBottom + pad + gap },
    { placement: 'top', left: clampX(cx), top: top - pad - gap - popH },
    { placement: 'right', left: right + pad + gap, top: clampY(cy) },
    { placement: 'left', left: left - pad - gap - popW, top: clampY(cy) },
  ];
  for (const c of candidates) {
    if (fitsX(c.left) && fitsY(c.top)) {
      return { hole, pop: { left: Math.round(c.left), top: Math.round(c.top) }, placement: c.placement };
    }
  }

  // 4) 어디에도 안 들어가면 화면 위/아래 가장자리에 고정 — 무슨 일이 있어도 보이게 한다.
  //    (하이라이트가 화면 아래쪽이면 위에, 아니면 아래에 붙인다)
  const dockY = holeBottom > vh * 0.55 ? margin : vh - popH - margin;
  return { hole, pop: { left: Math.round(clampX(cx)), top: Math.round(clampY(dockY)) }, placement: 'dock' };
}

/** 요소가 존재하고 화면과 겹치는가 — 겹치지 않으면 그 스텝은 건너뛴다. */
export function isUsableRect(rect, vw, vh) {
  if (!rect) return false;
  if (rect.width <= 0 && rect.height <= 0) return false;
  return rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
}
