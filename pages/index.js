import Head from 'next/head';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLLM } from '../contexts/LLMContext';
import { StudentProvider } from '../contexts/StudentContext';
import AuthScreen from '../components/auth/AuthScreen';
import Layout from '../components/layout/Layout';
import LoadingOverlay from '../components/ui/LoadingOverlay';

import LegacyPageRouter from '../components/layout/LegacyPageRouter';
import DemoPlayer from '../components/demo/DemoPlayer';
import PageFrame from '../components/onboarding/PageFrame';
import FirstRun from '../components/onboarding/FirstRun';

// 화면 id 목록·옛 해시 후계·해시 읽기·AI 생성 중 이동 확인·히스토리 깊이 백업은
// 새 디자인(/new)과 같이 쓰려고 lib/nav/legacyNav.js로 옮겼다(내용 그대로).
import { VALID_PAGES, pageFromHash, confirmLeaveWhileBusy, saveNavIdx, loadNavIdx } from '../lib/nav/legacyNav';
// 새 디자인 병행(mds/54 §4): 로그인한 사용자가 '새 디자인'을 골랐으면 /new로 보낸다(옛 해시는 새 자리로).
import { useRouter } from 'next/router';
import { wantsNewDesign } from '../lib/uiMode';

export default function Home() {
  const { user, status } = useAuth();
  const { busy } = useLLM();
  const [activePage, setActivePage] = useState('home');
  const [canGoBack, setCanGoBack] = useState(false);

  // popstate 핸들러를 한 번만 등록하기 위한 최신값 참조.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const pageRef = useRef(activePage);
  pageRef.current = activePage;
  const idxRef = useRef(0);       // 히스토리 깊이(0 = 첫 화면) — 뒤로가기 가능 여부 판단
  const initedRef = useRef(false); // 로그인 후 해시 복원을 1회만

  // 새 디자인을 고른 사용자는 /new로(체험 계정은 1단계에서 기존 디자인 고정 — lib/uiMode.js).
  //   그리기 전에 판단해 기존 화면이 한 번 보였다가 튀지 않게 한다(아래 LoadingOverlay 분기).
  const router = useRouter();
  const goNew = status === 'authed' && wantsNewDesign(user);
  useEffect(() => {
    if (!goNew) return;
    const h = (window.location.hash || '').replace(/^#\/?/, '');
    // 옛 해시 북마크(#iep 등)는 /new가 새 자리로 바꾼다(lib/routes.js parseHash 'go').
    router.replace('/new' + (h && VALID_PAGES.has(pageFromHash()) && pageFromHash() !== 'home' ? '#go/' + pageFromHash() : ''));
  }, [goNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // 메뉴·카드 클릭 이동 — 브라우저 히스토리에 쌓아 뒤로가기/앞으로가기가 동작하게 한다.
  // AI 생성 중 페이지 이동 가드: 이동하면 진행 중인 결과가 사라지므로 한 번 확인한다.
  const navigate = useCallback((page) => {
    if (page === pageRef.current) return; // 같은 화면 재클릭 — 히스토리 중복 방지
    if (busyRef.current && !confirmLeaveWhileBusy()) return;
    idxRef.current += 1;
    setActivePage(page);
    setCanGoBack(true);
    saveNavIdx(idxRef.current);
    try {
      window.history.pushState({ page, idx: idxRef.current }, '', '#' + page);
    } catch (_e) { /* pushState 실패해도 화면 전환은 유지 */ }
  }, []);

  // 상단바 ← 버튼 — 브라우저 뒤로가기와 동일하게 히스토리 한 칸 뒤로.
  const goBack = useCallback(() => {
    if (idxRef.current > 0) window.history.back();
  }, []);

  // 로그인 직후 1회: 주소 해시(#dash3)나 새로고침 전 히스토리 상태에서 보던 화면 복원.
  useEffect(() => {
    if (status !== 'authed') {
      initedRef.current = false; // 로그아웃 후 재로그인하면 다시 복원
      return;
    }
    if (initedRef.current) return;
    initedRef.current = true;
    const st = window.history.state;
    const page = st && VALID_PAGES.has(st.page) ? st.page : pageFromHash();
    // 새로고침이면 Next가 state를 덮어써 idx가 없다 → sessionStorage 백업에서 복원.
    const idx = st && typeof st.idx === 'number' ? st.idx : loadNavIdx();
    idxRef.current = idx;
    setActivePage(page);
    setCanGoBack(idx > 0);
    saveNavIdx(idx);
    try {
      window.history.replaceState({ page, idx }, '', '#' + page);
    } catch (_e) { /* noop */ }
  }, [status]);

  // 브라우저 뒤로/앞으로 — 히스토리에 기록된 화면으로 전환한다.
  useEffect(() => {
    const onPop = (e) => {
      if (!initedRef.current) return; // 로그인 전에는 무시
      const st = e.state;
      const page = st && VALID_PAGES.has(st.page) ? st.page : pageFromHash();
      // idx가 없는 항목(부팅 때 Next가 state를 덮어쓴 항목)은 깊이를 알 수 없다 —
      // 그때는 현재 깊이를 유지한다(뒤로가기 자체는 hash로 정상 동작).
      const hasIdx = st && typeof st.idx === 'number';
      const idx = hasIdx ? st.idx : idxRef.current;
      if (page === pageRef.current) { // 같은 화면(이동 취소 복귀 등) — 깊이만 동기화
        idxRef.current = idx;
        setCanGoBack(idx > 0);
        if (hasIdx) saveNavIdx(idx);
        return;
      }
      if (busyRef.current && !confirmLeaveWhileBusy()) {
        // 취소 — 방금의 이동을 원위치(뒤로였으면 앞으로, 앞으로였으면 뒤로).
        if (idx < idxRef.current) window.history.forward();
        else window.history.back();
        return;
      }
      idxRef.current = idx;
      setActivePage(page);
      setCanGoBack(idx > 0);
      if (hasIdx) saveNavIdx(idx);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 실제 새로고침·탭 닫기로 인한 결과 유실도 막는다(생성 중일 때만).
  useEffect(() => {
    if (!busy) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  if (status === 'loading' || goNew) {
    return (
      <>
        <Head><title>꼬박꼬박 행동중재 통합 운영 시스템</title></Head>
        <LoadingOverlay show message="세션 확인 중..." />
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
      <Head><title>꼬박꼬박 행동중재 통합 운영 시스템</title></Head>
      <StudentProvider>
        <Layout activePage={activePage} onNavigate={navigate} canGoBack={canGoBack} onBack={goBack}>
          {/* 1001(mds/46 방법 2·4·6): 화면 맨 위 안내(소개 한 줄·빈 화면 첫 할 일·홈 시작하기) — 화면 파일은 그대로 */}
          <PageFrame key={activePage} page={activePage} onNavigate={navigate} />
          <LegacyPageRouter activePage={activePage} onNavigate={navigate} />
          {/* ▶ 3분 체험하기(mds/46) — 체험 계정일 때만. 화면은 document.body로 포털. */}
          {user.is_demo && <DemoPlayer activePage={activePage} onNavigate={navigate} />}
          {/* 가입 직후 1회: 첫 설정 마법사 + 본보기 학생(mds/46 방법 3·5). 회원가입이 남긴 표시가 있을 때만 뜬다(체험하기는 남기지 않음). */}
          <FirstRun onNavigate={navigate} />
        </Layout>
      </StudentProvider>
    </>
  );
}
