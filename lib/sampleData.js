// 샘플 체험용 학생 2명 + 4주치 기록(ABC·QABF·BIP·행동 데이터·충실도·Phase 구간).
// 목적: 신규 사용자가 데이터 입력 없이 '관찰 → 기능평가 → BIP → 모니터링 → 평가'
// 전체 흐름과 채워진 차트(기초선/중재 비교, 효과크기)를 바로 볼 수 있게 한다.
//
// - 날짜는 호출 시점 기준 과거 4주(주말 제외)로 상대 생성 → 언제 눌러도 최신처럼 보인다.
// - QABF 25문항은 기능이 1~5번 순서(관심·회피·자동감각·신체·강화물)로 순환하므로
//   index % 5 로 기능별 점수를 배치한다 (lib/qabf.js 참고).
// - 서버(pages/api/students/sample.js)에서만 사용한다.

// 오늘로부터 workdaysAgo 근무일(월~금) 전 날짜를 'YYYY-MM-DD'로 반환.
function workdayBefore(n) {
  const d = new Date();
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

// QABF 25문항 응답 생성 — 주기능은 2~3점, 나머지는 0~1점.
// pattern: { attention: [문항별 3점], ... } 대신 간단히 기능별 대표 점수 배열.
function qabfResponses(scoresByFn) {
  // scoresByFn: { attention:[..5개], escape:[..], sensory:[..], physical:[..], tangible:[..] }
  const order = ['attention', 'escape', 'sensory', 'physical', 'tangible'];
  const res = new Array(25).fill(0);
  for (let i = 0; i < 25; i++) {
    const fn = order[i % 5];
    const row = Math.floor(i / 5);
    res[i] = scoresByFn[fn][row];
  }
  return res;
}

// ── 샘플 학생 정의 ──────────────────────────────────────────────────────────
// 두 학생이 서로 다른 행동 기능(관심 / 회피)을 보여 QABF·BIP의 차이를 체험할 수 있다.
export function buildSampleStudents() {
  return [
    {
      student_code: '샘플A',
      level: '초등',
      grade: '초2',
      disability: '지적장애',
      note: '[샘플] 수업 중 큰 소리로 교사를 부르며 자리에서 일어나는 행동. 관심 기능 추정 예시.',
      strengths: '노래와 율동을 좋아하고, 칭찬받으면 과제 지속 시간이 길어짐. 또래에게 먼저 인사함.',
      difficulties: '교사가 다른 학생을 지도할 때 큰 소리로 교사를 부르며 자리에서 일어남(1시간 6~8회).',
      qabf: qabfResponses({
        attention: [3, 2, 3, 3, 2],   // 주기능: 관심
        escape:    [1, 0, 1, 0, 1],
        sensory:   [0, 1, 0, 0, 0],
        physical:  [0, 0, 0, 1, 0],
        tangible:  [1, 0, 1, 0, 0],
      }),
      bip: {
        alt: '손들기 카드를 들어 교사의 관심 요청하기',
        fct: '"선생님, 도와주세요 / 봐 주세요" 카드 교환 훈련 (FCT)',
        crit: '연속 3일, 1시간당 소리지르기 2회 이하 + 손들기 카드 사용 3회 이상',
        prev: '수업 시작 시 개별 역할 부여(자료 나눠주기), 교사 순회 시 샘플A 자리 먼저 경유, 5분마다 비수반적 관심 제공',
        teach: '손들기 카드 사용 모델링→촉진→용암, 기다리기 시각타이머(2분→5분 점증)',
        reinf: '카드로 요청 시 10초 내 반응 + 칭찬, 조용히 과제 수행 5분마다 토큰 1개(토큰 5개=좋아하는 노래 1곡)',
        resp: '소리지르기에는 눈맞춤·언어반응 최소화(계획된 무시), 카드 사용 즉시 관심 전환',
      },
      // 관찰(ABC) — 기초선 기간의 대표 장면 5건
      abc: [
        { d: 19, time: '국어 시간 · 교실', a: '교사가 다른 학생의 읽기를 지도하고 있음', b: '"선생님!"을 크게 3회 반복하며 자리에서 일어남', c: '교사가 다가가 자리에 앉도록 지도함(관심 제공)' },
        { d: 18, time: '수학 시간 · 교실', a: '학습지 배부 후 교사가 교탁으로 이동', b: '책상을 두드리며 큰 소리로 교사를 부름', c: '교사가 이름을 부르며 제지함' },
        { d: 16, time: '통합 미술 시간', a: '모둠 활동 중 교사가 옆 모둠을 지도', b: '자리에서 일어나 교사 옆으로 감', c: '자리로 돌아가라고 말하며 어깨를 잡아 안내함' },
        { d: 15, time: '국어 시간 · 교실', a: '개별 과제 시작 5분 경과, 교사 순회 없음', b: '"이거 다 했어요!"를 반복해서 외침', c: '교사가 확인하러 와서 칭찬함' },
        { d: 12, time: '점심시간 직전', a: '급식 준비로 교사가 분주함', b: '큰 소리로 노래를 부르며 교사를 쳐다봄', c: '교사가 웃으며 조용히 하라고 함' },
      ],
      // 행동 데이터 — 기초선(A) 2주 → 중재(B) 2주, 빈도 감소 추세(PND·Tau-U 잘 보이게)
      monitor: [
        { d: 19, phase: 'A', freq: 7, dur: 3, int: 3 },
        { d: 18, phase: 'A', freq: 8, dur: 4, int: 3 },
        { d: 17, phase: 'A', freq: 6, dur: 3, int: 2 },
        { d: 16, phase: 'A', freq: 8, dur: 4, int: 3 },
        { d: 15, phase: 'A', freq: 7, dur: 3, int: 3 },
        { d: 12, phase: 'A', freq: 6, dur: 3, int: 2 },
        { d: 11, phase: 'A', freq: 7, dur: 3, int: 3 },
        { d: 9,  phase: 'B', freq: 5, dur: 2, int: 2, alt: 'Y' },
        { d: 8,  phase: 'B', freq: 4, dur: 2, int: 2, alt: 'Y' },
        { d: 7,  phase: 'B', freq: 4, dur: 1.5, int: 2, alt: 'Y' },
        { d: 5,  phase: 'B', freq: 3, dur: 1, int: 1, alt: 'Y' },
        { d: 4,  phase: 'B', freq: 2, dur: 1, int: 1, alt: 'Y' },
        { d: 2,  phase: 'B', freq: 2, dur: 0.5, int: 1, alt: 'Y' },
        { d: 1,  phase: 'B', freq: 1, dur: 0.5, int: 1, alt: 'Y' },
      ],
      behaviorLabel: '수업 중 소리지르기',
      fidelity: [
        { d: 9, score: 3 }, { d: 7, score: 4 }, { d: 4, score: 4 }, { d: 1, score: 4 },
      ],
      periods: [
        { tier: 'baseline', startD: 19, endD: 10, note: '기초선 — 중재 전 2주' },
        { tier: 'tier3', startD: 9, endD: null, note: 'BIP 적용(FCT + 계획된 무시)' },
      ],
      // IEP 영역 체험용 — 출발점 분석(모듈1) 산출물 + IEP 목표 1건
      startpoint: {
        guardian: '집에서 그림책 표지를 보고 아는 낱말을 말함. 이름 쓰기를 어려워해 연필 잡기를 싫어함.',
        observation: '교사가 다른 학생을 지도할 때 큰 소리로 교사를 부르며 자리에서 일어남(1시간 6~8회).',
        fba: 'QABF 추정 주요 기능: 관심(심각도 13/15)',
        strengths: '노래와 율동을 좋아함. 칭찬받으면 과제 지속 시간이 길어짐. 또래에게 먼저 인사함.',
        eco: '3인 가족. 방과후 돌봄교실 이용. 소근육 발달 지연으로 작업치료 주 1회.',
        supportNeeds: '주의 전환 시 시각 단서 필요, 쓰기 활동에 굵은 연필·보조 그립 지원',
        functions: '관심 요청 기능 → 손들기 카드로 관심 요청하기를 가르칠 핵심기술로 선정',
        perfLevel: '자모 수준에서 글자-소리 연결 시작. 받침 없는 낱말을 그림과 함께 제시하면 읽음.',
      },
      iep: [{
        subject: '국어', area: '읽기', grade_code: 2,
        crit_type: 'rate', crit_start: 30, crit_end: 80,
        plop: '자모 수준에서 글자의 소리를 연결하기 시작함. 받침 없는 낱말을 그림과 함께 제시하면 읽을 수 있음. 연필을 잡고 자신의 이름을 보고 따라 쓸 수 있으나 글자 크기 조절이 어려움.',
        semester_goal: '- 받침 없는 낱말 20개를 그림 단서와 함께 소리 내어 읽는다\n- 첫소리를 듣고 해당하는 글자 카드를 고른다\n- 자신의 이름을 보고 바르게 따라 쓴다',
        eval_foci: ['그림 단서를 보고 받침 없는 낱말을 소리 내어 읽는가', '낱말의 첫소리를 듣고 글자를 고르는가', '이름 글자를 획순에 맞게 따라 쓰는가'],
        monthly: [
          { goal: '자음자·모음자 소리 연결하기', content: '자모 카드 놀이, 소리-글자 짝짓기', methods: ['직접교수', '그림 단서', '반복 연습'], eval_plan: '- 자모 10개 중 몇 개의 소리를 연결하는가?' },
          { goal: '받침 없는 낱말 5개 읽기', content: '그림-낱말 카드 매칭, 소리 내어 읽기', methods: ['그림 단서', '모델링 후 따라 읽기'], eval_plan: '- 그림 단서와 함께 낱말 5개를 읽는가?' },
          { goal: '받침 없는 낱말 10개 읽기', content: '낱말 카드 읽기, 교실 사물 이름표 읽기', methods: ['환경 중심 교수', '시간지연'], eval_plan: '- 사물 이름표 10개를 읽는가?' },
          { goal: '받침 없는 낱말 20개 읽기 + 이름 따라 쓰기', content: '누적 낱말 읽기, 이름 획순 따라 쓰기', methods: ['누적 복습', '점진적 촉진 줄이기'], eval_plan: '- 누적 낱말 20개 중 몇 개를 독립적으로 읽는가?' },
          { goal: '배운 낱말 유지·일반화', content: '그림책에서 배운 낱말 찾기, 낱말 빙고', methods: ['일반화 훈련', '또래 활동'], eval_plan: '- 새로운 자료에서 배운 낱말을 찾아 읽는가?' },
        ],
      }],
    },
    {
      student_code: '샘플B',
      level: '초등',
      grade: '초4',
      disability: '자폐성장애',
      note: '[샘플] 쓰기 과제 제시 시 책상에 엎드리거나 자리를 이탈하는 행동. 회피 기능 추정 예시.',
      strengths: '숫자와 퍼즐에 강점. 시각 일과표를 잘 따르고, 좋아하는 활동은 20분 이상 집중함.',
      difficulties: '쓰기 과제가 제시되면 책상에 엎드리거나 교실 뒤로 이동함(과제당 1~2회).',
      qabf: qabfResponses({
        attention: [0, 1, 0, 0, 0],
        escape:    [3, 3, 2, 3, 2],   // 주기능: 회피
        sensory:   [1, 0, 1, 0, 0],
        physical:  [0, 0, 1, 0, 0],
        tangible:  [0, 1, 0, 0, 1],
      }),
      bip: {
        alt: '쉬는 시간 요청 카드("잠깐 쉬고 싶어요") 사용하기',
        fct: '휴식 요청 카드 교환 훈련 — 카드 제시 시 2분 휴식 허용',
        crit: '연속 3일, 과제 이탈 1회 이하 + 휴식 카드로 요청하기 2회 이상',
        prev: '쓰기 과제를 2~3문장 단위로 분할 제시, 과제 전 시각 일과표로 예고, 선호 활동(퍼즐)을 과제 뒤에 배치(프리맥)',
        teach: '휴식 카드 사용 모델링, 과제 시작 전 선택 기회 제공(연필/색펜, 순서 선택)',
        reinf: '과제 1단위 완수 시 즉시 토큰, 토큰 3개=퍼즐 5분. 카드 요청 시 즉시 휴식 제공',
        resp: '엎드리기에는 과제 면제 없이 잠시 대기 후 축소된 과제 재제시, 이탈 시 언어 최소화하고 자리로 안내',
      },
      abc: [
        { d: 19, time: '국어 쓰기 시간', a: '받아쓰기 공책을 나눠줌', b: '공책을 밀어내고 책상에 엎드림', c: '교사가 달래며 과제량을 줄여줌(과제 회피)' },
        { d: 17, time: '국어 쓰기 시간', a: '"세 문장 쓰세요"라고 지시함', b: '자리에서 일어나 교실 뒤 매트로 이동', c: '교사가 따라가 자리로 데려옴, 과제 시간 단축' },
        { d: 16, time: '수학 시간 · 서술형', a: '풀이 과정을 쓰라고 안내', b: '연필을 던지고 엎드림', c: '문제 수를 줄여줌' },
        { d: 12, time: '알림장 쓰기', a: '알림장을 쓰라고 전체 지시', b: '책상 밑으로 들어감', c: '교사가 대신 써 줌' },
        { d: 11, time: '국어 쓰기 시간', a: '어제 쓰던 글 이어쓰기 제시', b: '"싫어"라고 말하며 엎드림', c: '5분 뒤 짝이 도와주기로 함' },
      ],
      monitor: [
        { d: 19, phase: 'A', freq: 4, dur: 8, int: 2 },
        { d: 18, phase: 'A', freq: 3, dur: 6, int: 2 },
        { d: 17, phase: 'A', freq: 4, dur: 9, int: 3 },
        { d: 16, phase: 'A', freq: 3, dur: 7, int: 2 },
        { d: 15, phase: 'A', freq: 4, dur: 8, int: 3 },
        { d: 12, phase: 'A', freq: 3, dur: 6, int: 2 },
        { d: 11, phase: 'A', freq: 4, dur: 8, int: 2 },
        { d: 9,  phase: 'B', freq: 3, dur: 5, int: 2, alt: 'Y' },
        { d: 8,  phase: 'B', freq: 2, dur: 4, int: 2, alt: 'Y' },
        { d: 7,  phase: 'B', freq: 2, dur: 3, int: 1, alt: 'Y' },
        { d: 5,  phase: 'B', freq: 1, dur: 2, int: 1, alt: 'Y' },
        { d: 4,  phase: 'B', freq: 1, dur: 2, int: 1, alt: 'Y' },
        { d: 2,  phase: 'B', freq: 1, dur: 1, int: 1, alt: 'Y' },
        { d: 1,  phase: 'B', freq: 0, dur: 0, int: 0, alt: 'Y' },
      ],
      behaviorLabel: '쓰기 과제 이탈(엎드리기·자리이탈)',
      fidelity: [
        { d: 9, score: 3 }, { d: 7, score: 3 }, { d: 4, score: 4 }, { d: 1, score: 4 },
      ],
      periods: [
        { tier: 'baseline', startD: 19, endD: 10, note: '기초선 — 중재 전 2주' },
        { tier: 'tier3', startD: 9, endD: null, note: 'BIP 적용(휴식 카드 FCT + 과제 분할)' },
      ],
      startpoint: {
        guardian: '집에서 숫자 세기와 퍼즐을 즐김. 숙제 중 쓰기가 나오면 방으로 들어가 버림.',
        observation: '쓰기 과제가 제시되면 책상에 엎드리거나 교실 뒤로 이동함(과제당 1~2회).',
        fba: 'QABF 추정 주요 기능: 회피(심각도 13/15)',
        strengths: '숫자와 퍼즐에 강점. 시각 일과표를 잘 따르고, 좋아하는 활동은 20분 이상 집중함.',
        eco: '조부모 동거 가정. 지역 복지관 사회성 프로그램 주 1회 참여.',
        supportNeeds: '과제 분할 제시, 시각 일과표로 사전 예고, 휴식 요청 수단(카드) 제공',
        functions: '과제 회피 기능 → 휴식 요청 카드 사용을 가르칠 핵심기술로 선정',
        perfLevel: '10까지 수 세기와 일대일 대응 가능. 5 이하 덧셈을 구체물로 해결함.',
      },
      iep: [{
        subject: '수학', area: '수와 연산', grade_code: 4,
        crit_type: 'freq', crit_start: 3, crit_end: 8,
        plop: '10까지 수 세기와 일대일 대응이 가능함. 구체물을 사용하면 5 이하의 덧셈을 해결함. 문제 풀이 과정을 쓰는 활동에는 거부감이 큼.',
        semester_goal: '- 구체물을 사용하여 10 이하의 덧셈을 해결한다\n- 반구체물(그림)을 보고 5 이하의 덧셈식을 만든다\n- 풀이 과정을 쓰는 대신 수 카드로 식을 구성한다',
        eval_foci: ['구체물로 10 이하 덧셈을 해결하는가', '그림을 보고 덧셈 상황을 식으로 나타내는가', '수 카드로 식을 구성하는가'],
        monthly: [
          { goal: '구체물로 5 이하 덧셈 복습', content: '블록·바둑돌 모으기 활동', methods: ['구체물 조작', '직접교수'], eval_plan: '- 구체물로 5 이하 덧셈 10문제 중 몇 개를 해결하는가?' },
          { goal: '구체물로 10 이하 덧셈', content: '두 묶음 모아 세기, 수 카드 식 만들기', methods: ['구체물 조작', '과제 분할'], eval_plan: '- 구체물로 10 이하 덧셈을 해결하는가?' },
          { goal: '반구체물(그림)로 5 이하 덧셈', content: '그림 보고 모으기 상황 말하기·식 만들기', methods: ['반구체물', '모델링'], eval_plan: '- 그림을 보고 덧셈식을 만드는가?' },
          { goal: '반구체물로 10 이하 덧셈', content: '그림 카드 + 수 카드로 식 구성', methods: ['반구체물', '점진적 촉진 줄이기'], eval_plan: '- 그림을 보고 10 이하 덧셈식을 구성하는가?' },
          { goal: '생활 장면 덧셈 일반화', content: '간식 나누기·학용품 세기 상황 덧셈', methods: ['일반화 훈련', '자연 강화'], eval_plan: '- 생활 장면에서 덧셈을 적용하는가?' },
        ],
      }],
    },
  ];
}

export { workdayBefore };
