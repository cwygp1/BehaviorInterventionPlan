import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';
import { ensureCrisisScenariosCached } from '../../../../lib/ensureSchema';

// 1020(피드백 3차 ①): 위기 시나리오(Acting-Out Cycle 7단계) 이력 — family-letters.js와 같은 틀.
// GET 목록 / POST 새로 저장 / PUT 같은 기록 덮어쓰기(교사 편집본) / DELETE 삭제. 모두 학생 소유권 검사(requireStudentAccess).
const fmtKst = (d) => {
  if (d == null || d === '') return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:${p(kst.getUTCSeconds())}`;
};
const toResponse = (row) => ({ ...row, created_at: fmtKst(row.created_at), updated_at: fmtKst(row.updated_at) });
const MAX_LEN = 40000;

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;
  try {
    await ensureCrisisScenariosCached();
    if (req.method === 'GET') {
      const r = await sql`SELECT * FROM crisis_scenarios WHERE student_id = ${studentId} ORDER BY created_at DESC`;
      return res.status(200).json({ records: r.rows.map(toResponse) });
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const { id, situation, output } = req.body || {};
      if (!output || !String(output).trim()) return res.status(400).json({ error: 'output required' });
      const sit = String(situation || '').slice(0, 4000);
      const out = String(output).slice(0, MAX_LEN);
      if (req.method === 'PUT') {
        if (!id) return res.status(400).json({ error: 'id required' });
        const r = await sql`
          UPDATE crisis_scenarios SET situation = ${sit}, output = ${out}, updated_at = NOW()
          WHERE id = ${id} AND student_id = ${studentId}
          RETURNING *
        `;
        if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ record: toResponse(r.rows[0]) });
      }
      const r = await sql`
        INSERT INTO crisis_scenarios (student_id, situation, output)
        VALUES (${studentId}, ${sit}, ${out})
        RETURNING *
      `;
      return res.status(201).json({ record: toResponse(r.rows[0]) });
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM crisis_scenarios WHERE id = ${id} AND student_id = ${studentId}`;
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Crisis scenarios error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
