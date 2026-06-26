// PBS 실행을 위한 기초 설문조사 — 단일 출처(문항·항목 정의).
// 출처: "긍정적행동지원(PBS) 실행을 위한 기초 설문조사서" (학교/학급 차원 Tier 1 실태조사).
// 학생문제행동 실태 파악 + 학교 규칙(기대행동) 수립용. 반·학기 단위로 저장.

// Q2. 문제행동 유형(정의 포함). 학생수 + 순위(1~5)를 응답.
export const PBS_BEHAVIORS = [
  { key: 'aggression', label: '공격행동', def: '타인을 때리기, 물기, 꼬집기, 밀기, 목 조르기, 발로 차기, 물건 던지기, 머리카락 당기기' },
  { key: 'selfharm', label: '자해행동', def: '벽에 머리 찧기, 머리 때리기, 머리 뜯기, 꼬집기, 손톱 물어뜯기, 손등·팔 물기, 손으로 벽치기, 책상에 머리박기' },
  { key: 'emotional', label: '정서불안정 행동', def: '괴성내기, 상황에 맞지 않는 울음과 웃음, 급격한 감정변화' },
  { key: 'disruption', label: '수업방해 행동', def: '과제거부, 수업 중 자리이탈, 교실이탈, 지나친 질문, 같은 말 반복' },
  { key: 'antisocial', label: '반사회적 행동', def: '거짓말, 훔치기, 욕하기, 누워서 떼쓰기, 공공장소 배변·배뇨, 침 뱉기, 시비걸기' },
  { key: 'stereotypy', label: '상동행동', def: '손·머리·다리 흔들기, 혀로 소리내기, 입술소리 내기, 손뼉치기, 책상 두드리기' },
  { key: 'sexual', label: '성적이상 행동', def: '자위행동, 급우·교사 만지기, 자기성기 만지기, 성기 노출, 옷 벗기' },
  { key: 'destruction', label: '기물파손 행동', def: '물건 던지기, 책상 위 물건 흩뜨리기, 게시물 파손, 책 찢기, 유리창 깨기, 발로 물건 차기, 책상 넘어뜨리기' },
  { key: 'abnormal', label: '이상행동', def: '냄새 맡기, 이식증, 침장난, 그 외' },
  { key: 'depression', label: '슬픔 및 우울', def: '슬픈 감정, 우울함, 자기비하' },
  { key: 'hallucination', label: '환청 또는 환각', def: '' },
  { key: 'fixation', label: '집착행동', def: '특정 행동이나 물건, 장소에 대한 집착' },
];

// Q3. 문제행동 강도(순위 응답).
export const PBS_INTENSITY = [
  '지장을 주지 않고 말로 중재가 가능함',
  '지도가 필요하나 교사 혼자 해결이 가능함',
  '수업을 중단하고 문제행동을 제지해야 하며 보조원·공익의 도움이 필요함',
  '다른 학생을 대피시켜야 하고 의료적 치료가 필요할 정도의 위기가 발생함',
];

// Q4. 사용 중재방법(사용여부 + 효과 1~5).
export const PBS_INTERVENTIONS = [
  '물질적 강화물 제공', '토큰 경제', '사회적 강화(칭찬)', '대체행동 지도', '차별 강화',
  '학급 규칙 게시·직접 지도', '자기통제 훈련(자기점검·평가·강화)', '사전교정(절차·규칙 사전 설명)',
  '무시(문제행동에 관심 안 둠)', '질책(즉각 지적)', '타임아웃(일정시간 격리)', '신체적 제지(구속·속박)',
  '벌', '부모 상담',
];

// Q5. PBS 인지도.
export const PBS_AWARENESS = [
  '들어 본 적 없다.',
  '들어 본 적은 있으나 관심을 두지 않았다.',
  '관심을 가지고 있어 서적·연수를 통해 살펴보았다.',
];

// Q6-1. PBS 효과 기대 영역(복수 선택).
export const PBS_EFFECT_AREAS = [
  '학생의 문제행동이 감소할 것이다.',
  '바람직한 수업참여 태도가 형성된다.',
  '장애학생 행동관리 이해 심화 + 교사 역량 강화.',
  '학부모의 신뢰감이 증진될 것이다.',
  'PBS 실행으로 즐겁고 행복한, 신나는 학교가 될 것이다.',
  '전 교직원이 일치된 시각과 관심을 보이게 될 것이다.',
];

// Q7. 지도 어려움(해당유무 + 지원 요구).
export const PBS_DIFFICULTIES = [
  '문제행동을 다루는 방법을 알 수 없어서',
  '학생이 문제행동을 하는 이유를 알 수 없어서',
  '체력적·정신적 소진',
  '지원 인력의 부족',
  '폭발행동 학생을 격리시킬 장소 부재',
  '부모의 무리한 요구 및 협조 부족',
  '문제발생 시 과중한 교사책무성',
  '문제발생 시 해결과정의 복잡함과 어려움',
  '내가 힘든 것을 알아주는 사람이 없어서',
];

// Q8/Q11. 장소.
export const PBS_PLACES = ['교실', '식당', '복도', '버스', '운동장', '화장실', '엘리베이터', '기타'];

// Q9. 시간대.
export const PBS_TIMES = ['등교시간', '수업 중', '쉬는시간', '교실이동시간', '점심시간', '하교시간', '방과후활동'];

// Q10. 기대행동(학교 규칙) 후보 — 5가지 순위 선택.
export const PBS_EXPECTED = [
  '바르게', '정중하게', '끈기있게', '조용하게',
  '안전하게', '책임감있게', '성실하게', '행복하게',
  '단정하게', '웃으며', '끝까지', '도와주며',
  '스스로', '밝게', '다함께', '나누며',
];

// 빈 응답 기본값.
export function emptyPbsSurvey() {
  return {
    q1: { grade: '', homeroom: '담임', count: '' },
    q2: PBS_BEHAVIORS.reduce((o, b) => { o[b.key] = { n: '', rank: '' }; return o; }, {}),
    q2etc: '',
    q3: PBS_INTENSITY.map(() => ''),
    q4: PBS_INTERVENTIONS.map(() => ({ used: false, effect: 0 })),
    q4etc: { label: '', used: false, effect: 0 },
    q5: 0,
    q6: { effective: 0, areas: [], etc: '' },
    q7: PBS_DIFFICULTIES.map(() => ({ has: false, need: '' })),
    q7etc: { has: false, need: '' },
    q8: PBS_PLACES.map(() => ''),
    q8etc: '',
    q9: PBS_TIMES.map(() => ''),
    q10: PBS_EXPECTED.map(() => ''),
    q10custom: '',
    q11: PBS_PLACES.map(() => ''),
    q12: [
      { behavior: '', places: [{ place: '', rules: '' }, { place: '', rules: '' }, { place: '', rules: '' }] },
      { behavior: '', places: [{ place: '', rules: '' }, { place: '', rules: '' }, { place: '', rules: '' }] },
      { behavior: '', places: [{ place: '', rules: '' }, { place: '', rules: '' }, { place: '', rules: '' }] },
    ],
  };
}
