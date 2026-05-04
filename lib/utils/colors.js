// Deterministic color per student code — stable across renders.
const PALETTE = ['#4f6bed', '#ef476f', '#f59f00', '#12b886', '#1098ad', '#e8590c', '#9c36b5', '#0d7d4e', '#7048e8', '#fa5252'];
export function stuColor(code) {
  if (!code) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
