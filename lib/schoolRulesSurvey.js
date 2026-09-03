// 학교 규칙 수립을 위한 조사서 — 단일 출처(문항·항목 정의).
// 출처: "3-2-5 PBS 실행을 위한 기초조사의 예2 (학교 규칙 수립을 위한 조사서)".
// 원문 문구를 그대로 옮긴다 — 임의로 바꾸지 말 것. 반·학기 단위로 저장.

// 1. 심각한 문제행동 정의 안내(원문 박스).
export const SERIOUS_DEF_SOURCE = '심각한 문제행동(Jensen, McConnachie, & Pierson, 2001)';
export const SERIOUS_DEF_LINES = [
  '머리 때리기, 머리 박기, 손 물기, 눈 찌르기 등의 행동 또는 때리기, 물기, 차기와 같은 공격적 행동으로 자신이나 타인에게 신체적 해를 주는 행동. 물건을 파괴하거나 멀리 달아나기, 먹으면 안 되는 물건을 먹는 행동',
  '수업을 멈추고 즉각적인 대처를 하지 않으면 안 될 정도로 교사와 다른 친구들의 수업에 방해가 되는 행동으로 소리 지르기, 지속적으로 울기, 바닥에 누워 떼쓰기 등의 행동',
];

// 1. 사소한 문제행동 안내(원문 박스).
export const MINOR_DEF =
  '자신과 타인의 몸에 해를 끼치거나 오랜 시간 수업을 방해하지는 않으나 여러 번 성인의 지시와 촉진이 필요한 행동';

// [표 B] 사소한 문제행동 목록. custom = 행동명을 직접 입력하는 '기타' 행.
export const MINOR_BEHAVIORS = [
  { label: '바르지 못한 자세', desc: '엎드리기, 의자에 다리 올리기, 몸 틀고 있기 등' },
  { label: '시선을 교사나 교재에 두지 않음', desc: '다른 곳 보기, 얼굴 가리기, 고개 숙이고 있기 등' },
  { label: '손/발 장난', desc: '손 흔들기, 빨기, 코 파기, 주변 사람 만지기, 다리 흔들기 등' },
  { label: '박수 치기/책상치기', desc: '손바닥 등의 신체를 사용해 소음을 내는 행동' },
  { label: '소음 내기', desc: '입으로 무의미한 소리내기' },
  { label: '자리 이탈', desc: '교실 밖으로 나가지는 않으나 교실 안에서 허락 없이 자리를 이탈하는 행동' },
  { label: '기타', desc: '자유롭게 기재해 주세요', custom: true },
];

// 2. 문제행동이 자주 일어나는 시간과 장소 확인 — 안내 문구(원문).
export const TIME_HINT = '통학버스, 승하차장, 등하교 시간, 수업 중, 쉬는 시간, 이동 시간, 점심시간 등';
export const PLACE_HINT = '승하차장, 출입구, 놀이터, 계단, 교실, 복도, 화장실, 식당, 특별실 등';

// [표 C] 활동 목록(원문 순서 유지). 문제행동 발생 가능성 1~6 + 순위.
export const ACTIVITIES = [
  '통학버스 승하차장',
  '등하교 시간',
  '수업 시작 전',
  '주지 교과(국어, 사회, 수학 등)',
  '활동 중심 교과(음악, 미술, 체육 등)',
  '쉬는 시간',
  '교실 이동 시간',
  '점심시간(식당)',
  '점심시간(여가 시간)',
  '점심시간(양치질)',
  '전환 (점심시간 후 수업 시작할 때)',
  '체육관',
  '특별실',
];

// [표 D] 첫 칸 안내(원문).
export const CHANGE_HINT_LINES = [
  '바뀌어야 할 환경은?',
  '교사가 변화되어야 할 것은?',
  '학생이 배워야 할 것은?',
];

export const SERIOUS_ROWS = 3;  // 표 A 기본 행 수(행 추가 가능)
export const CHANGE_ROWS = 3;   // 표 D 기본 행 수(행 추가 가능)

export const emptySeriousRow = () => ({ name: '', trait: '' });
export const emptyChangeRow = () => ({ change: '', priority: '', feasible: '' });

/**
 * 저장된 응답을 현재 문항 정의에 맞춰 보정한다 — 예전에 저장한 응답이라도
 * 항목이 늘거나 키가 빠져 있으면 빈 값으로 채워 화면이 깨지지 않게 한다.
 */
export function normalizeSchoolRules(saved) {
  const base = emptySchoolRules();
  if (!saved) return base;
  const arr = (v, fallback) => (Array.isArray(v) && v.length ? v : fallback);
  // 정의 개수만큼 길이를 맞춘다(모자라면 빈 항목으로 채움).
  const fit = (v, fallback) => fallback.map((def, i) => ({ ...def, ...(Array.isArray(v) ? v[i] : null) }));
  return {
    ...base,
    ...saved,
    serious: arr(saved.serious, base.serious).map((row) => ({ ...emptySeriousRow(), ...row })),
    minor: fit(saved.minor, base.minor),
    activities: fit(saved.activities, base.activities),
    calm: fit(saved.calm, base.calm),
    changes: arr(saved.changes, base.changes).map((row) => ({ ...emptyChangeRow(), ...row })),
    hardest: saved.hardest || '',
    common: saved.common || '',
  };
}

// 빈 응답 기본값.
export function emptySchoolRules() {
  return {
    // 1. 기초 조사
    serious: Array.from({ length: SERIOUS_ROWS }, emptySeriousRow),
    // 표 B — occurs: 발생 여부(○), problem: 문제행동 여부('O'|'X'|''), label: 기타 행동명
    minor: MINOR_BEHAVIORS.map((b) => ({ occurs: false, problem: '', label: b.custom ? '' : undefined })),
    // 2. 활동별 발생 가능성(1~6) + 순위
    activities: ACTIVITIES.map(() => ({ level: '', rank: '' })),
    // 3. 문제행동이 자주 일어나지 않는 시간·장소 1~3위 + 관련 요인
    calm: [
      { place: '', factor: '' },
      { place: '', factor: '' },
      { place: '', factor: '' },
    ],
    // 4. 지도할 때 가장 어려운 점(주관식)
    hardest: '',
    // 5. 어떤 변화가 필요할까?
    common: '',
    changes: Array.from({ length: CHANGE_ROWS }, emptyChangeRow),
  };
}
