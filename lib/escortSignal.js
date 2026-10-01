// 길잡이(에스코트) 저장 신호 — 단추를 눌러야 저장되는 화면이 저장에 성공하면 알린다 (1001).
// 길잡이는 이 신호를 받아 '저장하기' 단계를 저절로 끝낸다(components/guide/EscortGuide.jsx).
// 자동 저장 화면은 SAVE_STATUS_EVENT(lib/hooks/useAutoSave.js)가 따로 있다 — 이건 '무엇을' 저장했는지까지 싣는다.
//
// kind: 'abc-saved'(ABC 관찰) | 'monitor-saved'(행동 데이터) | 'iep-goal-saved'(IEP 목표) | 'student-added'(학생 등록)

export const ESCORT_EVENT = 'kkobak-escort';

export function escortSignal(kind) {
  try {
    window.dispatchEvent(new CustomEvent(ESCORT_EVENT, { detail: { kind } }));
  } catch (_e) { /* SSR/구형 브라우저 — 무시 */ }
}
