import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SECTIONS, PAGE_SECTION } from '../../lib/tiers';

// 시안 B(런처 포털) 사이드바 — 두 가지 모드:
//   · 포털 모드(홈·공통 페이지): 공통 메뉴만 간결하게. 영역 진입은 홈 카드로.
//   · 워크스페이스 모드(영역 페이지): 그 영역 색 헤더 + "전체 메뉴로" + 그 영역
//     메뉴 + 공통 미니 목록만. IEP는 Tier와 별개의 독립 영역(항상 접근 가능).
//
// 영역별 메뉴 정의(대시보드가 항상 첫 항목). requiresStudent/step은 기존과 동일.
const SECTION_ITEMS = {
  t1: [
    { id: 'dash1', label: '대시보드', icon: '📊' },
    { id: 'classpbs', label: '학급 차원 PBS', icon: '🏫' },
    { id: 'pbssurvey', label: 'PBS 기초 설문조사', icon: '📋' },
    { id: 'classcheck', label: '학급관리 체크리스트', icon: '✅' },
  ],
  t2: [
    { id: 'dash2', label: '대시보드', icon: '📊' },
    { id: 'tier2', label: 'CICO / DPR 운영', icon: '👥' },
  ],
  t3: [
    { id: 'dash3', label: '대시보드', icon: '📊' },
    { id: 'tier3', label: '개요 / 8단계 안내', icon: '🎯' },
    { id: 'observe', label: '표적행동 · ABC 관찰', icon: '🔍', requiresStudent: true, step: 1 },
    { id: 'qabf', label: '기능평가 (QABF)', icon: '📊', requiresStudent: true, step: 2 },
    { id: 'bip', label: '가설 · 중재계획 (BIP)', icon: '📝', requiresStudent: true, step: 3 },
    { id: 'monitor', label: '행동 데이터', icon: '📈', requiresStudent: true, step: 4 },
    { id: 'eval', label: '결과 평가', icon: '✅', requiresStudent: true, step: 5 },
  ],
  iep: [
    { id: 'dashIep', label: '대시보드', icon: '📊' },
    { id: 'priorIep', label: '전년도 IEP', icon: '🗓', requiresStudent: true },
    { id: 'startpoint', label: '출발점 분석 (현행수준)', icon: '🧭', requiresStudent: true },
    { id: 'iep', label: 'IEP 목표 생성', icon: '📋', requiresStudent: true },
    { id: 'iepReport', label: 'IEP 계획서(완성·출력)', icon: '📄', requiresStudent: true },
  ],
};

// 포털(홈) 모드 공통 메뉴
const COMMON_GROUPS = [
  { group: '시작', items: [
    { id: 'home', label: '홈 (영역 선택)', icon: '🏠' },
    { id: 'students', label: '학생 관리', icon: '🧑‍🎓' },
  ] },
  { group: '위기 대처 · 자료실', items: [
    { id: 'crisis', label: '위기행동 대처', icon: '🚨' },
    { id: 'support', label: '교사 지원', icon: '📚' },
    { id: 'videos', label: 'PBS 영상 강의', icon: '🎬' },
  ] },
  { group: 'AI 도구', items: [
    { id: 'generator', label: 'AI 생성기', icon: '✨' },
    { id: 'builder', label: 'AI 어시스턴트', icon: '🤖' },
    { id: 'qa', label: 'PBS Q&A 전문가', icon: '💬' },
  ] },
];

// 워크스페이스 모드에서 아래에 붙는 공통 미니 목록(자주 쓰는 것만).
const WORKSPACE_COMMON = [
  { id: 'students', label: '학생 관리', icon: '🧑‍🎓' },
  { id: 'crisis', label: '위기행동 대처', icon: '🚨' },
  { id: 'support', label: '교사 지원', icon: '📚' },
  { id: 'generator', label: 'AI 생성기', icon: '✨' },
  { id: 'builder', label: 'AI 어시스턴트', icon: '🤖' },
];

// 0824: 워크스페이스에서 위 공통 메뉴로 이동해도 사이드바가 포털 모드로 바뀌지 않도록,
// Layout이 "마지막 영역 유지" 판단에 쓰는 페이지 id 목록.
export const WORKSPACE_COMMON_IDS = WORKSPACE_COMMON.map((i) => i.id);

// 학생 선택이 필요한 페이지 목록(Layout의 학생 선택 가드가 사용).
export const PBS_PAGES = Object.values(SECTION_ITEMS).flat().filter((i) => i.requiresStudent).map((i) => i.id);

// 0819: 빌드(배포) 시각 라벨 — "수정이 반영된 버전인지" 확인용. 빌드 시점에 고정된다.
const BUILD_LABEL = (() => {
  const t = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
})();

function NavItem({ item, activePage, onNavigate, hasStudent, hint }) {
  const locked = item.requiresStudent && !hasStudent;
  return (
    <button
      className={'nav-item' + (activePage === item.id ? ' active' : '') + (locked ? ' locked' : '') + (hint ? ' next-hint' : '')}
      data-tour={'nav-' + item.id}
      onClick={() => onNavigate(item.id)}
      title={locked ? '학생을 먼저 선택해야 열려요 (누르면 학생 선택 창이 열립니다)' : undefined}
      aria-label={locked ? `${item.label} — 학생 선택 필요` : undefined}
    >
      {item.step ? <span className="nav-step">{item.step}</span> : <span className="icon">{item.icon}</span>}
      <span className="nav-text">{item.label}</span>
      {locked && <span className="nav-lock" aria-hidden="true">🔒</span>}
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate, open, onClose, hasStudent, sectionKey: sectionKeyProp }) {
  const { user, logout } = useAuth();
  // 0824: 어떤 영역 사이드바를 보일지는 Layout이 내려준다(공통 페이지에서도 직전
  // 영역을 유지하기 위해). prop이 없으면 종전처럼 페이지 소속으로 판단.
  const sectionKey = sectionKeyProp !== undefined ? sectionKeyProp : (PAGE_SECTION[activePage] || null);
  const section = sectionKey ? SECTIONS[sectionKey] : null;

  // 0819(2차 피드백): 저장 직후 다음 단계 메뉴가 몇 초간 반짝여 위치를 알려준다.
  // 페이지가 hintNextStep(pageId)로 쏘는 이벤트를 받아 해당 메뉴에 next-hint 클래스를 건다.
  const [hintId, setHintId] = useState('');
  useEffect(() => {
    let timer;
    const onHint = (e) => {
      const page = e?.detail?.page;
      if (!page) return;
      setHintId(page);
      clearTimeout(timer);
      timer = setTimeout(() => setHintId(''), 10000);
    };
    window.addEventListener('kkobak-next-hint', onHint);
    return () => { clearTimeout(timer); window.removeEventListener('kkobak-next-hint', onHint); };
  }, []);
  // 그 메뉴로 실제 이동하면 반짝임 종료.
  useEffect(() => { if (hintId && activePage === hintId) setHintId(''); }, [activePage, hintId]);

  return (
    <>
      <div className={'overlay' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        {section ? (
          /* ── 워크스페이스 모드: 이 영역 메뉴만 ── */
          <>
            <div className="ws-head" style={{ background: section.color }}>
              <span aria-hidden="true">{section.icon}</span> {section.label}
            </div>
            <button className="ws-back" onClick={() => onNavigate('home')}>⌂ 전체 메뉴로 (홈)</button>
            <div className="nav-section" data-tour="ws-menu">
              {SECTION_ITEMS[sectionKey].map((item) => (
                <NavItem key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} hasStudent={hasStudent} hint={hintId === item.id} />
              ))}
            </div>
            <div className="nav-section ws-common">
              <div className="nav-label">공통</div>
              {WORKSPACE_COMMON.map((item) => (
                <NavItem key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} hasStudent={hasStudent} hint={hintId === item.id} />
              ))}
            </div>
          </>
        ) : (
          /* ── 포털 모드: 공통 메뉴만 간결하게 ── */
          <>
            <div className="sidebar-top">
              <div className="brand">
                <div className="brand-icon"><img src="/icon.png" alt="꼬박꼬박 로고" style={{ width: '100%', height: '100%', borderRadius: 'inherit', display: 'block' }} /></div>
                <div className="brand-text">
                  <h2>꼬박꼬박</h2>
                  <p>행동중재 통합 운영 시스템</p>
                </div>
              </div>
            </div>
            {COMMON_GROUPS.map((g) => (
              <div className="nav-section" key={g.group}>
                <div className="nav-label">{g.group}</div>
                {g.items.map((item) => (
                  <NavItem key={item.id} item={item} activePage={activePage} onNavigate={onNavigate} hasStudent={hasStudent} hint={hintId === item.id} />
                ))}
              </div>
            ))}
            <div className="nav-section">
              <div className="nav-label">지원 영역</div>
              <div className="portal-hintbox">Tier 1·2·3와 IEP는 <b>홈 화면의 큰 카드</b>로 들어가요. 들어가면 그 영역 메뉴만 보여서 화면이 깔끔해요.</div>
            </div>
          </>
        )}
        <div className="sidebar-foot">
          <div className="user-avatar">{(user?.name || 'T').charAt(0)}</div>
          <div className="user-info">
            <div className="name">{user?.name || '선생님'}</div>
            <div className="role">{user?.school || '로그인됨'}</div>
            {BUILD_LABEL && (
              <div className="role" style={{ fontSize: 10, opacity: 0.65 }} title="이 화면이 언제 배포된 버전인지 — 수정 반영 여부를 확인할 때 보세요 (새로고침 후에도 같으면 아직 새 배포 전)">
                빌드 {BUILD_LABEL}
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={logout} title="로그아웃">↪</button>
        </div>
      </aside>
    </>
  );
}
