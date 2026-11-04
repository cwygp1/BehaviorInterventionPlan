import { useEffect, useId, useRef } from 'react';

// Reusable modal — uses the existing CSS classes from globals.css.
// Click outside (on .modal-bg) closes via onClose; click on inner .modal does not.
// ESC 키로 닫기, 열릴 때 첫 포커스 이동, Tab 포커스 트랩(모달 밖으로 새지 않음)을 지원한다.
// 1103(mds/58 #18): 창 이름(aria-labelledby) — titleId를 넘기면 그 요소, 없으면 창 안 첫 h2·h3(id가 없으면 붙여 줌).
//   닫히면 열기 전에 초점이 있던 단추로 초점을 되돌린다. 보이는 모양은 그대로.
export default function Modal({ open, onClose, children, maxWidth, titleId }) {
  const boxRef = useRef(null);
  const openerRef = useRef(null); // 열 때 초점이 있던 요소(닫힐 때 되돌릴 곳)
  const wasOpenRef = useRef(false);
  const autoTitleId = useId();
  // 열리는 그 렌더에서 초점 자리를 기억한다 — 창 안 입력칸의 autoFocus가 효과(effect)보다 먼저 초점을 가져가므로 렌더 때 읽는다.
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    const a = document.activeElement;
    openerRef.current = a && a !== document.body ? a : null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return undefined;

    function onKey(e) {
      if (e.key === 'Escape' && onClose) { onClose(); return; }
      if (e.key !== 'Tab') return;
      // 포커스 트랩
      const box = boxRef.current;
      if (!box) return;
      const items = box.querySelectorAll(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 열릴 때 첫 입력 요소(없으면 닫기 버튼)로 포커스 이동 — 반드시 open 전환 시 1회만.
  // ⚠ 0825: deps에 onClose를 두면 부모가 인라인 함수를 넘길 때 리렌더마다(특히
  //   자동 저장 → 학생 캐시 갱신 → 부모 리렌더) 재실행되어, 작성 중이던 입력칸에서
  //   포커스가 첫 요소로 튀고 스크롤이 맨 위로 올라갔다("커서가 움직인다" 피드백).
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      const box = boxRef.current;
      if (!box) return;
      const focusable = box.querySelector(
        'input,textarea,select,button:not(.modal-close)'
      ) || box.querySelector('.modal-close');
      // preventScroll — 첫 포커스 대상이 본문 아래쪽에 있으면(예: 선택지가 전부
      // span이고 첫 button이 하단 '취소'인 우선순위 체크리스트) 브라우저가 그
      // 위치로 스크롤해 모달이 하단부터 열려 제목·1번 문항이 잘려 보였다.
      focusable?.focus?.({ preventScroll: true });
      box.scrollTop = 0; // 항상 맨 위에서 시작
    }, 40);
    return () => clearTimeout(t);
  }, [open]);

  // 닫힐 때(open true→false 전환) 1회만 — 열기 전 초점 자리로 되돌린다.
  // ⚠ 0825 '커서가 튄다' 사고: 리렌더마다 돌면 안 되므로 deps는 [open] 하나뿐이다(열린 동안에는 아무것도 하지 않는다).
  useEffect(() => {
    if (open) return undefined;
    const el = openerRef.current;
    openerRef.current = null;
    if (el && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
    return undefined;
  }, [open]);

  // 창 이름 잇기 — titleId가 없으면 창 안 첫 제목(h2·h3)에 id를 붙여 aria-labelledby로 쓴다(단계가 바뀌어 제목이 바뀌어도 다시 잇는다).
  useEffect(() => {
    if (!open || titleId) return;
    const box = boxRef.current;
    if (!box) return;
    const h = box.querySelector('h2, h3');
    if (!h) { box.removeAttribute('aria-labelledby'); return; }
    if (!h.id) h.id = `${autoTitleId}-t`;
    if (box.getAttribute('aria-labelledby') !== h.id) box.setAttribute('aria-labelledby', h.id);
  });

  if (!open) return null;
  return (
    <div
      className="modal-bg show"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        className="modal"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId || undefined}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {onClose && (
          <button className="modal-close" onClick={onClose} title="닫기 (ESC)" aria-label="닫기 (ESC 키)">×</button>
        )}
        {children}
      </div>
    </div>
  );
}
