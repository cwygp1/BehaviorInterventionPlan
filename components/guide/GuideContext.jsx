import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTourKey } from '../../lib/tours';

// 안내(가이드) 상태의 단일 출처 — 화면 투어 + 용어 사전 (mds/23 기능③) + 도움말 모드(0923).
// Layout이 Provider를 감싸고, Topbar(❓)·SpotlightTour·GlossaryModal·HoverHelp가 소비한다.
//
// 도움말 모드(0923 결정):
//   · ❓를 누르면 켜지고 메뉴 4개가 뜬다. 켜진 동안 PC에서는 마우스를 올린 곳의 설명이 나온다.
//   · 마우스 설명은 PC(마우스)에서만 — 터치 기기에서는 ❓가 메뉴만 연다(canHover).
//   · 새로고침하면 꺼지고(저장 안 함), 다른 화면으로 이동해도 꺼진다. Esc로도 끈다.

const NOOP = () => {};
const GuideCtx = createContext({
  tourKey: null,
  tourPaused: false,
  customSteps: null,
  startTour: NOOP,
  startCustomTour: NOOP,
  stopTour: NOOP,
  glossary: { open: false, term: null, fromTour: false },
  openGlossary: NOOP,
  closeGlossary: NOOP,
  helpMode: false,
  setHelpMode: NOOP,
  menuOpen: false,
  setMenuOpen: NOOP,
  canHover: false,
  actions: {},
  activePage: 'home',
  onNavigate: NOOP,
  navigateRaw: NOOP,
});

const doneKey = (key) => 'kb_tour_done:' + key;
const HOVER_MQ = '(hover: hover) and (pointer: fine)';

export function GuideProvider({ activePage, onNavigate, navigateRaw, actions, children }) {
  const [tourKey, setTourKey] = useState(null);
  // 메뉴에서 연 즉석 안내('이 화면에서 할 일'·'다음 할 일')의 스텝 — 키는 'custom:'로 시작.
  const [customSteps, setCustomSteps] = useState(null);
  // 투어 진행 중 용어 사전을 열면 '일시정지' — 사전을 닫으면 같은 스텝으로 돌아온다.
  // (이전엔 사전을 열 때 투어를 끝내버려서 설명이 끊겼음)
  const [tourPaused, setTourPaused] = useState(false);
  const [glossary, setGlossary] = useState({ open: false, term: null, fromTour: false });
  const [helpMode, setHelpMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);

  // 투어 시작 — 키가 없으면 현재 페이지 기준으로 알맞은 투어를 고른다.
  const startTour = useCallback(
    (key) => {
      setGlossary({ open: false, term: null, fromTour: false });
      setTourPaused(false);
      setCustomSteps(null);
      setTourKey(resolveTourKey(key || activePage));
    },
    [activePage]
  );

  // 즉석 안내 — 스텝을 직접 넘긴다. '봤음' 기록은 남기지 않는다(메뉴에서 몇 번이고 다시 연다).
  const startCustomTour = useCallback((name, steps) => {
    if (!Array.isArray(steps) || !steps.length) return;
    setGlossary({ open: false, term: null, fromTour: false });
    setTourPaused(false);
    setCustomSteps(steps);
    setTourKey('custom:' + name);
  }, []);

  // 투어 종료 — completedKey를 주면 '봤음'으로 기록해 다시 자동 시작하지 않는다.
  const stopTour = useCallback((completedKey) => {
    setTourKey(null);
    setTourPaused(false);
    setCustomSteps(null);
    if (completedKey && !String(completedKey).startsWith('custom:')) {
      try { localStorage.setItem(doneKey(completedKey), '1'); } catch (_) { /* 사생활 모드 등 */ }
    }
  }, []);

  // 용어 사전 열기 — 투어 중이면 끝내지 않고 잠시 멈춘다(fromTour 표시).
  // tourKey는 건드리지 않으므로 SpotlightTour가 유지되어 스텝(idx)도 보존된다.
  const openGlossary = useCallback((term) => {
    const inTour = !!tourKey;
    setTourPaused(inTour);
    setGlossary({ open: true, term: term || null, fromTour: inTour });
  }, [tourKey]);
  // 용어 사전 닫기 — 투어에서 열었던 것이면 멈췄던 스텝부터 이어서 보여준다.
  const closeGlossary = useCallback(() => {
    setGlossary({ open: false, term: null, fromTour: false });
    setTourPaused(false);
  }, []);

  // 최초 방문 1회 — 홈 투어 자동 시작(화면이 안정된 뒤). 완료/그만 보기 시 기록됨.
  useEffect(() => {
    let seen = '1';
    try { seen = localStorage.getItem(doneKey('home')) || ''; } catch (_) { seen = '1'; }
    if (seen) return undefined;
    const t = setTimeout(() => startTour('home'), 900);
    return () => clearTimeout(t);
    // 마운트 시 1회만 — startTour는 마운트 시점의 activePage('home')면 충분.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 마우스가 있는 기기인지 — 마우스 설명은 PC에서만 켠다(0923 결정 ③).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(HOVER_MQ);
    const sync = () => setCanHover(!!mq.matches);
    sync();
    try { mq.addEventListener('change', sync); } catch (_) { mq.addListener?.(sync); }
    return () => { try { mq.removeEventListener('change', sync); } catch (_) { mq.removeListener?.(sync); } };
  }, []);
  useEffect(() => { if (!canHover) setHelpMode(false); }, [canHover]);

  // 다른 화면으로 가면 도움말 모드·메뉴를 끈다(0923 결정 ④).
  useEffect(() => {
    setHelpMode(false);
    setMenuOpen(false);
  }, [activePage]);

  // Esc — 메뉴가 열려 있으면 메뉴만, 아니면 도움말 모드를 끈다.
  // 투어·용어 사전·모달이 떠 있으면 그쪽이 Esc를 가진다.
  // ⚠ window 캡처 단계에서 판단한다 — 모달의 Esc 핸들러(document)가 먼저 돌면 모달이 이미
  //   DOM에서 빠진 뒤라 '모달 없음'으로 보고 도움말까지 꺼 버린다(0923 화면 확인에서 발견).
  useEffect(() => {
    if (!helpMode && !menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || tourKey || glossary.open) return;
      if (document.querySelector('.modal-bg')) return;
      if (menuOpen) { setMenuOpen(false); return; }
      setHelpMode(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [helpMode, menuOpen, tourKey, glossary.open]);

  const value = useMemo(
    () => ({
      tourKey, tourPaused, customSteps, startTour, startCustomTour, stopTour,
      glossary, openGlossary, closeGlossary,
      helpMode, setHelpMode, menuOpen, setMenuOpen, canHover,
      actions: actions || {}, activePage, onNavigate, navigateRaw: navigateRaw || onNavigate,
    }),
    [tourKey, tourPaused, customSteps, startTour, startCustomTour, stopTour, glossary, openGlossary, closeGlossary,
      helpMode, menuOpen, canHover, actions, activePage, onNavigate, navigateRaw]
  );
  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

export const useGuide = () => useContext(GuideCtx);
