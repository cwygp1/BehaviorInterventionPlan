import { useRef } from 'react';

// 빠른 기록 창 공용 조각 — 새 디자인 화면 규칙(mds/52 §7): 선택 칩=알약(role=radio), 입력칸은 label 연결, 진한 윤곽선.
//   CSS는 styles/tokens.css의 .kb-new .kb-q-* (모두 .kb-new 아래).

/**
 * 하나만 고르는 알약 묶음(role=radiogroup). 화살표 키로 옮겨 가며 고른다(로빙 tabindex).
 * @param {{label:string, options:Array<string|{value:string,label:string,aria?:string}>, value:string, onChange:(v:string)=>void, allowClear?:boolean}} p
 */
export function PillRadio({ id, label, options, value, onChange, allowClear = false, small = false }) {
  const refs = useRef([]);
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const cur = opts.findIndex((o) => o.value === value);
  const focusAt = (i) => { const el = refs.current[i]; if (el) el.focus(); };
  const onKey = (e, i) => {
    const n = opts.length;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
    if (j < 0) return;
    e.preventDefault();
    onChange(opts[j].value);
    focusAt(j);
  };
  const lbId = id ? id + '-lb' : undefined;
  return (
    <div className="kb-q-field">
      {label && <span className="kb-q-lb" id={lbId}>{label}</span>}
      <div className={'kb-q-grp' + (small ? ' kb-q-grp-sm' : '')} role="radiogroup" aria-labelledby={lbId} aria-label={lbId ? undefined : label}>
        {opts.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.aria || undefined}
              tabIndex={on || (cur < 0 && i === 0) ? 0 : -1}
              className="kb-pill"
              onClick={() => onChange(on && allowClear ? '' : o.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 글 칸(label 연결). */
export function QField({ id, label, hint, children }) {
  return (
    <div className="kb-q-field">
      <label className="kb-q-lb" htmlFor={id}>{label}</label>
      {children}
      {hint ? <div className="kb-q-hint">{hint}</div> : null}
    </div>
  );
}

/** 숫자 − / + 칸. */
export function Stepper({ id, label, value, onChange, min = 0, max = 999, step = 1 }) {
  const num = Number(value) || 0;
  const set = (v) => onChange(String(Math.max(min, Math.min(max, Math.round(v * 100) / 100))));
  return (
    <div className="kb-q-field">
      <label className="kb-q-lb" htmlFor={id}>{label}</label>
      <div className="kb-q-step">
        <button type="button" className="kb-pill" onClick={() => set(num - step)} aria-label={`${label} 줄이기`}>−</button>
        <input id={id} type="number" inputMode="numeric" className="kb-q-input kb-q-num" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="kb-pill" onClick={() => set(num + step)} aria-label={`${label} 늘리기`}>+</button>
      </div>
    </div>
  );
}
