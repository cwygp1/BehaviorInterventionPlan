import { useEffect, useRef } from 'react';

// Reusable modal — uses the existing CSS classes from globals.css.
// Click outside (on .modal-bg) closes via onClose; click on inner .modal does not.
// ESC 키로 닫기, 열릴 때 첫 포커스 이동, Tab 포커스 트랩(모달 밖으로 새지 않음)을 지원한다.
export default function Modal({ open, onClose, children, maxWidth }) {
  const boxRef = useRef(null);

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
