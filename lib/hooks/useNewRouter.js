import { useCallback, useEffect, useRef, useState } from 'react';
import { parseHash, formatRoute } from '../routes';
import { confirmLeaveWhileBusy, saveNavIdx, loadNavIdx, NEW_NAV_IDX_KEY } from '../nav/legacyNav';

// 새 디자인(/new) 해시 라우터 — pages/index.js의 이동·복원·뒤로가기·AI 생성 중 확인·beforeunload 규칙을 그대로 따른다.
//   · push: 히스토리에 쌓는다(학생 수첩 탭 전환도 push — 뒤로 = 이전 탭, mds/54 §3-4).
//   · replace: 쌓지 않고 바꾼다(#go/… 해석, 학생이 바뀐 주소 맞추기).
//   · route.seq: 이동할 때마다 1씩 — 탭 본문 key에 넣어 이동마다 다시 그린다(달력 날짜·IEP→DTT 교차 링크, mds/54 §3-3 규칙 3).
//   · 히스토리 깊이는 'kkobak-nav-idx-new'(기존 디자인과 섞이지 않게).
const IDX_KEY = NEW_NAV_IDX_KEY; // 'kkobak-nav-idx-new'

function currentHash() {
  if (typeof window === 'undefined') return '';
  return window.location.hash || '';
}

export function useNewRouter({ busy, enabled }) {
  const [route, setRoute] = useState(() => ({ ...parseHash(''), seq: 0, hash: '#today' }));
  const [canGoBack, setCanGoBack] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const idxRef = useRef(0);
  const seqRef = useRef(0);
  const hashRef = useRef('#today');
  const initedRef = useRef(false);

  const apply = useCallback((hash) => {
    const r = parseHash(hash);
    // 주소 글자를 정규형으로(탭에 없는 sub 등은 기본값) — 그래야 같은 화면 판정이 맞는다.
    const norm = r.kind === 'go' ? hash : formatRoute(r);
    seqRef.current += 1;
    hashRef.current = norm;
    setRoute({ ...r, seq: seqRef.current, hash: norm });
    return norm;
  }, []);

  // 로그인 뒤 1회: 주소에서 화면 복원.
  useEffect(() => {
    if (!enabled) { initedRef.current = false; return; }
    if (initedRef.current) return;
    initedRef.current = true;
    const st = window.history.state;
    const idx = st && st.kbNew && typeof st.idx === 'number' ? st.idx : loadNavIdx(IDX_KEY);
    idxRef.current = idx;
    setCanGoBack(idx > 0);
    saveNavIdx(idx, IDX_KEY);
    const norm = apply(currentHash() || '#today');
    try { window.history.replaceState({ kbNew: 1, idx }, '', norm); } catch (_e) { /* noop */ }
  }, [enabled, apply]);

  const push = useCallback((hash) => {
    const target = parseHash(hash).kind === 'go' ? hash : formatRoute(parseHash(hash));
    if (target === hashRef.current) return false; // 같은 화면 재클릭 — 히스토리 중복 방지
    if (busyRef.current && !confirmLeaveWhileBusy()) return false;
    idxRef.current += 1;
    setCanGoBack(true);
    saveNavIdx(idxRef.current, IDX_KEY);
    const norm = apply(target);
    try { window.history.pushState({ kbNew: 1, idx: idxRef.current }, '', norm); } catch (_e) { /* 화면 전환은 유지 */ }
    return true;
  }, [apply]);

  const replace = useCallback((hash) => {
    const norm = apply(hash);
    try { window.history.replaceState({ kbNew: 1, idx: idxRef.current }, '', norm); } catch (_e) { /* noop */ }
  }, [apply]);

  const goBack = useCallback(() => {
    if (idxRef.current > 0) window.history.back();
  }, []);

  // 브라우저 뒤로/앞으로.
  useEffect(() => {
    const onPop = (e) => {
      if (!initedRef.current) return;
      const st = e.state;
      // '/'(기존 디자인) 항목으로 돌아왔는데 Next 라우터가 맡지 않는 항목(__N 없음)이면 그 주소로 다시 불러온다 —
      //   주소만 '/'이고 새 셸이 남는 일을 막는다(middleware가 쿠키대로 정리, mds/56 #17).
      if (window.location.pathname !== '/new' && !(st && st.__N)) { window.location.reload(); return; }
      const hasIdx = st && st.kbNew && typeof st.idx === 'number';
      const idx = hasIdx ? st.idx : idxRef.current;
      const hash = currentHash() || '#today';
      if (formatRoute(parseHash(hash)) === hashRef.current) {
        idxRef.current = idx;
        setCanGoBack(idx > 0);
        if (hasIdx) saveNavIdx(idx, IDX_KEY);
        return;
      }
      if (busyRef.current && !confirmLeaveWhileBusy()) {
        if (idx < idxRef.current) window.history.forward();
        else window.history.back();
        return;
      }
      idxRef.current = idx;
      setCanGoBack(idx > 0);
      if (hasIdx) saveNavIdx(idx, IDX_KEY);
      apply(hash);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [apply]);

  // AI 생성 중 새로고침·탭 닫기 막기.
  useEffect(() => {
    if (!busy) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  return { route, push, replace, canGoBack, goBack, hashRef };
}
