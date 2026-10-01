import { api } from './client';

// 사용자 선택 차트 데이터 — 설정별 60초 캐시 + 진행 중 요청 공유(DashBits 의 대시보드 캐시와 같은 방식).
// 기록 저장 후에는 invalidateDashboard()(DashBits) 가 invalidateChartData() 도 함께 부른다.
const cache = new Map(); // key → { data, ts, promise }
const TTL = 60 * 1000;

export function encodeCfg(cfg) {
  const s = typeof window === 'undefined'
    ? Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function invalidateChartData() { cache.clear(); }

export function fetchChartData(classId, semester, dashKey, cfg, force = false) {
  const enc = encodeCfg(cfg);
  const key = `${classId}:${semester}:${dashKey}:${enc}`;
  const hit = cache.get(key);
  if (!force && hit?.data && Date.now() - hit.ts < TTL) return Promise.resolve(hit.data);
  if (!force && hit?.promise) return hit.promise;
  const promise = api(`/api/chart-data?class_id=${classId}&semester=${semester}&dash=${dashKey}&cfg=${enc}`)
    .then((d) => { cache.set(key, { data: d, ts: Date.now(), promise: null }); return d; })
    .catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { data: hit?.data || null, ts: hit?.ts || 0, promise });
  return promise;
}
