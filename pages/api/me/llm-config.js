import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// Per-user LLM (LM Studio) settings.
//   GET    /api/me/llm-config          → { config } | { config: null }
//   PUT    /api/me/llm-config          → upsert { endpoint, model, max_tokens }
//   DELETE /api/me/llm-config          → remove this user's config
//
// We store config server-side so settings follow the user across devices and
// don't leak between accounts on a shared browser.
export default requireAuth(async function handler(req, res) {
  const userId = req.userId;

  if (req.method === 'GET') {
    const r = await sql`
      SELECT endpoint, model, model_fast, max_tokens
        FROM user_llm_configs
       WHERE user_id = ${userId}
    `;
    if (r.rows.length === 0) {
      return res.status(200).json({ config: null });
    }
    const row = r.rows[0];
    return res.status(200).json({
      config: {
        endpoint: row.endpoint,
        model: row.model || '',
        model_fast: row.model_fast || '',
        max_tokens: row.max_tokens || 8000,
      },
    });
  }

  if (req.method === 'PUT') {
    const { endpoint, model, model_fast, max_tokens } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.trim()) {
      return res.status(400).json({ error: 'endpoint는 필수입니다.' });
    }
    const mt = Number.parseInt(max_tokens, 10);
    if (!Number.isFinite(mt) || mt < 256 || mt > 65536) {
      return res.status(400).json({ error: 'max_tokens는 256~65536 사이여야 합니다.' });
    }
    const ep = endpoint.trim();
    const md = (typeof model === 'string' ? model.trim() : '') || '';
    const mf = (typeof model_fast === 'string' ? model_fast.trim() : '') || '';
    await sql`
      INSERT INTO user_llm_configs (user_id, endpoint, model, model_fast, max_tokens, updated_at)
      VALUES (${userId}, ${ep}, ${md}, ${mf}, ${mt}, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        endpoint   = EXCLUDED.endpoint,
        model      = EXCLUDED.model,
        model_fast = EXCLUDED.model_fast,
        max_tokens = EXCLUDED.max_tokens,
        updated_at = NOW()
    `;
    return res.status(200).json({
      config: { endpoint: ep, model: md, model_fast: mf, max_tokens: mt },
    });
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM user_llm_configs WHERE user_id = ${userId}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
