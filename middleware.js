import { NextResponse } from 'next/server';

// 새 디자인 병행(mds/54 §4-3) — 첫 요청부터 화면 모양 쿠키로 '/' ↔ '/new'를 고른다(깜박임 방지 첫 겹).
//   kb_ui=new 인데 '/'  → '/new'
//   kb_ui=legacy 인데 '/new' → '/'
//   쿠키가 없으면 통과(로그인 창에서 고른 뒤 쿠키가 생긴다). 체험 중(kb_demo=1)이면 언제나 '/'.
//   주소 뒤 #해시는 브라우저가 그대로 옮겨 준다(#iep 북마크는 /new가 새 자리로 바꾼다).
//   두 번째 겹은 화면 쪽(pages/index.js·pages/new.js)의 user.ui_mode 확인 + router.replace.
// ⚠ 쿠키 이름은 lib/uiMode.js(UI_COOKIE·DEMO_COOKIE)와 같아야 한다 — 엣지 번들을 가볍게 하려고 글자로 둔다.
export function middleware(req) {
  const { pathname } = req.nextUrl;
  const ui = req.cookies.get('kb_ui')?.value || '';
  const demo = req.cookies.get('kb_demo')?.value === '1';
  if (pathname === '/' && ui === 'new' && !demo) {
    const url = req.nextUrl.clone();
    url.pathname = '/new';
    return NextResponse.redirect(url);
  }
  if (pathname === '/new' && (ui === 'legacy' || demo)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// '/'와 '/new'에만 — /api/*·_next·정적 파일은 아예 거치지 않는다.
export const config = { matcher: ['/', '/new'] };
