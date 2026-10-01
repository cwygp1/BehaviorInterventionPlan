// 사용자 차트 부품 공용 — 값 표기·축 범위·색 (1001, mds/45 §5-1). chart.js 안 씀(gridstack 자동 높이와 충돌).
export const ALT_COLOR = '#4f6bed';          // 대체행동 보조선
export const BAND_A = 'rgba(239,71,111,.07)'; // 기초선(A) 음영 — EvalPage 와 동일 계열
export const BAND_B = 'rgba(18,184,134,.07)'; // 중재(B) 음영
export const REF_COLOR = '#15803d';           // 목표 기준선
export const MUTED = '#6b7280';
export const GRID = '#e5e7eb';

export const fmtVal = (v, unit) => {
  if (v == null) return '';
  const n = Number(v);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit === '%' ? `${s}%` : s;
};

/** 세로축 최대 — 고정 max 가 있으면 그것, 없으면 값 최대의 1.15배(최소 1·보기 좋은 수로). */
export function yMax(series, refLine) {
  const fixed = series.find((s) => s.max)?.max;
  if (fixed) return fixed;
  let m = 0;
  series.forEach((s) => s.values.forEach((v) => { if (v != null && v > m) m = v; }));
  if (refLine != null && refLine > m) m = refLine;
  if (m <= 0) return 1;
  const raw = m * 1.15;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].find((k) => k * pow >= raw) || 10;
  return nice * pow;
}

/** 가로 라벨 간격 — 12개 넘으면 띄워서 쓴다. */
export const labelEvery = (n) => Math.max(1, Math.ceil(n / 12));

/** 색 알파 — '#rrggbb' + 0~1 */
export function alpha(hex, a) {
  const h = String(hex || '#999').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(v.slice(0, 2), 16); const g = parseInt(v.slice(2, 4), 16); const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
