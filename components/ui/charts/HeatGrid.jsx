import { fmtVal, alpha } from './chartUtil';

// 격자(히트맵) — 세로=학생, 가로=X. 셀 농도 5단계(그 차트 안 최대값 대비), 숫자 표시, 빈 셀은 점선 테두리.
// props: x[{key,label}], rows[{key,label}], cells[row][col], unit, max, color, higherIsBetter, onPickRow(rowIdx)
export default function HeatGrid({ x = [], rows = [], cells = [], unit = '', max = null, color = '#555', higherIsBetter = false, onPickRow, ariaLabel }) {
  if (!x.length || !rows.length) return null;
  let m = max || 0;
  if (!max) cells.forEach((r) => r.forEach((v) => { if (v != null && v > m) m = v; }));
  if (m <= 0) m = 1;
  const level = (v) => { const f = Math.min(1, v / m); const step = Math.ceil(f * 5) / 5; return higherIsBetter ? 0.08 + step * 0.72 : 0.08 + step * 0.72; };
  const cellH = Math.min(30, Math.max(20, 220 / rows.length));
  return (
    <div className="uc-grid" role="img" aria-label={ariaLabel} style={{ gridTemplateColumns: `72px repeat(${x.length}, minmax(0, 1fr))` }}>
      <div className="uc-grid-corner" />
      {x.map((it) => <div key={it.key} className="uc-grid-col">{it.label}</div>)}
      {rows.map((r, ri) => (
        <Row key={r.key} label={r.label} onClick={onPickRow ? () => onPickRow(ri) : undefined} height={cellH}>
          {x.map((it, ci) => {
            const v = cells[ri]?.[ci];
            if (v == null) return <div key={it.key} className="uc-cell empty" style={{ height: cellH }} title={`${r.label} · ${it.label}: 기록 없음`} />;
            const bg = alpha(color, level(v));
            const dark = level(v) > 0.5;
            return <div key={it.key} className="uc-cell" style={{ height: cellH, background: bg, color: dark ? '#fff' : 'var(--text)' }} title={`${r.label} · ${it.label}: ${fmtVal(v, unit)}`}>{fmtVal(v, unit)}</div>;
          })}
        </Row>
      ))}
    </div>
  );
}

function Row({ label, onClick, height, children }) {
  return (
    <>
      <div className={'uc-grid-row' + (onClick ? ' uc-pick' : '')} style={{ height }} onClick={onClick} role={onClick ? 'button' : undefined}>{label}</div>
      {children}
    </>
  );
}
