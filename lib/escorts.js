// 🧭 길잡이(에스코트) 길 정의 — 선생님이 고른 일 하나를 화면 위에서 한 단계씩 데려다 준다 (1001 사용자 결정).
//
// 투어(lib/tours.js)는 '이 화면에 무엇이 있나'를 차례로 설명하고, 길잡이는 '이 일을 끝내려면 지금 어디를 누르나'를
// 짚는다. 단계는 선생님이 실제로 하면 저절로 넘어간다(판정 규칙은 lib/escortEngine.js 머리말).
//
// 단계 필드:
//   id      길 안에서 고유한 이름(사건 단계의 '했음' 기록 키)
//   title   패널 점검표에 보일 짧은 이름
//   say     지금 단계일 때 패널에 크게 보일 안내 — 쉬운 말, 1~2문장
//   el      짚을 앵커 키(data-help/data-tour 값, '#아이디'도 됨). 없고 done.page면 사이드바 메뉴/홈 영역 카드를 짚는다
//   done    무엇이 되면 끝인가 — lib/escortEngine.js
//   go      '바로 가기' 단추: { action: 'openAddStudent'|'openManageClasses'|'openPickStudent', label } (화면 가기 단계는 자동)
//   optional true면 '건너뛰기' 단추
//   onlyIf / skipIf  { has: '앵커' } — 그 앵커가 화면에 있을 때만/없을 때만 해당하는 단계(경로가 갈리는 IEP)
//
// 새 길을 넣으려면: ① 여기 ESCORTS에 길 ② 짚을 곳에 data-help 앵커(+ lib/helpText.js 문구)
// ③ 단추 저장 화면이면 저장 성공 직후 escortSignal('종류')(lib/escortSignal.js).
// lib/utils/__tests__/escort.test.js가 앵커·화면 id·신호가 실제로 있는지 검사한다.

export const ESCORTS = {
  start: {
    id: 'start',
    icon: '🚀',
    title: '처음 시작하기',
    desc: '반 확인 → 학생 등록 → 학생 고르기',
    steps: [
      {
        id: 'class',
        title: '우리 반 확인',
        say: '위쪽에서 년도·학기·반이 맞는지 봐요. 반이 없으면 ⚙ 단추로 만들어요.',
        el: 'stu-bar',
        done: { hasClass: true },
        go: { action: 'openManageClasses', label: '⚙ 반 만들기 열기' },
      },
      {
        id: 'student',
        title: '학생 등록',
        say: '위쪽 ＋ 단추를 눌러 학생을 등록해요. 실명 대신 "A학생" 같은 학생 코드로 적어요.',
        el: 'add-student',
        done: { hasStudents: true },
        go: { action: 'openAddStudent', label: '＋ 학생 등록 열기' },
      },
      {
        id: 'pick',
        title: '학생 고르기',
        say: '위쪽 학생 칸에서 오늘 기록할 학생을 골라요.',
        el: 'stu-bar',
        done: { student: true },
        go: { action: 'openPickStudent', label: '학생 고르기 열기' },
      },
    ],
    finish: '준비가 끝났어요. 이제 하고 싶은 일을 골라 주세요.',
    next: ['abc', 'monitor', 'iep'],
  },

  abc: {
    id: 'abc',
    icon: '✍️',
    title: '행동 기록 남기기 (ABC)',
    desc: '그 일이 있기 전·행동·그 뒤를 짧게 적기',
    steps: [
      {
        id: 'pick',
        title: '학생 고르기',
        say: '기록할 학생을 먼저 골라요.',
        el: 'stu-bar',
        done: { student: true },
        go: { action: 'openPickStudent', label: '학생 고르기 열기' },
      },
      {
        id: 'page',
        title: '관찰 기록 화면으로',
        say: "왼쪽 메뉴에서 '행동 관찰 기록 (ABC)'을 눌러요.",
        done: { page: 'observe' },
      },
      {
        id: 'write',
        title: '앞·행동·뒤 적기',
        say: '그 일이 있기 전(A), 학생이 한 행동(B), 그 뒤에 어떻게 됐는지(C)를 짧게 적어요. 칩을 눌러 골라도 돼요.',
        el: 'ob-form',
        done: { input: true },
      },
      {
        id: 'save',
        title: '저장',
        say: "세 칸을 다 채웠으면 '저장'을 눌러요.",
        el: 'ob-save',
        done: { signal: 'abc-saved' },
      },
    ],
    finish: '관찰 기록이 저장됐어요. 몇 번 쌓이면 행동의 이유(기능)를 찾을 수 있어요.',
    next: ['monitor'],
  },

  monitor: {
    id: 'monitor',
    icon: '📈',
    title: '행동 횟수 매일 적기',
    desc: '오늘 몇 번·몇 분이었는지 숫자로 남기기',
    steps: [
      {
        id: 'pick',
        title: '학생 고르기',
        say: '기록할 학생을 먼저 골라요.',
        el: 'stu-bar',
        done: { student: true },
        go: { action: 'openPickStudent', label: '학생 고르기 열기' },
      },
      {
        id: 'page',
        title: '행동 데이터 화면으로',
        say: "왼쪽 메뉴에서 '행동 데이터 기록'을 눌러요.",
        done: { page: 'monitor' },
      },
      {
        id: 'tab',
        title: '문제행동 칸 열기',
        say: "위쪽 탭에서 '🔴 문제행동 데이터'를 눌러요.",
        el: 'mon-tabs',
        done: { appear: 'mon-form' },
      },
      {
        id: 'write',
        title: '오늘 숫자 적기',
        say: '대상 행동을 고르고 오늘 횟수·시간·강도를 적어요. 어제와 같으면 "최근과 같게"로 채워도 돼요.',
        el: 'mon-form',
        done: { input: true },
      },
      {
        id: 'save',
        title: '저장',
        say: "다 적었으면 '저장'을 눌러요.",
        el: 'mon-save',
        done: { signal: 'monitor-saved' },
      },
    ],
    finish: '오늘 숫자가 저장됐어요. 매일 쌓이면 결과 평가에서 좋아졌는지 그래프로 볼 수 있어요.',
    next: ['abc'],
  },

  iep: {
    id: 'iep',
    icon: '📘',
    title: 'IEP 학기 목표 쓰기',
    desc: '성취기준 고르기 → 목표 → 월별 계획 → 저장',
    steps: [
      {
        id: 'pick',
        title: '학생 고르기',
        say: '목표를 쓸 학생을 먼저 골라요.',
        el: 'stu-bar',
        done: { student: true },
        go: { action: 'openPickStudent', label: '학생 고르기 열기' },
      },
      {
        id: 'page',
        title: 'IEP 목표 화면으로',
        say: "왼쪽 메뉴에서 'IEP 목표 만들기'를 눌러요.",
        done: { page: 'iep' },
      },
      {
        id: 'path',
        title: '만드는 순서 고르기',
        say: '성취기준부터(A) 할지, 학생에게 필요한 목표부터(B) 쓸지 골라요. 잘 모르겠으면 A를 누르세요.',
        el: 'iep-path',
        done: { click: true },
        optional: true,
      },
      {
        id: 'func',
        title: '행동 기능·대체행동',
        say: '경로 B예요. 행동의 이유(기능)와 대신 가르칠 행동을 적어요.',
        el: 'iep-func',
        done: { input: true },
        onlyIf: { has: 'iep-func' },
      },
      {
        id: 'std',
        title: '성취기준 고르기',
        say: '목록에서 학생에게 맞는 성취기준을 하나 눌러요. 위쪽 칸으로 좁혀서 찾을 수 있어요.',
        el: 'iep-std',
        done: { appear: 'iep-std-picked' },
        skipIf: { has: 'iep-func' },
      },
      {
        id: 'goal',
        title: '학기 목표',
        say: '학기 목표 칸에 문장을 적어요. AI가 켜져 있으면 "AI로 쓰기"를 눌러도 돼요.',
        el: 'iep-goal',
        done: { appear: '#iep-editor' },
      },
      {
        id: 'month',
        title: '월별 계획 만들기',
        say: "'규칙 초안'을 누르면 월별 계획이 바로 채워져요. 학생 기록을 반영하려면 'AI 생성'(3~5분)을 눌러요.",
        el: 'iep-month-gen',
        done: { appear: 'iep-save' },
      },
      {
        id: 'save',
        title: '저장',
        say: "월별 계획을 훑어보고 '💾 IEP 목표 저장'을 눌러요. 고친 곳은 저장 뒤에도 다시 고칠 수 있어요.",
        el: 'iep-save',
        done: { signal: 'iep-goal-saved' },
      },
    ],
    finish: 'IEP 목표가 저장됐어요. "IEP 계획서"에서 Word로 내려받거나 인쇄할 수 있어요.',
    next: [],
  },
};

/** 메뉴에 보일 순서. */
export const ESCORT_ORDER = ['start', 'abc', 'monitor', 'iep'];

export const getEscort = (id) => ESCORTS[id] || null;
