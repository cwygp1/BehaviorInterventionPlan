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

// 1103(mds/58 #1): 같은 선생님 안에서 학생 코드는 하나뿐(UNIQUE(user_id, student_code), lib/ensureSchema.js).
//   중복이면 500 'Internal server error' 대신 409 + 이 안내를 돌려준다. 화면은 서버 error 문구를 그대로 토스트로 보인다.
export const STUDENT_CODE_DUP_MSG = '이미 있는 학생 코드예요. 다른 코드(별명)를 써 주세요.';

/** PostgreSQL 고유 제약 위반(23505)인지 — 선조회 뒤 동시에 들어온 같은 코드 INSERT를 409로 바꾸는 데 쓴다. */
export function isUniqueViolation(err) {
  return !!err && typeof err === 'object' && String(err.code) === '23505';
}
