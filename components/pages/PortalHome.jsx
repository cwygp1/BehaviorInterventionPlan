import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import { useGuide } from '../guide/GuideContext';
import { SECTIONS } from '../../lib/tiers';
import { computeNextStep } from '../../lib/nextStep';
import { reviewCounts } from '../../lib/dashReviews';
import { useDashboard } from './dash/DashBits';

// 홈 = 런처 포털(시안 B). 큰 카드로 영역(Tier 1·2·3·IEP)을 고르면
// 그 영역의 대시보드로 들어가고, 사이드바에는 그 영역 메뉴만 남는다.
export default function PortalHome({ onNavigate }) {
  const { user } = useAuth();
  const {
    students, studentsLoaded, tier2Groups, homeSummary, curClass, curSemester,
    hasSamples, seedSamples, clearSamples, selectStudent,
  } = useStudents();
  const { status: llmStatus } = useLLM();
  const toast = useToast();
  const { openAddStudent, openAISettings, openManageClasses } = useUIActions();
  const { startTour } = useGuide();
  const [sampleBusy, setSampleBusy] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false); // 빠른 메뉴 'AI 도구' 묶음
  // 영역 카드에 '검토 필요' 배지 — 대시보드 집계를 재사용(60초 캐시 공유라 추가 비용 미미).
  const { data: dashData } = useDashboard();
  const badges = dashData ? reviewCounts(dashData) : null;

  // 샘플 체험 시작 — 시드 후 첫 샘플 학생을 선택하고 Tier 3 대시보드로 이동해
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
    t2: tier2Groups.length ? `소그룹 ${tier2Groups.length}개 운영 중` : '소그룹 만들기부터',
    t3: students.length ? `학생 ${students.length}명 · ABC ${totals.abc}건 · 데이터 ${totals.mon}건` : '학생 등록부터',
    iep: students.length ? `학생 ${students.length}명의 계획` : '학생 등록부터',
  };

  const aiOn = llmStatus === 'on';

  // 🔦 다음 할 일 제안 — 데이터 상태로 지금 가장 도움이 되는 한 가지를 고른다.
  // (학생 0명일 때는 아래 '🚀 시작하기' 배너가 담당하므로 겹치지 않는다)
  const next = students.length > 0
    ? computeNextStep({ curClass, studentCount: students.length, tier2GroupCount: tier2Groups.length, totals, aiOn })
    : null;
  const onNextCta = () => {
    if (!next) return;
    if (next.page) onNavigate(next.page);
    else if (next.action === 'manageClasses') openManageClasses();
    else if (next.action === 'aiSettings') openAISettings();
  };

  return (
    <div className="portal">
      <div className="dash-hello">
        <h2>안녕하세요, {user?.name} 선생님 <span className="wave">👋</span></h2>
        <p>{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 ({wd}) · 오늘은 어떤 지원으로 시작할까요? 카드를 누르면 그 영역만 열려요.</p>
      </div>

      {next && (
        <div className="card next-step-banner" data-tour="next-step">
          <span className="pulse-dot" aria-hidden="true" />
          <div className="nsb-body">
            <div className="nsb-k">🔦 다음 할 일 제안</div>
            <div className="nsb-t">{next.text}</div>
            {next.sub && <div className="nsb-s">{next.sub}</div>}
          </div>
          <button className="btn btn-pri" onClick={onNextCta} style={{ flexShrink: 0 }}>{next.cta}</button>
        </div>
      )}

      {studentsLoaded && students.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--pri-l)', background: 'linear-gradient(135deg,#fff 0%,var(--pri-soft) 100%)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>🚀 시작하기</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              처음이라면 <b>샘플로 체험</b>을 눌러보세요 — 학생 2명과 4주치 기록이 채워진 화면을 바로 볼 수 있어요.
              내 학생은 이름 없이 학생 코드로 등록합니다.{!aiOn && ' AI를 연결하면 초안 작성도 도와드려요.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-pri" onClick={onStartSample} disabled={sampleBusy}>
              {sampleBusy ? '만드는 중…' : '🧪 샘플로 체험'}
            </button>
            <button className="btn btn-ghost" onClick={openAddStudent}>＋ 내 학생 등록</button>
            {!aiOn && <button className="btn btn-ghost" onClick={openAISettings}>🤖 AI 연결</button>}
          </div>
        </div>
      )}

      {hasSamples && (
        <div className="card" style={{ borderColor: '#f5c26b', background: 'linear-gradient(135deg,#fff 0%,#fdf6e9 100%)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>🧪 샘플 체험 중이에요</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              '샘플A(관심 기능)'와 '샘플B(회피 기능)'로 관찰→기능평가→BIP→데이터→평가 흐름을 둘러보세요.
              체험이 끝나면 샘플을 삭제하고 내 학생으로 시작하면 돼요.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-pri" onClick={openAddStudent}>＋ 내 학생 등록</button>
            <button className="btn btn-ghost" onClick={onClearSample} disabled={sampleBusy} style={{ color: '#c0392b' }}>
              {sampleBusy ? '정리 중…' : '🗑 샘플 삭제'}
            </button>
          </div>
        </div>
      )}

      <div className="pgrid">
        {sections.filter((s) => s.key !== 'iep').map((s) => (
          <button key={s.key} className="pcard" style={{ '--c': s.color, '--cs': s.soft }} onClick={() => onNavigate(s.dash)} data-tour={'pcard-' + s.key}>
            <span className="ic" aria-hidden="true">{s.icon}</span>
            <span className="bdg">{s.badge}</span>
            <h4>{s.title}</h4>
            <p>{s.desc}</p>
            <span className="ph-hint">
              {hint[s.key]}
              {badges && badges[s.key] > 0 && (
                <span style={{ marginLeft: 6, color: '#c0392b', fontWeight: 700 }} title="이 영역의 '검토가 필요한 항목' 수 — 대시보드에서 확인하세요">🔎 검토 {badges[s.key]}건</span>
              )}
            </span>
            <span className="go">대시보드 열기 →</span>
          </button>
        ))}
        <div className="portal-bridge">⬇ 운영 중인 Tier의 기록이 <b>개별화교육계획(IEP)</b>에 반영돼요 — Tier 3 행동목표는 개별화/교과 중 선택</div>
        <button className="pcard iepwide" style={{ '--c': SECTIONS.iep.color, '--cs': SECTIONS.iep.soft }} onClick={() => onNavigate(SECTIONS.iep.dash)} data-tour="pcard-iep">
          <span className="ic" aria-hidden="true">{SECTIONS.iep.icon}</span>
          <span className="bdg">IEP · Tier와 별개</span>
          <h4>{SECTIONS.iep.title}</h4>
          <p>{SECTIONS.iep.desc}</p>
          <span className="ph-hint">
            {hint.iep}
            {badges && badges.iep > 0 && (
              <span style={{ marginLeft: 6, color: '#c0392b', fontWeight: 700 }} title="이 영역의 '검토가 필요한 항목' 수 — 대시보드에서 확인하세요">🔎 검토 {badges.iep}건</span>
            )}
          </span>
          <span className="go">대시보드 열기 →</span>
        </button>
      </div>

      <div className="pquick" data-tour="pquick">
        {/* 샘플 체험 상시 진입점 — 학생이 이미 있어도 체험할 수 있게 빠른 메뉴에 둔다.
            체험 중에는 위 '샘플 체험 중' 배너가 담당하므로 숨긴다. */}
        {studentsLoaded && !hasSamples && (
          <button onClick={onStartSample} disabled={sampleBusy}>
            {sampleBusy ? '⏳ 샘플 만드는 중…' : '🧪 샘플로 체험'}
          </button>
        )}
        <button onClick={() => onNavigate('students')}>🧑‍🎓 학생 관리</button>
        <button onClick={() => onNavigate('crisis')}>🚨 위기행동 대처</button>
        <button onClick={() => onNavigate('support')}>📚 교사 지원</button>
        <button onClick={() => onNavigate('videos')}>🎬 PBS 영상 강의</button>
        {/* AI 도구 3종(생성기·어시스턴트·Q&A)은 한 버튼으로 묶는다(0824 간결화②) */}
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <button onClick={() => setAiMenuOpen((o) => !o)} aria-expanded={aiMenuOpen} aria-haspopup="menu">
            ✨ AI 도구 {aiMenuOpen ? '▴' : '▾'}
          </button>
          {aiMenuOpen && (
            <>
              <span style={{ position: 'fixed', inset: 0, zIndex: 89 }} onClick={() => setAiMenuOpen(false)} aria-hidden="true" />
              <span
                role="menu"
                style={{
                  position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 90,
                  display: 'flex', flexDirection: 'column', minWidth: 170,
                  background: '#fff', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, gap: 2,
                }}
              >
                {[['generator', '✨ AI 생성기'], ['builder', '🤖 AI 어시스턴트'], ['qa', '💬 PBS Q&A']].map(([page, label]) => (
                  <button
                    key={page}
                    role="menuitem"
                    onClick={() => { setAiMenuOpen(false); onNavigate(page); }}
                    style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', font: 'inherit' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--pri-soft, #eef2ff)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
