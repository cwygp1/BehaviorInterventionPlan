import { useStudents } from '../../contexts/StudentContext';

// Tier 3 개별 중재 화면 이동 순서. 0822 워크플로 개편으로 정식 절차는 8단계(개요 보드 참조)이며,
// 이 내비는 실제 입력 "화면" 5곳(관찰·QABF·BIP·데이터·평가)을 순서대로 오가는 용도다.
export const TIER3_FLOW = [
  { id: 'observe', label: '학생 관찰 / ABC' },
  { id: 'qabf', label: '기능평가 (QABF)' },
  { id: 'bip', label: '중재계획 (BIP)' },
  { id: 'monitor', label: '행동 데이터' },
  { id: 'eval', label: '결과 평가' },
];

// IEP 작성 4단계 순서 (0819 피드백: IEP 영역에도 단계 이동 내비 적용).
// 전년도 IEP는 자료가 없을 수도 있어 '선택' 단계로 표기한다.
export const IEP_FLOW = [
  { id: 'priorIep', label: '전년도 IEP', optional: true },
  { id: 'startpoint', label: '출발점 분석 (현행수준)' },
  { id: 'iep', label: 'IEP 목표 생성' },
  { id: 'iepReport', label: 'IEP 계획서(완성·출력)' },
];

const FLOWS = {
  tier3: { steps: TIER3_FLOW, aria: '개별 중재 진행 화면' },
  iep: { steps: IEP_FLOW, aria: 'IEP 작성 4단계' },
};

/**
 * 단계 흐름(Tier3 개별 중재 / IEP 작성)에서 이전/다음 단계로 이동하는 하단 내비게이션.
 * 학생이 선택된 단계 페이지에서만 표시된다.
 */
// Tier 3 흐름의 각 단계에 실제 데이터가 있는지 판정한다 — 위치가 아니라
// 데이터 기준으로 ✓를 표시해, 스테퍼가 '진행 상황 안내판' 역할을 하게 한다(0824 온보딩).
function tier3DoneMap(d) {
  if (!d) return {};
  const bipFilled = d.bip && ['alt', 'fct', 'crit', 'prev', 'teach', 'reinf', 'resp'].some((k) => (d.bip[k] || '').trim());
  return {
    observe: (d.abc || []).length > 0,
    qabf: (d.qabf || []).some((v) => v >= 0),
    bip: !!bipFilled,
    monitor: (d.mon || []).length > 0,
    // 평가는 중재(B) 데이터가 있어야 기초선과 비교할 수 있다.
    eval: (d.mon || []).some((m) => m.phase === 'B'),
  };
}

export default function StepNav({ cur, onNavigate, flow = 'tier3' }) {
  const { curStuId, curStuData } = useStudents();
  if (!curStuId) return null;

  const { steps, aria } = FLOWS[flow] || FLOWS.tier3;
  const idx = steps.findIndex((s) => s.id === cur);
  if (idx === -1) return null;

  const prev = idx > 0 ? steps[idx - 1] : null;
  const next = idx < steps.length - 1 ? steps[idx + 1] : null;
  const labelOf = (s) => s.label + (s.optional ? ' (선택)' : '');

  // tier3 흐름은 데이터 기준 ✓, 그 외(IEP)는 종전대로 위치 기준.
  const doneMap = flow === 'tier3' ? tier3DoneMap(curStuData) : null;
  const isDone = (s, i) => (doneMap ? !!doneMap[s.id] : i < idx);

  return (
    <>
      {/* 전체 단계를 한눈에 — 어느 단계든 눌러서 바로 이동. ✓는 실제 기록이 있는 단계 */}
      <div className="stepnav-progress" role="navigation" aria-label={aria}>
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={'stepnav-pill' + (i === idx ? ' cur' : '') + (isDone(s, i) ? ' done' : '')}
            onClick={() => onNavigate(s.id)}
            title={`${i + 1}. ${labelOf(s)}` + (isDone(s, i) ? ' — 기록 있음' : '')}
            aria-current={i === idx ? 'step' : undefined}
          >
            <span className="pnum" aria-hidden="true">{isDone(s, i) ? '✓' : i + 1}</span>
            <span className="plabel">{labelOf(s)}</span>
          </button>
        ))}
      </div>
      <div className="stepnav">
        <div className="stepnav-side">
          {prev && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(prev.id)}>
              ← {prev.label}
            </button>
          )}
        </div>
        <div className="stepnav-mid">STEP {idx + 1} / {steps.length}</div>
        <div className="stepnav-side stepnav-side-right">
          {next ? (
            <button className="btn btn-pri btn-sm" onClick={() => onNavigate(next.id)}>
              다음: {next.label} →
            </button>
          ) : (
            <span className="stepnav-done">✅ 마지막 단계</span>
          )}
        </div>
      </div>
    </>
  );
}
