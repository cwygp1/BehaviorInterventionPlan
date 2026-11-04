// 로그아웃한 세션 토큰 무효화(mds/58 auth-24, 1104) — 순수 함수·캐시만(DB 없음, 단위 테스트용).
//
// 원리: users.token_version(기본 0)을 JWT payload의 tv에 싣는다. 로그아웃하면 DB 값을 +1 하므로
//   그 전에 발급된 토큰(tv가 옛 값)은 서버에서 더는 통과하지 못한다.
//   - tv가 없는 토큰(이 기능 전에 발급된 것)은 0으로 본다 → 배포 직후 모두 로그아웃되지 않음.
//   - 로그아웃은 그 사용자의 모든 기기 세션을 끝낸다(버전이 사용자 단위라서).
//   - 버전 조회는 인스턴스 메모리에 짧게(기본 30초) 캐시한다. 로그아웃한 인스턴스는 바로 새 값으로 덮는다.
//     다른 서버 인스턴스는 최대 TTL만큼 옛 토큰을 더 받아 줄 수 있다.

export const TOKEN_VERSION_TTL_MS = 30 * 1000;
const MAX_ENTRIES = 5000;

// payload의 tv → 0 이상의 정수. 없거나 이상하면 0.
export function tokenVersionOf(payload) {
  const n = Number(payload && payload.tv);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

// DB 값(dbVersion)과 토큰 버전이 같으면 통과. dbVersion이 null/undefined면(사용자 행 없음) 통과 못 함.
export function isTokenVersionCurrent(payload, dbVersion) {
  if (dbVersion === null || dbVersion === undefined) return false;
  const db = Number(dbVersion);
  if (!Number.isFinite(db)) return false;
  return tokenVersionOf(payload) === db;
}

// 사용자별 버전 캐시. now는 시험용으로 바꿀 수 있다.
export function createVersionCache({ ttlMs = TOKEN_VERSION_TTL_MS, max = MAX_ENTRIES, now = () => Date.now() } = {}) {
  const map = new Map();
  return {
    // 캐시에 살아 있으면 { version } (version은 null일 수 있음 = 사용자 없음), 없거나 지났으면 undefined.
    get(userId) {
      const key = String(userId);
      const hit = map.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) {
        map.delete(key);
        return undefined;
      }
      return { version: hit.version };
    },
    set(userId, version) {
      if (map.size >= max) map.clear(); // 단순 상한 — 넘치면 비우고 다시 채운다
      map.set(String(userId), { version: version === undefined ? null : version, at: now() });
    },
    delete(userId) {
      map.delete(String(userId));
    },
    size() {
      return map.size;
    },
  };
}
