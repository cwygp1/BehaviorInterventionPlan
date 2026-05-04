import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { stuColor } from '../../lib/utils/colors';

export default function HomePage({ onNavigate }) {
  const { user } = useAuth();
  const { students, homeSummary, studentDataCache, selectStudent } = useStudents();
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

  return (
    <>
      <div className="dash-hello">
        <h2>안녕하세요, {user?.name} 선생님 <span className="wave">👋</span></h2>
        <p>{today.getFullYear()}년 {today.getMonth() + 1}월 {today.getDate()}일 ({wd}) · 오늘도 따뜻한 하루 보내세요.</p>
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
          <div className="empty-state"><span className="emoji">👤</span>아직 등록된 학생이 없어요. 우측 상단 + 버튼으로 학생을 추가해 주세요.</div>
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
        <div className="card-title">⚡ 빠른 작업</div>
        <div className="quick-grid">
          <div className="quick-card" onClick={() => onNavigate('observe')}>
            <div className="quick-icon">🔍</div>
            <div><div className="quick-title">ABC 기록</div><div className="quick-desc">오늘의 관찰 남기기</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('monitor')}>
            <div className="quick-icon">📈</div>
            <div><div className="quick-title">일일 데이터</div><div className="quick-desc">행동 빈도/강도 입력</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('crisis')}>
            <div className="quick-icon">🚨</div>
            <div><div className="quick-title">위기 대처</div><div className="quick-desc">7단계 대응 & 그라운딩</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('builder')}>
            <div className="quick-icon">🤖</div>
            <div><div className="quick-title">AI 어시스턴트</div><div className="quick-desc">AI로 수업자료 생성</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('eval')}>
            <div className="quick-icon">📊</div>
            <div><div className="quick-title">결과 평가</div><div className="quick-desc">차트로 한눈에 보기</div></div>
          </div>
          <div className="quick-card" onClick={() => onNavigate('support')}>
            <div className="quick-icon">📚</div>
            <div><div className="quick-title">교사 지원</div><div className="quick-desc">EBP 11종 & 자료실</div></div>
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
