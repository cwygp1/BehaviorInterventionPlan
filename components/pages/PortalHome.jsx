import { useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import { useGuide } from '../guide/GuideContext';
import { SECTIONS, PAGE_META, pageLabel, pageTitle } from '../../lib/tiers';
import { computeNextStep } from '../../lib/nextStep';
import { reviewCounts } from '../../lib/dashReviews';
import { useDashboard } from './dash/DashBits';
import WeekStrip from '../ui/WeekStrip';

// 홈 = 런처 포털(시안 B). 큰 카드로 영역(Tier 1·2·3·IEP)을 고르면
// 그 영역의 현황판으로 들어가고, 사이드바에는 그 영역 메뉴만 남는다.
//
// 0914 단순화 P0(mds/30 §3-4):
//   · 배너 3종(🔦 다음 할 일 · 🚀 시작하기 · 🧪 샘플 체험 중)을 '오늘의 안내' 한 장으로 — 문구·버튼은 모두 유지.
// 0915 현장 요청: 순서를 IEP 카드 → Tier 1·2·3 카드 → '오늘의 안내'(맨 아래)로 바꿨다(화면 투어 순서도 같이).
//   · 안내 슬롯에 '지금 학생'의 다음 화면 칩(관찰·이유 찾기·중재 계획·행동 데이터).
//   · 🔦 다음 할 일 CTA는 학생이 선택돼 있으면 현황판 대신 그 화면으로 바로.
//   · 카드 CTA는 영역별 문구('학급 전체 현황판 →'), 배지는 '🔦 할 일 n건'(누르면 현황판의 할 일 목록으로).
//   · 사이드바와 100% 겹치는 빠른 메뉴는 768px 초과 화면에서 접힘(사이드바가 서랍인 좁은 화면에서는 펼침).
const QUICK_IDS = ['students', 'crisis', 'support', 'videos'];
// 0915 현장 요청(IEP 칸이 작아 잘 안 보임): IEP 카드 안에 작성 순서 ①~④를 바로 가기로 — 누르면 그 화면으로(학생 선택 가드는 그대로).
const IEP_STEPS = ['priorIep', 'startpoint', 'iep', 'iepReport'];
const AI_IDS = ['chatExpert', 'generator', 'builder'];
const STU_CHIPS = [['observe', '관찰 기록'], ['qabf', '이유 찾기'], ['bip', '중재 계획'], ['monitor', '행동 데이터']];
const HINT_SEEN_KEY = 'kb_portal_hint_seen';

export default function PortalHome({ onNavigate }) {
  const { user } = useAuth();
  const {
    students, studentsLoaded, tier2Groups, homeSummary, curClass, curSemester, curStu, curStuId,
    hasSamples, seedSamples, clearSamples, selectStudent,
  } = useStudents();
  const { status: llmStatus } = useLLM();
  const toast = useToast();
  const { openAddStudent, openAISettings, openManageClasses } = useUIActions();
  const { startTour } = useGuide();
  const [sampleBusy, setSampleBusy] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false); // 빠른 메뉴 'AI 도우미' 묶음
  const [quickOpen, setQuickOpen] = useState(false);   // 빠른 메뉴 접힘(넓은 화면 기본 접힘)
  const [bridgeOpen, setBridgeOpen] = useState(false); // IEP 연결 안내 상세(첫 방문에만 펼침)
  useEffect(() => {
    try { setQuickOpen(window.matchMedia('(max-width: 768px)').matches); } catch (_e) { setQuickOpen(true); }
    try { setBridgeOpen(localStorage.getItem(HINT_SEEN_KEY) !== '1'); } catch (_e) { /* noop */ }
  }, []);
  // 영역 카드에 '할 일' 배지 — 현황판 집계를 재사용(60초 캐시 공유라 추가 비용 미미).
  const { data: dashData } = useDashboard();
  const badges = dashData ? reviewCounts(dashData) : null;

  // 샘플 체험 시작 — 시드 후 첫 샘플 학생을 선택하고 Tier 3 현황판으로 이동해
  // '채워진 화면'(관찰→기능평가→BIP→데이터→평가)을 바로 보여준다.
  // 처음이면 그 화면 투어도 자동으로 시작(0824 온보딩 후속) — 본 적 있으면 건너뜀.
  async function onStartSample() {
    if (sampleBusy) return;
    setSampleBusy(true);
    try {
      const first = await seedSamples();
      toast('샘플 학생 2명과 4주치 기록을 만들었어요. 화면 곳곳을 눌러보세요!');
      if (first) {
        await selectStudent(first.id);
        onNavigate('dash3');
        setTimeout(() => {
          try { if (!localStorage.getItem('kb_tour_done:dash3')) startTour('dash3'); } catch (_e) { /* 사생활 모드 등 */ }
        }, 900); // 화면이 그려진 뒤 스포트라이트가 요소를 찾을 수 있게 잠시 대기
      }
    } catch (e) {
      toast('샘플 만들기 실패: ' + e.message);
    } finally {
      setSampleBusy(false);
    }
  }

  async function onClearSample() {
    if (sampleBusy) return;
    if (!window.confirm('샘플 학생 2명과 그 기록을 모두 삭제할까요?\n(선생님이 직접 등록한 학생은 그대로 남아요.)')) return;
    setSampleBusy(true);
    try {
      await clearSamples();
      toast('샘플을 정리했어요. 이제 내 학생으로 시작해보세요!');
    } catch (e) {
      toast('샘플 삭제 실패: ' + e.message);
    } finally {
      setSampleBusy(false);
    }
  }

  const today = new Date();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
  // Tier 1·2·3 + IEP는 항상 전부 보여준다(2026-08-14: '사용 단계 설정'으로 숨기는 기능 폐지).
  const sections = Object.values(SECTIONS);

  // 카드에 붙일 가벼운 라이브 요약(있는 데이터만 사용 — 추가 API 호출 없음)
  const totals = students.reduce((acc, s) => {
    const sm = homeSummary.summaries[s.id];
    if (sm) { acc.abc += sm.abc_count || 0; acc.mon += sm.mon_count || 0; }
    return acc;
  }, { abc: 0, mon: 0 });
  const hint = {
    t1: curClass ? `${curClass.name} · ${curSemester}학기` : '학급을 먼저 만들어주세요',
    t2: tier2Groups.length ? `점검 그룹 ${tier2Groups.length}개 운영 중` : '점검 그룹 만들기부터',
    t3: students.length ? `학생 ${students.length}명 · ABC ${totals.abc}건 · 데이터 ${totals.mon}건` : '학생 등록부터',
    iep: students.length ? `학생 ${students.length}명의 계획` : '학생 등록부터',
  };

  const aiOn = llmStatus === 'on';
  const noStudents = studentsLoaded && students.length === 0;

  // 🔦 다음 할 일 — 데이터 상태로 지금 가장 도움이 되는 한 가지를 고른다.
  // (학생 0명일 때는 같은 슬롯이 '시작하기' 내용을 담당하므로 겹치지 않는다)
  const next = students.length > 0
    ? computeNextStep({ curClass, studentCount: students.length, tier2GroupCount: tier2Groups.length, totals, aiOn })
    : null;
  // 학생이 선택돼 있으면 현황판을 거치지 않고 그 화면으로 직행(0914 P0).
  const nextDirect = !!(next && curStuId && next.studentPage);
  const nextCta = next ? (nextDirect ? next.studentCta : next.cta) : '';
  const onNextCta = () => {
    if (!next) return;
    if (nextDirect) onNavigate(next.studentPage);
    else if (next.page) onNavigate(next.page);
    else if (next.action === 'manageClasses') openManageClasses();
    else if (next.action === 'aiSettings') openAISettings();
  };

  // 카드 CTA — 현황판 이름은 PAGE_META 단일 출처('학급 전체 현황판 (Tier 1)' → '학급 전체 현황판 →').
  const ctaOf = (dash) => pageTitle(dash).replace(/\s*\([^)]*\)\s*$/, '') + ' →';
  // 배지 클릭 → 현황판으로 가서 '다음 할 일' 목록으로 스크롤(ReviewList가 플래그를 읽는다).
  const focusReviews = (dash) => {
    try { sessionStorage.setItem('kb_focus_reviews', '1'); } catch (_e) { /* noop */ }
    onNavigate(dash);
  };
  const todoBadge = (key, dash) => (badges && badges[key] > 0 ? (
    <span
      className="ph-todo"
      data-help="ph-todo-badge"
      role="button"
      tabIndex={0}
      title="이 영역의 할 일 목록으로 바로 이동"
      onClick={(e) => { e.stopPropagation(); focusReviews(dash); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); focusReviews(dash); } }}
    >🔦 할 일 {badges[key]}건</span>
  ) : null);

  return (
    <div className="portal">
      <div className="dash-hello">
        <h2>안녕하세요, {user?.name} 선생님 <span className="wave">👋</span></h2>
        <p>{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 ({wd}) · 카드를 누르면 그 영역만 열려요.{noStudents ? " 처음이라면 맨 아래 '오늘의 안내'에서 샘플로 체험부터 눌러보세요." : ' 오늘 할 일은 맨 아래 안내 한 장에 모아 두었어요.'}</p>
      </div>

      {/* 0915 현장 요청: IEP 카드를 맨 위로 — 특수교사가 가장 자주 여는 영역. Tier 1·2·3 카드는 그 아래. */}
      <div className="pgrid">
        {/* 0915 현장 요청: IEP 칸을 크게 — 큰 제목·설명, 오른쪽 현황판 단추, 아래 작성 순서 ①~④ 바로 가기.
            카드 안에 단추가 여럿이라 카드 전체를 버튼 하나로 두지 않고, 왼쪽 제목 영역과 오른쪽 단추가 각각 현황판을 연다. */}
        <div className="pcard iepwide" style={{ '--c': SECTIONS.iep.color, '--cs': SECTIONS.iep.soft }} data-tour="pcard-iep">
          <button type="button" className="iep-main" onClick={() => onNavigate(SECTIONS.iep.dash)} aria-label={`${SECTIONS.iep.title} — ${ctaOf(SECTIONS.iep.dash)}`}>
            <span className="ic" aria-hidden="true">{SECTIONS.iep.icon}</span>
            <span className="iep-text">
              <span className="bdg">IEP · Tier와 별개</span>
              <h4>{SECTIONS.iep.title}</h4>
              <p>{SECTIONS.iep.desc}</p>
            </span>
          </button>
          <div className="iep-side">
            <span className="ph-hint">{hint.iep}{todoBadge('iep', SECTIONS.iep.dash)}</span>
            <button type="button" className="iep-cta" onClick={() => onNavigate(SECTIONS.iep.dash)}>{ctaOf(SECTIONS.iep.dash)}</button>
          </div>
          <div className="iep-steps" role="group" aria-label="IEP 작성 순서" data-help="ph-iep-steps">
            <span className="iep-steps-k">작성 순서</span>
            {IEP_STEPS.map((id, i) => (
              <span key={id} className="iep-step-wrap">
                {i > 0 && <span className="iep-arrow" aria-hidden="true">→</span>}
                <button type="button" className="iep-step" onClick={() => onNavigate(id)} title={pageTitle(id)}>
                  {['①', '②', '③', '④'][i]} {pageLabel(id)}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="portal-bridge" data-help="ph-bridge">
          ⬆ 아래 학급·학생 지원(Tier 1·2·3) 기록이 위의 <b>개별화교육계획(IEP)</b>에 이어져요
          <button type="button" className="bridge-i" onClick={() => setBridgeOpen((o) => !o)} aria-expanded={bridgeOpen} title="자세히 보기">ⓘ</button>
          {bridgeOpen && <span className="bridge-more"> — Tier 3의 행동목표는 '개별화 목표로 가져가기'와 '교과 목표에 녹이기' 중에서 중재 계획(BIP) 화면에서 선택해요.</span>}
        </div>
        {sections.filter((s) => s.key !== 'iep').map((s) => (
          <button key={s.key} className="pcard" style={{ '--c': s.color, '--cs': s.soft }} onClick={() => onNavigate(s.dash)} data-tour={'pcard-' + s.key}>
            <span className="ic" aria-hidden="true">{s.icon}</span>
            <span className="bdg">{s.badge}</span>
            <h4>{s.title}</h4>
            <p>{s.desc}</p>
            <span className="ph-hint">{hint[s.key]}{todoBadge(s.key, s.dash)}</span>
            <span className="go">{ctaOf(s.dash)}</span>
          </button>
        ))}
      </div>

      {/* 0915(mds/33): 이번 주 기록 한 줄 — 영역 카드 아래, 오늘의 안내 위. 누르면 기록 달력으로. */}
      <WeekStrip onNavigate={onNavigate} />

      {/* 🔦 오늘의 안내 — 배너 3종을 한 장으로 (문구·버튼은 모두 유지). 0915 현장 요청으로 영역 카드 아래(맨 아래)로 이동 */}
      {studentsLoaded && (
        <div className="card next-step-banner" data-tour="next-step">
          <span className="pulse-dot" aria-hidden="true" />
          <div className="nsb-body">
            <div className="nsb-k">🔦 오늘의 안내</div>
            {noStudents ? (
              <>
                <div className="nsb-t">처음이라면 <b>샘플로 체험</b>을 눌러보세요</div>
                <div className="nsb-s">
                  학생 2명과 4주치 기록이 채워진 화면을 바로 볼 수 있어요. 내 학생은 이름 없이 학생 코드로 등록합니다.
                  {!aiOn && ' AI를 연결하면 초안 작성도 도와드려요.'}
                </div>
              </>
            ) : (
              <>
                {hasSamples && (
                  <div className="nsb-s nsb-sample">
                    🧪 <b>샘플 체험 중</b> — '샘플A(관심 기능)'와 '샘플B(회피 기능)'로 관찰 → 이유 찾기 → 중재 계획 → 데이터 → 평가 흐름을 둘러보세요. 끝나면 샘플을 삭제하고 내 학생으로 시작하면 돼요.
                  </div>
                )}
                {next ? (
                  <>
                    <div className="nsb-t">{next.text}</div>
                    {next.sub && <div className="nsb-s">{next.sub}</div>}
                  </>
                ) : (!hasSamples && (
                  <div className="nsb-t">
                    {curStu ? `${curStu.code} 학생의 다음 화면으로 바로 갈 수 있어요.` : '상단에서 학생을 고르면 그 학생의 다음 화면으로 바로 갈 수 있어요.'}
                  </div>
                ))}
                {curStu && (
                  <div className="nsb-chips" data-tour="stu-chips">
                    <span className="nsb-chips-k">지금 학생 <b>{curStu.code}</b> →</span>
                    {STU_CHIPS.map(([page, label]) => (
                      <button key={page} type="button" className="nsb-chip" onClick={() => onNavigate(page)} title={pageLabel(page)}>{label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="nsb-actions">
            {noStudents && (
              <>
                <button className="btn btn-pri" onClick={onStartSample} disabled={sampleBusy} data-help="ph-sample">{sampleBusy ? '만드는 중…' : '🧪 샘플로 체험'}</button>
                <button className="btn btn-ghost" onClick={openAddStudent} data-help="ph-add-student">＋ 내 학생 등록</button>
                {!aiOn && <button className="btn btn-ghost" onClick={openAISettings} data-help="ph-ai-connect">🤖 AI 연결</button>}
              </>
            )}
            {!noStudents && hasSamples && (
              <>
                <button className="btn btn-ghost" onClick={openAddStudent} data-help="ph-add-student">＋ 내 학생 등록</button>
                <button className="btn btn-ghost" onClick={onClearSample} disabled={sampleBusy} style={{ color: '#c0392b' }} data-help="ph-sample-clear">{sampleBusy ? '정리 중…' : '🗑 샘플 삭제'}</button>
              </>
            )}
            {!noStudents && next && <button className="btn btn-pri" onClick={onNextCta} data-help="ph-next-cta">{nextCta}</button>}
          </div>
        </div>
      )}

      {/* 자주 쓰는 메뉴 — 사이드바와 같은 목적지. 넓은 화면에서는 접고, 사이드바가 서랍인 좁은 화면에서는 펼침. */}
      <div className="pquick" data-tour="pquick">
        <button type="button" className="pquick-toggle" onClick={() => setQuickOpen((o) => !o)} aria-expanded={quickOpen}>
          ☰ 자주 쓰는 메뉴 {quickOpen ? '▴' : '▾'}
        </button>
        <div className="pquick-items" style={quickOpen ? undefined : { display: 'none' }}>
          {/* 샘플 체험 상시 진입점 — 학생이 이미 있어도 체험할 수 있게 둔다. 체험 중에는 안내 슬롯이 담당. */}
          {studentsLoaded && !hasSamples && (
            <button onClick={onStartSample} disabled={sampleBusy} data-help="ph-sample">
              {sampleBusy ? '⏳ 샘플 만드는 중…' : '🧪 샘플로 체험'}
            </button>
          )}
          {QUICK_IDS.map((id) => (
            <button key={id} onClick={() => onNavigate(id)}>{PAGE_META[id].icon} {pageLabel(id)}</button>
          ))}
          {/* AI 도우미 3종은 한 버튼으로 묶는다(0824 간결화② · 0914 이름 통일) */}
          <span style={{ position: 'relative', display: 'inline-block' }}>
            <button onClick={() => setAiMenuOpen((o) => !o)} aria-expanded={aiMenuOpen} aria-haspopup="menu" data-help="ph-ai-menu">
              ✨ AI 도우미 {aiMenuOpen ? '▴' : '▾'}
            </button>
            {aiMenuOpen && (
              <>
                <span style={{ position: 'fixed', inset: 0, zIndex: 89 }} onClick={() => setAiMenuOpen(false)} aria-hidden="true" />
                <span
                  role="menu"
                  style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 90,
                    display: 'flex', flexDirection: 'column', minWidth: 190,
                    background: '#fff', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, gap: 2,
                  }}
                >
                  {AI_IDS.map((page) => (
                    <button
                      key={page}
                      role="menuitem"
                      onClick={() => { setAiMenuOpen(false); onNavigate(page); }}
                      style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', font: 'inherit' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pri-soft, #eef2ff)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {PAGE_META[page].icon} {pageLabel(page)}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
