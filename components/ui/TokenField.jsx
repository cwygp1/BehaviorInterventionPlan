import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

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
  addPlaceholder = '+ 새 항목 추가',
  editPlaceholder = '',
  editLabel = '✎ 상세 설명 쓰기 (문장으로 편집)', // 0719 피드백: '직접 편집'의 용도를 이름에 드러냄
  allowFreeEdit = true,
}) {
  // EditableChipGroup과 동일한 저장 키 규칙 — 사용자가 추가한 칩 공유.
  const LS = storageKey ? 'qchips:' + storageKey : null;
  const toast = useToast();
  const [userChips, setUserChips] = useState([]);
  const [draft, setDraft] = useState('');
  const [editMode, setEditMode] = useState(false);
  // 0719 피드백: 직접 추가한 칩(키워드)을 수정·삭제할 수 있게.
  const [manage, setManage] = useState(false);
  const [editingChip, setEditingChip] = useState(null);
  const [editDraft, setEditDraft] = useState('');

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
  // 관리 모드 종료(수정 중이던 상태도 정리).
  function exitManage() { setManage(false); setEditingChip(null); setEditDraft(''); }
  // 직접 추가한 칩 삭제 — 팔레트와 "선택된 값" 양쪽에서 제거(0720: ×를 눌러도 값에 남아
  // 추가된 것처럼 보이던 버그 수정). 마지막 항목을 지우면 관리 모드도 자동 종료(갇힘 방지).
  function removeUserChip(t) {
    const next = userChips.filter((c) => c !== t);
    persist(next);
    if (tokenSet.has(t)) commit(tokens.filter((x) => x !== t));
    if (!next.length) exitManage();
  }
  // 직접 추가한 칩 이름 바꾸기 — 선택돼 있으면 값의 토큰도 함께 바꾼다.
  function renameUserChip(oldText, newTextRaw) {
    const newText = String(newTextRaw || '').trim();
    setEditingChip(null); setEditDraft('');
    if (!newText || newText === oldText) return;
    const next = paletteAll.has(newText)
      ? userChips.filter((c) => c !== oldText) // 기존 항목과 중복 → 내 칩만 제거
      : userChips.map((c) => (c === oldText ? newText : c));
    persist(next);
    if (tokenSet.has(oldText)) commit(tokens.map((t) => (t === oldText ? newText : t)));
    if (!next.length) exitManage();
  }

  return (
    <div>
      <div className="qchip-area">
        {palette.map((text) => {
          const on = tokenSet.has(text);
          const custom = !paletteSet.has(text);
          // 관리 모드에서 수정 중인 내 칩 → 인라인 입력
          if (manage && custom && editingChip === text) {
            return (
              <span key={text} className="qchip" style={{ padding: 2, outline: '1px dashed var(--pri)' }}>
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameUserChip(text, editDraft);
                    if (e.key === 'Escape') { setEditingChip(null); setEditDraft(''); }
                  }}
                  onBlur={() => renameUserChip(text, editDraft)}
                  aria-label={`${text} 이름 바꾸기`}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '.82rem', width: 130 }}
                />
              </span>
            );
          }
          return (
            <span
              key={text}
              className={'qchip' + (on ? ' on' : '')}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              title={manage ? (custom ? '누르면 이름을 바꿀 수 있어요' : '기본 항목은 수정할 수 없어요') : undefined}
              onClick={() => {
                if (manage) {
                  if (custom) { setEditingChip(text); setEditDraft(text); }
                  else toast("수정·삭제는 직접 추가한 항목만 가능해요. 선택하려면 '완료'를 먼저 눌러 주세요.");
                  return;
                }
                toggle(text);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (manage) { if (custom) { setEditingChip(text); setEditDraft(text); } else toast("수정·삭제는 직접 추가한 항목만 가능해요. 선택하려면 '완료'를 먼저 눌러 주세요."); } else toggle(text); } }}
              style={manage ? (custom ? { outline: '1px dashed var(--err)' } : { opacity: 0.45 }) : undefined}
            >
              {on && !manage ? '✓ ' : (custom ? '＋ ' : '')}{text}
              {manage && custom && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeUserChip(text); }}
                  title={`${text} 삭제`}
                  aria-label={`${text} 삭제`}
                  style={{ marginLeft: 4, width: 22, height: 22, minWidth: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--err)', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', borderRadius: 4, lineHeight: 1 }}
                >×</button>
              )}
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
        {/* 관리 중이면 내 칩이 0개여도 '완료'를 항상 보여준다(관리 모드 갇힘 방지) */}
        {(userChips.length > 0 || manage) && (
          <span
            className="qchip"
            role="button"
            tabIndex={0}
            onClick={() => { setManage((m) => !m); setEditingChip(null); setEditDraft(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setManage((m) => !m); setEditingChip(null); setEditDraft(''); } }}
            title="직접 추가한 항목을 눌러서 수정하거나 ×로 삭제"
            style={{ borderStyle: 'dashed', color: manage ? 'var(--err)' : 'var(--muted)', fontWeight: manage ? 700 : 400 }}
          >
            {manage ? '✓ 완료' : '✎ 추가 항목 수정·삭제'}
          </span>
        )}
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
            title="선택한 키워드에 더해, 이 학생 맥락의 구체적인 설명을 문장으로 적을 때 사용"
            onClick={() => setEditMode((m) => !m)}
          >
            {editMode ? '▲ 상세 설명 닫기' : editLabel}
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
