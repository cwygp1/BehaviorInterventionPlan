import { sql } from '../../../../lib/db';
import { requireStudentAccess } from '../../../../lib/auth';

export default requireStudentAccess(async function handler(req, res) {
  const { studentId } = req.query;

  // KST formatter
  const fmtKst = (d) => {
    if (d == null || d === '') return '';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const mo = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(kst.getUTCDate()).padStart(2, '0');
    const h = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    const s = String(kst.getUTCSeconds()).padStart(2, '0');
    return `${y}-${mo}-${dy} ${h}:${mi}:${s}`;
  };

  // Build a response that exposes both the wrapped form (`data`) and the
  // flattened keys (`responses`, `updated_at`) used by the legacy SPA.
  const toEnvelope = (row) => {
    if (!row) return { data: null, responses: null, updated_at: null };
    const formatted = { ...row, updated_at: fmtKst(row.updated_at) };
    return { data: formatted, responses: row.responses, updated_at: formatted.updated_at };
  };

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM qabf_data WHERE student_id = ${studentId}
        `;
        return res.status(200).json(toEnvelope(result.rows[0] || null));
      }

      case 'POST':
      case 'PUT': {
        const { responses } = req.body || {};
        if (!responses || !Array.isArray(responses)) {
          return res.status(400).json({ error: 'responses array is required' });
        }
        const jsonResponses = JSON.stringify(responses);
        const result = await sql`
          INSERT INTO qabf_data (student_id, responses, updated_at)
          VALUES (${studentId}, ${jsonResponses}::jsonb, NOW())
          ON CONFLICT (student_id)
          DO UPDATE SET responses = ${jsonResponses}::jsonb, updated_at = NOW()
          RETURNING *
        `;
        return res.status(200).json(toEnvelope(result.rows[0]));
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('QABF API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
