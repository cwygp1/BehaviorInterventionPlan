import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="application-name" content="꼬박꼬박 행동중재 통합 운영 시스템" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
