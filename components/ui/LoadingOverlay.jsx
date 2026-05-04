export default function LoadingOverlay({ show, message }) {
  return (
    <div className={'loading-overlay' + (show ? ' show' : '')}>
      <div className="spinner-lg" />
      <div className="msg">{message || '잠시만 기다려 주세요...'}</div>
    </div>
  );
}
