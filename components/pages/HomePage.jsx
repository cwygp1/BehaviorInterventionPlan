import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import { stuColor } from '../../lib/utils/colors';

export default function HomePage({ onNavigate }) {
  const { user } = useAuth();
  const { students, homeSummary, studentDataCache, selectStudent, curStuId } = useStudents();
  const { status: llmStatus } = useLLM();
  const { openAddStudent, openAISettings } = useUIActions();
  const today = new Date();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];

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
  ];
  // 학생을 추가하고 첫 관찰까지 마치면 온보딩 카드를 숨긴다(필수 단계 기준).
  const showOnboarding = !(hasStudent && hasObs);
  const nextStep = onboardSteps.find((s) => !s.done && s.cta);

  return (
    <>
      <div className="dash-hello">
        <h2>안녕하세요, {user?.name} 선생님 <span className="wave">👋</span></h2>
        <p>{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 ({wd}) · 오늘도 따뜻한 하루 보내세요.</p>
      </div>

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
                    onNavigate('observe');
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
        <div className="card-title">🧭 개별 중재 5단계 워크플로</div>
        <div className="card-subtitle">
          {curStuId
            ? '1번부터 순서대로 진행하세요. 각 단계 아래의 "다음 단계" 버튼으로도 이동할 수 있어요.'
            : '⚠ 먼저 학생을 선택하세요. 단계를 누르면 학생 선택 창이 자동으로 열립니다.'}
        </div>
        <div className="flow-strip">
          {[
            { id: 'observe', n: 1, icon: '🔍', t: '학생 관찰 / ABC', d: '행동 관찰 기록' },
            { id: 'qabf', n: 2, icon: '📊', t: '기능평가 (QABF)', d: '행동 기능 분석' },
            { id: 'bip', n: 3, icon: '📝', t: '중재계획 (BIP)', d: '중재 전략 수립' },
            { id: 'monitor', n: 4, icon: '📈', t: '행동 데이터', d: '일일 데이터 기록' },
            { id: 'eval', n: 5, icon: '✅', t: '결과 평가', d: '차트로 효과 확인' },
          ].map((s) => (
            <div className="flow-step" key={s.id} onClick={() => onNavigate(s.id)}>
              <div className="flow-num">{s.n}</div>
              <div className="flow-body">
                <div className="flow-t">{s.icon} {s.t}</div>
                <div className="flow-d">{s.d}</div>
              </div>
            </div>
          ))}
        </div>
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
