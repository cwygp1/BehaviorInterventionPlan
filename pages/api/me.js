import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

// GET /api/me — return the authenticated user's profile, or 401 if no session.
// Used by the frontend on bootstrap to restore session state.
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const result = await sql`
    SELECT id, email, name, school FROM users WHERE id = ${req.userId}
  `;
  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(200).json({ user: result.rows[0] });
});
