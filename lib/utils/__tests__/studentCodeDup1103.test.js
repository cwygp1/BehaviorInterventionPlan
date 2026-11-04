// mds/58 #1(1103) 같은 학생 코드 다시 추가 — 500 대신 409 + 쉬운 말. 순수 로직 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT_CODE_DUP_MSG, isUniqueViolation } from '../../studentCode.js';

test('고유 제약 위반(23505)만 중복으로 본다', () => {
  // Neon(@neondatabase/serverless) NeonDbError는 code: '23505'를 문자열로 싣는다(dev 로그로 확인).
  assert.equal(isUniqueViolation({ code: '23505', constraint: 'students_user_id_student_code_key' }), true);
  assert.equal(isUniqueViolation(Object.assign(new Error('duplicate key'), { code: '23505' })), true);
  assert.equal(isUniqueViolation({ code: 23505 }), true);
  assert.equal(isUniqueViolation({ code: '22001' }), false); // 너무 긴 값 — 다른 오류는 500 유지
  assert.equal(isUniqueViolation(new Error('x')), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
  assert.equal(isUniqueViolation('23505'), false);
});

test('중복 안내문은 쉬운 말이고 다른 코드를 권한다', () => {
  assert.match(STUDENT_CODE_DUP_MSG, /이미 있는 학생 코드/);
  assert.match(STUDENT_CODE_DUP_MSG, /다른 코드/);
  assert.doesNotMatch(STUDENT_CODE_DUP_MSG, /error|Internal/i);
});
