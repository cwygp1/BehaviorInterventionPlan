// 0915(mds/33): 기록 달력 표시 정의 — 기록 종류별 이름·색·이름표·설명·이동 화면.
// 달력 화면(CalendarPage)과 홈 '이번 주' 띠(WeekStrip)가 같이 쓴다. 색은 영역 색(lib/tiers.js SECTIONS)을 따른다.
import { SECTIONS, pageLabel } from './tiers';

const T3 = SECTIONS.t3.color;
const T2 = SECTIONS.t2.color;
const IEP = SECTIONS.iep.color;
const COM = '#0f766e';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// page: 누르면 갈 화면 id. monitorTab: 행동 데이터 기록 화면의 탭(sessionStorage kb_monitor_tab).
// entry: 그 화면의 날짜 칸에 달력 날짜를 넘길 때 받는 쪽 이름(lib/hooks/useEntryDate). 없으면 날짜를 넘기지 않는다.
export const KINDS = {
  abc: {
    label: 'ABC 관찰', color: T3, soft: SECTIONS.t3.soft, page: 'observe', entry: 'observe',
    tag: (e) => `ABC ${e.n}`,
    detail: (e) => `${e.n}건${e.info.beh ? ' · ' + e.info.beh : ''}`,
  },
  mon: {
    label: '행동 데이터', color: T3, soft: SECTIONS.t3.soft, page: 'monitor', monitorTab: 'behavior', entry: 'monitor',
    tag: (e) => `행동 ${e.info.freq ?? 0}회`,
    detail: (e) => `${e.info.beh || '표적행동'} ${e.info.freq ?? 0}회${e.info.alt ? ` · 대체행동 ${e.info.alt}회` : ''}`,
  },
  sz: {
    label: '진정 공간', color: T3, soft: SECTIONS.t3.soft, page: 'crisis', entry: 'crisis', warn: true,
    tag: () => '진정 공간',
    detail: (e) => [
      e.n > 1 ? `${e.n}회` : '',
      e.info.in ? `${e.info.in}${e.info.out ? '~' + e.info.out : ''}` : '',
      e.info.reason || '',
      e.info.returned === 'Y' ? '교실 복귀함' : '',
    ].filter(Boolean).join(' · ') || '진정 공간 사용',
  },
  fid: {
    label: '실행 충실도', color: T3, soft: SECTIONS.t3.soft, page: 'monitor', monitorTab: 'behavior', entry: 'monitor',
    tag: (e) => `충실도 ${e.info.score ?? 0}/${e.info.total ?? 4}`,
    detail: (e) => `중재 실행 점검 ${e.info.score ?? 0}/${e.info.total ?? 4}`,
  },
  cico: {
    label: 'CICO', color: T2, soft: SECTIONS.t2.soft, page: 'tier2', entry: 'tier2',
    tag: (e) => (e.info.max ? `CICO ${e.info.score}/${e.info.max}` : 'CICO'),
    detail: (e) => (e.info.max ? `점수 ${e.info.score}/${e.info.max} (${pct(e.info.score, e.info.max)}%)` : '점검표 기록'),
  },
  session: {
    label: '회기 기록', color: IEP, soft: SECTIONS.iep.soft, page: 'monitor', monitorTab: 'sessions', entry: 'sessions',
    tag: (e) => `회기 ${e.info.pct ?? 0}%`,
    detail: (e) => `${e.n}회기 · 정반응률 평균 ${e.info.pct ?? 0}%`,
  },
  letter: {
    label: '가정 통신', color: COM, soft: '#e3f6f3', page: 'bip',
    tag: () => '가정 통신',
    detail: (e) => (e.info.subject ? `「${e.info.subject}」${e.n > 1 ? ` 외 ${e.n - 1}건` : ''}` : `${e.n}건 작성`),
  },
};
export const KIND_ORDER = ['abc', 'mon', 'sz', 'fid', 'cico', 'session', 'letter'];

export const MISSING = {
  cico: { text: 'CICO를 하는 중인데 이날 점검표가 없어요.', page: 'tier2', entry: 'tier2' },
  mon: { text: '관찰 기간 중인데 이날 행동 데이터가 없어요.', page: 'monitor', monitorTab: 'behavior', entry: 'monitor' },
};

export const PERIOD = {
  baseline: { label: '기초선', color: '#64748b' },
  tier1: { label: 'Tier 1', color: SECTIONS.t1.color },
  tier2: { label: 'Tier 2', color: T2 },
  tier3: { label: 'Tier 3 중재', color: T3 },
};

// 학생 구분 점 색 — 영역 색과 겹치지 않는 차분한 색 순환.
const STU_COLORS = ['#4f6bed', '#0c8599', '#9c36b5', '#c2255c', '#5f3dc4', '#1971c2', '#862e9c', '#495057'];
export const studentColor = (idx) => STU_COLORS[idx % STU_COLORS.length];

export const goLabel = (page) => pageLabel(page);

// 보던 달·선택한 날(sessionStorage) — 달력 화면이 복원하고, 홈 이번 주 띠가 날짜를 넘길 때 쓴다.
export const CAL_VIEW_KEY = 'kb_cal_view';
