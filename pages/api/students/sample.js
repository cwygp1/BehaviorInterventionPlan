import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureStudentProfileColsCached } from '../../../lib/ensureSchema';
import { seedSampleStudents } from '../../../lib/sampleSeed';

// 샘플 체험 — POST: 현재 학급에 샘플 학생 2명 + 약 9주치 기록을 시드(본문은 lib/sampleSeed.js).
//            DELETE: 이 사용자의 샘플 학생을 일괄 삭제(기록은 ON DELETE CASCADE).
// 학생 코드('샘플A'/'샘플B')는 UNIQUE(user_id, student_code)라 중복 시드가 자연 차단된다.
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    await ensureStudentProfileColsCached(); // is_sample 컬럼 자가치유
    switch (req.method) {
      case 'POST': {
        const { class_id } = req.body || {};
        if (!class_id) return res.status(400).json({ error: 'class_id is required' });
        const cls = await sql`
          SELECT id FROM classes WHERE id = ${Number(class_id)} AND user_id = ${userId}
        `;
        if (cls.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });

        const existing = await sql`
          SELECT id FROM students WHERE user_id = ${userId} AND is_sample = TRUE
        `;
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: '샘플 학생이 이미 있습니다. 먼저 샘플을 삭제해 주세요.' });
        }

        const created = await seedSampleStudents({ sql, userId, classId: Number(class_id) });

        if (created.length === 0) {
          return res.status(409).json({ error: "학생 코드 '샘플A/샘플B'가 이미 사용 중이에요. 해당 학생을 정리한 뒤 다시 시도해 주세요." });
        }
        return res.status(201).json({ students: created });
      }

      case 'DELETE': {
        // 샘플 학생 삭제 — 관련 기록은 전부 ON DELETE CASCADE로 함께 삭제된다.
        const del = await sql`
          DELETE FROM students WHERE user_id = ${userId} AND is_sample = TRUE RETURNING id
        `;
        return res.status(200).json({ success: true, removed: del.rows.length });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Sample students API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
