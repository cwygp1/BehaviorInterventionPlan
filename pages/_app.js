import '../styles/globals.css';
// 0915(mds/33): 기록 달력·홈 이번 주 띠 — 다른 작업과 globals.css 충돌을 피하려 별도 파일.
import '../styles/calendar.css';
// 1001(mds/46): ▶ 3분 체험하기 재생기·로그인 창 체험 상자 — 다른 세션의 globals.css 작업과 겹치지 않게 별도 파일.
import '../styles/demo.css';
// 1001(mds/46 방법 1~7): 화면 소개 줄·빈 화면 첫 할 일·시작하기 목록·첫 설정 마법사·간단 모드
import '../styles/onboarding.css';
// 1101(mds/54): 새 디자인(/new) 셸 — 모든 규칙이 .kb-new 아래에만 있어 기존 화면에는 닿지 않는다.
import '../styles/tokens.css';
// gridstack — 영역별 대시보드 위젯(드래그·리사이즈) 레이아웃. 전역 CSS는 _app에서만 임포트 가능.
import 'gridstack/dist/gridstack.min.css';
import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { shouldLoadAnalytics } from '../lib/analyticsGate';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { LLMProvider } from '../contexts/LLMContext';

export default function App({ Component, pageProps }) {
  // 분석 스크립트는 원래도 화면이 뜬 뒤(useEffect) 끼워지므로, 주소를 본 뒤 정해도 시점이 같다.
  const [analytics, setAnalytics] = useState(false);
  useEffect(() => {
    setAnalytics(shouldLoadAnalytics(process.env.NEXT_PUBLIC_VERCEL_ENV, window.location.hostname));
  }, []);
  return (
    <ToastProvider>
      <AuthProvider>
        <LLMProvider>
          <Component {...pageProps} />
          {/* 1103(mds/58 #10·#13·#20): 로컬 next start·dev에서는 /_vercel/insights/script.js가 없어 404 콘솔 오류 —
              배포(Vercel 변수 또는 실제 도메인)일 때만 끼운다(lib/analyticsGate.js). 배포본은 그대로. */}
          {analytics ? <Analytics /> : null}
        </LLMProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
