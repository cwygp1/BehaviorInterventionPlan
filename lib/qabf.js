// QABF(행동기능설문지) 공식 양식 — 단일 출처(문항·기능·척도·점수 계산).
// 5개 기능이 1~5번 순서로 순환: 관심·회피·자동/감각·신체(통증)·강화물 획득.

export const QABF_QUESTIONS = [
  { f: 'attention', q: '관심을 끌기 위해 행동을 보인다.' },
  { f: 'escape',    q: '일하는 상황이나 학습 상황에서 벗어나기 위해 행동을 보인다.' },
  { f: 'sensory',   q: '"자기자극"의 형태로 행동을 보인다.' },
  { f: 'physical',  q: '고통을 느낄 때 행동을 보인다.' },
  { f: 'tangible',  q: '좋아하는 장난감·음식·음료수와 같이 어떤 물건을 가지기 위해 행동을 보인다.' },

  { f: 'attention', q: '꾸중을 듣기를 즐겨하기 때문에 행동을 보인다.' },
  { f: 'escape',    q: '옷 입기·이 닦기·일하기 등 어떤 과제를 수행하라고 했을 때 행동을 보인다.' },
  { f: 'sensory',   q: '방 안에 아무도 없어도 혼자서 행동을 보인다.' },
  { f: 'physical',  q: '아플 때 더 많이 행동을 보인다.' },
  { f: 'tangible',  q: '어떤 물건들을 제거하면 행동을 보인다.' },

  { f: 'attention', q: '자신에게 관심을 돌리기 위해 행동을 보인다.' },
  { f: 'escape',    q: '특정 과제를 수행하기 싫어서 행동을 보인다.' },
  { f: 'sensory',   q: '아무것도 할 것이 없을 때 행동을 보인다.' },
  { f: 'physical',  q: '무엇인가 자신의 신체적인 부분이 불편할 때 행동을 보인다.' },
  { f: 'tangible',  q: '원하는 물건을 당신(평정자)이 가지고 있을 때 행동을 보인다.' },

  { f: 'attention', q: '당신의 반응을 보고 싶어서 행동을 보인다.' },
  { f: 'escape',    q: '다른 사람들로부터 혼자 있고 싶어서 행동을 보인다.' },
  { f: 'sensory',   q: '주변의 상황을 무시하며 심하게 반복행동을 보인다.' },
  { f: 'physical',  q: '신체적으로 불편할 때 행동을 보인다.' },
  { f: 'tangible',  q: '원하는 물건을 또래가 가지고 있을 때 행동을 보인다.' },

  { f: 'attention', q: '행동을 보일 때 "여기 와서 나를 봐" "나를 바라봐"라고 이야기하는 것 같다.' },
  { f: 'escape',    q: '행동을 보일 때 "혼자 내버려둬" "무엇을 하라고 하지 마"라고 이야기하는 것 같다.' },
  { f: 'sensory',   q: '혼자 있어도 그 행동을 즐기는 것 같다.' },
  { f: 'physical',  q: '행동을 통해서 자신이 아프다는 것을 말하는 것 같다.' },
  { f: 'tangible',  q: '행동을 보일 때 장난감·음식·특정 물건을 달라고 말하는 것 같다.' },
];

export const QABF_FUNCTION_ORDER = ['attention', 'escape', 'sensory', 'physical', 'tangible'];

export const QABF_FUNCTION_LABELS = {
  attention: '관심 (Attention)',
  escape: '회피 (Escape)',
  sensory: '자동·감각적 (Automatic)',
  physical: '신체 (Physical)',
  tangible: '강화물 획득 (Tangible)',
};

export const QABF_SHORT_LABELS = ['관심', '회피', '자동·감각', '신체', '강화물'];

export const QABF_FUNCTION_COLORS = {
  attention: '#4f6bed',
  escape: '#ef476f',
  sensory: '#12b886',
  physical: '#9c36b5',
  tangible: '#f59f00',
};

export const QABF_SCALE = [0, 1, 2, 3];
export const QABF_SCALE_LABELS = { 0: '해당없음', 1: '가끔', 2: '종종', 3: '자주' };

// 기능(0~5, 0점 초과 응답 문항 수) · 심각도(0~15, 점수 합) 계산
export function qabfScores(responses) {
  const func = [0, 0, 0, 0, 0];
  const sev = [0, 0, 0, 0, 0];
  (responses || []).forEach((v, i) => {
    if (v >= 0) {
      sev[i % 5] += v;
      if (v > 0) func[i % 5] += 1;
    }
  });
  return { func, sev };
}
