import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureTierScopingCached } from '../../../lib/ensureSchema';

// Tier 2 small groups (소그룹) — scoped to (class_id, semester).
// Tier 3 is modeled as a flag on a membership row (tier3 = true), so
// Tier 3 ⊂ Tier 2 ⊂ class, matching the intended hierarchy.
//
//   GET    /api/tier2-groups?class_id=ID&semester=1
//            → groups with their members [{ id, student_id, code, tier3 }]
//   POST   /api/tier2-groups   body.action:
//            'create_group'  { class_id, semester, name, note? }
//            'add_member'    { group_id, student_id }
//            'remove_member' { group_id, student_id }
//            'set_tier3'     { group_id, student_id, tier3 }
//   PUT    /api/tier2-groups   { id, name?, note? }      (rename / edit group)
//   DELETE /api/tier2-groups   { id }                    (delete group)
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    try { await ensureTierScopingCached(); } catch (_e) { /* best-effort self-heal */ }

    async function ownsClass(classId) {
      if (!classId) return false;
      const r = await sql`SELECT id FROM classes WHERE id = ${classId} AND user_id = ${userId}`;
      return r.rows.length > 0;
    }
    async function ownsGroup(groupId) {
      if (!groupId) return false;
      const r = await sql`SELECT id FROM tier2_groups WHERE id = ${groupId} AND user_id = ${userId}`;
      return r.rows.length > 0;
    }
    async function ownsStudent(studentId) {
      if (!studentId) return false;
      const r = await sql`SELECT id FROM students WHERE id = ${studentId} AND user_id = ${userId}`;
      return r.rows.length > 0;
    }

    if (req.method === 'GET') {
      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const semester = req.query.semester ? Number(req.query.semester) : 1;
      if (!classId) return res.status(400).json({ error: 'class_id is required' });
      if (!(await ownsClass(classId))) return res.status(403).json({ error: 'Forbidden' });
      const groups = await sql`
        SELECT * FROM tier2_groups
        WHERE class_id = ${classId} AND semester = ${semester}
        ORDER BY created_at ASC
      `;
      const members = await sql`
        SELECT m.id, m.group_id, m.student_id, m.tier3, s.student_code AS code
        FROM tier2_group_members m
        JOIN tier2_groups g ON g.id = m.group_id
        JOIN students s ON s.id = m.student_id
        WHERE g.class_id = ${classId} AND g.semester = ${semester}
        ORDER BY s.student_code ASC
      `;
      const byGroup = {};
      members.rows.forEach((m) => {
        (byGroup[m.group_id] = byGroup[m.group_id] || []).push({
          id: m.id, student_id: m.student_id, code: m.code, tier3: m.tier3,
        });
      });
      const data = groups.rows.map((g) => ({ ...g, members: byGroup[g.id] || [] }));
      return res.status(200).json({ groups: data });
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (action === 'create_group') {
        const { class_id, semester, name, note } = req.body || {};
        const classId = class_id ? Number(class_id) : null;
        const sem = semester ? Number(semester) : 1;
        const nm = (name || '').trim();
        if (!classId || !nm) return res.status(400).json({ error: 'class_id and name are required' });
        if (!(await ownsClass(classId))) return res.status(403).json({ error: 'Forbidden' });
        try {
          const r = await sql`
            INSERT INTO tier2_groups (user_id, class_id, semester, name, note)
            VALUES (${userId}, ${classId}, ${sem}, ${nm}, ${note || ''})
            RETURNING *
          `;
          return res.status(201).json({ group: { ...r.rows[0], members: [] } });
        } catch (e) {
          if (e && e.code === '23505') {
            return res.status(409).json({ error: '같은 반/학기에 같은 이름의 소그룹이 이미 있습니다.' });
          }
          throw e;
        }
      }

      if (action === 'add_member' || action === 'remove_member' || action === 'set_tier3') {
        const { group_id, student_id, tier3 } = req.body || {};
        const groupId = group_id ? Number(group_id) : null;
        const studentId = student_id ? Number(student_id) : null;
        if (!groupId || !studentId) return res.status(400).json({ error: 'group_id and student_id are required' });
        if (!(await ownsGroup(groupId)) || !(await ownsStudent(studentId))) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (action === 'add_member') {
          await sql`
            INSERT INTO tier2_group_members (group_id, student_id)
            VALUES (${groupId}, ${studentId})
            ON CONFLICT (group_id, student_id) DO NOTHING
          `;
        } else if (action === 'remove_member') {
          await sql`DELETE FROM tier2_group_members WHERE group_id = ${groupId} AND student_id = ${studentId}`;
        } else { // set_tier3
          await sql`
            UPDATE tier2_group_members SET tier3 = ${!!tier3}
            WHERE group_id = ${groupId} AND student_id = ${studentId}
          `;
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'PUT') {
      const { id, name, note } = req.body || {};
      const groupId = id ? Number(id) : null;
      if (!groupId) return res.status(400).json({ error: 'id is required' });
      if (!(await ownsGroup(groupId))) return res.status(403).json({ error: 'Forbidden' });
      const nm = name != null ? String(name).trim() : null;
      try {
        const r = nm != null
          ? await sql`UPDATE tier2_groups SET name = ${nm}, note = ${note || ''}, updated_at = NOW() WHERE id = ${groupId} RETURNING *`
          : await sql`UPDATE tier2_groups SET note = ${note || ''}, updated_at = NOW() WHERE id = ${groupId} RETURNING *`;
        return res.status(200).json({ group: r.rows[0] });
      } catch (e) {
        if (e && e.code === '23505') {
          return res.status(409).json({ error: '같은 반/학기에 같은 이름의 소그룹이 이미 있습니다.' });
        }
        throw e;
      }
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      const groupId = id ? Number(id) : null;
      if (!groupId) return res.status(400).json({ error: 'id is required' });
      if (!(await ownsGroup(groupId))) return res.status(403).json({ error: 'Forbidden' });
      await sql`DELETE FROM tier2_groups WHERE id = ${groupId}`; // cascades members
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Tier2 groups API error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
