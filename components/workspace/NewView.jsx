import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useGuide } from '../guide/GuideContext';
import LLMIndicator from '../layout/LLMIndicator';
import FontSizeToggle from '../ui/FontSizeToggle';
import { BUILD_LABEL } from '../layout/NewSideMenu';
import { CLASS_TABS, DOCS_SUBS, HELP_SUBS, formatRoute } from '../../lib/routes';
import { COMMON_MENU, SECTIONS, PAGE_META } from '../../lib/tiers';
import { useNextHint } from '../../lib/hooks/useNextHint';
import StudentWorkspace from './StudentWorkspace';
import TodayPage, { StudentList } from '../pages/TodayPage';
import { OldScreen, SubTabs } from './OldScreen';
import ClassCicoTable from '../class/ClassCicoTable';
import CrisisAsk from '../crisis/CrisisAsk';

// 새 디자인 본문 — 주소(route.kind)마다 무엇을 그릴지(mds/54 §3-1). 옛 화면은 OldScreen으로 통째로.
//   모든 본문 key에 route.seq를 넣어 이동마다 다시 마운트한다(보이는 것 하나만 마운트).

function ClassArea({ route, onNavigate, actions }) {
  const [hint] = useNextHint();
  const tab = CLASS_TABS.find((t) => t.key === route.tab) || CLASS_TABS[0];
  const go = (tabKey, sub) => onNavigate(formatRoute({ kind: 'class', tab: tabKey, sub: sub || '' }));
  return (
    <div>
      <div className="kb-tabs" role="tablist" aria-label="우리 반">
        {CLASS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={'kb-tab' + (hint && t.subs.includes(hint) && t.key !== tab.key ? ' kb-hinting' : '')}
            aria-selected={t.key === tab.key}
            onClick={() => go(t.key)}
            // 탭에 하위 화면이 하나뿐이면 그 화면의 옛 메뉴 앵커(nav-옛 id)를 이 탭이 맡는다(길잡이 '메뉴 짚기').
            data-tour={t.subs.length === 1 ? 'nav-' + t.subs[0] : 'class-tab-' + t.key}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="kb-tab" onClick={actions.openManageClasses} title="새 학년도·학급 추가, 이름 바꾸기">⚙ 학급 관리</button>
      </div>
      <SubTabs subs={tab.subs} cur={route.sub} onPick={(sub) => go(tab.key, sub)} hint={hint} label={tab.label + ' 안 화면'} />
      <div key={`${route.tab}|${route.sub}|${route.seq}`}>
        {/* 2단계: 매일 점검표 탭 맨 위에 다학생 표(새 기능). 소그룹·목표·교시 설정과 한 학생 자세히는 아래 기존 화면 그대로. */}
        {tab.key === 'cico' && <ClassCicoTable onNavigate={onNavigate} />}
        <OldScreen page={route.sub} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

const DOC_TILES = [
  { sub: 'generator', desc: '가정통신문·상담 기록 등 문서 초안을 AI와 함께 만들어요.' },
  { sub: 'builder', desc: '수업자료 요청문을 칩으로 조립해요. AI가 꺼져 있어도 요청문을 복사해 쓸 수 있어요.' },
  { sub: 'support', desc: '양식·자료를 내려받아요.' },
  { sub: 'videos', desc: 'PBS 영상 강의를 순서대로 봐요.' },
];

function DocsHub({ route, onNavigate, actions }) {
  const { curStuId } = useStudents();
  if (route.sub) {
    return <div key={`${route.sub}|${route.seq}`}><OldScreen page={DOCS_SUBS[route.sub]} onNavigate={onNavigate} /></div>;
  }
  return (
    <div className="kb-stack">
      <div className="kb-grid">
        {DOC_TILES.map((d) => {
          const id = DOCS_SUBS[d.sub];
          return (
            <button key={d.sub} type="button" className="kb-tile" onClick={() => onNavigate('#docs/' + d.sub)} data-tour={'nav-' + id}>
              <b><span aria-hidden="true">{PAGE_META[id].icon}</span> {PAGE_META[id].label}</b>
              <span>{d.desc}</span>
            </button>
          );
        })}
      </div>
      <div className="kb-card">
        <h2 className="kb-h3">학생별 문서</h2>
        <div className="kb-muted">IEP 계획서·행동중재계획(BIP)·결과 보고서·가정통신문·행동 계약서는 학생 수첩의 <b>문서</b> 탭에 모여 있어요.</div>
        <div>
          <button
            type="button"
            className="kb-btn kb-out"
            onClick={() => (curStuId ? onNavigate(`#student/${curStuId}/docs`) : actions.openPicker(null))}
          >
            📄 학생 문서 열기
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpHub({ route, onNavigate, actions }) {
  const { user, logout, setUiMode } = useAuth();
  const { hasSamples, clearSamples } = useStudents();
  const { startTour, openGlossary } = useGuide();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === 'admin';

  if (route.sub) {
    return <div key={`${route.sub}|${route.seq}`}><OldScreen page={HELP_SUBS[route.sub]} onNavigate={onNavigate} /></div>;
  }

  const toLegacy = async () => {
    if (busy) return;
    setBusy(true);
    try { await setUiMode('legacy'); } catch (e) { toast('화면 모양을 바꾸지 못했어요: ' + e.message); setBusy(false); }
  };
  const onClear = async () => {
    if (!window.confirm('샘플 학생 2명과 그 기록을 모두 삭제할까요?\n(선생님이 직접 등록한 학생은 그대로 남아요.)')) return;
    try { await clearSamples(); toast('샘플을 정리했어요.'); } catch (e) { toast('샘플 삭제 실패: ' + e.message); }
  };

  return (
    <div className="kb-stack">
      <div className="kb-grid">
        <button type="button" className="kb-tile" onClick={() => onNavigate('#help/board')} data-tour="nav-qaBoard">
          <b>❓ 질문 게시판</b><span>사람(관리자)이 답해 드려요.</span>
        </button>
        <button type="button" className="kb-tile" onClick={() => onNavigate('#help/ai')} data-tour="nav-chatExpert">
          <b>🗨️ AI에게 묻기</b><span>행동지원·IEP를 AI 전문가와 이야기해요.</span>
        </button>
        <button type="button" className="kb-tile" onClick={() => startTour()}>
          <b>🔦 이 화면 둘러보기</b><span>지금 화면을 한 곳씩 짚어 드려요. 길잡이는 오른쪽 위 🧭 단추.</span>
        </button>
        <button type="button" className="kb-tile" onClick={() => openGlossary()}>
          <b>📖 용어 사전</b><span>ABC·QABF·BIP 같은 낱말 뜻.</span>
        </button>
      </div>

      <div className="kb-card">
        <h2 className="kb-h3">설정</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <LLMIndicator onClick={actions.openAISettings} />
          <button type="button" className="kb-btn" onClick={actions.openAISettings}>🤖 AI 연결 설정</button>
          <div style={{ minWidth: 200 }}><FontSizeToggle /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="kb-btn kb-out" onClick={toLegacy} disabled={busy} data-tour="kb-ui-switch">🔁 화면 모양 바꾸기 — 기존 디자인으로</button>
          <span className="kb-small">기록은 그대로예요. 기존 디자인 왼쪽 아래 '새 디자인으로 보기'로 언제든 돌아와요.</span>
        </div>
        <div>
          <button type="button" className="kb-btn" onClick={() => onNavigate('#menu')}>☰ 전체 메뉴 (옛 메뉴 32화면)</button>
        </div>
      </div>

      <div className="kb-card">
        <h2 className="kb-h3">계정·기타</h2>
        <div className="kb-muted">
          {user?.name || '선생님'} · {user?.school || '학교 미입력'}{isAdmin ? ' · 관리자' : ''} · 새 디자인{BUILD_LABEL ? ` · 빌드 ${BUILD_LABEL}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && <button type="button" className="kb-btn" onClick={() => onNavigate('admin')} data-tour="nav-admin">🛡️ 가입자 관리 (관리자)</button>}
          {hasSamples && <button type="button" className="kb-btn" onClick={onClear}>🧹 샘플 학생 지우기</button>}
          <button type="button" className="kb-btn" onClick={actions.openTerms}>📜 이용약관 보기</button>
          <button type="button" className="kb-btn" onClick={() => logout()}>↪ 로그아웃</button>
        </div>
      </div>
    </div>
  );
}

// 전체 메뉴(옛 메뉴) — 기존 32화면 전부. 누르면 새 자리로(홈만 예전 홈 화면 그대로).
function FullMenu({ onNavigate }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const item = (id) => (
    <button
      key={id}
      type="button"
      className="kb-btn"
      onClick={() => onNavigate(id === 'home' ? '#page/home' : id)}
      data-tour={'nav-' + id}
      title={PAGE_META[id].title}
    >
      <span aria-hidden="true">{PAGE_META[id].icon}</span> {PAGE_META[id].label}
    </button>
  );
  return (
    <div className="kb-stack">
      <p className="kb-muted">기존 디자인의 메뉴를 그대로 모았어요. 누르면 새 디자인의 그 자리로 가요.</p>
      {COMMON_MENU.map((g) => (
        <div className="kb-menu-group" key={g.group}>
          <h3>{g.group}</h3>
          <div className="kb-menu-items">{g.items.map(item)}</div>
        </div>
      ))}
      {Object.values(SECTIONS).map((s) => (
        <div className="kb-menu-group" key={s.key}>
          <h3><span aria-hidden="true">{s.icon}</span> {s.label}</h3>
          <div className="kb-menu-items">{s.pages.map(item)}</div>
        </div>
      ))}
      {isAdmin && (
        <div className="kb-menu-group">
          <h3>관리자</h3>
          <div className="kb-menu-items">{item('admin')}</div>
        </div>
      )}
    </div>
  );
}

export default function NewView({ route, onNavigate, actions }) {
  switch (route.kind) {
    case 'today':
      return <TodayPage key={route.seq} onNavigate={onNavigate} actions={actions} />;
    case 'calendar':
      return <div key={route.seq}><OldScreen page="calendar" onNavigate={onNavigate} /></div>;
    case 'students':
      return (
        <div key={route.seq} className="kb-stack">
          <StudentList onNavigate={onNavigate} actions={actions} />
          {/* 학생 수정·삭제·학급 옮기기는 예전 '학생·학급 관리' 화면 그대로(1단계) */}
          <h2 className="kb-h3" style={{ marginTop: 8 }}>학생·학급 관리</h2>
          <div><OldScreen page="students" onNavigate={onNavigate} /></div>
        </div>
      );
    case 'student':
      return <StudentWorkspace route={route} onNavigate={onNavigate} actions={actions} />;
    case 'class':
      return <ClassArea route={route} onNavigate={onNavigate} actions={actions} />;
    case 'docs':
      return <DocsHub route={route} onNavigate={onNavigate} actions={actions} />;
    case 'help':
      return <HelpHub route={route} onNavigate={onNavigate} actions={actions} />;
    case 'crisis':
      // 2단계: 학생 없이 열었을 때 저장·AI 생성 전에 학생을 묻는 래퍼(mds/54 §2-1 #31).
      return <div key={route.seq}><CrisisAsk onNavigate={onNavigate} /></div>;
    case 'menu':
      return <FullMenu onNavigate={onNavigate} />;
    case 'page':
      return <div key={`${route.old}|${route.seq}`}><OldScreen page={route.old} onNavigate={onNavigate} /></div>;
    case 'go':
    default:
      return <div className="kb-loading">화면을 여는 중…</div>;
  }
}
