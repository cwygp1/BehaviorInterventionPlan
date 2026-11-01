import { clearAuthCookie, getSessionFromReq, setDemoCookie } from '../../../lib/auth';
import { sql } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // 1009(mds/48 #18): 체험 계정이 '내 계정 만들기'·로그아웃으로 나가면 그 사용자를 바로 지운다(24h를 기다리지 않음). 진짜 사용자는 is_demo 확인으로 보호.
  try {
    const sess = getSessionFromReq(req);
    if (sess && sess.demo && sess.sub) {
      await sql`DELETE FROM ai_usage_log WHERE user_id = ${sess.sub}`;
      await sql`DELETE FROM users WHERE id = ${sess.sub} AND is_demo = TRUE`;
    }
  } catch (e) {
    console.error('Demo user delete on logout skipped:', e?.message || e);
  }
  clearAuthCookie(res);
  // 화면 모양 쿠키(kb_ui)는 지우지 않는다 — 다음 로그인 창에 전 선택이 미리 찍힌다(mds/54 §4-1). 체험 표시만 끈다.
  setDemoCookie(res, false);
  return res.status(200).json({ success: true });
}
