// 로그아웃 전 확인 — 체험 계정은 비밀번호가 난수라 나가면 되돌아올 수 없다(Sidebar.jsx 사용자 칸과 같은 문구, mds/48).
//   새 디자인의 왼쪽 메뉴 사용자 칸·도움 맨 아래 묶음·상단 사용자 단추가 같이 쓴다(3단계, mds/54 §2-3 N7).
export function confirmLogout(user) {
  if (user && user.is_demo && typeof window !== 'undefined'
    && !window.confirm('체험 계정은 로그아웃하면 다시 들어올 수 없어요(체험 기록도 지워져요).\n나갈까요?')) return false;
  return true;
}
