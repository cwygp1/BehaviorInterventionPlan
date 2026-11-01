import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api/client';

const AuthContext = createContext({
  user: null,
  status: 'loading',
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  refresh: async () => {},
  updateUsedTiers: async () => {},
  startDemo: async () => {},
  setUiMode: async () => {},
});

// 로그아웃 때 이 탭에 남은 화면 상태(kb_* sessionStorage)를 지운다 — 공용 PC에서 다음 교사가 전 사람의
//   길잡이·하위 탭 상태로 들어가지 않게(mds/54 N8). 체험 끝 '내 계정 만들기'가 남긴 가입 탭 표시는 남긴다.
//   화면 모양 쿠키(kb_ui)는 지우지 않는다(다음 로그인 창의 기본 선택).
const KEEP_ON_LOGOUT = ['kb_auth_tab'];
function clearTabState() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('kb_') && !KEEP_ON_LOGOUT.includes(k)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch (_e) { /* 사생활 모드 */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // status: 'loading' | 'guest' | 'authed'
  const [status, setStatus] = useState('loading');

  // Bootstrap: ask the server who we are. The auth cookie is httpOnly so the
  // browser can't see it directly — we have to call /api/me.
  const refresh = useCallback(async () => {
    try {
      const data = await api('/api/me');
      if (data && data.user) {
        setUser(data.user);
        setStatus('authed');
        return data.user;
      }
    } catch (_e) {
      // 401 / network error — fall through to guest.
    }
    setUser(null);
    setStatus('guest');
    return null;
  }, []);

  useEffect(() => {
    // Wire client.js so any 401 response auto-clears local user state.
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('guest');
    });
    refresh();
  }, [refresh]);

  // uiMode: 로그인 창에서 고른 화면 모양('new' | 'legacy', mds/54 §4). 없으면 계정에 저장된 값.
  const login = useCallback(async (email, password, uiMode) => {
    const body = { email, password };
    if (uiMode) body.ui_mode = uiMode;
    const data = await api('/api/auth/login', 'POST', body);
    setUser(data.user);
    setStatus('authed');
    return data.user;
  }, []);

  const signup = useCallback(async (payload) => {
    const data = await api('/api/auth/register', 'POST', payload);
    // 1001(mds/46): 가입 직후 1회 — 첫 설정 마법사(방법 3) + 본보기 학생 넣기(방법 5, D4).
    //   components/onboarding/FirstRun.jsx가 읽고 지운다.
    try { sessionStorage.setItem('kb_first_run', '1'); sessionStorage.setItem('kb_seed_samples', '1'); } catch (_e) { /* 사생활 모드 — 체크리스트가 대신 안내 */ }
    setUser(data.user);
    setStatus('authed');
    return data.user;
  }, []);

  // ▶ 3분 체험하기(mds/46 D1) — 서버가 임시 체험 사용자를 만들고 24시간짜리 쿠키를 준다.
  //   재생기(components/demo/DemoPlayer)가 자동으로 시작하도록 탭 저장소에 표시를 남긴다.
  const startDemo = useCallback(async () => {
    const data = await api('/api/auth/demo', 'POST', {});
    try { sessionStorage.setItem('kb_demo_autoplay', '1'); } catch (_e) { /* 사생활 모드 — 재생 바에서 직접 시작 */ }
    setUser(data.user);
    setStatus('authed');
    return data.user;
  }, []);

  // 사용 지원 단계(Tier) 저장 — 성공 시 서버가 돌려준 user로 로컬 상태 갱신.
  const updateUsedTiers = useCallback(async (usedTiersCsv) => {
    const data = await api('/api/me', 'PATCH', { used_tiers: usedTiersCsv });
    setUser(data.user);
    return data.user;
  }, []);

  // 화면 모양 바꾸기(mds/54 §4-1 전환 단추) — 서버가 계정 값·kb_ui 쿠키를 함께 바꾼다.
  //   돌려받은 user.ui_mode가 바뀌면 pages/index.js·pages/new.js가 알맞은 쪽으로 옮긴다.
  const setUiMode = useCallback(async (mode) => {
    const data = await api('/api/me', 'PATCH', { ui_mode: mode });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_e) {
      // Network failure — clear local state anyway.
    }
    clearTabState();
    setUser(null);
    setStatus('guest');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, signup, logout, refresh, updateUsedTiers, startDemo, setUiMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
