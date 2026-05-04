import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM students WHERE user_id = ${userId} ORDER BY created_at DESC
        `;
        return res.status(200).json({ students: result.rows });
      }

      case 'POST': {
        const { student_code, level, disability, note } = req.body || {};
        if (!student_code) {
          return res.status(400).json({ error: 'student_code is required' });
        }
        const result = await sql`
          INSERT INTO students (user_id, student_code, level, disability, note)
          VALUES (${userId}, ${student_code}, ${level || ''}, ${disability || ''}, ${note || ''})
          RETURNING *
        `;
        return res.status(201).json({ student: result.rows[0] });
      }

      case 'PUT': {
        const { id, level, disability, note } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        // Ownership check is enforced via the WHERE clause — a student
        // belonging to another user simply won't match and returns 404.
        const result = await sql`
          UPDATE students
          SET level = ${level || ''}, disability = ${disability || ''}, note = ${note || ''}
          WHERE id = ${id} AND user_id = ${userId}
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
        await sql`DELETE FROM students WHERE id = ${id} AND user_id = ${userId}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Students API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
