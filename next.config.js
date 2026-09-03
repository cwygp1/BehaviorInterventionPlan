/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 0828: 검증용 빌드가 켜져 있는 dev 서버의 .next를 덮어써 ChunkLoadError를 내지
  // 않도록, 출력 폴더를 환경변수로 바꿀 수 있게 한다(미설정 시 기본 '.next' 그대로).
  //   예) NEXT_DIST_DIR=.next-verify npx next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // 0819: 빌드(배포) 시각 — 사이드바 하단에 표시해 "수정이 반영된 버전인지"를
  // 교사·테스터가 새로고침만으로 확인할 수 있게 한다(빌드 시점에 고정됨).
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}

module.exports = nextConfig
