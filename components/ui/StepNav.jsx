import { useStudents } from '../../contexts/StudentContext';

// Tier 3 개별 중재 5단계 순서 (개요 페이지에 명시된 워크플로와 동일)
export const TIER3_FLOW = [
  { id: 'observe', label: '학생 관찰 / ABC' },
  { id: 'qabf', label: '기능평가 (QABF)' },
  { id: 'bip', label: '중재계획 (BIP)' },
  { id: 'monitor', label: '행동 데이터' },
  { id: 'eval', label: '결과 평가' },
];

/**
 * 5단계 개별 중재 흐름에서 이전/다음 단계로 이동하는 하단 내비게이션.
 * 학생이 선택된 단계 페이지에서만 표시된다.
 */
export default function StepNav({ cur, onNavigate }) {
  const { curStuId } = useStudents();
  if (!curStuId) return null;

  const idx = TIER3_FLOW.findIndex((s) => s.id === cur);
  if (idx === -1) return null;

  const prev = idx > 0 ? TIER3_FLOW[idx - 1] : null;
  const next = idx < TIER3_FLOW.length - 1 ? TIER3_FLOW[idx + 1] : null;

  return (
    <div className="stepnav">
      <div className="stepnav-side">
        {prev && (
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(prev.id)}>
            ← {prev.label}
          </button>
        )}
      </div>
      <div className="stepnav-mid">STEP {idx + 1} / {TIER3_FLOW.length}</div>
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
  );
}
