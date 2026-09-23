import { useState } from 'react';
import { useGuide } from './GuideContext';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { buildTodoSteps, helpSelector } from '../../lib/helpText';
import { pickHelpNextStep } from '../../lib/nextStep';
import { computeT1Reviews, computeT2Reviews, computeT3Reviews, computeIepReviews } from '../../lib/dashReviews';
import { PAGE_SECTION } from '../../lib/tiers';
import { loadDashboardCached } from '../pages/dash/DashBits';

// Topbar의 ❓ — 도움말 모드 스위치 + 메뉴 4개 (mds/23 기능③ → 0923 도움말 모드).
//   · PC: 누르면 도움말 모드가 켜지고 메뉴가 뜬다. 켜진 동안 마우스를 올린 곳의 설명이 나온다
//     (HoverHelp). 켜진 채로 다시 누르면 메뉴만 다시 열린다. 끄기는 메뉴의 '도움말 끄기' 또는 Esc.
//   · 터치 기기: 마우스 설명 없이 메뉴만 연다(0923 결정 ③).
//   · 메뉴 항목은 기존처럼 스포트라이트 안내를 한 번 보여준다. 끝나면 도움말 모드로 돌아온다.

const REVIEWERS = { t1: computeT1Reviews, t2: computeT2Reviews, t3: computeT3Reviews, iep: computeIepReviews };

export default function HelpMenu() {
  const {
    helpMode, setHelpMode, menuOpen, setMenuOpen, canHover,
    startTour, startCustomTour, openGlossary, activePage, onNavigate, navigateRaw, actions,
  } = useGuide();
  const { curClass, curClassId, curSemester, students, curStuId, selectStudent, tier2Groups, homeSummary } = useStudents();
  const { status: llmStatus } = useLLM();
  const [busy, setBusy] = useState(false);

  const onBtn = () => {
    if (canHover && !helpMode) { setHelpMode(true); setMenuOpen(true); return; }
    setMenuOpen(!menuOpen);
  };
  const close = () => setMenuOpen(false);

  // ① 이 화면에서 할 일 — 화면 소개 + 할 일 1~3개. 문구가 없는 화면이면 기존 화면 투어로.
  const showTodo = () => {
    close();
    const steps = buildTodoSteps(activePage);
    if (steps) startCustomTour('todo:' + activePage, steps);
    else startTour();
  };

  // ② 다음 할 일 — 기록 상태로 지금 가장 도움이 되는 한 가지를 짚고, 바로 가기 단추를 준다.
  const showNext = async () => {
    if (busy) return;
    setBusy(true);
    let dash = null;
    try { if (curClassId) dash = await loadDashboardCached(curClassId, curSemester); } catch (_e) { dash = null; }
    setBusy(false);
    close();
    const totals = (students || []).reduce((acc, s) => {
      const sm = homeSummary?.summaries?.[s.id];
      if (sm) { acc.abc += sm.abc_count || 0; acc.mon += sm.mon_count || 0; }
      return acc;
    }, { abc: 0, mon: 0 });
    const n = pickHelpNextStep({
      activePage, pageSection: PAGE_SECTION, curClass, students, curStuId,
      tier2GroupCount: (tier2Groups || []).length, totals, aiOn: llmStatus === 'on', dash, reviewers: REVIEWERS,
    });
    const run = async () => {
      if (n.action === 'manageClasses') actions.openManageClasses?.();
      else if (n.action === 'addStudent') actions.openAddStudent?.();
      else if (n.action === 'aiSettings') actions.openAISettings?.();
      else if (n.sid) { await selectStudent(n.sid); navigateRaw(n.page); }
      else if (n.page) onNavigate(n.page);
    };
    const hasGo = !!(n.cta && (n.action || n.page));
    startCustomTour('next', [{
      el: n.anchor ? helpSelector(n.anchor) : null,
      title: '🔦 다음 할 일',
      desc: n.text,
      sub: n.sub || null,
      quietFallback: true,
      action: hasGo ? { label: n.cta + ' →', run } : null,
    }]);
  };

  const showGlossary = () => { close(); openGlossary(); };
  const replayTour = () => { close(); startTour(); };
  const turnOff = () => { close(); setHelpMode(false); };

  return (
    <div className="help-menu" data-tour="help-btn">
      <button
        className={'help-btn' + (helpMode ? ' on' : '')}
        onClick={onBtn}
        title={helpMode ? '도움말 모드 켜짐 — 메뉴 열기 · Esc로 끄기' : '도움말 — 켜면 마우스를 올린 곳의 설명이 나와요'}
        aria-label={helpMode ? '도움말 모드 켜짐, 메뉴 열기' : '도움말 켜기'}
        aria-pressed={helpMode}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        ❓{helpMode && <span className="help-on-label">도움말 켜짐</span>}
      </button>
      {menuOpen && (
        <>
          <div className="help-backdrop" onClick={close} />
          <div className="help-drop" role="menu" aria-label="도움말 메뉴">
            {helpMode && (
              <div className="help-drop-head">🔍 마우스를 올리면 그곳 설명이 나와요. 클릭은 평소대로 돼요.</div>
            )}
            <button role="menuitem" onClick={showTodo}>📍 이 화면에서 할 일</button>
            <button role="menuitem" onClick={showNext} disabled={busy}>{busy ? '⏳ 살펴보는 중…' : '🔦 다음 할 일'}</button>
            <button role="menuitem" onClick={showGlossary}>📖 용어 찾기 — 쉬운 말 풀이</button>
            <button role="menuitem" onClick={replayTour}>👣 투어 다시 보기</button>
            {helpMode && (
              <>
                <div className="help-drop-sep" />
                <button role="menuitem" className="help-off" onClick={turnOff}>🔕 도움말 끄기 <span className="help-kbd">Esc</span></button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
