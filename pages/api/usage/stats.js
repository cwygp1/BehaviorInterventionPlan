import { sql } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';
import { ensureUsageSchemaCached } from '../../../lib/ensureSchema';

// 기간별 AI 사용량 집계 + 클라우드 단가 + 환율을 한 번에 반환한다.
// 관리 비밀번호(tomtom) 게이트. 대시보드 조회 전용.
//   POST /api/usage/stats { password, days }
const EDIT_PASSWORD = 'tomtom';
const num = (v) => Number(v) || 0;

export default requireAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureUsageSchemaCached();
  } catch (e) {
    return res.status(500).json({ error: 'DB 스키마 준비 실패: ' + (e?.message || 'unknown') });
  }

  const { password } = req.body || {};
  if (password !== EDIT_PASSWORD) {
    return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
  }

  let days = Number.parseInt(req.body?.days, 10);
  if (!Number.isFinite(days) || days < 1 || days > 3650) days = 30;

  try {
    const totalR = await sql`
      SELECT COUNT(*)::int AS requests,
             COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COUNT(DISTINCT user_id)::int AS active_users
        FROM ai_usage_log
       WHERE created_at >= NOW() - make_interval(days => ${days})
    `;

    const perUserR = await sql`
      SELECT l.user_id AS user_id,
             COALESCE(u.name, '(탈퇴/미상)') AS name,
             COALESCE(u.email, '') AS email,
             COUNT(*)::int AS requests,
             COALESCE(SUM(l.prompt_tokens), 0) AS prompt_tokens,
             COALESCE(SUM(l.completion_tokens), 0) AS completion_tokens,
             COALESCE(SUM(l.total_tokens), 0) AS total_tokens
        FROM ai_usage_log l
        LEFT JOIN users u ON u.id = l.user_id
       WHERE l.created_at >= NOW() - make_interval(days => ${days})
       GROUP BY l.user_id, u.name, u.email
       ORDER BY total_tokens DESC
       LIMIT 200
    `;

    const perModelR = await sql`
      SELECT COALESCE(NULLIF(model, ''), '(미지정)') AS model,
             COUNT(*)::int AS requests,
             COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
             COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM ai_usage_log
       WHERE created_at >= NOW() - make_interval(days => ${days})
       GROUP BY 1
       ORDER BY total_tokens DESC
    `;

    const priceR = await sql`
      SELECT provider, model, input_per_mtok, output_per_mtok, note, sort_order
        FROM ai_model_pricing
       WHERE active = true
       ORDER BY sort_order ASC, provider ASC, model ASC
    `;

    const fxR = await sql`SELECT value FROM app_settings WHERE key = 'usd_krw'`;
    const fx = fxR.rows[0] ? num(fxR.rows[0].value) || 1380 : 1380;

    const t = totalR.rows[0] || {};
    return res.status(200).json({
      days,
      total: {
        requests: num(t.requests),
        prompt_tokens: num(t.prompt_tokens),
        completion_tokens: num(t.completion_tokens),
        total_tokens: num(t.total_tokens),
        active_users: num(t.active_users),
      },
      perUser: perUserR.rows.map((r) => ({
        user_id: r.user_id,
        name: r.name,
        email: r.email,
        requests: num(r.requests),
        prompt_tokens: num(r.prompt_tokens),
        completion_tokens: num(r.completion_tokens),
        total_tokens: num(r.total_tokens),
      })),
      perModel: perModelR.rows.map((r) => ({
        model: r.model,
        requests: num(r.requests),
        prompt_tokens: num(r.prompt_tokens),
        completion_tokens: num(r.completion_tokens),
        total_tokens: num(r.total_tokens),
      })),
      pricing: priceR.rows.map((r) => ({
        provider: r.provider,
        model: r.model,
        input_per_mtok: num(r.input_per_mtok),
        output_per_mtok: num(r.output_per_mtok),
        note: r.note || '',
        sort_order: num(r.sort_order),
      })),
      fx,
    });
  } catch (e) {
    return res.status(500).json({ error: '집계 실패: ' + (e?.message || 'unknown') });
  }
});
