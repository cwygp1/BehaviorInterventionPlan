// AI 응답 JSON 파싱 단일 출처 (0824 — '알려진 한계: AI JSON 안정성' 해소).
// 이전엔 IepPage·IepReportPage·StartPointPage·ObservePage가 각자 간이 보정을
// 들고 있었고, 모델이 심하게 깨뜨리면(따옴표 누락, 잘린 JSON, 주석 혼입 등) 실패했다.
// jsonrepair 라이브러리로 대부분의 깨짐을 복구한다: 홑따옴표/스마트따옴표,
// 따옴표 없는 키, 후행 콤마, 주석, 코드펜스, 중간에 잘린 JSON, 이어붙은 문자열 등.
import { jsonrepair } from 'jsonrepair';

/**
 * 텍스트에서 첫 JSON 블록({…} 또는 […])을 찾아 파싱한다.
 * 1) 그대로 파싱 → 2) 기존 간이 보정 → 3) jsonrepair 순으로 시도.
 * @throws 세 단계 모두 실패하면 1차 파싱 오류를 던진다(원인 파악에 가장 유용).
 */
export function parseLooseJSON(raw) {
  const s = String(raw || '');
  // 코드펜스 제거 후 JSON 블록 추출 ({…} 우선, 없으면 […]).
  const cleaned = s.replace(/```(?:json)?/gi, '');
  const m = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('JSON({…})을 찾지 못했어요.');
  const text = m[0];

  let firstErr;
  try {
    return JSON.parse(text);
  } catch (e1) {
    firstErr = e1;
  }
  // 간이 보정(기존 동작 유지) — 흔한 깨짐은 여기서 끝나 jsonrepair 비용을 아낀다.
  try {
    const quick = text
      .replace(/:\s*"\s*:\s*"/g, ': "')            // "key":": "  →  "key": "
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")  // 스마트 따옴표 정규화
      .replace(/,\s*([}\]])/g, '$1');               // 후행 콤마 제거
    return JSON.parse(quick);
  } catch (_e2) { /* jsonrepair로 */ }
  try {
    return JSON.parse(jsonrepair(text));
  } catch (_e3) {
    throw firstErr; // 원본 오류 메시지를 노출
  }
}

/**
 * 실패 시 throw 대신 null을 돌려주는 변형 — "없으면 넘어가는" 호출부용.
 */
export function extractLooseJSON(text) {
  try {
    return parseLooseJSON(text);
  } catch (_e) {
    return null;
  }
}
