import { FOLD_OPEN_EVENT } from '../ui/FoldCard';

// 접힌 컨테이너 안의 요소면 펼침을 요청한다 — FoldCard/사이드바 '더 보기'(data-fold-id)·<details>.
// 투어(SpotlightTour)와 길잡이(EscortGuide)가 같이 쓴다.
export function revealAnchor(el) {
  if (!el) return;
  try {
    const fold = el.closest('[data-fold-id]');
    if (fold) window.dispatchEvent(new CustomEvent(FOLD_OPEN_EVENT, { detail: { id: fold.getAttribute('data-fold-id') } }));
    let p = el.parentElement;
    while (p) { if (p.tagName === 'DETAILS' && !p.open) p.open = true; p = p.parentElement; }
  } catch (_) { /* noop */ }
}
