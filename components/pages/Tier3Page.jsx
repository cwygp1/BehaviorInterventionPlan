import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';

const STEPS = [
  {
    n: 1, page: 'observe', icon: '🔍', title: '학생 관찰 / ABC',
    desc: '선행사건(A) → 행동(B) → 결과(C)를 관찰 가능한 사실로 기록. 기능평가의 원천 데이터.',
    measure: (d) => (d?.abc?.length || 0),
    measureLabel: '건의 ABC 기록',
  },
  {
    n: 2, page: 'qabf', icon: '📊', title: '기능평가 (QABF)',
    desc: '25문항 4점 척도로 문제행동의 기능을 정량화 (관심·회피·획득·감각·비사회적).',
    measure: (d) => (d?.qabf || []).filter((v) => v >= 0).length,
    measureLabel: '/25 문항 응답',
  },
  {
    n: 3, page: 'bip', icon: '📝', title: '중재계획 (BIP)',
    desc: '예방·교수·강화·반응 4영역 + FCT 기능적 의사소통 + DRA 차별강화로 대체 행동 형성.',
    measure: (d) => (d?.bip?.alt ? 1 : 0),
    measureLabel: (v) => v ? '대체 행동 작성됨' : '미작성',
  },
  {
    n: 4, page: 'monitor', icon: '📈', title: '행동 데이터',
    desc: 'CICO·DBR·지연시간·강도. Phase A(기초선) vs Phase B(중재) 명시 전환으로 효과 측정.',
    measure: (d) => (d?.mon?.length || 0),
    measureLabel: '건의 모니터 기록',
  },
  {
    n: 5, page: 'eval', icon: '✅', title: '결과 평가',
    desc: '단일대상연구 시각 분석 (Level/Trend/Variability/Immediacy) + PND·Tau-U 효과크기.',
    measure: (d) => (d?.fid?.length || 0),
    measureLabel: '건의 충실도 기록',
  },
];

export default function Tier3Page({ onNavigate }) {
  const { curStu, curStuData } = useStudents();

  if (!curStu) return <NoStudentHint />;

  return (
    <>
      <StuHero />

      {/* Hero — Tier 3 개요 */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #ef476f 0%, #c43653 100%)',
        color: '#fff', border: 'none', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, fontSize: '8rem', opacity: 0.1 }}>🎯</div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '.78rem', opacity: 0.9, letterSpacing: 3, marginBottom: 4 }}>3-TIER MODEL · TIER 3</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 10 }}>🎯 개별 맞춤형 중재</h2>
          <p style={{ fontSize: '.92rem', lineHeight: 1.7, opacity: 0.95 }}>
            전체 학생의 <strong>1~5%</strong>가 대상인 가장 집중적 지원 단계입니다.
            ABC 관찰 → QABF 기능평가 → BIP 중재계획 → 행동 데이터 → 결과 평가의 5단계를 거쳐
            학생 개별화 행동지원을 진행합니다.
          </p>
        </div>
      </div>

      {/* 5단계 워크플로 */}
      <div className="card">
        <div className="card-title">📋 5단계 개별 중재 워크플로</div>
        <div className="card-subtitle">현재 학생 <strong>{curStu.code}</strong>의 진행 상황입니다. 카드를 클릭하면 해당 단계로 이동합니다.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {STEPS.map((s, i) => {
            const v = s.measure(curStuData);
            const label = typeof s.measureLabel === 'function' ? s.measureLabel(v) : `${v}${s.measureLabel}`;
            const done = v > 0;
            return (
              <div key={s.n}
                onClick={() => onNavigate?.(s.page)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  background: done ? '#f0fbf4' : 'var(--surface2)',
                  border: '1px solid ' + (done ? '#9be0b9' : 'var(--border)'),
                  borderRadius: 10, cursor: 'pointer', transition: '.15s', position: 'relative',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: done ? '#0a7d4e' : '#9ca3af', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem', fontWeight: 800, flexShrink: 0,
                }}>{s.n}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.02rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{s.icon}</span><span>{s.title}</span>
                    {done && <span style={{ fontSize: '.72rem', background: '#0a7d4e', color: '#fff', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>✓ {label}</span>}
                    {!done && <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>— 시작 전</span>}
                  </div>
                  <div style={{ fontSize: '.84rem', color: 'var(--sub)', marginTop: 4, lineHeight: 1.55 }}>{s.desc}</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '1.4rem', flexShrink: 0 }}>›</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 핵심 개념 — FCT / DRA / DRO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div className="card">
          <div className="card-title">💬 FCT — 기능적 의사소통 훈련</div>
          <p style={{ fontSize: '.88rem', lineHeight: 1.7, color: 'var(--sub)', marginTop: 6 }}>
            <strong>Functional Communication Training</strong>. 학생이 문제행동으로 표현하던 의도를
            적절한 의사소통 수단(말·카드·AAC)으로 대체하도록 가르치는 기법입니다.
          </p>
          <div style={{ background: 'var(--pri-soft)', padding: 12, borderRadius: 8, marginTop: 10, fontSize: '.82rem', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--pri)' }}>예시</strong><br />
            <span style={{ color: 'var(--err)' }}>❌ 문제행동:</span> 휴식 원할 때 책상을 밀친다<br />
            <span style={{ color: 'var(--ok)' }}>✅ 대체 행동:</span> "쉬고 싶어요" 카드를 든다
          </div>
        </div>

        <div className="card">
          <div className="card-title">⭐ DRA / DRO — 차별 강화</div>
          <p style={{ fontSize: '.88rem', lineHeight: 1.7, color: 'var(--sub)', marginTop: 6 }}>
            <strong>DRA(Differential Reinforcement of Alternative)</strong>: 대체 행동을 할 때만 강화 제공.<br />
            <strong>DRO(Differential Reinforcement of Other)</strong>: 정해진 시간 동안 문제행동이 없으면 강화.
          </p>
          <div style={{ background: 'var(--ok-l)', padding: 12, borderRadius: 8, marginTop: 10, fontSize: '.82rem', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--ok)' }}>4:1 황금률</strong> — 문제행동 1회 재지도에 대해, 바람직한 행동 4번 이상 인식·강화. PBS의 핵심 비율 원칙.
          </div>
        </div>

        <div className="card">
          <div className="card-title">📋 BIP의 4영역 (예방-교수-강화-반응)</div>
          <ul style={{ listStyle: 'none', padding: 0, fontSize: '.85rem', lineHeight: 1.9, color: 'var(--sub)' }}>
            <li>🛡 <strong>예방 (Antecedent)</strong> — 문제행동의 원인 자극을 미리 제거·조정</li>
            <li>📖 <strong>교수 (Teaching)</strong> — 대체 행동을 직접 가르침 (FCT, 모델링)</li>
            <li>⭐ <strong>강화 (Reinforcement)</strong> — 대체 행동에 즉각 보상 (DRA/DRO)</li>
            <li>🚨 <strong>반응 (Response)</strong> — 문제행동 발생 시 안전 절차</li>
          </ul>
        </div>
      </div>

      {/* 빠른 작업 */}
      <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)' }}>
        <div className="card-title">⚡ 빠른 시작</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
          <button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('observe')}>🔍 ABC 기록 시작</button>
          <button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('qabf')}>📊 QABF 평가 시작</button>
          <button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('bip')}>📝 BIP 작성 (AI 자동 생성)</button>
          <button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('monitor')}>📈 행동 데이터 입력</button>
          <button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('eval')}>✅ 결과 차트 보기</button>
        </div>
      </div>
    </>
  );
}
