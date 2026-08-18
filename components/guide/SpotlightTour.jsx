import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGuide } from './GuideContext';
import { getTour } from '../../lib/tours';
import { glossaryById } from '../../lib/glossary';

// 스포트라이트 투어 엔진 — 의존성 0, 자체 구현 (mds/23 기능③).
//
// 동작:
//   - step.el(선택자)이 있으면 그 요소를 밝게 남기고 나머지를 어둡게(스포트라이트),
//     없으면 화면 중앙 카드로 개념을 설명한다.
//   - 요소를 폴링(180ms×8)으로 기다리고, 끝내 없거나 화면 밖(접힌 사이드바·다른
//     Tier 설정)이면 그 스텝을 자동으로 건너뛴다.
//   - 스크롤 컨테이너가 window가 아니라 .main/.content 라서 position:fixed +
//     getBoundingClientRect 로 좌표를 잡고, scroll(capture)·resize에 따라 갱신한다.
//   - 하이라이트는 div 1개 + 거대한 box-shadow(구멍 뚫기) 방식. 진행 중에는 투명
//     실드가 오조작을 막는다. ESC/→/←/Enter 키 지원.

const PAD = 6; // 하이라이트 여백(px)
const POP_W = 340; // 팝오버 폭(px)

function visibleRect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null; // display:none 등
  // 화면 밖(접힌 모바일 사이드바 등)이면 없는 것으로 취급 → 스텝 건너뜀
  if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight * 1.5) return null;
  return r;
}

export default function SpotlightTour() {
  const { tourKey, tourPaused, stopTour, openGlossary } = useGuide();
  const steps = useMemo(() => getTour(tourKey) || [], [tourKey]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const elRef = useRef(null);

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
    if (!tourKey || !step) return undefined;
    let alive = true;
    let tries = 0;
    setReady(false);
    setRect(null);
    elRef.current = null;

    function locate() {
      if (!alive) return;
      const el = step.el ? document.querySelector(step.el) : null;
      if (step.el && !visibleRect(el)) {
        if (++tries <= 8) { setTimeout(locate, 180); return; }
        // 요소가 없으면 이 스텝은 건너뛴다 (마지막이면 종료)
        if (idx < total - 1) setIdx(idx + 1); else finish();
        return;
      }
      elRef.current = el;
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* noop */ }
      }
      // 스크롤이 끝날 시간을 살짝 준 뒤 측정
      setTimeout(() => {
        if (!alive) return;
        setRect(el ? visibleRect(el) : null);
        setReady(true);
      }, el ? 300 : 0);
    }
    locate();

    const sync = () => {
      const el = elRef.current;
      if (!el) return;
      const r = visibleRect(el);
      if (r) setRect(r);
    };
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true); // .main 스크롤도 capture로 수신
    return () => {
      alive = false;
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [tourKey, step, idx, total, finish]);

  // 일시정지 해제(용어 사전 닫힘) 직후 — 대상 좌표를 한 번 다시 재서 어긋남을 막는다.
  useEffect(() => {
    if (tourPaused) return;
    const el = elRef.current;
    if (!el) return;
    const r = visibleRect(el);
    if (r) setRect(r);
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

  const showHole = ready && !!rect;
  const term = step.term ? glossaryById(step.term) : null;

  // 팝오버 위치 — 대상 아래 공간이 부족하면 위로, 좌우는 화면 안으로 클램프
  const popStyle = { width: `min(${POP_W}px, calc(100vw - 24px))` };
  if (!showHole) {
    popStyle.left = '50%';
    popStyle.top = '50%';
    popStyle.transform = 'translate(-50%, -50%)';
  } else {
    const spaceBelow = window.innerHeight - rect.bottom;
    const below = spaceBelow > 200;
    if (below) popStyle.top = Math.round(rect.bottom + PAD + 10);
    else popStyle.bottom = Math.round(window.innerHeight - rect.top + PAD + 10);
    let left = rect.left + rect.width / 2 - POP_W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - POP_W - 12));
    popStyle.left = Math.round(left);
  }

  return (
    <>
      {/* 어두운 배경: 하이라이트가 있으면 구멍(box-shadow), 없으면 전체 딤 */}
      {showHole ? (
        <div
          className="tour-hole"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      {/* 진행 중 오조작 방지 실드 (팝오버는 이 위에 있어 조작 가능) */}
      <div className="tour-shield" />

      <div className="tour-pop" style={popStyle} role="dialog" aria-modal="true" aria-label="화면 안내">
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
