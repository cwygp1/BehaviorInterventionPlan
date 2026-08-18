import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGuide } from './GuideContext';
import { getTour } from '../../lib/tours';
import { glossaryById } from '../../lib/glossary';
import { placeTour, isUsableRect, TOUR_PAD } from '../../lib/tourPlace';

// 스포트라이트 투어 엔진 — 의존성 0, 자체 구현 (mds/23 기능③).
//
// 동작:
//   - step.el(선택자)이 있으면 그 요소를 밝게 남기고 나머지를 어둡게(스포트라이트),
//     없으면 화면 중앙 카드로 개념을 설명한다.
//   - 요소를 폴링(180ms×8)으로 기다리고, 끝내 없거나 화면 밖(접힌 사이드바 등)이면
//     그 스텝을 자동으로 건너뛴다.
//   - 스크롤 컨테이너가 window가 아니라 .main/.content 라서 position:fixed +
//     getBoundingClientRect 로 좌표를 잡고, scroll(capture)·resize에 따라 갱신한다.
//   - 좌표 계산은 lib/tourPlace.js(순수 함수)가 담당한다. 팝오버 크기를 실측해서
//     넘기므로 "화면보다 긴 카드"에서도 안내가 화면 밖으로 나가지 않는다.
//   - 진행 중에는 투명 실드가 오조작을 막는다. ESC/→/←/Enter 키 지원.

const POP_MAX_W = 340; // 팝오버 최대 폭(px) — 실제 폭은 CSS min()으로 화면에 맞춰 줄어든다

// SSR 경고 방지 — 서버에서는 useEffect로 대체.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
}

export default function SpotlightTour() {
  const { tourKey, tourPaused, stopTour, openGlossary } = useGuide();
  const steps = useMemo(() => getTour(tourKey) || [], [tourKey]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ w: 1024, h: 768 });
  const [popSize, setPopSize] = useState({ w: POP_MAX_W, h: 220 });
  const elRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => { setIdx(0); }, [tourKey]);

  const total = steps.length;
  const step = steps[idx] || null;
  const isLast = idx >= total - 1;

  const finish = useCallback(() => stopTour(tourKey), [stopTour, tourKey]);
  const next = useCallback(() => {
    if (isLast) finish();
    else setIdx((i) => i + 1);
  }, [isLast, finish]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // 대상 요소 찾기(폴링) + 스크롤 후 좌표 측정 + 위치 추적
  useEffect(() => {
    if (!tourKey || !step || tourPaused) return undefined;
    let alive = true;
    let tries = 0;
    setReady(false);
    setRect(null);
    elRef.current = null;

    const readView = () => ({ w: window.innerWidth, h: window.innerHeight });

    function locate() {
      if (!alive) return;
      const el = step.el ? document.querySelector(step.el) : null;
      const v = readView();
      if (step.el && !isUsableRect(rectOf(el), v.w, v.h)) {
        if (++tries <= 8) { setTimeout(locate, 180); return; }
        // 요소가 없거나 화면 밖이면 이 스텝은 건너뛴다 (마지막이면 종료)
        if (idx < total - 1) setIdx(idx + 1); else finish();
        return;
      }
      elRef.current = el;
      if (el) {
        try {
          // 화면보다 긴 요소는 최소한만 스크롤(윗부분이 보이게), 아니면 가운데로.
          const r = rectOf(el);
          const tall = r && r.height > v.h * 0.9;
          el.scrollIntoView({ block: tall ? 'nearest' : 'center', behavior: 'smooth' });
        } catch (_) { /* noop */ }
      }
      // 스크롤이 끝날 시간을 살짝 준 뒤 측정
      setTimeout(() => {
        if (!alive) return;
        setView(readView());
        setRect(el ? rectOf(el) : null);
        setReady(true);
      }, el ? 300 : 0);
    }
    locate();

    const sync = () => {
      setView(readView());
      const el = elRef.current;
      if (el) setRect(rectOf(el));
    };
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true); // .main 스크롤도 capture로 수신
    return () => {
      alive = false;
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [tourKey, step, idx, total, finish, tourPaused]);

  // 팝오버 실제 크기 측정 — 위치 계산에 쓴다(브라우저가 그리기 전에 반영돼 깜빡임 없음).
  useIsoLayoutEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    setPopSize((cur) => (Math.abs(cur.w - w) < 1 && Math.abs(cur.h - h) < 1 ? cur : { w, h }));
  });

  // 일시정지 해제(용어 사전 닫힘) 직후 — 대상 좌표를 한 번 다시 재서 어긋남을 막는다.
  useEffect(() => {
    if (tourPaused) return;
    const el = elRef.current;
    if (!el) return;
    setView({ w: window.innerWidth, h: window.innerHeight });
    setRect(rectOf(el));
  }, [tourPaused]);

  // 키보드: ESC 닫기, →/Enter 다음, ← 이전 (용어 사전으로 일시정지 중엔 모달이 키를 갖는다)
  useEffect(() => {
    if (!tourKey || tourPaused) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourKey, tourPaused, next, prev, finish]);

  if (!tourKey || !step) return null;
  // 용어 사전을 보는 동안은 오버레이·팝오버를 잠시 숨긴다. 컴포넌트는 그대로 살아 있어
  // 현재 스텝(idx)이 보존되고, 사전을 닫으면 같은 자리에서 이어진다.
  if (tourPaused) return null;

  const term = step.term ? glossaryById(step.term) : null;
  // 좌표는 전부 순수 함수가 계산 — 어떤 요소에서도 팝오버는 화면 안에 있다.
  const { hole, pop } = placeTour({
    rect: ready ? rect : null,
    vw: view.w,
    vh: view.h,
    popW: popSize.w,
    popH: popSize.h,
    pad: TOUR_PAD,
  });

  return (
    <>
      {/* 어두운 배경: 하이라이트가 있으면 구멍(box-shadow), 없으면 전체 딤 */}
      {hole ? (
        <div className="tour-hole" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
      ) : (
        <div className="tour-dim" />
      )}
      {/* 진행 중 오조작 방지 실드 (팝오버는 이 위에 있어 조작 가능) */}
      <div className="tour-shield" />

      <div
        className="tour-pop"
        ref={popRef}
        style={{ left: pop.left, top: pop.top, width: `min(${POP_MAX_W}px, calc(100vw - 24px))` }}
        role="dialog"
        aria-modal="true"
        aria-label="화면 안내"
      >
        <div className="tour-count">{idx + 1} / {total}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-desc">{step.desc}</div>
        {term && (
          <button className="tour-term" onClick={() => openGlossary(term.id)}>
            📖 쉬운 말 풀이: {term.term}
          </button>
        )}
        <div className="tour-foot">
          <button className="btn btn-ghost btn-sm" onClick={finish}>그만 보기</button>
          <div className="tour-nav">
            {idx > 0 && <button className="btn btn-ghost btn-sm" onClick={prev}>← 이전</button>}
            <button className="btn btn-pri btn-sm" onClick={next}>{isLast ? '끝내기 ✓' : '다음 →'}</button>
          </div>
        </div>
        <div className="tour-hint">Esc 닫기 · ←→ 이동</div>
      </div>
    </>
  );
}
