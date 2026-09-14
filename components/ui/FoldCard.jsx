import { useEffect, useId, useState } from 'react';

// 접이식 카드 — '기본 / 더 보기' (0914 단순화 P0, mds/30 §3-5).
//   · 한 번 하는 준비 도구·부가 산출물·고급 설정을 접되, 머리줄에 상태 요약(summary)은 항상 보인다.
//   · 내용은 항상 DOM에 둔다(display:none) — 투어 앵커·검색이 요소를 찾을 수 있게.
//   · mode='clip': 내용을 잘라서 숨긴다(max-height:0 + visibility) — 차트 캔버스가 크기를 유지해
//     결과 보고서의 canvas.toDataURL 캡처가 비지 않는다(EvalPage). height:0 접기는 금지.
//   · 투어(SpotlightTour)가 접힌 요소를 만나면 FOLD_OPEN_EVENT에 data-fold-id를 실어 보낸다 → 펼침.
//   · storageKey를 주면 펼침/접힘 상태를 기기별(localStorage)로 기억한다.
export const FOLD_OPEN_EVENT = 'kkobak-fold-open';

export default function FoldCard({
  id, title, summary, defaultOpen = false, storageKey, forceOpen = false, mode = 'none',
  className = '', style, headerRight, tourAnchor, children,
}) {
  const autoId = useId();
  const foldId = id || autoId;
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const v = localStorage.getItem(storageKey);
        if (v === '1') return true;
        if (v === '0') return false;
      } catch (_e) { /* 사생활 모드 등 */ }
    }
    return defaultOpen;
  });

  useEffect(() => {
    const onOpen = (e) => { if (e?.detail?.id === foldId) setOpen(true); };
    window.addEventListener(FOLD_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FOLD_OPEN_EVENT, onOpen);
  }, [foldId]);

  const isOpen = open || forceOpen;
  const toggle = () => setOpen((o) => {
    const n = !o;
    if (storageKey) { try { localStorage.setItem(storageKey, n ? '1' : '0'); } catch (_e) { /* noop */ } }
    return n;
  });

  return (
    <div
      className={'card fold-card' + (isOpen ? ' open' : '') + (className ? ' ' + className : '')}
      style={style}
      data-fold-id={foldId}
      data-tour={tourAnchor}
    >
      <div className="fold-head">
        <button type="button" className="fold-toggle" onClick={toggle} aria-expanded={isOpen} aria-controls={`${foldId}-body`}>
          <span className="fold-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
          <span className="fold-title">{title}</span>
          {!isOpen && summary && <span className="fold-summary">{summary}</span>}
        </button>
        {headerRight && <div className="fold-right">{headerRight}</div>}
      </div>
      <div
        id={`${foldId}-body`}
        className={'fold-body' + (mode === 'clip' ? ' clip' : '') + (isOpen ? '' : ' closed')}
        aria-hidden={!isOpen}
      >
        {children}
      </div>
    </div>
  );
}
