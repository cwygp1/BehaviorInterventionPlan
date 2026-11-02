import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { StudentProvider } from '../contexts/StudentContext';
import AuthScreen from '../components/auth/AuthScreen';
import AppShell from '../components/layout/AppShell';
import LoadingOverlay from '../components/ui/LoadingOverlay';
import { wantsNewDesign } from '../lib/uiMode';
import { saveNavIdx } from '../lib/nav/legacyNav';

// 새 디자인(/new) — 기존 사이트(/)와 같은 앱·같은 로그인·같은 API·같은 자료(mds/54 §3-1).
//   로그인 전: 로그인 창(디자인 고르기 포함). 로그인 뒤: 새 셸(AppShell).
//   '기존 디자인'을 고른 사용자와 체험 계정(1단계 고정)은 /로 돌려보낸다 — 그리기 전에(깜박임 방지 둘째 겹, 첫 겹은 middleware.js).
export default function NewDesign() {
  const { user, status } = useAuth();
  const router = useRouter();
  const goLegacy = status === 'authed' && !!user && !wantsNewDesign(user);

  useEffect(() => {
    if (!goLegacy) return;
    // 새 주소(#student/…)는 기존 디자인이 모르는 주소라 떼고 간다(기존 디자인은 저장된 맥락으로 학생을 복원한다).
    saveNavIdx(0); // 기존 디자인 쪽 히스토리 깊이는 0부터(전환 직후 ← 단추가 새 디자인 항목으로 돌아가지 않게, mds/56 #17)
    router.replace('/');
  }, [goLegacy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading' || goLegacy) {
    return (
      <>
        <Head><title>꼬박꼬박 행동중재 통합 운영 시스템</title></Head>
        <LoadingOverlay show message={goLegacy ? '기존 디자인으로 여는 중...' : '세션 확인 중...'} />
      </>
    );
  }

  if (status !== 'authed' || !user) {
    return (
      <>
        <Head><title>로그인 · 꼬박꼬박 행동중재 통합 운영 시스템</title></Head>
        <AuthScreen />
      </>
    );
  }

  return (
    <>
      <Head><title>꼬박꼬박 · 새 디자인</title></Head>
      <StudentProvider>
        <AppShell />
      </StudentProvider>
    </>
  );
}
