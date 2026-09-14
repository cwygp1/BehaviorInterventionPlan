import { useEffect, useState } from 'react';
import { SAVE_STATUS_EVENT } from '../../lib/hooks/useAutoSave';

// 상단바 저장 상태 배지 (0824 퀵윈①) — useAutoSave가 쏘는 전역 이벤트를 표시.
// SEM식 "● 저장됨" 상시 표시로 '내 입력이 안전한가'에 대한 심리적 안정감을 준다.
//
// 0914 P0: 화면이 바뀌면 'manual'(수동 저장 화면)로 되돌린다. 자동 저장 훅이 있는 화면은
// 마운트 직후 'saved'를 쏘므로 곧 '● 저장됨'으로 바뀌고, 수동 [저장] 버튼만 있는 화면
// (IEP 목표·행동 데이터·결과 평가·계약서·전년도 IEP)에서는 이전 화면의 '저장됨'이
// 남아 오해를 주던 문제가 사라진다(빈 자리로 두지 않고 사실을 표시).
const VIEW = {
  manual:  { dot: '#c3c9d6', label: '수동 저장 화면', title: '이 화면은 [저장] 버튼을 눌러 저장합니다' },
  saved:   { dot: '#22a06b', label: '저장됨', title: '자동 저장 상태 — 입력이 멎으면 잠시 후 자동 저장됩니다' },
  pending: { dot: '#e8a23d', label: '입력 중…', title: '입력이 멎으면 잠시 후 자동 저장됩니다' },
  saving:  { dot: '#e8a23d', label: '저장 중…', title: '저장하는 중입니다' },
  error:   { dot: '#d94b3f', label: '저장 실패 — 저장 버튼으로 재시도', title: '자동 저장에 실패했어요. 화면의 저장 버튼으로 다시 시도하세요' },
};

export default function SaveBadge({ activePage }) {
  const [state, setState] = useState('manual');

  // 화면 전환 시 초기화 — 자동 저장 화면이면 곧 'saved' 이벤트가 덮어쓴다.
  useEffect(() => { setState('manual'); }, [activePage]);

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
      title={v.title}
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
