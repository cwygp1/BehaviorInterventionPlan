import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    if (req.method === 'GET') {
      const r = await sql`SELECT * FROM priority_checklist WHERE student_id = ${studentId}`;
      return res.status(200).json({ data: r.rows[0] || null });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { responses } = req.body || {};
      const arr = Array.isArray(responses) ? responses : [];
      // 2026-08: 여러 행동을 평정하는 구조([{name, responses[9]}])로 확장.
      // total 컬럼에는 '가장 높은 행동의 총점'(=중재 우선순위 1순위 점수)을 넣는다.
      // 구버전(숫자 9칸 배열)도 그대로 저장·집계되도록 두 형태를 모두 처리한다.
      const sum = (a) => (Array.isArray(a) ? a.reduce((x, y) => x + (Number(y) || 0), 0) : 0);
      const total = (arr.length && typeof arr[0] === 'object' && arr[0] !== null)
        ? Math.max(0, ...arr.map((b) => sum(b?.responses)))
        : sum(arr);
      const json = JSON.stringify(arr);
      const r = await sql`
        INSERT INTO priority_checklist (student_id, responses, total, updated_at)
        VALUES (${studentId}, ${json}::jsonb, ${total}, NOW())
        ON CONFLICT (student_id)
        DO UPDATE SET responses = ${json}::jsonb, total = ${total}, updated_at = NOW()
        RETURNING *
      `;
      return res.status(200).json({ data: r.rows[0] });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Priority error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
