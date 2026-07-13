import { useAuth } from '../../contexts/AuthContext';

const NAV = [
  {
    group: '시작',
    items: [
      { id: 'home', label: '홈', icon: '🏠' },
      { id: 'students', label: '학생 관리', icon: '🧑‍🎓' },
    ],
  },
  {
    group: '학급 전체용 (Tier 1)',
    items: [
      { id: 'classpbs', label: '학급 차원 PBS', icon: '🏫' },
      { id: 'pbssurvey', label: 'PBS 기초 설문조사', icon: '📋' },
      { id: 'classcheck', label: '학급관리 체크리스트', icon: '✅' },
    ],
  },
  {
    group: '소그룹용 (Tier 2)',
    items: [{ id: 'tier2', label: 'CICO / DPR', icon: '👥' }],
  },
  {
    group: '한 학생 집중 지원 (Tier 3)',
    items: [
      { id: 'tier3', label: '개요 / 5단계 워크플로', icon: '🎯' },
      { id: 'observe', label: '학생 관찰 / ABC', icon: '🔍', requiresStudent: true, step: 1 },
      { id: 'qabf', label: '기능평가 (QABF)', icon: '📊', requiresStudent: true, step: 2 },
      { id: 'bip', label: '중재계획 (BIP)', icon: '📝', requiresStudent: true, step: 3 },
      { id: 'monitor', label: '행동 데이터', icon: '📈', requiresStudent: true, step: 4 },
      { id: 'eval', label: '결과 평가', icon: '✅', requiresStudent: true, step: 5 },
    ],
  },
  {
    group: '개별화교육 (IEP)',
    items: [
      { id: 'priorIep', label: '전년도 IEP', icon: '🗓', requiresStudent: true },
      { id: 'startpoint', label: '출발점 분석 (현행수준)', icon: '🧭', requiresStudent: true },
      { id: 'iep', label: 'IEP 목표 생성', icon: '📋', requiresStudent: true },
      { id: 'iepReport', label: 'IEP 계획서(완성·출력)', icon: '📄', requiresStudent: true },
    ],
  },
  {
    group: '위기 대처 · 자료실',
    items: [
      { id: 'crisis', label: '위기행동 대처', icon: '🚨' },
      { id: 'support', label: '교사 지원', icon: '📚' },
      { id: 'videos', label: 'PBS 영상 강의', icon: '🎬' },
    ],
  },
  {
    group: 'AI 도구',
    items: [
      { id: 'generator', label: 'AI 생성기', icon: '✨' },
      { id: 'builder', label: 'AI 어시스턴트', icon: '🤖' },
      { id: 'qa', label: 'PBS Q&A 전문가', icon: '💬' },
    ],
  },
];

export const PBS_PAGES = NAV.flatMap((g) => g.items).filter((i) => i.requiresStudent).map((i) => i.id);

export default function Sidebar({ activePage, onNavigate, open, onClose, hasStudent }) {
  const { user, logout } = useAuth();

  return (
    <>
      <div className={'overlay' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-icon"><img src="/icon.svg" alt="꼬박꼬박 로고" style={{ width: '100%', height: '100%', borderRadius: 'inherit', display: 'block' }} /></div>
            <div className="brand-text">
              <h2>꼬박꼬박</h2>
              <p>행동중재 통합 운영 시스템</p>
            </div>
          </div>
        </div>
        {NAV.map((section) => (
          <div className="nav-section" key={section.group}>
            <div className="nav-label">{section.group}</div>
            {section.items.map((item) => {
              const locked = item.requiresStudent && !hasStudent;
              return (
                <button
                  key={item.id}
                  className={'nav-item' + (activePage === item.id ? ' active' : '') + (locked ? ' locked' : '')}
                  onClick={() => onNavigate(item.id)}
                  title={locked ? '학생을 먼저 선택해야 열려요 (누르면 학생 선택 창이 열립니다)' : undefined}
                  aria-label={locked ? `${item.label} — 학생 선택 필요` : undefined}
                >
                  {item.step ? <span className="nav-step">{item.step}</span> : <span className="icon">{item.icon}</span>}
                  <span className="nav-text">{item.label}</span>
                  {locked && <span className="nav-lock" aria-hidden="true">🔒</span>}
                </button>
              );
            })}
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
