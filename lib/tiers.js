// 3-Tier 영역 정의(색·라벨·페이지 목록)의 단일 출처.
//
// ⚠ 2026-08-14: '사용 단계 설정'으로 안 쓰는 Tier를 숨기던 기능은 폐지했다(현장 피드백:
//    "숨기기 기능은 필요 없다"). 이제 홈 카드·사이드바·상단 칩은 Tier 1·2·3 + IEP를
//    항상 전부 보여준다. 아래 스코핑 헬퍼(sectionEnabled·tierEnabled·pageVisible·
//    PAGE_TIER)와 users.used_tiers 컬럼·API는 되돌리기 쉽게 남겨두었지만 UI는 쓰지 않는다.
//
//   users.used_tiers: '1,2,3' 형식 CSV. ''(미설정)이면 전체 표시 + 홈에서 설정 유도.
//   IEP(개별화교육)는 행동지원 Tier와 별개의 독립 영역 — Tier 선택과 무관하게
//   항상 표시한다(2026-08-14 확정: Tier 3에 묶지 않는다).
//
// 서버(API 검증)와 클라이언트(사이드바·홈·설정 모달)가 같은 규칙을 쓰도록 공용 모듈로 둔다.

export const ALL_TIERS = [1, 2, 3];

export const TIER_META = {
  1: {
    num: 1,
    color: '#15803d', // 초록 — 보편적 지원
    soft: '#f0fdf4',
    badge: 'Tier 1',
    title: '학급 전체 지원',
    icon: '🏫',
    short: '보편적 지원 (우리 반 모두)',
    desc: '우리 반 모두를 위한 학급 차원 긍정행동지원(PBS) — 학급 규칙·목표·보상판과 기초 설문을 운영해요.',
  },
  2: {
    num: 2,
    color: '#b45309', // 주황 — 표적 지원
    soft: '#fffbeb',
    badge: 'Tier 2',
    title: '소그룹 지원',
    icon: '👥',
    short: '표적 지원 (몇몇 학생)',
    desc: '조금 더 지원이 필요한 몇몇 학생을 소그룹으로 묶어 CICO / DPR로 매일 점검해요.',
  },
  3: {
    num: 3,
    color: '#dc2626', // 빨강 — 개별 집중 지원
    soft: '#fef2f2',
    badge: 'Tier 3',
    title: '한 학생 집중 지원',
    icon: '🎯',
    short: '개별 맞춤 중재',
    desc: '한 학생을 위한 5단계 행동중재(관찰→기능평가→BIP→데이터→평가)를 순서대로 진행해요.',
  },
};

// IEP(개별화교육)는 Tier와 별개의 독립 영역 — 모든 선생님에게 항상 표시.
// 허브 카드·사이드바 그룹이 같은 색 정체성(파랑)을 쓰도록 여기서 함께 정의한다.
export const IEP_META = {
  color: '#2563eb', // 파랑 — 개별화교육(행동지원 Tier와 구분)
  soft: '#eff6ff',
  badge: 'IEP',
  title: '개별화교육계획',
  icon: '📘',
  short: 'Tier와 별개 · 항상 표시',
  desc: '전년도 IEP와 출발점 분석을 바탕으로 학기 목표를 세우고, 완성된 계획서를 출력해요.',
};

// 페이지 id → 소속 Tier. 여기 없는 페이지는 공통 메뉴(항상 표시).
// ※ IEP 페이지(priorIep·startpoint·iep·iepReport)는 Tier와 별개(항상 표시)이므로
//    여기 넣지 않는다 — 넣으면 Tier 설정 변경 시 IEP 화면에서 홈으로 튕긴다.
export const PAGE_TIER = {
  // Tier 1
  dash1: 1,
  classpbs: 1,
  pbssurvey: 1,
  classcheck: 1,
  // Tier 2
  dash2: 2,
  tier2: 2,
  // Tier 3 — 5단계 워크플로
  dash3: 3,
  tier3: 3,
  observe: 3,
  qabf: 3,
  bip: 3,
  monitor: 3,
  eval: 3,
};

// ── 시안 B(런처 포털) 워크스페이스 섹션 ──────────────────────────
// 홈 포털 카드 = 섹션 진입점. 섹션에 들어가면 사이드바에 그 섹션 메뉴만 남는다.
// dash = 섹션 랜딩(대시보드) 페이지 id. IEP 섹션은 Tier와 별개(항상 표시).
export const SECTIONS = {
  t1: {
    key: 't1', tier: 1, dash: 'dash1',
    color: '#15803d', soft: '#f0fdf4', icon: '🏫', badge: 'Tier 1',
    label: '학급 전체 (Tier 1)', title: '학급 전체 지원',
    desc: '우리 반 모두를 위한 보편적 지원(PBS) — 규칙·목표·보상판과 기초 설문 운영',
    pages: ['dash1', 'classpbs', 'pbssurvey', 'classcheck'],
  },
  t2: {
    key: 't2', tier: 2, dash: 'dash2',
    color: '#b45309', soft: '#fffbeb', icon: '👥', badge: 'Tier 2',
    label: '소그룹 (Tier 2)', title: '소그룹 지원',
    desc: '몇몇 학생을 소그룹으로 묶어 CICO / DPR로 매일 점검',
    pages: ['dash2', 'tier2'],
  },
  t3: {
    key: 't3', tier: 3, dash: 'dash3',
    color: '#dc2626', soft: '#fef2f2', icon: '🎯', badge: 'Tier 3',
    label: '한 학생 집중 (Tier 3)', title: '한 학생 집중 지원',
    desc: '개별 학생 5단계 행동중재 (관찰→기능평가→BIP→데이터→평가)',
    pages: ['dash3', 'tier3', 'observe', 'qabf', 'bip', 'monitor', 'eval'],
  },
  iep: {
    key: 'iep', tier: null, dash: 'dashIep',
    color: '#2563eb', soft: '#eff6ff', icon: '📘', badge: 'IEP',
    label: '개별화교육 (IEP)', title: '개별화교육계획',
    desc: 'Tier와 별개 — 전년도·출발점을 바탕으로 목표를 세우고 계획서 출력',
    pages: ['dashIep', 'priorIep', 'startpoint', 'iep', 'iepReport'],
  },
};

// 페이지 id → 섹션 key ('t1'|'t2'|'t3'|'iep'). 없으면 공통 페이지.
export const PAGE_SECTION = Object.fromEntries(
  Object.values(SECTIONS).flatMap((s) => s.pages.map((p) => [p, s.key]))
);

/** used_tiers 설정에서 이 섹션이 보이는가. IEP(tier=null)는 항상 true. */
export function sectionEnabled(usedTiers, sectionKey) {
  const s = SECTIONS[sectionKey];
  if (!s) return false;
  return s.tier == null || tierEnabled(usedTiers, s.tier);
}

/** '1,2,3' → [1,2,3]. 미설정('')·이상값뿐이면 null(=전체 취급). */
export function parseUsedTiers(str) {
  if (!str) return null;
  const nums = String(str)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => ALL_TIERS.includes(n));
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  return uniq.length ? uniq : null;
}

/** 배열/CSV 어느 쪽이 와도 '1,3' 같은 정규화 CSV로. 유효값 없으면 null. */
export function normalizeUsedTiers(value) {
  const arr = Array.isArray(value) ? parseUsedTiers(value.join(',')) : parseUsedTiers(value);
  return arr ? arr.join(',') : null;
}

/** usedTiers(배열 또는 null)가 해당 Tier를 포함하는가. null = 미설정 = 전체 허용. */
export function tierEnabled(usedTiers, tierNum) {
  return !usedTiers || usedTiers.includes(tierNum);
}

/** 이 페이지가 현재 Tier 설정에서 보여야 하는가. 공통 페이지는 항상 true. */
export function pageVisible(usedTiers, pageId) {
  const t = PAGE_TIER[pageId];
  return t == null || tierEnabled(usedTiers, t);
}
