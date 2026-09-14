import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';
import { ensureProgramSessionsCached } from '../../../../lib/ensureSchema';
import { normalizeCodes, scoreSession, PHASES } from '../../../../lib/programSessions';

// 0915(mds/31): 교수 프로그램 회기 기록(IEP 과제분석 단계 × 회기).
// 정반응률 등 집계는 서버가 코드에서 다시 계산한다(화면 계산값을 믿지 않음).
export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  const fmtRow = (r) => ({ ...r, pct: Number(r.pct) || 0 });
  const PHASE_KEYS = PHASES.map((p) => p.k);

  // 저장 시점의 IEP 목표(단계·연쇄)를 기준으로 코드를 정규화한다.
  async function loadGoal(goalId) {
    const g = await sql`SELECT id, task_steps, chain_type FROM iep_goals WHERE id = ${goalId} AND student_id = ${studentId}`;
    return g.rows[0] || null;
  }
  function build(body, goal) {
    const steps = (Array.isArray(goal.task_steps) ? goal.task_steps : []).map((s) => String(s).trim()).filter(Boolean);
    const chainType = ['forward', 'backward', 'total'].includes(goal.chain_type) ? goal.chain_type : 'forward';
    const phase = PHASE_KEYS.includes(body.phase) ? body.phase : 'teach';
    const t = Number(body.target_step) || null;
    const targetStep = chainType === 'total' || !t ? null : Math.max(1, Math.min(steps.length, t));
    const codes = normalizeCodes(body.codes, steps.length, { chainType, targetStep, phase });
    const sc = scoreSession(codes);
    return { steps, chainType, phase, targetStep, codes, sc, note: String(body.note || '').slice(0, 2000) };
  }

  try {
    await ensureProgramSessionsCached();
    switch (req.method) {
      case 'GET': {
        const r = await sql`
          SELECT id, goal_id, goal_ref, date::text AS date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
                 correct_count, indep_count, prompted_count, scored_count, pct, note, created_at
          FROM program_sessions WHERE student_id = ${studentId}
          ORDER BY date, session_no, id
        `;
        return res.status(200).json({ sessions: r.rows.map(fmtRow) });
      }
      case 'POST': {
        const b = req.body || {};
        if (!b.goal_id || !b.date) return res.status(400).json({ error: 'goal_id and date are required' });
        const goal = await loadGoal(b.goal_id);
        if (!goal) return res.status(404).json({ error: 'goal not found' });
        const v = build(b, goal);
        if (!v.steps.length) return res.status(400).json({ error: '과제분석 단계가 없는 목표입니다.' });
        if (!v.sc.scored) return res.status(400).json({ error: '채점한 단계가 없습니다.' });
        const no = await sql`SELECT COALESCE(MAX(session_no), 0) + 1 AS n FROM program_sessions WHERE student_id = ${studentId} AND goal_id = ${goal.id} AND date = ${b.date}`;
        const r = await sql`
          INSERT INTO program_sessions (student_id, goal_id, goal_ref, date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
            correct_count, indep_count, prompted_count, scored_count, pct, note)
          VALUES (${studentId}, ${goal.id}, 'iep', ${b.date}, ${no.rows[0].n}, ${v.phase}, ${v.chainType}, ${v.targetStep},
            ${JSON.stringify(v.steps)}::jsonb, ${JSON.stringify(v.codes)}::jsonb,
            ${v.sc.correct}, ${v.sc.indep}, ${v.sc.prompted}, ${v.sc.scored}, ${v.sc.pct}, ${v.note})
          RETURNING id, goal_id, goal_ref, date::text AS date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
            correct_count, indep_count, prompted_count, scored_count, pct, note, created_at
        `;
        return res.status(201).json({ session: fmtRow(r.rows[0]) });
      }
      case 'PUT': {
        // 기록 고치기 — 단계 목록은 그 회기의 스냅샷을 유지하고 코드·단계(기초선/지도)·메모만 바꾼다.
        const b = req.body || {};
        if (!b.id) return res.status(400).json({ error: 'id is required' });
        const cur = await sql`SELECT * FROM program_sessions WHERE id = ${b.id} AND student_id = ${studentId}`;
        const row = cur.rows[0];
        if (!row) return res.status(404).json({ error: 'session not found' });
        const v = build({ ...b, target_step: b.target_step ?? row.target_step }, { task_steps: row.steps_snapshot, chain_type: row.chain_type });
        if (!v.sc.scored) return res.status(400).json({ error: '채점한 단계가 없습니다.' });
        const r = await sql`
          UPDATE program_sessions SET phase = ${v.phase}, target_step = ${v.targetStep}, codes = ${JSON.stringify(v.codes)}::jsonb,
            correct_count = ${v.sc.correct}, indep_count = ${v.sc.indep}, prompted_count = ${v.sc.prompted},
            scored_count = ${v.sc.scored}, pct = ${v.sc.pct}, note = ${v.note}
          WHERE id = ${b.id} AND student_id = ${studentId}
          RETURNING id, goal_id, goal_ref, date::text AS date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
            correct_count, indep_count, prompted_count, scored_count, pct, note, created_at
        `;
        return res.status(200).json({ session: fmtRow(r.rows[0]) });
      }
      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id is required' });
        await sql`DELETE FROM program_sessions WHERE id = ${id} AND student_id = ${studentId}`;
        return res.status(200).json({ success: true });
      }
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (e) {
    console.error('Program sessions API error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
