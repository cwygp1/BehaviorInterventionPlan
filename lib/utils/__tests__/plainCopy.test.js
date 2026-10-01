// 복사용 일반 글(mds/44 S11) — 마크다운 기호만 걷고 내용·글머리는 그대로인지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPlainCopyText } from '../aiText.js';

test('굵게·제목·코드 표시를 걷고 글머리 - 와 ■는 남긴다', () => {
  const src = '## 학기목표\n**받침 없는 낱말**을 읽는다\n- 그림 단서와 함께\n* 첫소리 고르기\n■ 평가: `5개 중 4개`';
  assert.equal(toPlainCopyText(src), '학기목표\n받침 없는 낱말을 읽는다\n- 그림 단서와 함께\n- 첫소리 고르기\n■ 평가: 5개 중 4개');
});

test('표는 칸 사이를 탭으로, 구분선과 코드 울타리는 지운다', () => {
  const src = '```\n| 월 | 내용 |\n|---|:---:|\n| 3월 | 자모 카드 |\n```';
  assert.equal(toPlainCopyText(src), '월\t내용\n3월\t자모 카드');
});

test('곱하기·별표 하나는 건드리지 않고, 빈 값은 빈 글', () => {
  assert.equal(toPlainCopyText('3*4 = 12, 별표(*) 표시'), '3*4 = 12, 별표(*) 표시');
  assert.equal(toPlainCopyText(''), '');
  assert.equal(toPlainCopyText(null), '');
});
