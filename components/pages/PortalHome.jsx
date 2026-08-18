import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import { ALL_TIERS, TIER_META, SECTIONS, parseUsedTiers, sectionEnabled } from '../../lib/tiers';
import { computeNextStep } from '../../lib/nextStep';

// 홈 = 런처 포털(시안 B). 큰 카드로 영역(Tier 1·2·3·IEP)을 고르면
// 그 영역의 대시보드로 들어가고, 사이드바에는 그 영역 메뉴만 남는다.
export default function PortalHome({ onNavigate }) {
  const { user, updateUsedTiers } = useAuth();
  const { students, tier2Groups, homeSummary, curClass, curSemester } = useStudents();
  const { status: llmStatus } = useLLM();
  const toast = useToast();
  const { openAddStudent, openAISettings, openTierSetup, openManageClasses } = useUIActions();
  const [restoring, setRestoring] = useState(false); // '다시 켜기' 저장 중

  const today = new Date();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
  const usedTiers = parseUsedTiers(user?.used_tiers);
  const sections = Object.values(SECTIONS).filter((s) => sectionEnabled(usedTiers, s.key));

  // 사용 단계 설정에서 해지해 숨겨진 Tier — 홈에서 바로 되살릴 수 있게 칩으로 보여준다.
  // (설정 모달까지 안 가도 "사라진 대시보드"를 한 번에 복원.)
  const hiddenTiers = usedTiers ? ALL_TIERS.filter((n) => !usedTiers.includes(n)) : [];

  async function restoreTier(n) {
    if (restoring) return;
    setRestoring(true);
    try {
      const next = [...usedTiers, n].sort((a, b) => a - b);
      await updateUsedTiers(next.join(','));
      toast(`${TIER_META[n].badge} · ${TIER_META[n].title} 영역을 다시 켰어요.`, 'success');
    } catch (e) {
      toast(e.message || '설정 저장에 실패했어요. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setRestoring(false);
    }
  }

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
    ? computeNextStep({ curClass, studentCount: students.length, tier2GroupCount: tier2Groups.length, totals, usedTiers, aiOn })
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

      {!usedTiers && (
        <div className="card tier-setup-banner">
          <div className="tsb-body">
            <div className="card-title" style={{ marginBottom: 4 }}>🧩 메뉴를 선생님께 맞게 정리해드려요</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              실제로 운영하는 단계(Tier 1·2·3)만 고르면 안 쓰는 카드·메뉴가 숨겨져요. IEP는 항상 표시됩니다.
            </div>
          </div>
          <button className="btn btn-pri" onClick={openTierSetup}>사용 단계 선택하기</button>
        </div>
      )}

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

      {students.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--pri-l)', background: 'linear-gradient(135deg,#fff 0%,var(--pri-soft) 100%)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>🚀 시작하기</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>학생을 추가하면 모든 영역이 살아나요. 이름 없이 학생 코드로 등록합니다.{!aiOn && ' AI를 연결하면 초안 작성도 도와드려요.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-pri" onClick={openAddStudent}>＋ 학생 추가</button>
            {!aiOn && <button className="btn btn-ghost" onClick={openAISettings}>🤖 AI 연결</button>}
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
            <span className="ph-hint">{hint[s.key]}</span>
            <span className="go">대시보드 열기 →</span>
          </button>
        ))}
        <div className="portal-bridge">⬇ 운영 중인 Tier의 기록이 <b>개별화교육계획(IEP)</b>에 반영돼요 — Tier 3 행동목표는 개별화/교과 중 선택</div>
        <button className="pcard iepwide" style={{ '--c': SECTIONS.iep.color, '--cs': SECTIONS.iep.soft }} onClick={() => onNavigate(SECTIONS.iep.dash)} data-tour="pcard-iep">
          <span className="ic" aria-hidden="true">{SECTIONS.iep.icon}</span>
          <span className="bdg">IEP · Tier와 별개</span>
          <h4>{SECTIONS.iep.title}</h4>
          <p>{SECTIONS.iep.desc}</p>
          <span className="ph-hint">{hint.iep}</span>
          <span className="go">대시보드 열기 →</span>
        </button>
      </div>

      {hiddenTiers.length > 0 && (
        <div className="tier-restore">
          <span className="tr-label">🙈 숨겨진 영역</span>
          {hiddenTiers.map((n) => {
            const m = TIER_META[n];
            return (
              <button
                key={n}
                className="tr-chip"
                style={{ '--tc': m.color }}
                onClick={() => restoreTier(n)}
                disabled={restoring}
                title={`${m.title} — 누르면 홈 카드와 메뉴에 다시 표시됩니다`}
              >
                {m.icon} {m.badge} 다시 켜기
              </button>
            );
          })}
          <span className="tr-hint">기록은 그대로예요 — 누르면 카드가 바로 돌아와요</span>
        </div>
      )}

      <div className="pquick" data-tour="pquick">
        <button onClick={() => onNavigate('students')}>🧑‍🎓 학생 관리</button>
        <button onClick={() => onNavigate('crisis')}>🚨 위기행동 대처</button>
        <button onClick={() => onNavigate('support')}>📚 교사 지원</button>
        <button onClick={() => onNavigate('videos')}>🎬 PBS 영상 강의</button>
        <button onClick={() => onNavigate('generator')}>✨ AI 생성기</button>
        <button onClick={() => onNavigate('builder')}>🤖 AI 어시스턴트</button>
        <button onClick={() => onNavigate('qa')}>💬 PBS Q&A</button>
        <button onClick={openTierSetup}>⚙ 사용 단계 설정</button>
      </div>
    </div>
  );
}
