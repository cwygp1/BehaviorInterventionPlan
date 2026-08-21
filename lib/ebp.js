// 증거기반실제(EBP) 근거연결 — 발달장애 학습자 증거기반실제 27가지(한국 기준) 카탈로그 +
// 규칙기반 검색기. AI가 BIP·IEP 교육방법을 생성할 때 "근거 있는" 방법을 우선 제시하도록
// 관련 EBP 후보를 골라 프롬프트에 주입한다.
//
// 설계 결정(2026-06-26 심층분석 P7, "한국 기준"):
//   - 출처: 국립특수교육원 IEP 수립 자료 / 변관석 「증거기반실제로…」 / 석이 선생님 블로그(bjs718).
//   - 벡터 임베딩(RAG) 대신 **규칙기반(키워드+기능 매핑) 검색**을 쓴다. 이유:
//     · 앱은 브라우저→LM Studio 직접호출 구조라 추론 시 임베딩 모델 가용성을 보장 못함(오프라인 견고성).
//     · EBP 목록이 27개로 작아 정밀 매핑이 가능하고 결과가 결정적(교사 신뢰·재현성).
//   - 추후 LM Studio /v1/embeddings 가용 시 selectEBP 를 벡터 유사도로 교체 가능(인터페이스 유지).

// ---------------------------------------------------------------------------
// EBP 카탈로그 — 아래 EBP_GROUPS(화면용)와 이름을 공유하는 AI 프롬프트용 축약 데이터.
// ---------------------------------------------------------------------------
// 발달장애 학습자를 위한 증거기반실제(Evidence-Based Practice) 27가지
// 출처: 국립특수교육원 IEP 수립 자료 / 석이 선생님 특수교육 블로그(bjs718)
export const EBP_GROUPS = [
  {
    cat: '① 기본 응용행동분석(ABA) 원리 기반 실제 — 체계적 교수의 주요 하위 방법론',
    items: [
      { n: '강화', d: '새로운 기술을 가르치고 행동을 증가시키기 위해 사용. 정적강화·부적강화로 구분', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444334853' },
      { n: '촉진', d: '목표기술 수행을 돕는 단서·지원 제공. 자극촉진/반응촉진, 최소촉진·최대-최소촉진·점진적 안내', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221443200907' },
      { n: '모델링', d: '목표기술 수행에 대한 시범을 보여주는 방법', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221440641971' },
      { n: '시간지연', d: '독립적 수행을 유도하기 위해 정해진 시간만큼 기다려 주는 방법(고정·점진적 시간지연, 동시촉진)', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444917081' },
      { n: '과제분석', d: '목표기술을 잘게 나누어 단계별로 가르치는 체계적 교수의 핵심', area: '모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444380406' },
    ],
  },
  {
    cat: '② 교수전략',
    items: [
      { n: '시각적 지원', d: '일과 예측·목표기술 수행에 필요한 정보를 시각적으로 제공(그림 자기촉진, 도표조직자, 시각적 일과표)', area: '거의 모든 영역', age: '모든 연령', link: 'https://blog.naver.com/bjs718/221444939795' },
      { n: '비연속 시행 훈련(DTT)', d: '개별시도교수 — 구조화된 장면에서의 1:1 체계적 교수(ABA 기반)', area: '거의 모든 영역(특히 언어)', age: '영유아~초등 특히 효과', link: 'https://blog.naver.com/bjs718/221440608670' },
      { n: '자연적 중재(교수)', d: '자연스러운 환경을 조성해 이루어지는 체계적 교수(예: 강화된 환경중심 언어중재 EMT)', area: '의사소통·사회성', age: '영유아~초등 특히 효과', link: 'https://blog.naver.com/bjs718/221795804276' },
      { n: '부모실행중재', d: '부모가 전문가 코칭을 받아 교수자가 되어 증거기반실제를 자녀에게 지속 실행', area: '거의 모든 영역', age: '영유아~초등 특히 효과', link: 'https://blog.naver.com/bjs718/221441270727' },
      { n: '중심축반응훈련(PRT)', d: '일반화 가능성이 높은 중심축행동(동기·복합단서반응·자기시작·자기관리)을 자연적 상황에서 교수', area: '사회성·의사소통·놀이', age: '영유아~중학교 특히 효과', link: 'https://blog.naver.com/bjs718/221442142866' },
      { n: '스크립트 중재', d: '일과·상황에 대한 대본을 만들어 교육에 활용', area: '사회성·의사소통·직업', age: '거의 모든 연령', link: 'https://blog.naver.com/bjs718/221444350854' },
      { n: '운동', d: '신체활동을 통해 건강 증진 및 문제행동 감소(선행사건 중심 중재로 활용)', area: '신체활동·문제행동 감소', age: '중학교 연령까지 특히 효과', link: 'https://blog.naver.com/bjs718/221440613870' },
    ],
  },
  {
    cat: '③ 테크놀로지 활용',
    items: [
      { n: '테크놀로지 보조 교수 및 중재', d: '목표기술·성과 교수에 첨단기술을 적극 활용하는 교육방법', area: '거의 모든 영역', age: '유아~성인기', link: 'https://blog.naver.com/bjs718/221444912868' },
      { n: '비디오모델링', d: '동영상을 이용해 과제 수행 시범을 제공(비디오 모델링·비디오 프롬팅)', area: '거의 모든 영역', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221444923248' },
    ],
  },
  {
    cat: '④ 사회성·의사소통 관련 중재',
    items: [
      { n: '사회적기술훈련', d: '설명-시범-시연(연습)-피드백 순서로 사회성 기술을 명시적으로 교수', area: '사회성·의사소통·놀이', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221444369647' },
      { n: '또래매개교수 및 중재', d: '비장애 또래가 교수자·촉진자가 되어 교육 제공(또래교수, 또래관계망중재, 또래지원배치)', area: '사회성·학업·적응·직업', age: '유아~중학생 특히 효과', link: 'https://blog.naver.com/bjs718/221441420977' },
      { n: '사회적 담화(사회적 이야기)', d: '사회적 상황과 적절한 행동의 예를 글·그림으로 알기 쉽게 제시해 읽도록 함', area: '사회성·의사소통·적응', age: '유아~고등학생 특히 효과', link: 'https://blog.naver.com/bjs718/221444365322' },
      { n: '구조화된 놀이 집단', d: '소집단 내 놀이활동을 구조화된 상황에서 제공해 목표행동을 학습', area: '사회성·의사소통·놀이', age: '유아~초등학생', link: 'https://blog.naver.com/bjs718/221444375751' },
      { n: '그림교환 의사소통 체계(PECS)', d: '그림카드 교환으로 교환 개념과 요구언어를 가르치는 ABA 기반 AAC', area: '사회성·의사소통·공동관심', age: '유아~중학생 특히 효과', link: 'https://blog.naver.com/bjs718/221441470618' },
    ],
  },
  {
    cat: '⑤ 긍정적 행동중재 및 지원(PBIS) — 문제행동 중재에 초점',
    items: [
      { n: '기능적행동평가(FBA)', d: '문제행동의 원인(기능)을 파악하기 위한 체계적 절차(면담, 구조화 설문지, 관찰: 산점도·ABC체크리스트)', area: '사회성·의사소통·행동·적응', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221440622431' },
      { n: '배경 및 선행사건 기반 중재', d: '문제행동에 선행하는 배경·선행사건을 수정하는 예방적 중재(예: 비유관 강화)', area: '사회성·의사소통·행동·적응', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221440441553' },
      { n: '소거', d: '문제행동을 강화하는 요인을 제거(차별강화와 함께 사용 시 더 효과적)', area: '의사소통·행동·적응', age: '유아~고등학생 특히 효과', link: 'https://blog.naver.com/bjs718/221440618226' },
      { n: '반응 가로막기/재지시', d: '문제행동의 발생을 물리적·언어적으로 제지(예: 자해 시 입을 적절히 막아 행동 억제)', area: '사회성·의사소통·행동·적응', age: '영유아기 특히 효과(성인기 적용 가능)', link: 'https://blog.naver.com/bjs718/221444344416' },
      { n: '차별강화', d: '바람직한 행동은 강화, 부적절한 행동은 무시(타DRO·저빈도DRL·대체DRA·상반DRI)', area: '거의 모든 영역', age: '영유아~성인기', link: 'https://blog.naver.com/bjs718/221440601624' },
      { n: '기능적 의사소통 훈련(FCT)', d: '문제행동을 대체하는 적절한 의사소통 행동을 교육(대체행동 차별강화와 연합)', area: '사회성·의사소통·행동·적응', age: '영유아~고등학생 특히 효과', link: 'https://blog.naver.com/bjs718/221440639972' },
    ],
  },
  {
    cat: '⑥ 인지·행동적 중재',
    items: [
      { n: '자기관리전략', d: '목표설정·자기교수·자기점검·자기평가·자기강화', area: '거의 모든 영역', age: '유아~성인기', link: 'https://blog.naver.com/bjs718/221444356754' },
      { n: '인지행동중재', d: '불합리한 인지적 사고를 논리적으로 논박할 수 있도록 함', area: '행동·정신건강', age: '초등 고학년~성인(주로 고기능 자폐)', link: 'https://blog.naver.com/bjs718/221440445382' },
    ],
  },
];

export const EBP_CATALOG = [
  // ① ABA 원리 기반
  { n: '강화', cat: 'ABA', d: '새로운 기술 교수·행동 증가(정적·부적강화)', area: '모든 영역' },
  { n: '촉진', cat: 'ABA', d: '목표기술 수행을 돕는 단서·지원(최소촉진·최대-최소·점진적 안내)', area: '모든 영역' },
  { n: '모델링', cat: 'ABA', d: '목표기술 수행 시범', area: '모든 영역' },
  { n: '시간지연', cat: 'ABA', d: '독립 수행 유도를 위해 정해진 시간 기다림(고정·점진적 시간지연, 동시촉진)', area: '모든 영역' },
  { n: '과제분석', cat: 'ABA', d: '목표기술을 잘게 나눠 단계별로 교수(체계적 교수 핵심·연쇄)', area: '모든 영역' },
  // ② 교수전략
  { n: '시각적 지원', cat: '교수전략', d: '시각적 일과표·그림 자기촉진·도표조직자로 정보 제공', area: '거의 모든 영역' },
  { n: '비연속 시행 훈련(DTT)', cat: '교수전략', d: '구조화된 1:1 체계적 교수(ABA)', area: '거의 모든 영역(특히 언어)' },
  { n: '자연적 중재(교수)', cat: '교수전략', d: '자연스러운 환경 조성 체계적 교수(EMT 등)', area: '의사소통·사회성' },
  { n: '부모실행중재', cat: '교수전략', d: '부모가 코칭 받아 교수자가 되어 EBP 지속 실행', area: '거의 모든 영역' },
  { n: '중심축반응훈련(PRT)', cat: '교수전략', d: '동기·자기시작 등 중심축행동을 자연적 상황에서 교수', area: '사회성·의사소통·놀이' },
  { n: '스크립트 중재', cat: '교수전략', d: '일과·상황 대본을 만들어 교수', area: '사회성·의사소통·직업' },
  { n: '운동', cat: '교수전략', d: '신체활동으로 문제행동 감소(선행사건 중심 중재)', area: '신체활동·문제행동 감소' },
  // ③ 테크놀로지
  { n: '테크놀로지 보조 교수 및 중재', cat: '테크놀로지', d: '첨단기술을 활용한 목표기술 교수', area: '거의 모든 영역' },
  { n: '비디오모델링', cat: '테크놀로지', d: '동영상으로 과제 수행 시범(비디오 모델링·프롬팅)', area: '거의 모든 영역' },
  // ④ 사회성·의사소통
  { n: '사회적기술훈련', cat: '사회성·의사소통', d: '설명-시범-시연-피드백으로 사회성 명시적 교수', area: '사회성·의사소통·놀이' },
  { n: '또래매개교수 및 중재', cat: '사회성·의사소통', d: '비장애 또래가 교수자·촉진자(또래교수·관계망·지원배치)', area: '사회성·학업·적응·직업' },
  { n: '사회적 담화(사회적 이야기)', cat: '사회성·의사소통', d: '사회적 상황·적절한 행동을 글·그림으로 제시해 읽힘', area: '사회성·의사소통·적응' },
  { n: '구조화된 놀이 집단', cat: '사회성·의사소통', d: '구조화된 소집단 놀이로 목표행동 학습', area: '사회성·의사소통·놀이' },
  { n: '그림교환 의사소통 체계(PECS)', cat: '사회성·의사소통', d: '그림카드 교환으로 요구언어 교수(ABA 기반 AAC)', area: '사회성·의사소통·공동관심' },
  // ⑤ 긍정적 행동중재 및 지원(PBIS)
  { n: '기능적행동평가(FBA)', cat: 'PBIS', d: '문제행동의 기능 파악(면담·구조화 설문·관찰: 산점도·ABC)', area: '행동·적응' },
  { n: '배경 및 선행사건 기반 중재', cat: 'PBIS', d: '배경·선행사건 수정 예방 중재(비유관 강화 등)', area: '행동·적응' },
  { n: '소거', cat: 'PBIS', d: '문제행동 강화요인 제거(차별강화와 병용 시 효과↑)', area: '의사소통·행동·적응' },
  { n: '반응 가로막기/재지시', cat: 'PBIS', d: '문제행동 발생을 물리적·언어적으로 제지', area: '행동·적응' },
  { n: '차별강화', cat: 'PBIS', d: '바람직한 행동 강화·부적절 행동 무시(DRO·DRL·DRA·DRI)', area: '거의 모든 영역' },
  { n: '기능적 의사소통 훈련(FCT)', cat: 'PBIS', d: '문제행동을 대체하는 의사소통 행동 교수(대체행동 DRA 연합)', area: '행동·의사소통·적응' },
  // ⑥ 인지·행동
  { n: '자기관리전략', cat: '인지·행동', d: '목표설정·자기교수·자기점검·자기평가·자기강화', area: '거의 모든 영역' },
  { n: '인지행동중재', cat: '인지·행동', d: '불합리한 인지를 논리적으로 논박(주로 고기능 자폐)', area: '행동·정신건강' },
];

export const EBP_SOURCE = '국립특수교육원 IEP 수립 자료 · 변관석 「증거기반실제로 발달장애학생 자립생활 가르치기」 · 발달장애 학습자 증거기반실제 27가지';

const byName = (name) => EBP_CATALOG.find((e) => e.n === name) || null;

// QABF 5기능(라벨 부분일치) → 우선 EBP 매핑. (관심/회피/감각·자동/신체적/강화물 획득)
const FUNCTION_MAP = [
  { match: /관심|주의|attention/i, names: ['차별강화', '기능적 의사소통 훈련(FCT)', '사회적기술훈련', '배경 및 선행사건 기반 중재'] },
  { match: /회피|도피|escape|과제/i, names: ['배경 및 선행사건 기반 중재', '과제분석', '시각적 지원', '기능적 의사소통 훈련(FCT)', '촉진'] },
  { match: /감각|자동|비사회|sensory|automatic/i, names: ['배경 및 선행사건 기반 중재', '차별강화', '반응 가로막기/재지시', '운동'] },
  { match: /신체|통증|physical/i, names: ['배경 및 선행사건 기반 중재', '차별강화'] },
  { match: /강화물|물건|tangible|획득/i, names: ['기능적 의사소통 훈련(FCT)', '차별강화', '시각적 지원'] },
];

// 목표 유형 → 기본 추천. task=과제분석(연쇄/촉진), 그 외 일반 교수.
const GOALTYPE_MAP = {
  task: ['과제분석', '촉진', '시간지연', '비디오모델링', '모델링', '강화'],
  rate: ['강화', '촉진', '시각적 지원', '시간지연'],
  qual: ['시각적 지원', '사회적 담화(사회적 이야기)', '자기관리전략', '강화'],
};

const tokenize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 2);

/**
 * 맥락에 맞는 EBP 후보를 점수순으로 고른다(규칙기반).
 * @param {object} opts
 * @param {string} opts.qabfFunction  - QABF 추정 주요기능 라벨(예: '회피')
 * @param {string} opts.goalType      - 'task' | 'rate' | 'qual'
 * @param {string} opts.text          - 행동/목표/성취기준 등 자유 텍스트(키워드 매칭용)
 * @param {number} opts.max           - 최대 개수(기본 5)
 * @returns {Array} EBP_CATALOG 항목 배열
 */
export function selectEBP({ qabfFunction = '', goalType = '', text = '', max = 5 } = {}) {
  const score = new Map(EBP_CATALOG.map((e) => [e.n, 0]));
  const bump = (name, w) => { if (score.has(name)) score.set(name, score.get(name) + w); };

  // 1) 기능 매핑(가중치 큼)
  if (qabfFunction) {
    FUNCTION_MAP.forEach((m) => { if (m.match.test(qabfFunction)) m.names.forEach((n, i) => bump(n, 5 - i * 0.3)); });
  }
  // 2) 목표 유형 매핑
  const gt = GOALTYPE_MAP[goalType];
  if (gt) gt.forEach((n, i) => bump(n, 3 - i * 0.2));
  // 3) 자유 텍스트 키워드 ↔ 항목(이름+설명+영역) 겹침
  const toks = tokenize(text);
  if (toks.length) {
    EBP_CATALOG.forEach((e) => {
      const hay = `${e.n} ${e.d} ${e.area}`.toLowerCase();
      let hit = 0;
      toks.forEach((t) => { if (hay.includes(t)) hit += 1; });
      if (hit) bump(e.n, Math.min(hit, 3) * 1.2);
    });
  }
  // 아무 신호도 없으면 보편적으로 안전한 기본 세트.
  const ranked = [...score.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([n]) => byName(n));
  if (!ranked.length) return ['강화', '촉진', '시각적 지원', '과제분석', '차별강화'].slice(0, max).map(byName).filter(Boolean);
  return ranked.slice(0, max).filter(Boolean);
}

/**
 * 선택된 EBP 목록을 프롬프트 주입용 텍스트 블록으로.
 * AI에게 "근거 있는 방법을 우선 쓰되 학생 맥락에 맞게 풀어쓰라"고 지시한다.
 */
export function buildEbpBlock(items, { title = '증거기반실제(EBP) 후보' } = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  const body = list.map((e) => `· ${e.n} — ${e.d}`).join('\n');
  return (
    `[${title} — 한국 기준, ${EBP_SOURCE}]\n${body}\n` +
    `위 EBP 중 이 학생·행동에 적합한 방법을 우선 선택해 교육방법에 반영하되, "기법 이름"만 나열하지 말고 ` +
    `학생 맥락에 맞게 실제 적용 방법을 풀어서 구체적으로 서술할 것.\n`
  );
}

/** 행동(BIP)용 편의 함수 — 기능+행동 텍스트로 EBP 블록 한 번에 생성. */
export function ebpBlockForBehavior({ qabfFunction = '', behaviorText = '', max = 5 } = {}) {
  return buildEbpBlock(selectEBP({ qabfFunction, text: behaviorText, max }), { title: '행동중재 증거기반실제(EBP) 후보' });
}

/** IEP 교육방법용 편의 함수 — 목표유형+목표 텍스트로 EBP 블록 생성. */
export function ebpBlockForGoal({ goalType = '', goalText = '', qabfFunction = '', max = 5 } = {}) {
  return buildEbpBlock(selectEBP({ goalType, qabfFunction, text: goalText, max }), { title: 'IEP 교육방법 증거기반실제(EBP) 후보' });
}

// 0819 감사: EBP_GROUPS(화면용 — 링크·연령 포함)와 EBP_CATALOG(AI 프롬프트용 — 짧은 설명)는
// 용도가 달라 설명문을 각각 두지만, **항목 이름은 반드시 일치**해야 한다(한쪽만 추가·개명되면 드리프트).
// 개발 중 불일치가 생기면 콘솔로 즉시 알린다.
if (process.env.NODE_ENV !== 'production') {
  const uiNames = EBP_GROUPS.flatMap((g) => g.items.map((i) => i.n));
  const aiNames = EBP_CATALOG.map((e) => e.n);
  const onlyUI = uiNames.filter((n) => !aiNames.includes(n));
  const onlyAI = aiNames.filter((n) => !uiNames.includes(n));
  if (onlyUI.length || onlyAI.length) {
    // eslint-disable-next-line no-console
    console.warn('[ebp] EBP 목록 불일치 — 화면 전용:', onlyUI, '/ AI 전용:', onlyAI);
  }
}
