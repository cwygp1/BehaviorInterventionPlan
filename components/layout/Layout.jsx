import { useState } from 'react';
import Sidebar, { PBS_PAGES } from './Sidebar';
import Topbar from './Topbar';
import SecurityBanner from './SecurityBanner';
import AISettingsModal from '../modals/AISettingsModal';
import AddStudentModal from '../modals/AddStudentModal';
import PickStudentModal from '../modals/PickStudentModal';
import EditStudentModal from '../modals/EditStudentModal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';

export default function Layout({ children, activePage, onNavigate }) {
  const { students, curStuId, selectStudent } = useStudents();
  const toast = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiSettingsOpen, setAISettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);

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
      />
      <main className="main">
        <SecurityBanner />
        <Topbar
          activePage={activePage}
          onMenu={() => setSidebarOpen(true)}
          onOpenLLMSettings={() => setAISettingsOpen(true)}
          onAddStudent={() => setAddOpen(true)}
        />
        <div className="content">{children}</div>
      </main>

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
    </div>
  );
}
