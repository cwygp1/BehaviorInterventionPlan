import '../styles/globals.css';
import { Analytics } from '@vercel/analytics/next';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { LLMProvider } from '../contexts/LLMContext';

export default function App({ Component, pageProps }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <LLMProvider>
          <Component {...pageProps} />
          <Analytics />
        </LLMProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
