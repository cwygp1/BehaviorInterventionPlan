import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

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
        const monthly = JSON.stringify(Array.isArray(b.monthly) ? b.monthly : []);
        const evalFoci = JSON.stringify(Array.isArray(b.eval_foci) ? b.eval_foci : []);
        // 자가 치유: eval_foci 컬럼이 아직 없는 DB(마이그레이션 전)에서도 저장이 되도록 보강.
        await sql`ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS eval_foci JSONB NOT NULL DEFAULT '[]'`;
        if (b.id) {
          const r = await sql`
            UPDATE iep_goals SET
              school_year = ${b.school_year || 0},
              subject = ${b.subject || ''}, grade_code = ${b.grade_code || 0}, area = ${b.area || ''},
              standard_code = ${b.standard_code || ''}, standard_text = ${b.standard_text || ''},
              semester = ${b.semester || 1}, semester_goal = ${b.semester_goal || ''}, plop = ${b.plop || ''},
              crit_type = ${b.crit_type || 'rate'}, crit_start = ${b.crit_start ?? 30}, crit_end = ${b.crit_end ?? 80},
              eval_foci = ${evalFoci}::jsonb,
              monthly = ${monthly}::jsonb, semestral_eval = ${b.semestral_eval || ''}, updated_at = NOW()
            WHERE id = ${b.id} AND student_id = ${studentId}
            RETURNING *
          `;
          if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
          return res.status(200).json({ goal: fmtRow(r.rows[0]) });
        }
        const r = await sql`
          INSERT INTO iep_goals
            (student_id, school_year, subject, grade_code, area, standard_code, standard_text, semester, semester_goal, plop, crit_type, crit_start, crit_end, eval_foci, monthly, semestral_eval, updated_at)
          VALUES
            (${studentId}, ${b.school_year || 0}, ${b.subject || ''}, ${b.grade_code || 0}, ${b.area || ''}, ${b.standard_code || ''}, ${b.standard_text || ''}, ${b.semester || 1}, ${b.semester_goal || ''}, ${b.plop || ''}, ${b.crit_type || 'rate'}, ${b.crit_start ?? 30}, ${b.crit_end ?? 80}, ${evalFoci}::jsonb, ${monthly}::jsonb, ${b.semestral_eval || ''}, NOW())
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
