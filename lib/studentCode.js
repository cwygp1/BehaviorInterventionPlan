// 학생 코드(별명) 길이 규칙 — DB 열 students.student_code VARCHAR(100)과 같은 값(lib/ensureSchema.js).
//   1102(mds/57 #4): 101자 이상이면 DB 오류가 500으로 나가던 것을 서버에서 400 + 쉬운 말로 막고, 입력칸에는 maxLength를 준다.
//   PostgreSQL VARCHAR(n)은 '글자 수'로 세므로 여기서도 글자(코드 포인트) 단위로 센다.
export const STUDENT_CODE_MAX = 100;

export function studentCodeLength(code) {
  return Array.from(String(code == null ? '' : code)).length;
}

/** 저장 전 검사 — 문제가 없으면 '' , 있으면 교사에게 보일 안내문. */
export function studentCodeError(code) {
  const s = String(code == null ? '' : code);
  if (!s.trim()) return '학생 코드(별명)를 적어 주세요.';
  const n = studentCodeLength(s);
  if (n > STUDENT_CODE_MAX) return `학생 코드는 ${STUDENT_CODE_MAX}자까지 쓸 수 있어요(지금 ${n}자). 짧은 별명으로 줄여 주세요.`;
  return '';
}
