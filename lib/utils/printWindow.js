// 인쇄용 새 창 열기 — 팝업이 막히면 아무 반응 없이 끝나던 문제(mds/44 S12-①)를 막는다.
// 막혔을 때는 무엇을 누르면 되는지 알려 준다. 크롬·엣지·웨일 모두 주소창 오른쪽에 팝업 차단 표시가 뜬다.
export const POPUP_BLOCKED_TEXT = '인쇄 창이 팝업 차단에 막혔어요.\n주소창 오른쪽의 팝업 차단 표시를 눌러 이 사이트의 팝업을 "항상 허용"으로 바꾼 뒤 다시 눌러 주세요.';

export function openPrintWindow(html, features = 'width=820,height=1000', delay = 250) {
  const w = window.open('', '', features);
  if (!w) {
    window.alert(POPUP_BLOCKED_TEXT);
    return null;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), delay);
  return w;
}
