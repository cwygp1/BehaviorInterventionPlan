import { Fragment, useEffect, useState } from 'react';
// 1001(mds/46 방법 1·7): 간단 모드 + '기록이 쌓이면 열리는 화면' 잠금 표시
import { useStudents } from '../../contexts/StudentContext';
import { isSimpleMode, SIMPLE_COMMON, SIMPLE_TIERS, FULL_TIERS, softLockFor } from '../../lib/onboarding';
import { useAuth } from '../../contexts/AuthContext';
import { SECTIONS, PAGE_SECTION, PAGE_META } from '../../lib/tiers';
import { FOLD_OPEN_EVENT } from '../ui/FoldCard';
import FontSizeToggle from '../ui/FontSizeToggle';

// 시안 B(런처 포털) 사이드바 — 두 가지 모드:
//   · 포털 모드(홈·공통 페이지): 공통 메뉴(COMMON_MENU)를 전부 펼쳐 보인다. 영역 진입은 홈 카드로.
//   · 워크스페이스 모드(영역 페이지): 그 영역 색 헤더 + 영역 메뉴 + 공통 메뉴(자주 쓰는 3개 + 더 보기).
//     IEP는 Tier와 별개의 독립 영역(항상 접근 가능).
//
// 0914 단순화 P0(mds/30 §3-2):
//   · 메뉴 이름·아이콘·단계 배지는 lib/tiers.js PAGE_META 단일 출처에서 파생
//     (Topbar 제목·StepNav·siteGuide·현황판 머리도 같은 출처를 쓴다 — 여기서 이름을 고치지 말 것).
//   · 공통 메뉴는 COMMON_MENU 한 목록 — 포털/워크스페이스가 같은 항목(영상 강의 포함).
//     워크스페이스에서는 '자주 쓰는 3개 + 더 보기'(펼침 상태를 기기별로 기억)로 접는다.
//   · IEP 항목에 ①~④ 단계 배지, Tier 3 번호(1~5) 위에 '입력 화면 순서 · 절차는 8단계' 표기.

const item = (id, extra) => ({ id, ...PAGE_META[id], ...(extra || {}) });

// 영역별 메뉴(대시보드가 항상 첫 항목) — SECTIONS.pages 순서 그대로.
const SECTION_ITEMS = Object.fromEntries(
  Object.values(SECTIONS).map((s) => [s.key, s.pages.map((id) => item(id))])
);

// 공통 메뉴 단일 정의. always: 워크스페이스에서 항상 보이는 항목(나머지는 '더 보기').
// 0915(mds/33): 기록 달력 추가 — 영역 화면에서도 바로 열 수 있게 always.
const COMMON_MENU = [
  { group: '우리 반·학생', items: ['home', 'students', 'calendar'], always: ['students', 'calendar'] },
  { group: '도움·자료', items: ['crisis', 'qaBoard', 'support', 'videos'], always: ['crisis', 'qaBoard'] },
  { group: 'AI 도우미', items: ['chatExpert', 'generator', 'builder'], always: [] },
];
const COMMON_IDS = COMMON_MENU.flatMap((g) => g.items);
const WS_ALWAYS = COMMON_MENU.flatMap((g) => g.always);
const WS_MORE = COMMON_IDS.filter((id) => id !== 'home' && !WS_ALWAYS.includes(id));

// 0824: 워크스페이스에서 이 공통 페이지로 이동해도 사이드바가 포털 모드로 바뀌지 않도록
// Layout이 "마지막 영역 유지" 판단에 쓰는 페이지 id 목록. (0914: 영상 강의도 포함 — 갔다 오면 메뉴가 바뀌던 문제 해소)
export const WORKSPACE_COMMON_IDS = COMMON_IDS.filter((id) => id !== 'home');

// 학생 선택이 필요한 페이지 목록(Layout의 학생 선택 가드가 사용).
export const PBS_PAGES = Object.keys(PAGE_META).filter((id) => PAGE_META[id].requiresStudent);

const HINT_SEEN_KEY = 'kb_portal_hint_seen';
const MORE_OPEN_KEY = 'kb_ws_more_open';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) { /* 사생활 모드 등 */ } };

// 0819: 빌드(배포) 시각 라벨 — "수정이 반영된 버전인지" 확인용. 빌드 시점에 고정된다.
const BUILD_LABEL = (() => {
  const t = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
})();

function NavItem({ item: it, activePage, onNavigate, hasStudent, hint, softLock }) {
  const locked = it.requiresStudent && !hasStudent;
  // 1001(mds/46 D5): 학생은 있지만 아직 기록이 없어 비어 보이는 화면 — 흐리게 + 🔒, 그래도 누르면 열린다.
  const soft = !locked && !!softLock && activePage !== it.id;
  return (
    <button
      className={'nav-item' + (activePage === it.id ? ' active' : '') + (locked || soft ? ' locked' : '') + (soft ? ' soft-lock' : '') + (hint ? ' next-hint' : '')}
      data-tour={'nav-' + it.id}
      onClick={() => onNavigate(it.id)}
      title={locked ? '학생을 먼저 선택해야 열려요 (누르면 학생 선택 창이 열립니다)' : soft ? softLock : (it.title && it.title !== it.label ? it.title : undefined)}
      aria-label={locked ? `${it.label} — 학생 선택 필요` : soft ? `${it.label} — ${softLock}` : undefined}
    >
      {it.step ? <span className="nav-step">{it.step}</span> : <span className="icon">{it.icon}</span>}
      <span className="nav-text">{it.label}</span>
      {(locked || soft) && <span className="nav-lock" aria-hidden="true">🔒</span>}
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate, open, onClose, hasStudent, sectionKey: sectionKeyProp }) {
  const { user, logout, updateUsedTiers } = useAuth();
  const isAdmin = user?.role === 'admin';
  // 1001(mds/46 방법 7·D3): 간단 모드 — 새 가입자 기본. 저장은 users.used_tiers='3'(예전 Tier 스코핑 칸 재사용).
  const simple = isSimpleMode(user);
  const [simpleBusy, setSimpleBusy] = useState(false);
  const [simpleMore, setSimpleMore] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('kb-simple', simple);
    return () => document.body.classList.remove('kb-simple');
  }, [simple]);
  const toggleSimple = async () => {
    if (simpleBusy) return;
    setSimpleBusy(true);
    try { await updateUsedTiers(simple ? FULL_TIERS : SIMPLE_TIERS); } catch (_e) { /* 실패하면 그대로 */ }
    setSimpleBusy(false);
  };
  const simpleToggle = (
    <button type="button" className={'nav-item nav-simple' + (simple ? ' on' : '')} onClick={toggleSimple} disabled={simpleBusy}
      data-demo="nav-simple"
      title={simple ? '간단 모드: 학급 전체(Tier 1)·표적 학생(Tier 2) 영역과 자료실·AI 도우미를 접어 두었어요. 누르면 모든 메뉴가 보여요.' : '꼭 필요한 메뉴(IEP·한 학생 집중·학생 관리)만 보이게 줄여요. 기능은 그대로예요.'}>
      <span className="icon" aria-hidden="true">{simple ? '🔎' : '🧹'}</span>
      <span className="nav-text">{simple ? '간단 모드 켜짐 · 모든 메뉴 보기' : '간단 모드로 보기'}</span>
    </button>
  );
  // 방법 1: '기록이 쌓이면 열리는 화면' 판단 재료 — 지금 학생의 기록·IEP 목표 수.
  const { curStuData, curStuId, homeSummary } = useStudents();
  const iepCount = curStuId && homeSummary?.summaries?.[curStuId] ? (homeSummary.summaries[curStuId].iep_count ?? null) : null;
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

  // 포털 안내상자: 영역에 한 번 들어가 본 뒤에는 ⓘ 한 줄로 접힌다(0914 P0).
  const [hintSeen, setHintSeen] = useState(true);
  const [hintOpen, setHintOpen] = useState(false);
  useEffect(() => { setHintSeen(lsGet(HINT_SEEN_KEY) === '1'); }, []);
  useEffect(() => {
    if (section && !hintSeen) { lsSet(HINT_SEEN_KEY, '1'); setHintSeen(true); }
  }, [section, hintSeen]);

  // 워크스페이스 공통 '더 보기' — 펼침 상태를 기기별로 기억. 현재 화면이 그 안에 있으면 자동 펼침.
  // 투어가 접힌 항목을 가리키면 FOLD_OPEN_EVENT('sb-more')로 펼침을 요청한다.
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setMoreOpen(lsGet(MORE_OPEN_KEY) === '1'); }, []);
  useEffect(() => {
    const onOpen = (e) => { if (e?.detail?.id === 'sb-more') setMoreOpen(true); };
    window.addEventListener(FOLD_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FOLD_OPEN_EVENT, onOpen);
  }, []);
  const moreForced = WS_MORE.includes(activePage);
  const showMore = moreOpen || moreForced;
  const toggleMore = () => setMoreOpen((o) => { lsSet(MORE_OPEN_KEY, o ? '0' : '1'); return !o; });

  const nav = (it) => (
    <NavItem key={it.id} item={it} activePage={activePage} onNavigate={onNavigate} hasStudent={hasStudent} hint={hintId === it.id}
      softLock={hasStudent ? softLockFor(it.id, { curStuData, iepCount }) : null} />
  );

  return (
    <>
      <div className={'overlay' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'sidebar' + (open ? ' open' : '')}>
        {section ? (
          /* ── 워크스페이스 모드: 이 영역 메뉴 + 공통(상시 3 + 더 보기) ── */
          <>
            <div className="ws-head" style={{ background: section.color }}>
              <span aria-hidden="true">{section.icon}</span> {section.label}
            </div>
            <button className="ws-back" onClick={() => onNavigate('home')}>⌂ 홈 (영역 고르기)</button>
            {simpleToggle}
            <div className="nav-section" data-tour="ws-menu">
              {SECTION_ITEMS[sectionKey].map((it) => (
                <Fragment key={it.id}>
                  {sectionKey === 't3' && it.step === 1 && (
                    <div className="nav-label nav-label-soft" title="정식 절차는 8단계(절차 안내 화면). 여기 1~5는 입력 화면의 순서입니다.">입력 화면 순서 · 절차는 8단계</div>
                  )}
                  {nav(it)}
                </Fragment>
              ))}
            </div>
            <div className="nav-section ws-common">
              <div className="nav-label">공통</div>
              {WS_ALWAYS.map((id) => nav(item(id)))}
              <button
                className={'nav-item nav-more' + (showMore ? ' open' : '')}
                onClick={toggleMore}
                aria-expanded={showMore}
                title={showMore ? '자료실·영상·AI 도우미 접기' : '교사 지원 자료실 · PBS 영상 강의실 · AI 도우미 3종'}
              >
                <span className="icon" aria-hidden="true">{showMore ? '▾' : '▸'}</span>
                <span className="nav-text">{showMore ? '접기' : '더 보기 — 자료실·영상·AI'}</span>
              </button>
              <div data-fold-id="sb-more" style={showMore ? undefined : { display: 'none' }}>
                {WS_MORE.map((id) => nav(item(id)))}
              </div>
            </div>
          </>
        ) : (
          /* ── 포털 모드: 공통 메뉴 전부 펼침 ── */
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
            {simpleToggle}
            {COMMON_MENU.map((g) => {
              // 간단 모드: 자주 쓰는 메뉴만 — 나머지는 아래 '메뉴 더 보기'로(기능 삭제 없음).
              const ids = simple ? g.items.filter((id) => SIMPLE_COMMON.includes(id)) : g.items;
              if (!ids.length) return null;
              return (
                <div className="nav-section" key={g.group}>
                  <div className="nav-label">{g.group}</div>
                  {ids.map((id) => nav(item(id)))}
                </div>
              );
            })}
            {simple && (
              <div className="nav-section">
                <button className={'nav-item nav-more' + (simpleMore ? ' open' : '')} onClick={() => setSimpleMore((o) => !o)} aria-expanded={simpleMore}>
                  <span className="icon" aria-hidden="true">{simpleMore ? '▾' : '▸'}</span>
                  <span className="nav-text">{simpleMore ? '접기' : '메뉴 더 보기 — 자료실·영상·AI'}</span>
                </button>
                {simpleMore && COMMON_IDS.filter((id) => !SIMPLE_COMMON.includes(id)).map((id) => nav(item(id)))}
              </div>
            )}
            <div className="nav-section">
              <div className="nav-label">지원 영역</div>
              {(!hintSeen || hintOpen) ? (
                <div className="portal-hintbox">
                  Tier 1·2·3와 IEP는 <b>홈 화면의 큰 카드</b>로 들어가요. 들어가면 그 영역 메뉴만 보여서 화면이 깔끔해요.
                  {hintSeen && <button type="button" className="hint-close" onClick={() => setHintOpen(false)}>접기</button>}
                </div>
              ) : (
                <button className="nav-item nav-more" onClick={() => setHintOpen(true)} title="영역에 들어가는 법 보기">
                  <span className="icon" aria-hidden="true">ⓘ</span>
                  <span className="nav-text">영역 들어가는 법</span>
                </button>
              )}
            </div>
          </>
        )}
        <FontSizeToggle />
        <div className="sidebar-foot">
          {/* 관리자에게만 이름 클릭 → 관리자 페이지(가입자 관리). 일반 사용자는 종전처럼 무반응.
              진입점 숨김은 UX일 뿐 — 실제 보호는 /api/admin/* 의 requireRole 서버 검사. */}
          <div
            className={'user-hit' + (isAdmin ? ' clickable' : '')}
            onClick={isAdmin ? () => onNavigate('admin') : undefined}
            onKeyDown={isAdmin ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('admin'); } } : undefined}
            role={isAdmin ? 'button' : undefined}
            tabIndex={isAdmin ? 0 : undefined}
            title={isAdmin ? '관리자 페이지 — 가입자 관리' : undefined}
            aria-label={isAdmin ? '관리자 페이지 열기' : undefined}
          >
            <div className="user-avatar">{(user?.name || 'T').charAt(0)}</div>
            <div className="user-info">
              <div className="name">
                {user?.name || '선생님'}
                {isAdmin && <span className="admin-badge" title="관리자 계정" aria-hidden="true">🛡️</span>}
              </div>
              <div className="role">{user?.school || '로그인됨'}</div>
              {BUILD_LABEL && (
                <div className="role" style={{ fontSize: 10, opacity: 0.65 }} title="이 화면이 언제 배포된 버전인지 — 수정 반영 여부를 확인할 때 보세요 (새로고침 후에도 같으면 아직 새 배포 전)">
                  빌드 {BUILD_LABEL}
                </div>
              )}
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title="로그아웃">↪</button>
        </div>
      </aside>
    </>
  );
}
