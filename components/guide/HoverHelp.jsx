import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGuide } from './GuideContext';
import { resolveHelp } from '../../lib/helpText';
import { glossaryById } from '../../lib/glossary';
import { placeTour } from '../../lib/tourPlace';

// 도움말 모드의 마우스 설명 — ❓를 켠 동안 마우스를 올린 요소의 설명을 말풍선으로 (0923).
//
// 동작 (0923 결정):
//   · 클릭은 평소대로 된다 — 테두리·말풍선은 pointer-events:none이라 아무것도 가로막지 않는다.
//   · PC(마우스)에서만. 터치 입력은 무시한다.
//   · 가장 가까운 [data-help]/[data-tour] 앵커의 설명을 찾고, 설명이 없으면 바깥 앵커(감싼 카드)로 올라간다.
//   · 글자를 입력하는 동안은 숨긴다 — 입력(키·한글 조합)이 시작되면 숨기고, 마우스를 다시 움직이면 되살린다.
//   · 투어·용어 사전·❓ 메뉴가 떠 있는 동안은 쉰다.
//   · 위치 계산은 투어와 같은 순수 함수(lib/tourPlace.js) — 말풍선은 항상 화면 안, 대상 옆에 놓인다.

const SEL = '[data-help],[data-tour]';
const COLD_DELAY = 280; // 처음 뜰 때 — 지나가는 마우스에 번쩍이지 않게
const WARM_DELAY = 70;  // 이미 떠 있을 때 옆 요소로 옮기면 거의 바로
const POP_MAX_W = 300;
const RESUME_PX = 8;    // 입력 중 숨긴 뒤 이만큼 움직이면 다시 켠다

// SSR 경고 방지 — 서버에서는 useEffect로 대체(SpotlightTour와 같은 방식).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
}

// 큰 카드(화면 높이 40%·너비 60% 초과)는 요소 옆이 아니라 마우스 곁에 말풍선을 둔다 —
// 요소 기준이면 말풍선이 카드 한가운데(보고 있는 곳)를 덮을 수 있다.
function anchorRect(r, x, y, vw, vh) {
  const big = r.height > vh * 0.4 || r.width > vw * 0.6;
  if (!big || x < 0) return r;
  return { top: y - 14, bottom: y + 14, left: x - 14, right: x + 14, width: 28, height: 28 };
}

// 테두리 — 화면에 보이는 부분만.
function clipBox(r, vw, vh, pad = 3) {
  const top = Math.max(0, r.top) - pad;
  const left = Math.max(0, r.left) - pad;
  const bottom = Math.min(vh, r.bottom) + pad;
  const right = Math.min(vw, r.right) + pad;
  if (bottom - top <= pad * 2 || right - left <= pad * 2) return null;
  return { top, left, width: right - left, height: bottom - top };
}

const isEditable = (el) =>
  !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

/** node에서 시작해 설명이 있는 가장 가까운 앵커 — 없으면 바깥 앵커로 올라간다. */
function findHelp(node, page) {
  let el = node && node.closest ? node.closest(SEL) : null;
  while (el) {
    const key = el.getAttribute('data-help') || el.getAttribute('data-tour');
    const h = resolveHelp(key, page);
    if (h) return { el, key, help: h };
    el = el.parentElement ? el.parentElement.closest(SEL) : null;
  }
  return null;
}

export default function HoverHelp() {
  const { helpMode, tourKey, glossary, menuOpen, canHover, activePage } = useGuide();
  const active = helpMode && canHover && !tourKey && !glossary.open && !menuOpen;
  const [tip, setTip] = useState(null); // { key, rect, title, desc, term }
  const [view, setView] = useState({ w: 1024, h: 768 });
  const [popSize, setPopSize] = useState({ w: POP_MAX_W, h: 90 });
  const popRef = useRef(null);

  // 도움말 모드 표시 — 마우스 모양을 '?'로 (버튼 등은 각자 cursor:pointer 유지)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('help-mode-on', !!(helpMode && canHover));
    return () => document.body.classList.remove('help-mode-on');
  }, [helpMode, canHover]);

  useEffect(() => {
    if (!active) { setTip(null); return undefined; }
    let raf = 0;
    let timer = 0;
    let curEl = null;
    let shown = false;
    let suppressed = false;
    let supX = 0; let supY = 0; let lastX = -1; let lastY = -1;

    const hide = () => {
      clearTimeout(timer);
      curEl = null;
      shown = false;
      setTip(null);
    };
    const show = (hit) => {
      shown = true;
      const vw = window.innerWidth; const vh = window.innerHeight;
      const r = rectOf(hit.el);
      setView({ w: vw, h: vh });
      setTip({ key: hit.key, rect: r, anchor: anchorRect(r, lastX, lastY, vw, vh), ...hit.help });
    };

    const evaluate = () => {
      raf = 0;
      if (suppressed || lastX < 0) return;
      const node = document.elementFromPoint(lastX, lastY);
      const hit = findHelp(node, activePage);
      if (!hit) { if (curEl || shown) hide(); return; }
      if (hit.el === curEl) return;
      curEl = hit.el;
      clearTimeout(timer);
      timer = setTimeout(() => { if (curEl === hit.el && !suppressed) show(hit); }, shown ? WARM_DELAY : COLD_DELAY);
    };

    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      lastX = e.clientX; lastY = e.clientY;
      if (suppressed) {
        if (Math.hypot(lastX - supX, lastY - supY) < RESUME_PX) return;
        suppressed = false;
      }
      if (!raf) raf = requestAnimationFrame(evaluate);
    };
    // 글자 입력이 시작되면 숨긴다(IME 후보창·자동완성을 가리지 않게).
    // keydown·compositionstart에 더해 input도 본다 — 붙여넣기·음성 입력·자동완성처럼 키 없이 글자가 바뀌는 경우.
    const onType = (e) => {
      if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Shift' || e.metaKey || e.ctrlKey)) return;
      if (!isEditable(e.target)) return;
      suppressed = true; supX = lastX; supY = lastY;
      hide();
    };
    // 스크롤·창 크기 변경 — 같은 요소면 자리만 옮기고, 화면 밖으로 나가면 숨긴다.
    const onScroll = () => {
      if (!curEl || !shown) return;
      const r = rectOf(curEl);
      if (r.bottom <= 0 || r.top >= window.innerHeight || !curEl.isConnected) { hide(); return; }
      const vw = window.innerWidth; const vh = window.innerHeight;
      setView({ w: vw, h: vh });
      setTip((t) => (t ? { ...t, rect: r, anchor: anchorRect(r, lastX, lastY, vw, vh) } : t));
    };
    const onLeave = (e) => { if (!e.relatedTarget) { lastX = -1; hide(); } };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('keydown', onType, true);
    document.addEventListener('compositionstart', onType, true);
    document.addEventListener('input', onType, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mouseout', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('keydown', onType, true);
      document.removeEventListener('compositionstart', onType, true);
      document.removeEventListener('input', onType, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mouseout', onLeave);
      setTip(null);
    };
  }, [active, activePage]);

  // 말풍선 실제 크기 — 위치 계산에 쓴다(그리기 전에 반영).
  useIsoLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    setPopSize((cur) => (Math.abs(cur.w - w) < 1 && Math.abs(cur.h - h) < 1 ? cur : { w, h }));
  });

  if (!active || !tip) return null;
  const term = tip.term ? glossaryById(tip.term) : null;
  const box = clipBox(tip.rect, view.w, view.h);
  const { pop } = placeTour({ rect: tip.anchor || tip.rect, vw: view.w, vh: view.h, popW: popSize.w, popH: popSize.h, pad: 4, gap: 8 });

  return (
    <>
      {box && <div className="hh-box" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      <div
        className="hh-pop"
        ref={popRef}
        role="tooltip"
        style={{ left: pop.left, top: pop.top, width: `min(${POP_MAX_W}px, calc(100vw - 24px))` }}
      >
        {tip.title && <div className="hh-title">{tip.title}</div>}
        <div className="hh-desc">{tip.desc}</div>
        {term && <div className="hh-term">📖 {term.term} — {term.short}</div>}
      </div>
    </>
  );
}
