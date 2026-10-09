import { requireAuth, isDemoReq, rejectDemo, checkEditPassword } from '../../../lib/auth';

// 1009(mds/48 #2): 관리 비밀번호 확인 — AI 설정 창의 '고급(공용 설정·사용량)' 잠금 해제용.
//   예전에는 클라이언트 번들에 든 상수와 비교했는데, 그 값이 누구에게나 보여 체험 계정도 전체 교사 사용량을 볼 수 있었다.
//   이제 비밀번호는 서버(환경변수 AI_EDIT_PASSWORD)에만 있고, 클라이언트는 친 값을 보내 맞는지만 묻는다.
//   POST /api/usage/unlock { password } → { ok: true }
export default requireAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isDemoReq(req)) return rejectDemo(res);
  const { password } = req.body || {};
  if (!checkEditPassword(password)) return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.' });
  return res.status(200).json({ ok: true });
});
