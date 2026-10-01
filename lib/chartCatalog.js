// 사용자 선택 차트 위젯 — 소스·축·측정·규칙의 단일 출처 (1001, mds/45 §2).
//
// 교사가 대시보드(Tier 2·3·IEP)에서 "기록 종류 → 가로축 → 세로축 → 모양"을 골라 차트 위젯을 만든다.
// 이 파일은 프런트(선택 상자·제목·유효성)와 서버(/api/chart-data 의 SQL 조각 선택, dash-layout 저장 검증)가
// 함께 import 한다. 그래서 React·SQL 문자열은 여기 두지 않는다 — SQL 조각은 lib/chartSql.js(서버 전용).
//
// 설정 객체(저장 형태, user_dash_layouts.layout 노드의 chart 필드):
//   { v: 1, source: 'mon', x: 'week', x2: null|'student', y: 'freq', alt: true|false, chart: 'line'|'bar'|'grid',
//     range: '2w'|'4w'|'8w'|'sem'|'10'|'20', filter: { student, group, behavior, phase, goal }, title: '' }
//
// 관찰·기록 화면의 칩 목록도 여기서 export 한다(ObservePage·MonitorPage가 import) — 차트가 같은 목록으로
// 자유 입력을 묶기 때문에 두 곳이 어긋나면 안 된다.

// ── 입력 화면 칩(단일 출처) ───────────────────────────────────────────────
export const ABC_TIMES = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '쉬는 시간', '점심', '등교', '하교'];
export const ABC_PLACES = ['교실', '복도', '운동장', '급식실', '특별실', '통합학급', '화장실', '보건실'];
export const A_CHIPS = ['지시 받음', '활동 전환 시', '휴식 끝날 때', '또래와 갈등', '감각 자극(소음/조명)', '낯선 환경', '대기 시간', '평가/시험 시작', '좋아하는 활동 종료', '요구 거절됨'];
export const B_CHIPS = ['자리 이탈', '소리 지르기', '물건 던지기', '거부', '회피', '공격 행동', '자해', '반복 행동', '울기', '도주', '무반응', '자기 자극'];
export const C_CHIPS = ['교사 개입', '활동 중단', '또래 분리', '심리안정실 이용', '강화 제공', '계획적 무시', '대체행동 촉진', '위기관리팀 호출', '보호자 통보', '학생 진정'];
// 0914(홍준표 부록): 배경사건(setting event) — 선택 입력. 차트 축으로는 쓰지 않는다(데이터 희소, mds/42 §7).
export const SETTING_CHIPS = ['수면 부족', '투약 변경', '아침 갈등(가정)', '일정 변경', '아픔·컨디션 저하', '식사 거름·배고픔', '전날 행사·피로', '새 학기·환경 변화'];
// 행동 데이터 화면의 표적행동 기본 칩.
export const STD_BEHS = ['자리 이탈', '소리 지르기', '자해', '공격 행동', '거부', '회피', '반복 행동', '울기', '물건 던지기', '도주'];

const CHIPS = { ABC_TIMES, ABC_PLACES, A_CHIPS, B_CHIPS, C_CHIPS, STD_BEHS };
export const OTHER_LABEL = '기타';

// ── 차트 모양·기간 ─────────────────────────────────────────────────────────
export const CHART_TYPES = { line: '꺾은선', bar: '막대', grid: '격자' };
// 시간 축 기간. 회기 번호 축은 '10'·'20'(최근 N회기).
export const RANGES = { '2w': '최근 2주', '4w': '최근 4주', '8w': '최근 8주', sem: '이번 학기' };
export const SEQ_RANGES = { 10: '최근 10회기', 20: '최근 20회기' };
export const MAX_CHARTS = 3; // 대시보드당 사용자 차트 수

// 공통 시간 X — 소스가 time:true 이면 자동으로 붙는다(timeDims로 일부만 허용 가능).
export const TIME_DIMS = {
  day: { label: '날짜(일)', kind: 'time' },
  week: { label: '주', kind: 'time' },
  month: { label: '월', kind: 'time' },
  dow: { label: '요일', kind: 'dow', values: ['월', '화', '수', '목', '금'] },
};

// ── 소스 ─────────────────────────────────────────────────────────────────
// dims.kind: time(일·주·월) | dow | cat(범주) | student | seq(회기 번호)
//   cat: values(고정 목록) 또는 chips(기본 칩 이름 → topN + 기타) 또는 free(원문 그대로, topN)
// measures: agg(sum|avg|count|rate) · unit · max(축 고정) · onlyDim(그 X에서만) · onlyKind · needsDim · higherIsBetter · altToggle
export const SOURCES = {
  cico: {
    key: 'cico', label: 'CICO 점검표', icon: '📝', dash: ['dash2'], page: 'tier2', time: true,
    dims: {
      student: { label: '학생', kind: 'student' },
      group: { label: '소그룹', kind: 'cat', free: true, showIf: 'groups' },
      period: { label: '교시', kind: 'cat', free: true, topN: 10 },
    },
    measures: {
      pct: { label: '수행률(%)', unit: '%', agg: 'avg', max: 100 },
      perScore: { label: '교시 평균 점수(0~3)', unit: '점', agg: 'avg', max: 3, onlyDim: ['period'] },
      students: { label: '기록한 학생 수', unit: '명', agg: 'count', onlyKind: ['time', 'dow'] },
      n: { label: '기록 건수', unit: '건', agg: 'count' },
    },
    filters: ['student', 'group'],
    empty: '이 기간 CICO 기록이 없어요. 점검표를 기록하면 여기에 쌓여요.',
  },
  abc: {
    key: 'abc', label: 'ABC 관찰', icon: '🔍', dash: ['dash3'], page: 'observe', time: true,
    dims: {
      student: { label: '학생', kind: 'student' },
      timeband: { label: '시간대', kind: 'cat', chips: 'ABC_TIMES', topN: 10 },
      place: { label: '장소', kind: 'cat', chips: 'ABC_PLACES', topN: 8 },
      a: { label: '선행사건(A)', kind: 'cat', chips: 'A_CHIPS', topN: 8 },
      b: { label: '행동(B)', kind: 'cat', chips: 'B_CHIPS', topN: 8 },
      c: { label: '결과(C)', kind: 'cat', chips: 'C_CHIPS', topN: 8 },
    },
    measures: { n: { label: '관찰 건수', unit: '건', agg: 'count' } },
    filters: ['student'],
    empty: '이 기간 ABC 관찰이 없어요.',
  },
  mon: {
    key: 'mon', label: '행동 데이터', icon: '📈', dash: ['dash3', 'dashIep'], page: 'monitor', time: true, phase: true,
    dims: {
      student: { label: '학생', kind: 'student' },
      behavior: { label: '표적행동', kind: 'cat', chips: 'STD_BEHS', topN: 8 },
    },
    measures: {
      freq: { label: '문제행동 빈도(회)', unit: '회', agg: 'sum', altToggle: true },
      dur: { label: '지속시간(분)', unit: '분', agg: 'avg' },
      int: { label: '강도(1~5)', unit: '', agg: 'avg', max: 5 },
      dbr: { label: 'DBR(0~10)', unit: '', agg: 'avg', max: 10, higherIsBetter: true },
      n: { label: '기록 건수', unit: '건', agg: 'count' },
    },
    filters: ['student', 'behavior', 'phase'],
    empty: '이 기간 행동 데이터가 없어요. 기초선(A)부터 기록해보세요.',
  },
  sz: {
    key: 'sz', label: '심리안정실', icon: '🧯', dash: ['dash3'], page: 'crisis', time: true, timeDims: ['day', 'week', 'month'],
    dims: {
      student: { label: '학생', kind: 'student' },
      reason: { label: '이용 사유', kind: 'cat', values: ['불안', '분노', '위기전조', '피로/과민'] },
      intv: { label: '교사 개입 정도', kind: 'cat', values: ['최소', '보통', '적극적'] },
      hour: { label: '입실 시각대', kind: 'cat', free: true, topN: 12, sortKey: true },
    },
    measures: {
      n: { label: '이용 건수', unit: '건', agg: 'count' },
      stay: { label: '체류 시간(분)', unit: '분', agg: 'avg' },
      retRate: { label: '학습 복귀율(%)', unit: '%', agg: 'rate', max: 100 },
    },
    filters: ['student'],
    empty: '이 기간 심리안정실 이용 기록이 없어요 👍',
  },
  iep: {
    key: 'iep', label: 'IEP 목표', icon: '📘', dash: ['dashIep'], page: 'iep', time: false,
    dims: {
      student: { label: '학생', kind: 'student' },
      subject: { label: '교과', kind: 'cat', free: true, topN: 10 },
      month: { label: '월', kind: 'cat', values: 'semesterMonths' },
    },
    measures: {
      goals: { label: '목표 수', unit: '개', agg: 'count' },
      evalRate: { label: '월별 평가 작성률(%)', unit: '%', agg: 'rate', max: 100 },
    },
    filters: [],
    empty: '이번 학기 IEP 목표가 없어요.',
  },
  session: {
    key: 'session', label: '회기 기록', icon: '🧮', dash: ['dashIep'], page: 'monitor', monitorTab: 'sessions', time: true, timeDims: ['day', 'week'], phase: 'session', defaultDim: 'seq',
    dims: {
      seq: { label: '회기 번호', kind: 'seq' },
      student: { label: '학생', kind: 'student' },
    },
    measures: {
      pct: { label: '정반응률(%)', unit: '%', agg: 'avg', max: 100 },
      indep: { label: '독립 수행 비율(%)', unit: '%', agg: 'rate', max: 100 },
      n: { label: '회기 수', unit: '회', agg: 'count', onlyKind: ['time', 'student'] },
    },
    filters: ['student', 'goal'],
    empty: '이 목표의 회기 기록이 없어요.',
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES);
export const sourcesFor = (dashKey) => SOURCE_KEYS.filter((k) => SOURCES[k].dash.includes(dashKey)).map((k) => SOURCES[k]);
export const dashHasCharts = (dashKey) => sourcesFor(dashKey).length > 0;

export const chipList = (name) => CHIPS[name] || [];
export const semesterMonths = (sem) => (Number(sem) === 2 ? [9, 10, 11, 12, 1] : [3, 4, 5, 6, 7]);

/** 소스의 X 목록 — [{ key, label, kind, ... }] (공통 시간 X 먼저). */
export function dimsFor(sourceKey) {
  const src = SOURCES[sourceKey];
  if (!src) return [];
  const out = [];
  if (src.time) {
    const allow = src.timeDims || Object.keys(TIME_DIMS);
    allow.forEach((k) => out.push({ key: k, ...TIME_DIMS[k] }));
  }
  Object.entries(src.dims).forEach(([k, d]) => out.push({ key: k, ...d }));
  return out;
}
export const dimOf = (sourceKey, dimKey) => dimsFor(sourceKey).find((d) => d.key === dimKey) || null;
/** 소스를 골랐을 때 처음 켜 둘 X — 회기 기록은 회기 번호(표준 그림), 나머지는 첫 항목. */
export const defaultDim = (sourceKey) => SOURCES[sourceKey]?.defaultDim || dimsFor(sourceKey)[0]?.key || '';

/** 소스+X에서 고를 수 있는 Y 목록. */
export function measuresFor(sourceKey, dimKey) {
  const src = SOURCES[sourceKey];
  if (!src) return [];
  const dim = dimOf(sourceKey, dimKey);
  return Object.entries(src.measures)
    .filter(([, m]) => !m.onlyDim || (dim && m.onlyDim.includes(dim.key)))
    .filter(([, m]) => !m.onlyKind || (dim && m.onlyKind.includes(dim.kind)))
    .map(([k, m]) => ({ key: k, ...m }));
}
export const measureOf = (sourceKey, yKey) => SOURCES[sourceKey]?.measures?.[yKey] ? { key: yKey, ...SOURCES[sourceKey].measures[yKey] } : null;

/** X 종류별 허용 차트. 격자는 세로=학생 고정이라 X가 학생이 아닐 때만. */
export function chartsFor(sourceKey, dimKey) {
  const dim = dimOf(sourceKey, dimKey);
  if (!dim) return [];
  if (dim.kind === 'time') return ['line', 'bar', 'grid'];
  if (dim.kind === 'seq') return ['line'];
  if (dim.kind === 'student') return ['bar'];
  return ['bar', 'grid']; // cat · dow
}
export const defaultChart = (sourceKey, dimKey) => chartsFor(sourceKey, dimKey)[0] || 'bar';

/** X 종류별 기간 선택지. */
export function rangesFor(sourceKey, dimKey) {
  const dim = dimOf(sourceKey, dimKey);
  if (!dim) return {};
  if (dim.kind === 'seq') return SEQ_RANGES;
  if (!SOURCES[sourceKey]?.time) return {}; // IEP 목표: 기간 없음(이번 학기 고정)
  return RANGES;
}
export const DEFAULT_RANGE = '4w';
export const DEFAULT_SEQ_RANGE = '10';

/** 회기 기록은 회기·날짜 축에서 목표 1개가 필수(학생 축은 전체 목표 평균). */
export const needsGoal = (cfg) => cfg?.source === 'session' && cfg?.x !== 'student';

/** 저장·조회 전 공용 검증. 통과하면 null, 아니면 이유 문자열. 서버는 이 함수를 통과한 설정만 받는다. */
export function validateChart(cfg, dashKey) {
  if (!cfg || typeof cfg !== 'object') return '설정이 없어요';
  const src = SOURCES[cfg.source];
  if (!src) return '기록 종류가 올바르지 않아요';
  if (dashKey && !src.dash.includes(dashKey)) return '이 대시보드에서 쓸 수 없는 기록 종류예요';
  const dim = dimOf(cfg.source, cfg.x);
  if (!dim) return '가로축을 골라주세요';
  if (!measuresFor(cfg.source, cfg.x).some((m) => m.key === cfg.y)) return '세로축을 골라주세요';
  if (!chartsFor(cfg.source, cfg.x).includes(cfg.chart)) return '이 가로축에 맞는 모양이 아니에요';
  if (cfg.chart === 'grid' && cfg.x2 !== 'student') return '격자는 세로가 학생이어야 해요';
  if (cfg.chart !== 'grid' && cfg.x2) return '격자가 아니면 둘째 축이 없어요';
  const ranges = rangesFor(cfg.source, cfg.x);
  if (Object.keys(ranges).length && !ranges[String(cfg.range)]) return '기간을 골라주세요';
  if (cfg.alt && !(cfg.source === 'mon' && cfg.y === 'freq' && cfg.chart !== 'grid')) return '대체행동 함께 보기는 빈도 꺾은선·막대에서만 돼요';
  const f = cfg.filter || {};
  for (const k of Object.keys(f)) if (!src.filters.includes(k)) return `쓸 수 없는 조건(${k})`;
  if (needsGoal(cfg) && !f.goal) return '회기 기록은 목표를 먼저 골라주세요';
  if (cfg.title != null && typeof cfg.title !== 'string') return '제목 형식';
  return null;
}

/** 저장할 형태로 다듬기 — 알 수 없는 필드 제거·문자열 길이 제한. validateChart 통과를 전제로 한다. */
export function normalizeChart(cfg) {
  const src = SOURCES[cfg.source];
  const filter = {};
  src.filters.forEach((k) => {
    const v = cfg.filter?.[k];
    if (v == null || v === '') return;
    filter[k] = typeof v === 'number' ? v : String(v).slice(0, 80);
  });
  return {
    v: 1,
    source: cfg.source, x: cfg.x, x2: cfg.chart === 'grid' ? 'student' : null, y: cfg.y,
    alt: !!cfg.alt, chart: cfg.chart,
    range: Object.keys(rangesFor(cfg.source, cfg.x)).length ? String(cfg.range) : '',
    filter,
    title: String(cfg.title || '').slice(0, 60),
  };
}

/** 제목 자동 문장 — "교시별 수행률(%) · 최근 4주". ctx: { studentCode, groupName, goalText } */
export function titleOf(cfg, ctx = {}) {
  if (cfg?.title) return cfg.title;
  const src = SOURCES[cfg?.source];
  if (!src) return '내 차트';
  const dim = dimOf(cfg.source, cfg.x);
  const m = measureOf(cfg.source, cfg.y);
  const head = [];
  if (ctx.studentCode) head.push(ctx.studentCode);
  if (ctx.groupName) head.push(ctx.groupName);
  const axis = cfg.chart === 'grid' ? `학생×${dim?.label || ''}` : `${dim?.label || ''}별`;
  const y = m?.label || '';
  const alt = cfg.alt ? ' + 대체행동' : '';
  const r = rangesFor(cfg.source, cfg.x)[String(cfg.range)];
  return [head.join(' · '), `${axis} ${y}${alt}`, r].filter(Boolean).join(' · ');
}

// 소스·X 조합별 설명 한 줄(위젯 아래 dw-sub). 없으면 일반 문구.
export const HINTS = {
  'cico.period': '어느 교시에 낮은지 — 낮은 교시의 일과·환경을 먼저 살펴봐요',
  'cico.dow': '요일마다 반 평균 수행률 — 유난히 낮은 요일이 있으면 그날 일과를 점검해요',
  'cico.student': '학생마다 평균 — 80% 넘으면 목표 상향이나 졸업을 검토해볼 수 있어요',
  'abc.timeband': '어느 시간대에 많이 일어나는지 — 많은 칸의 일과를 먼저 살펴봐요',
  'abc.place': '어디서 많이 일어나는지',
  'abc.a': '행동 직전에 무엇이 있었는지 — 가장 많은 상황이 가설의 출발점이에요',
  'abc.b': '어떤 행동이 많이 기록됐는지',
  'abc.c': '행동 뒤에 어떤 결과가 따랐는지 — 같은 결과가 반복되면 그 결과가 행동을 유지시킬 수 있어요',
  'mon.day': '점선 구간은 기초선(A), 실선 구간은 중재(B) — 중재 뒤에 줄고 있는지 봐요',
  'mon.week': '주마다 더한 값 — 기초선(A)·중재(B) 구간은 음영으로 구분해요',
  'mon.behavior': '행동마다 따로 — 두 가지 이상 기록했다면 섞이지 않게 봐요',
  'sz.reason': '어떤 이유로 많이 가는지',
  'sz.hour': '하루 중 언제 많이 가는지',
  'iep.month': '달마다 평가 칸이 채워졌는지 — 밀린 달이 보이면 이 달이 가기 전에 채워요',
  'iep.subject': '교과별 목표 수 — 한 교과에 쏠렸는지 봐요',
  'session.seq': '회기마다 정반응률 — 주황 음영은 기초선, 초록 점선은 목표 기준',
};
export const hintOf = (cfg) => HINTS[`${cfg?.source}.${cfg?.x}`] || '';

/** 자유 입력을 칩 목록으로 묶는다 — 칩 순서상 먼저 맞는 1개, 없으면 기타. 시간대·장소는 ' / ' 로 나눈 조각마다 본다. */
export function classifyChip(raw, chipName) {
  const chips = chipList(chipName);
  const s = String(raw || '').trim();
  if (!s) return OTHER_LABEL;
  const hit = chips.find((c) => s.includes(c));
  return hit || OTHER_LABEL;
}
export function classifyTimePlace(raw) {
  const parts = String(raw || '').split(' / ').map((p) => p.trim()).filter(Boolean);
  let time = OTHER_LABEL; let place = OTHER_LABEL;
  parts.forEach((p) => {
    const t = ABC_TIMES.find((c) => p.includes(c));
    const pl = ABC_PLACES.find((c) => p.includes(c));
    if (t && time === OTHER_LABEL) time = t;
    else if (pl && place === OTHER_LABEL) place = pl;
    // 어느 쪽도 아니면(교사가 고친 칩) 기타로 남는다
  });
  return { time, place };
}
