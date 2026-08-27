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
// 공용 LLM 설정 수정용 비밀번호(클라이언트 게이트). 서버에서도 동일 값으로 검증한다.
export const AI_EDIT_PASSWORD = 'clsrnfkd';
export const LLM_SYSTEM_PROMPT =
  '당신은 특수교육 전문가이자 PBS(긍정적 행동지원) 컨설턴트입니다. ' +
  '답변은 한국어로, 교사가 현장에서 바로 적용 가능한 구체적 형태로 작성합니다. ' +
  '학생 정보는 익명·비식별 형태만 사용한다는 원칙을 항상 지킵니다. ' +
  // 로컬 모델이 "轉換된 정의", "3 회" 같은 표기를 내보내던 문제 교정.
  '표기 규칙: 한자를 쓰지 말고 모두 한글로 씁니다(전문용어의 영문 병기는 허용). ' +
  '숫자와 단위는 붙여 씁니다(예: 2주, 하루 3회). ' +
  '주어진 학생 코드·이름은 철자를 바꾸지 말고 그대로 사용합니다.';

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

/** Fetch the shared (global) config from the server. 로그인만 필요. */
export async function fetchServerLLMConfig() {
  const r = await api('/api/me/llm-config', 'GET');
  return r?.config || null;
}

/** Persist (upsert) the shared config server-side. 비밀번호 필요. */
export async function saveServerLLMConfig(cfg, password) {
  const r = await api('/api/me/llm-config', 'PUT', { ...cfg, password });
  return r?.config || null;
}

/** Reset the shared config server-side. 비밀번호 필요. */
export async function deleteServerLLMConfig(password) {
  await api('/api/me/llm-config', 'DELETE', { password });
}

/**
 * Low-level request to an OpenAI-compatible chat completions endpoint.
 * Returns { content, finish_reason, usage } so callers can detect truncation.
 * Throws on non-2xx or network errors.
 */
/**
 * OpenAI 호환 chat completions 경로로 정규화한다.
 * 사용자가 베이스 URL만 입력해도(예: http://localhost:1234 또는 .../v1) 올바른
 * `/v1/chat/completions` 로 보정해, "POST /" 같은 빈 응답 오류를 방지한다.
 */
export function normalizeChatEndpoint(endpoint) {
  let s = String(endpoint || '').trim();
  if (!s) return s;
  // 쿼리/해시 제거 후 끝 슬래시 정리
  s = s.replace(/[#?].*$/, '').replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(s)) return s;          // 이미 완전한 경로
  if (/\/completions$/i.test(s)) return s;                 // 사용자가 명시한 completions 경로 존중
  if (/\/v\d+$/i.test(s)) return s + '/chat/completions';  // .../v1 → .../v1/chat/completions
  return s + '/v1/chat/completions';                       // 베이스 URL → 표준 경로 부착
}

/**
 * 일부 reasoning 모델은 사고과정을 `<think> ... </think>` 로 본문(content) 안에
 * 그대로 섞어 보낸다. 교사에게 그대로 노출되면 안 되므로 제거한다.
 * 닫는 태그 없이 잘린 경우(길이 제한)도 함께 처리한다.
 */
export function stripThinkTags(text) {
  let s = String(text || '');
  if (!/<\/?think/i.test(s)) return s;
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');   // 정상적으로 닫힌 블록
  s = s.replace(/<think>[\s\S]*$/i, '');              // 닫히지 않고 잘린 블록
  s = s.replace(/^[\s\S]*?<\/think>/i, '');          // 여는 태그 없이 닫힘만 있는 경우
  return s.trim();
}

function buildRequestBody(model, messages, opts) {
  return {
    model: model || 'auto',
    messages,
    temperature: opts.temperature ?? 0.7,
    // Generous default — Qwen / Llama / DeepSeek all comfortably handle 8k+
    // output. Caller can lower it for short tasks (e.g. Dead Man's Test).
    max_tokens: opts.max_tokens ?? 8000,
    // Reasoning(thinking) 모델 끄기. Qwen3.5/3.6 등은 thinking이 켜지면 답을
    // reasoning_content로만 쏟아내 content가 비고 수십 초~수 분이 걸린다.
    // Qwen3.5는 `/no_think` 소프트 스위치를 지원하지 않으므로, 신뢰 가능한
    // 하드 스위치인 chat_template_kwargs.enable_thinking 로 끈다.
    // 이 앱은 항상 직접 답변(content)을 파싱하므로 기본 OFF. 필요 시 opts.thinking=true.
    chat_template_kwargs: { enable_thinking: opts.thinking === true },
  };
}

async function throwHttpError(r) {
  let msg = 'LLM 응답 오류 (' + r.status + ')';
  try {
    const j = await r.json();
    if (j.error?.message) msg = j.error.message;
  } catch (_) {}
  throw new Error(msg);
}

// 비스트리밍 호출(종전 방식) — 스트리밍 실패 시 폴백으로도 쓰인다.
// 호출자가 넘긴 외부 AbortSignal(채팅 중단 버튼 등)을 내부 컨트롤러에 연결한다.
function wireExternalAbort(ctrl, signal) {
  if (!signal) return;
  if (signal.aborted) ctrl.abort();
  else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
}

async function llmRequestPlain(url, model, messages, opts) {
  const ctrl = new AbortController();
  wireExternalAbort(ctrl, opts.signal);
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout ?? 180000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...buildRequestBody(model, messages, opts), stream: false }),
      signal: ctrl.signal,
    });
    if (!r.ok) await throwHttpError(r);
    const data = await r.json();
    const choice = data.choices?.[0];
    return {
      content: stripThinkTags(choice?.message?.content || ''),
      // 일부 reasoning 모델(Qwen3 등)은 답을 reasoning_content로 보낸다 — 폴백용으로 함께 반환.
      reasoning: choice?.message?.reasoning_content || '',
      finish_reason: choice?.finish_reason || null,
      // 서버가 실제 사용한 모델 식별자(사용량 로깅에 사용). 없으면 빈 문자열.
      model: data.model || '',
      usage: data.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// 스트리밍(SSE) 호출 — P1(진행 피드백): 조각이 도착할 때마다 opts.onProgress에
// { chars, elapsedMs }를 알려 "모델이 실제로 생성 중"임을 화면에 보여줄 수 있다.
// 타임아웃은 '총 시간'이 아니라 '무응답 시간' 기준 — 조각이 오는 동안엔 계속 연장되어
// 4~5분짜리 긴 생성도 중간에 끊기지 않고, 서버가 멎으면 timeout 뒤 중단된다.
async function llmRequestStream(url, model, messages, opts) {
  const ctrl = new AbortController();
  wireExternalAbort(ctrl, opts.signal);
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 180000);
  };
  arm();
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildRequestBody(model, messages, opts),
        stream: true,
        // OpenAI 규격: 스트림 마지막 조각에 usage 포함 요청(미지원 서버는 무시).
        stream_options: { include_usage: true },
      }),
      signal: ctrl.signal,
    });
    if (!r.ok || !r.body) await throwHttpError(r);

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let content = '';
    let reasoning = '';
    let finish = null;
    let usage = null;
    let respModel = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm(); // 조각이 도착하는 동안엔 무응답 타이머 연장
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const ch = j.choices?.[0];
          if (ch?.delta?.content) content += ch.delta.content;
          if (ch?.delta?.reasoning_content) reasoning += ch.delta.reasoning_content;
          if (ch?.finish_reason) finish = ch.finish_reason;
          if (j.usage) usage = j.usage;
          if (j.model) respModel = j.model;
        } catch (_) { /* 깨진 조각은 건너뜀 */ }
      }
      try {
        // chars = 보이는 답변만. reasoning(사고 과정)은 답변의 몇 배가 되기도 해
        // 합산하면 숫자가 최종 결과와 안 맞아 보인다 — 따로 전달해 구분 표시한다.
        // content 안에 <think>를 섞는 모델도 있으므로 표시 글자 수는 제거 후 기준.
        const visibleText = stripThinkTags(content);
        // onDelta — 지금까지 받은 '보이는 본문 전체'를 전달(채팅 말풍선 실시간 표시용).
        if (typeof opts.onDelta === 'function') opts.onDelta(visibleText);
        opts.onProgress({
          chars: visibleText.length,
          reasoningChars: reasoning.length + (content.length - visibleText.length),
          elapsedMs: Date.now() - started,
        });
      } catch (_) { /* 진행 콜백 오류가 생성을 막지 않게 */ }
    }
    return {
      content: stripThinkTags(content),
      reasoning,
      finish_reason: finish,
      model: respModel,
      usage,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function llmRequest(endpoint, model, messages, opts = {}) {
  const url = normalizeChatEndpoint(endpoint);
  // onProgress가 있으면 스트리밍으로 진행 상황을 알린다. 스트리밍 자체를 지원하지
  // 않는 서버(시작 전 HTTP 오류)면 비스트리밍으로 1회 폴백 — 진행 표시만 없어질 뿐
  // 생성은 된다. 단, 이미 내용을 받다가 끊긴 경우엔 폴백하지 않는다(같은 4~5분짜리
  // 생성을 처음부터 다시 돌리는 이중 비용 방지 — 오류를 그대로 알리고 재시도는 교사가 결정).
  if (typeof opts.onProgress === 'function') {
    let received = 0;
    const wrappedOpts = {
      ...opts,
      onProgress: (p) => { received = p.chars + (p.reasoningChars || 0); opts.onProgress(p); },
    };
    try {
      return await llmRequestStream(url, model, messages, wrappedOpts);
    } catch (e) {
      if (e?.name === 'AbortError' || received > 0) throw e;
      try {
        return await llmRequestPlain(url, model, messages, opts);
      } catch (_e2) {
        throw e; // 원인 파악엔 첫 오류가 더 유용
      }
    }
  }
  return llmRequestPlain(url, model, messages, opts);
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
/**
 * 2-모델 구성에서 사용할 모델명을 고른다.
 *   tier === 'fast'  → 빠른 모델(model_fast). 없으면 기본 모델로 폴백.
 *   그 외(기본)      → 품질/기본 모델(model). 없으면 model_fast로 폴백.
 * 둘 다 비어 있으면 빈 문자열 → llmRequest가 'auto'로 처리.
 */
export function resolveModel(cfg, tier) {
  if (!cfg) return '';
  if (tier === 'fast') return cfg.model_fast || cfg.model || '';
  return cfg.model || cfg.model_fast || '';
}

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
  // opts.tier ('fast' | 'quality')로 모델 선택. 미지정 시 품질/기본 모델.
  const model = resolveModel(effective, opts.tier);
  return llmRequest(effective.endpoint, model, messages, effectiveOpts);
}

/**
 * 멀티턴 채팅 호출 — 완성된 messages 배열([system, user, assistant, user…])을
 * 그대로 보낸다. AI 전문가 채팅(mds/28 P2)용. onDelta/signal은 opts로 전달.
 */
export async function callLLMChat(messages, opts = {}, cfg = null) {
  const effective = cfg || getLLMConfig();
  if (!effective) {
    throw new Error('AI가 설정되지 않았습니다. 우측 상단 AI 버튼에서 LM Studio 연결을 먼저 설정해 주세요.');
  }
  const effectiveOpts = { ...opts };
  if (effectiveOpts.max_tokens == null && effective.max_tokens) {
    effectiveOpts.max_tokens = effective.max_tokens;
  }
  // 채팅은 상호작용이 잦아 기본을 빠른 모델로.
  const model = resolveModel(effective, opts.tier || 'fast');
  return llmRequest(effective.endpoint, model, messages, effectiveOpts);
}

/**
 * 비전(이미지) 입력 호출. `images`는 data:URL 또는 http(s) URL 배열.
 * OpenAI 호환 vision 포맷(content parts)으로 보낸다 — LM Studio의 비전 모델(Qwen-VL 등)에서 동작.
 * 비전 미지원 모델이면 엔드포인트가 오류를 반환한다.
 */
export async function callLLMVision(prompt, images = [], opts = {}, cfg = null) {
  const effective = cfg || getLLMConfig();
  if (!effective) {
    throw new Error('AI가 설정되지 않았습니다. 우측 상단 AI 버튼에서 LM Studio 연결을 먼저 설정해 주세요.');
  }
  const content = [
    { type: 'text', text: prompt },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
  const messages = [
    { role: 'system', content: opts.system || LLM_SYSTEM_PROMPT },
    { role: 'user', content },
  ];
  const effectiveOpts = { ...opts };
  if (effectiveOpts.max_tokens == null && effective.max_tokens) {
    effectiveOpts.max_tokens = effective.max_tokens;
  }
  // 비전 입력은 멀티모달 모델이 필요하다. 품질 모델(예: Qwen3.6-35B-A3B)은
  // 텍스트 전용일 수 있으므로 기본적으로 빠른(멀티모달) 모델로 보낸다.
  const model = resolveModel(effective, opts.tier || 'fast');
  return llmRequest(effective.endpoint, model, messages, effectiveOpts);
}
