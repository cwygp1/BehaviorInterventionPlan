import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGuide } from './GuideContext';
import { getTour } from '../../lib/tours';
import { glossaryById } from '../../lib/glossary';
import { placeTour, isUsableRect, TOUR_PAD } from '../../lib/tourPlace';
import { revealAnchor } from './reveal';

// 스포트라이트 투어 엔진 — 의존성 0, 자체 구현 (mds/23 기능③).
//
// 동작:
//   - step.el(선택자)이 있으면 그 요소를 밝게 남기고 나머지를 어둡게(스포트라이트),
//     없으면 화면 중앙 카드로 개념을 설명한다.
//   - 요소를 폴링(180ms×8)으로 기다린다. 접힌 카드(FoldCard·<details>·사이드바 더 보기) 안이면
//     먼저 펼치도록 요청한다(0914 P0). 끝내 없거나 화면 밖이면 건너뛰지 않고 가운데 카드로
//     설명만 보여준다(이전엔 조용히 건너뛰어 '접기' 도입 시 스텝이 사라질 수 있었다).
//   - 스크롤 컨테이너가 window가 아니라 .main/.content 라서 position:fixed +
//     getBoundingClientRect 로 좌표를 잡고, scroll(capture)·resize에 따라 갱신한다.
//   - 좌표 계산은 lib/tourPlace.js(순수 함수)가 담당한다. 팝오버 크기를 실측해서
//     넘기므로 "화면보다 긴 카드"에서도 안내가 화면 밖으로 나가지 않는다.
//   - 진행 중에는 투명 실드가 오조작을 막는다. ESC/→/←/Enter 키 지원.

const POP_MAX_W = 340; // 팝오버 최대 폭(px) — 실제 폭은 CSS min()으로 화면에 맞춰 줄어든다

// 큰 요소(긴 표·목록)를 위쪽만 밝힐 때 끊을 자리 — 줄·항목의 아래 경계(뷰포트 y). lib/tourPlace.js의 snaps.
const ROW_SEL = 'tr, li, .card-title, .card-subtitle, [data-help$="-row"], [data-help$="-item"]';
function rowBottoms(el) {
  if (!el) return [];
  try {
    const box = (list) => [...list].map((c) => c.getBoundingClientRect()).filter((r) => r.height > 0);
    // 화면 40%보다 큰 '줄'(목표 한 건 전체를 감싼 묶음 등)은 줄이 아니라 묶음 — 가로지름 판정에서 뺀다.
    const rows = box(el.querySelectorAll(ROW_SEL)).filter((r) => r.height < window.innerHeight * 0.4);
    // 표 안의 표처럼 줄이 겹쳐 있으면, 안쪽 줄의 아래 경계가 바깥 줄 한가운데일 수 있다 → 어느 줄도 가로지르지 않는 경계만.
    // (카드의 직계 자식은 큰 묶음이라 끊을 후보로만 쓰고, 가로지름 판정에는 줄만 쓴다.)
    // 줄의 위 경계도 후보 — 큰 줄 바로 위(앞 줄과의 사이)에서 끊을 수 있게.
    return [...box(el.children).map((r) => r.bottom), ...rows.map((r) => r.bottom), ...rows.map((r) => r.top)]
      .filter((y) => !rows.some((q) => q.top < y - 2 && q.bottom > y + 2));
  } catch (_) { return []; }
}

// SSR 경고 방지 — 서버에서는 useEffect로 대체.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
}

export default function SpotlightTour() {
  const { tourKey, tourPaused, customSteps, stopTour, openGlossary } = useGuide();
  // 'custom:'으로 시작하는 키는 ❓ 메뉴가 즉석으로 만든 안내(0923) — 스텝을 컨텍스트에서 받는다.
  const steps = useMemo(
    () => (tourKey && tourKey.startsWith('custom:') ? customSteps || [] : getTour(tourKey) || []),
    [tourKey, customSteps]
  );
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ w: 1024, h: 768 });
  const [popSize, setPopSize] = useState({ w: POP_MAX_W, h: 220 });
  const [fallback, setFallback] = useState(false); // 대상 요소를 못 찾아 가운데 카드로 대신 보여주는 중
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
    setFallback(false);
    elRef.current = null;

    const readView = () => ({ w: window.innerWidth, h: window.innerHeight });

    // 끝내 대상을 못 쓰면 이 스텝은 가운데 카드로 설명만 보여준다(작은 화면·접힘 등).
    const fallbackNow = (v) => {
      elRef.current = null;
      setFallback(true);
      setView(v);
      setRect(null);
      setReady(true);
    };

    function locate() {
      if (!alive) return;
      const el = step.el ? document.querySelector(step.el) : null;
      const v = readView();
      const r0 = el ? rectOf(el) : null;
      // 요소가 없거나 크기가 0(접힘·숨김)이면 펼침을 요청하고 잠시 기다린다.
      // ⚠ '화면 밖'은 여기서 거르지 않는다 — 아래쪽에 있는 요소는 스크롤하면 보인다.
      //   (1001 현장: 기초조사① 투어 6/6 '저장과 AI 요약'이 맨 아래 카드라 스크롤 전에 '화면 밖'으로 판정돼
      //    늘 "이 화면 크기·상태에서는…" 가운데 카드로만 떴다. 아래쪽 대상을 짚는 투어 스텝 전부 같은 문제.)
      if (step.el && !(r0 && (r0.width > 0 || r0.height > 0))) {
        if (tries === 0) revealAnchor(el);
        if (++tries <= 8) { setTimeout(locate, 180); return; }
        fallbackNow(v);
        return;
      }
      elRef.current = el;
      if (el) {
        try {
          // 화면보다 긴 요소는 최소한만 스크롤(윗부분이 보이게), 아니면 가운데로.
          const tall = r0 && r0.height > v.h * 0.9;
          el.scrollIntoView({ block: tall ? 'nearest' : 'center', behavior: 'smooth' });
        } catch (_) { /* noop */ }
      }
      // 스크롤이 끝날 때까지 기다렸다가 측정 — 끝내 화면에 안 들어오면(닫힌 사이드바 서랍 등) 가운데 카드.
      let waits = 0;
      const measure = () => {
        if (!alive) return;
        const v2 = readView();
        const r = el ? rectOf(el) : null;
        if (el && !isUsableRect(r, v2.w, v2.h)) {
          if (++waits <= 6) { setTimeout(measure, 150); return; }
          fallbackNow(v2);
          return;
        }
        setView(v2);
        setRect(r);
        setReady(true);
      };
      setTimeout(measure, el ? 300 : 0);
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
    snaps: ready && rect ? rowBottoms(elRef.current) : [],
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
        data-target={step.el || ''} // 지금 가리키는 대상(선택자) — 화면 점검·디버깅용
      >
        <div className="tour-count">{idx + 1} / {total}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-desc">{step.desc}</div>
        {step.sub && <div className="tour-sub">{step.sub}</div>}
        {/* 1001 현장 "뭘 나타내는 거야": 가리킬 칸이 없을 때 이유를 쉬운 말로 — 스텝에 whenMissing이 있으면 그것 */}
        {fallback && !step.quietFallback && <div className="tour-fallback">📍 {step.whenMissing || '가리킬 칸이 지금 화면에 없어서 설명만 보여드려요.'}</div>}
        {step.action && (
          <button className="btn btn-pri btn-sm tour-action" onClick={() => { finish(); step.action.run(); }}>
            {step.action.label}
          </button>
        )}
        {term && (
          <button className="tour-term" onClick={() => openGlossary(term.id)}>
            📖 쉬운 말 풀이: {term.term}
          </button>
        )}
        <div className="tour-foot">
          {/* 한 장짜리(❓ '다음 할 일' 등)는 오른쪽 '닫기'와 같은 일이라 숨긴다 */}
          {total > 1 ? <button className="btn btn-ghost btn-sm" onClick={finish}>그만 보기</button> : <span />}
          <div className="tour-nav">
            {idx > 0 && <button className="btn btn-ghost btn-sm" onClick={prev}>← 이전</button>}
            <button className={'btn btn-sm ' + (step.action ? 'btn-ghost' : 'btn-pri')} onClick={next}>
              {isLast ? (step.action ? '닫기' : '끝내기 ✓') : '다음 →'}
            </button>
          </div>
        </div>
        <div className="tour-hint">Esc 닫기 · ←→ 이동</div>
      </div>
    </>
  );
}
