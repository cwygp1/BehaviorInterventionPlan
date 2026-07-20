import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

/**
 * QChip — quick-select chip. Supports two patterns:
 *
 *   <QChipGroup label="시간" mode="set" target={timeVal} onChange={setTimeVal} options={[...]} />
 *      → click selects (single-select); selected chip highlights.
 *
 *   <QChipGroup label="A 선행사건" mode="append" onPick={(text) => append(text)} options={[...]} />
 *      → click appends to the consumer's textarea/input.
 */

export function QChipGroup({ label, options, mode = 'append', target, onChange, onPick }) {
  return (
    <div>
      {label && <div className="qchip-label">{label}</div>}
      <div className="qchip-area">
        {options.map((opt) => {
          const text = typeof opt === 'string' ? opt : opt.text;
          const recent = typeof opt === 'object' && opt.recent;
          const isOn = mode === 'set' && target === text;
          const cls = 'qchip' + (isOn ? ' on' : '') + (recent ? ' qchip-recent' : '');
          return (
            <span
              key={text}
              className={cls}
              role="button"
              tabIndex={0}
              aria-pressed={isOn ? 'true' : undefined}
              onClick={() => {
                if (mode === 'set') onChange?.(text);
                else onPick?.(text);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (mode === 'set') onChange?.(text);
                  else onPick?.(text);
                }
              }}
            >
              {recent ? '★ ' : ''}{text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Standalone helper for textarea/input append from a chip.
 * Pass the current value and setter, returns a callback to wire into onPick.
 */
export function makeAppender(value, setValue, isInput) {
  return (text) => {
    const cur = (value || '').trim();
    const sep = isInput ? ', ' : '\n';
    setValue(cur ? cur + sep + text : text);
  };
}

/**
 * EditableChipGroup — 기본 칩 + 교사가 직접 추가/삭제하는 칩.
 * 추가한 칩은 브라우저(localStorage)에 storageKey 단위로 저장되어 다음에도 유지됩니다.
 *
 *   <EditableChipGroup label="A 선행사건" storageKey="abc_a" defaults={A_CHIPS} onPick={append} />     // mode 'append'
 *   <EditableChipGroup label="시간" storageKey="abc_time" defaults={TIMES} mode="set" target={t} onChange={setT} />
 */
export function EditableChipGroup({ label, storageKey, defaults = [], mode = 'append', target, onChange, onPick }) {
  const LS = 'qchips:' + storageKey;
  const toast = useToast();
  const [userChips, setUserChips] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [manage, setManage] = useState(false);
  // 0719 피드백: 추가한 항목을 수정도 할 수 있게 — 관리 모드에서 칩을 누르면 이름 바꾸기.
  const [editingChip, setEditingChip] = useState(null); // 수정 중인 내 칩 텍스트
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(LS));
      setUserChips(Array.isArray(s) ? s : []);
    } catch (_) { setUserChips([]); }
  }, [LS]);

  function persist(next) {
    setUserChips(next);
    try { localStorage.setItem(LS, JSON.stringify(next)); } catch (_) {}
  }
  const defaultTexts = defaults.map((d) => (typeof d === 'string' ? d : d.text));
  function addChip() {
    const t = draft.trim();
    if (!t) { setAdding(false); return; }
    if (![...defaultTexts, ...userChips].includes(t)) persist([...userChips, t]);
    setDraft(''); setAdding(false);
  }
  // 관리 모드 종료(수정 중이던 상태도 정리).
  function exitManage() { setManage(false); setEditingChip(null); setEditDraft(''); }
  function removeChip(t) {
    const next = userChips.filter((c) => c !== t);
    persist(next);
    // 선택형(set)에서 현재 선택된 칩을 지우면 선택값도 비운다.
    if (mode === 'set' && target === t) onChange?.('');
    // 마지막 항목을 지우면 관리 모드 자동 종료(완료 버튼이 사라져 갇히는 문제 방지).
    if (!next.length) exitManage();
  }
  // 내 칩 이름 바꾸기 (관리 모드에서 칩을 눌러 수정)
  function renameChip(oldText, newTextRaw) {
    const newText = String(newTextRaw || '').trim();
    setEditingChip(null); setEditDraft('');
    if (!newText || newText === oldText) return;
    if ([...defaultTexts, ...userChips].includes(newText)) { removeChip(oldText); return; } // 중복이면 기존 것 삭제만
    persist(userChips.map((c) => (c === oldText ? newText : c)));
    // 선택형(set)에서 현재 선택된 칩을 수정하면 선택값도 따라간다.
    if (mode === 'set' && target === oldText) onChange?.(newText);
  }

  function clickChip(text, custom) {
    if (manage) {
      // 관리 모드: 내 칩을 누르면 수정(이름 바꾸기) 시작. 기본 칩은 안내만.
      if (custom) { setEditingChip(text); setEditDraft(text); }
      else toast("수정·삭제는 직접 추가한 항목만 가능해요. 선택하려면 '완료'를 먼저 눌러 주세요.");
      return;
    }
    if (mode === 'set') onChange?.(text);
    else onPick?.(text);
  }

  const all = [
    ...defaultTexts.map((t) => ({ text: t, custom: false })),
    ...userChips.map((t) => ({ text: t, custom: true })),
  ];

  return (
    <div>
      {label && <div className="qchip-label">{label}</div>}
      <div className="qchip-area">
        {all.map((opt) => {
          const isOn = mode === 'set' && target === opt.text;
          const cls = 'qchip' + (isOn ? ' on' : '') + (opt.custom ? ' qchip-recent' : '');
          // 관리 모드에서 수정 중인 내 칩 → 인라인 입력으로 전환
          if (manage && opt.custom && editingChip === opt.text) {
            return (
              <span key={opt.text} className="qchip" style={{ padding: 2, outline: '1px dashed var(--pri)' }}>
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameChip(opt.text, editDraft);
                    if (e.key === 'Escape') { setEditingChip(null); setEditDraft(''); }
                  }}
                  onBlur={() => renameChip(opt.text, editDraft)}
                  aria-label={`${opt.text} 이름 바꾸기`}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '.82rem', width: 130 }}
                />
              </span>
            );
          }
          return (
            <span
              key={opt.text}
              className={cls}
              role="button"
              tabIndex={0}
              aria-pressed={isOn ? 'true' : undefined}
              title={manage ? (opt.custom ? '누르면 이름을 바꿀 수 있어요' : '기본 항목은 수정할 수 없어요') : undefined}
              onClick={() => clickChip(opt.text, opt.custom)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickChip(opt.text, opt.custom); } }}
              style={manage && opt.custom ? { outline: '1px dashed var(--err)' } : (manage ? { opacity: 0.45 } : undefined)}
            >
              {opt.custom ? '＋ ' : ''}{opt.text}
              {manage && opt.custom && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeChip(opt.text); }}
                  title={`${opt.text} 삭제`}
                  aria-label={`${opt.text} 삭제`}
                  style={{ marginLeft: 4, width: 24, height: 24, minWidth: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--err)', cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem', borderRadius: 4, lineHeight: 1 }}
                >×</button>
              )}
            </span>
          );
        })}

        {adding ? (
          <span className="qchip" style={{ padding: 2 }}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addChip(); if (e.key === 'Escape') { setDraft(''); setAdding(false); } }}
              onBlur={addChip}
              placeholder="새 항목 입력 후 Enter"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '.82rem', width: 130 }}
            />
          </span>
        ) : (
          <span
            className="qchip"
            role="button"
            tabIndex={0}
            onClick={() => setAdding(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAdding(true); } }}
            style={{ borderStyle: 'dashed', color: 'var(--pri)' }}
          >＋ 항목 추가</span>
        )}

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
    </div>
  );
}
