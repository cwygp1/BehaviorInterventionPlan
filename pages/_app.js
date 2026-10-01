import '../styles/globals.css';
// 0915(mds/33): 기록 달력·홈 이번 주 띠 — 다른 작업과 globals.css 충돌을 피하려 별도 파일.
import '../styles/calendar.css';
// 1001(mds/46): ▶ 3분 체험하기 재생기·로그인 창 체험 상자 — 다른 세션의 globals.css 작업과 겹치지 않게 별도 파일.
import '../styles/demo.css';
// 1001(mds/46 방법 1~7): 화면 소개 줄·빈 화면 첫 할 일·시작하기 목록·첫 설정 마법사·간단 모드
import '../styles/onboarding.css';
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
