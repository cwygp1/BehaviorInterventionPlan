import { ALT_COLOR, BAND_A, BAND_B, GRID, MUTED, fmtVal, yMax, labelEvery, alpha } from './chartUtil';

// 막대 — 세로(시간·요일·범주 ≤8) / 가로(학생·범주 많음) 자동. 2시리즈면 짝 막대. SVG viewBox 고정, 고정 높이 상자 안에 맞춘다.
// props: x[{key,label}], series[{label,values,unit,max}], color, bands[{from,to,phase}], horizontal, onPick(i), ariaLabel
export default function BarChart({ x = [], series = [], color = '#555', bands = [], horizontal = false, onPick, ariaLabel }) {
  const n = x.length;
  if (!n) return null;
  const max = yMax(series);
  const unit = series[0]?.unit || '';
  const colors = [color, ALT_COLOR];

  if (horizontal) {
    const W = 600; const L = 96; const R = 44; const rowH = Math.min(26, Math.max(14, 230 / n));
    const H = n * rowH + 8;
    const barH = Math.max(5, (rowH - 6) / series.length);
    const xw = (v) => ((v || 0) / max) * (W - L - R);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="uc-svg" role="img" aria-label={ariaLabel}>
        {x.map((it, i) => (
          <g key={it.key} transform={`translate(0,${i * rowH + 4})`} className={onPick ? 'uc-pick' : ''} onClick={onPick ? () => onPick(i) : undefined}>
            <text x={L - 6} y={rowH / 2 + 1} fontSize="11" fill={MUTED} textAnchor="end" dominantBaseline="middle">{it.label}</text>
            {series.map((s, si) => {
              const v = s.values[i];
              if (v == null) return <line key={si} x1={L} x2={L + 6} y1={2 + si * barH + barH / 2} y2={2 + si * barH + barH / 2} stroke={GRID} strokeDasharray="2 2" />;
              return (
                <g key={si}>
                  <rect x={L} y={2 + si * barH} width={Math.max(2, xw(v))} height={barH - 1} rx="3" fill={si ? alpha(colors[si], 0.75) : colors[si]}>
                    <title>{`${it.label} · ${s.label}: ${fmtVal(v, s.unit)}`}</title>
                  </rect>
                  <text x={L + xw(v) + 4} y={2 + si * barH + barH / 2} fontSize="10" fontWeight="700" fill={MUTED} dominantBaseline="middle">{fmtVal(v, s.unit)}</text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    );
  }

  const W = 600; const H = 210; const L = 34; const R = 8; const T = 16; const B = 26;
  const plotW = W - L - R; const plotH = H - T - B;
  const slot = plotW / n;
  const groupW = Math.min(slot * 0.72, 44);
  const barW = groupW / series.length;
  const yPix = (v) => T + plotH - ((v || 0) / max) * plotH;
  const every = labelEvery(n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="uc-svg" role="img" aria-label={ariaLabel}>
      {bands.map((b, i) => (
        <rect key={i} x={L + b.from * slot} y={T} width={(b.to - b.from + 1) * slot} height={plotH} fill={b.phase === 'A' ? BAND_A : BAND_B} />
      ))}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={yPix(max * f)} y2={yPix(max * f)} stroke={GRID} />
          <text x={L - 4} y={yPix(max * f) + 3} fontSize="9.5" fill={MUTED} textAnchor="end">{fmtVal(Math.round(max * f * 10) / 10, unit)}</text>
        </g>
      ))}
      {x.map((it, i) => {
        const gx = L + i * slot + (slot - groupW) / 2;
        return (
          <g key={it.key} className={onPick ? 'uc-pick' : ''} onClick={onPick ? () => onPick(i) : undefined}>
            <rect x={L + i * slot} y={T} width={slot} height={plotH} fill="transparent" />
            {series.map((s, si) => {
              const v = s.values[i];
              const bx = gx + si * barW;
              if (v == null) return <line key={si} x1={bx} x2={bx + barW - 2} y1={yPix(0) - 1} y2={yPix(0) - 1} stroke={GRID} strokeWidth="2" />;
              const top = yPix(v);
              return (
                <g key={si}>
                  <rect x={bx} y={Math.min(top, yPix(0) - 2)} width={barW - 2} height={Math.max(2, yPix(0) - top)} rx="3" fill={si ? alpha(colors[si], 0.75) : colors[si]}>
                    <title>{`${it.label} · ${s.label}: ${fmtVal(v, s.unit)}`}</title>
                  </rect>
                  {n <= 16 && <text x={bx + (barW - 2) / 2} y={top - 3} fontSize="9.5" fontWeight="700" fill={MUTED} textAnchor="middle">{fmtVal(v, s.unit)}</text>}
                </g>
              );
            })}
            {i % every === 0 && <text x={L + i * slot + slot / 2} y={H - 9} fontSize="10" fill={MUTED} textAnchor="middle">{it.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}
