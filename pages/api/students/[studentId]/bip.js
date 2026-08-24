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

  // Expose the row under BOTH `data` (current API shape) and `bip` (the key
  // expected by the legacy SPA's fetchStudentData).
  const toEnvelope = (row) => {
    if (!row) return { data: null, bip: null };
    const formatted = { ...row, updated_at: fmtKst(row.updated_at) };
    return { data: formatted, bip: formatted };
  };

  try {
    switch (req.method) {
      case 'GET': {
        const result = await sql`
          SELECT * FROM bip_data WHERE student_id = ${studentId}
        `;
        return res.status(200).json(toEnvelope(result.rows[0] || null));
      }

      case 'POST':
      case 'PUT': {
        const { alt, fct, crit, prev, teach, reinf, resp, opdef, bgoal, bgoal_dest, hypothesis, interview } = req.body || {};
        // 0719 피드백: 조작적 정의(opdef)·행동목표(bgoal) — /api/migrate 전에도 동작하도록 셀프힐.
        await sql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS opdef TEXT NOT NULL DEFAULT ''`;
        await sql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS bgoal TEXT NOT NULL DEFAULT ''`;
        // 0814 전문가 자문: 행동목표 행선지 — 'iep'(개별화 목표로) | 'subject'(교과 목표에 녹임) | ''(미선택).
        await sql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS bgoal_dest VARCHAR(20) NOT NULL DEFAULT ''`;
        // 0822 워크플로 개편: ⑤ 행동기능 가설문 · ① 초기면담지(JSON) — 셀프힐 컬럼 추가.
        await sql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS hypothesis TEXT NOT NULL DEFAULT ''`;
        await sql`ALTER TABLE bip_data ADD COLUMN IF NOT EXISTS interview JSONB NOT NULL DEFAULT '{}'`;
        const dest = bgoal_dest === undefined ? undefined : (['iep', 'subject'].includes(bgoal_dest) ? bgoal_dest : '');
        const interviewJson = interview === undefined ? null : JSON.stringify(interview || {});
        // 부분 업데이트: 전달되지 않은(undefined) 필드는 기존 값을 유지한다 —
        // 초기면담지 모달처럼 일부만 저장하는 화면이 BIP 본문을 지우지 않게(반대도 동일).
        const result = await sql`
          INSERT INTO bip_data (student_id, alt, fct, crit, prev, teach, reinf, resp, opdef, bgoal, bgoal_dest, hypothesis, interview, updated_at)
          VALUES (${studentId}, ${alt || ''}, ${fct || ''}, ${crit || ''}, ${prev || ''}, ${teach || ''}, ${reinf || ''}, ${resp || ''}, ${opdef || ''}, ${bgoal || ''}, ${dest || ''}, ${hypothesis || ''}, ${interviewJson || '{}'}::jsonb, NOW())
          ON CONFLICT (student_id)
          DO UPDATE SET
            alt = COALESCE(${alt ?? null}, bip_data.alt),
            fct = COALESCE(${fct ?? null}, bip_data.fct),
            crit = COALESCE(${crit ?? null}, bip_data.crit),
            prev = COALESCE(${prev ?? null}, bip_data.prev),
            teach = COALESCE(${teach ?? null}, bip_data.teach),
            reinf = COALESCE(${reinf ?? null}, bip_data.reinf),
            resp = COALESCE(${resp ?? null}, bip_data.resp),
            opdef = COALESCE(${opdef ?? null}, bip_data.opdef),
            bgoal = COALESCE(${bgoal ?? null}, bip_data.bgoal),
            bgoal_dest = COALESCE(${dest ?? null}, bip_data.bgoal_dest),
            hypothesis = COALESCE(${hypothesis ?? null}, bip_data.hypothesis),
            interview = COALESCE(${interviewJson}::jsonb, bip_data.interview),
            updated_at = NOW()
          RETURNING *
        `;
        return res.status(200).json(toEnvelope(result.rows[0]));
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('BIP API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
