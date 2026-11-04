// 토스트 종류 추론 — 타입을 넘기지 않은 기존 호출도 메시지 내용으로 ✓(success)·⚠(error)를 고른다.
//   contexts/ToastContext.jsx가 쓴다(기존 디자인 '/'와 새 디자인 '/new' 공용). React를 쓰지 않는다(node --test, lib/utils/__tests__/toastType1103.test.js).
//   1103(mds/58 #23): 쉬운 말 안내('…가 없어요', '…하지 못했어요')는 성공 낱말('저장'·'복사'·'반영')보다 먼저 본다 —
//   '저장된 통신문이 없어요'·'저장하지 못했어요'·'복사 권한이 없어요'가 초록 ✓로 뜨던 오분류.
export function inferType(msg) {
  const s = String(msg || '');
  if (/(없어요|못했어요|못 했어요)/.test(s)) return 'error';
  if (/(실패|오류|에러|안 ?됨|없습니다|불가|금지|확인해|입력해)/.test(s)) return 'error';
  if (/(완료|저장|성공|등록됨|반영|복사)/.test(s)) return 'success';
  return '';
}
