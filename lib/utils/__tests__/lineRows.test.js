import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, serializeRows } from '../lineRows.js';

test('빈 값은 빈 행 하나', () => {
  assert.deepEqual(parseRows(''), [{ label: '', text: '' }]);
  assert.equal(serializeRows([{ label: '', text: '' }]), '');
});

test('"- " 줄을 행으로 나누고 되돌리면 같은 문자열', () => {
  const v = '- 그림카드 보며 반응하기\n- 감정 카드와 행동 카드 연결하기';
  const rows = parseRows(v);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, '그림카드 보며 반응하기');
  assert.equal(serializeRows(rows), v);
});

test('불릿 없는 줄·빈 줄도 정리해서 "- "로 저장', () => {
  assert.equal(serializeRows(parseRows('첫째\n\n• 둘째 ')), '- 첫째\n- 둘째');
});

test('labeled: 짧은 구분만 떼고, 문장 속 콜론은 그대로', () => {
  const v = "- 지도전략: 직접교수, 시각적 지원\n- 지원수준: 현행 '신체·시범 촉진' → 독립 수행\n- 교사가 손을 잡고 시범 → 비율 3:1로 줄이기";
  const rows = parseRows(v, true);
  assert.deepEqual(rows[0], { label: '지도전략', text: '직접교수, 시각적 지원' });
  assert.equal(rows[1].label, '지원수준');
  assert.equal(rows[2].label, '');
  assert.equal(serializeRows(rows), v);
});

test('bullet=false: 줄글은 "- " 없이 줄만 나누고 그대로 되돌림', () => {
  const v = '교사의 촉진이 있을 때 부분적으로 수행함.\n- 이미 붙은 불릿은 그대로';
  const rows = parseRows(v, false, false);
  assert.equal(rows[1].text, '- 이미 붙은 불릿은 그대로');
  assert.equal(serializeRows(rows, false), v);
});

test('편집 중 빈 행은 저장값에서 빠짐', () => {
  assert.equal(serializeRows([{ label: '', text: 'a' }, { label: '', text: '' }]), '- a');
});
