// 샘플 체험 학생 시드 — API(/api/students/sample POST)와 관리자 스크립트(scripts/seed-sample-student.mjs)가 함께 쓴다.
// 1001: pages/api/students/sample.js 안에 있던 반복문을 그대로 옮김(동작 동일). codes로 '샘플A'만 넣는 것도 가능.
import { buildSampleStudents, workdayBefore } from './sampleData.js'; // 확장자 명시: node 스크립트(ESM)에서도 바로 import되게

/**
 * @param {object} args
 * @param {Function} args.sql       @vercel/postgres 태그드 템플릿
 * @param {number}   args.userId    학생을 소유할 사용자
 * @param {number}   args.classId   학생이 들어갈 학급
 * @param {string[]} [args.codes]   넣을 학생 코드(예: ['샘플A']). 생략하면 정의된 샘플 전부(A·B)
 * @returns {Promise<object[]>}     만들어진 students 행(이미 같은 코드가 있으면 건너뜀)
 */
export async function seedSampleStudents({ sql, userId, classId, codes }) {
  const class_id = classId;
  const defs = buildSampleStudents().filter((d) => !codes || codes.includes(d.student_code));
  const created = [];
  for (const def of defs) {
    const stuRes = await sql`
      INSERT INTO students (user_id, class_id, student_code, level, grade, disability, note, strengths, difficulties, is_sample)
      VALUES (${userId}, ${Number(class_id)}, ${def.student_code}, ${def.level}, ${def.grade}, ${def.disability}, ${def.note}, ${def.strengths}, ${def.difficulties}, TRUE)
      ON CONFLICT (user_id, student_code) DO NOTHING
      RETURNING *
    `;
    const stu = stuRes.rows[0];
    if (!stu) {
      // 같은 코드의 '내 학생'이 이미 있음 — 이 학생은 건너뛴다.
      continue;
    }
    const sid = stu.id;

    for (const r of def.abc) {
      await sql`
        INSERT INTO abc_records (student_id, date, time_context, antecedent, behavior, consequence)
        VALUES (${sid}, ${workdayBefore(r.d)}, ${r.time}, ${r.a}, ${r.b}, ${r.c})
      `;
    }
    await sql`
      INSERT INTO qabf_data (student_id, responses)
      VALUES (${sid}, ${JSON.stringify(def.qabf)}::jsonb)
      ON CONFLICT (student_id) DO UPDATE SET responses = ${JSON.stringify(def.qabf)}::jsonb, updated_at = NOW()
    `;
    await sql`
      INSERT INTO bip_data (student_id, alt, fct, crit, prev, teach, reinf, resp)
      VALUES (${sid}, ${def.bip.alt}, ${def.bip.fct}, ${def.bip.crit}, ${def.bip.prev}, ${def.bip.teach}, ${def.bip.reinf}, ${def.bip.resp})
      ON CONFLICT (student_id) DO UPDATE SET
        alt = ${def.bip.alt}, fct = ${def.bip.fct}, crit = ${def.bip.crit}, prev = ${def.bip.prev},
        teach = ${def.bip.teach}, reinf = ${def.bip.reinf}, resp = ${def.bip.resp}, updated_at = NOW()
    `;
    for (const m of def.monitor) {
      await sql`
        INSERT INTO monitor_records (student_id, date, behavior, frequency, duration, intensity, alternative, alt_freq, dbr, phase, obs_hours, note)
        VALUES (${sid}, ${workdayBefore(m.d)}, ${m.beh || def.behaviorLabel}, ${m.freq}, ${m.dur}, ${m.int}, ${m.alt || 'N'}, ${m.alt_freq ?? 0}, ${m.dbr ?? 0}, ${m.phase}, ${m.h ?? null}, ${m.note || ''})
      `;
    }
    for (const f of def.fidelity) {
      await sql`
        INSERT INTO fidelity_records (student_id, date, score, total)
        VALUES (${sid}, ${workdayBefore(f.d)}, ${f.score}, 4)
      `;
    }
    for (const p of def.periods) {
      await sql`
        INSERT INTO observation_periods (student_id, tier, start_date, end_date, note)
        VALUES (${sid}, ${p.tier}, ${workdayBefore(p.startD)}, ${p.endD != null ? workdayBefore(p.endD) : null}, ${p.note})
      `;
    }

    // IEP 영역 체험 데이터 — 출발점 분석(모듈1) + IEP 목표.
    if (def.startpoint) {
      await sql`
        INSERT INTO student_startpoint (student_id, data)
        VALUES (${sid}, ${JSON.stringify(def.startpoint)}::jsonb)
        ON CONFLICT (student_id) DO UPDATE SET data = ${JSON.stringify(def.startpoint)}::jsonb, updated_at = NOW()
      `;
    }
    // 학년도·학기·월은 시드 시점 기준(1학기=3~8월: 3~7월, 2학기: 9~12·2월).
    const now = new Date();
    const month = now.getMonth() + 1;
    const semester = month >= 3 && month <= 8 ? 1 : 2;
    const schoolYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const months = semester === 1 ? [3, 4, 5, 6, 7] : [9, 10, 11, 12, 2];
    for (const goal of def.iep || []) {
      const monthly = goal.monthly.map((m, i) => ({
        month: months[i], goal: m.goal, content: m.content, methods: m.methods, eval_plan: m.eval_plan, eval: '',
      }));
      await sql`
        INSERT INTO iep_goals (student_id, school_year, subject, grade_code, area, semester,
          semester_goal, plop, crit_type, crit_start, crit_end, eval_foci, monthly, semestral_eval, support_tier)
        VALUES (${sid}, ${schoolYear}, ${goal.subject}, ${goal.grade_code}, ${goal.area}, ${semester},
          ${goal.semester_goal}, ${goal.plop}, ${goal.crit_type}, ${goal.crit_start}, ${goal.crit_end},
          ${JSON.stringify(goal.eval_foci)}::jsonb, ${JSON.stringify(monthly)}::jsonb, ${''}, ${'Tier 3 (개별 집중 지원)'})
      `;
    }
    created.push(stu);
  }
  return created;
}
