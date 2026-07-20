// 교과 평어(생활기록부 과목별 세부능력·특기사항용 서술) 생성 — 단일 출처.
// 성취기준 + 수행평가 설명 → 평어 문장 후보 N개.
// 문체: 명사형 종결("~함/~음"), 관찰 가능·구체적, 학생명/존댓말 금지.

export const PYEONG_LEVELS = [
  { key: '', label: '수준 미지정' },
  { key: '상', label: '상 (우수)' },
  { key: '중', label: '중 (보통)' },
  { key: '하', label: '하 (도움 필요)' },
];

/**
 * 평어 생성 프롬프트를 만든다.
 * @param {object} o
 * @param {string} o.standard   - 성취기준(문장 또는 [코드] 포함)
 * @param {string} o.performance- 수행평가 설명/학생 수행 요약
 * @param {string} [o.level]    - '상' | '중' | '하' | ''
 * @param {number} [o.count]    - 생성할 문장 수(기본 15)
 * @param {string} [o.context]  - 추가 맥락(학생 비식별 요약 등, 선택)
 * @param {boolean} [o.includeBehaviorSupport] - 행동·정서 지원 내용 언급 허용 여부(기본 false)
 */
export function buildPyeongPrompt({ standard = '', performance = '', level = '', count = 15, context = '', includeBehaviorSupport = false }) {
  const levelLine = level
    ? `학생의 성취 수준은 "${level}"이다. 이 수준이 드러나도록 표현의 강도를 조절하라(상=우수·주도적, 중=대체로 수행, 하=도움받아 수행/기초 단계).\n`
    : '';
  const ctxLine = context ? `참고(비식별) 맥락: ${context}\n` : '';
  // P10(0720): 교과 평어는 공개 문서(생기부) — 위기 대응·행동 지원 정보가 그대로 실리지 않게
  // 기본으로 차단한다. 교사가 원할 때만(체크) 긍정적 성장 서술로 최소한 허용.
  const behaviorLine = includeBehaviorSupport
    ? '7) 행동·정서 지원 관련 내용은 위기·문제행동 서술 없이, 자기 조절·참여 태도의 긍정적 성장으로만 간결히 담을 수 있다(안정실·자해 등 위기 대응 언급은 금지).\n'
    : '7) [중요] 행동·정서 지원, 위기 대응 내용(안정실, 자해, 진정, 위기, 대체행동 카드, 감각 조절 도구 등)은 평어에 절대 쓰지 않는다. 교과 성취와 학습 태도 중심으로만 서술한다.\n';
  return (
    '너는 학교생활기록부 "교과 평어(세부능력 및 특기사항)" 작성 전문가다.\n' +
    '아래 성취기준과 수행평가 설명을 반영해, 바로 생기부에 기재 가능한 평어 문장을 생성하라.\n\n' +
    `[성취기준] ${standard || '(미입력)'}\n` +
    `[수행평가 설명] ${performance || '(미입력)'}\n` +
    levelLine + ctxLine + '\n' +
    '작성 규칙:\n' +
    `1) 서로 다른 평어 문장을 ${count}개 생성한다.\n` +
    '2) 각 문장은 "- "로 시작하는 한 줄. 1~2문장 분량.\n' +
    '3) 종결어미는 반드시 명사형("~함", "~음", "~됨" 등)으로 끝낸다. ("~습니다/~한다" 금지)\n' +
    '4) 성취기준의 핵심 행동과 수행평가 내용을 구체적으로 반영하고, 관찰 가능한 표현을 쓴다.\n' +
    '5) 학생 실명·존댓말·수치 평가어("점수", "등급")는 쓰지 않는다.\n' +
    '6) 표현을 다양하게 변주해 교사가 골라 쓸 수 있게 한다.\n' +
    behaviorLine + '\n' +
    '결과는 "- "로 시작하는 문장 목록만 출력한다(설명·머리말 금지).'
  );
}

// 모델 출력 텍스트에서 "- " 문장만 추려 배열로 정리.
export function parsePyeongLines(text) {
  if (!text) return [];
  return String(text)
    .split('\n')
    .map((l) => l.replace(/^\s*[-•·*]\s*/, '').trim())
    .filter((l) => l.length > 1 && !/^(결과|출력|평어)\b/.test(l));
}
