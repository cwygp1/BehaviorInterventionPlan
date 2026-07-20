import { useEffect, useRef, useState } from 'react';
import Sidebar, { PBS_PAGES } from './Sidebar';
import Topbar from './Topbar';
import SecurityBanner from './SecurityBanner';
import AIBusyOverlay from './AIBusyOverlay';
import AISettingsModal from '../modals/AISettingsModal';
import AddStudentModal from '../modals/AddStudentModal';
import PickStudentModal from '../modals/PickStudentModal';
import EditStudentModal from '../modals/EditStudentModal';
import ManageClassesModal from '../modals/ManageClassesModal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { UIActionsProvider } from '../../contexts/UIActionsContext';

export default function Layout({ children, activePage, onNavigate }) {
  const { students, curStuId, selectStudent } = useStudents();
  const toast = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiSettingsOpen, setAISettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [classesOpen, setClassesOpen] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);

  // 페이지를 바꾸면 스크롤을 맨 위로 되돌린다. 스크롤 컨테이너가 window가 아니라
  // .main / .content이므로 두 엘리먼트를 직접 되감아야 한다.
  // (이게 없으면 아래까지 내려본 뒤 다른 메뉴로 가면 새 화면이 하단부터 열려
  //  제목조차 보이지 않았다.)
  const mainRef = useRef(null);
  const contentRef = useRef(null);
  useEffect(() => {
    // P8(0720): 비동기 로드로 레이아웃이 늦게 잡히는 페이지에서 리셋이 무효화되던 문제 —
    // 즉시 1회 + 페인트 후 1회 더 되감는다.
    const reset = () => {
      if (mainRef.current) mainRef.current.scrollTop = 0;
      if (contentRef.current) contentRef.current.scrollTop = 0;
      try { window.scrollTo(0, 0); } catch (_) { /* noop */ }
    };
    reset();
    const t = setTimeout(reset, 80);
    return () => clearTimeout(t);
  }, [activePage]);

  function tryNavigate(page) {
    if (PBS_PAGES.includes(page) && !curStuId) {
      setPendingPage(page);
      if (students.length === 0) setAddOpen(true);
      else setPickOpen(true);
      setSidebarOpen(false);
      return;
    }
    onNavigate(page);
    setSidebarOpen(false);
  }

  return (
    <div className="app show">
      <Sidebar
        activePage={activePage}
        onNavigate={tryNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        hasStudent={!!curStuId}
      />
      <main className="main" ref={mainRef}>
        <SecurityBanner />
        <Topbar
          activePage={activePage}
          onMenu={() => setSidebarOpen(true)}
          onOpenLLMSettings={() => setAISettingsOpen(true)}
          onAddStudent={() => setAddOpen(true)}
          onManageClasses={() => setClassesOpen(true)}
        />
        <UIActionsProvider value={{
          openAddStudent: () => setAddOpen(true),
          openAISettings: () => setAISettingsOpen(true),
          openManageClasses: () => setClassesOpen(true),
        }}>
          <div className="content" ref={contentRef}>{children}</div>
        </UIActionsProvider>
      </main>

      {/* 0720: 전역 AI 작업 스피너 — 어떤 화면에서든 LLM 호출 중이면 표시 */}
      <AIBusyOverlay />

      <AISettingsModal open={aiSettingsOpen} onClose={() => setAISettingsOpen(false)} />
      <AddStudentModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setPendingPage(null); }}
        onCreated={() => {
          if (pendingPage) { onNavigate(pendingPage); setPendingPage(null); }
        }}
      />
      <PickStudentModal
        open={pickOpen}
        onClose={() => { setPickOpen(false); setPendingPage(null); }}
        onPicked={async (sid) => {
          await selectStudent(sid);
          if (pendingPage) { onNavigate(pendingPage); setPendingPage(null); }
        }}
        onAddNew={() => { setPickOpen(false); setAddOpen(true); }}
      />
      <EditStudentModal open={editOpen} onClose={() => setEditOpen(false)} />
      <ManageClassesModal open={classesOpen} onClose={() => setClassesOpen(false)} />
    </div>
  );
}
