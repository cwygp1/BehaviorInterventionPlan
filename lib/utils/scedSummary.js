// 설계별 데이터 요약 글 — AI 프롬프트(결과 평가·추세 분석·보고서 의견)와 결과 보고서가 함께 쓴다 (mds/47 ⑤).
//   설계가 AB/ABAB면 빈 문자열(기존 A/B 요약이 그대로 쓰임). 기준변경·교대중재·중다기초선은 설계 논리에 맞는 묶음을 돌려준다.
import { normalizeDesign, designTitle } from '../scedDesigns.js';
import { sortByDate, ccConfig, criterionStats, CC_HIT_LABEL, atdConfig, conditionStats, conditionPairs, mblConfig, mblFilterBehavior, mblPanels, mblTierStats, MBL_DIMENSIONS, METRICS } from './scedChart.js';

export function designOfData(data) {
  return normalizeDesign(data?.bip?.design);
}

// 프롬프트 머리 한 줄 + 설계별 묶음 + 해석 지시. 한국어 마크다운.
export function designSummaryForPrompt(data, metric = 'freq') {
  const design = designOfData(data);
  const sorted = sortByDate(data?.mon || []);
  const cfg = data?.bip?.design_cfg;
  const head = `## 설계: ${designTitle(design)}`;
  if (design === 'CC') {
    const cc = ccConfig(cfg);
    const stats = criterionStats(sorted, cc);
    const rows = stats.map((r, i) => `- 기준${i + 1} = ${r.criterion} (${(sorted[r.start]?.date || '').slice(5)}~${(sorted[r.end]?.date || '').slice(5)}, ${r.sessions}회기): 평균 ${r.mean ?? '-'}, 평균−기준 ${r.diff ?? '-'}, 기준 안 회기 ${r.insidePct ?? '-'}%, 판정 ${CC_HIT_LABEL[r.status]}`).join('\n');
    return `${head}
- 기준 지표 ${METRICS[cc.metric]?.label || cc.metric} · ${cc.direction === 'up' ? '늘리기' : '줄이기'} · 달성 = 연속 ${cc.hitRuns}회기 기준 근처(폭 ${cc.nearPct}%)
${rows || '- (기준 구간 없음)'}
- 해석 지시: 기준을 바꿀 때마다 행동이 기준 근처로 따라왔는지(✓)로 실험통제를 판단. 첫 기준에서 곧장 0으로 떨어진 경우(△ 과잉 달성)는 기준이 행동을 이끈 증거가 아님. PND·Tau-U는 참고치로만.`;
  }
  if (design === 'ATD') {
    const atd = atdConfig(cfg);
    const stats = conditionStats(sorted, atd, metric);
    const pairs = conditionPairs(stats);
    return `${head}
- 조건: ${atd.conditions.map((c) => c.name).join(' · ')}${atd.control ? ' · 무중재(통제)' : ''}${atd.baseline ? ' · 처음 기초선 있음' : ''}
${stats.map((c) => `- ${c.name}: ${c.sessions}회기, 평균 ${c.mean ?? '-'}, 최근 5회 평균 ${c.recent ?? '-'}`).join('\n')}
${pairs.map((p) => `- ${p.a} vs ${p.b}: 평균 차(뒤−앞) ${p.diff ?? '-'}, Tau-U ${p.tau ?? '-'}`).join('\n')}
- 해석 지시: 조건별 경로의 수준 차이와 분리 정도(겹침)로 어느 조건이 나은지 판단. 조건 간 비교에는 PND 대신 평균 차·Tau-U. 회기 수가 조건마다 비슷한지(균형)도 언급.`;
  }
  if (design === 'MBL') {
    const mbl = mblConfig(cfg);
    const filtered = mblFilterBehavior(sorted, mbl);
    const stats = mblTierStats(mblPanels(filtered, mbl, metric), metric);
    return `${head} (${MBL_DIMENSIONS[mbl.dimension]})${mbl.dimension !== 'behavior' && mbl.behavior ? ` · 표적행동 ${mbl.behavior}` : ''}
${stats.map((t) => `- 층 "${t.name}": 중재 시작 ${t.bStart || '아직'}, 기초선 ${t.aCount}회 평균 ${t.aMean ?? '-'} → 중재 ${t.bCount}회 평균 ${t.bMean ?? '-'}, PND ${t.pnd ?? '-'}%, Tau-U ${t.tau ?? '-'}${t.missing ? `, 결측 ${t.missing}회기` : ''}`).join('\n')}
- 해석 지시: 중재를 시작한 층만 변하고 아직 중재 전인 층은 안정적이었는지(실험통제)를 층별로 판단. 층마다 중재 시작 시차가 충분했는지도 언급.`;
  }
  return '';
}

// 결과 보고서용 표 데이터 — 설계별로 머리글과 행. AB/ABAB면 null(기존 A/B 표 그대로).
export function designTableForReport(data, metric = 'freq') {
  const design = designOfData(data);
  const sorted = sortByDate(data?.mon || []);
  const cfg = data?.bip?.design_cfg;
  if (design === 'CC') {
    const cc = ccConfig(cfg);
    const stats = criterionStats(sorted, cc);
    return { title: `기준변경설계 — 구간별 기준 달성 (${METRICS[cc.metric]?.label || cc.metric})`, head: ['구간', '기준', '회기', '평균', '평균−기준', '기준 안 회기', '판정'],
      rows: stats.map((r, i) => [`기준${i + 1} (${(sorted[r.start]?.date || '').slice(5)}~${(sorted[r.end]?.date || '').slice(5)})`, r.criterion, r.sessions, r.mean ?? '—', r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + r.diff, r.insidePct == null ? '—' : r.insidePct + '%', CC_HIT_LABEL[r.status]]) };
  }
  if (design === 'ATD') {
    const atd = atdConfig(cfg);
    const stats = conditionStats(sorted, atd, metric);
    const pairs = conditionPairs(stats);
    return { title: `교대중재설계 — 조건별 결과 (${METRICS[metric]?.label || metric})`, head: ['조건', '회기', '평균', '최근 5회 평균'],
      rows: stats.map((c) => [c.name, c.sessions, c.mean ?? '—', c.recent ?? '—']),
      extra: { head: ['비교', '평균 차(뒤−앞)', 'Tau-U'], rows: pairs.map((p) => [`${p.a} vs ${p.b}`, p.diff == null ? '—' : (p.diff > 0 ? '+' : '') + p.diff, p.tau == null ? '—' : p.tau.toFixed(2)]) } };
  }
  if (design === 'MBL') {
    const mbl = mblConfig(cfg);
    const stats = mblTierStats(mblPanels(mblFilterBehavior(sorted, mbl), mbl, metric), metric);
    return { title: `중다기초선설계(${MBL_DIMENSIONS[mbl.dimension]}) — 층별 결과 (${METRICS[metric]?.label || metric})`, head: ['층', '중재 시작', '기초선', '중재', '평균 A → B', 'PND', 'Tau-U'],
      rows: stats.map((t) => [t.name, t.bStart ? t.bStart.slice(5) : '아직', `${t.aCount}회`, `${t.bCount}회`, `${t.aMean ?? '—'} → ${t.bMean ?? '—'}`, t.pnd == null ? '—' : t.pnd + '%', t.tau == null ? '—' : t.tau.toFixed(2)]) };
  }
  return null;
}
