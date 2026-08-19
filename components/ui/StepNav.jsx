import { useStudents } from '../../contexts/StudentContext';

// Tier 3 개별 중재 5단계 순서 (개요 페이지에 명시된 워크플로와 동일)
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
  tier3: { steps: TIER3_FLOW, aria: '개별 중재 5단계' },
  iep: { steps: IEP_FLOW, aria: 'IEP 작성 4단계' },
};

/**
 * 단계 흐름(Tier3 개별 중재 / IEP 작성)에서 이전/다음 단계로 이동하는 하단 내비게이션.
 * 학생이 선택된 단계 페이지에서만 표시된다.
 */
export default function StepNav({ cur, onNavigate, flow = 'tier3' }) {
  const { curStuId } = useStudents();
  if (!curStuId) return null;

  const { steps, aria } = FLOWS[flow] || FLOWS.tier3;
  const idx = steps.findIndex((s) => s.id === cur);
  if (idx === -1) return null;

  const prev = idx > 0 ? steps[idx - 1] : null;
  const next = idx < steps.length - 1 ? steps[idx + 1] : null;
  const labelOf = (s) => s.label + (s.optional ? ' (선택)' : '');

  return (
    <>
      {/* 전체 단계를 한눈에 — 어느 단계든 눌러서 바로 이동 */}
      <div className="stepnav-progress" role="navigation" aria-label={aria}>
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={'stepnav-pill' + (i === idx ? ' cur' : '') + (i < idx ? ' done' : '')}
            onClick={() => onNavigate(s.id)}
            title={`${i + 1}. ${labelOf(s)}`}
            aria-current={i === idx ? 'step' : undefined}
          >
            <span className="pnum" aria-hidden="true">{i < idx ? '✓' : i + 1}</span>
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
