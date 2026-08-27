import Head from 'next/head';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLLM } from '../contexts/LLMContext';
import { StudentProvider } from '../contexts/StudentContext';
import AuthScreen from '../components/auth/AuthScreen';
import Layout from '../components/layout/Layout';
import LoadingOverlay from '../components/ui/LoadingOverlay';

import PortalHome from '../components/pages/PortalHome';
import Tier1Dashboard from '../components/pages/dash/Tier1Dashboard';
import Tier2Dashboard from '../components/pages/dash/Tier2Dashboard';
import Tier3Dashboard from '../components/pages/dash/Tier3Dashboard';
import IepDashboard from '../components/pages/dash/IepDashboard';
import StudentsPage from '../components/pages/StudentsPage';
import StartPointPage from '../components/pages/StartPointPage';
import ObservePage from '../components/pages/ObservePage';
import QabfPage from '../components/pages/QabfPage';
import BipPage from '../components/pages/BipPage';
import MonitorPage from '../components/pages/MonitorPage';
import EvalPage from '../components/pages/EvalPage';
import IepPage from '../components/pages/IepPage';
import IepReportPage from '../components/pages/IepReportPage';
import PriorIepPage from '../components/pages/PriorIepPage';
import BuilderPage from '../components/pages/BuilderPage';
import CrisisPage from '../components/pages/CrisisPage';
import SupportPage from '../components/pages/SupportPage';
import ClassPBSPage from '../components/pages/ClassPBSPage';
import PbsSurveyPage from '../components/pages/PbsSurveyPage';
import ClassChecklistPage from '../components/pages/ClassChecklistPage';
import ClassFidelityPage from '../components/pages/ClassFidelityPage';
import QAPage from '../components/pages/QAPage';
import GeneratorPage from '../components/pages/GeneratorPage';
import Tier2Page from '../components/pages/Tier2Page';
import ContractPage from '../components/pages/ContractPage';
import Tier3Page from '../components/pages/Tier3Page';
import VideoLecturesPage from '../components/pages/VideoLecturesPage';
import AdminPage from '../components/pages/AdminPage';
import QABoardPage from '../components/pages/QABoardPage';
import StepNav from '../components/ui/StepNav';

// 화면 id 전체 목록 — 주소 해시(#dash3 등)로 화면을 복원할 때 유효성 검사에 쓴다.
// PageRouter의 case와 반드시 일치해야 한다(새 페이지 추가 시 여기도 추가).
const VALID_PAGES = new Set([
  'home', 'dash1', 'dash2', 'dash3', 'dashIep', 'students', 'startpoint',
  'observe', 'qabf', 'bip', 'monitor', 'eval', 'iep', 'priorIep', 'iepReport',
  'builder', 'crisis', 'support', 'classpbs', 'pbssurvey', 'classcheck', 'classcheck2',
  'tier2', 'contract', 'tier3', 'videos', 'qa', 'generator', 'admin', 'qaBoard',
]);

// 현재 주소 해시에서 화면 id를 읽는다. 유효하지 않으면 홈.
function pageFromHash() {
  if (typeof window === 'undefined') return 'home';
  const h = (window.location.hash || '').replace(/^#\/?/, '');
  return VALID_PAGES.has(h) ? h : 'home';
}

// AI 생성 중 이동 확인(기존 문구 유지) — navigate와 브라우저 뒤로가기 양쪽에서 쓴다.
function confirmLeaveWhileBusy() {
  return window.confirm(
    'AI가 생성 중입니다. 지금 다른 메뉴로 이동하면 생성 중인 결과가 사라질 수 있어요.\n그래도 이동할까요?'
  );
}

// 히스토리 깊이 백업 — Next.js 라우터가 부팅 때 현재 히스토리 항목의 state를
// 자기 것으로 덮어써서, 새로고침하면 pushState에 실어둔 idx가 사라진다.
// 같은 탭 안에서만 유효한 sessionStorage에 깊이를 함께 적어 두고 복원한다.
const NAV_IDX_KEY = 'kkobak-nav-idx';
function saveNavIdx(idx) {
  try { window.sessionStorage.setItem(NAV_IDX_KEY, String(idx)); } catch (_e) { /* noop */ }
}
function loadNavIdx() {
  try {
    const n = parseInt(window.sessionStorage.getItem(NAV_IDX_KEY) || '', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (_e) { return 0; }
}

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

  if (status === 'loading') {
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
          <PageRouter activePage={activePage} onNavigate={navigate} />
        </Layout>
      </StudentProvider>
    </>
  );
}

function PageRouter({ activePage, onNavigate }) {
  switch (activePage) {
    case 'home': return <PortalHome onNavigate={onNavigate} />;
    case 'dash1': return <Tier1Dashboard onNavigate={onNavigate} />;
    case 'dash2': return <Tier2Dashboard onNavigate={onNavigate} />;
    case 'dash3': return <Tier3Dashboard onNavigate={onNavigate} />;
    case 'dashIep': return <IepDashboard onNavigate={onNavigate} />;
    case 'students': return <StudentsPage />;
    // 0819 피드백: 저장 후 다음 단계로 바로 이동 — IEP 영역에도 StepNav + 페이지 내 CTA 배너 적용.
    case 'startpoint': return <><StartPointPage onNavigate={onNavigate} /><StepNav flow="iep" cur="startpoint" onNavigate={onNavigate} /></>;
    case 'observe': return <><ObservePage onNavigate={onNavigate} /><StepNav flow="tier3" cur="observe" onNavigate={onNavigate} /></>;
    case 'qabf': return <><QabfPage onNavigate={onNavigate} /><StepNav flow="tier3" cur="qabf" onNavigate={onNavigate} /></>;
    case 'bip': return <><BipPage onNavigate={onNavigate} /><StepNav flow="tier3" cur="bip" onNavigate={onNavigate} /></>;
    case 'monitor': return <><MonitorPage onNavigate={onNavigate} /><StepNav flow="tier3" cur="monitor" onNavigate={onNavigate} /></>;
    case 'eval': return <><EvalPage /><StepNav flow="tier3" cur="eval" onNavigate={onNavigate} /></>;
    case 'iep': return <><IepPage onNavigate={onNavigate} /><StepNav flow="iep" cur="iep" onNavigate={onNavigate} /></>;
    case 'priorIep': return <><PriorIepPage onNavigate={onNavigate} /><StepNav flow="iep" cur="priorIep" onNavigate={onNavigate} /></>;
    case 'iepReport': return <><IepReportPage /><StepNav flow="iep" cur="iepReport" onNavigate={onNavigate} /></>;
    case 'builder': return <BuilderPage />;
    case 'crisis': return <CrisisPage />;
    case 'support': return <SupportPage />;
    case 'classpbs': return <ClassPBSPage />;
    case 'pbssurvey': return <PbsSurveyPage />;
    case 'classcheck': return <ClassChecklistPage />;
    case 'classcheck2': return <ClassFidelityPage />;
    case 'tier2': return <Tier2Page onNavigate={onNavigate} />;
    case 'contract': return <ContractPage />;
    case 'tier3': return <Tier3Page onNavigate={onNavigate} />;
    case 'videos': return <VideoLecturesPage onNavigate={onNavigate} />;
    case 'qa': return <QAPage />;
    case 'generator': return <GeneratorPage />;
    case 'admin': return <AdminPage />;
    case 'qaBoard': return <QABoardPage />;
    default: return <PortalHome onNavigate={onNavigate} />;
  }
}
