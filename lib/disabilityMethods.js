// 장애영역별 기본 교육방법 — 단일 출처 (0902 피드백).
//
// 이전에는 IepPage.jsx 안에 자폐·지적·ADHD 3개만 하드코딩돼 있었고, 나머지 영역은
// 전부 같은 기본 세트를 받았다. 또 이름이 EBP 카탈로그(lib/ebp.js 27가지)와 달라
// 규칙 초안(비EBP 이름)과 AI 생성(EBP 이름) 사이에 표기가 어긋났다.
//
// 이 파일이 규칙 초안 · "기본 전략으로 채우기" 버튼 · AI 월별 생성 프롬프트가 함께 읽는
// 한 곳이다. 영역 이름은 lib/disability.js DISABILITIES(장특법 11개)와 맞춘다.
//
// 항목 구성:
//   ebp     — 핵심 교수전략. 이름은 lib/ebp.js EBP_CATALOG의 n 값과 정확히 같아야 한다
//             (예외: '직접교수'는 27가지 목록에 없지만 학습·지적장애의 핵심이라 그대로 둔다).
//   support — 교수전략이 아닌 지원·조정(환경·자료·보조공학). 교육방법 서술의 보조 재료.
//
// DTT·자연적 중재(0902): 두 방법은 EBP 카탈로그에 있었지만 어떤 매핑에도 없어 실제로는
// 거의 선택되지 않았다. 여기서는 "습득 초기 = 비연속 시행 훈련(DTT), 유지 = 일과 삽입 교수,
// 일반화 = 자연적 중재" 흐름(TEACH_SCENES)으로 점증 사다리와 같은 축에 묶는다.

import { splitDisability } from './disability';

export const DISABILITY_METHODS = {
  지적장애: {
    ebp: ['과제분석', '촉진', '모델링', '비연속 시행 훈련(DTT)', '자연적 중재(교수)', '강화'],
    support: ['반복·분산 연습', '쉬운 지시어'],
  },
  자폐성장애: {
    ebp: ['시각적 지원', '과제분석', '사회적 담화(사회적 이야기)', '비연속 시행 훈련(DTT)', '자연적 중재(교수)', '중심축반응훈련(PRT)', '강화'],
    support: ['공간·일과 구조화', '감각 자극 조정'],
  },
  정서행동장애: {
    ebp: ['차별강화', '자기관리전략', '사회적기술훈련', '배경 및 선행사건 기반 중재', '기능적 의사소통 훈련(FCT)'],
    support: ['명확한 규칙 안내', '선택 기회 제공', '체크인·체크아웃(CICO) 연계'],
  },
  의사소통장애: {
    ebp: ['자연적 중재(교수)', '모델링', '시간지연', '그림교환 의사소통 체계(PECS)', '촉진'],
    support: ['말 모델 확장', '반응 기다리기', '보완대체의사소통(AAC) 자료'],
  },
  학습장애: {
    ebp: ['직접교수', '자기관리전략', '촉진', '강화'],
    support: ['누적 복습', '과제량 조정', '읽기 보조 자료'],
  },
  발달지체: {
    ebp: ['자연적 중재(교수)', '모델링', '촉진', '시각적 지원', '구조화된 놀이 집단'],
    support: ['놀이·일과 삽입 교수'],
  },
  시각장애: {
    ebp: ['과제분석', '촉진', '모델링', '시간지연'],
    support: ['촉각·청각 자료', '점자·확대 자료', '보행 안전 확보', '촉각 시범(손 위 손 안내)'],
  },
  청각장애: {
    ebp: ['시각적 지원', '모델링', '비디오모델링', '촉진'],
    support: ['수어·구어·문자 병행', '자리 배치(입모양·판서 보이게)', '보청기·FM 시스템 점검'],
  },
  지체장애: {
    ebp: ['과제분석', '촉진', '테크놀로지 보조 교수 및 중재', '강화'],
    support: ['부분참여 원리', '자세·보조기기 지원', '수행 시간 연장'],
  },
  건강장애: {
    ebp: ['테크놀로지 보조 교수 및 중재', '강화', '자기관리전략'],
    support: ['짧은 활동·휴식 배치', '결석 대비 원격 자료', '과제량 조정'],
  },
  '두 가지 이상의 중복장애': {
    ebp: ['과제분석', '촉진', '시각적 지원', '테크놀로지 보조 교수 및 중재'],
    support: ['부분참여 원리', '보조공학', '자세 지원'],
  },
};

// 구 목록 값(ADHD·주의력 등)이 저장돼 있는 학생을 위한 호환 매핑 — 새로 선택할 수는 없다.
const LEGACY = {
  ADHD: { ebp: ['강화', '자기관리전략', '시각적 지원', '촉진'], support: ['짧은 활동 단위', '즉각 강화'] },
};

// 어떤 영역에도 안 맞을 때(미지정·옛 값)의 안전한 기본 세트.
export const DEFAULT_METHODS = { ebp: ['모델링', '직접교수', '과제분석', '강화'], support: [] };

// 교수 장면 점증(0902): 습득 → 유지 → 일반화. 규칙 초안의 구간 phase·AI 프롬프트가 공유.
export const TEACH_SCENES = [
  { label: '습득 초기', scene: '구조화된 1:1 시행(비연속 시행 훈련, DTT)으로 정확한 반응 만들기' },
  { label: '습득 후기', scene: '구조화된 시행에 일과 속 짧은 연습(삽입 교수)을 더해 반복하기' },
  { label: '유지', scene: '일과·활동 속에서 자연스럽게 기회를 만들어 연습하기(자연적 중재)' },
  { label: '일반화', scene: '자연적 중재로 장소·사람·자료를 바꿔 스스로 하는지 확인하기' },
];

function entryFor(name) {
  const d = String(name || '').trim();
  if (!d) return null;
  if (DISABILITY_METHODS[d]) return DISABILITY_METHODS[d];
  // 부분 일치(옛 표기 '자폐', '지적', '정서·행동장애' 등)
  const key = Object.keys(DISABILITY_METHODS).find((k) => d.includes(k.replace('장애', '')) || k.includes(d));
  if (key) return DISABILITY_METHODS[key];
  if (d.includes('주의') || d.toUpperCase().includes('ADHD')) return LEGACY.ADHD;
  return null;
}

/** 결합값('지적장애·자폐성장애')이면 주 장애 순서로 합집합. 매칭 없으면 기본 세트. */
export function methodsForType(disability) {
  const out = [];
  for (const p of splitDisability(disability)) {
    const e = entryFor(p);
    if (e) out.push(...e.ebp);
  }
  return out.length ? [...new Set(out)] : [...DEFAULT_METHODS.ebp];
}

/** 지원·조정 목록(주 장애 순서 합집합). */
export function supportsForType(disability) {
  const out = [];
  for (const p of splitDisability(disability)) {
    const e = entryFor(p);
    if (e) out.push(...e.support);
  }
  return [...new Set(out)];
}

// 과제분석 목표: 기본값에 결합 EBP를 더한다(촉진 체계에 맞춰 1개 추가).
const PROMPT_SYSTEM_EBP = { td: '시간지연', slp: '촉진', sim: '촉진' };
export function methodsForTask(disability, promptSystem) {
  const add = ['과제분석', '비디오모델링', '시각적 지원'];
  if (PROMPT_SYSTEM_EBP[promptSystem]) add.push(PROMPT_SYSTEM_EBP[promptSystem]);
  return [...new Set([...methodsForType(disability), ...add])];
}

/** AI 프롬프트 주입용 블록 — 이 학생 장애영역의 기본 교수전략·지원을 알려주고, 핵심 방법을 고정하라고 지시. */
export function buildDisabilityMethodBlock(disability) {
  const d = String(disability || '').trim();
  if (!d) return '';
  const ebp = methodsForType(d);
  const sup = supportsForType(d);
  return (
    `[장애영역 기본 교육방법 — ${d}]\n` +
    `  기본 교수전략: ${ebp.join(', ')}\n` +
    (sup.length ? `  지원·조정: ${sup.join(', ')}\n` : '') +
    `  → 지도전략의 핵심 방법은 이 목록(또는 [학기 교육방법])에서 1~2개를 골라 학기 내내 같은 것을 쓸 것.\n`
  );
}
