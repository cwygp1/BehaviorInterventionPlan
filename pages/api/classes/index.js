import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// Classes (학급) — the middle layer between 선생님(user) and 학생(student).
//   GET    /api/classes              → all classes for the user (optionally ?year=)
//   POST   /api/classes              → create { school_year, name }
//   PUT    /api/classes              → rename { id, name } (and/or move year)
//   DELETE /api/classes              → delete { id }  (cascades to students)
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    switch (req.method) {
      case 'GET': {
        const { year } = req.query;
        let result;
        if (year) {
          result = await sql`
            SELECT c.*,
              (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count
            FROM classes c
            WHERE c.user_id = ${userId} AND c.school_year = ${Number(year)}
            ORDER BY c.name ASC
          `;
        } else {
          result = await sql`
            SELECT c.*,
              (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id) AS student_count
            FROM classes c
            WHERE c.user_id = ${userId}
            ORDER BY c.school_year DESC, c.name ASC
          `;
        }
        return res.status(200).json({ classes: result.rows });
      }

      case 'POST': {
        const { school_year, name } = req.body || {};
        const yr = Number(school_year);
        const nm = (name || '').trim();
        if (!yr || !nm) {
          return res.status(400).json({ error: 'school_year and name are required' });
        }
        try {
          const result = await sql`
            INSERT INTO classes (user_id, school_year, name)
            VALUES (${userId}, ${yr}, ${nm})
            RETURNING *
          `;
          return res.status(201).json({ class: { ...result.rows[0], student_count: 0 } });
        } catch (e) {
          // Unique violation → class already exists for this user/year/name.
          if (e && e.code === '23505') {
            return res.status(409).json({ error: '같은 학년도에 같은 이름의 학급이 이미 있습니다.' });
          }
          throw e;
        }
      }

      case 'PUT': {
        const { id, name, school_year } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id is required' });
        const nm = (name || '').trim();
        if (!nm) return res.status(400).json({ error: 'name is required' });
        const yr = school_year != null ? Number(school_year) : null;
        try {
          const result = yr != null
            ? await sql`
                UPDATE classes SET name = ${nm}, school_year = ${yr}
                WHERE id = ${id} AND user_id = ${userId}
                RETURNING *
              `
            : await sql`
                UPDATE classes SET name = ${nm}
                WHERE id = ${id} AND user_id = ${userId}
                RETURNING *
              `;
          if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Class not found' });
          }
          return res.status(200).json({ class: result.rows[0] });
        } catch (e) {
          if (e && e.code === '23505') {
            return res.status(409).json({ error: '같은 학년도에 같은 이름의 학급이 이미 있습니다.' });
          }
          throw e;
        }
      }

      case 'DELETE': {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id is required' });
        // Cascades to students (and their records) via FK ON DELETE CASCADE.
        await sql`DELETE FROM classes WHERE id = ${id} AND user_id = ${userId}`;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Classes API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
