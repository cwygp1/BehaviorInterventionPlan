import { useEffect, useRef } from 'react';

// ── 자동 저장 훅 + 전역 저장 상태 (0824 퀵윈①) ─────────────────────────────
// 학생당 1행 upsert 구조의 페이지(QABF·BIP 등)에서 입력이 멎으면 자동 저장한다.
// 저장 상태는 window 이벤트로 알리고 Topbar의 SaveBadge가 표시한다
// (사이드바 next-hint와 같은 이벤트 패턴 — 컨텍스트 배선 없이 어디서든 동작).
//
// state: 'saved'(저장됨) | 'pending'(입력 중, 저장 대기) | 'saving' | 'error'

export const SAVE_STATUS_EVENT = 'kkobak-save-status';

export function reportSaveStatus(state) {
  try {
    window.dispatchEvent(new CustomEvent(SAVE_STATUS_EVENT, { detail: { state } }));
  } catch (_e) { /* SSR/구형 브라우저 — 무시 */ }
}

/**
 * @param {object} p
 * @param {boolean} p.enabled 자동 저장 사용 여부(학생 선택 + 데이터 로드 완료 후에만 true)
 * @param {boolean} p.dirty   현재 입력이 서버 저장값과 다른가
 * @param {string}  p.signal  입력 내용의 직렬화 문자열 — 바뀔 때마다 저장 타이머를 리셋(디바운스)
 * @param {Function} p.save   실제 저장 함수. 실패 시 throw 해야 'error' 상태가 표시된다.
 * @param {number}  [p.delay] 입력이 멎은 뒤 저장까지 대기(ms)
 */
// 폼 전체(body)를 기준값과 비교하는 간편 래퍼 — useFormLoad 패턴의 페이지용.
// enabled(=loaded)가 켜지는 순간의 body를 기준값으로 잡고, 이후 달라지면 자동 저장.
// 저장 성공 시 기준값을 갱신한다. 학급/학생 전환으로 enabled가 꺼졌다 켜지면 재무장.
export function useAutoSaveBody({ enabled, body, save, delay = 2000, resetKey }) {
  const json = JSON.stringify(body);
  const baseRef = useRef(null);
  const jsonRef = useRef(json);
  jsonRef.current = json;

  // 기준값 무장/재무장 — enabled가 켜질 때, 그리고 resetKey(날짜·레코드 전환 등)가
  // 바뀔 때. 이 effect가 도는 시점엔 로더의 setState가 이미 반영된 뒤라
  // jsonRef.current가 '방금 불러온 값'이다.
  useEffect(() => {
    baseRef.current = enabled ? jsonRef.current : null;
  }, [enabled, resetKey]);

  const dirty = enabled && baseRef.current != null && json !== baseRef.current;

  const saveOuterRef = useRef(save);
  saveOuterRef.current = save;

  useAutoSave({
    enabled,
    dirty,
    signal: json,
    delay,
    save: async () => {
      const snapshot = jsonRef.current;
      await saveOuterRef.current();
      baseRef.current = snapshot;
    },
  });

  // dirty를 돌려줘 페이지가 수동 [저장] 버튼을 '저장할 게 있을 때만' 활성화할 수 있게 한다.
  return { dirty };
}

export default function useAutoSave({ enabled, dirty, signal, save, delay = 1500 }) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // 입력이 멎으면 delay 후 저장. signal이 바뀔 때마다 타이머 리셋(디바운스).
  useEffect(() => {
    if (!enabled) return undefined;
    if (!dirty) { reportSaveStatus('saved'); return undefined; }
    reportSaveStatus('pending');
    const t = setTimeout(async () => {
      reportSaveStatus('saving');
      try {
        await saveRef.current();
        reportSaveStatus('saved');
      } catch (_e) {
        reportSaveStatus('error'); // 수동 [저장] 버튼이 남아 있어 재시도 가능
      }
    }, delay);
    return () => clearTimeout(t);
  }, [enabled, dirty, signal, delay]);

  // 페이지를 떠날 때(언마운트) 미저장분을 즉시 저장 — 디바운스 대기 중 유실 방지.
  useEffect(() => () => {
    if (enabledRef.current && dirtyRef.current) {
      reportSaveStatus('saving');
      Promise.resolve()
        .then(() => saveRef.current())
        .then(() => reportSaveStatus('saved'))
        .catch(() => reportSaveStatus('error'));
    }
  }, []);

  // 탭 닫기/새로고침 직전 미저장이면 브라우저 확인창 — 마지막 안전망.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (enabledRef.current && dirtyRef.current) {
        e.preventDefault();
        e.returnValue = ''; // Chrome 요구사항
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
