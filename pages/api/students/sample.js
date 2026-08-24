import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureStudentProfileColsCached } from '../../../lib/ensureSchema';
import { buildSampleStudents, workdayBefore } from '../../../lib/sampleData';

// 샘플 체험 — POST: 현재 학급에 샘플 학생 2명 + 4주치 기록을 시드.
//            DELETE: 이 사용자의 샘플 학생을 일괄 삭제(기록은 ON DELETE CASCADE).
// 학생 코드('샘플A'/'샘플B')는 UNIQUE(user_id, student_code)라 중복 시드가 자연 차단된다.
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    await ensureStudentProfileColsCached(); // is_sample 컬럼 자가치유
    switch (req.method) {
      case 'POST': {
        const { class_id } = req.body || {};
        if (!class_id) return res.status(400).json({ error: 'class_id is required' });
        const cls = await sql`
          SELECT id FROM classes WHERE id = ${Number(class_id)} AND user_id = ${userId}
        `;
        if (cls.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });

        const existing = await sql`
          SELECT id FROM students WHERE user_id = ${userId} AND is_sample = TRUE
        `;
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: '샘플 학생이 이미 있습니다. 먼저 샘플을 삭제해 주세요.' });
        }

        const defs = buildSampleStudents();
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
              INSERT INTO monitor_records (student_id, date, behavior, frequency, duration, intensity, alternative, phase)
              VALUES (${sid}, ${workdayBefore(m.d)}, ${def.behaviorLabel}, ${m.freq}, ${m.dur}, ${m.int}, ${m.alt || 'N'}, ${m.phase})
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

        if (created.length === 0) {
          return res.status(409).json({ error: "학생 코드 '샘플A/샘플B'가 이미 사용 중이에요. 해당 학생을 정리한 뒤 다시 시도해 주세요." });
        }
        return res.status(201).json({ students: created });
      }

      case 'DELETE': {
        // 샘플 학생 삭제 — 관련 기록은 전부 ON DELETE CASCADE로 함께 삭제된다.
        const del = await sql`
          DELETE FROM students WHERE user_id = ${userId} AND is_sample = TRUE RETURNING id
        `;
        return res.status(200).json({ success: true, removed: del.rows.length });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Sample students API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
