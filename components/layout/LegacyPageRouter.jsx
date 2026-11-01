// 옛 화면 32개 스위치 — pages/index.js(기존 디자인)에서 떼어 내 새 디자인 셸(/new)과 같이 쓴다(mds/54 §3-3 규칙 1).
//   내용은 옮기기 전 PageRouter 그대로다. 화면을 추가하면 lib/nav/legacyNav.js VALID_PAGES와 lib/tiers.js PAGE_META도 함께.
import PortalHome from '../pages/PortalHome';
import Tier1Dashboard from '../pages/dash/Tier1Dashboard';
import Tier2Dashboard from '../pages/dash/Tier2Dashboard';
import Tier3Dashboard from '../pages/dash/Tier3Dashboard';
import IepDashboard from '../pages/dash/IepDashboard';
import StudentsPage from '../pages/StudentsPage';
import CalendarPage from '../pages/CalendarPage';
import StartPointPage from '../pages/StartPointPage';
import ObservePage from '../pages/ObservePage';
import QabfPage from '../pages/QabfPage';
import BipPage from '../pages/BipPage';
import MonitorPage from '../pages/MonitorPage';
import EvalPage from '../pages/EvalPage';
import IepPage from '../pages/IepPage';
import IepReportPage from '../pages/IepReportPage';
import PriorIepPage from '../pages/PriorIepPage';
import BuilderPage from '../pages/BuilderPage';
import CrisisPage from '../pages/CrisisPage';
import SupportPage from '../pages/SupportPage';
import ClassPBSPage from '../pages/ClassPBSPage';
import PbsSurveyPage from '../pages/PbsSurveyPage';
import SchoolRulesPage from '../pages/SchoolRulesPage';
import ClassChecklistPage from '../pages/ClassChecklistPage';
import ClassFidelityPage from '../pages/ClassFidelityPage';
import GeneratorPage from '../pages/GeneratorPage';
import Tier2Page from '../pages/Tier2Page';
import ContractPage from '../pages/ContractPage';
import Tier3Page from '../pages/Tier3Page';
import VideoLecturesPage from '../pages/VideoLecturesPage';
import AdminPage from '../pages/AdminPage';
import QABoardPage from '../pages/QABoardPage';
import ChatExpertPage from '../pages/ChatExpertPage';
import StepNav from '../ui/StepNav';

export default function PageRouter({ activePage, onNavigate }) {
  switch (activePage) {
    case 'home': return <PortalHome onNavigate={onNavigate} />;
    case 'dash1': return <Tier1Dashboard onNavigate={onNavigate} />;
    case 'dash2': return <Tier2Dashboard onNavigate={onNavigate} />;
    case 'dash3': return <Tier3Dashboard onNavigate={onNavigate} />;
    case 'dashIep': return <IepDashboard onNavigate={onNavigate} />;
    case 'students': return <StudentsPage />;
    case 'calendar': return <CalendarPage onNavigate={onNavigate} />;
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
    case 'classpbs': return <ClassPBSPage onNavigate={onNavigate} />;
    case 'pbssurvey': return <PbsSurveyPage />;
    case 'schoolrules': return <SchoolRulesPage />;
    case 'classcheck': return <ClassChecklistPage />;
    case 'classcheck2': return <ClassFidelityPage />;
    case 'tier2': return <Tier2Page onNavigate={onNavigate} />;
    case 'contract': return <ContractPage />;
    case 'tier3': return <Tier3Page onNavigate={onNavigate} />;
    case 'videos': return <VideoLecturesPage onNavigate={onNavigate} />;
    case 'generator': return <GeneratorPage />;
    case 'admin': return <AdminPage />;
    case 'qaBoard': return <QABoardPage />;
    case 'chatExpert': return <ChatExpertPage />;
    default: return <PortalHome onNavigate={onNavigate} />;
  }
}
