import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import { stuColor } from '../../lib/utils/colors';
import { ALL_TIERS, TIER_META, IEP_META, parseUsedTiers } from '../../lib/tiers';

export default function HomePage({ onNavigate }) {
  const { user } = useAuth();
  const { students, homeSummary, studentDataCache, selectStudent, curStuId } = useStudents();
  const { status: llmStatus } = useLLM();
  const { openAddStudent, openAISettings, openTierSetup } = useUIActions();
  const today = new Date();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];

  // 사용 단계 설정 — null이면 아직 미설정(전체 표시 + 설정 유도 배너).
  const usedTiers = parseUsedTiers(user?.used_tiers);
  const tiersToShow = usedTiers || ALL_TIERS;
  const tier3On = tiersToShow.includes(3);

  function getMetrics(s) {
    const dc = studentDataCache[s.id];
    if (dc) {
      const sortedMon = [...dc.mon].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return {
        abc_count: dc.abc.length, mon_count: dc.mon.length, sz_count: dc.sz.length,
        first_freq: sortedMon[0]?.freq, last_freq: sortedMon[sortedMon.length - 1]?.freq,
      };
    }
    const sm = homeSummary.summaries[s.id];
    if (sm) return sm;
    return { abc_count: 0, mon_count: 0, sz_count: 0 };
  }

  const totals = students.reduce((acc, s) => {
    const m = getMetrics(s);
    acc.abc += m.abc_count; acc.mon += m.mon_count; acc.sz += m.sz_count;
    return acc;
  }, { abc: 0, mon: 0, sz: 0 });

  const recent = homeSummary.recent || [];
  const colorByType = { ABC: 'var(--pri)', MON: 'var(--ok)', SZ: 'var(--warn)' };

  // ── 온보딩(처음 시작하기) 단계 ────────────────────────────────
  const hasStudent = students.length > 0;
  const aiOn = llmStatus === 'on';
  const hasObs = totals.abc > 0;
  const onboardSteps = [
    { key: 'stu', done: hasStudent, icon: '👤', t: '학생 추가하기', d: '이름 없이 학생 코드로 등록해요.', cta: '학생 추가', action: openAddStudent },
    { key: 'ai', done: aiOn, icon: '🤖', t: 'AI 어시스턴트 연결하기 (선택)', d: '연결하면 BIP·IEP 초안을 자동으로 만들어줘요.', cta: aiOn ? null : 'AI 연결', action: openAISettings },
    { key: 'obs', done: hasObs, icon: '🔍', t: '첫 ABC 관찰 기록하기', d: '학생을 고르고 첫 행동 관찰을 남겨보세요.', cta: '관찰 시작', action: () => onNavigate('observe') },
  ].filter((s) => s.key !== 'obs' || tier3On); // Tier 3을 안 쓰면 ABC 관찰 단계는 안내하지 않는다.
  // 학생을 추가하고 첫 관찰까지 마치면 온보딩 카드를 숨긴다(필수 단계 기준).
  const showOnboarding = !(hasStudent && (hasObs || !tier3On));
  const nextStep = onboardSteps.find((s) => !s.done && s.cta);

  // ── Tier 진입 허브 — 각 카드의 바로가기 목록 ──────────────────
  const tierEntries = {
    1: [
      { id: 'classpbs', icon: '🏫', label: '학급 차원 PBS' },
      { id: 'pbssurvey', icon: '📋', label: 'PBS 기초 설문조사' },
      { id: 'classcheck', icon: '✅', label: '학급관리 체크리스트' },
    ],
    2: [
      { id: 'tier2', icon: '👥', label: 'CICO / DPR 운영' },
    ],
    3: [
      { id: 'tier3', icon: '🎯', label: '개요 / 8단계 안내' },
      { id: 'observe', step: 1, label: '학생 관찰 / ABC' },
      { id: 'qabf', step: 2, label: '기능평가 (QABF)' },
      { id: 'bip', step: 3, label: '중재계획 (BIP)' },
      { id: 'monitor', step: 4, label: '행동 데이터' },
      { id: 'eval', step: 5, label: '결과 평가' },
    ],
  };
  const iepEntries = [
    { id: 'priorIep', icon: '🗓', label: '전년도 IEP' },
    { id: 'startpoint', icon: '🧭', label: '출발점 분석' },
    { id: 'iep', icon: '📋', label: 'IEP 목표 생성' },
    { id: 'iepReport', icon: '📄', label: '계획서 완성·출력' },
  ];

  return (
    <>
      <div className="dash-hello">
        <h2>안녕하세요, {user?.name} 선생님 <span className="wave">👋</span></h2>
        <p>{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 ({wd}) · 오늘도 따뜻한 하루 보내세요.</p>
      </div>

      {/* 사용 단계 미설정 — 메뉴 정리를 유도한다(선택 전에는 전체 표시). */}
      {!usedTiers && (
        <div className="card tier-setup-banner">
          <div className="tsb-body">
            <div className="card-title" style={{ marginBottom: 4 }}>🧩 메뉴를 선생님께 맞게 정리해드려요</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              학급 전체(Tier 1)·소그룹(Tier 2)·개별 학생(Tier 3) 중 실제로 운영하는 단계만 고르면,
              안 쓰는 메뉴는 숨겨져 화면이 깔끔해져요.
            </div>
          </div>
          <button className="btn btn-pri" onClick={openTierSetup}>사용 단계 선택하기</button>
        </div>
      )}

      {showOnboarding && (
        <div className="card" style={{ borderColor: 'var(--pri-l)', background: 'linear-gradient(135deg,#fff 0%,var(--pri-soft) 100%)' }}>
          <div className="card-title">🚀 시작하기 — 3단계면 준비 끝!</div>
          <div className="card-subtitle">아래 순서대로 진행하면 바로 사용할 수 있어요. (학급은 자동으로 만들어 두었습니다.)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {onboardSteps.map((s, i) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: '#fff', border: '1px solid var(--border)' }}>
                <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 800, color: '#fff', background: s.done ? 'var(--ok)' : 'var(--muted)' }}>
                  {s.done ? '✓' : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.6 : 1 }}>{s.icon} {s.t}</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{s.d}</div>
                </div>
                {!s.done && s.cta && (
                  <button className={'btn btn-sm ' + (nextStep && nextStep.key === s.key ? 'btn-pri' : 'btn-ghost')} onClick={s.action}>{s.cta}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tier 진입 허브: 사용 중인 단계만 카드로 표시 ────────────── */}
      <div className="tier-hub-head">
        <h3>🧭 어디서 시작할까요?</h3>
        <button className="btn btn-sm btn-ghost" onClick={openTierSetup} title="사용하는 지원 단계를 선택해 메뉴를 정리해요">
          ⚙ 사용 단계 설정
        </button>
      </div>
      <div className="tier-hub">
        {tiersToShow.map((n) => {
          const m = TIER_META[n];
          const entries = tierEntries[n];
          return (
            <div
              key={n}
              className={'tier-card' + (n === 3 ? ' span' : '')}
              style={{ '--tc': m.color, '--tc-soft': m.soft }}
            >
              <div className="tier-card-head">
                <span className="tier-badge" style={{ background: m.color }}>{m.badge}</span>
                <span className="tier-card-title">{m.icon} {m.title}</span>
                <span className="tier-card-short">{m.short}</span>
              </div>
              <div className="tier-card-desc">{m.desc}</div>
              <div className="tier-entries">
                {entries.map((e) => (
                  <button key={e.id} className="tier-entry" onClick={() => onNavigate(e.id)}>
                    {e.step ? <span className="te-step">{e.step}</span> : <span aria-hidden="true">{e.icon}</span>}
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Tier → IEP 연결 표시: IEP는 별도 영역이지만 Tier 1·2·3 운영 내용이 반영된다. */}
        <div className="tier-iep-bridge">
          <span className="tib-arrow" aria-hidden="true">⬇</span>
          운영 중인 Tier의 기록이 아래 개별화교육계획(IEP)에 반영돼요
        </div>

        {/* IEP — Tier와 별개의 독립 영역, 설정과 무관하게 항상 표시. */}
        <div className="tier-card span" style={{ '--tc': IEP_META.color, '--tc-soft': IEP_META.soft }}>
          <div className="tier-card-head">
            <span className="tier-badge" style={{ background: IEP_META.color }}>{IEP_META.badge}</span>
            <span className="tier-card-title">{IEP_META.icon} {IEP_META.title}</span>
            <span className="tier-card-short">{IEP_META.short}</span>
          </div>
          <div className="tier-card-desc">{IEP_META.desc}</div>
          {tier3On && (
            <div className="tier-card-hint">
              💡 Tier 3 중재계획(BIP)의 <b>행동목표</b>는 <b>개별화 목표로 가져가거나 교과 목표에 녹일 수</b> 있어요 — BIP 화면에서 선택합니다.
            </div>
          )}
          <div className="tier-entries">
            {iepEntries.map((e) => (
              <button key={e.id} className="tier-entry" onClick={() => onNavigate(e.id)}>
                <span aria-hidden="true">{e.icon}</span>
                {e.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-stats">
        <div className="stat-card"><div className="stat-icon pri">👥</div><div><div className="stat-val">{students.length}</div><div className="stat-label">등록 학생</div></div></div>
        <div className="stat-card"><div className="stat-icon ok">📝</div><div><div className="stat-val">{totals.abc}</div><div className="stat-label">ABC 관찰</div></div></div>
        <div className="stat-card"><div className="stat-icon warn">📈</div><div><div className="stat-val">{totals.mon}</div><div className="stat-label">행동 데이터</div></div></div>
        <div className="stat-card"><div className="stat-icon purple">💚</div><div><div className="stat-val">{totals.sz}</div><div className="stat-label">심리안정실</div></div></div>
      </div>

      <div className="card">
        <div className="card-title">👤 학생별 한눈 요약</div>
        {students.length === 0 ? (
          <div className="empty-state">
            <span className="emoji">👤</span>
            아직 등록된 학생이 없어요.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-pri" onClick={openAddStudent}>＋ 학생 추가하기</button>
            </div>
          </div>
        ) : (
          <div className="stu-grid">
            {students.map((s) => {
              const m = getMetrics(s);
              let trendTxt = '→';
              if (m.first_freq != null && m.last_freq != null) {
                const d = m.last_freq - m.first_freq;
                if (d < -1) trendTxt = '↓';
                else if (d > 1) trendTxt = '↑';
              }
              const c = stuColor(s.code);
              return (
                <div
                  key={s.id}
                  className="stu-mini"
                  onClick={async () => {
                    await selectStudent(s.id);
                    // Tier 3 미사용이면 관찰(Tier 3) 대신 학생 관리로 보낸다.
                    onNavigate(tier3On ? 'observe' : 'students');
                  }}
                >
                  <div className="stu-mini-head">
                    <div className="stu-avatar" style={{ background: `linear-gradient(135deg,${c},${c}cc)` }}>
                      {(s.code || '?').charAt(0)}
                    </div>
                    <div>
                      <div className="stu-mini-name">{s.code}</div>
                      <div className="stu-mini-meta">{s.level} · {s.disability}</div>
                    </div>
                  </div>
                  <div className="stu-mini-body">{s.note || '(요약 없음)'}</div>
                  <div className="stu-mini-foot">
                    <div className="stu-mini-stat"><span>행동 추이</span><span className="v">{m.last_freq != null ? m.last_freq : 0}회 {trendTxt}</span></div>
                    <div className="stu-mini-stat"><span>ABC</span><span className="v">{m.abc_count}건</span></div>
                    <div className="stu-mini-stat"><span>안정실</span><span className="v">{m.sz_count}회</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">⚡ 바로가기</div>
        <div className="quick-grid">
          <div className="quick-card" onClick={() => onNavigate('crisis')}>
            <div className="quick-icon">🚨</div>
            <div><div className="quick-title">위기 대처</div><div className="quick-desc">7단계 대응 & 그라운딩</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('builder')}>
            <div className="quick-icon">🤖</div>
            <div><div className="quick-title">AI 어시스턴트</div><div className="quick-desc">AI로 수업자료 생성</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('support')}>
            <div className="quick-icon">📚</div>
            <div><div className="quick-title">교사 지원</div><div className="quick-desc">EBP 27종 & 자료실</div></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🕒 최근 활동</div>
        {recent.length === 0 ? (
          <div className="empty-state"><span className="emoji">📭</span>최근 활동이 없습니다.</div>
        ) : (
          <ul className="recent-list">
            {recent.slice(0, 6).map((r, i) => (
              <li key={i} className="recent-item">
                <span className="recent-dot" style={{ background: colorByType[r.type] || 'var(--pri)' }} />
                <div className="recent-body">
                  <div className="t">{r.student_code} · {r.type === 'ABC' ? 'ABC 기록' : r.type === 'MON' ? '행동 데이터' : '심리안정실 이용'}</div>
                  <div className="d">{r.desc}</div>
                </div>
                <span className="recent-when">{r.date}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
