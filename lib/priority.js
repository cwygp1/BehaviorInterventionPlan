// 표적행동 우선순위 체크리스트 — 단일 출처(기준·척도·집계).
//
// 2026-08 최신화(01_참고자료 / 06_분석문서 문서 반영):
//   Dardig & Heward(1981)의 우선순위화 절차 + Cooper, Heron & Heward(2020)의
//   'Nine Questions to Ask When Prioritizing Target Behaviors' → 최진혁(2026) 번역·수정본.
//   여러 잠재적 문제행동(최대 4개)을 같은 9기준으로 평정해 총점이 가장 높은 행동을 중재 목표로 고른다.

export const PRIORITY_CRITERIA = [
  '이 행동은 자신이나 타인에게 위험을 초래하는가?',
  '이 새로운 행동을 사용할 기회는 얼마나 많은가, 또는 이 문제행동은 얼마나 자주 발생하는가?',
  '이 문제행동 또는 기술 결핍은 얼마나 오래 지속되어 왔는가?',
  '이 행동이 변화하면 대상자에게 더 높은 수준의 강화가 제공되는가?',
  '이 행동은 미래의 기술 발달과 독립적 기능에 얼마나 중요한가?',
  '이 행동이 변화하면 다른 사람의 부정적이거나 원치 않는 관심이 줄어드는가?',
  '이 새로운 행동은 중요한 타인에게도 긍정적 결과를 가져오는가?',
  '이 행동을 성공적으로 변화시킬 가능성은 얼마나 높은가?',
  '이 행동을 변화시키는 데 드는 비용은 얼마나 효율적인가? (비용대비효율성)',
];

export const PRIORITY_SCALE = [
  { v: 0, label: '아니다, 절대 아니다' },
  { v: 1, label: '거의 아니다' },
  { v: 2, label: '가끔, 때때로 그렇다' },
  { v: 3, label: '자주 그렇다' },
  { v: 4, label: '항상 그렇다' },
];

export const PRIORITY_MAX = PRIORITY_CRITERIA.length * 4; // 36점

const emptyBehavior = (name = '') => ({ name, responses: new Array(PRIORITY_CRITERIA.length).fill(0) });

// 구버전(2026-08 개정 전) 저장값인지 — 단일 행동, 숫자 배열 9칸.
// 개정 전 9문항(안전 위협·학습 방해·강도 등)과 개정 후 9기준(지속 기간·강화 수준·비용효율 등)은
// 의미가 달라, 구버전 응답을 새 기준의 답으로 옮기면 엉뚱한 기준에 점수가 찍힌다 → 이관하지 않는다.
export function isLegacyPriority(saved) {
  return Array.isArray(saved) && saved.length > 0 && (typeof saved[0] !== 'object' || saved[0] === null);
}

// 저장된 값 → 화면 구조([{name, responses[9]}]).
export function normalizePriority(saved) {
  const fix = (arr) => {
    const a = Array.isArray(arr) ? arr.map((v) => (Number.isFinite(+v) ? Math.max(0, Math.min(4, +v)) : 0)) : [];
    return a.concat(new Array(Math.max(0, PRIORITY_CRITERIA.length - a.length)).fill(0)).slice(0, PRIORITY_CRITERIA.length);
  };
  if (Array.isArray(saved) && saved.length && typeof saved[0] === 'object' && saved[0] !== null) {
    return saved.slice(0, 4).map((b) => ({ name: String(b?.name || ''), responses: fix(b?.responses) }));
  }
  // 구버전(숫자 배열)은 기준 개정으로 의미가 달라 이관하지 않는다 — 빈 상태에서 새로 평정.
  return [emptyBehavior()];
}

// 총점 내림차순 정렬 결과([{index, name, total}]). 이름·응답이 빈 행동은 제외.
export function priorityRank(behaviors) {
  return (behaviors || [])
    .map((b, index) => ({ index, name: String(b?.name || '').trim(), total: (b?.responses || []).reduce((a, c) => a + (Number(c) || 0), 0) }))
    .filter((b) => b.name || b.total > 0)
    .sort((a, b) => b.total - a.total);
}

// AI 프롬프트·요약용 텍스트 라인. 우선순위가 정해졌으면 1순위를 명시한다.
export function priorityLines(saved) {
  const ranked = priorityRank(normalizePriority(saved));
  if (!ranked.length) return [];
  const lines = ['표적행동 우선순위(체크리스트 총점, 각 36점 만점):'];
  ranked.forEach((b, i) => lines.push(`  ${i + 1}순위. ${b.name || '(이름 미입력)'} — ${b.total}/${PRIORITY_MAX}점`));
  if (ranked[0].name) {
    lines.push(`  → 중재 목표는 1순위 "${ranked[0].name}"를 우선 다룰 것(교사가 우선순위 체크리스트로 선정함).`);
  }
  return lines;
}
