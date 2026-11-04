import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SecurityBanner from './SecurityBanner';
import AIBusyOverlay from './AIBusyOverlay';
import NewTopbar from './NewTopbar';
import NewSideMenu from './NewSideMenu';
import AISettingsModal from '../modals/AISettingsModal';
import AddStudentModal from '../modals/AddStudentModal';
import PickStudentModal from '../modals/PickStudentModal';
import EditStudentModal from '../modals/EditStudentModal';
import ManageClassesModal from '../modals/ManageClassesModal';
import TermsModal from '../auth/TermsModal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { UIActionsProvider } from '../../contexts/UIActionsContext';
import { GuideProvider } from '../guide/GuideContext';
import SpotlightTour from '../guide/SpotlightTour';
import GlossaryModal from '../guide/GlossaryModal';
import HoverHelp from '../guide/HoverHelp';
import EscortGuide from '../guide/EscortGuide';
import NewView from '../workspace/NewView';
import { useNewRouter } from '../../lib/hooks/useNewRouter';
import { toNew, toOld, isStudentPage, requiresStudent, withStudent } from '../../lib/routes';

// 옛 화면(IEP→DTT·달력·그래프 위젯)은 'kb_monitor_tab'에 회기 탭을 적어 두고 onNavigate('monitor')를 부른다 —
//   그 뜻을 주소(?sub=sessions)로 옮긴다(mds/58 #29).
const readMonitorTab = () => { try { return sessionStorage.getItem('kb_monitor_tab'); } catch (_e) { return null; } };

// 새 디자인(/new) 셸 — components/layout/Layout.jsx:76-145의 공급자·모달 묶음을 빠짐없이 옮겼다(mds/54 §1 조건 2·4).
//   StudentProvider(pages/new.js) > UIActionsProvider > GuideProvider(activePage=옛 id) > .app.show.kb-new
//   모달 5개(AddStudent·PickStudent·EditStudent·ManageClasses·AISettings) + AIBusyOverlay + 안내 레이어 4종 (FirstRun 대신 오늘 화면의 학생 0명 화면 — 아래 가입 표시 지우기).
//   UIActionsProvider는 상단바·메뉴까지 감싼다(기존은 본문만 — 새 셸은 상단바 '학생 추가'도 같은 함수를 쓴다).
//
// 이동 규칙(조건 1): navigate(대상)
//   · '#…'  새 주소 그대로
//   · 옛 id 32개 → lib/routes.js toNew. 학생이 필요한데 없으면 학생 고르기 창 + 고른 뒤 그 화면(pendingPage, N1).
//   · navigateRaw(길잡이 '바로 가기'·다음 할 일)는 가드 없이 — 학생 수첩 화면이면 #go/…로 두고 학생이 정해진 다음 렌더에 푼다.
export default function AppShell() {
  const {
    students, allStudents, studentsLoaded, classes, curStuId, curClassId, curYear,
    selectStudent, selectClass, selectYear, getCurStuId,
  } = useStudents();
  const toast = useToast();
  const { busy } = useLLM();
  const { route, push, replace, canGoBack, goBack } = useNewRouter({ busy, enabled: true });

  const [aiSettingsOpen, setAISettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [classesOpen, setClassesOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);

  const routeRef = useRef(route);
  routeRef.current = route;
  const curStuIdRef = useRef(curStuId);
  curStuIdRef.current = curStuId;
  const studentsRef = useRef(students);
  studentsRef.current = students;

  const openPicker = useCallback((oldId) => {
    setPendingPage(oldId || null);
    if (studentsRef.current.length === 0) setAddOpen(true);
    else setPickOpen(true);
  }, []);

  const navigate = useCallback((target, opt = {}) => {
    if (!target) return;
    const t = String(target);
    if (t.startsWith('#')) { push(t); return; }
    const r = routeRef.current;
    // 옛 현황판(Tier3·IEP·ChartWidget)은 selectStudent(B) 바로 뒤 같은 틱에 onNavigate를 부른다 — 렌더 전 ref(curStuIdRef)는
    //   아직 A라서, StudentContext가 selectStudent에서 바로 갱신하는 값(getCurStuId)을 먼저 읽는다(mds/56 #2).
    const nowSid = getCurStuId ? getCurStuId() : null;
    const sid = opt.sid != null ? opt.sid : (nowSid || curStuIdRef.current || (r.kind === 'student' ? r.sid : null));
    const h = toNew(t, { sid, monitorTab: readMonitorTab() });
    if (h) { push(h); return; }
    if (requiresStudent(t)) { openPicker(t); return; }
    toast('그 화면을 찾지 못했어요: ' + t);
  }, [push, openPicker, toast, getCurStuId]);

  // 길잡이 navigateRaw — 학생 가드 없이(호출 쪽이 막 selectStudent를 부른 직후일 수 있어 #go로 한 박자 미룬다).
  const navigateRaw = useCallback((oldId) => {
    if (!oldId) return;
    if (isStudentPage(oldId)) { push('#go/' + oldId); return; }
    navigate(oldId);
  }, [push, navigate]);

  // #go/{옛 id}(옛 해시 북마크 포함) 풀기 — 학생 목록을 받은 뒤.
  //   학생이 필요한데 아직 없으면 잠깐 기다린다 — StudentContext가 저장 맥락(kb_ctx)으로 학생을 복원하는 효과는
  //   이 효과보다 늦게 돈다(부모 효과). 그래도 없으면 오늘로 두고 학생 고르기 창(고른 뒤 그 화면).
  useEffect(() => {
    if (route.kind !== 'go' || !studentsLoaded || classes.length === 0) return undefined;
    const h = toNew(route.old, { sid: curStuId, monitorTab: readMonitorTab() });
    if (h) { replace(h); return undefined; }
    const t = setTimeout(() => {
      replace('#today');
      openPicker(route.old);
    }, 400);
    return () => clearTimeout(t);
  }, [route, studentsLoaded, classes.length, curStuId, replace, openPicker]);

  // 주소의 학생 ↔ 앱의 학생 맞추기(새로고침해도 주소 학생 유지, ◀ ▶·뒤로가기).
  //   주소가 바뀌면 주소를 따른다(학급이 다르면 학년도·학급도 함께). 주소 학생으로 맞춘 뒤 다른 곳(학급 바꾸기 등)에서
  //   학생이 바뀌면 주소를 따라 바꾼다. StudentContext의 저장 맥락 복원(kb_ctx_{uid})이 늦게 덮어써도 다시 맞춘다.
  const settledRef = useRef(null);
  useEffect(() => {
    if (route.kind !== 'student') { settledRef.current = null; return; }
    if (!studentsLoaded || classes.length === 0) return;
    const sid = route.sid;
    if (curStuId === sid) { settledRef.current = sid; return; }
    if (settledRef.current === sid) {
      // 주소 학생으로 맞춘 뒤 다른 곳에서 학생이 바뀜.
      settledRef.current = null;
      if (curStuId) replace(withStudent(route, curStuId));
      else replace('#students');
      return;
    }
    const stu = allStudents.find((s) => s.id === sid);
    if (!stu) {
      toast('그 학생을 찾지 못했어요. 학생 목록에서 다시 골라 주세요.');
      replace('#students');
      return;
    }
    const cls = classes.find((c) => c.id === stu.class_id);
    if (cls && cls.id !== curClassId) {
      if (cls.school_year !== curYear) selectYear(cls.school_year);
      selectClass(cls.id);
    }
    selectStudent(sid).catch(() => {});
  }, [route, studentsLoaded, classes, allStudents, curStuId, curClassId, curYear, selectStudent, selectClass, selectYear, replace, toast]);

  // 화면을 바꾸면 스크롤을 맨 위로(스크롤 칸은 .content) — Layout.jsx와 같은 2회 되감기.
  //   1104: 낮은 화면(높이 500px 이하, 확대 200% 등)에서는 .kb-main 통째로 스크롤한다(tokens.css) — 그것도 되감는다.
  const contentRef = useRef(null);
  const mainRef = useRef(null);
  useEffect(() => {
    const reset = () => {
      if (mainRef.current) mainRef.current.scrollTop = 0;
      if (contentRef.current) contentRef.current.scrollTop = 0;
      try { window.scrollTo(0, 0); } catch (_) { /* noop */ }
    };
    reset();
    const t = setTimeout(reset, 80);
    return () => clearTimeout(t);
  }, [route.hash]);

  const uiActions = useMemo(() => ({
    openAddStudent: () => setAddOpen(true),
    openAISettings: () => setAISettingsOpen(true),
    openManageClasses: () => setClassesOpen(true),
  }), []);
  const guideActions = useMemo(() => ({
    ...uiActions,
    openPickStudent: () => setPickOpen(true),
  }), [uiActions]);
  const shellActions = useMemo(() => ({
    ...uiActions,
    openEditStudent: () => setEditOpen(true),
    openTerms: () => setTermsOpen(true),
    openPicker,
  }), [uiActions, openPicker]);

  const activeOld = toOld(route);

  // 가입 직후 표시(kb_first_run·kb_seed_samples, AuthContext.signup) — 새 디자인은 마법사·샘플 자동 주입 대신
  //   '오늘'의 학생 0명 화면(입력칸 하나 + 샘플 구경·3분 체험 선택 단추)이 맞는다(mds/52 §4-1, 2단계).
  //   표시를 여기서 지워, 나중에 기존 디자인으로 바꿨을 때 마법사가 뒤늦게 뜨지 않게 한다(mds/54 §2-2 FirstRun).
  //   마법사가 하던 '첫 방문 홈 투어 건너뛰기'도 같이 적는다(오늘 화면은 학생 0명일 때 영역 카드가 없다).
  useEffect(() => {
    try {
      if (sessionStorage.getItem('kb_first_run') === '1') {
        localStorage.setItem('kb_tour_done:home', '1');
      }
      sessionStorage.removeItem('kb_first_run');
      sessionStorage.removeItem('kb_seed_samples');
    } catch (_e) { /* 사생활 모드 */ }
  }, []);

  return (
    <UIActionsProvider value={uiActions}>
    <GuideProvider activePage={activeOld} onNavigate={navigate} navigateRaw={navigateRaw} actions={guideActions}>
    <div className="app show kb-new">
      <NewSideMenu route={route} onNavigate={navigate} />
      <main className="kb-main" ref={mainRef}>
        <SecurityBanner />
        <NewTopbar route={route} onNavigate={navigate} canGoBack={canGoBack} onBack={goBack} actions={shellActions} />
        <div className="content" ref={contentRef}>
          <NewView route={route} onNavigate={navigate} actions={shellActions} />
        </div>
      </main>

      <AIBusyOverlay />

      <AISettingsModal open={aiSettingsOpen} onClose={() => setAISettingsOpen(false)} />
      <AddStudentModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setPendingPage(null); }}
        onCreated={(created) => {
          if (pendingPage) { navigate(pendingPage, { sid: created?.id }); setPendingPage(null); }
        }}
      />
      <PickStudentModal
        open={pickOpen}
        forPage={pendingPage}
        onClose={() => { setPickOpen(false); setPendingPage(null); }}
        onPicked={async (sid) => {
          await selectStudent(sid);
          if (pendingPage) { navigate(pendingPage, { sid }); setPendingPage(null); }
        }}
        onAddNew={() => { setPickOpen(false); setAddOpen(true); }}
      />
      <EditStudentModal open={editOpen} onClose={() => setEditOpen(false)} />
      <ManageClassesModal open={classesOpen} onClose={() => setClassesOpen(false)} />
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>

    <SpotlightTour />
    <GlossaryModal />
    <HoverHelp />
    <EscortGuide />
    </GuideProvider>
    </UIActionsProvider>
  );
}
