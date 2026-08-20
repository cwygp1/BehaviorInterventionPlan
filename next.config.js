/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 0819: 빌드(배포) 시각 — 사이드바 하단에 표시해 "수정이 반영된 버전인지"를
  // 교사·테스터가 새로고침만으로 확인할 수 있게 한다(빌드 시점에 고정됨).
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}

module.exports = nextConfig
