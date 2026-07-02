import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureStudentProfileColsCached } from '../../../lib/ensureSchema';

export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    // 자가치유: strengths/difficulties 컬럼이 없으면 추가(마이그레이션 전에도 동작).
    await ensureStudentProfileColsCached();
    switch (req.method) {
      case 'GET': {
        // Optionally scope to a single class via ?class_id=. Always include the
        // class's school_year and name so the client can group by 년도 → 학급.
        const { class_id } = req.query;
        const result = class_id
          ? await sql`
              SELECT s.*, c.school_year, c.name AS class_name
              FROM students s
              LEFT JOIN classes c ON c.id = s.class_id
              WHERE s.user_id = ${userId} AND s.class_id = ${Number(class_id)}
              ORDER BY s.created_at DESC
            `
          : await sql`
              SELECT s.*, c.school_year, c.name AS class_name
              FROM students s
              LEFT JOIN classes c ON c.id = s.class_id
              WHERE s.user_id = ${userId}
              ORDER BY s.created_at DESC
            `;
        return res.status(200).json({ students: result.rows });
      }

      case 'POST': {
        const { student_code, level, disability, note, strengths, difficulties, class_id } = req.body || {};
        if (!student_code) {
          return res.status(400).json({ error: 'student_code is required' });
        }
        if (!class_id) {
          return res.status(400).json({ error: 'class_id is required' });
        }
        // Verify the class belongs to this user before attaching the student.
        const cls = await sql`
          SELECT id FROM classes WHERE id = ${Number(class_id)} AND user_id = ${userId}
        `;
        if (cls.rows.length === 0) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        const result = await sql`
          INSERT INTO students (user_id, class_id, student_code, level, disability, note, strengths, difficulties)
          VALUES (${userId}, ${Number(class_id)}, ${student_code}, ${level || ''}, ${disability || ''}, ${note || ''}, ${strengths || ''}, ${difficulties || ''})
          RETURNING *
        `;
        return res.status(201).json({ student: result.rows[0] });
      }

      case 'PUT': {
        const { id, level, disability, note, strengths, difficulties, class_id } = req.body || {};
        if (!id) {
          return res.status(400).json({ error: 'id is required' });
        }
        // Optionally move the student to another class. Verify ownership of the
        // target class first so a student can't be moved into someone else's class.
        if (class_id != null) {
          const cls = await sql`
            SELECT id FROM classes WHERE id = ${Number(class_id)} AND user_id = ${userId}
          `;
          if (cls.rows.length === 0) {
            return res.status(403).json({ error: 'Forbidden' });
          }
        }
        // Ownership check is enforced via the WHERE clause — a student
        // belonging to another user simply won't match and returns 404.
        const result = class_id != null
          ? await sql`
              UPDATE students
              SET level = ${level || ''}, disability = ${disability || ''}, note = ${note || ''},
                  strengths = COALESCE(${strengths ?? null}, strengths), difficulties = COALESCE(${difficulties ?? null}, difficulties), class_id = ${Number(class_id)}
              WHERE id = ${id} AND user_id = ${userId}
              RETURNING *
            `
          : await sql`
              UPDATE students
              SET level = ${level || ''}, disability = ${disability || ''}, note = ${note || ''},
                  strengths = COALESCE(${strengths ?? null}, strengths), difficulties = COALESCE(${difficulties ?? null}, difficulties)
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
