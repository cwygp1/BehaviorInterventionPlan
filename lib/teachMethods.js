// 가르치는 방식·기록 틀 정의의 단일 출처 (설계: mds/34 §5·§15, 햇살 0915·0916 답).
//
// 서버(API 검증)와 화면(칩·안내·패널 고르기)이 같은 정의를 읽는다.
// 여기에 넣지 않는 것: React 컴포넌트, EBP 29가지 카탈로그(lib/ebp.js),
//   장애영역 기본 교수전략(lib/disabilityMethods.js), AI 지시문 본문.

/** 교수 방법 이름 — EBP 카탈로그 표기를 따른다. */
export const METHOD = {
  chain: '과제분석',
  bst: '행동기술훈련(BST)',
  dtt: '비연속 시행 훈련(DTT)',
  di: '직접교수',
  prompt: '촉진(도움 줄이기)',
  selfmgmt: '자기관리전략',
  fct: '기능적 의사소통 훈련(FCT)',
  shaping: '행동형성',
};

// ── 기록 틀 ──────────────────────────────────────────────
// '무엇을 적는지'로 나눈다(교수법 이름으로 나누지 않는다 — mds/34 §5-1).
// status 'ready'만 지금 화면이 있고, 'planned'는 칩에 '준비 중'으로만 보인다.
export const RECORD_FRAMES = [
  {
    kind: 'chain', label: '단계 체크 · 과제분석', short: '단계 체크', icon: '🧩',
    what: 'IEP 과제분석 단계마다 + − P I', metric: 'pct', status: 'ready',
    methods: [METHOD.chain],
  },
  {
    kind: 'dtt', label: '시행 · DTT', short: '시행', icon: '🎯',
    what: '학습 항목(표적)마다 기회 n번, + P −', metric: 'pct', status: 'ready',
    methods: [METHOD.dtt],
  },
  {
    kind: 'scale', label: '5점 척도 · BST', short: '5점 척도', icon: '📶',
    what: '실제 상황에서 기회마다 1~5점', metric: 'scale', status: 'planned',
    methods: [METHOD.bst, METHOD.prompt, METHOD.selfmgmt],
  },
  {
    kind: 'lesson', label: '차시 · 직접교수', short: '차시', icon: '📚',
    what: '학생마다 정답 수·정답률(1분 정답은 점검하는 날만)', metric: 'lesson', status: 'planned',
    methods: [METHOD.di],
  },
  {
    kind: 'ladder', label: '단계 사다리 · 행동형성', short: '단계 사다리', icon: '📈',
    what: '지금 단계 · n번 중 m번', metric: 'step', status: 'planned',
    methods: [METHOD.shaping],
  },
];

export const FRAME_KINDS = RECORD_FRAMES.map((f) => f.kind);
export const READY_KINDS = RECORD_FRAMES.filter((f) => f.status === 'ready').map((f) => f.kind);
export const frameOf = (kind) => RECORD_FRAMES.find((f) => f.kind === kind) || null;
export const frameLabel = (kind) => frameOf(kind)?.label || '';
export const isReadyKind = (kind) => READY_KINDS.includes(kind);
/** API 저장용 — 아는 틀이면 그대로, 모르면 null(호출부가 막는다). */
export const normalizeKind = (kind) => (FRAME_KINDS.includes(kind) ? kind : null);
/** 교수 방법 이름 → 기록 틀. 못 찾으면 null. */
export const frameForMethod = (method) => RECORD_FRAMES.find((f) => f.methods.includes(method))?.kind || null;

// ── BST 5점 척도 (0916 햇살 답, mds/34 §15-1) ───────────────
export const BST_SCALE = [
  { score: 5, label: '스스로', support: '지원 없음' },
  { score: 4, label: '말', support: '말 단서' },
  { score: 3, label: '가리키기(몸짓)·모델링', support: '몸짓 · 시범' },
  { score: 2, label: '부분 신체 도움', support: '부분 신체 촉구' },
  { score: 1, label: '전적 도움·수행 안 함', support: '전체 신체 촉구 또는 무반응' },
];
export const BST_TOP = 5;
export const BST_BOTTOM = 1;
export const bstScaleOf = (score) => BST_SCALE.find((s) => s.score === Number(score)) || null;
export const BST_SCORING_RULES = [
  '촉구를 여러 번 줬으면 가장 강한 촉구로 매긴다.',
  '기다리는 시간은 5초다(과제분석·DTT와 같다).',
  '기초선에서는 촉구를 주지 않는다 — 스스로 하면 5점, 못 하면 1점이다.',
  '여러 요소로 된 기술은 도움이 가장 많이 필요했던 요소로 매긴다.',
];
/** 적는 장면 — 판정은 실제 상황만 본다. 역할극은 연습 기록(선택). */
export const BST_SETTINGS = [
  { k: 'real', label: '실제 상황', judge: true },
  { k: 'roleplay', label: '역할극 (연습)', judge: false },
];
export const BST_MASTERY = { score: BST_TOP, runs: 2, setting: 'real' };

/** 한 회기의 점수들 → 기회 수·평균·5점 비율. 빈칸과 범위 밖 값은 뺀다. */
export function scoreBstSession(scores) {
  const list = (scores || [])
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= BST_BOTTOM && n <= BST_TOP);
  if (!list.length) return { n: 0, avg: null, topRate: null };
  const sum = list.reduce((a, b) => a + b, 0);
  const top = list.filter((n) => n === BST_TOP).length;
  return {
    n: list.length,
    avg: Math.round((sum / list.length) * 10) / 10,
    topRate: Math.round((top / list.length) * 100),
  };
}

/** 회기가 '스스로(5점)' 회기인가 — 기회가 하나 이상이고 모두 5점. */
export const bstAllTop = (session) => {
  const r = scoreBstSession(session?.scores);
  return r.n > 0 && r.topRate === 100;
};

/**
 * 도달 판정 — 실제 상황 회기만, 기초선은 빼고, 최근 연속 회기로 본다.
 * sessions는 programSessions.masteryReached와 같이 최신 회기가 앞이다.
 */
export function bstMasteryReached(sessions, rule = BST_MASTERY) {
  const runs = rule?.runs || BST_MASTERY.runs;
  const judged = (sessions || [])
    .filter((s) => s && s.phase !== 'baseline' && (s.setting || 'real') === (rule?.setting || 'real'))
    .slice(0, runs);
  return judged.length === runs && judged.every(bstAllTop);
}

/** 평가 칸에 붙여 넣을 한 줄 — 개조식 명사형 종결(mds/34 §15-5). */
export function bstSummaryText(sessions) {
  const real = (sessions || []).filter((s) => (s?.setting || 'real') === 'real' && s.phase !== 'baseline');
  if (!real.length) return '';
  const last = scoreBstSession(real[0].scores);
  const reached = bstMasteryReached(sessions);
  return `실제 상황 ${real.length}회기 · 최근 평균 ${last.avg}점 · 스스로(5점) ${last.topRate}%`
    + (reached ? ' · 도달 기준 충족함' : '');
}

// ── 직접교수 차시 기록 (0916 햇살 답 4, mds/34 §15-4) ────────
export const LESSON_FIELDS = [
  { key: 'correct', label: '정답 수', required: true },
  { key: 'items', label: '문항 수', required: true },
  { key: 'fluency', label: '1분 동안 맞힌 수', required: false, when: '점검하는 날만' },
  { key: 'note', label: '서술', required: false },
];
/** 정답률은 매 차시, 1분 정답 수는 적은 날만 숙달 지표로 쓴다. */
export function scoreLessonRow({ correct, items, fluency } = {}) {
  const c = Number(correct);
  const t = Number(items);
  const f = Number(fluency);
  return {
    pct: Number.isFinite(c) && Number.isFinite(t) && t > 0 ? Math.round((c / t) * 100) : null,
    fluency: Number.isFinite(f) && String(fluency).trim() !== '' ? f : null,
  };
}

// ── IEP 작성 방식 (mds/34 §4·§14) ──────────────────────────
export const DAILY_SUBJECT = '일상생활 활동';
export const IEP_MODES = [
  {
    mode: 'subject', label: '교과 중심', desc: '성취기준 먼저',
    flow: 'std', method: METHOD.di, subject: '',
  },
  {
    mode: 'daily', label: '일상생활 교육과정', desc: '일상생활 활동 목록부터',
    flow: 'std', method: null, subject: DAILY_SUBJECT, // 방법은 중영역에 따라
  },
  {
    // 0915 햇살: '기능 중심'은 직업의 기능적 교육과정과 헷갈려 '(행동)기능기반'으로 쓴다.
    mode: 'func', label: '(행동)기능기반', desc: '행동 기능 → 대체행동',
    flow: 'goal', method: null, subject: '', // 방법은 대체행동에 맞춰 정해진다
  },
];
export const iepModeOf = (mode) => IEP_MODES.find((m) => m.mode === mode) || null;
export const iepModeLabel = (mode) => iepModeOf(mode)?.label || '';
export const flowModeOf = (mode) => (mode === 'func' ? 'goal' : 'std');
export const MODE_SOURCE_LABEL = {
  saved: '저장된 목표',
  student: '이 학생의 올해 목표',
  teacher: '선생님 기본값',
  fit: '학생에 맞게 바꿈',
  fallback: '',
};

/** 저장된 목표의 작성 방식 추정 — 방식 칸이 비어 있는 예전 목표용(mds/34 §4-3). */
export function guessWriteMode({ funcAlt = '', subjects = [] } = {}) {
  if (String(funcAlt || '').trim()) return 'func';
  const joined = (subjects || []).filter(Boolean).join(' ');
  if (joined.includes(DAILY_SUBJECT)) return 'daily';
  return joined.trim() ? 'subject' : '';
}

/**
 * 새 목표를 어느 작성 방식으로 열까 (mds/34 §4-2).
 * 저장된 목표 → 이 학생의 올해 목표(모두 같을 때) → 선생님 기본값 → 교과 중심.
 * 일상생활인데 공통교육과정 학생이면 교과로 바꿔 열고 안내한다.
 */
export function resolveIepMode({
  saved = '', goalModes = [], teacherDefault = '', studentCurriculum = '기본',
} = {}) {
  let mode = '';
  let source = 'fallback';
  if (saved) {
    mode = saved;
    source = 'saved';
  } else {
    const uniq = [...new Set((goalModes || []).filter(Boolean))];
    if (uniq.length === 1) {
      mode = uniq[0];
      source = 'student';
    } else if (teacherDefault) {
      mode = teacherDefault;
      source = 'teacher';
    } else {
      mode = 'subject';
      source = 'fallback';
    }
  }
  if (mode === 'daily' && studentCurriculum === '공통') {
    return {
      mode: 'subject',
      source: 'fit',
      notice: '이 학생은 공통교육과정이라 일상생활 활동 목록이 없어요. 교과 중심으로 열었어요.',
    };
  }
  return { mode, source, notice: '' };
}

// ── 일상생활 활동 중영역별 기본 가르치는 방식 ─────────────────
// 0915 햇살: 신변 자립은 과제분석, 안전·대인관계는 BST. 나머지는 기술의 모양으로 넓힌 초안.
// 0916 햇살: 이미 정한 곳은 그대로 두고, 애매한 네 곳은 기본값 없이 목표마다 고른다(choose).
const fixed = (method, frame, extra = {}) => ({ method, frame, choose: false, candidates: [], ...extra });
const choose = (candidates, note = '') => ({ method: '', frame: '', choose: true, candidates, note });

export const DAILY_AREA_METHODS = {
  // 순서 있는 동작을 이어서 혼자 해내는 기술 → 과제분석(단계 체크)
  '신변 자립': fixed(METHOD.chain, 'chain', { source: 'field' }),
  '자기 관리': fixed(METHOD.chain, 'chain', { alt: { method: METHOD.selfmgmt, frame: 'scale', when: "'건강한 생활 습관'이 목표일 때" } }),
  '공동체 및 지역사회 참여': fixed(METHOD.chain, 'chain', { alt: { method: METHOD.bst, frame: 'scale', when: '예절·규범이 목표일 때' } }),
  '지역사회 여가활동': fixed(METHOD.chain, 'chain', { note: '시설 이용 절차를 단계로(지역사회중심교수)' }),
  '개인 여가활동': choose([
    { method: METHOD.chain, frame: 'chain', when: '활동 절차를 익힐 때' },
    { method: METHOD.dtt, frame: 'dtt', when: '선호 활동을 고르는 반응을 익힐 때' },
  ], '선호 활동 탐색은 단계로 나누기 어려움'),
  '생활 속 체력 증진': choose([
    { method: METHOD.chain, frame: 'chain', when: '운동 절차를 익힐 때' },
    { method: METHOD.prompt, frame: 'scale', when: '기초 동작이 목표일 때' },
  ]),

  // 사람·상황 속에서 판단하고 주고받는 기술 → BST(5점 척도)
  '안전한 생활': fixed(METHOD.bst, 'scale', { source: 'field' }),
  '대인 관계 형성과 규범 실천': fixed(METHOD.bst, 'scale', { source: 'field' }),
  '의사소통의 활용': fixed(METHOD.bst, 'scale', { note: '가정·학교·지역사회에서 주고받기' }),
  '공동체 여가활동': fixed(METHOD.bst, 'scale', { note: '함께 놀이·여행·친교' }),
  '자기 결정과 상호 작용': choose([
    { method: METHOD.bst, frame: 'scale', when: '선택·주장하기가 목표일 때' },
    { method: METHOD.selfmgmt, frame: 'scale', when: '감정 관리가 목표일 때' },
  ]),

  // 자극을 구별하거나 기초 표현 반응을 반복해 익히는 기술 → DTT(시행)
  '의사소통의 기초': fixed(METHOD.dtt, 'dtt'),
  '보완대체의사소통의 탐색과 선택': fixed(METHOD.dtt, 'dtt', { note: '그림 교환(PECS) 절차를 함께 쓸 수 있음' }),
  '의사소통 기초 기술': fixed(METHOD.dtt, 'dtt'),
  '의사소통 방법의 선택과 적용': fixed(METHOD.dtt, 'dtt'),
  '감각 지각과 활용': fixed(METHOD.dtt, 'dtt'),
  '수용과 표현': fixed(METHOD.dtt, 'dtt'),

  // 몸의 조절·자세·이동처럼 도움을 조금씩 줄여 가는 기술 → 촉진(5점 척도를 지원 수준으로)
  '신체 조절과 이동': fixed(METHOD.prompt, 'scale', { alt: { method: METHOD.bst, frame: 'scale', when: "'안전하게 이동하기'가 목표일 때" } }),
  '신체 긴장도 조절': fixed(METHOD.prompt, 'scale', { note: '치료지원과 함께' }),
  '신체 동작 기초 기술': fixed(METHOD.prompt, 'scale'),
  '신체 인지와 움직임': choose([
    { method: METHOD.prompt, frame: 'scale', when: '몸을 조절하는 동작이 목표일 때' },
    { method: METHOD.dtt, frame: 'dtt', when: '사물 조작이 목표일 때' },
  ], '사물 조작은 DTT도 후보'),
};

export const DAILY_AREAS = Object.keys(DAILY_AREA_METHODS);
export const methodForDailyArea = (area) => DAILY_AREA_METHODS[area] || null;
/** 기본값 없이 교사가 골라야 하는 중영역인가. */
export const dailyAreaNeedsChoice = (area) => !!DAILY_AREA_METHODS[area]?.choose;
