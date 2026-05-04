import Head from 'next/head';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { StudentProvider } from '../contexts/StudentContext';
import AuthScreen from '../components/auth/AuthScreen';
import Layout from '../components/layout/Layout';
import LoadingOverlay from '../components/ui/LoadingOverlay';

import HomePage from '../components/pages/HomePage';
import ObservePage from '../components/pages/ObservePage';
import QabfPage from '../components/pages/QabfPage';
import BipPage from '../components/pages/BipPage';
import MonitorPage from '../components/pages/MonitorPage';
import EvalPage from '../components/pages/EvalPage';
import BuilderPage from '../components/pages/BuilderPage';
import CrisisPage from '../components/pages/CrisisPage';
import SupportPage from '../components/pages/SupportPage';
import ClassPBSPage from '../components/pages/ClassPBSPage';
import QAPage from '../components/pages/QAPage';
import Tier2Page from '../components/pages/Tier2Page';
import Tier3Page from '../components/pages/Tier3Page';
import VideoLecturesPage from '../components/pages/VideoLecturesPage';

export default function Home() {
  const { user, status } = useAuth();
  const [activePage, setActivePage] = useState('home');

  if (status === 'loading') {
    return (
      <>
        <Head><title>특수교육 AI 통합 플랫폼</title></Head>
        <LoadingOverlay show message="세션 확인 중..." />
      </>
    );
  }

  if (status !== 'authed' || !user) {
    return (
      <>
        <Head><title>로그인 · 특수교육 AI 통합 플랫폼</title></Head>
        <AuthScreen />
      </>
    );
  }

  return (
    <>
      <Head><title>특수교육 AI 통합 플랫폼</title></Head>
      <StudentProvider>
        <Layout activePage={activePage} onNavigate={setActivePage}>
          <PageRouter activePage={activePage} onNavigate={setActivePage} />
        </Layout>
      </StudentProvider>
    </>
  );
}

function PageRouter({ activePage, onNavigate }) {
  switch (activePage) {
    case 'home': return <HomePage onNavigate={onNavigate} />;
    case 'observe': return <ObservePage />;
    case 'qabf': return <QabfPage />;
    case 'bip': return <BipPage />;
    case 'monitor': return <MonitorPage />;
    case 'eval': return <EvalPage />;
    case 'builder': return <BuilderPage />;
    case 'crisis': return <CrisisPage />;
    case 'support': return <SupportPage />;
    case 'classpbs': return <ClassPBSPage />;
    case 'tier2': return <Tier2Page onNavigate={onNavigate} />;
    case 'tier3': return <Tier3Page onNavigate={onNavigate} />;
    case 'videos': return <VideoLecturesPage onNavigate={onNavigate} />;
    case 'qa': return <QAPage />;
    default: return <HomePage onNavigate={onNavigate} />;
  }
}
