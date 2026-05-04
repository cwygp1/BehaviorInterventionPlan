// LLM client — calls LM Studio (or any OpenAI-compatible) directly from the
// browser. Direct call bypasses the Vercel serverless function so a user's
// localhost:1234 LLM is reachable in production too. The user must enable
// CORS in LM Studio (Server Settings → Cross-Origin Resource Sharing).

import { api } from './client';

// Cache key is per-user so multiple accounts on the same browser don't leak
// settings into each other. Source-of-truth lives server-side in
// `user_llm_configs`; localStorage is a hot cache that gets seeded on login.
const LEGACY_LLM_KEY = 'seai.llm.config';
const LLM_KEY_PREFIX = 'seai.llm.config.';
export const LLM_DEFAULT_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
export const LLM_SYSTEM_PROMPT =
  '당신은 특수교육 전문가이자 PBS(긍정적 행동지원) 컨설턴트입니다. ' +
  '답변은 한국어로, 교사가 현장에서 바로 적용 가능한 구체적 형태로 작성합니다. ' +
  '학생 정보는 익명·비식별 형태만 사용한다는 원칙을 항상 지킵니다.';

function cacheKeyFor(userId) {
  return userId ? LLM_KEY_PREFIX + String(userId) : LEGACY_LLM_KEY;
}

/**
 * Read cached config from localStorage. Returns null if nothing stored or the
 * stored value is malformed. `userId` may be null/undefined for the pre-login
 * legacy fallback.
 */
export function getLLMConfig(userId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKeyFor(userId));
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.endpoint ? c : null;
  } catch (_) {
    return null;
  }
}

/** Write the config to the per-user localStorage cache. */
export function setLLMConfig(cfg, userId) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(cacheKeyFor(userId), JSON.stringify(cfg));
}

/** Remove the per-user cache only. Server config is untouched. */
export function clearLLMConfig(userId) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(cacheKeyFor(userId));
}

/** Clear every LLM cache key in localStorage — used on logout. */
export function clearAllLLMCaches() {
  if (typeof window === 'undefined') return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && (k === LEGACY_LLM_KEY || k.startsWith(LLM_KEY_PREFIX))) {
        keys.push(k);
      }
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch (_) {
    // best-effort
  }
}

// ---- Server-side per-user config -----------------------------------------

/** Fetch the logged-in user's saved config from the server. */
export async function fetchServerLLMConfig() {
  const r = await api('/api/me/llm-config', 'GET');
  return r?.config || null;
}

/** Persist (upsert) the logged-in user's config server-side. */
export async function saveServerLLMConfig(cfg) {
  const r = await api('/api/me/llm-config', 'PUT', cfg);
  return r?.config || null;
}

/** Delete the logged-in user's config server-side. */
export async function deleteServerLLMConfig() {
  await api('/api/me/llm-config', 'DELETE');
}

/**
 * Low-level request to an OpenAI-compatible chat completions endpoint.
 * Returns { content, finish_reason, usage } so callers can detect truncation.
 * Throws on non-2xx or network errors.
 */
export async function llmRequest(endpoint, model, messages, opts = {}) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout ?? 180000);
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'auto',
        messages,
        stream: false,
        temperature: opts.temperature ?? 0.7,
        // Generous default — Qwen / Llama / DeepSeek all comfortably handle 8k+
        // output. Caller can lower it for short tasks (e.g. Dead Man's Test).
        max_tokens: opts.max_tokens ?? 8000,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      let msg = 'LLM 응답 오류 (' + r.status + ')';
      try {
        const j = await r.json();
        if (j.error?.message) msg = j.error.message;
      } catch (_) {}
      throw new Error(msg);
    }
    const data = await r.json();
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      finish_reason: choice?.finish_reason || null,
      usage: data.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Backward-compatible wrapper that returns just the string. Use this for
 * simple cases (test connection). Prefer llmRequest in features that want
 * truncation info.
 */
export async function llmRequestText(endpoint, model, messages, opts = {}) {
  const r = await llmRequest(endpoint, model, messages, opts);
  return r.content;
}

/**
 * Main entry point used by all AI-powered features.
 * Returns { content, finish_reason, usage } so the UI can show a "truncated"
 * warning when finish_reason === 'length'.
 *
 * `cfg` should be supplied by the caller (typically `LLMContext` passes the
 * current per-user config). If omitted, falls back to the legacy localStorage
 * lookup — kept for backward compatibility with any non-context callers.
 *
 * If the user configured a max_tokens preference in LLM settings, it's applied
 * unless the caller passes an explicit max_tokens (caller wins).
 */
export async function callLLM(prompt, opts = {}, cfg = null) {
  const effective = cfg || getLLMConfig();
  if (!effective) {
    throw new Error('AI가 설정되지 않았습니다. 우측 상단 AI 버튼에서 LM Studio 연결을 먼저 설정해 주세요.');
  }
  const messages = [
    { role: 'system', content: opts.system || LLM_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
  // Apply user's max_tokens preference unless caller specified.
  const effectiveOpts = { ...opts };
  if (effectiveOpts.max_tokens == null && effective.max_tokens) {
    effectiveOpts.max_tokens = effective.max_tokens;
  }
  return llmRequest(effective.endpoint, effective.model, messages, effectiveOpts);
}
