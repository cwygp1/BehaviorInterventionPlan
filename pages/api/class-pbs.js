import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    if (req.method === 'GET') {
      const r = await sql`SELECT * FROM class_pbs_state WHERE user_id = ${userId}`;
      return res.status(200).json({ data: r.rows[0] || null });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { goal, target_points, current_points, rewards } = req.body || {};
      const rewardsJson = JSON.stringify(rewards || []);
      const r = await sql`
        INSERT INTO class_pbs_state (user_id, goal, target_points, current_points, rewards, updated_at)
        VALUES (${userId}, ${goal || ''}, ${target_points || 100}, ${current_points || 0}, ${rewardsJson}::jsonb, NOW())
        ON CONFLICT (user_id)
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
