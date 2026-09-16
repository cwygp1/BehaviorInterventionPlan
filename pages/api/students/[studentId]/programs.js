import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';
import { ensureProgramSessionsCached } from '../../../../lib/ensureSchema';
import { TRIAL_OPTIONS, ITEM_STATUS, PROMPT_METHODS, ERROR_CORRECTIONS } from '../../../../lib/programSessions';
import { SCALE_TRIAL_OPTIONS, SCALE_TRIALS_DEFAULT, BST_TOP } from '../../../../lib/teachMethods';

// 0915(mds/32): 교수 프로그램 정의(DTT) — A 지시·자료 · B 표적 목록 · C 강화 · 기회 수 · 학습기준.
// 0916(mds/34 §15): kind='scale'(BST 5점 척도) 추가 — 표적 목록 없이 기술 하나를 점검하고,
//   기회 수는 그날 점검할 칸 수, 학습기준은 '실제 상황 5점 n회기 연속'이다.
export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  const pick = (v, list, d) => (list.some((x) => x.k === v) ? v : d);

  function clean(b, kind = 'dtt') {
    const seen = new Set();
    const items = (Array.isArray(b.items) ? b.items : [])
      .map((x, i) => ({
        id: String(x?.id || `t${Date.now().toString(36)}${i}`).slice(0, 40),
        text: String(x?.text || '').trim().slice(0, 200),
        status: pick(x?.status, ITEM_STATUS, 'baseline'),
      }))
      .filter((x) => x.text && !seen.has(x.id) && seen.add(x.id))
      .slice(0, 20);
    const m = b.mastery || {};
    const runs = Math.max(1, Math.min(5, Number(m.runs) || 2));
    let trials;
    let mastery;
    if (kind === 'scale') {
      trials = SCALE_TRIAL_OPTIONS.includes(Number(b.trials)) ? Number(b.trials) : SCALE_TRIALS_DEFAULT;
      mastery = { type: 'scale', score: BST_TOP, runs };
    } else {
      trials = TRIAL_OPTIONS.includes(Number(b.trials)) ? Number(b.trials) : 10;
      mastery = m.type === 'count'
        ? { type: 'count', of: trials, min: Math.max(1, Math.min(trials, Number(m.min) || Math.round(trials * 0.8))), runs }
        : { type: 'rate', pct: Math.max(10, Math.min(100, Number(m.pct) || 80)), runs };
    }
    return {
      goal_id: Number(b.goal_id) || null,
      title: String(b.title || '').trim().slice(0, 200),
      antecedent: String(b.antecedent || '').slice(0, 2000),
      reinforcement: String(b.reinforcement || '').slice(0, 2000),
      items, trials, mastery,
      prompt_method: pick(b.prompt_method, PROMPT_METHODS, 'slp'),
      error_correction: pick(b.error_correction, ERROR_CORRECTIONS, 'redo'),
      presentation: b.presentation === 'massed' ? 'massed' : 'rotate',
      status: ['active', 'closed'].includes(b.status) ? b.status : 'active',
    };
  }

  try {
    await ensureProgramSessionsCached();
    switch (req.method) {
      case 'GET': {
        const r = await sql`SELECT * FROM teaching_programs WHERE student_id = ${studentId} ORDER BY status, id`;
        return res.status(200).json({ programs: r.rows });
      }
      case 'POST':
      case 'PUT': {
        const b = req.body || {};
        // 고칠 때는 저장된 형태를 그대로 쓴다(형태는 만들 때 정해진다).
        let kind = b.kind === 'scale' ? 'scale' : 'dtt';
        if (req.method === 'PUT' && b.id) {
          const cur = (await sql`SELECT kind FROM teaching_programs WHERE id = ${b.id} AND student_id = ${studentId}`).rows[0];
          if (cur?.kind) kind = cur.kind === 'scale' ? 'scale' : 'dtt';
        }
        const v = clean(b, kind);
        if (!v.title) return res.status(400).json({ error: kind === 'scale' ? '기술 이름을 적어 주세요.' : '프로그램 이름을 적어 주세요.' });
        if (kind !== 'scale' && !v.items.length) return res.status(400).json({ error: '표적(학습 항목)을 하나 이상 적어 주세요.' });
        if (v.goal_id) {
          const g = await sql`SELECT id FROM iep_goals WHERE id = ${v.goal_id} AND student_id = ${studentId}`;
          if (!g.rows.length) v.goal_id = null;
        }
        if (req.method === 'PUT') {
          if (!b.id) return res.status(400).json({ error: 'id is required' });
          const r = await sql`
            UPDATE teaching_programs SET goal_id = ${v.goal_id}, title = ${v.title}, antecedent = ${v.antecedent},
              items = ${JSON.stringify(v.items)}::jsonb, reinforcement = ${v.reinforcement}, trials = ${v.trials},
              prompt_method = ${v.prompt_method}, error_correction = ${v.error_correction}, presentation = ${v.presentation},
              mastery = ${JSON.stringify(v.mastery)}::jsonb, status = ${v.status}, updated_at = NOW()
            WHERE id = ${b.id} AND student_id = ${studentId} RETURNING *`;
          if (!r.rows.length) return res.status(404).json({ error: 'program not found' });
          return res.status(200).json({ program: r.rows[0] });
        }
        const r = await sql`
          INSERT INTO teaching_programs (student_id, goal_id, kind, title, antecedent, items, reinforcement, trials,
            prompt_method, error_correction, presentation, mastery, status)
          VALUES (${studentId}, ${v.goal_id}, ${kind}, ${v.title}, ${v.antecedent}, ${JSON.stringify(v.items)}::jsonb, ${v.reinforcement}, ${v.trials},
            ${v.prompt_method}, ${v.error_correction}, ${v.presentation}, ${JSON.stringify(v.mastery)}::jsonb, ${v.status})
          RETURNING *`;
        return res.status(201).json({ program: r.rows[0] });
      }
      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id is required' });
        await sql`DELETE FROM program_sessions WHERE program_id = ${id} AND student_id = ${studentId}`;
        await sql`DELETE FROM teaching_programs WHERE id = ${id} AND student_id = ${studentId}`;
        return res.status(200).json({ success: true });
      }
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (e) {
    console.error('Teaching programs API error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
