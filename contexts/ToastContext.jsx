import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext({ toast: () => {} });

const ICONS = { success: '✓', error: '⚠', info: 'ℹ', '': '' };
// 타입을 명시하지 않은 기존 호출도 메시지 내용으로 자동 추론한다.
function inferType(msg) {
  const s = String(msg || '');
  if (/(실패|오류|에러|안 ?됨|없습니다|불가|금지|확인해|입력해)/.test(s)) return 'error';
  if (/(완료|저장|성공|등록됨|반영|복사)/.test(s)) return 'success';
  return '';
}

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  // toast(msg) 또는 toast(msg, 'success'|'error'|'info') 모두 지원 (하위 호환).
  const toast = useCallback((msg, t) => {
    const kind = t || inferType(msg);
    setMessage(msg);
    setType(kind);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    // 에러는 충분히 읽을 수 있도록 더 오래 유지.
    const dur = kind === 'error' ? 4200 : 2400;
    timer.current = setTimeout(() => setShow(false), dur);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div id="toast" role="status" aria-live="polite" className={'toast' + (type ? ' ' + type : '') + (show ? ' show' : '')}>
        {ICONS[type] ? <span className="toast-ico" aria-hidden="true">{ICONS[type]}</span> : null}
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
