import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTourKey } from '../../lib/tours';

// 안내(가이드) 상태의 단일 출처 — 화면 투어 + 용어 사전 (mds/23 기능③).
// Layout이 Provider를 감싸고, Topbar(❓)·SpotlightTour·GlossaryModal이 소비한다.

const NOOP = () => {};
const GuideCtx = createContext({
  tourKey: null,
  tourPaused: false,
  startTour: NOOP,
  stopTour: NOOP,
  glossary: { open: false, term: null, fromTour: false },
  openGlossary: NOOP,
  closeGlossary: NOOP,
  activePage: 'home',
  onNavigate: NOOP,
});

const doneKey = (key) => 'kb_tour_done:' + key;

export function GuideProvider({ activePage, onNavigate, children }) {
  const [tourKey, setTourKey] = useState(null);
  // 투어 진행 중 용어 사전을 열면 '일시정지' — 사전을 닫으면 같은 스텝으로 돌아온다.
  // (이전엔 사전을 열 때 투어를 끝내버려서 설명이 끊겼음)
  const [tourPaused, setTourPaused] = useState(false);
  const [glossary, setGlossary] = useState({ open: false, term: null, fromTour: false });

  // 투어 시작 — 키가 없으면 현재 페이지 기준으로 알맞은 투어를 고른다.
  const startTour = useCallback(
    (key) => {
      setGlossary({ open: false, term: null, fromTour: false });
      setTourPaused(false);
      setTourKey(resolveTourKey(key || activePage));
    },
    [activePage]
  );

  // 투어 종료 — completedKey를 주면 '봤음'으로 기록해 다시 자동 시작하지 않는다.
  const stopTour = useCallback((completedKey) => {
    setTourKey(null);
    setTourPaused(false);
    if (completedKey) {
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

  const value = useMemo(
    () => ({ tourKey, tourPaused, startTour, stopTour, glossary, openGlossary, closeGlossary, activePage, onNavigate }),
    [tourKey, tourPaused, startTour, stopTour, glossary, openGlossary, closeGlossary, activePage, onNavigate]
  );
  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

export const useGuide = () => useContext(GuideCtx);
