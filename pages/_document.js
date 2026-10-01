import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="application-name" content="꼬박꼬박 행동중재 통합 운영 시스템" />
        {/* 사이드바 '글씨 크게'(components/ui/FontSizeToggle.jsx FONT_KEY) — 화면을 그리기 전에 켜서 깜빡임을 막는다 */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('kb_font_lg')==='1')document.documentElement.setAttribute('data-font','lg')}catch(e){}" }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
