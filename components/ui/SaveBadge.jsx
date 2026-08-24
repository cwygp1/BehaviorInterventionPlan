import { useEffect, useState } from 'react';
import { SAVE_STATUS_EVENT } from '../../lib/hooks/useAutoSave';

// 상단바 저장 상태 배지 (0824 퀵윈①) — useAutoSave가 쏘는 전역 이벤트를 표시.
// SEM식 "● 저장됨" 상시 표시로 '내 입력이 안전한가'에 대한 심리적 안정감을 준다.
const VIEW = {
  saved:   { dot: '#22a06b', label: '저장됨' },
  pending: { dot: '#e8a23d', label: '입력 중…' },
  saving:  { dot: '#e8a23d', label: '저장 중…' },
  error:   { dot: '#d94b3f', label: '저장 실패 — 저장 버튼으로 재시도' },
};

export default function SaveBadge() {
  const [state, setState] = useState('saved');

  useEffect(() => {
    const onStatus = (e) => {
      const s = e?.detail?.state;
      if (s && VIEW[s]) setState(s);
    };
    window.addEventListener(SAVE_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SAVE_STATUS_EVENT, onStatus);
  }, []);

  const v = VIEW[state];
  return (
    <span
      className="save-badge"
      title="자동 저장 상태 — 입력이 멎으면 잠시 후 자동 저장됩니다"
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, color: state === 'error' ? '#d94b3f' : 'var(--muted, #6b7280)',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
      {v.label}
    </span>
  );
}
