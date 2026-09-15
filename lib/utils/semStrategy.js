// 학기 교육방법("- 지도전략: …" 여러 줄 문자열)의 지도전략 값 읽기·자동값 바꾸기 (0915, IEP 경로B 교수 방법 하나 고정).
// '↻ 기본 전략으로 채우기'가 넣은 자동값(장애영역 목록·핵심기술 방법)과 교사가 직접 고친 값을 구분해,
// 자동값 그대로일 때만 바꾼다 — 교사가 고친 줄은 건드리지 않는다.

const STRATEGY_LINE = /^(\s*[-•·]?\s*)지도\s*전략\s*[:：]\s*(.*)$/;

/** 첫 '지도전략:' 줄의 값(앞뒤 공백 제거). 없으면 ''. */
export function strategyValue(text) {
  for (const line of String(text || '').split('\n')) {
    const m = line.match(STRATEGY_LINE);
    if (m) return m[2].trim();
  }
  return '';
}

/**
 * 첫 '지도전략:' 줄의 값이 autoValues 중 하나와 정확히 같으면 next로 바꾼 텍스트를, 아니면 원문을 돌려준다.
 * 줄 앞머리("- " 등)와 다른 줄은 그대로 둔다.
 */
export function replaceAutoStrategy(text, next, autoValues = []) {
  const src = String(text || '');
  const to = String(next || '').trim();
  if (!src || !to) return src;
  const autos = new Set(autoValues.map((v) => String(v || '').trim()).filter(Boolean));
  const lines = src.split('\n');
  const i = lines.findIndex((l) => STRATEGY_LINE.test(l));
  if (i < 0) return src;
  const [, lead, value] = lines[i].match(STRATEGY_LINE);
  const cur = value.trim();
  if (cur === to || !autos.has(cur)) return src;
  lines[i] = `${lead}지도전략: ${to}`;
  return lines.join('\n');
}
