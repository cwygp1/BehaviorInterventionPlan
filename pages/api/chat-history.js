import { sql } from '../../lib/db';

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET': {
        const { user_id } = req.query;
        if (!user_id) {
          return res.status(400).json({ error: 'user_id is required' });
        }
        const result = await sql`
          SELECT * FROM chat_history
          WHERE user_id = ${user_id}
          ORDER BY created_at DESC
          LIMIT 50
        `;
        return res.status(200).json({ messages: result.rows });
      }

      case 'POST': {
        const { user_id, role, content } = req.body || {};
        if (!user_id || !role || !content) {
          return res.status(400).json({ error: 'user_id, role, and content are required' });
        }
        const result = await sql`
          INSERT INTO chat_history (user_id, role, content)
          VALUES (${user_id}, ${role}, ${content})
          RETURNING *
        `;
        return res.status(201).json({ message: result.rows[0] });
      }

      case 'DELETE': {
        const { user_id } = req.body || {};
        if (!user_id) {
          return res.status(400).json({ error: 'user_id is required' });
        }
        await sql`DELETE FROM chat_history WHERE user_id = ${user_id}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Chat History API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
