import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { callLLM, clearLLMConfig, getLLMConfig, setLLMConfig } from '../lib/api/llm';

const LLMContext = createContext({
  config: null,
  status: 'off', // 'off' | 'on' | 'err'
  saveConfig: () => {},
  clearConfig: () => {},
  call: async () => '',
  setStatus: () => {},
});

export function LLMProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('off');

  useEffect(() => {
    const c = getLLMConfig();
    setConfig(c);
    setStatus(c ? 'on' : 'off');
  }, []);

  const saveConfig = useCallback((cfg) => {
    setLLMConfig(cfg);
    setConfig(cfg);
    setStatus('on');
  }, []);

  const clearConfig = useCallback(() => {
    clearLLMConfig();
    setConfig(null);
    setStatus('off');
  }, []);

  // Wrapper that updates status on success/failure. Returns just the content
  // string for backward-compat; consumers that need finish_reason should use
  // `callDetailed` instead.
  const call = useCallback(async (prompt, opts) => {
    try {
      const r = await callLLM(prompt, opts);
      setStatus('on');
      return r.content;
    } catch (e) {
      setStatus('err');
      throw e;
    }
  }, []);

  const callDetailed = useCallback(async (prompt, opts) => {
    try {
      const r = await callLLM(prompt, opts);
      setStatus('on');
      return r;
    } catch (e) {
      setStatus('err');
      throw e;
    }
  }, []);

  return (
    <LLMContext.Provider value={{ config, status, saveConfig, clearConfig, call, callDetailed, setStatus }}>
      {children}
    </LLMContext.Provider>
  );
}

export function useLLM() {
  return useContext(LLMContext);
}
