// 미니 추이 차트(스파크라인) — 대시보드 명부 셀용 초경량 SVG (0824 위젯).
// chart.js 없이 폴리라인만 그린다. 기초선(A)은 회색, 중재(B)는 색으로 구분해
// "중재 후 줄고 있는가"가 셀 하나에서 읽히게 한다.
export default function Sparkline({ series = [], width = 110, height = 30, color = '#e74c3c' }) {
  const pts = (series || []).filter((s) => s && s.f != null);
  if (pts.length < 2) {
    return <span style={{ fontSize: 11, color: 'var(--muted, #9aa3b2)' }}>{pts.length === 1 ? '기록 1건' : '기록 없음'}</span>;
  }
  const vals = pts.map((s) => Number(s.f) || 0);
  const max = Math.max(...vals, 1);
  const pad = 3;
  const x = (i) => pad + (i * (width - pad * 2)) / (pts.length - 1);
  const y = (v) => height - pad - (v / max) * (height - pad * 2);

  // phase가 바뀌는 지점에서 선을 끊어 A(회색)/B(색) 구간을 나눠 그린다.
  const segs = [];
  let cur = { p: pts[0].p || 'A', d: [] };
  pts.forEach((s, i) => {
    const p = s.p || 'A';
    if (p !== cur.p) {
      cur.d.push([x(i), y(vals[i])]); // 경계점을 양쪽 선에 포함해 선이 이어져 보이게
      segs.push(cur);
      cur = { p, d: [] };
    }
    cur.d.push([x(i), y(vals[i])]);
  });
  segs.push(cur);

  const last = pts[pts.length - 1];
  const lastColor = (last.p || 'A') === 'B' ? color : '#98a2b3';

  return (
    <svg width={width} height={height} role="img" aria-label={`최근 ${pts.length}회 행동 추이`} style={{ display: 'block' }}>
      {segs.map((sg, i) => (
        <polyline
          key={i}
          points={sg.d.map(([px, py]) => `${px},${py}`).join(' ')}
          fill="none"
          stroke={sg.p === 'B' ? color : '#98a2b3'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={sg.p === 'B' ? undefined : '3 2'}
        />
      ))}
      <circle cx={x(pts.length - 1)} cy={y(vals[vals.length - 1])} r="2.5" fill={lastColor} />
    </svg>
  );
}
