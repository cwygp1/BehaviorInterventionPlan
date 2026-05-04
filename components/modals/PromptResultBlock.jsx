import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

/**
 * Shared block for AI prompt builder modals — shows the AI output and the
 * underlying prompt (collapsible), with copy-to-clipboard helpers and links
 * to open the same prompt in external AI services.
 *
 * Optional `meta` prop = { finish_reason, usage } shows a truncation warning
 * when the response was cut off by max_tokens.
 */
export default function PromptResultBlock({ prompt, output, busy, meta }) {
  const toast = useToast();
  const [showPrompt, setShowPrompt] = useState(false);

  function copy(text, label) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => toast((label || '내용') + '이 클립보드에 복사되었습니다.'),
      () => toast('복사 실패')
    );
  }

  // Heuristic truncation detection: explicit finish_reason='length' OR output
  // doesn't end with sentence terminator / closing markdown.
  const truncatedExplicit = meta?.finish_reason === 'length';
  const truncatedHeuristic = output && !truncatedExplicit && !/[.!?。…]\s*$|```\s*$|\)\s*$|]\s*$/.test(output.trim());

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ background: 'var(--pri-soft)', padding: 14, borderRadius: 8, border: '1px solid var(--pri-l)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ color: 'var(--pri)', fontSize: '.9rem' }}>🤖 AI 응답</strong>
          {output && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {meta?.usage?.completion_tokens && (
                <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                  {meta.usage.completion_tokens} 토큰
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => copy(output, 'AI 응답')}>📋 복사</button>
            </div>
          )}
        </div>
        {busy && !output ? (
          <div style={{ color: 'var(--muted)', fontSize: '.88rem' }}>AI가 응답 생성 중입니다...</div>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '.9rem', color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.7 }}>
            {output || '아직 응답이 없습니다.'}
          </pre>
        )}
        {truncatedExplicit && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff3d9', border: '1px solid #f3c47b', borderRadius: 6, fontSize: '.82rem', color: '#a76200' }}>
            ⚠ <strong>응답이 max_tokens 한도(<code>{meta.usage?.completion_tokens || '?'}</code>)에 도달해 잘렸습니다.</strong>
            우상단 AI 설정에서 "최대 출력 토큰"을 늘려보세요. (LM Studio Context 65535 → 권장 16000~32000)
          </div>
        )}
        {truncatedHeuristic && !truncatedExplicit && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff3d9', border: '1px solid #f3c47b', borderRadius: 6, fontSize: '.82rem', color: '#a76200' }}>
            ⚠ 응답이 문장 중간에 끝났습니다. 잘렸을 수 있어요. 우상단 AI 설정에서 "최대 출력 토큰"을 늘려보세요.
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowPrompt((v) => !v)}
        >
          {showPrompt ? '▲ 프롬프트 숨기기' : '▼ 사용한 프롬프트 보기'}
        </button>
        {prompt && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(prompt, '프롬프트')}>📋 프롬프트 복사</button>
            <a className="btn btn-ghost btn-sm" href="https://chat.openai.com/" target="_blank" rel="noreferrer">↗ ChatGPT</a>
            <a className="btn btn-ghost btn-sm" href="https://claude.ai/new" target="_blank" rel="noreferrer">↗ Claude</a>
            <a className="btn btn-ghost btn-sm" href="https://gemini.google.com/" target="_blank" rel="noreferrer">↗ Gemini</a>
          </>
        )}
      </div>
      {showPrompt && (
        <pre style={{ marginTop: 10, background: 'var(--surface2)', padding: 12, borderRadius: 6, fontSize: '.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', lineHeight: 1.6, maxHeight: 240, overflow: 'auto' }}>
          {prompt}
        </pre>
      )}
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
        ※ AI 결과는 참고용이며, 검토·수정 후 사용하세요. 최종 책임은 교사에게 귀속됩니다.
      </p>
    </div>
  );
}
