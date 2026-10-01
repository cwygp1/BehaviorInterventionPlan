import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import MarkdownView from '../ui/MarkdownView';
import { toPlainCopyText } from '../../lib/utils/aiText';

/**
 * Shared block for AI prompt builder modals — shows the AI output and the
 * underlying prompt (collapsible), with copy-to-clipboard helpers and links
 * to open the same prompt in external AI services.
 *
 * AI 응답은 **교사가 직접 수정**할 수 있다(요구사항: AI가 쓴 텍스트는 전부 편집 가능).
 * 기본은 미리보기(markdown), "✎ 편집"으로 textarea 전환. 복사/적용은 편집본 기준.
 * 부모가 편집 결과를 받아 저장/인쇄에 쓰려면 `onChange(text)`를 전달한다.
 *
 * Optional `meta` prop = { finish_reason, usage } shows a truncation warning
 * when the response was cut off by max_tokens.
 */
export default function PromptResultBlock({ prompt, output, busy, meta, onChange }) {
  const toast = useToast();
  const [showPrompt, setShowPrompt] = useState(false);
  const [draft, setDraft] = useState(output || '');
  const [editing, setEditing] = useState(false);

  // 새 응답이 오면 편집본을 초기화.
  useEffect(() => { setDraft(output || ''); }, [output]);

  function update(v) { setDraft(v); onChange?.(v); }

  function copy(text, label) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => toast((label || '내용') + '이 클립보드에 복사되었습니다.'),
      () => toast('복사 실패')
    );
  }

  // Heuristic truncation detection: explicit finish_reason='length' OR text
  // doesn't end with sentence terminator / closing markdown.
  const truncatedExplicit = meta?.finish_reason === 'length';
  const truncatedHeuristic = draft && !truncatedExplicit && !/[.!?。…]\s*$|```\s*$|\)\s*$|]\s*$/.test(draft.trim());
  const hasContent = !!(draft || output);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ background: 'var(--pri-soft)', padding: 14, borderRadius: 8, border: '1px solid var(--pri-l)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ color: 'var(--pri)', fontSize: '.9rem' }}>🤖 AI 응답 <span style={{ fontWeight: 400, fontSize: '.72rem', color: 'var(--muted)' }}>· 직접 수정할 수 있어요</span></strong>
          {hasContent && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {meta?.usage?.completion_tokens && (
                <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                  {meta.usage.completion_tokens} 토큰
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)}>{editing ? '👁 미리보기' : '✎ 편집'}</button>
              {/* mds/44 S11: **·# ·| 표 기호를 걷어 한글·나이스에 그대로 붙게 */}
              <button className="btn btn-ghost btn-sm" onClick={() => copy(toPlainCopyText(draft), 'AI 응답')} title="굵게·표 같은 기호를 빼고 글만 복사해요">📋 복사</button>
            </div>
          )}
        </div>
        {busy && !output ? (
          <div style={{ color: 'var(--muted)', fontSize: '.88rem' }}>AI가 응답 생성 중입니다...</div>
        ) : hasContent ? (
          editing ? (
            <textarea
              className="form-textarea"
              value={draft}
              onChange={(e) => update(e.target.value)}
              style={{ minHeight: 240, lineHeight: 1.6, background: 'var(--surface)' }}
            />
          ) : (
            <MarkdownView>{draft}</MarkdownView>
          )
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '.88rem' }}>아직 응답이 없습니다.</div>
        )}
        {truncatedExplicit && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff3d9', border: '1px solid #f3c47b', borderRadius: 6, fontSize: '.82rem', color: '#a76200' }}>
            ⚠ <strong>답이 길어서 끝까지 못 쓰고 잘렸어요.</strong> 다시 눌러 보거나, 요청을 조금 짧게 나눠 보세요.
            계속 잘리면 관리자에게 알려 주세요(AI 설정의 '최대 출력 토큰', 이번 답 {meta.usage?.completion_tokens || '?'}개).
          </div>
        )}
        {truncatedHeuristic && !truncatedExplicit && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff3d9', border: '1px solid #f3c47b', borderRadius: 6, fontSize: '.82rem', color: '#a76200' }}>
            ⚠ 답이 문장 중간에서 끝났어요. 잘렸을 수 있으니 다시 눌러 보거나 요청을 짧게 나눠 보세요.
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
