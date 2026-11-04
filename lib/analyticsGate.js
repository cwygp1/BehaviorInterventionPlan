// Vercel 분석 스크립트를 끼울지(1103, mds/58 #10·#13·#20).
//   /_vercel/insights/script.js는 Vercel 배포에만 있다 — 로컬 next start·dev·같은 망 시험 주소에서 끼우면 404 콘솔 오류가 난다.
//   Vercel이 빌드 때 넣는 NEXT_PUBLIC_VERCEL_ENV가 있으면 끼우고, 그 변수가 꺼진 배포 설정이라도
//   실제 도메인(로컬·사설 주소가 아닌 곳)에서 열리면 끼운다 — 배포본의 분석은 지금과 같게.

/** 로컬·사설망 주소인가 — localhost·*.localhost·127.x·::1·0.0.0.0·10.x·192.168.x·172.16~31.x */
export function isLocalHostname(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]); const b = Number(m[2]);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/** 분석 스크립트를 끼울지 — vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV, host: location.hostname */
export function shouldLoadAnalytics(vercelEnv, host) {
  if (vercelEnv) return true;
  return !isLocalHostname(host);
}
