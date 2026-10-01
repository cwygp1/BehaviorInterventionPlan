// 단일대상설계(SCED) 그래프 계산 — 결과 평가 '행동 변화 추이' 차트의 순수 함수 모음 (1001).
// 근거: ABA 그래프 관례(단계 경계를 넘어 선을 잇지 않음, 단계 변경선+단계 이름, Y축 0 시작,
//       직선 데이터 경로, 단계 안에서만 그리는 평균 수준선) + 현장 엑셀(관찰 시간으로 나눈 시간당 발생률,
//       날짜별 메모를 그래프 위에 표시). 화면 코드(EvalPage)는 이 함수의 결과를 그리기만 한다.

// 지표 정의 — key: 기록 필드, label: 축 이름, higherIsBetter: 올라가야 개선인가.
export const METRICS = {
  freq: { label: '발생 빈도 (회)', higherIsBetter: false },
  rate: { label: '시간당 발생률 (회/시간)', higherIsBetter: false },
  dur: { label: '지속 시간 (분)', higherIsBetter: false },
  int: { label: '강도 (1~5)', higherIsBetter: false },
  alt_freq: { label: '대체행동 빈도 (회)', higherIsBetter: true },
  dbr: { label: '일일 행동 평정 DBR (0~10)', higherIsBetter: true },
};

// 짧은 칩 이름(화면 지표 고르기).
export const METRIC_CHIPS = [
  ['freq', '빈도'], ['rate', '시간당 발생률'], ['dur', '지속'], ['int', '강도'], ['alt_freq', '대체행동'], ['dbr', '일일 행동 평정(DBR)'],
];

const num = (v) => (v == null || v === '' ? null : Number(v));

// 기록 1건의 지표 값. 시간당 발생률은 관찰 시간(obs_hours)이 있을 때만 — 없으면 null(점 없음).
export function metricValue(r, metric) {
  if (!r) return null;
  if (metric === 'rate') {
    const h = num(r.obs_hours);
    const f = num(r.freq);
    if (!h || h <= 0 || f == null || Number.isNaN(f)) return null;
    return Math.round((f / h) * 100) / 100;
  }
  const v = num(r[metric]);
  return v == null || Number.isNaN(v) ? null : v;
}

// 이 학생 기록으로 그릴 수 있는 지표 목록 — 시간당 발생률은 관찰 시간이 1건이라도 있어야 보인다.
export function availableMetrics(records) {
  const hasHours = (records || []).some((r) => (num(r.obs_hours) || 0) > 0);
  return METRIC_CHIPS.filter(([k]) => k !== 'rate' || hasHours);
}

// 날짜 오름차순 정렬(같은 날은 작성 순).
export function sortByDate(records) {
  return [...(records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.id || '').localeCompare(String(b.id || '')));
}

// 연속된 같은 단계(phase)를 하나의 구간(run)으로 묶는다.
//   A A A B B A A B → [A1, B1, A2, B2]  (반전설계·ABAB가 자동으로 그려진다)
//   라벨: 같은 단계가 한 번뿐이면 '기초선(A)'/'중재(B)', 두 번 이상이면 'A1'·'A2'처럼 번호를 붙인다.
export function phaseRuns(sorted) {
  const runs = [];
  (sorted || []).forEach((r, i) => {
    const p = (r.phase || 'A') === 'A' ? 'A' : 'B';
    const last = runs[runs.length - 1];
    if (last && last.phase === p) last.end = i;
    else runs.push({ phase: p, start: i, end: i });
  });
  const countA = runs.filter((x) => x.phase === 'A').length;
  const countB = runs.filter((x) => x.phase === 'B').length;
  let nA = 0; let nB = 0;
  return runs.map((run) => {
    const multi = run.phase === 'A' ? countA > 1 : countB > 1;
    const n = run.phase === 'A' ? ++nA : ++nB;
    const base = run.phase === 'A' ? '기초선' : '중재';
    return { ...run, label: multi ? `${base} ${run.phase}${n}` : `${base}(${run.phase})` };
  });
}

// 구간별 평균(수준선) — 값이 없는 점은 뺀다. 값이 하나도 없으면 null.
export function runMean(sorted, run, metric) {
  const vals = [];
  for (let i = run.start; i <= run.end; i++) {
    const v = metricValue(sorted[i], metric);
    if (v != null) vals.push(v);
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// 단계별 데이터 배열 — 다른 단계 자리는 null로 비워 chart.js가 선을 끊게 한다(spanGaps:false).
export function phaseSeries(sorted, metric) {
  const a = sorted.map((r) => ((r.phase || 'A') === 'A' ? metricValue(r, metric) : null));
  const b = sorted.map((r) => ((r.phase || 'A') === 'A' ? null : metricValue(r, metric)));
  return { a, b };
}

// 메모(배경사건·특이사항)가 있는 점 — 그래프 위에 짧게 표시하고 전체는 툴팁·아래 목록에.
export function noteMarks(sorted, maxLen = 6) {
  const out = [];
  (sorted || []).forEach((r, i) => {
    const t = String(r.note || '').trim();
    if (!t) return;
    out.push({ index: i, date: r.date || '', note: t, short: t.length > maxLen ? t.slice(0, maxLen) + '…' : t });
  });
  return out;
}

// 관찰 기간(observation_periods) 구분선 — 각 기간 시작일 이후 첫 기록의 위치.
//   첫 기록 앞(그래프 왼쪽 끝)에 오는 기간은 선을 긋지 않는다(이미 시작 상태).
export function periodMarks(sorted, periods) {
  const out = [];
  if (!sorted?.length || !periods?.length) return out;
  const TIER_SHORT = { baseline: '기초선', tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' };
  [...periods]
    .filter((p) => p && p.start_date)
    .sort((x, y) => String(x.start_date).localeCompare(String(y.start_date)))
    .forEach((p) => {
      const idx = sorted.findIndex((r) => (r.date || '') >= String(p.start_date).slice(0, 10));
      if (idx <= 0) return;
      if (out.some((m) => m.index === idx)) return;
      out.push({ index: idx, label: TIER_SHORT[p.tier] || p.tier || '', note: p.note || '' });
    });
  return out;
}

// 차트 머리말 — 엑셀 서식의 "(학생) OO행동 그래프 (기간)"에 해당.
export function chartHeader(sorted) {
  if (!sorted?.length) return { behaviors: [], from: '', to: '', count: 0 };
  const behaviors = [...new Set(sorted.map((r) => (r.beh || '').trim()).filter(Boolean))];
  return { behaviors, from: sorted[0].date || '', to: sorted[sorted.length - 1].date || '', count: sorted.length };
}

// ───────────────────────────────────────────────────────────────────────────
// 1001 2차 — 교사 엑셀(3개합산그래프.xlsx·연수 서식)에서 더 가져온 것:
//   행동별 보기/합산, 학기 구분선, 기간 고르기(전체·1학기·2학기), 목표선(CCL 40 가로선).

// 학기 키 — 3~8월 1학기, 9~2월 2학기(연도는 학년도 기준: 1·2월은 전년도 2학기).
export function semesterKey(dateStr) {
  const s = String(dateStr || '');
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  if (!y || !m) return '';
  if (m >= 3 && m <= 8) return `${y}-1`;
  return m >= 9 ? `${y}-2` : `${y - 1}-2`;
}
export function semesterLabel(key) {
  const [y, n] = String(key || '').split('-');
  return y && n ? `${y}학년도 ${n}학기` : '';
}

// 기간 고르기 선택지 — 데이터에 있는 학기 + 전체(+ 최근 4주).
export const RANGE_ALL = 'all';
export function rangeOptions(sorted) {
  const keys = [...new Set((sorted || []).map((r) => semesterKey(r.date)).filter(Boolean))].sort();
  const out = [[RANGE_ALL, '전체']];
  keys.forEach((k) => out.push([k, semesterLabel(k).replace(/^\d{4}학년도 /, '') + (keys.length > 2 ? `(${k.slice(0, 4)})` : '')]));
  if ((sorted || []).length > 20) out.push(['recent28', '최근 4주']);
  return out;
}
export function filterByRange(sorted, range) {
  if (!range || range === RANGE_ALL) return sorted;
  if (range === 'recent28') {
    const last = sorted[sorted.length - 1]?.date;
    if (!last) return sorted;
    const d = new Date(last); d.setDate(d.getDate() - 28);
    const from = d.toISOString().slice(0, 10);
    return sorted.filter((r) => (r.date || '') >= from);
  }
  return sorted.filter((r) => semesterKey(r.date) === range);
}

// 학기 구분선 — 학기가 바뀌는 첫 기록 자리(전체 보기에서만 의미 있음).
export function semesterMarks(sorted) {
  const out = [];
  let prev = '';
  (sorted || []).forEach((r, i) => {
    const k = semesterKey(r.date);
    if (!k) return;
    if (prev && k !== prev) out.push({ index: i, label: semesterLabel(k).replace(/^\d{4}학년도 /, '') + ' 시작' });
    prev = k;
  });
  return out;
}

// 행동 고르기 — 기록에 있는 행동 이름 + 합산(2개 이상일 때만).
export const BEH_ALL = '__all__';
export function behaviorOptions(records) {
  const names = [...new Set((records || []).map((r) => (r.beh || '').trim()).filter(Boolean))];
  if (names.length <= 1) return [];
  return [[BEH_ALL, `합산 (${names.length}개 행동)`], ...names.map((n) => [n, n])];
}

// 합산 — 같은 날짜 기록을 하나로: 빈도·지속·대체행동 빈도는 합, 강도는 최대, DBR·관찰 시간은 평균/최대, 메모는 이어 붙임.
//   엑셀 '3개합산그래프'(행동 3가지 횟수를 하루 단위로 더한 그래프)에 해당. 단계는 그날 첫 기록의 단계.
export function mergeByDate(sorted) {
  const map = new Map();
  (sorted || []).forEach((r) => {
    const d = r.date || '';
    const cur = map.get(d);
    if (!cur) {
      map.set(d, {
        ...r, beh: (r.beh || '').trim(), freq: Number(r.freq) || 0, dur: Number(r.dur) || 0, alt_freq: Number(r.alt_freq) || 0,
        int: Number(r.int) || 0, dbr: r.dbr == null || r.dbr === '' ? null : Number(r.dbr), _dbrN: r.dbr == null || r.dbr === '' ? 0 : 1,
        obs_hours: r.obs_hours == null || r.obs_hours === '' ? null : Number(r.obs_hours),
        note: String(r.note || '').trim(), _n: 1,
      });
      return;
    }
    cur.freq += Number(r.freq) || 0;
    cur.dur += Number(r.dur) || 0;
    cur.alt_freq += Number(r.alt_freq) || 0;
    cur.int = Math.max(cur.int, Number(r.int) || 0);
    if (r.dbr != null && r.dbr !== '') { cur.dbr = ((cur.dbr || 0) * cur._dbrN + Number(r.dbr)) / (cur._dbrN + 1); cur._dbrN += 1; }
    const h = r.obs_hours == null || r.obs_hours === '' ? null : Number(r.obs_hours);
    if (h != null) cur.obs_hours = cur.obs_hours == null ? h : Math.max(cur.obs_hours, h);
    const n = String(r.note || '').trim();
    if (n && !cur.note.includes(n)) cur.note = cur.note ? `${cur.note} / ${n}` : n;
    const b = (r.beh || '').trim();
    if (b && !cur.beh.split(' + ').includes(b)) cur.beh = cur.beh ? `${cur.beh} + ${b}` : b;
    cur._n += 1;
  });
  return [...map.values()].map(({ _dbrN, _n, ...rest }) => ({ ...rest, dbr: rest.dbr == null ? null : Math.round(rest.dbr * 10) / 10 }));
}
export function filterByBehavior(sorted, beh) {
  if (!beh || beh === BEH_ALL) return mergeByDate(sorted);
  return sorted.filter((r) => (r.beh || '').trim() === beh);
}

// 목표선(기준선) 값 — 숫자만, 0 이상. 빈 값은 null.
export function parseGoalLine(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
