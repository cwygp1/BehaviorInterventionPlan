// Effect-size statistics for single-subject design (Phase A baseline vs Phase B intervention).

/**
 * PND — Percentage of Non-overlapping Data.
 * For a problem behavior we expect Phase B to go DOWN; PND counts B-phase points
 * that fall BELOW the lowest Phase A point.
 *
 * If higher = better (e.g., DRA target behavior), pass higherIsBetter=true.
 */
export function pnd(baselineValues, interventionValues, higherIsBetter = false) {
  if (!baselineValues.length || !interventionValues.length) return null;
  const ext = higherIsBetter ? Math.max(...baselineValues) : Math.min(...baselineValues);
  const overlapping = interventionValues.filter((v) =>
    higherIsBetter ? v <= ext : v >= ext
  ).length;
  const nonOverlap = interventionValues.length - overlapping;
  return Math.round((nonOverlap / interventionValues.length) * 100);
}

export function pndInterpretation(pndPct) {
  if (pndPct == null) return { label: '계산 불가', color: '#888' };
  if (pndPct >= 90) return { label: '매우 효과적', color: '#0d7d4e' };
  if (pndPct >= 70) return { label: '효과적', color: '#12b886' };
  if (pndPct >= 50) return { label: '의문스러움', color: '#f59f00' };
  return { label: '비효과적', color: '#ef476f' };
}

/**
 * Tau-U — Mann-Whitney based effect size for two phases.
 * Formula (simplified, no baseline trend correction):
 *   τ = (S − Tieless) / (n_a × n_b)
 * where S = (#pairs B<A) − (#pairs B>A) for problem behavior,
 *       n_a, n_b are sample sizes.
 * Returns value in [-1, 1]. Negative = B lower than A (good for problem).
 */
export function tauU(baselineValues, interventionValues) {
  if (!baselineValues.length || !interventionValues.length) return null;
  let s = 0;
  for (const a of baselineValues) {
    for (const b of interventionValues) {
      if (b < a) s -= 1;
      else if (b > a) s += 1;
    }
  }
  const n = baselineValues.length * interventionValues.length;
  return n === 0 ? null : s / n;
}

export function tauUInterpretation(tau) {
  if (tau == null) return { label: '계산 불가', color: '#888' };
  const abs = Math.abs(tau);
  if (abs < 0.2) return { label: '효과 거의 없음', color: '#888' };
  if (abs < 0.6) return { label: '약함~중간', color: '#f59f00' };
  if (abs < 0.8) return { label: '큼', color: '#12b886' };
  return { label: '매우 큼', color: '#0d7d4e' };
}
