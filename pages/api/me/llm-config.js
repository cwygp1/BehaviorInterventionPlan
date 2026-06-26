import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureLlmConfigCached } from '../../../lib/ensureSchema';

// 전체 공용 LLM (LM Studio) 설정 — 모든 선생님이 같은 연결을 공유한다.
// 단일 행(app_llm_config.id = 1)만 사용한다.
//   GET    /api/me/llm-config   → { config } | { config: null }   (로그인만 필요)
//   PUT    /api/me/llm-config   → upsert { endpoint, model, model_fast, max_tokens } + password
//   DELETE /api/me/llm-config   → 공용 설정 초기화 + password
//
// 조회는 누구나(로그인 사용자) 가능하지만, 수정/삭제는 비밀번호가 필요하다.
// 비밀번호는 현재 'tomtom'으로 하드코딩되어 있다(추후 환경변수로 이전 가능).
const EDIT_PASSWORD = 'tomtom';

export default requireAuth(async function handler(req, res) {
  // `/api/migrate`가 아직 안 돌았어도 공용 설정 테이블이 보장되도록 자가치유.
  try {
    await ensureLlmConfigCached();
  } catch (e) {
    return res.status(500).json({ error: 'DB 스키마 준비 실패: ' + (e?.message || 'unknown') });
  }

  if (req.method === 'GET') {
    const r = await sql`
      SELECT endpoint, model, model_fast, max_tokens
        FROM app_llm_config
       WHERE id = 1
    `;
    if (r.rows.length === 0 || !r.rows[0].endpoint) {
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
    const { endpoint, model, model_fast, max_tokens, password } = req.body || {};
    if (password !== EDIT_PASSWORD) {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
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
      INSERT INTO app_llm_config (id, endpoint, model, model_fast, max_tokens, updated_at)
      VALUES (1, ${ep}, ${md}, ${mf}, ${mt}, NOW())
      ON CONFLICT (id)
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
    const { password } = req.body || {};
    if (password !== EDIT_PASSWORD) {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
    }
    await sql`DELETE FROM app_llm_config WHERE id = 1`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
