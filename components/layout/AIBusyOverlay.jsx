import { useLLM } from '../../contexts/LLMContext';

/**
 * 전역 AI 작업 표시기 (0720 피드백).
 * 어떤 화면에서든 LLM 호출이 진행 중이면 우하단에 스피너+작업 이름을 띄운다.
 * 버튼 라벨만 바뀌면 눈에 안 띄어 사용자가 다른 것을 눌러버리는 문제 방지.
 * 표시만 하고 클릭을 막지는 않는다(페이지 이동 가드는 pages/index.js에서 별도 동작).
 */
export default function AIBusyOverlay() {
  const { busy, busyLabels } = useLLM();
  if (!busy) return null;
  const label = busyLabels[busyLabels.length - 1] || 'AI 생성';
  const extra = busyLabels.length > 1 ? ` 외 ${busyLabels.length - 1}건` : '';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', right: 18, bottom: 18, zIndex: 1200,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#1f2937', color: '#fff', padding: '10px 18px',
        borderRadius: 99, boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        fontSize: '.86rem', fontWeight: 600, pointerEvents: 'none',
        maxWidth: 'min(92vw, 480px)',
      }}
    >
      <span style={{
        display: 'inline-block', width: 16, height: 16, flexShrink: 0,
        border: '3px solid rgba(255,255,255,.3)', borderTopColor: '#fff',
        borderRadius: '50%', animation: 'spin .8s linear infinite',
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        AI 작업 중 — {label}{extra} · 완료될 때까지 이 화면에 머물러 주세요
      </span>
    </div>
  );
}
