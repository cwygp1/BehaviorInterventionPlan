import { sql } from '../../lib/db';
import { requireAuth } from '../../lib/auth';

// 학급관리 체크리스트 (Tier 1) — 반·학기 단위 1행.
//   GET  /api/class-checklist?class_id=ID&semester=1
//   POST /api/class-checklist  body { class_id, semester, responses }
//   responses(JSONB): { cwpbs: [0..3 ×10], solve: [0..4 ×30], fidelity: [0..2 ×7] } (-1 = 미응답)
// 0825: 저장은 키 단위 병합(||) — 실행충실도 1(cwpbs·solve)과 2(fidelity)가
//   서로 다른 화면에서 같은 행을 나눠 쓰므로, 부분 저장이 상대 키를 지우지 않게.
// 자가치유: 테이블이 없으면 생성(마이그레이션 전에도 동작).
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS class_mgmt_checklist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        semester INTEGER NOT NULL DEFAULT 1,
        responses JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(class_id, semester)
      )
    `;

    async function ownsClass(classId) {
      if (!classId) return false;
      const r = await sql`SELECT id FROM classes WHERE id = ${classId} AND user_id = ${userId}`;
      return r.rows.length > 0;
    }

    if (req.method === 'GET') {
      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const semester = req.query.semester ? Number(req.query.semester) : 1;
      if (!classId) return res.status(400).json({ error: 'class_id is required' });
      if (!(await ownsClass(classId))) return res.status(403).json({ error: 'Forbidden' });
      const r = await sql`
        SELECT * FROM class_mgmt_checklist WHERE class_id = ${classId} AND semester = ${semester}
      `;
      return res.status(200).json({ data: r.rows[0] || null });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { class_id, semester, responses } = req.body || {};
      const classId = class_id ? Number(class_id) : null;
      const sem = semester ? Number(semester) : 1;
      if (!classId) return res.status(400).json({ error: 'class_id is required' });
      if (!(await ownsClass(classId))) return res.status(403).json({ error: 'Forbidden' });
      const json = JSON.stringify(responses || {});
      const r = await sql`
        INSERT INTO class_mgmt_checklist (user_id, class_id, semester, responses, updated_at)
        VALUES (${userId}, ${classId}, ${sem}, ${json}::jsonb, NOW())
        ON CONFLICT (class_id, semester)
        DO UPDATE SET responses = class_mgmt_checklist.responses || ${json}::jsonb, updated_at = NOW()
        RETURNING *
      `;
      return res.status(200).json({ data: r.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Class checklist error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
