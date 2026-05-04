// Seed sample data for a single user — 30 days of realistic records.
// Usage:
//   node --env-file=.env.local scripts/seed-sample.js
//
// What it generates per student (10 students total):
//   - ABC observations:    8~12 entries spread over 30 days
//   - Monitor records:     22~26 entries (weekdays only, Phase A days 1-10, Phase B days 11-30)
//   - QABF responses:      1 set (25 items, biased toward one function)
//   - BIP plan:            1 set (alt/fct/crit + 4 strategies)
//   - Fidelity records:    8~10 entries during intervention phase (B)
//   - SZ records:          1~3 entries (mostly during baseline)
//   - CICO records:        18~22 daily entries (weekdays, with goals + per-period scores)
//   - Family letters:      2~3 entries (different categories)
//
// Phase B shows clear improvement over Phase A so charts look meaningful.

const { sql } = require('@vercel/postgres');

const TARGET_EMAIL = 'gbm8810@naver.com';
const SAMPLE_PREFIX = 'S_';
const TOTAL_DAYS = 60;
const PHASE_SWITCH = 30; // First 10 days = Phase A, days 11-30 = Phase B

// ---- Helpers ----
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const isWeekday = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const day = d.getDay();
  return day !== 0 && day !== 6;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---- Sample student profiles ----
const STUDENTS = [
  { code: '민준', level: '초등', dis: '자폐스펙트럼(ASD)', note: '초등 3학년 수준, 제한된 언어 표현, 시각적 일과표 활용', behaviors: ['자리 이탈', '반복 행동'], qabfBias: 3 },
  { code: '서연', level: '초등', dis: '지적장애', note: '초등 5학년 수준, 단순 의사소통 가능, 수 개념 기초 단계', behaviors: ['과제 거부', '소리 지르기'], qabfBias: 1 },
  { code: '도윤', level: '초등', dis: 'ADHD', note: '초등 2학년, 주의 집중 시간 5~10분, 충동성 높음', behaviors: ['자리 이탈', '소리 지르기'], qabfBias: 0 },
  { code: '지유', level: '초등', dis: '정서행동장애', note: '초등 4학년, 분노 조절 어려움, 또래 갈등 빈번', behaviors: ['공격 행동', '울기'], qabfBias: 0 },
  { code: '하준', level: '중등', dis: '지적장애', note: '중등 1학년 수준, 일상생활 일부 독립적, 사회성 훈련 필요', behaviors: ['지시 거부', '자리 이탈'], qabfBias: 1 },
  { code: '채원', level: '중등', dis: '자폐스펙트럼(ASD)', note: '중등 2학년, 한정된 관심사, 변화에 대한 거부 강함', behaviors: ['반복 행동', '소리 지르기'], qabfBias: 3 },
  { code: '시우', level: '초등', dis: '학습장애', note: '초등 6학년, 읽기 유창성 어려움, 정서적 위축', behaviors: ['과제 회피', '울기'], qabfBias: 1 },
  { code: '예린', level: '초등', dis: '발달지연', note: '초등 1학년 수준, 또래보다 전반적 발달 느림', behaviors: ['지시 거부', '자리 이탈'], qabfBias: 2 },
  { code: '준호', level: '중등', dis: '정서행동장애', note: '중등 3학년, 자해 위험 있음, 안정실 이용 이력', behaviors: ['자해', '소리 지르기'], qabfBias: 3 },
  { code: '나윤', level: '초등', dis: '중복중증', note: '초등 1학년, 보조공학기기 사용, 1:1 지원 필요', behaviors: ['거부 행동', '울기'], qabfBias: 2 },
];

const ABC_TEMPLATES = [
  { time: '1교시 / 교실', a: '수학 익힘책 15쪽 풀라고 지시했을 때', b: '"싫어!"라고 외치며 책을 바닥에 던짐', c: '교사가 다가가 "잠시 쉬자"고 안내, 과제 일시 보류' },
  { time: '2교시 / 교실', a: '집단 활동 시작 직전', b: '책상에서 일어나 교실 뒤편으로 이동', c: '보조교사가 자리로 안내함' },
  { time: '쉬는 시간 / 복도', a: '또래가 좋아하는 장난감을 가져갔을 때', b: '또래를 밀치며 소리 지름', c: '교사가 둘을 분리하고 사회적 이야기 사용' },
  { time: '3교시 / 통합학급', a: '예고 없이 일과표 변경됨', b: '귀를 막고 책상에 엎드려 울기 시작', c: '시각적 일과표 다시 보여주며 변경 사항 설명' },
  { time: '4교시 / 특별실', a: '발표 차례가 왔을 때', b: '"못 해요"를 반복하며 자리에 머무름', c: '교사가 단계별 촉진(시각 카드 → 모델링) 제공' },
  { time: '점심 시간 / 급식실', a: '낯선 반찬이 식판에 놓였을 때', b: '식판을 밀어내고 자리에서 일어남', c: '대체 음식을 제공하고 한 입 시도 과제로 전환' },
  { time: '5교시 / 운동장', a: '체육 활동 중 규칙 설명할 때', b: '대열을 이탈해 혼자 다른 곳으로 감', c: '시각적 신호로 부르고 활동 다시 안내' },
  { time: '아침 등교 / 교실 입구', a: '교실에 들어가야 할 때', b: '복도에 멈춰 서서 움직이지 않음', c: '5분간 대기 시간 제공, 시각적 카운트다운 사용' },
];

const QABF_TEMPLATE = (seed) => {
  const out = [];
  for (let i = 0; i < 25; i++) {
    const cat = i % 4;
    const isTarget = cat === seed;
    out.push(isTarget ? rand(2, 3) : rand(0, 1));
  }
  return out;
};

const BIP_TEMPLATES = [
  {
    alt: '쉬고 싶을 때 "쉬고 싶어요" 카드 들기',
    fct: '"도와주세요" 카드 사용 (Functional Communication Training)',
    crit: '하루 3회 미만 발생, 2주 연속 유지',
    prev: '과제 전 시각적 일과표 제공\n과제 난이도를 80% 성공 수준으로 조정\n선택권 2가지 제공',
    teach: '"도움 요청 카드" 사용법 직접 교수 (모델링 → 역할극 → 자연스러운 상황 연습)',
    reinf: '대체행동 수행 시 즉각 칭찬 + 스티커 1개\n4:1 강화 비율 유지\n10개 스티커마다 선호 활동 5분',
    resp: '문제행동 발생 시 10초 계획적 무시 후 대체행동 촉진\n안전 위협 시 안정실 이동',
  },
  {
    alt: '감각 자극이 필요할 때 감각 도구(스퀴즈볼) 사용 요청',
    fct: '감각 카드 제시',
    crit: '하루 자해 행동 0회, 2주 연속 유지',
    prev: '감각 통합 활동 시간 일과 내 배치\n환경 자극 최소화(파티션 사용)\n사전 예고 5분 전',
    teach: '감각 카드 사용법 직접 교수\n일과 내 정기적 감각 휴식 시간 설정',
    reinf: '감각 카드 사용 시 감각 도구 즉시 제공\n사회적 칭찬 + 자연 강화',
    resp: '자해 행동 시 즉각 신체 보호\n감각 도구 제시\n안전실로 이동',
  },
];

const SZ_TEMPLATES = [
  { reason: '자해 위험', in_t: '10:30', out_t: '10:50', strategy: '심호흡 + 감각 도구', intervention: '교사 동반', returned: 'Y' },
  { reason: '공격 행동', in_t: '13:15', out_t: '13:35', strategy: '감각 통합', intervention: '보조교사', returned: 'Y' },
  { reason: '분노', in_t: '11:00', out_t: '11:20', strategy: '그라운딩 5-4-3-2-1', intervention: '최소', returned: 'Y' },
];

// CICO presets per level
const CICO_PERIODS_ELEM = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '종례'];
const CICO_PERIODS_MIDDLE = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시', '종례'];
const CICO_GOALS_POOL = [
  '자리에 앉아 과제 수행', '교사 지시 1회 따르기', '또래에게 친절한 말 사용',
  '시각 일과표 확인', '쉬어 카드 사용', '도와주세요 카드 사용',
];
const CICO_COMMENTS_POOL = ['', '', '', '', '잘 함', '자리이탈 1회', '도움 카드 사용', '과제 거부 1회', '집중 양호', '또래 도움 받음'];

const LETTER_TEMPLATES = [
  { category: '진행 보고', subject: '[진행 보고] {NAME}에 대한 안내', body: '평소 {NAME}에게 보내주시는 관심과 사랑에 깊이 감사드립니다.\n\n이번 주 {NAME}의 학교생활에서 다음과 같은 변화를 관찰했습니다:\n- "쉬어 카드" 사용 빈도 증가\n- 자리 이탈 횟수 감소 (5회 → 2회)\n\n학교와 가정의 일관된 지원 덕분이라고 생각합니다. 감사합니다.' },
  { category: '강화 결과', subject: '[강화 결과] {NAME}의 노력 안내', body: '이번 주 {NAME}이/가 목표 행동(쉬어 카드 들기)을 12회 수행했습니다. 약속한 보상으로 단체 영화 시간을 제공할 예정입니다. 가정에서도 칭찬해 주세요.' },
  { category: '가정 협력 요청', subject: '[가정 협력 요청] 일과 일관성 유지 부탁드립니다', body: '{NAME}의 행동지원계획(BIP)을 시작했습니다. 가정에서도 다음 사항을 함께 해주시면 큰 도움이 됩니다:\n- 일정한 수면 시간 유지\n- 학교에서 사용하는 "도와주세요" 카드를 가정에서도 사용\n- 작은 성취에도 즉시 칭찬' },
];

// ---- Main ----
async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/seed-sample.js');
    process.exit(1);
  }

  const userRes = await sql`SELECT id, name, email FROM users WHERE email = ${TARGET_EMAIL}`;
  if (userRes.rows.length === 0) {
    console.error(`User not found for email: ${TARGET_EMAIL}`);
    process.exit(1);
  }
  const user = userRes.rows[0];
  console.log(`Target user: ${user.name} (id=${user.id}, email=${user.email})`);

  // Wipe existing samples
  const wipeRes = await sql`
    DELETE FROM students WHERE user_id = ${user.id} AND student_code LIKE ${SAMPLE_PREFIX + '%'} RETURNING id
  `;
  console.log(`Removed ${wipeRes.rows.length} existing sample students.`);

  let totalRecords = 0;

  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i];
    const code = SAMPLE_PREFIX + s.code;
    const stuRes = await sql`
      INSERT INTO students (user_id, student_code, level, disability, note)
      VALUES (${user.id}, ${code}, ${s.level}, ${s.dis}, ${s.note})
      RETURNING id
    `;
    const studentId = stuRes.rows[0].id;
    let recCount = 0;

    // ====== ABC: 8-12 entries spread over 30 days ======
    const abcCount = rand(8, 12);
    for (let k = 0; k < abcCount; k++) {
      const day = rand(0, TOTAL_DAYS - 1);
      const tpl = pick(ABC_TEMPLATES);
      await sql`
        INSERT INTO abc_records (student_id, date, time_context, antecedent, behavior, consequence)
        VALUES (${studentId}, ${daysAgo(day)}, ${tpl.time}, ${tpl.a}, ${tpl.b}, ${tpl.c})
      `;
      recCount++;
    }

    // ====== Monitor: weekdays only, Phase A (days 1-10) → Phase B (days 11-30) ======
    // Phase A: high frequency baseline (avg 7-9)
    // Phase B: improving frequency (avg 7 → 2 over 20 days)
    const baseFreqA = rand(6, 9);
    for (let day = 1; day <= TOTAL_DAYS; day++) {
      // Skip weekends
      if (!isWeekday(day)) continue;
      // Skip occasional days for realism (~80% attendance)
      if (Math.random() < 0.15) continue;

      let phase, freq;
      if (day <= PHASE_SWITCH) {
        phase = 'A';
        freq = Math.max(1, baseFreqA + rand(-1, 2));
      } else {
        phase = 'B';
        // Linearly improve from baseFreqA to 1-2 over Phase B days
        const progress = (day - PHASE_SWITCH) / (TOTAL_DAYS - PHASE_SWITCH);
        const targetFreq = Math.max(1, baseFreqA - Math.round(baseFreqA * progress * 0.85));
        freq = Math.max(0, targetFreq + rand(-1, 1));
      }
      const beh = pick(s.behaviors);
      await sql`
        INSERT INTO monitor_records (
          student_id, date, behavior, frequency, duration, intensity,
          alternative, latency, dbr, phase
        ) VALUES (
          ${studentId}, ${daysAgo(TOTAL_DAYS - day + 1)}, ${beh}, ${freq},
          ${rand(1, 8)}, ${phase === 'A' ? rand(3, 5) : rand(1, 4)},
          ${phase === 'B' ? 'Y' : (Math.random() < 0.3 ? 'Y' : 'N')},
          ${rand(0, 5)}, ${phase === 'A' ? rand(2, 5) : rand(5, 9)}, ${phase}
        )
      `;
      recCount++;
    }

    // ====== QABF: 1 set per student ======
    const qabfResp = QABF_TEMPLATE(s.qabfBias);
    await sql`
      INSERT INTO qabf_data (student_id, responses, updated_at)
      VALUES (${studentId}, ${JSON.stringify(qabfResp)}::jsonb, NOW())
    `;
    recCount++;

    // ====== BIP: 1 set per student ======
    const bip = BIP_TEMPLATES[i % BIP_TEMPLATES.length];
    await sql`
      INSERT INTO bip_data (student_id, alt, fct, crit, prev, teach, reinf, resp, updated_at)
      VALUES (${studentId}, ${bip.alt}, ${bip.fct}, ${bip.crit}, ${bip.prev}, ${bip.teach}, ${bip.reinf}, ${bip.resp}, NOW())
    `;
    recCount++;

    // ====== Fidelity: 8-10 entries during Phase B, improving ======
    const fidCount = rand(8, 10);
    for (let k = 0; k < fidCount; k++) {
      const day = PHASE_SWITCH + rand(1, TOTAL_DAYS - PHASE_SWITCH);
      // Score improves from 2 to 4 over time
      const progress = (day - PHASE_SWITCH) / (TOTAL_DAYS - PHASE_SWITCH);
      const score = Math.min(4, Math.max(2, Math.round(2 + progress * 2 + rand(-1, 1))));
      await sql`
        INSERT INTO fidelity_records (student_id, date, score, total)
        VALUES (${studentId}, ${daysAgo(TOTAL_DAYS - day + 1)}, ${score}, 4)
      `;
      recCount++;
    }

    // ====== SZ: 1-3 records, mostly during Phase A ======
    const szCount = s.behaviors.includes('자해') || s.behaviors.includes('공격 행동') || i % 3 === 0 ? rand(2, 3) : rand(0, 1);
    for (let k = 0; k < szCount; k++) {
      // 70% chance during Phase A
      const day = Math.random() < 0.7 ? rand(0, PHASE_SWITCH) : rand(PHASE_SWITCH, TOTAL_DAYS - 1);
      const tpl = pick(SZ_TEMPLATES);
      await sql`
        INSERT INTO sz_records (
          student_id, date, reason, in_time, out_time, strategy, intervention, returned
        ) VALUES (
          ${studentId}, ${daysAgo(day)}, ${tpl.reason}, ${tpl.in_t}, ${tpl.out_t},
          ${tpl.strategy}, ${tpl.intervention}, ${tpl.returned}
        )
      `;
      recCount++;
    }

    // ====== CICO: 18-22 weekday entries ======
    const cicoPeriods = (s.level === '중등' || s.level === '고등') ? CICO_PERIODS_MIDDLE : CICO_PERIODS_ELEM;
    const studentGoals = [
      pick(CICO_GOALS_POOL),
      pick(CICO_GOALS_POOL.filter((g) => g !== CICO_GOALS_POOL[0])),
    ];
    for (let day = 1; day <= TOTAL_DAYS; day++) {
      if (!isWeekday(day)) continue;
      if (Math.random() < 0.2) continue; // ~80% attendance

      // Score improves over Phase B
      const isB = day > PHASE_SWITCH;
      const progress = isB ? (day - PHASE_SWITCH) / (TOTAL_DAYS - PHASE_SWITCH) : 0;

      const scoresJson = {};
      let total = 0;
      cicoPeriods.forEach((p) => {
        // Score: A phase mostly 1-2, B phase improving 1-3
        const score = isB
          ? Math.min(3, Math.max(0, Math.round(1.5 + progress * 1.3 + (Math.random() - 0.5))))
          : Math.max(0, rand(1, 2));
        const comment = Math.random() < 0.25 ? pick(CICO_COMMENTS_POOL.filter(Boolean)) : '';
        scoresJson[p] = { score, comment };
        total += score;
      });
      const max = cicoPeriods.length * 3;

      await sql`
        INSERT INTO cico_records (
          student_id, date, goals, periods, scores, check_in_time, check_out_time, comment, total_score, max_score
        ) VALUES (
          ${studentId}, ${daysAgo(TOTAL_DAYS - day + 1)},
          ${JSON.stringify(studentGoals)}::jsonb,
          ${JSON.stringify(cicoPeriods)}::jsonb,
          ${JSON.stringify(scoresJson)}::jsonb,
          ${'08:50'}, ${(s.level === '중등' || s.level === '고등') ? '15:30' : '14:00'},
          ${total >= max * 0.75 ? '오늘 정말 잘했어요!' : (total >= max * 0.5 ? '내일 더 잘해봐요.' : '')},
          ${total}, ${max}
        )
      `;
      recCount++;
    }

    // ====== Family letters: 2-3 entries ======
    const letterCount = rand(2, 3);
    for (let k = 0; k < letterCount; k++) {
      const tpl = LETTER_TEMPLATES[k % LETTER_TEMPLATES.length];
      const day = rand(0, TOTAL_DAYS - 1);
      const subject = tpl.subject.replace(/\{NAME\}/g, s.code);
      const body = tpl.body.replace(/\{NAME\}/g, s.code);
      await sql`
        INSERT INTO family_letters (student_id, category, subject, body, sent_date)
        VALUES (${studentId}, ${tpl.category}, ${subject}, ${body}, ${daysAgo(day)})
      `;
      recCount++;
    }

    totalRecords += recCount;
    console.log(`  ${code} (${s.dis}) — ${recCount} records`);
  }

  console.log(`\n✅ Done. Inserted 10 sample students and ${totalRecords} child records over ${TOTAL_DAYS} days.`);
  console.log(`Phase A: days 1-${PHASE_SWITCH} (baseline) · Phase B: days ${PHASE_SWITCH + 1}-${TOTAL_DAYS} (intervention)`);
  console.log(`\nCleanup later with:`);
  console.log(`  DELETE FROM students WHERE user_id = ${user.id} AND student_code LIKE '${SAMPLE_PREFIX}%';`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
