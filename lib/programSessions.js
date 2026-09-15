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

// ── 0915(mds/32): DTT(개별시행) 기록 ──
// 표적(학습 항목)마다 시행 n칸. 칸 표기 + 정반응 · P 촉구 · − 오반응(I는 +와 같게 계산). 빈칸은 미실시(분모 제외).
export const DTT_CODES = SESSION_CODES.filter((c) => c.k !== 'I');
export const DTT_CYCLE = ['+', 'P', '-', ''];
export const nextDttCode = (c) => DTT_CYCLE[(DTT_CYCLE.indexOf(c || '') + 1) % DTT_CYCLE.length];
export const TRIAL_OPTIONS = [5, 10, 20];
export const ITEM_STATUS = [
  { k: 'baseline', label: '기초선' },
  { k: 'teach', label: '지도' },
  { k: 'mastered', label: '습득' },
  { k: 'maintain', label: '유지·일반화' },
];
export const PROMPT_METHODS = [
  { k: 'slp', label: '최소촉진체계' },
  { k: 'ptd', label: '점진적 시간지연(0→2→4초)' },
  { k: 'errorless', label: '무오류(0초 촉구)' },
];
export const ERROR_CORRECTIONS = [
  { k: 'redo', label: '다시-다시 촉구' },
  { k: 'errorless', label: '무오류 학습' },
  { k: 'next', label: '다음 시행으로' },
];

// 표적별 시행 배열 정규화: 길이 trials, I→+, 기초선에서는 P를 쓰지 않는다(− 로).
export function normalizeTrials(rows, itemCount, trials, phase) {
  const out = [];
  for (let r = 0; r < itemCount; r++) {
    const src = Array.isArray(rows) && Array.isArray(rows[r]) ? rows[r] : [];
    const row = [];
    for (let t = 0; t < trials; t++) {
      let c = normCode(src[t]);
      if (c === 'I') c = '+';
      if (c === 'T') c = '';
      if (phase === 'baseline' && c === 'P') c = '-';
      row.push(c);
    }
    out.push(row);
  }
  return out;
}

// 표적별 수치 + 회기 전체 합산. stats[i] = {correct, prompted, scored, pct}.
export function scoreDtt(rows) {
  const stats = (rows || []).map((row) => {
    const s = scoreSession(row);
    return { correct: s.correct, prompted: s.prompted, scored: s.scored, pct: s.pct };
  });
  const sum = stats.reduce((a, s) => ({ correct: a.correct + s.correct, prompted: a.prompted + s.prompted, scored: a.scored + s.scored }), { correct: 0, prompted: 0, scored: 0 });
  return { stats, ...sum, pct: sum.scored ? Math.round((sum.correct / sum.scored) * 1000) / 10 : 0 };
}

export const countText = (correct, scored) => `${scored}회 기회 중 ${correct}회`;

// 학습기준: {type:'rate', pct, runs} 또는 {type:'count', of, min, runs} → 판정용 {pct, runs}.
export function masteryOf(m) {
  const runs = Math.max(1, Number(m?.runs) || 2);
  if (m?.type === 'count') {
    const of = Math.max(1, Number(m.of) || 10);
    const min = Math.max(0, Math.min(of, Number(m.min) || 8));
    return { pct: Math.round((min / of) * 1000) / 10, runs };
  }
  return { pct: Math.max(0, Math.min(100, Number(m?.pct) || 80)), runs };
}
export const masteryText = (m) => (m?.type === 'count'
  ? `${Number(m.of) || 10}회 기회 중 ${Number(m.min) || 8}회, ${Number(m.runs) || 2}회기 연속`
  : `독립 수행 ${Number(m?.pct) || 80}%, ${Number(m?.runs) || 2}회기 연속`);
// IEP 평가 방식에 맞춘 기본 학습기준: 기회 중 성공 횟수(freq) → count, 그 밖 → rate.
export const defaultDttMastery = (critType, trials = 10) => (critType === 'freq'
  ? { type: 'count', of: trials, min: Math.round(trials * 0.8), runs: 2 }
  : { type: 'rate', pct: 80, runs: 2 });

// 한 표적의 회기 기록만 뽑는다(표적 id로 스냅샷 매칭). 결과: [{date, session_no, phase, correct, prompted, scored, pct}]
export function itemHistory(sessions, itemId) {
  const out = [];
  for (const s of sessions || []) {
    const snap = Array.isArray(s.steps_snapshot) ? s.steps_snapshot : [];
    const i = snap.findIndex((x) => x && x.id === itemId);
    if (i < 0) continue;
    const st = (Array.isArray(s.item_stats) ? s.item_stats : [])[i];
    if (!st || !st.scored) continue;
    out.push({ id: s.id, date: s.date, session_no: s.session_no, phase: s.phase, ...st });
  }
  return out;
}

// 지도 회기 3회 연속 50% 미만 → 촉구를 올리거나 표적을 쪼개 보라는 안내.
export const stuckItem = (hist, runs = 3) => {
  const t = (hist || []).filter((h) => h.phase !== 'baseline').slice(-runs);
  return t.length === runs && t.every((h) => Number(h.pct) < 50);
};

// IEP 월별 평가 칸 문구. items: 프로그램 표적 목록, sessions: 이 프로그램 회기(오래된→최근).
export function dttSummary(items, sessions, mastery) {
  const teach = (sessions || []).filter((s) => s.phase !== 'baseline');
  if (!teach.length) return '';
  const mastered = (items || []).filter((x) => x.status === 'mastered' || x.status === 'maintain');
  const last = teach[teach.length - 1];
  const got = mastered.length ? ` · 표적 ${(items || []).length}개 중 ${mastered.length}개 습득(${mastered.map((x) => `'${x.text}'`).join(', ')})` : '';
  if (mastery?.type === 'count') {
    return `지도 ${teach.length}회기 · 최근 회기 ${countText(last.correct_count, last.scored_count)} 성공${got}`;
  }
  return `지도 ${teach.length}회기 · 최근 독립 수행 비율 ${teach.slice(-3).map((s) => `${Math.round(Number(s.pct))}%`).join('→')}${got}`;
}
