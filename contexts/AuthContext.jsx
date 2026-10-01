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
});

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

  const login = useCallback(async (email, password) => {
    const data = await api('/api/auth/login', 'POST', { email, password });
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

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_e) {
      // Network failure — clear local state anyway.
    }
    setUser(null);
    setStatus('guest');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, signup, logout, refresh, updateUsedTiers, startDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
