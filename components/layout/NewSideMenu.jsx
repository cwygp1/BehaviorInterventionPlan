import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MENUS, menuOf, parseHash, toNew } from '../../lib/routes';
import { useNextHint } from '../../lib/hooks/useNextHint';

// 새 디자인 메뉴 — PC(1024px 이상)는 왼쪽 남색 세로 메뉴 248px, 태블릿·폰은 글자 있는 아래 탭바 5칸(mds/52 §5-1).
//   맨 아래 '☰ 전체 메뉴(옛 메뉴)' = 기존 32화면 목록(#menu). 사용자 칸: 이름·학교·빌드 라벨(새 디자인 표시)·로그아웃.
//   관리자 입구는 도움 메뉴 맨 아래 묶음(#help)과 이름 칸(관리자만) 두 곳.

const BUILD_LABEL = (() => {
  const t = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
})();

export { BUILD_LABEL };

export default function NewSideMenu({ route, onNavigate }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const cur = menuOf(route);
  const [hint, setHint] = useNextHint();
  // 반짝임이 가리키는 옛 화면이 어느 메뉴에 있나(학생 화면은 '학생').
  const hintMenu = hint ? menuOf(parseHash(toNew(hint, { sid: 1 }) || '')) : '';
  useEffect(() => { if (hint && hintMenu === cur && route.kind !== 'today') setHint(''); }, [route.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  // 같은 단추를 세로 메뉴·아래 탭바 두 곳에 그린다 — 길잡이 앵커(data-tour)는 세로 메뉴에만(앵커 중복 방지).
  const renderItems = (withAnchor) => MENUS.map((m) => (
    <button
      key={m.key}
      type="button"
      className={'kb-nav' + (hintMenu === m.key && cur !== m.key ? ' kb-hinting' : '')}
      aria-current={cur === m.key ? 'page' : undefined}
      onClick={() => onNavigate(m.hash)}
      data-tour={withAnchor ? 'kb-menu-' + m.key : undefined}
    >
      <span className="kb-ico" aria-hidden="true">{m.icon}</span>
      <span>{m.label}</span>
    </button>
  ));

  return (
    <>
      <aside className="kb-side" aria-label="주 메뉴">
        <div className="kb-brand">
          <img src="/icon.png" alt="꼬박꼬박 로고" />
          <div>꼬박꼬박<small>행동중재 통합 운영 시스템</small></div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{renderItems(true)}</nav>
        <div className="kb-side-foot">
          <button type="button" className="kb-nav" aria-current={route.kind === 'menu' ? 'page' : undefined} onClick={() => onNavigate('#menu')} data-tour="kb-menu-all">
            <span className="kb-ico" aria-hidden="true">☰</span><span>전체 메뉴 (옛 메뉴)</span>
          </button>
          <div className="kb-user">
            <div className="kb-av" aria-hidden="true">{(user?.name || 'T').charAt(0)}</div>
            <div style={{ minWidth: 0 }}>
              {isAdmin ? (
                <button type="button" className="kb-side-link" style={{ padding: 0, minHeight: 0, color: '#fff', fontWeight: 700 }} onClick={() => onNavigate('admin')} title="관리자 페이지 — 가입자 관리">
                  {user?.name || '선생님'} 🛡️
                </button>
              ) : <b>{user?.name || '선생님'}</b>}
              <div>{user?.school || '로그인됨'}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>새 디자인{BUILD_LABEL ? ` · 빌드 ${BUILD_LABEL}` : ''}</div>
            </div>
            <button type="button" className="kb-btn kb-sq" style={{ background: 'transparent', color: '#fff', borderColor: 'var(--kb-navy-line)' }} onClick={() => logout()} title="로그아웃" aria-label="로그아웃">↪</button>
          </div>
        </div>
      </aside>
      <nav className="kb-bottombar" aria-label="주 메뉴">{renderItems(false)}</nav>
    </>
  );
}
