// 처음 쓰는 선생님 — 화면 자체가 다음 할 일을 말하게(mds/46 §3, 1001 사용자 결정: 방법 1~7 모두, 도움말은 그대로).
// 판단 로직만 모은 순수 모듈(화면 부품: components/onboarding/*). 테스트: lib/utils/__tests__/onboarding.test.js
//
//   방법 2  빈 화면 첫 단추      FIRST_STEPS · firstStepFor
//   방법 4  시작하기 체크리스트  buildChecklist
//   방법 7  간단 모드            isSimpleMode · SIMPLE_* (저장은 users.used_tiers='3' 재사용 — 예전 Tier 스코핑 칸, UI는 꺼져 있던 것)
//   방법 1  잠금 표시            softLockFor (학생 잠금은 Sidebar에 원래 있음 — 여기선 '기록이 쌓이면 열리는' 화면만)

/** 앵커 키 → 선택자(도움말·투어·시연 앵커 모두). 화면 코드에 선택자 문자열을 두지 않으려고 여기에 둔다
 *  (helpMode 테스트가 화면 코드의 data-help="…"를 앵커로 읽는다). */
export const anchorSelector = (key) => ['help', 'tour', 'demo'].map((a) => `[data-${a}="${key}"]`).join(',');

// ── 방법 7: 간단 모드 ───────────────────────────────────────────────
// 간단 모드 = IEP + 한 학생 집중(Tier 3)만 앞에 두고, 학급 전체(Tier 1)·표적 학생(Tier 2) 영역과
// 자료실·영상·AI 도우미는 '더 보기'로 접는다. 기능은 하나도 없애지 않는다.
export const SIMPLE_TIERS = '3';
export const FULL_TIERS = '1,2,3';
export function isSimpleMode(user) {
  return String((user && user.used_tiers) || '').replace(/\s/g, '') === SIMPLE_TIERS;
}
// 포털(홈·공통 화면) 사이드바에서 간단 모드일 때 바로 보이는 공통 메뉴.
export const SIMPLE_COMMON = ['home', 'students', 'calendar', 'crisis', 'qaBoard'];

// ── 방법 1: 기록이 쌓여야 의미가 있는 화면(흐리게 + 🔒, 그래도 누르면 열림) ──────
// 학생이 없을 때의 잠금(requiresStudent)은 Sidebar NavItem이 이미 한다.
export function softLockFor(page, { curStuData, iepCount } = {}) {
  const d = curStuData || {};
  if (page === 'eval' && !(d.mon || []).length) return '행동 데이터가 쌓이면 그래프가 그려져요 — 지금 눌러도 열려요';
  if (page === 'iepReport' && iepCount === 0) return 'IEP 목표를 저장하면 계획서가 채워져요 — 지금 눌러도 열려요';
  return null;
}

// ── 방법 2: 빈 화면 첫 단추 ──────────────────────────────────────────
// count(ctx) === 0이면 화면 맨 위에 '첫 할 일' 한 줄 + 단추. anchor = 그 화면의 입력 칸(스크롤), go = 다른 화면으로.
export const FIRST_STEPS = {
  observe: {
    count: ({ d }) => (d.abc || []).length,
    title: '아직 관찰 기록이 없어요',
    text: 'A·B·C 칸에서 칩을 하나씩 누르고 💾 저장을 누르면 첫 기록이 돼요. 3~5건쯤 모이면 행동의 이유가 보이기 시작해요.',
    cta: '↓ 기록 칸으로', anchor: 'ob-form',
  },
  monitor: {
    count: ({ d }) => (d.mon || []).length,
    title: '아직 행동 데이터가 없어요',
    text: '날짜와 그날 횟수 하나만 적고 저장하면 돼요. 중재 전(A·기초선) 5일쯤 모은 뒤 중재(B)를 시작해요.',
    cta: '↓ 입력 칸으로', anchor: 'mon-form',
  },
  eval: {
    count: ({ d }) => (d.mon || []).length,
    title: '그래프로 그릴 데이터가 아직 없어요',
    text: "'행동 데이터 기록'에서 하루 횟수를 적으면 여기 그래프가 저절로 그려져요.",
    cta: '행동 데이터 적으러 가기 →', go: 'monitor',
  },
  qabf: {
    count: ({ d }) => (d.abc || []).length,
    title: '관찰 기록(ABC)을 먼저 모으면 답하기 쉬워요',
    text: '행동의 이유 찾기는 지금 바로 답해도 되지만, 관찰 기록이 3건쯤 있으면 훨씬 정확해져요.',
    cta: '관찰 기록 먼저 →', go: 'observe',
  },
  bip: {
    count: ({ d }) => (d.abc || []).length + (d.qabf ? 1 : 0),
    title: '계획의 근거가 될 기록이 아직 없어요',
    text: '중재 계획은 관찰 기록(ABC)과 행동의 이유 찾기(QABF)를 바탕으로 세워요. 먼저 관찰 기록부터 남겨 보세요.',
    cta: '관찰 기록 먼저 →', go: 'observe',
  },
  iep: {
    count: ({ iepCount }) => (iepCount == null ? 1 : iepCount),
    title: '아직 저장한 IEP 목표가 없어요',
    text: "첫 목표는 ① 'A. 성취기준 먼저' 고르기 → ② 성취기준 하나 누르기 → ③ '규칙 초안' → 💾 저장 순서면 돼요.",
    cta: '↓ 시작 칸으로', anchor: 'iep-path',
  },
  iepReport: {
    count: ({ iepCount }) => (iepCount == null ? 1 : iepCount),
    title: '계획서에 채울 IEP 목표가 아직 없어요',
    text: "'IEP 목표 만들기'에서 목표를 저장하면 여기 계획서가 저절로 채워지고 Word로 내려받을 수 있어요.",
    cta: 'IEP 목표 만들러 가기 →', go: 'iep',
  },
};

/** 지금 화면에 보일 '첫 할 일'(없으면 null). 학생 데이터가 아직 안 왔으면 null(깜빡임 방지). */
export function firstStepFor(page, { curStu, curStuData, curStuDataLoaded, iepCount } = {}) {
  const cfg = FIRST_STEPS[page];
  if (!cfg || !curStu || !curStuDataLoaded) return null;
  const n = cfg.count({ d: curStuData || {}, iepCount });
  return n > 0 ? null : { page, ...cfg };
}

// ── 방법 4: 홈 '시작하기' 체크리스트 ─────────────────────────────────
// 내 학생 = 샘플(is_sample)이 아닌 학생. 항목은 하는 순서대로, 다 하면 체크리스트가 저절로 사라진다.
// escort: 🧭 길잡이(다른 세션)가 main에 들어오면 같은 id의 길을 바로 띄운다(없으면 화면 이동).
export function buildChecklist({ classes, students, summaries } = {}) {
  const own = (students || []).filter((s) => !s.is_sample);
  const sum = summaries || {};
  const anyOwn = (key) => own.some((s) => ((sum[s.id] || {})[key] || 0) > 0);
  const cls = (classes || [])[0];
  return [
    { id: 'class', title: '우리 반 준비', done: (classes || []).length > 0,
      sub: cls ? `'${cls.name}'이 준비돼 있어요. 이름은 위쪽 ⚙에서 바꿀 수 있어요.` : '위쪽 ⚙에서 반을 만들어요.', action: 'manageClasses', cta: '⚙ 반 관리' },
    { id: 'student', title: '내 학생 등록', done: own.length > 0,
      sub: '실명 대신 "학생A" 같은 코드로 등록해요.', action: 'addStudent', cta: '＋ 학생 등록', escort: 'start' },
    { id: 'abc', title: '첫 관찰 기록(ABC) 남기기', done: anyOwn('abc_count'),
      sub: '행동 앞·행동·뒤를 칩으로 눌러 남겨요.', page: 'observe', cta: '관찰 기록 →', escort: 'abc', needsStudent: true },
    { id: 'iep', title: '첫 IEP 학기 목표 저장', done: anyOwn('iep_count'),
      sub: '성취기준 하나 고르고 규칙 초안으로 바로 채워요.', page: 'iep', cta: 'IEP 목표 →', escort: 'iep', needsStudent: true },
    { id: 'monitor', title: '첫 행동 데이터(하루 횟수) 적기', done: anyOwn('mon_count'),
      sub: '숫자 하나면 결과 그래프가 그려지기 시작해요.', page: 'monitor', cta: '행동 데이터 →', escort: 'monitor', needsStudent: true },
  ];
}

/** 체크리스트 진행 — 다음 할 항목(첫 미완료)과 완료 수. */
export function checklistProgress(items) {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, next: items.find((i) => !i.done) || null, complete: done === items.length };
}

// ── 방법 6: 화면 소개 한 줄 — 문구는 도움말(lib/helpText.js PAGE_HELP.what)을 읽기만 한다 ──
// 홈(인사말이 있음)·관리자 화면은 빼고, 사용자가 숨긴 화면도 뺀다.
export const INTRO_SKIP = ['home', 'admin'];
/** '이 화면은 …곳이에요(…). 둘째 문장…' → 첫 문장만(둘째 문장부터는 ❓ 도움말에서). */
export function firstSentence(text) {
  return String(text || '').split(/(?<=[.!?])\s+/)[0];
}
export const introHideKey = (page) => 'kb_intro_hide:' + page;
export const INTRO_ALL_OFF_KEY = 'kb_intro_off';
