import Head from 'next/head';
import { useState, useCallback, useEffect } from 'react';
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
import QAPage from '../components/pages/QAPage';
import GeneratorPage from '../components/pages/GeneratorPage';
import Tier2Page from '../components/pages/Tier2Page';
import Tier3Page from '../components/pages/Tier3Page';
import VideoLecturesPage from '../components/pages/VideoLecturesPage';
import StepNav from '../components/ui/StepNav';

export default function Home() {
  const { user, status } = useAuth();
  const { busy } = useLLM();
  const [activePage, setActivePage] = useState('home');

  // AI 생성 중 페이지 이동 가드. 이동하면 진행 중인 결과가 사라지므로 한 번 확인한다.
  const navigate = useCallback(
    (page) => {
      if (busy) {
        const go = window.confirm(
          'AI가 생성 중입니다. 지금 다른 메뉴로 이동하면 생성 중인 결과가 사라질 수 있어요.\n그래도 이동할까요?'
        );
        if (!go) return;
      }
      setActivePage(page);
    },
    [busy]
  );

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
        <Layout activePage={activePage} onNavigate={navigate}>
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
    case 'startpoint': return <StartPointPage />;
    case 'observe': return <><ObservePage /><StepNav cur="observe" onNavigate={onNavigate} /></>;
    case 'qabf': return <><QabfPage /><StepNav cur="qabf" onNavigate={onNavigate} /></>;
    case 'bip': return <><BipPage /><StepNav cur="bip" onNavigate={onNavigate} /></>;
    case 'monitor': return <><MonitorPage /><StepNav cur="monitor" onNavigate={onNavigate} /></>;
    case 'eval': return <><EvalPage /><StepNav cur="eval" onNavigate={onNavigate} /></>;
    case 'iep': return <IepPage />;
    case 'priorIep': return <PriorIepPage />;
    case 'iepReport': return <IepReportPage />;
    case 'builder': return <BuilderPage />;
    case 'crisis': return <CrisisPage />;
    case 'support': return <SupportPage />;
    case 'classpbs': return <ClassPBSPage />;
    case 'pbssurvey': return <PbsSurveyPage />;
    case 'classcheck': return <ClassChecklistPage />;
    case 'tier2': return <Tier2Page onNavigate={onNavigate} />;
    case 'tier3': return <Tier3Page onNavigate={onNavigate} />;
    case 'videos': return <VideoLecturesPage onNavigate={onNavigate} />;
    case 'qa': return <QAPage />;
    case 'generator': return <GeneratorPage />;
    default: return <PortalHome onNavigate={onNavigate} />;
  }
}
