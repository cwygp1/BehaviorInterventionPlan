import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  callLLM,
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

        // No server config. One-time migration: if there's a legacy localStorage
        // entry from before per-user storage existed, push it to the server.
        const legacy = getLLMConfig(null); // null → legacy key
        if (legacy && legacy.endpoint) {
          try {
            const saved = await saveServerLLMConfig({
              endpoint: legacy.endpoint,
              model: legacy.model || '',
              max_tokens: legacy.max_tokens || 8000,
            });
            if (lastLoadedUserId.current !== userId) return;
            const finalCfg = saved || legacy;
            setConfig(finalCfg);
            setLLMConfig(finalCfg, userId);
            setStatus('on');
            // Drop legacy key now that it's safely on the server.
            try { window.localStorage.removeItem('seai.llm.config'); } catch (_) {}
            return;
          } catch (_) {
            // Migration failed — fall through to "no config" state.
          }
        }

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

  /** Persist config to server + per-user cache. */
  const saveConfig = useCallback(
    async (cfg) => {
      const saved = await saveServerLLMConfig(cfg); // throws on validation/auth errors
      const finalCfg = saved || cfg;
      setLLMConfig(finalCfg, userId);
      setConfig(finalCfg);
      setStatus('on');
      return finalCfg;
    },
    [userId]
  );

  /** Remove config from server + per-user cache. */
  const clearConfig = useCallback(async () => {
    try {
      await deleteServerLLMConfig();
    } catch (_e) {
      // best effort — clear locally anyway
    }
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

  return (
    <LLMContext.Provider value={{ config, status, saveConfig, clearConfig, call, callDetailed, setStatus }}>
      {children}
    </LLMContext.Provider>
  );
}

export function useLLM() {
  return useContext(LLMContext);
}
