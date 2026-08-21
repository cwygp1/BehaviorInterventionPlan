// QABF(행동기능설문지) 공식 양식 — 단일 출처(문항·기능·척도·점수 계산).
// 5개 기능이 1~5번 순서로 순환: 관심·회피·자동/감각·신체(통증)·강화물 획득.

// 2026-08 최신화: 최진혁 번역본(행동기능설문지 QABF, Vollmer & Matson, 1995) 문구로 교체.
// 문항 순서·기능 배치는 원척도와 동일하므로 기존 저장 응답(25칸 배열)과 그대로 호환된다.
export const QABF_QUESTIONS = [
  { f: 'attention', q: '관심을 얻기 위해 나타난다.' },
  { f: 'escape',    q: '일하기 또는 학습 상황에서 벗어나기 위해 나타난다.' },
  { f: 'sensory',   q: '자기자극(self-stimulation)의 형태로 나타난다.' },
  { f: 'physical',  q: '통증이나 아픔 때문에 나타난다.' },
  { f: 'tangible',  q: '좋아하는 장난감, 음식, 음료수와 같은 물건에 접근하기 위해 나타난다.' },

  { f: 'attention', q: '꾸중이나 제지와 같은 반응을 얻는 것을 좋아하기 때문에 나타난다.' },
  { f: 'escape',    q: '옷 입기, 양치하기, 일하기 등 어떤 과제를 하라고 했을 때 나타난다.' },
  { f: 'sensory',   q: '방 안에 아무도 없다고 생각할 때에도 나타난다.' },
  { f: 'physical',  q: '아플 때 더 자주 나타난다.' },
  { f: 'tangible',  q: '무언가를 빼앗기거나 치워졌을 때 나타난다.' },

  { f: 'attention', q: '자신에게 관심을 끌기 위해 나타난다.' },
  { f: 'escape',    q: '하고 싶지 않은 일을 해야 할 때 나타난다.' },
  { f: 'sensory',   q: '할 일이 아무것도 없을 때 나타난다.' },
  { f: 'physical',  q: '신체적으로 불편하거나 몸을 거슬리게 하는 것이 있을 때 나타난다.' },
  { f: 'tangible',  q: '상대방이 자신이 원하는 것을 가지고 있을 때 나타난다.' },

  { f: 'attention', q: '상대방의 반응을 끌어내기 위해 나타난다.' },
  { f: 'escape',    q: '다른 사람들이 자신을 혼자 있게 두도록 만들기 위해 나타난다.' },
  { f: 'sensory',   q: '주변 상황을 무시한 채 매우 반복적으로 나타난다.' },
  { f: 'physical',  q: '몸이 불편할 때 나타난다.' },
  { f: 'tangible',  q: '또래가 자신이 원하는 것을 가지고 있을 때 나타난다.' },

  { f: 'attention', q: '마치 \u201c여기 와서 나를 봐\u201d 또는 \u201c나를 봐 줘\u201d라고 말하는 것처럼 보이는가?' },
  { f: 'escape',    q: '마치 \u201c나를 혼자 내버려 둬\u201d 또는 \u201c이걸 하라고 하지 마\u201d라고 말하는 것처럼 보이는가?' },
  { f: 'sensory',   q: '아무도 주변에 없어도 그 행동 자체를 즐기는 것처럼 보이는가?' },
  { f: 'physical',  q: '몸이 좋지 않거나 아프다는 것을 나타내는 것처럼 보이는가?' },
  { f: 'tangible',  q: '마치 \u201c그거 주세요\u201d 또는 \u201c그걸 갖고 싶어요\u201d라고 말하는 것처럼 보이는가?' },
];

// 문항 앞에 붙는 공통 주어 — 화면에서 "위의 문제행동은 ○○" 형태로 읽히게 한다.
export const QABF_QUESTION_PREFIX = '위의 문제행동은';
// 지시문(문서 원문 요약) — 목표행동을 구체적으로 정하고, '적절한 답'이 아니라 실제 빈도를 평정.
export const QABF_INSTRUCTION =
  'QABF는 특정 문제행동이 어떤 상황에서, 어떤 기능과 관련되어 나타나는지를 간접적으로 파악하는 질문지입니다. ' +
  '먼저 관심 있는 한 가지 목표행동을 구체적으로 정하세요(예: "공격적이다"보다 "옆 친구의 팔을 손으로 때린다"). ' +
  '각 문항은 \u201c어떤 대답이 적절한가\u201d가 아니라 그 행동이 실제로 얼마나 자주 나타나는지를 표시합니다.';
export const QABF_CITATION = 'Vollmer & Matson(1995) · 최진혁 번역';

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

// 0719 피드백: 원척도처럼 '전혀 아님(0)'과 'X 해당없음(관찰 기회 없음)'을 구분한다.
// X는 -2로 저장 — 점수 계산(qabfScores)에서는 제외되고, 응답 완료로는 집계된다.
export const QABF_SCALE = [0, 1, 2, 3];
export const QABF_SCALE_LABELS = { 0: '전혀 없음', 1: '드물게 나타남', 2: '때때로 나타남', 3: '자주 나타남' };
export const QABF_NA = -2; // X · 해당없음
export const QABF_NA_LABEL = 'X · 해당 없음';
// 응답 여부(미응답 -1만 제외 — X는 응답으로 집계)
export const qabfAnswered = (v) => v >= 0 || v === QABF_NA;

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
