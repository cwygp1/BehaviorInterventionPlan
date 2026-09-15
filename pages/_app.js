import '../styles/globals.css';
// 0915(mds/33): 기록 달력·홈 이번 주 띠 — 다른 작업과 globals.css 충돌을 피하려 별도 파일.
import '../styles/calendar.css';
// gridstack — 영역별 대시보드 위젯(드래그·리사이즈) 레이아웃. 전역 CSS는 _app에서만 임포트 가능.
import 'gridstack/dist/gridstack.min.css';
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
