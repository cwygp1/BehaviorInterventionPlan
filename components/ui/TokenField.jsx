import { useEffect, useState } from 'react';

/**
 * TokenField — "탭하면 그대로 값이 되는" 입력. (타이핑 최소화 핵심 컴포넌트)
 *
 * 기존 패턴(칩을 눌러 textarea에 append → 교사가 textarea를 다시 정리)을 대체한다.
 * 위쪽 팔레트 칩을 탭하면 그 항목이 값에 들어가고(✓), 다시 탭하면 빠진다.
 * 칩에 없는 고유 내용은 "직접 추가"로 한 번만 적으면 칩으로 저장돼 다음에도 재사용된다.
 * AI 분배·과거 데이터로 채워진 문장 등 팔레트에 없는 토큰은 아래에 ×로 지울 수 있는
 * 알약으로 표시한다. 정말 길게 서술해야 할 때만 "✎ 직접 편집"으로 textarea를 연다.
 *
 * 값은 항상 문자열(sep로 join) — 기존 저장 스키마와 100% 호환(마이그레이션 불필요).
 *
 *   <TokenField value={a} onChange={setA} options={A_CHIPS} storageKey="abc_a"
 *               editPlaceholder="행동 직전 상황" />
 */
export default function TokenField({
  value = '',
  onChange,
  options = [],
  storageKey,
  sep = '\n',
  addPlaceholder = '직접 추가',
  editPlaceholder = '',
  allowFreeEdit = true,
}) {
  // EditableChipGroup과 동일한 저장 키 규칙 — 사용자가 추가한 칩 공유.
  const LS = storageKey ? 'qchips:' + storageKey : null;
  const [userChips, setUserChips] = useState([]);
  const [draft, setDraft] = useState('');
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (!LS) return;
    try { const s = JSON.parse(localStorage.getItem(LS)); setUserChips(Array.isArray(s) ? s : []); }
    catch (_) { setUserChips([]); }
  }, [LS]);

  function persist(next) {
    setUserChips(next);
    if (LS) { try { localStorage.setItem(LS, JSON.stringify(next)); } catch (_) { /* noop */ } }
  }

  const tokens = String(value || '').split(sep).map((s) => s.trim()).filter(Boolean);
  const tokenSet = new Set(tokens);

  const defaultTexts = options.map((o) => (typeof o === 'string' ? o : o.text));
  const paletteSet = new Set(defaultTexts);
  const palette = [...defaultTexts, ...userChips.filter((c) => !paletteSet.has(c))];
  const paletteAll = new Set(palette);
  // 팔레트에 없는 토큰(AI 분배 문장·과거 데이터 등) — 알약으로 따로 표시
  const extraTokens = tokens.filter((t) => !paletteAll.has(t));

  function commit(arr) {
    const uniq = [];
    arr.forEach((t) => { const v = String(t).trim(); if (v && !uniq.includes(v)) uniq.push(v); });
    onChange?.(uniq.join(sep));
  }
  function toggle(text) {
    if (tokenSet.has(text)) commit(tokens.filter((t) => t !== text));
    else commit([...tokens, text]);
  }
  function removeAt(i) { commit(tokens.filter((_, idx) => idx !== i)); }
  function addCustom() {
    const t = draft.trim();
    if (!t) return;
    if (!paletteAll.has(t) && LS) persist([...userChips, t]);
    if (!tokenSet.has(t)) commit([...tokens, t]);
    setDraft('');
  }

  return (
    <div>
      <div className="qchip-area">
        {palette.map((text) => {
          const on = tokenSet.has(text);
          const custom = !paletteSet.has(text);
          return (
            <span
              key={text}
              className={'qchip' + (on ? ' on' : '')}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              onClick={() => toggle(text)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(text); } }}
            >
              {on ? '✓ ' : (custom ? '＋ ' : '')}{text}
            </span>
          );
        })}
        <span className="qchip" style={{ padding: 2, borderStyle: 'dashed' }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } if (e.key === 'Escape') setDraft(''); }}
            onBlur={addCustom}
            placeholder={addPlaceholder}
            aria-label="직접 항목 추가"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '.82rem', width: 110 }}
          />
        </span>
      </div>

      {/* 팔레트에 없는 토큰 — 지울 수 있는 알약 */}
      {extraTokens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '2px 0 4px' }}>
          {extraTokens.map((t) => {
            const i = tokens.indexOf(t);
            return (
              <span key={t} className="qchip on" style={{ cursor: 'default', maxWidth: '100%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  title="제거"
                  aria-label={`${t} 제거`}
                  style={{ marginLeft: 6, width: 20, height: 20, minWidth: 20, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}
                >×</button>
              </span>
            );
          })}
        </div>
      )}

      {allowFreeEdit && (
        <div style={{ marginTop: 2 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 8px', fontSize: '.74rem' }}
            onClick={() => setEditMode((m) => !m)}
          >
            {editMode ? '▲ 직접 편집 닫기' : '✎ 직접 편집'}
          </button>
          {editMode && (
            <textarea
              className="form-textarea"
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder={editPlaceholder}
              style={{ marginTop: 6 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
