import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * Reusable AI action bar — adapts to LLM connection status.
 *
 * - Connected (status === 'on'):  shows the direct-call button.
 * - Disconnected (off / err):     hides the call button and shows
 *                                 "프롬프트 복사" + ChatGPT/Claude/Gemini links.
 *
 * Use this everywhere a feature wants to "call AI". When the LLM is offline
 * the user still gets a productive path: copy → paste in external AI.
 */
export default function AIActionBar({
  prompt,
  onCallAI,
  busy = false,
  callLabel = '🤖 AI 호출',
  disabled = false,
  align = 'flex-end', // 'flex-start' | 'flex-end' | 'space-between'
}) {
  const { status } = useLLM();
  const toast = useToast();
  const connected = status === 'on';

  function copyPrompt() {
    if (!prompt) { toast('복사할 프롬프트가 없습니다.'); return; }
    navigator.clipboard?.writeText(prompt).then(
      () => toast('프롬프트가 클립보드에 복사되었습니다. 외부 AI에 붙여넣기 하세요.'),
      () => toast('복사 실패')
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: align }}>
      {connected ? (
        <button className="btn btn-pri" onClick={onCallAI} disabled={busy || disabled}>
          {busy ? '생성 중...' : callLabel}
        </button>
      ) : (
        <>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)', marginRight: 'auto' }}>
            🟡 AI 미연결 — 외부 AI에 프롬프트 붙여넣기
          </span>
          <button className="btn btn-pri btn-sm" onClick={copyPrompt} disabled={!prompt || disabled}>
            📋 프롬프트 복사
          </button>
          <a className="btn btn-ghost btn-sm" href="https://chat.openai.com/" target="_blank" rel="noreferrer">↗ ChatGPT</a>
          <a className="btn btn-ghost btn-sm" href="https://claude.ai/new" target="_blank" rel="noreferrer">↗ Claude</a>
          <a className="btn btn-ghost btn-sm" href="https://gemini.google.com/" target="_blank" rel="noreferrer">↗ Gemini</a>
        </>
      )}
    </div>
  );
}
