import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';
import { resolveGoalStatus, keepMarkedEvals } from '../../../../lib/iepCard';
import { ensureIepGoalColsCached } from '../../../../lib/ensureSchema';

// IEP (개별화교육계획) goals for a student. Each row = one 성취기준 기반 목표
// with its 학기목표·현행수준·평가기준·월별 점증 계획.
export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;

  const fmtKst = (d) => {
    if (d == null || d === '') return '';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
  };
  const fmtRow = (r) => ({ ...r, updated_at: fmtKst(r.updated_at) });

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM iep_goals WHERE student_id = ${studentId} ORDER BY semester, id
        `;
        return res.status(200).json({ goals: result.rows.map(fmtRow) });
      }

      case 'POST':
      case 'PUT': {
        const b = req.body || {};
        // 자가 치유: 마이그레이션 전 DB에서도 저장이 되도록 컬럼을 보강 — 13줄 ALTER는 lib/ensureSchema.js
        //   ensureIepGoalColsCached()로 옮겨 인스턴스당 1번만 돈다(실패하면 캐시가 풀려 다음 저장에서 다시, mds/56 #18).
        await ensureIepGoalColsCached();

        // 저장 값 정규화. UPDATE는 "부분 갱신": body에 없는(undefined) 필드는 기존 행 값을 유지한다.
        // 계획서 페이지 자동저장·전년도 페이지처럼 일부 필드만 보내는 호출자가 관련 성취기준·교육내용 등을
        // '[]'/''로 지워 버리던 문제(0903)를 서버 쪽에서 막는다. 명시적으로 보낸 null/''/[]는 그대로 저장한다.
        const cur = b.id
          ? (await sql`SELECT * FROM iep_goals WHERE id = ${b.id} AND student_id = ${studentId}`).rows[0]
          : null;
        if (b.id && !cur) return res.status(404).json({ error: 'Not found' });
        const has = (k) => b[k] !== undefined;
        const arr = (v) => (Array.isArray(v) ? v : []);
        const jsonArr = (k) => JSON.stringify(has(k) ? arr(b[k]) : arr(cur?.[k]));
        const str = (k, def = '') => (has(k) ? (b[k] || def) : (cur?.[k] ?? def));
        const num = (k, def) => (has(k) ? (b[k] ?? def) : (cur?.[k] ?? def));
        const nullable = (k) => (has(k) ? (b[k] ?? null) : (cur?.[k] ?? null));

        const v = {
          school_year: num('school_year', 0) || 0,
          subject: str('subject'), grade_code: num('grade_code', 0) || 0, area: str('area'),
          standard_code: str('standard_code'), standard_text: str('standard_text'),
          related_stds: jsonArr('related_stds'),
          semester: num('semester', 1) || 1, semester_goal: str('semester_goal'), plop: str('plop'),
          sem_content: str('sem_content'), sem_methods: str('sem_methods'),
          std_goals: jsonArr('std_goals'),
          func_plan: JSON.stringify(has('func_plan')
            ? (b.func_plan && typeof b.func_plan === 'object' && !Array.isArray(b.func_plan) ? b.func_plan : {})
            : (cur?.func_plan && typeof cur.func_plan === 'object' ? cur.func_plan : {})),
          crit_type: str('crit_type', 'rate'), crit_start: num('crit_start', 30), crit_end: num('crit_end', 80),
          crit_of: [5, 10, 20].includes(Number(num('crit_of', 10))) ? Number(num('crit_of', 10)) : 10,
          support_tier: str('support_tier'),
          tier2_group_id: nullable('tier2_group_id'),
          eval_foci: jsonArr('eval_foci'),
          task_steps: jsonArr('task_steps'),
          chain_type: str('chain_type', 'forward'), prompt_system: str('prompt_system', 'mtl'),
          monthly: jsonArr('monthly'), semestral_eval: str('semestral_eval'),
        };
        // 1102(mds/56 #10): 옛 화면(IepPage 저장·IepReportPage 자동저장)은 들고 있던 monthly 전체를 보낸다 —
        //   그 사이 새 디자인에서 적은 월 평가(eval_at·eval_mark)가 오래된 사본에 덮이지 않게 그 칸 평가만 지킨다(lib/iepCard keepMarkedEvals).
        if (cur && has('monthly')) {
          v.monthly = JSON.stringify(keepMarkedEvals(arr(cur.monthly), arr(b.monthly)));
        }
        // 1101(D1): 월별 계획이 있으면 언제나 'active', 없으면 보낸 값 → 기존 값 → 'active'(lib/iepCard resolveGoalStatus).
        //   옛 화면은 status를 보내지 않으므로 예전 그대로 'active'로 저장·유지된다.
        v.status = resolveGoalStatus({ hasBodyStatus: has('status'), bodyStatus: b.status, curStatus: cur?.status, monthlyLen: JSON.parse(v.monthly).length });

        if (b.id) {
          const r = await sql`
            UPDATE iep_goals SET
              school_year = ${v.school_year},
              subject = ${v.subject}, grade_code = ${v.grade_code}, area = ${v.area},
              standard_code = ${v.standard_code}, standard_text = ${v.standard_text},
              related_stds = ${v.related_stds}::jsonb,
              semester = ${v.semester}, semester_goal = ${v.semester_goal}, plop = ${v.plop},
              sem_content = ${v.sem_content}, sem_methods = ${v.sem_methods},
              std_goals = ${v.std_goals}::jsonb,
              func_plan = ${v.func_plan}::jsonb,
              crit_type = ${v.crit_type}, crit_start = ${v.crit_start}, crit_end = ${v.crit_end}, crit_of = ${v.crit_of},
              support_tier = ${v.support_tier},
              tier2_group_id = ${v.tier2_group_id},
              eval_foci = ${v.eval_foci}::jsonb,
              task_steps = ${v.task_steps}::jsonb,
              chain_type = ${v.chain_type}, prompt_system = ${v.prompt_system},
              monthly = ${v.monthly}::jsonb, semestral_eval = ${v.semestral_eval}, status = ${v.status}, updated_at = NOW()
            WHERE id = ${b.id} AND student_id = ${studentId}
            RETURNING *
          `;
          if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
          return res.status(200).json({ goal: fmtRow(r.rows[0]) });
        }
        const r = await sql`
          INSERT INTO iep_goals
            (student_id, school_year, subject, grade_code, area, standard_code, standard_text, related_stds, semester, semester_goal, plop, sem_content, sem_methods, std_goals, func_plan, crit_type, crit_start, crit_end, crit_of, support_tier, tier2_group_id, eval_foci, task_steps, chain_type, prompt_system, monthly, semestral_eval, status, updated_at)
          VALUES
            (${studentId}, ${v.school_year}, ${v.subject}, ${v.grade_code}, ${v.area}, ${v.standard_code}, ${v.standard_text}, ${v.related_stds}::jsonb, ${v.semester}, ${v.semester_goal}, ${v.plop}, ${v.sem_content}, ${v.sem_methods}, ${v.std_goals}::jsonb, ${v.func_plan}::jsonb, ${v.crit_type}, ${v.crit_start}, ${v.crit_end}, ${v.crit_of}, ${v.support_tier}, ${v.tier2_group_id}, ${v.eval_foci}::jsonb, ${v.task_steps}::jsonb, ${v.chain_type}, ${v.prompt_system}, ${v.monthly}::jsonb, ${v.semestral_eval}, ${v.status}, NOW())
          RETURNING *
        `;
        return res.status(200).json({ goal: fmtRow(r.rows[0]) });
      }

      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id is required' });
        await sql`DELETE FROM iep_goals WHERE id = ${id} AND student_id = ${studentId}`;
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('IEP API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
