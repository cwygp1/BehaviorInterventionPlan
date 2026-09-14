// 0915(mds/31 · 갑 결정): 교수 프로그램 회기 기록(과제분석 단계 × 회기) 계산 규칙 — 서버·화면 공용.
// 기본 표기(갑): + 정반응 · − 오반응 · P 촉구 · I 독립. 보조: T 교사 수행(아직 가르치지 않는 단계, 채점 제외) · 빈칸 미실시.
// 정반응률 = (+ 또는 I) ÷ 채점 단계 수. 촉구(P)를 받아 수행한 단계는 정반응에 넣지 않는다.

export const SESSION_CODES = [
  { k: '+', label: '정반응', color: '#15803d', bg: '#dcfce7' },
  { k: 'I', label: '독립', color: '#1d4ed8', bg: '#dbeafe' },
  { k: 'P', label: '촉구', color: '#b45309', bg: '#fef3c7' },
  { k: '-', label: '오반응', color: '#b91c1c', bg: '#fee2e2' },
];
export const AUX_CODES = [
  { k: 'T', label: '교사 수행', color: '#6b7280', bg: '#f3f4f6' },
];
const ALL = [...SESSION_CODES, ...AUX_CODES];
export const codeMeta = (k) => ALL.find((c) => c.k === k) || null;
export const codeText = (k) => (k === '-' ? '−' : k || '');

export const PHASES = [
  { k: 'baseline', label: '기초선' },
  { k: 'teach', label: '지도' },
  { k: 'maintain', label: '유지·일반화' },
];

const VALID = new Set(['+', '-', 'P', 'I', 'T', '']);
export const normCode = (c) => {
  const s = String(c ?? '').trim().toUpperCase().replace('−', '-');
  return VALID.has(s) ? s : '';
};

// 전진형: 1~목표 단계만 채점(뒤는 교사 수행) · 후진형: 목표~끝만 채점(앞은 교사 수행) · 전과제형: 전부 채점.
// targetStep은 1부터. 비어 있으면 전 단계 채점.
export function isScoredStep(i, n, chainType, targetStep) {
  const t = Number(targetStep) || 0;
  if (!t || chainType === 'total') return true;
  if (chainType === 'backward') return i >= Math.max(0, n - t);
  return i < t; // forward
}

// 채점 범위 밖 단계는 T로 강제, 기초선에서는 촉구(P)를 쓰지 않는다(5초 규칙 — 가르치지 않고 현재 수준만 확인).
export function normalizeCodes(codes, n, { chainType, targetStep, phase } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let c = normCode(Array.isArray(codes) ? codes[i] : '');
    if (!isScoredStep(i, n, chainType, targetStep)) c = 'T';
    else if (c === 'T') c = '';
    if (phase === 'baseline' && c === 'P') c = '-';
    out.push(c);
  }
  return out;
}

export function scoreSession(codes) {
  let correct = 0, indep = 0, prompted = 0, scored = 0;
  for (const c of codes || []) {
    if (c === '+' || c === 'I') { correct++; scored++; if (c === 'I') indep++; }
    else if (c === 'P') { prompted++; scored++; }
    else if (c === '-') scored++;
  }
  const pct = scored ? Math.round((correct / scored) * 1000) / 10 : 0;
  return { correct, indep, prompted, scored, pct };
}

// 표준 기준(홍준표 부록): 2회기 연속 80% · 전과제형 3회기 연속 100%.
export const defaultMastery = (chainType) => (chainType === 'total' ? { pct: 100, runs: 3 } : { pct: 80, runs: 2 });

// sessions: 오래된 → 최근 순. 기초선 회기는 판정에서 뺀다.
export function masteryReached(sessions, { pct, runs }) {
  const teach = (sessions || []).filter((s) => s.phase !== 'baseline');
  if (teach.length < runs) return false;
  return teach.slice(-runs).every((s) => Number(s.pct) >= pct);
}

// 최근 3회기(기초선 제외) 연속 정반응(+·I)인 인접 단계 쌍 → 합치기 제안. 단계 수가 바뀐 회기가 섞이면 제안하지 않는다.
export function mergeCandidates(sessions, n, runs = 3) {
  const teach = (sessions || []).filter((s) => s.phase !== 'baseline').slice(-runs);
  if (teach.length < runs || n < 2) return [];
  if (teach.some((s) => !Array.isArray(s.codes) || s.codes.length !== n)) return [];
  const ok = (i) => teach.every((s) => s.codes[i] === '+' || s.codes[i] === 'I');
  const pairs = [];
  for (let i = 0; i < n - 1; i++) {
    if (ok(i) && ok(i + 1) && !pairs.some(([, b]) => b === i)) pairs.push([i, i + 1]);
  }
  return pairs;
}

// 기초선 회기가 3회 이상 쌓였고 아직 지도 회기가 없으면 지도 시작 권장(결손행동은 기초선을 오래 볼 필요 없음).
export const baselineLongEnough = (sessions) => {
  const s = sessions || [];
  return s.length >= 3 && s.every((x) => x.phase === 'baseline');
};

// IEP 월별 평가 칸에 옮겨 쓸 요약 문장.
export function sessionSummary(sessions) {
  const s = (sessions || []).filter((x) => x.phase !== 'baseline');
  if (!s.length) return '';
  const last = s.slice(-3).map((x) => `${Math.round(Number(x.pct))}%`).join('→');
  const lastOne = s[s.length - 1];
  const pr = lastOne.scored_count ? ` · 최근 회기 촉구 ${lastOne.prompted_count}단계` : '';
  return `지도 회기 ${s.length}회 · 최근 정반응률 ${last}${pr}`;
}
