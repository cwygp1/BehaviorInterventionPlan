// 체험 시연 대본(mds/46 §2-2) — 6장, 약 3분. 화면 조작 단계를 데이터로 적는다(실행: lib/demo/exec.js).
//
// 단계 종류(t):
//   say      자막만            { text, ms? }
//   point    짚기(테두리)      { el, text?, contains?, match?, ms?, optional? }
//   go       화면 이동         { page, ready }           ready = 도착 확인 앵커
//   click    누르기            { el, contains?, match?, expectMore?, text?, optional? }
//                              expectMore = 누르기 전보다 그 앵커 수가 늘 때까지 기다림(저장 확인)
//   type     글자 치기         { el | label+within, value, text? }   label = 칸 이름 앞부분
//   fill     바로 채우기       (type과 같고 글자 치기 없이)
//   select   고르기            { el | label+within, value, text? }
//   wait     나타날 때까지     { el, timeout?, optional? }
//   waitGone 사라질 때까지     { el, timeout? }
//
// 앵커(el·within·ready·expectMore)는 data-demo / data-help / data-tour 값 또는 '#id'·'[...]' 선택자.
// 화면 문구·앵커가 바뀌면 시연이 멈추므로 테스트(demo.test.js)가 앵커가 소스에 있는지 검사한다.
// AI는 부르지 않는다(D2) — AI 자리는 자막으로만 알려 준다.

export const DEMO_STEP_TYPES = ['say', 'point', 'go', 'click', 'type', 'fill', 'select', 'wait', 'waitGone'];

export const DEMO_STUDENT = '학생A';
export const DEMO_STANDARD = '2국어01-02'; // 표정과 몸짓으로 감정이나 요구를 표현한다 — 소리 지르기 대신 쓸 표현과 이어짐
export const DEMO_BEHAVIOR = '소리 지르기';
// 기초선(A) 5일 → 중재(B) 5일. B에서 줄어드는 모양이 그래프에서 바로 보이도록.
export const DEMO_FREQ = [6, 7, 5, 8, 6, 4, 3, 3, 2, 1];
export const DEMO_PHASE_SWITCH = 5;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** today 이전(오늘 제외) 평일 n일을 오래된 날부터. 브라우저 현지 날짜 기준. */
export function schoolDaysBefore(today, n) {
  const out = [];
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (out.length < n) {
    d.setDate(d.getDate() - 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) out.unshift(ymd(d));
  }
  return out;
}

function monitorSteps(today) {
  const dates = schoolDaysBefore(today, DEMO_FREQ.length);
  const steps = [];
  DEMO_FREQ.forEach((f, i) => {
    const slow = i < 2; // 처음 이틀만 글자를 치며 보여 주고 나머지는 빠르게
    if (i === DEMO_PHASE_SWITCH) {
      steps.push({ t: 'say', text: "이제 소리 지르는 대신 '그림 카드로 요구하기'를 가르쳤다고 해 볼게요. 단계를 B(중재)로 바꿔요.", ms: 3200 });
      steps.push({ t: 'click', el: 'mon-phase', match: '.qchip', contains: 'B · 중재' });
    }
    if (i === 2) steps.push({ t: 'say', text: '나머지 날은 빠르게 넣을게요.', ms: 1400 });
    steps.push({ t: 'fill', within: 'mon-form', label: '기록 날짜', value: dates[i], text: i === 0 ? '행동을 본 날짜를 적고…' : undefined });
    steps.push({ t: slow ? 'type' : 'fill', within: 'mon-form', label: '발생 빈도', value: String(f), text: i === 0 ? '그날 몇 번 했는지 숫자 하나를 적어요.' : undefined });
    steps.push({ t: 'click', el: 'mon-save', expectMore: 'mon-row', ms: slow ? 900 : 250, text: i === 0 ? "'데이터 저장'을 누르면 끝이에요." : undefined });
  });
  return steps;
}

/** @param {{ today?: Date }} [o] */
export function buildDemoScript(o = {}) {
  const today = o.today || new Date();
  return [
    {
      id: 'start',
      title: '시작',
      steps: [
        { t: 'go', page: 'home', ready: 'stu-bar' },
        { t: 'say', text: '꼬박꼬박에 오신 걸 환영해요. 3분 동안 화면이 저절로 움직이며 한 바퀴를 보여 드릴게요.', ms: 3200 },
        { t: 'say', text: '언제든 ⏸로 멈추거나, ✋를 눌러 그 자리에서 직접 해 볼 수 있어요.', ms: 2800 },
        { t: 'wait', el: 'stu-bar' },
        { t: 'point', el: 'stu-bar', text: "모든 화면은 여기서 고른 학년도·반을 기준으로 움직여요. 체험용으로 '1반'을 미리 만들어 두었어요.", ms: 3600 },
        { t: 'point', el: 'pcard-iep', text: '홈에서는 IEP·우리 반 전체·표적 학생·한 학생 집중 가운데 일할 영역을 골라요.', ms: 3200, optional: true },
      ],
    },
    {
      id: 'student',
      title: '학생 등록',
      steps: [
        { t: 'point', el: 'add-student', text: '먼저 학생을 등록해요. 위쪽 ＋ 단추를 눌러요.', ms: 2200 },
        { t: 'click', el: 'add-student' },
        { t: 'wait', el: 'stu-add-code' },
        { t: 'type', el: 'stu-add-code', value: DEMO_STUDENT, text: "실명 대신 '학생A' 같은 코드로 적어요." },
        { t: 'select', el: 'stu-add-grade', value: '2', text: '학교급·학년·장애 영역을 고르면 맞는 성취기준을 추천받을 수 있어요.' },
        { t: 'select', el: 'stu-add-dis', value: '지적장애' },
        { t: 'click', el: 'stu-add-next' },
        { t: 'click', el: 'stu-add-strengths', match: '.qchip', contains: '시각자료 이해 우수', text: '강점과 어려움은 칩을 눌러 채워요. AI 초안을 만들 때 이 정보가 쓰여요.' },
        { t: 'click', el: 'stu-add-difficulties', match: '.qchip', contains: '주의집중 시간 짧음' },
        { t: 'click', el: 'stu-add-next' },
        { t: 'point', el: 'stu-add-review', text: '적은 내용을 한 번 확인하고…', ms: 1800 },
        { t: 'click', el: 'stu-add-submit', text: "'등록 완료'를 누르면 학생이 자동으로 선택돼요." },
        { t: 'waitGone', el: 'stu-add-submit' },
      ],
    },
    {
      id: 'abc',
      title: '행동 기록(ABC)',
      steps: [
        { t: 'go', page: 'observe', ready: 'ob-form' },
        { t: 'say', text: "학생이 문제행동을 보이면 '관찰 기록'에 남겨요. 행동 앞(A)·행동(B)·행동 뒤(C) 세 칸이에요.", ms: 3400 },
        { t: 'click', el: 'ob-a', match: '.qchip', contains: '지시 받음', text: 'A — 행동 바로 전에 무슨 일이 있었나요? 칩을 누르면 바로 들어가요.' },
        { t: 'click', el: 'ob-b', match: '.qchip', contains: DEMO_BEHAVIOR, text: 'B — 학생이 실제로 한 행동이에요.' },
        { t: 'click', el: 'ob-c', match: '.qchip', contains: '교사 개입', text: 'C — 행동 바로 뒤에 어떻게 됐나요?' },
        { t: 'click', el: 'ob-save', expectMore: 'ob-row', text: '저장하면 아래 목록에 쌓여요.' },
        { t: 'point', el: 'ob-list', text: '이런 기록이 모이면 행동의 이유(기능)를 찾고, 그에 맞는 중재 계획을 세울 수 있어요.', ms: 3200 },
      ],
    },
    {
      id: 'iep',
      title: 'IEP 목표',
      steps: [
        { t: 'go', page: 'iep', ready: 'iep-path' },
        { t: 'point', el: 'iep-path', text: "IEP 학기 목표는 두 길로 만들어요. 여기서는 'A. 성취기준 먼저'로 해 볼게요.", ms: 3000 },
        { t: 'click', el: 'iep-path', match: 'button', contains: 'A. 성취기준' },
        { t: 'select', within: 'iep-std-filter', label: '교과', value: '국어', text: '교과와 학년군으로 좁혀서 찾아요.' },
        { t: 'select', within: 'iep-std-filter', label: '학년군', value: '2' },
        { t: 'click', el: 'iep-std-row', contains: DEMO_STANDARD, text: "학생에게 맞는 성취기준을 하나 눌러요. '표정과 몸짓으로 요구 표현하기'는 소리 지르기 대신 가르칠 행동과도 이어져요." },
        { t: 'wait', el: 'iep-editor', timeout: 10000 },
        { t: 'point', el: 'iep-goal', text: '고른 성취기준으로 학기 목표 문장이 채워졌어요. 학생에 맞게 고쳐 쓸 수 있어요.', ms: 3200 },
        { t: 'point', el: 'iep-rule-draft', text: "'규칙 초안'을 누르면 월별 계획이 바로 채워져요. AI를 연결하면 학생 기록을 반영한 초안도 만들 수 있어요(체험에서는 꺼 두었어요).", ms: 3800 },
        { t: 'click', el: 'iep-rule-draft' },
        { t: 'wait', el: 'iep-save' },
        { t: 'point', el: 'iep-months', text: '월별 목표·내용·방법·평가 계획이 채워졌어요. 칸마다 고칠 수 있어요.', ms: 3000, optional: true },
        { t: 'click', el: 'iep-save', expectMore: 'iep-saved-row', text: "저장하면 'IEP 계획서'에서 Word로 내려받거나 인쇄할 수 있어요." },
      ],
    },
    {
      id: 'monitor',
      title: '행동 데이터',
      steps: [
        { t: 'go', page: 'monitor', ready: 'mon-tabs' },
        { t: 'click', el: 'mon-tabs', match: 'button', contains: '문제행동' },
        { t: 'wait', el: 'mon-form' },
        { t: 'say', text: '중재가 효과가 있는지 보려면 매일 행동 횟수를 숫자 하나로 적어요. 10일치를 넣어 볼게요.', ms: 3200 },
        { t: 'click', el: 'mon-phase', match: '.qchip', contains: 'A · 기초선', text: '먼저 중재하기 전 수준(A, 기초선)을 5일 모아요.' },
        { t: 'type', within: 'mon-form', label: '기록 대상 행동', value: DEMO_BEHAVIOR, text: '줄이려는 행동 이름을 적고…' },
        ...monitorSteps(today),
        { t: 'point', el: 'mon-list', text: '10일치가 쌓였어요.', ms: 1800 },
      ],
    },
    {
      id: 'eval',
      title: '결과 평가',
      steps: [
        { t: 'go', page: 'eval', ready: 'ev-trend' },
        { t: 'point', el: 'ev-trend', text: '쌓인 숫자가 저절로 그래프가 돼요. 세로선 왼쪽이 A(기초선), 오른쪽이 B(중재)예요.', ms: 4200 },
        { t: 'say', text: 'B에서 선이 내려가면 중재가 효과가 있다는 뜻이에요. 단계마다 평균선도 함께 그려져요.', ms: 3600 },
        { t: 'point', el: 'ev-report', text: "'결과 보고서 생성'을 누르면 그래프와 기록을 묶어 A4 보고서로 뽑을 수 있어요.", ms: 3400, optional: true },
        { t: 'say', text: '여기까지가 한 바퀴예요. 기록 → 계획 → 데이터 → 평가가 한곳에서 이어져요.', ms: 3200 },
      ],
    },
  ];
}

/** 대본에 쓰인 앵커 키 전부(테스트용) — '#'·'['로 시작하는 선택자는 뺀다. */
export function collectAnchors(chapters) {
  const keys = new Set();
  const add = (k) => { if (k && !/^[#[.]/.test(k)) keys.add(k); };
  chapters.forEach((c) => c.steps.forEach((s) => { add(s.el); add(s.within); add(s.ready); add(s.expectMore); }));
  return [...keys];
}
