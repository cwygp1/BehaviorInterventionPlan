import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'GET': {
        const { user_id } = req.query;
        if (!user_id) {
          return res.status(400).json({ error: 'user_id is required' });
        }
        const result = await sql`
          SELECT * FROM students WHERE user_id = ${user_id} ORDER BY created_at DESC
        `;
        return res.status(200).json({ students: result.rows });
      }

      case 'POST': {
        const { user_id, student_code, level, disability, note } = req.body || {};
        if (!user_id || !student_code) {
          return res.status(400).json({ error: 'user_id and student_code are required' });
        }
        const result = await sql`
          INSERT INTO students (user_id, student_code, level, disability, note)
          VALUES (${user_id}, ${student_code}, ${level || ''}, ${disability || ''}, ${note || ''})
          RETURNING *
        `;
        return res.status(201).json({ student: result.rows[0] });
      }

      case 'PUT': {
        const { id, level, disability, note } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        const result = await sql`
          UPDATE students
          SET level = ${level || ''}, disability = ${disability || ''}, note = ${note || ''}
          WHERE id = ${id}
          RETURNING *
        `;
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Student not found' });
        }
        return res.status(200).json({ student: result.rows[0] });
      }

      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        await sql`DELETE FROM students WHERE id = ${id}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Students API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
