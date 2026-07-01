import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureUsageSchemaCached } from '../../../lib/ensureSchema';

// 요청별 AI 토큰 사용량 기록. 로그인 사용자면 누구나 자기 사용량을 남긴다.
// (조회/집계는 /api/usage/stats 에서 비밀번호 게이트로 보호한다.)
//   POST /api/usage/log { model, tier, label, prompt_tokens, completion_tokens, total_tokens }
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureUsageSchemaCached();
  } catch (e) {
    return res.status(500).json({ error: 'DB 스키마 준비 실패: ' + (e?.message || 'unknown') });
  }

  const b = req.body || {};
  const clampInt = (v) => {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 100000000); // 1억 토큰 상한(비정상 값 방어)
  };
  const pt = clampInt(b.prompt_tokens);
  const ct = clampInt(b.completion_tokens);
  const tt = clampInt(b.total_tokens) || pt + ct;
  const model = (typeof b.model === 'string' ? b.model : '').slice(0, 200);
  const tier = (typeof b.tier === 'string' ? b.tier : '').slice(0, 20);
  const label = (typeof b.label === 'string' ? b.label : '').slice(0, 160);

  // 토큰이 전혀 없으면 기록하지 않는다.
  if (!pt && !ct && !tt) return res.status(200).json({ ok: true, skipped: true });

  try {
    await sql`
      INSERT INTO ai_usage_log (user_id, model, tier, label, prompt_tokens, completion_tokens, total_tokens)
      VALUES (${req.userId}, ${model}, ${tier}, ${label}, ${pt}, ${ct}, ${tt})
    `;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: '사용량 기록 실패: ' + (e?.message || 'unknown') });
  }
});
