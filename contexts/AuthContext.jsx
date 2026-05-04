import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api/client';

const AuthContext = createContext({
  user: null,
  status: 'loading',
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  refresh: async () => {},
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
    setUser(data.user);
    setStatus('authed');
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
    <AuthContext.Provider value={{ user, status, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
