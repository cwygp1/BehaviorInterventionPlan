import { useEffect, useState } from 'react';
import { useLLM } from '../../contexts/LLMContext';

/**
 * 전역 AI 작업 표시기 (0720 피드백 + P1 진행 피드백).
 * 어떤 화면에서든 LLM 호출이 진행 중이면 우하단에 스피너+작업 이름을 띄운다.
 * P1(0824): 스트리밍 수신량·경과 시간을 함께 표시 — "실패인지 생성 중인지"를
 * 구분할 수 없던 문제 해결. 수신량이 늘고 있으면 모델이 살아서 생성 중이라는 증거다.
 * 표시만 하고 클릭을 막지는 않는다(페이지 이동 가드는 pages/index.js에서 별도 동작).
 */
function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${String(s % 60).padStart(2, '0')}초` : `${s}초`;
}

export default function AIBusyOverlay() {
  const { busy, busyLabels, aiProgress } = useLLM();
  // 경과 시간을 1초마다 갱신하기 위한 틱.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  if (!busy) return null;
  const label = busyLabels[busyLabels.length - 1] || 'AI 생성';
  const extra = busyLabels.length > 1 ? ` 외 ${busyLabels.length - 1}건` : '';
  const elapsed = aiProgress ? fmtElapsed(Date.now() - aiProgress.startedAt) : '';
  const chars = aiProgress?.chars || 0;               // 보이는 답변 글자 수
  const thinking = aiProgress?.reasoningChars || 0;   // 사고 과정(답변엔 안 나옴)
  const progressText = chars > 0
    ? `${elapsed} 경과 · 답변 ${chars.toLocaleString()}자 작성 중`
    : thinking > 0
      ? `${elapsed} 경과 · 모델이 생각을 정리하는 중…`
      : `${elapsed} 경과 · 모델 응답 대기 중`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', right: 18, bottom: 18, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#1f2937', color: '#fff', padding: '10px 18px',
        borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        fontSize: '.86rem', fontWeight: 600, pointerEvents: 'none',
        maxWidth: 'min(92vw, 480px)',
      }}
    >
      <span style={{
        display: 'inline-block', width: 16, height: 16, flexShrink: 0,
        border: '3px solid rgba(255,255,255,.3)', borderTopColor: '#fff',
        borderRadius: '50%', animation: 'spin .8s linear infinite',
      }} />
      <span style={{ overflow: 'hidden', minWidth: 0 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          AI 작업 중 — {label}{extra}
        </span>
        <span style={{ display: 'block', fontWeight: 400, fontSize: '.78rem', opacity: 0.85, whiteSpace: 'nowrap' }}>
          {progressText} · 완료까지 이 화면에 머물러 주세요
        </span>
      </span>
    </div>
  );
}
