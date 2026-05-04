import { useAuth } from '../../contexts/AuthContext';

const NAV = [
  { group: '시작', items: [{ id: 'home', label: '홈', icon: '🏠' }] },
  {
    group: 'Tier 1 · 보편적 지원',
    items: [{ id: 'classpbs', label: '학급 차원 PBS', icon: '🏫' }],
  },
  {
    group: 'Tier 2 · 소그룹 지원',
    items: [{ id: 'tier2', label: 'CICO / DPR', icon: '👥', requiresStudent: true }],
  },
  {
    group: 'Tier 3 · 개별 맞춤형 중재',
    items: [
      { id: 'tier3', label: '개요 / 5단계 워크플로', icon: '🎯', requiresStudent: true },
      { id: 'observe', label: '학생 관찰 / ABC', icon: '🔍', requiresStudent: true },
      { id: 'qabf', label: '기능평가 (QABF)', icon: '📊', requiresStudent: true },
      { id: 'bip', label: '중재계획 (BIP)', icon: '📝', requiresStudent: true },
      { id: 'monitor', label: '행동 데이터', icon: '📈', requiresStudent: true },
      { id: 'eval', label: '결과 평가', icon: '✅', requiresStudent: true },
    ],
  },
  {
    group: 'AI 도구',
    items: [
      { id: 'builder', label: 'AI 어시스턴트', icon: '🤖' },
      { id: 'qa', label: 'PBS Q&A 전문가', icon: '💬' },
    ],
  },
  {
    group: '위기 / 지원',
    items: [
      { id: 'crisis', label: '위기행동 대처', icon: '🚨' },
      { id: 'support', label: '교사 지원', icon: '📚' },
      { id: 'videos', label: 'PBS 영상 강의', icon: '🎬' },
    ],
  },
];

export const PBS_PAGES = NAV.flatMap((g) => g.items).filter((i) => i.requiresStudent).map((i) => i.id);

export default function Sidebar({ activePage, onNavigate, open, onClose }) {
  const { user, logout } = useAuth();

  return (
    <>
      <div className={'overlay' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-icon">SE</div>
            <div className="brand-text">
              <h2>특수교육 AI</h2>
              <p>통합 플랫폼</p>
            </div>
          </div>
        </div>
        {NAV.map((section) => (
          <div className="nav-section" key={section.group}>
            <div className="nav-label">{section.group}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={'nav-item' + (activePage === item.id ? ' active' : '')}
                onClick={() => onNavigate(item.id)}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="user-avatar">{(user?.name || 'T').charAt(0)}</div>
          <div className="user-info">
            <div className="name">{user?.name || '선생님'}</div>
            <div className="role">{user?.school || '로그인됨'}</div>
          </div>
          <button className="logout-btn" onClick={logout} title="로그아웃">↪</button>
        </div>
      </aside>
    </>
  );
}
