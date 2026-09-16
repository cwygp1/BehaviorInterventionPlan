import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';
import { ensureProgramSessionsCached } from '../../../../lib/ensureSchema';
import { normalizeCodes, scoreSession, normalizeTrials, scoreDtt, PHASES } from '../../../../lib/programSessions';
import { normalizeScores, scoreBstSession, BST_TOP, SCALE_TRIALS_DEFAULT } from '../../../../lib/teachMethods';

// 0915(mds/31): 교수 프로그램 회기 기록(IEP 과제분석 단계 × 회기).
// 0915(mds/32): kind='dtt' — 프로그램(teaching_programs)의 표적마다 시행 n칸. codes = 표적별 시행 배열의 배열.
// 정반응률 등 집계는 서버가 코드에서 다시 계산한다(화면 계산값을 믿지 않음).
export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  const fmtRow = (r) => ({ ...r, pct: Number(r.pct) || 0 });
  const PHASE_KEYS = PHASES.map((p) => p.k);
  const phaseOf = (p) => (PHASE_KEYS.includes(p) ? p : 'teach');
  const noteOf = (n) => String(n || '').slice(0, 2000);

  // 과제분석: 저장 시점의 IEP 목표(단계·연쇄)를 기준으로 코드를 정규화한다.
  async function loadGoal(goalId) {
    const g = await sql`SELECT id, task_steps, chain_type FROM iep_goals WHERE id = ${goalId} AND student_id = ${studentId}`;
    return g.rows[0] || null;
  }
  function buildChain(body, goal) {
    const steps = (Array.isArray(goal.task_steps) ? goal.task_steps : []).map((s) => String(s).trim()).filter(Boolean);
    const chainType = ['forward', 'backward', 'total'].includes(goal.chain_type) ? goal.chain_type : 'forward';
    const phase = phaseOf(body.phase);
    const t = Number(body.target_step) || null;
    const targetStep = chainType === 'total' || !t ? null : Math.max(1, Math.min(steps.length, t));
    const codes = normalizeCodes(body.codes, steps.length, { chainType, targetStep, phase });
    const sc = scoreSession(codes);
    return { steps, chainType, phase, targetStep, codes, sc, itemStats: [], note: noteOf(body.note) };
  }
  // DTT: 저장 시점의 표적 스냅샷({id,text}) × 기회 수로 시행 배열을 정규화한다.
  function buildDtt(body, snapshot, trials) {
    const phase = phaseOf(body.phase);
    const codes = normalizeTrials(body.codes, snapshot.length, trials, phase);
    const d = scoreDtt(codes);
    return {
      steps: snapshot, chainType: 'dtt', phase, targetStep: null, codes,
      sc: { correct: d.correct, indep: d.correct, prompted: d.prompted, scored: d.scored, pct: d.pct },
      itemStats: d.stats, note: noteOf(body.note),
    };
  }

  // 0916(mds/34 §15): BST 5점 척도 — 실제 상황(또는 역할극 연습)에서 기회마다 1~5점.
  //   codes = 점수 배열, chain_type 칸에 장면(real·roleplay)을 담고, pct는 5점 비율이다.
  function buildScale(body, trials, fallbackSetting = 'real') {
    const phase = phaseOf(body.phase);
    const setting = (body.setting || fallbackSetting) === 'roleplay' ? 'roleplay' : 'real';
    const want = Math.max(Number(trials) || SCALE_TRIALS_DEFAULT, Array.isArray(body.codes) ? body.codes.length : 0);
    const codes = normalizeScores(body.codes, want);
    const r = scoreBstSession(codes);
    const top = codes.filter((x) => x === BST_TOP).length;
    return {
      steps: [], chainType: setting, phase, targetStep: null, codes,
      sc: { correct: top, indep: top, prompted: r.n - top, scored: r.n, pct: r.topRate || 0 },
      itemStats: { n: r.n, avg: r.avg, top },
      note: noteOf(body.note),
    };
  }

  const SAVE_KINDS = ['chain', 'dtt', 'scale'];

  try {
    await ensureProgramSessionsCached();
    switch (req.method) {
      case 'GET': {
        const r = await sql`SELECT id, kind, program_id, goal_id, goal_ref, date::text AS date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
  item_stats, correct_count, indep_count, prompted_count, scored_count, pct, note, created_at FROM program_sessions WHERE student_id = ${studentId} ORDER BY date, session_no, id`;
        return res.status(200).json({ sessions: r.rows.map(fmtRow) });
      }
      case 'POST': {
        const b = req.body || {};
        if (!b.date) return res.status(400).json({ error: 'date is required' });
        const kind = b.kind ? (SAVE_KINDS.includes(b.kind) ? b.kind : null) : 'chain';
        if (!kind) return res.status(400).json({ error: '모르는 기록 형태입니다.' });
        let v, goalId = null, programId = null;
        if (kind === 'scale') {
          const p = (await sql`SELECT id, trials FROM teaching_programs WHERE id = ${b.program_id} AND student_id = ${studentId}`).rows[0];
          if (!p) return res.status(404).json({ error: 'program not found' });
          v = buildScale(b, p.trials);
          programId = p.id;
        } else if (kind === 'dtt') {
          const p = (await sql`SELECT id, items, trials FROM teaching_programs WHERE id = ${b.program_id} AND student_id = ${studentId}`).rows[0];
          if (!p) return res.status(404).json({ error: 'program not found' });
          // 표적 중 이번 회기에 기록한 것만(화면이 보낸 item_ids 순서) — 없으면 프로그램 전체.
          const all = (Array.isArray(p.items) ? p.items : []).map((x) => ({ id: x.id, text: x.text }));
          const ids = Array.isArray(b.item_ids) ? b.item_ids.map(String) : null;
          const snapshot = ids ? ids.map((id) => all.find((x) => x.id === id)).filter(Boolean) : all;
          if (!snapshot.length) return res.status(400).json({ error: '기록할 표적이 없습니다.' });
          v = buildDtt(b, snapshot, Number(p.trials) || 10);
          programId = p.id;
        } else {
          if (!b.goal_id) return res.status(400).json({ error: 'goal_id is required' });
          const goal = await loadGoal(b.goal_id);
          if (!goal) return res.status(404).json({ error: 'goal not found' });
          v = buildChain(b, goal);
          if (!v.steps.length) return res.status(400).json({ error: '과제분석 단계가 없는 목표입니다.' });
          goalId = goal.id;
        }
        if (!v.sc.scored) return res.status(400).json({ error: '채점한 칸이 없습니다.' });
        const no = programId
          ? await sql`SELECT COALESCE(MAX(session_no), 0) + 1 AS n FROM program_sessions WHERE student_id = ${studentId} AND kind = ${kind} AND program_id = ${programId} AND date = ${b.date}`
          : await sql`SELECT COALESCE(MAX(session_no), 0) + 1 AS n FROM program_sessions WHERE student_id = ${studentId} AND kind = 'chain' AND goal_id = ${goalId} AND date = ${b.date}`;
        const r = await sql`
          INSERT INTO program_sessions (student_id, kind, program_id, goal_id, goal_ref, date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
            item_stats, correct_count, indep_count, prompted_count, scored_count, pct, note)
          VALUES (${studentId}, ${kind}, ${programId}, ${goalId}, 'iep', ${b.date}, ${no.rows[0].n}, ${v.phase}, ${v.chainType}, ${v.targetStep},
            ${JSON.stringify(v.steps)}::jsonb, ${JSON.stringify(v.codes)}::jsonb, ${JSON.stringify(v.itemStats)}::jsonb,
            ${v.sc.correct}, ${v.sc.indep}, ${v.sc.prompted}, ${v.sc.scored}, ${v.sc.pct}, ${v.note})
          RETURNING id, kind, program_id, goal_id, goal_ref, date::text AS date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
  item_stats, correct_count, indep_count, prompted_count, scored_count, pct, note, created_at
        `;
        return res.status(201).json({ session: fmtRow(r.rows[0]) });
      }
      case 'PUT': {
        // 기록 고치기 — 단계·표적 목록은 그 회기의 스냅샷을 유지하고 코드·단계(기초선/지도)·메모만 바꾼다.
        const b = req.body || {};
        if (!b.id) return res.status(400).json({ error: 'id is required' });
        const row = (await sql`SELECT * FROM program_sessions WHERE id = ${b.id} AND student_id = ${studentId}`).rows[0];
        if (!row) return res.status(404).json({ error: 'session not found' });
        let v;
        if (row.kind === 'scale') {
          v = buildScale(b, Array.isArray(row.codes) ? row.codes.length : SCALE_TRIALS_DEFAULT, row.chain_type);
        } else if (row.kind === 'dtt') {
          const trials = Math.max(...(Array.isArray(row.codes) ? row.codes : []).map((x) => (Array.isArray(x) ? x.length : 0)), 1);
          v = buildDtt(b, Array.isArray(row.steps_snapshot) ? row.steps_snapshot : [], trials);
        } else {
          v = buildChain({ ...b, target_step: b.target_step ?? row.target_step }, { task_steps: row.steps_snapshot, chain_type: row.chain_type });
        }
        if (!v.sc.scored) return res.status(400).json({ error: '채점한 칸이 없습니다.' });
        const r = await sql`
          UPDATE program_sessions SET phase = ${v.phase}, target_step = ${v.targetStep}, chain_type = ${v.chainType}, codes = ${JSON.stringify(v.codes)}::jsonb,
            item_stats = ${JSON.stringify(v.itemStats)}::jsonb,
            correct_count = ${v.sc.correct}, indep_count = ${v.sc.indep}, prompted_count = ${v.sc.prompted},
            scored_count = ${v.sc.scored}, pct = ${v.sc.pct}, note = ${v.note}
          WHERE id = ${b.id} AND student_id = ${studentId}
          RETURNING id, kind, program_id, goal_id, goal_ref, date::text AS date, session_no, phase, chain_type, target_step, steps_snapshot, codes,
  item_stats, correct_count, indep_count, prompted_count, scored_count, pct, note, created_at
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
