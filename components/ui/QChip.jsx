import { useEffect, useState } from 'react';

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
              onClick={() => {
                if (mode === 'set') onChange?.(text);
                else onPick?.(text);
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
  const [userChips, setUserChips] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [manage, setManage] = useState(false);

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
  function removeChip(t) { persist(userChips.filter((c) => c !== t)); }

  function clickChip(text) {
    if (manage) return; // 관리 모드에서는 선택 대신 삭제만
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
          return (
            <span key={opt.text} className={cls} onClick={() => clickChip(opt.text)} style={manage && opt.custom ? { outline: '1px dashed #ef476f' } : undefined}>
              {opt.custom ? '＋ ' : ''}{opt.text}
              {manage && opt.custom && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeChip(opt.text); }}
                  title="삭제"
                  style={{ marginLeft: 6, border: 'none', background: 'transparent', color: '#ef476f', cursor: 'pointer', fontWeight: 700 }}
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
          <span className="qchip" onClick={() => setAdding(true)} style={{ borderStyle: 'dashed', color: 'var(--pri)' }}>＋ 항목 추가</span>
        )}

        {userChips.length > 0 && (
          <span className="qchip" onClick={() => setManage((m) => !m)} style={{ borderStyle: 'dashed', color: manage ? '#ef476f' : 'var(--muted)' }}>
            {manage ? '완료' : '✎ 내 칩 관리'}
          </span>
        )}
      </div>
    </div>
  );
}
