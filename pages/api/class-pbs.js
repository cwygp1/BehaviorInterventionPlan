import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';
import { ensureTierScopingCached } from '../../lib/ensureSchema';

// Class-level PBS state (Tier 1) — scoped to (class_id, semester).
// One PBS state per 반 per 학기 (학년도는 class에 내포됨).
//   GET  /api/class-pbs?class_id=ID&semester=1  → that class/semester state
//   POST /api/class-pbs  body { class_id, semester, goal, target_points, current_points, rewards }
//
// ensureTierScoping() runs inline as a self-heal net (idempotent) so this works
// even if /api/migrate hasn't been run after deploy.
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    try { await ensureTierScopingCached(); } catch (_e) { /* best-effort */ }

    // Verify the class belongs to this teacher.
    async function ownsClass(classId) {
      if (!classId) return false;
      const r = await sql`SELECT id FROM classes WHERE id = ${classId} AND user_id = ${userId}`;
      return r.rows.length > 0;
    }

    if (req.method === 'GET') {
      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const semester = req.query.semester ? Number(req.query.semester) : 1;
      if (!classId) return res.status(400).json({ error: 'class_id is required' });
      if (!(await ownsClass(classId))) return res.status(403).json({ error: 'Forbidden' });
      const r = await sql`
        SELECT * FROM class_pbs_state
        WHERE class_id = ${classId} AND semester = ${semester}
      `;
      return res.status(200).json({ data: r.rows[0] || null });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { class_id, semester, goal, target_points, current_points, rewards } = req.body || {};
      const classId = class_id ? Number(class_id) : null;
      const sem = semester ? Number(semester) : 1;
      if (!classId) return res.status(400).json({ error: 'class_id is required' });
      if (!(await ownsClass(classId))) return res.status(403).json({ error: 'Forbidden' });
      const rewardsJson = JSON.stringify(rewards || []);
      const r = await sql`
        INSERT INTO class_pbs_state (user_id, class_id, semester, goal, target_points, current_points, rewards, updated_at)
        VALUES (${userId}, ${classId}, ${sem}, ${goal || ''}, ${target_points || 100}, ${current_points || 0}, ${rewardsJson}::jsonb, NOW())
        ON CONFLICT (class_id, semester)
        DO UPDATE SET goal = ${goal || ''}, target_points = ${target_points || 100},
                      current_points = ${current_points || 0}, rewards = ${rewardsJson}::jsonb, updated_at = NOW()
        RETURNING *
      `;
      return res.status(200).json({ data: r.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Class PBS error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
