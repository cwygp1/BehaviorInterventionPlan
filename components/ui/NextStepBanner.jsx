import { useCallback, useEffect, useRef, useState } from 'react';

// 0819 피드백(구병모): "저장 → 다음 단계 탭으로 바로 갈 수 있으면" — 저장 성공 직후
// 다음 단계로 바로 이동하는 CTA 배너. 자동 이동은 하지 않는다(수정→재저장 흐름 보호).
// 내용을 다시 수정하면 배너를 숨겨 "수정본을 저장하기 전에 이동"하는 실수를 줄인다.
// nextLabel·onGo를 생략하면 확인 메시지만 표시 — 다음 단계 버튼이 저장 버튼 옆에
// 상시 배치된 페이지(버튼 한곳에 모으기)에서 이동 버튼 중복을 피할 때 쓴다.

/**
 * 저장 성공 여부 플래그 훅.
 * @param {Array} deps 저장 대상 필드 배열 — 저장 후 이 값들이 바뀌면(=다시 수정하면) 배너를 숨긴다.
 * @returns {[boolean, () => void]} [savedOk, markSaved] — 저장 성공 시 markSaved() 호출.
 */
export function useSavedFlag(deps) {
  const [saved, setSaved] = useState(false);
  const snapRef = useRef(null);
  const json = JSON.stringify(deps);
  useEffect(() => {
    if (!saved) return;
    // 저장 직후 첫 렌더의 값을 기준선으로 잡는다(저장하며 폼을 비우는 페이지 대응).
    if (snapRef.current === null) { snapRef.current = json; return; }
    if (snapRef.current !== json) setSaved(false);
  }, [saved, json]);
  const mark = useCallback(() => { snapRef.current = null; setSaved(true); }, []);
  return [saved, mark];
}

// 0819(2차 피드백 — 구병모): "다음 탭에 불 반짝이는 것도 좋을듯" — 저장 직후 사이드바의
// 다음 단계 메뉴를 몇 초간 반짝이게 하는 신호. Sidebar가 수신해 해당 메뉴에 애니메이션을 건다.
export function hintNextStep(pageId) {
  if (typeof window === 'undefined' || !pageId) return;
  try { window.dispatchEvent(new CustomEvent('kkobak-next-hint', { detail: { page: pageId } })); } catch (_e) { /* noop */ }
}

export default function NextStepBanner({ show, message, hint, nextLabel, onGo }) {
  if (!show) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        background: '#ecfdf3', border: '1px solid #a7e3c2', borderRadius: 10,
        padding: '10px 14px', marginTop: 12,
      }}
    >
      <div style={{ fontSize: '.9rem', color: '#166534', lineHeight: 1.5 }}>
        <strong>{message}</strong>
        {hint && <span style={{ color: '#3f6212' }}> — {hint}</span>}
      </div>
      {nextLabel && onGo && <button className="btn btn-pri" onClick={onGo}>{nextLabel} →</button>}
    </div>
  );
}
