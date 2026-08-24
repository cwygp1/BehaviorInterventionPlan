import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  callLLM,
  callLLMVision,
  clearAllLLMCaches,
  clearLLMConfig,
  deleteServerLLMConfig,
  fetchServerLLMConfig,
  getLLMConfig,
  resolveModel,
  saveServerLLMConfig,
  setLLMConfig,
} from '../lib/api/llm';
import { apiPost } from '../lib/api/client';
import { normalizeAIText } from '../lib/utils/aiText';
import { useAuth } from './AuthContext';

const LLMContext = createContext({
  config: null,
  status: 'off', // 'off' | 'on' | 'err' | 'loading'
  busy: false, // AI 호출이 하나라도 진행 중인지(페이지 이동 가드용)
  aiLog: [], // 전역 AI 통신 로그(AI 연결 모달에서 표시)
  pushLog: () => {},
  clearLog: () => {},
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

  // --- 진행 상태(busy) 추적 -------------------------------------------------
  // 동시 호출을 고려해 카운터로 관리한다. 0보다 크면 어딘가에서 AI 생성 중.
  // 0720: 무엇이 돌고 있는지 전역 스피너에 보여주기 위해 진행 중인 작업 라벨도 함께 추적.
  const busyCount = useRef(0);
  const [busy, setBusy] = useState(false);
  const [busyLabels, setBusyLabels] = useState([]); // 진행 중인 AI 작업 라벨 목록
  // P1(진행 피드백): 스트리밍 수신 진행 상황 — { startedAt, chars }. 동시 호출 시 최신 값 표시.
  const [aiProgress, setAiProgress] = useState(null);
  const incBusy = useCallback((label) => {
    busyCount.current += 1;
    setBusy(true);
    setBusyLabels((prev) => [...prev, label || 'AI 생성']);
    setAiProgress({ startedAt: Date.now(), chars: 0 });
  }, []);
  const decBusy = useCallback((label) => {
    busyCount.current = Math.max(0, busyCount.current - 1);
    if (busyCount.current === 0) { setBusy(false); setAiProgress(null); }
    setBusyLabels((prev) => {
      const i = prev.indexOf(label || 'AI 생성');
      return i >= 0 ? [...prev.slice(0, i), ...prev.slice(i + 1)] : prev.slice(1);
    });
  }, []);
  // 스트리밍 조각이 도착할 때마다 수신량 갱신 — llm.js의 onProgress로 주입된다.
  // chars = 보이는 답변 글자 수, reasoningChars = 사고 과정(표시용으로 구분).
  const onAiProgress = useCallback((p) => {
    setAiProgress((cur) => ({
      startedAt: cur?.startedAt || Date.now(),
      chars: p.chars,
      reasoningChars: p.reasoningChars || 0,
    }));
  }, []);

  // --- 전역 AI 통신 로그 ----------------------------------------------------
  const [aiLog, setAiLog] = useState([]);
  const pushLog = useCallback((logStatus, label, detail, raw) => {
    setAiLog((prev) => [
      {
        t: new Date().toLocaleTimeString(),
        status: logStatus,
        label: label || 'AI',
        detail: detail || '',
        raw: raw ? String(raw).slice(0, 6000) : '',
      },
      ...prev,
    ].slice(0, 40));
  }, []);
  const clearLog = useCallback(() => setAiLog([]), []);

  // 요청별 토큰 사용량을 서버에 저장한다(파이어앤포겟). 실패해도 생성엔 영향 없음.
  // 사용량 대시보드(기간·사용자·모델별 집계, 클라우드 전환 비용 시뮬레이션)의 원천 데이터.
  const logUsage = useCallback((info) => {
    const u = (info && info.usage) || {};
    const pt = Number(u.prompt_tokens) || 0;
    const ct = Number(u.completion_tokens) || 0;
    const tt = Number(u.total_tokens) || pt + ct;
    // 토큰 정보가 전혀 없으면(usage 미제공) 저장하지 않는다.
    if (!pt && !ct && !tt) return;
    apiPost('/api/usage/log', {
      model: (info && info.model) || '',
      tier: (info && info.tier) || '',
      label: (info && info.label) || '',
      prompt_tokens: pt,
      completion_tokens: ct,
      total_tokens: tt,
    }).catch(() => {});
  }, []);

  // 모든 LLM 호출을 감싸 busy/로그를 자동 기록한다. label은 opts.label로 전달.
  // meta = { model, tier } — 사용량 로깅에 쓰인다(응답의 실제 model이 우선).
  const trackCall = useCallback(
    async (label, fn, meta) => {
      incBusy(label);
      pushLog('start', label, '요청 전송…');
      try {
        const raw = await fn();
        // 표기 정리(한자 혼입·숫자와 단위 사이 공백)는 모든 LLM 호출에 공통 적용.
        // reasoning도 정리한다 — content가 비면 reasoning을 본문으로 쓰는 호출부가 있음(P11).
        const r = raw && (typeof raw.content === 'string' || typeof raw.reasoning === 'string')
          ? {
              ...raw,
              content: typeof raw.content === 'string' ? normalizeAIText(raw.content) : raw.content,
              reasoning: typeof raw.reasoning === 'string' ? normalizeAIText(raw.reasoning) : raw.reasoning,
            }
          : raw;
        const out = r && r.content && r.content.trim() ? r.content : (r?.reasoning || '');
        const usageStr = r?.usage
          ? ` · 토큰 ${r.usage.total_tokens ?? '?'}(in ${r.usage.prompt_tokens ?? '?'}/out ${r.usage.completion_tokens ?? '?'})`
          : '';
        const metaStr =
          `finish=${r?.finish_reason ?? '-'} · content ${(r?.content || '').length}자` +
          ((r?.reasoning || '').length ? ` · reasoning ${(r.reasoning || '').length}자` : '') +
          usageStr;
        pushLog('ok', label, '성공 · ' + metaStr, out);
        setStatus('on');
        // 사용량 로깅 — 응답의 실제 model을 우선 사용, 없으면 호출 시 계산한 model.
        if (r?.usage) {
          logUsage({ model: r.model || meta?.model || '', tier: meta?.tier || '', label, usage: r.usage });
        }
        return r;
      } catch (e) {
        pushLog('error', label, '호출/네트워크 오류: ' + (e?.message || ''));
        setStatus('err');
        throw e;
      } finally {
        decBusy(label);
      }
    },
    [incBusy, decBusy, pushLog, logUsage]
  );

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
      const r = await trackCall(
        opts?.label || 'AI 생성',
        () => callLLM(prompt, { ...opts, onProgress: onAiProgress }, config),
        { model: resolveModel(config, opts?.tier), tier: opts?.tier || 'quality' }
      );
      return r.content;
    },
    [config, trackCall, onAiProgress]
  );

  const callDetailed = useCallback(
    (prompt, opts) =>
      trackCall(
        opts?.label || 'AI 생성',
        () => callLLM(prompt, { ...opts, onProgress: onAiProgress }, config),
        { model: resolveModel(config, opts?.tier), tier: opts?.tier || 'quality' }
      ),
    [config, trackCall, onAiProgress]
  );

  // 이미지(비전) 입력 호출 — { content, reasoning, finish_reason, model, usage } 반환.
  // 비전은 기본적으로 빠른(멀티모달) 모델을 쓰므로 tier 기본값을 'fast'로 맞춘다.
  const callVisionDetailed = useCallback(
    (prompt, images, opts) =>
      trackCall(
        opts?.label || 'AI 비전 분석',
        () => callLLMVision(prompt, images, { ...opts, onProgress: onAiProgress }, config),
        { model: resolveModel(config, opts?.tier || 'fast'), tier: opts?.tier || 'fast' }
      ),
    [config, trackCall, onAiProgress]
  );

  return (
    <LLMContext.Provider value={{ config, status, busy, busyLabels, aiProgress, aiLog, pushLog, clearLog, saveConfig, clearConfig, call, callDetailed, callVisionDetailed, setStatus }}>
      {children}
    </LLMContext.Provider>
  );
}

export function useLLM() {
  return useContext(LLMContext);
}
