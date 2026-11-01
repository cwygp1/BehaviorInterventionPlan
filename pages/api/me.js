import { sql } from '../../lib/db';
import { requireAuth, setUiCookie, readReqCookie } from '../../lib/auth';
import { ensureUserTierColCached, ensureUserRoleColCached, ensureUserDemoColCached, ensureUserUiModeColCached } from '../../lib/ensureSchema';
import { normalizeUsedTiers } from '../../lib/tiers';
import { UI_COOKIE, normalizeUiMode, effectiveUiMode } from '../../lib/uiMode';

// GET   /api/me — return the authenticated user's profile, or 401 if no session.
//                 Used by the frontend on bootstrap to restore session state.
// PATCH /api/me — update the teacher's menu scoping (used_tiers, '1,2,3' CSV)
//                 or 화면 모양(ui_mode: 'new' | 'legacy', mds/54 §4 — 1101).
//
// 응답 user.ui_mode는 실제로 열 화면('new' | 'legacy') — 고른 적 없으면 'legacy', 체험 계정은 항상 'legacy'.
//   화면 모양 쿠키 kb_ui가 계정 값과 다르면 같이 맞춘다(다른 기기에서 바꾼 경우 — middleware 첫 분기용).
function shape(row) {
  return { ...row, is_demo: !!row.is_demo, ui_mode: effectiveUiMode({ ui_mode: normalizeUiMode(row.ui_mode), is_demo: !!row.is_demo }) };
}

function syncUiCookie(req, res, user) {
  if (user.is_demo) return; // 체험은 쿠키를 건드리지 않는다(실제 교사의 마지막 선택을 남김)
  if (readReqCookie(req, UI_COOKIE) !== user.ui_mode) setUiCookie(res, user.ui_mode);
}

export default requireAuth(async function handler(req, res) {
  // 자가치유: /api/migrate 전에도 used_tiers·role 컬럼 조회/수정이 동작하도록 보정.
  await ensureUserTierColCached();
  await ensureUserRoleColCached();
  await ensureUserDemoColCached(); // 체험 계정 표시(is_demo) — 화면이 체험 재생기를 띄울지 정한다(mds/46)
  await ensureUserUiModeColCached(); // 화면 모양(mds/54)

  if (req.method === 'GET') {
    const result = await sql`
      SELECT id, email, name, school, used_tiers, role, is_demo, ui_mode FROM users WHERE id = ${req.userId}
    `;
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = shape(result.rows[0]);
    syncUiCookie(req, res, user);
    return res.status(200).json({ user });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    // 화면 모양만 바꾸는 요청 — { ui_mode: 'new' | 'legacy' }
    if (body.ui_mode !== undefined && body.used_tiers === undefined) {
      const mode = normalizeUiMode(body.ui_mode);
      if (!mode) return res.status(400).json({ error: "ui_mode는 'new' 또는 'legacy'여야 합니다." });
      const result = await sql`
        UPDATE users SET ui_mode = ${mode} WHERE id = ${req.userId}
        RETURNING id, email, name, school, used_tiers, role, is_demo, ui_mode
      `;
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = shape(result.rows[0]);
      syncUiCookie(req, res, user);
      return res.status(200).json({ user });
    }

    // '1,2,3'의 부분집합만 허용, 최소 1개. 정렬·중복 제거 후 저장.
    const csv = normalizeUsedTiers(body.used_tiers);
    if (!csv) {
      return res.status(400).json({ error: '최소 1개의 지원 단계(Tier)를 선택해야 합니다.' });
    }
    const result = await sql`
      UPDATE users SET used_tiers = ${csv} WHERE id = ${req.userId}
      RETURNING id, email, name, school, used_tiers, role, is_demo, ui_mode
    `;
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json({ user: shape(result.rows[0]) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
