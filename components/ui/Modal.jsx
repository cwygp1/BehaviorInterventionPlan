// Reusable modal — uses the existing CSS classes from globals.css.
// Click outside (on .modal-bg) closes via onClose; click on inner .modal does not.
// A small × close button is rendered at the top-right of every modal.
export default function Modal({ open, onClose, children, maxWidth }) {
  if (!open) return null;
  return (
    <div
      className="modal-bg show"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="modal" style={maxWidth ? { maxWidth } : undefined}>
        {onClose && (
          <button className="modal-close" onClick={onClose} title="닫기" aria-label="닫기">×</button>
        )}
        {children}
      </div>
    </div>
  );
}
