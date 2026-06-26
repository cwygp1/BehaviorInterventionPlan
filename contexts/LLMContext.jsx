import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  callLLM,
  callLLMVision,
  clearAllLLMCaches,
  clearLLMConfig,
  deleteServerLLMConfig,
  fetchServerLLMConfig,
  getLLMConfig,
  saveServerLLMConfig,
  setLLMConfig,
} from '../lib/api/llm';
import { useAuth } from './AuthContext';

const LLMContext = createContext({
  config: null,
  status: 'off', // 'off' | 'on' | 'err' | 'loading'
  saveConfig: async () => {},
  clearConfig: async () => {},
  call: async () => '',
  callDetailed: async () => ({ content: '' }),
  callVisionDetailed: async () => ({ content: '' }),
  setStatus: () => {},
});

export function LLMProvider({ children }) {
  const { user, status: authStatus } = useAuth();
  const userId = user?.id ?? null;

  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('off');
  const lastLoadedUserId = useRef(null);

  // Load the right config for the current auth state.
  //   • Logged in  → seed from per-user localStorage cache (instant), then
  //                  refresh from server (authoritative).
  //   • Logged out → wipe in-memory config and any legacy cache so the
  //                  previous user's settings can't bleed into the next one.
  useEffect(() => {
    if (authStatus === 'loading') return;

    if (authStatus !== 'authed' || !userId) {
      // Guest. Clear caches so a previously-logged-in user's settings can't
      // be reused by anyone else who opens the page on this browser.
      clearAllLLMCaches();
      setConfig(null);
      setStatus('off');
      lastLoadedUserId.current = null;
      return;
    }

    // Same user, already loaded — nothing to do.
    if (lastLoadedUserId.current === userId) return;
    lastLoadedUserId.current = userId;

    // 1) Seed from per-user cache for instant first paint.
    const cached = getLLMConfig(userId);
    if (cached) {
      setConfig(cached);
      setStatus('on');
    } else {
      setConfig(null);
      setStatus('off');
    }

    // 2) Refresh from server (source of truth).
    (async () => {
      try {
        const remote = await fetchServerLLMConfig();
        if (lastLoadedUserId.current !== userId) return; // user changed mid-flight

        if (remote) {
          setConfig(remote);
          setLLMConfig(remote, userId);
          setStatus('on');
          return;
        }

        // 공용 설정이 서버에 아직 없음. (설정은 전체 공용이므로 계정별 마이그레이션은 하지 않는다.)
        if (cached) {
          // Server has nothing and no legacy — clear stale per-user cache.
          clearLLMConfig(userId);
        }
        setConfig(null);
        setStatus('off');
      } catch (_e) {
        // Network/401 — keep the cached value if we had one.
      }
    })();
  }, [authStatus, userId]);

  /** Persist shared config to server + local cache. 비밀번호 필요. */
  const saveConfig = useCallback(
    async (cfg, password) => {
      const saved = await saveServerLLMConfig(cfg, password); // throws on validation/auth/password errors
      const finalCfg = saved || cfg;
      setLLMConfig(finalCfg, userId);
      setConfig(finalCfg);
      setStatus('on');
      return finalCfg;
    },
    [userId]
  );

  /** Reset shared config on server + local cache. 비밀번호 필요. */
  const clearConfig = useCallback(async (password) => {
    await deleteServerLLMConfig(password); // throws on password error
    clearLLMConfig(userId);
    setConfig(null);
    setStatus('off');
  }, [userId]);

  // Wrapper that updates status on success/failure. Returns just the content
  // string for backward-compat; consumers that need finish_reason should use
  // `callDetailed` instead.
  const call = useCallback(
    async (prompt, opts) => {
      try {
        const r = await callLLM(prompt, opts, config);
        setStatus('on');
        return r.content;
      } catch (e) {
        setStatus('err');
        throw e;
      }
    },
    [config]
  );

  const callDetailed = useCallback(
    async (prompt, opts) => {
      try {
        const r = await callLLM(prompt, opts, config);
        setStatus('on');
        return r;
      } catch (e) {
        setStatus('err');
        throw e;
      }
    },
    [config]
  );

  // 이미지(비전) 입력 호출 — { content, reasoning, finish_reason, usage } 반환.
  const callVisionDetailed = useCallback(
    async (prompt, images, opts) => {
      try {
        const r = await callLLMVision(prompt, images, opts, config);
        setStatus('on');
        return r;
      } catch (e) {
        setStatus('err');
        throw e;
      }
    },
    [config]
  );

  return (
    <LLMContext.Provider value={{ config, status, saveConfig, clearConfig, call, callDetailed, callVisionDetailed, setStatus }}>
      {children}
    </LLMContext.Provider>
  );
}

export function useLLM() {
  return useContext(LLMContext);
}
