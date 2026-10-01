import { useState } from 'react';
import { useGuide } from './GuideContext';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { buildTodoSteps, helpSelector } from '../../lib/helpText';
import { resolveTourKey } from '../../lib/tours';
import { pickHelpNextStep } from '../../lib/nextStep';
import { computeT1Reviews, computeT2Reviews, computeT3Reviews, computeIepReviews } from '../../lib/dashReviews';
import { PAGE_SECTION } from '../../lib/tiers';
import { ESCORTS, ESCORT_ORDER, getEscort } from '../../lib/escorts';
import { recommendEscort } from '../../lib/escortEngine';
import { loadDashboardCached } from '../pages/dash/DashBits';

// Topbar의 🧭 길잡이 (mds/23 기능③ → 0923 도움말 모드 → 1001 길잡이).
//   · 누르면 메뉴가 열린다. 위: '무엇을 하고 싶으세요?' — 길(lib/escorts.js)을 고르면 EscortGuide가
//     화면 위에서 한 단계씩 짚는다. 기록 상태로 하나를 '지금 추천'으로 맨 위에 둔다.
//   · 아래: 기존 도움말 — 마우스 설명 켜기/끄기(PC만, 0923 결정 ③), 이 화면에서 할 일, 다음 할 일, 용어 찾기, 투어.
//     1001부터 단추를 눌러도 마우스 설명이 저절로 켜지지 않는다(메뉴 안 스위치로 켠다). 끄기는 스위치 또는 Esc.

const REVIEWERS = { t1: computeT1Reviews, t2: computeT2Reviews, t3: computeT3Reviews, iep: computeIepReviews };

export default function HelpMenu() {
  const {
    helpMode, setHelpMode, menuOpen, setMenuOpen, canHover,
    startTour, startCustomTour, openGlossary, activePage, onNavigate, navigateRaw, actions,
    escort, startEscort, stopEscort, setEscortMin,
  } = useGuide();
  const { curClass, curClassId, curSemester, students, curStuId, selectStudent, tier2Groups, homeSummary } = useStudents();
  const { status: llmStatus } = useLLM();
  const [busy, setBusy] = useState(false);

  const onBtn = () => setMenuOpen(!menuOpen);
  const close = () => setMenuOpen(false);

  // 길 고르기 — 지금 추천 하나를 맨 위로.
  const totals = (students || []).reduce((acc, s) => {
    const sm = homeSummary?.summaries?.[s.id];
    if (sm) { acc.abc += sm.abc_count || 0; acc.mon += sm.mon_count || 0; }
    return acc;
  }, { abc: 0, mon: 0 });
  const rec = recommendEscort({
    activePage, pageSection: PAGE_SECTION, hasClass: !!curClass, studentCount: (students || []).length, totals,
  });
  const order = rec ? [rec, ...ESCORT_ORDER.filter((id) => id !== rec)] : ESCORT_ORDER;
  const running = escort ? getEscort(escort.id) : null;
  const pickEscort = (id) => { close(); startEscort(id); };
  const toggleHover = () => { close(); setHelpMode(!helpMode); };

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
    // 가야 할 메뉴가 이 영역 사이드바에 없으면(다른 영역) 상단 영역 단추를 짚는다 — 길잡이와 같은 규칙(lib/escortEngine.js).
    let anchor = n.anchor;
    if (anchor && n.page && typeof document !== 'undefined' && !document.querySelector(helpSelector(anchor))) {
      const sec = PAGE_SECTION[n.page];
      if (sec && document.querySelector(helpSelector('tb-chip-' + sec))) anchor = 'tb-chip-' + sec;
    }
    startCustomTour('next', [{
      el: anchor ? helpSelector(anchor) : null,
      title: '🔦 다음 할 일',
      desc: n.text,
      sub: n.sub || null,
      quietFallback: true,
      action: hasGo ? { label: n.cta + ' →', run } : null,
    }]);
  };

  const showGlossary = () => { close(); openGlossary(); };
  // 이 화면 둘러보기 — 자기 투어가 없는 화면(학생 관리·달력·자료실 등 9곳)은 예전엔 홈 투어가 떠서 홈 카드만 찾다가
  // 빈 카드를 보였다(1001 실화면 점검). 그런 화면은 그 화면의 소개+할 일 안내로 대신한다.
  const replayTour = () => {
    close();
    if (activePage !== 'home' && resolveTourKey(activePage) === 'home') {
      const steps = buildTodoSteps(activePage);
      if (steps) { startCustomTour('tour:' + activePage, steps); return; }
    }
    startTour();
  };

  return (
    <div className="help-menu" data-tour="help-btn">
      <button
        className={'help-btn' + (helpMode ? ' on' : '') + (escort ? ' esc-on' : '')}
        onClick={onBtn}
        title={helpMode ? '길잡이 — 마우스 설명 켜짐 (Esc로 끄기)' : '길잡이 — 하고 싶은 일을 고르면 화면에서 한 단계씩 짚어 드려요'}
        aria-label={helpMode ? '길잡이 메뉴 열기, 마우스 설명 켜짐' : '길잡이 메뉴 열기'}
        aria-pressed={helpMode}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        🧭<span className="help-on-label">{helpMode ? '설명 켜짐' : '길잡이'}</span>
      </button>
      {menuOpen && (
        <>
          <div className="help-backdrop" onClick={close} />
          <div className="help-drop esc-menu" role="menu" aria-label="길잡이 메뉴">
            {running && (
              <div className="esc-running">
                <span>🧭 지금 <b>{running.title}</b> 따라 하는 중</span>
                <span className="esc-running-acts">
                  <button type="button" onClick={() => { close(); setEscortMin(false); }}>이어서 보기</button>
                  <button type="button" onClick={() => { close(); stopEscort(); }}>그만</button>
                </span>
              </div>
            )}
            <div className="help-drop-k">무엇을 하고 싶으세요?</div>
            <div className="help-drop-hint">고르면 화면 위에서 누를 곳을 한 단계씩 짚어 드려요.</div>
            {order.map((id) => {
              const e = ESCORTS[id];
              return (
                <button key={id} role="menuitem" className={'esc-item' + (id === rec ? ' rec' : '')} onClick={() => pickEscort(id)}>
                  <span className="esc-ic" aria-hidden="true">{e.icon}</span>
                  <span className="esc-tx"><b>{e.title}</b><small>{e.desc}</small></span>
                  {id === rec && <span className="esc-rec">지금 추천</span>}
                </button>
              );
            })}
            <div className="help-drop-sep" />
            <div className="help-drop-k">다른 도움</div>
            {canHover && (
              <button role="menuitem" onClick={toggleHover}>
                {helpMode ? '🔕 마우스 설명 끄기' : '🔍 마우스 설명 켜기 — 올린 곳을 풀이'}
                {helpMode && <span className="help-kbd">Esc</span>}
              </button>
            )}
            <button role="menuitem" onClick={showTodo}>📍 이 화면에서 할 일</button>
            <button role="menuitem" onClick={showNext} disabled={busy}>{busy ? '⏳ 살펴보는 중…' : '🔦 다음 할 일'}</button>
            <button role="menuitem" onClick={showGlossary}>📖 용어 찾기 — 쉬운 말 풀이</button>
            <button role="menuitem" onClick={replayTour}>👣 이 화면 둘러보기 (투어)</button>
          </div>
        </>
      )}
    </div>
  );
}
