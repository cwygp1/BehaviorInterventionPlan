// 단일대상설계 고르기 — 설계 목록·단계 탭 계산(순수 함수). mds/47 ①.
//   설계는 bip_data.design('AB'|'ABAB'|'CC'|'ATD'|'MBL')에 저장되고, 기록에는 지금처럼 A/B만 저장된다.
//   단계 탭의 이름·번호·"현재 단계"는 저장된 기록을 날짜순으로 phaseRuns 돌려 유도한다(BIP에 따로 저장하지 않음).
//   그래서 과거 날짜를 끼워 넣어도 어긋나지 않고, 그래프(scedChart) 쪽은 바뀌는 것이 없다.
import { phaseRuns, sortByDate } from './utils/scedChart.js';

export const DESIGNS = [
  { code: 'AB', label: 'AB', paren: '기초선→중재', desc: '중재 전과 후를 비교해요', ready: true },
  { code: 'ABAB', label: 'ABAB', paren: '반전설계', desc: '중재를 뺐다 다시 넣어 효과를 확인해요', ready: true },
  { code: 'CC', label: '기준변경', paren: '기준변경설계', desc: '목표 기준을 단계마다 조금씩 바꿔(줄이거나 늘려) 따라오는지 봐요', ready: false },
  { code: 'ATD', label: '교대중재', paren: '교대중재설계', desc: '교수법 2~3개를 번갈아 써서 무엇이 나은지 봐요', ready: false },
  { code: 'MBL', label: '중다기초선', paren: '행동·상황·사람 간', desc: '행동이나 장소, 사람마다 시차를 두고 중재해 중재한 것만 변하는지 봐요', ready: false },
];

export const DESIGN_CODES = DESIGNS.map((d) => d.code);

export function normalizeDesign(v) {
  const s = String(v || '').toUpperCase();
  return DESIGN_CODES.includes(s) ? s : 'AB';
}
export function designOf(code) {
  return DESIGNS.find((d) => d.code === normalizeDesign(code)) || DESIGNS[0];
}
export function designTitle(code) {
  const d = designOf(code);
  return `${d.label} (${d.paren})`;
}

// 단계 이름 — A/B가 몇 번째인지로 정한다.
//   A1 기초선 · B1 중재 · A2 중재 철회 · B2 중재 재개 · A3 2차 철회 · B3 2차 재개 …
export function stageLabel(phase, nth) {
  if (phase === 'A') return nth <= 1 ? '기초선' : nth === 2 ? '중재 철회' : `${nth - 1}차 철회`;
  return nth <= 1 ? '중재' : nth === 2 ? '중재 재개' : `${nth - 1}차 재개`;
}

// 설계별 탭 수 — AB는 2(그 이상이면 ABAB 제안), ABAB는 최소 4(+ 단계로 더).
export function baseStageCount(design) {
  return normalizeDesign(design) === 'ABAB' ? 4 : 2;
}

/**
 * 단계 탭 목록.
 * @param {string} design  'AB' | 'ABAB' (다른 설계는 ②~④에서 자기 탭을 만든다)
 * @param {Array}  records 기록(정렬 안 돼도 됨)
 * @param {object} [opts]  { extra: 0 }  '+ 단계'로 더한 수
 * @returns {{ tabs: Array<{index, phase, label, short, state}>, current: number, runs: Array }}
 *   state: 'done'(지난 구간) | 'current'(지금 구간) | 'next'(다음에 넘어갈 수 있는 구간) | 'future'(아직 멀어 잠김)
 *   기록이 하나도 없으면 current = 0(기초선부터).
 */
export function stageTabsFor(design, records, opts = {}) {
  const sorted = sortByDate(records || []);
  const runs = phaseRuns(sorted);
  const extra = Math.max(0, Number(opts.extra) || 0);
  // 실제 구간이 있으면 그 단계 순서를 그대로 쓴다(기초선 없이 B로 시작한 기록도 어긋나지 않게).
  const phases = runs.map((r) => r.phase);
  const want = Math.max(baseStageCount(design), runs.length + (normalizeDesign(design) === 'ABAB' ? extra : 0));
  while (phases.length < want) {
    const last = phases[phases.length - 1];
    phases.push(!last ? 'A' : last === 'A' ? 'B' : 'A');
  }
  const seen = { A: 0, B: 0 };
  const current = runs.length ? runs.length - 1 : 0;
  const tabs = phases.map((p, i) => {
    seen[p] += 1;
    const nth = seen[p];
    const state = i < current ? 'done' : i === current ? 'current' : i === current + 1 ? 'next' : 'future';
    return { index: i, phase: p, label: stageLabel(p, nth), short: `${p}${nth}`, state };
  });
  return { tabs, current, runs, sorted };
}

// 어떤 기록(수정 중)이 속한 구간 번호 — 날짜순 위치로 찾는다. 못 찾으면 -1.
export function runIndexOfRecord(runs, sorted, rec) {
  if (!rec) return -1;
  const i = sorted.findIndex((r) => (rec.id != null && r.id === rec.id) || (rec.id == null && r.date === rec.date && r.phase === rec.phase));
  if (i < 0) return -1;
  return runs.findIndex((run) => i >= run.start && i <= run.end);
}

// AB 설계인데 기록이 A→B→A처럼 되돌아갔으면 ABAB 제안.
export function suggestsABAB(design, runs) {
  return normalizeDesign(design) === 'AB' && (runs || []).length > 2;
}

// '현재 설계' 기간 칩 키 — scedChart.filterByRange가 'since:YYYY-MM-DD'를 이해한다.
export function sinceRangeKey(designSince) {
  const d = String(designSince || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `since:${d}` : null;
}
