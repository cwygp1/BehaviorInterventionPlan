import { ALT_COLOR, BAND_A, BAND_B, GRID, MUTED, REF_COLOR, fmtVal, yMax, labelEvery } from './chartUtil';

// 꺾은선 — 시간·회기 번호 축. null 은 끊김(건너 잇지 않음), 기초선/중재 음영, 목표 기준선, 2시리즈(대체행동 점선).
// props: x[{key,label,sub}], series[{label,values,unit,max}], color, bands, refLine, onPick(i), ariaLabel
export default function LineChart({ x = [], series = [], color = '#555', bands = [], refLine = null, onPick, ariaLabel }) {
  const n = x.length;
  if (!n) return null;
  const max = yMax(series, refLine);
  const unit = series[0]?.unit || '';
  const W = 600; const H = 210; const L = 34; const R = 12; const T = 16; const B = 26;
  const plotW = W - L - R; const plotH = H - T - B;
  const xPix = (i) => L + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const yPix = (v) => T + plotH - ((v || 0) / max) * plotH;
  const half = n === 1 ? plotW / 2 : plotW / (n - 1) / 2;
  const every = labelEvery(n);
  const colors = [color, ALT_COLOR];

  // null 에서 끊긴 선분 묶음
  const segs = (vals) => {
    const out = []; let cur = [];
    vals.forEach((v, i) => { if (v == null) { if (cur.length) out.push(cur); cur = []; } else cur.push([xPix(i), yPix(v)]); });
    if (cur.length) out.push(cur);
    return out;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="uc-svg" role="img" aria-label={ariaLabel}>
      {bands.map((b, i) => (
        <rect key={i} x={xPix(b.from) - half} y={T} width={xPix(b.to) - xPix(b.from) + half * 2} height={plotH} fill={b.phase === 'A' ? BAND_A : BAND_B} />
      ))}
      {bands.map((b, i) => (
        <text key={'t' + i} x={xPix(b.from) - half + 4} y={T + 10} fontSize="9.5" fontWeight="700" fill={b.phase === 'A' ? '#ef476f' : '#12b886'}>{b.phase === 'A' ? '기초선' : '중재'}</text>
      ))}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={yPix(max * f)} y2={yPix(max * f)} stroke={GRID} />
          <text x={L - 4} y={yPix(max * f) + 3} fontSize="9.5" fill={MUTED} textAnchor="end">{fmtVal(Math.round(max * f * 10) / 10, unit)}</text>
        </g>
      ))}
      {refLine != null && (
        <g>
          <line x1={L} x2={W - R} y1={yPix(refLine)} y2={yPix(refLine)} stroke={REF_COLOR} strokeDasharray="5 4" />
          <text x={W - R} y={yPix(refLine) - 4} fontSize="9.5" fill={REF_COLOR} textAnchor="end">기준 {fmtVal(refLine, unit)}</text>
        </g>
      )}
      {series.map((s, si) => (
        <g key={si}>
          {segs(s.values).map((seg, k) => (
            <polyline key={k} points={seg.map(([px, py]) => `${px},${py}`).join(' ')} fill="none" stroke={colors[si]} strokeWidth={si ? 1.8 : 2.2} strokeDasharray={si ? '4 3' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {s.values.map((v, i) => (v == null ? null : (
            <circle key={i} cx={xPix(i)} cy={yPix(v)} r={n > 30 ? 2.2 : 3.4} fill={colors[si]}>
              <title>{`${x[i].label}${x[i].sub ? ' (' + x[i].sub + ')' : ''} · ${s.label}: ${fmtVal(v, s.unit)}`}</title>
            </circle>
          )))}
        </g>
      ))}
      {x.map((it, i) => (
        <g key={it.key} className={onPick ? 'uc-pick' : ''} onClick={onPick ? () => onPick(i) : undefined}>
          <rect x={xPix(i) - half} y={T} width={half * 2} height={plotH} fill="transparent" />
          {i % every === 0 && <text x={xPix(i)} y={H - 9} fontSize="10" fill={MUTED} textAnchor="middle">{it.label}</text>}
        </g>
      ))}
      {series.length > 1 && (
        <g transform={`translate(${L + 4},${H - 2})`}>
          {series.map((s, si) => (
            <g key={si} transform={`translate(${si * 150},0)`}>
              <line x1={0} x2={16} y1={-4} y2={-4} stroke={colors[si]} strokeWidth="2" strokeDasharray={si ? '4 3' : undefined} />
              <text x={20} y={-1} fontSize="9.5" fill={MUTED}>{s.label}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
