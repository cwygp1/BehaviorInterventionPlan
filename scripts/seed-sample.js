// Seed sample data for a single user.
// Usage:
//   node --env-file=.env.local scripts/seed-sample.js
//
// What it does:
//   1. Looks up the user by TARGET_EMAIL.
//   2. Deletes any existing students for that user whose student_code starts
//      with the sample prefix '샘플_' (records cascade-delete via FK).
//   3. Inserts 10 sample students with realistic ABC / monitor / QABF / BIP /
//      fidelity / SZ records spread over the last ~3 weeks.
//
// Safe to re-run — sample students are wiped and re-seeded on every run.
// The prefix '샘플_' makes them easy to find or remove later:
//   DELETE FROM students WHERE student_code LIKE '샘플\_%' ESCAPE '\' AND user_id = X;

const { sql } = require('@vercel/postgres');

const TARGET_EMAIL = 'cwygp@naver.com';
const SAMPLE_PREFIX = '샘플_';

// ---- Helpers ----
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---- Sample student profiles ----
const STUDENTS = [
  { code: '민준', level: '초등', dis: '자폐스펙트럼(ASD)',
    note: '초등 3학년 수준, 제한된 언어 표현, 시각적 일과표 활용',
    behaviors: ['자리 이탈', '반복 행동'] },
  { code: '서연', level: '초등', dis: '지적장애',
    note: '초등 5학년 수준, 단순 의사소통 가능, 수 개념 기초 단계',
    behaviors: ['과제 거부', '소리 지르기'] },
  { code: '도윤', level: '초등', dis: 'ADHD',
    note: '초등 2학년, 주의 집중 시간 5~10분, 충동성 높음',
    behaviors: ['자리 이탈', '소리 지르기'] },
  { code: '지유', level: '초등', dis: '정서행동장애',
    note: '초등 4학년, 분노 조절 어려움, 또래 갈등 빈번',
    behaviors: ['공격 행동', '울기'] },
  { code: '하준', level: '중등', dis: '지적장애',
    note: '중등 1학년 수준, 일상생활 일부 독립적, 사회성 훈련 필요',
    behaviors: ['지시 거부', '자리 이탈'] },
  { code: '채원', level: '중등', dis: '자폐스펙트럼(ASD)',
    note: '중등 2학년, 한정된 관심사, 변화에 대한 거부 강함',
    behaviors: ['반복 행동', '소리 지르기'] },
  { code: '시우', level: '초등', dis: '학습장애',
    note: '초등 6학년, 읽기 유창성 어려움, 정서적 위축',
    behaviors: ['과제 회피', '울기'] },
  { code: '예린', level: '초등', dis: '발달지연',
    note: '초등 1학년 수준, 또래보다 전반적 발달 느림',
    behaviors: ['지시 거부', '자리 이탈'] },
  { code: '준호', level: '중등', dis: '정서행동장애',
    note: '중등 3학년, 자해 위험 있음, 안정실 이용 이력',
    behaviors: ['자해', '소리 지르기'] },
  { code: '나윤', level: '초등', dis: '중복중증',
    note: '초등 1학년, 보조공학기기 사용, 1:1 지원 필요',
    behaviors: ['거부 행동', '울기'] },
];

const ABC_TEMPLATES = [
  { time: '1교시 / 교실', a: '수학 익힘책 15쪽 풀라고 지시했을 때', b: '"싫어!"라고 외치며 책을 바닥에 던짐', c: '교사가 다가가 "잠시 쉬자"고 안내, 과제 일시 보류' },
  { time: '2교시 / 교실', a: '집단 활동 시작 직전', b: '책상에서 일어나 교실 뒤편으로 이동', c: '보조교사가 자리로 안내함' },
  { time: '쉬는 시간 / 복도', a: '또래가 좋아하는 장난감을 가져갔을 때', b: '또래를 밀치며 소리 지름', c: '교사가 둘을 분리하고 사회적 이야기 사용' },
  { time: '3교시 / 통합학급', a: '예고 없이 일과표 변경됨', b: '귀를 막고 책상에 엎드려 울기 시작', c: '시각적 일과표 다시 보여주며 변경 사항 설명' },
  { time: '4교시 / 특별실', a: '발표 차례가 왔을 때', b: '"못 해요"를 반복하며 자리에 머무름', c: '교사가 단계별 촉진(시각 카드 → 모델링) 제공' },
  { time: '점심 시간 / 급식실', a: '낯선 반찬이 식판에 놓였을 때', b: '식판을 밀어내고 자리에서 일어남', c: '대체 음식을 제공하고 한 입 시도 과제로 전환' },
];

const MONITOR_BEHAVIORS = ['자리 이탈', '소리 지르기', '과제 거부', '자해', '공격 행동', '울기', '반복 행동'];

const QABF_TEMPLATE = (seed) => {
  // 25 items, scaled 0-3. Generates a profile loosely centered on a function.
  // seed in 0..3 nudges responses toward a particular function category:
  //   0: attention, 1: escape, 2: tangible, 3: sensory
  const out = [];
  for (let i = 0; i < 25; i++) {
    const cat = i % 4; // QABF cycles 4 functions across 25 items
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
    prev: '과제 전 시각적 일과표 제공, 과제 난이도를 80% 성공 수준으로 조정, 선택권 2가지 제공',
    teach: '"도움 요청 카드" 사용법 직접 교수 (모델링 → 역할극 → 자연스러운 상황 연습)',
    reinf: '대체행동 수행 시 즉각 칭찬 + 스티커 1개, 4:1 강화 비율 유지',
    resp: '문제행동 발생 시 10초 계획적 무시 후 대체행동 촉진, 안전 위협 시 안정실 이동',
  },
  {
    alt: '감각 자극이 필요할 때 감각 도구(스퀴즈볼) 사용 요청',
    fct: '감각 카드 제시',
    crit: '하루 자해 행동 0회, 2주 연속 유지',
    prev: '감각 통합 활동 시간 일과 내 배치, 환경 자극 최소화(파티션 사용)',
    teach: '감각 카드 사용법 직접 교수, 일과 내 정기적 감각 휴식 시간 설정',
    reinf: '감각 카드 사용 시 감각 도구 즉시 제공 + 사회적 칭찬',
    resp: '자해 행동 시 즉각 신체 보호, 감각 도구 제시, 안전실로 이동',
  },
];

const SZ_TEMPLATES = [
  { reason: '자해 위험', in_t: '10:30', out_t: '10:50', strategy: '심호흡 + 감각 도구', intervention: '교사 동반', returned: 'Y' },
  { reason: '공격 행동', in_t: '13:15', out_t: '13:35', strategy: '감각 통합', intervention: '보조교사', returned: 'Y' },
];

// ---- Main ----
async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Run with: node --env-file=.env.local scripts/seed-sample.js');
    process.exit(1);
  }

  // 1. Find user
  const userRes = await sql`SELECT id, name, email FROM users WHERE email = ${TARGET_EMAIL}`;
  if (userRes.rows.length === 0) {
    console.error(`User not found for email: ${TARGET_EMAIL}`);
    console.error('Make sure the user has registered first.');
    process.exit(1);
  }
  const user = userRes.rows[0];
  console.log(`Target user: ${user.name} (id=${user.id}, email=${user.email})`);

  // 2. Wipe existing samples for this user (cascades to all child records)
  const wipeRes = await sql`
    DELETE FROM students
    WHERE user_id = ${user.id}
      AND student_code LIKE ${SAMPLE_PREFIX + '%'}
    RETURNING id
  `;
  console.log(`Removed ${wipeRes.rows.length} existing sample students (and their records).`);

  // 3. Insert sample students
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

    // ABC: 3 records over the last 14 days
    for (let k = 0; k < 3; k++) {
      const tpl = pick(ABC_TEMPLATES);
      await sql`
        INSERT INTO abc_records (student_id, date, time_context, antecedent, behavior, consequence)
        VALUES (${studentId}, ${daysAgo(rand(1, 14))}, ${tpl.time}, ${tpl.a}, ${tpl.b}, ${tpl.c})
      `;
      recCount++;
    }

    // Monitor: 5 records over 5 days, frequency trending downward (intervention progress)
    const baseFreq = rand(6, 10);
    for (let k = 0; k < 5; k++) {
      const day = 18 - k * 3; // d-18, d-15, d-12, d-9, d-6
      const freq = Math.max(1, baseFreq - k - rand(0, 2));
      const beh = pick(s.behaviors);
      const phase = k < 2 ? 'A' : 'B'; // baseline → intervention
      await sql`
        INSERT INTO monitor_records (
          student_id, date, behavior, frequency, duration, intensity,
          alternative, latency, dbr, phase
        )
        VALUES (
          ${studentId}, ${daysAgo(day)}, ${beh}, ${freq}, ${rand(1, 8)}, ${rand(1, 5)},
          ${k >= 2 ? 'Y' : 'N'}, ${rand(0, 5)}, ${rand(3, 9)}, ${phase}
        )
      `;
      recCount++;
    }

    // QABF: 1 set per student, biased toward i % 4 function
    const qabfResp = QABF_TEMPLATE(i % 4);
    await sql`
      INSERT INTO qabf_data (student_id, responses, updated_at)
      VALUES (${studentId}, ${JSON.stringify(qabfResp)}::jsonb, NOW())
    `;
    recCount++;

    // BIP: 1 set per student
    const bip = BIP_TEMPLATES[i % BIP_TEMPLATES.length];
    await sql`
      INSERT INTO bip_data (student_id, alt, fct, crit, prev, teach, reinf, resp, updated_at)
      VALUES (${studentId}, ${bip.alt}, ${bip.fct}, ${bip.crit}, ${bip.prev}, ${bip.teach}, ${bip.reinf}, ${bip.resp}, NOW())
    `;
    recCount++;

    // Fidelity: 2 records (showing improvement)
    for (let k = 0; k < 2; k++) {
      const score = k === 0 ? rand(2, 3) : 4; // first lower, second perfect
      await sql`
        INSERT INTO fidelity_records (student_id, date, score, total)
        VALUES (${studentId}, ${daysAgo(10 - k * 5)}, ${score}, 4)
      `;
      recCount++;
    }

    // SZ: 1 record for ~half the students (those with self-harm/aggression history)
    if (s.behaviors.includes('자해') || s.behaviors.includes('공격 행동') || i % 3 === 0) {
      const szTpl = pick(SZ_TEMPLATES);
      await sql`
        INSERT INTO sz_records (
          student_id, date, reason, in_time, out_time, strategy, intervention, returned
        )
        VALUES (
          ${studentId}, ${daysAgo(rand(2, 12))}, ${szTpl.reason}, ${szTpl.in_t}, ${szTpl.out_t},
          ${szTpl.strategy}, ${szTpl.intervention}, ${szTpl.returned}
        )
      `;
      recCount++;
    }

    totalRecords += recCount;
    console.log(`  ${code} (${s.dis}) — ${recCount} records`);
  }

  console.log(`\nDone. Inserted 10 sample students and ${totalRecords} child records.`);
  console.log(`Cleanup later with:`);
  console.log(`  DELETE FROM students WHERE user_id = ${user.id} AND student_code LIKE '${SAMPLE_PREFIX}%';`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
