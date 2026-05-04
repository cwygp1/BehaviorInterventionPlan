import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const [show, setShow] = useState(false);

  const toast = useCallback((msg) => {
    setMessage(msg);
    setShow(true);
    // Auto-hide after 2.2s — matches legacy SPA timing.
    setTimeout(() => setShow(false), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div id="toast" className={'toast' + (show ? ' show' : '')}>{message}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
