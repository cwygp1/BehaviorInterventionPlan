import '../styles/globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { LLMProvider } from '../contexts/LLMContext';

export default function App({ Component, pageProps }) {
  return (
    <ToastProvider>
      <LLMProvider>
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </LLMProvider>
    </ToastProvider>
  );
}
