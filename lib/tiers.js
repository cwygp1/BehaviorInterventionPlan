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
    // 0825 동료 피드백: Tier 2는 '소그룹'이 본질이 아니라 전체의 15~20% 학생을
    // 대상으로 개별 BIP까지 가지 않는 수준의 중재(CICO·집단강화·행동계약 등).
    title: '표적 학생 지원',
    icon: '👥',
    short: '표적 지원 (전체의 15~20%)',
    desc: '조금 더 지원이 필요한 학생(전체의 15~20%)에게 개별 BIP 전 단계의 중재를 해요 — CICO·집단강화·행동계약. 꼭 소그룹 형태가 아니어도 돼요.',
  },
  3: {
    num: 3,
    color: '#dc2626', // 빨강 — 개별 집중 지원
    soft: '#fef2f2',
    badge: 'Tier 3',
    title: '한 학생 집중 지원',
    icon: '🎯',
    short: '개별 맞춤 중재',
    desc: '한 학생을 위한 8단계 행동중재(확인·기본정보→표적행동→기초선→ABC분석→가설→기능평가→중재계획→실행·평가)를 순서대로 진행해요.',
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
  schoolrules: 1,
  classcheck: 1,
  classcheck2: 1,
  // Tier 2
  dash2: 2,
  tier2: 2,
  contract: 2,
  // Tier 3 — 8단계 워크플로(입력 화면은 5곳)
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
    pages: ['dash1', 'classpbs', 'pbssurvey', 'schoolrules', 'classcheck', 'classcheck2'],
  },
  t2: {
    key: 't2', tier: 2, dash: 'dash2',
    color: '#b45309', soft: '#fffbeb', icon: '👥', badge: 'Tier 2',
    label: '표적 학생 (Tier 2)', title: '표적 학생 지원',
    desc: '전체의 15~20% 학생에게 CICO·집단강화·행동계약 등 BIP 전 단계 중재',
    pages: ['dash2', 'tier2', 'contract'],
  },
  t3: {
    key: 't3', tier: 3, dash: 'dash3',
    color: '#dc2626', soft: '#fef2f2', icon: '🎯', badge: 'Tier 3',
    label: '한 학생 집중 (Tier 3)', title: '한 학생 집중 지원',
    desc: '개별 학생 8단계 행동중재 (행동 확인→가설→기능평가→중재계획→실행·평가)',
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

// ── 화면 이름 단일 출처 (0914 단순화 P0, mds/30 §3-1 원칙 2) ──────────────────
// 사이드바 label(13자 안, 넘으면 ellipsis) · 상단바 title · 아이콘 · 소속 영역 · 단계 배지 · 학생 필요 여부.
// 규칙: '쉬운 말 (약어)' 순서. 옛 이름은 title 괄호에 남겨 기존 사용자가 알아볼 수 있게 한다.
// Sidebar·Topbar·StepNav·siteGuide·현황판 머리는 모두 여기서 파생 — 이름을 고칠 땐 여기 한 곳만.
// ※ PAGE_TIER(위)는 여기서 파생하지 않는다 — IEP 페이지가 Tier 설정에 묶이면 안 되기 때문(결정 ①).
export const PAGE_META = {
  home:        { label: '홈 (영역 고르기)', title: '홈', icon: '🏠' },
  students:    { label: '학생·학급 관리', title: '학생·학급 관리', icon: '🧑‍🎓' },
  // Tier 1 — 학급 전체
  dash1:       { label: '현황판', title: '학급 전체 현황판 (Tier 1)', icon: '📊', section: 't1' },
  classpbs:    { label: '학급 약속·보상판 (PBS)', title: '학급 약속·보상판 (PBS · Tier 1)', icon: '🏫', section: 't1' },
  pbssurvey:   { label: '기초조사 ① 실태 설문', title: '기초조사 ① 실태·기대행동 설문 (PBS 기초 설문조사 · Tier 1)', icon: '📋', section: 't1' },
  schoolrules: { label: '기초조사 ② 시간·장소', title: '기초조사 ② 시간·장소 조사서 (학교 규칙 수립 조사서 · Tier 1)', icon: '📍', section: 't1' },
  classcheck:  { label: '자가점검 (교사 실행)', title: '학급관리 자가점검 — 교사 실행·문제해결력 (실행충실도 1 · Tier 1)', icon: '📑', section: 't1' },
  classcheck2: { label: '자가점검 (보편적 지원)', title: '학급관리 자가점검 — 보편적 지원 7영역 (실행충실도 2 · Tier 1)', icon: '📑', section: 't1' },
  // Tier 2 — 표적 학생
  dash2:       { label: '현황판', title: '표적 학생 현황판 (Tier 2)', icon: '📊', section: 't2' },
  tier2:       { label: '매일 점검표 (CICO·DPR)', title: '표적 학생 지원 — 매일 점검표 (CICO·DPR)', icon: '👥', section: 't2' },
  contract:    { label: '행동 계약서', title: '행동 계약서 (Tier 2)', icon: '✍', section: 't2', requiresStudent: true },
  // Tier 3 — 한 학생 집중 (정식 절차 8단계 · 입력 화면 5곳 = step 1~5)
  dash3:       { label: '현황판', title: '한 학생 현황판 (Tier 3)', icon: '📊', section: 't3' },
  tier3:       { label: '절차 안내 (8단계)', title: '한 학생 집중 지원 — 절차 안내 (8단계)', icon: '🎯', section: 't3' },
  observe:     { label: '행동 관찰 기록 (ABC)', title: '행동 관찰 기록 (ABC) — 표적행동 정의·ABC', icon: '🔍', section: 't3', requiresStudent: true, step: 1 },
  qabf:        { label: '행동의 이유 찾기 (QABF)', title: '행동의 이유 찾기 (QABF · 기능평가)', icon: '💭', section: 't3', requiresStudent: true, step: 2 },
  bip:         { label: '중재 계획 세우기 (BIP)', title: '중재 계획 세우기 (BIP · 행동중재계획)', icon: '📝', section: 't3', requiresStudent: true, step: 3 },
  monitor:     { label: '행동 데이터 기록', title: '행동 데이터 기록', icon: '📈', section: 't3', requiresStudent: true, step: 4 },
  eval:        { label: '결과 평가', title: '결과 평가 (그래프·보고서)', icon: '✅', section: 't3', requiresStudent: true, step: 5 },
  // IEP — Tier와 별개 (작성 4단계 = step 1~4, 전년도는 선택)
  dashIep:     { label: '현황판', title: 'IEP 현황판', icon: '📊', section: 'iep' },
  priorIep:    { label: '작년 IEP 불러오기 (선택)', title: '① 작년 IEP 불러오기 (선택 · 전년도 IEP)', icon: '🗓', section: 'iep', requiresStudent: true, step: 1 },
  startpoint:  { label: '출발점 분석 (현행수준)', title: '② 출발점 분석 (현행수준)', icon: '🧭', section: 'iep', requiresStudent: true, step: 2 },
  iep:         { label: 'IEP 목표 만들기', title: '③ IEP 목표 만들기 (작성)', icon: '📋', section: 'iep', requiresStudent: true, step: 3 },
  iepReport:   { label: '계획서 다듬기·출력', title: '④ IEP 계획서 다듬기·출력', icon: '📄', section: 'iep', requiresStudent: true, step: 4 },
  // 도움·자료
  crisis:      { label: '위기행동 대처', title: '위기행동 대처', icon: '🚨' },
  support:     { label: '교사 지원 자료실', title: '교사 지원 자료실', icon: '📚' },
  qaBoard:     { label: '질문 게시판 (사람 답변)', title: '질문 게시판 (사람 관리자 답변)', icon: '❓' },
  videos:      { label: 'PBS 영상 강의실', title: 'PBS 영상 강의실', icon: '🎬' },
  // AI 도우미
  chatExpert:  { label: 'AI에게 묻기', title: 'AI에게 묻기 (AI 전문가 채팅)', icon: '🗨️' },
  generator:   { label: '문서 초안 만들기', title: '문서 초안 만들기 (AI 생성기)', icon: '✨' },
  builder:     { label: '수업자료 주문서', title: '수업자료 주문서 (AI 어시스턴트 · 요청문 조합)', icon: '🧾' },
  // 메뉴 밖(관리자만, 사이드바 하단 이름 클릭)
  admin:       { label: '가입자 관리', title: '가입자 관리 (관리자)', icon: '🛡️' },
};
export const pageLabel = (id) => PAGE_META[id]?.label || id || '';
export const pageTitle = (id) => PAGE_META[id]?.title || PAGE_META[id]?.label || '';
