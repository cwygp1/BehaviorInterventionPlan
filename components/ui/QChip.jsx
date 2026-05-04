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
