import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM chat_history
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT 50
        `;
        return res.status(200).json({ messages: result.rows });
      }

      case 'POST': {
        const { role, content } = req.body || {};
        if (!role || !content) {
          return res.status(400).json({ error: 'role and content are required' });
        }
        const result = await sql`
          INSERT INTO chat_history (user_id, role, content)
          VALUES (${userId}, ${role}, ${content})
          RETURNING *
        `;
        return res.status(201).json({ message: result.rows[0] });
      }

      case 'DELETE': {
        await sql`DELETE FROM chat_history WHERE user_id = ${userId}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Chat History API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
