import { sql } from '../../../lib/db';
import { requireAuth, isDemoReq, rejectDemo, checkEditPassword } from '../../../lib/auth';
import { ensureUsageSchemaCached } from '../../../lib/ensureSchema';

// 클라우드 모델 단가 + 환율 관리.
//   GET /api/usage/pricing                 → { pricing, fx }  (로그인)
//   PUT /api/usage/pricing { password, rows, fx } → 단가 전체 교체 + 환율 저장
// PUT는 관리 비밀번호 필요(서버 비교, lib/auth.js checkEditPassword). rows 전체를 받아 DELETE 후 재삽입(전체 교체)한다.
// 1009(mds/48 #2): 체험 계정은 PUT 차단.
const num = (v) => Number(v) || 0;

export default requireAuth(async function handler(req, res) {
  try {
    await ensureUsageSchemaCached();
  } catch (e) {
    return res.status(500).json({ error: 'DB 스키마 준비 실패: ' + (e?.message || 'unknown') });
  }

  if (req.method === 'GET') {
    const priceR = await sql`
      SELECT provider, model, input_per_mtok, output_per_mtok, note, sort_order
        FROM ai_model_pricing
       ORDER BY sort_order ASC, provider ASC, model ASC
    `;
    const fxR = await sql`SELECT value FROM app_settings WHERE key = 'usd_krw'`;
    const fx = fxR.rows[0] ? num(fxR.rows[0].value) || 1380 : 1380;
    return res.status(200).json({
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
  }

  if (req.method === 'PUT') {
    if (isDemoReq(req)) return rejectDemo(res);
    const { password, rows, fx } = req.body || {};
    if (!checkEditPassword(password)) {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    // 환율 저장(양수일 때만).
    if (fx != null) {
      const f = num(fx);
      if (f > 0) {
        await sql`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('usd_krw', ${String(f)}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
      }
    }

    // 단가 전체 교체.
    if (Array.isArray(rows)) {
      const clean = rows
        .filter(
          (r) =>
            r &&
            typeof r.provider === 'string' &&
            r.provider.trim() &&
            typeof r.model === 'string' &&
            r.model.trim()
        )
        .map((r, i) => ({
          provider: r.provider.trim().slice(0, 60),
          model: r.model.trim().slice(0, 160),
          input: Math.max(0, num(r.input_per_mtok)),
          output: Math.max(0, num(r.output_per_mtok)),
          note: (typeof r.note === 'string' ? r.note : '').slice(0, 200),
          sort: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : (i + 1) * 10,
        }));

      // provider+model 중복 제거(뒤에 온 것 무시).
      const seen = new Set();
      const unique = [];
      for (const r of clean) {
        const k = r.provider + '::' + r.model;
        if (!seen.has(k)) {
          seen.add(k);
          unique.push(r);
        }
      }

      await sql`DELETE FROM ai_model_pricing`;
      for (const r of unique) {
        await sql`
          INSERT INTO ai_model_pricing (provider, model, input_per_mtok, output_per_mtok, note, sort_order, active)
          VALUES (${r.provider}, ${r.model}, ${r.input}, ${r.output}, ${r.note}, ${r.sort}, true)
        `;
      }
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
