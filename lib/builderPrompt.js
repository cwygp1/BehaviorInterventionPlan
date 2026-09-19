// 수업자료 주문서의 요청문(프롬프트) 조립 — 순수 함수. 화면(BuilderPage)과 검사 스크립트가 같이 쓴다.
//
// 0919: 김주현 「특수교육 Prompt Studio V3」의 generate()를 옮겼다(mds/36).
//   - 결과물 칩 하나가 '종류'(지도안·인쇄 시각자료·사회적 이야기·웹앱·IEP/PBS·활동지·통신문·전환평가)를 정하고,
//     종류마다 앞머리(역할)와 꼬리(구성 방식)가 붙는다. 원본은 낱말 검색이라 인쇄용 자료가 웹앱으로 잡히던 문제가
//     있었는데(원본 2026. 8. 수정), 여기서는 칩 → 종류 표(OUTPUT_KIND)로 바로 정한다.
//   - 비어 있는 칸은 원본처럼 "(미지정 — …)" 기본 방향을 적어 AI가 알아서 채우게 한다.
//   - 학생 코드·비식별 요약(앱 고유)은 그대로 둔다.

import { chipText } from './builderCatalog.js';

/** 결과물 칩 → 종류. 표에 없으면 'default'. */
export const OUTPUT_KIND = {
  '📜 특수교육 지도안': 'plan',
  '👩‍🏫 협력교수 계획안': 'plan',
  '🃏 PECS 카드': 'print',
  '🚦 시각 규칙판': 'print',
  '⏳ 전환 지원': 'print',
  '🗂 과제분석 카드': 'print',
  '📈 데이터 양식': 'print',
  '📖 사회적 이야기': 'story',
  '🎮 학습 게임 HTML': 'web',
  '🖼 그림 퀴즈 HTML': 'web',
  '💬 AAC 보드 HTML': 'web',
  '📅 시각 일과표': 'web',
  '😊 감정 조절 HTML': 'web',
  '🪙 토큰 경제 HTML': 'web',
  '🔗 매칭 게임 HTML': 'web',
  '🔢 수 개념 HTML': 'web',
  '💰 기능적 수학 HTML': 'web',
  '🏪 지역사회 시뮬 HTML': 'web',
  '✅ 과제분석 앱 HTML': 'web',
  '🌀 감각통합 도구 HTML': 'web',
  '📦 TEACCH 워크박스 HTML': 'web',
  '📋 IEP 목표 초안': 'iep',
  '📊 행동지원계획(PBS)': 'iep',
  '✏️ 수정 활동지': 'sheet',
  '📬 가정연계 통신문': 'letter',
  '👨‍👩‍👧 보호자 안내': 'letter',
  '🎓 전환평가 계획': 'transition',
};

export const WEB_KINDS = new Set(['web', 'story']);

/** 종류별 앞머리(역할)와 꼬리(구성 방식). 원본 V3 문구. */
export const KIND_GUIDE = {
  plan: {
    intro: '당신은 2022 개정 특수교육 기본 교육과정에 정통한 교수설계 전문가입니다. 특수학급·통합학급·특수학교 현장에서 바로 활용 가능한 수업 지도안을 작성해주세요.',
    tail: '📋 지도안 구성 방식\n- 단원명·학습목표·성취기준(2022 개정 기본 교육과정)을 명확히 제시\n- 학생 현재 수행 수준을 독립·촉진 수준으로 구체적으로 기술\n- 교육과정 수정 방법(간소화·축소·대체 등)을 선택하고 이유 명시\n- 수업 단계(도입-전개-정리)별로 시간 배분과 교사(T)-학생(S) 대화 예시 포함\n- 교수·학습 자료 목록과 평가 체크리스트(독립/언어촉진/신체촉진/미수행) 포함\n- 가정 일반화 방법 안내\n- 마크다운 표와 헤더로 한눈에 보기 좋게 정리',
  },
  print: {
    intro: '당신은 특수교육 시각 지원 자료 디자이너입니다. 교실에서 바로 인쇄해 사용할 수 있는 HTML 기반 시각 자료를 만들어주세요.',
    tail: '📋 시각 자료 구성 방식\n- 단일 HTML 파일, 인쇄 친화적 A4 레이아웃\n- 카드형 자료: 큰 이모지/아이콘 + 짧은 한국어 라벨, 잘라 쓸 수 있도록 절단선 포함\n- 기록·체크 양식: 교사가 손으로 적을 수 있는 넉넉한 칸의 표, 날짜·회기·관찰자 기입란 포함\n- 고대비 색상, 큰 글씨(최소 24pt · 표 안 글씨는 12pt 이상)\n- @media print CSS로 깔끔한 프린트 최적화',
  },
  story: {
    intro: '당신은 Carol Gray의 Social Story 방법론을 정확히 따르는 전문 작가이자 웹 개발자입니다. 학생이 사회적 상황을 이해하고 대처할 수 있는 인터랙티브 Social Story를 single HTML file로 만들어주세요.',
    tail: '📋 Social Story 작성 방식\n- Carol Gray 가이드라인 준수: 지시적 문장 1개 당 서술·조망·긍정 문장 2~5개 비율\n- 1인칭 한국어 작성 ("나는 ~합니다")\n- 각 슬라이드: 큰 이모지 + 1~2문장\n- 슬라이드 수 5~7장 권장\n- 단일 HTML 파일, 큰 NEXT 버튼(60px+)\n- 각 슬라이드 TTS 자동 낭독 (ko-KR, rate:0.8)\n- 부드럽고 진정되는 파스텔 배경\n- 학생이 직접 진행 속도 조절 가능',
  },
  web: {
    intro: '당신은 특수교육 학습자를 위한 접근성 전문 웹 개발자입니다. 학생들이 바로 사용할 수 있는 완성도 높은 인터랙티브 학습 콘텐츠를 single HTML file로 만들어주세요.',
    tail: '📋 코드 작성 방식\n- 단일 HTML 파일로 완성 (HTML + CSS + JavaScript 통합, self-contained)\n- 외부 파일 의존성 없이 즉시 브라우저에서 실행 가능한 production-ready 결과물\n- placeholder·TODO 없이 한 번에 완성된 코드 작성\n- 버튼·클릭 영역 최소 48×48px 이상, 텍스트 최소 18pt 굵은 글씨\n- 고대비 색상 (WCAG 4.5:1 이상)\n- 모든 지시문·피드백에 TTS(Web Speech API, ko-KR, rate:0.8) 적용\n- 모든 버튼에 이모지+텍스트 병행 표시\n- 피드백은 100% 긍정("잘했어요!", "다시 해봐요!" — "틀렸어요" 절대 금지)\n- 자기 속도 진행 (자동 타이머 없음, 학생이 직접 다음 버튼)\n- 성공 시 시각+청각 다감각 축하 애니메이션\n- 교사용 데이터 기록 옵션 포함 (해당 시)\n- 모바일 태블릿 반응형 디자인\n- 한글 폰트(Pretendard 또는 Noto Sans KR) 사용',
  },
  iep: {
    intro: '당신은 특수교육 IEP 작성과 긍정적 행동지원(PBS) 전문가입니다. 한국 특수교육 현장 실정에 맞는 전문적인 문서를 작성해주세요.',
    tail: '📋 IEP·PBS 작성 방식\n- SMART 목표 형식(조건+행동+기준)으로 구체적이고 측정 가능하게\n- 강점 중심(Strengths-based) 언어만 사용 — "~할 수 있다" 긍정 표현\n- 현재 수행 수준을 독립·촉진 수준으로 구체적으로 기술\n- 연간 목표 1개 + 단기 목표(월별) 3~4개로 분리\n- 평가 방법·빈도·담당자 명시\n- 마지막에 데이터 수집 시트 포함 (정반응률, ABC 기록 양식)\n- 마크다운 표 형식으로 작성\n- 교사가 그대로 사용할 수 있도록 완성형으로 출력',
  },
  sheet: {
    intro: '당신은 UDL(보편적 학습 설계)과 교육과정 수정에 정통한 특수교육 전문가입니다. 학생 수준에 맞게 수정된 학습 활동지를 만들어주세요.',
    tail: '📋 활동지 구성 방식\n- 지정된 교육과정 수정 유형(간소화/축소/대체/병행)에 정확히 맞춰 재구성\n- 학생용 활동지: 최대 시각 지원 (이모지+짧은 문장), 선택지 형태 위주\n- 교사용 답안지: 정답·지도 메모·촉진 수준 제안·데이터 수집 칸 포함\n- 학생용과 교사용을 명확히 분리하여 2개 버전 작성\n- 인쇄하기 좋은 A4 1~2쪽 분량\n- 마크다운 형식으로 작성하되 표·체크박스 활용',
  },
  letter: {
    intro: '당신은 가정-학교 파트너십 전문가입니다. 보호자가 쉽게 이해하고 가정에서 실천할 수 있는 따뜻한 어조의 통신문을 작성해주세요.',
    tail: '📋 통신문 구성 방식\n- 전문 용어 없는 쉬운 한국어\n- 오늘의 수업 하이라이트 (이모지 bullet)\n- 학생 강점·칭찬 포인트 (구체적, 강점 중심)\n- 가정에서 연습하는 방법 (step-by-step, 보호자 눈높이)\n- 이번 주 IEP 목표 진전도 (이모지 그래프)\n- 소통 요청사항\n- 마크다운 형식, 따뜻하고 친근한 어조',
  },
  transition: {
    intro: '당신은 특수교육 전환교육(Transition) 전문가입니다. 고등 특수교육 학생의 진로·자립·성인 삶 준비도를 평가하는 체계적인 문서를 작성해주세요.',
    tail: '📋 전환평가 구성 방식\n- 영역별 평가: 진로·직업 기술 / 자립생활 / 지역사회 / 여가·대인관계\n- 각 영역 체크리스트 (독립/부분지원/전면지원)\n- 학생 선호도·강점 조사\n- 전환 목표 도출 가이드\n- 필요 서비스·지원 연결 정보\n- 마크다운 표 형식',
  },
  default: {
    intro: '당신은 2022 개정 특수교육 기본 교육과정에 정통한 전문가입니다. 학생 수준에 맞는 고품질 특수교육 콘텐츠를 만들어주세요.',
    tail: '📋 출력 방식\n- 상황에 가장 적절한 형식으로 (HTML 또는 마크다운) 완성형 출력\n- placeholder 없이 바로 사용 가능한 자료\n- 시각 지원(이모지+텍스트) 필수',
  },
};

const PRINCIPLES = [
  '강점 중심 언어만 사용 — "장애학생" 금지, "학생"으로 통일',
  '모든 시각 요소에 이모지+텍스트 병행',
  '피드백은 100% 긍정 — "틀렸어요" 절대 금지 ("다시 해봐요!" 사용)',
  '웹앱은 TTS(ko-KR, rate:0.8) 반드시 포함',
  '한국 학교 문화·교육 맥락 반영',
  '학생 실명·민감정보 금지 — 학생은 코드(익명 ID)로만 표기',
  '위 명세 중 비어있는 항목은 가장 적절하다고 판단되는 방향으로 자연스럽게 처리',
  '한 번에 완성된 결과물 제공 (단계별 설명 없이 바로 결과물부터)',
  '교사가 검토·수정 후 사용함을 전제',
];

/** 결과물 칩 → 종류 이름. 선택이 없으면 'default'. */
export function kindOf(outputs = []) {
  const first = (outputs || [])[0];
  return (first && OUTPUT_KIND[first]) || 'default';
}

/** 한 항목 줄 — 칩 하나면 한 줄, 여럿이면 하위 점으로. */
function field(name, labels = []) {
  const items = (labels || []).map(chipText).filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return `- ${name}: ${items[0]}\n`;
  return `- ${name}:\n${items.map((t) => `  · ${t}`).join('\n')}\n`;
}

function section(title, body, fallback) {
  const b = (body || '').replace(/\n+$/, '');
  return `## ${title}\n${b || fallback}\n\n`;
}

/**
 * 요청문 조립.
 * @param {Object} p
 * @param {Object<string,string[]>} p.sels  칸 이름 → 고른 칩 이름 배열
 * @param {string} p.topic                  2-B 수업 주제 & 학습 내용
 * @param {{code?:string, note?:string}|null} p.student  고른 학생(익명 코드·비식별 요약)
 * @returns {string} 비어 있으면 ''.
 */
export function buildBuilderPrompt({ sels = {}, topic = '', student = null } = {}) {
  const picked = Object.values(sels).some((arr) => Array.isArray(arr) && arr.length);
  const topicText = String(topic || '').trim();
  if (!picked && !topicText && !student) return '';

  const outputs = sels['결과물'] || [];
  const kind = kindOf(outputs);
  const g = KIND_GUIDE[kind] || KIND_GUIDE.default;
  const isWeb = WEB_KINDS.has(kind);

  let profile = '';
  if (student?.code) profile += `- 학생 코드(익명): ${student.code}\n`;
  profile += field('장애 유형', sels['장애']);
  profile += field('기능 수준', sels['수준']);
  profile += field('학급 환경', sels['학급환경']);
  if (student?.note) profile += `- 비식별 요약: ${String(student.note).trim()}\n`;
  if (profile) profile += '- 학생 기능 수준에 맞게 어휘·문장 길이·시각 지원 정도를 조절\n';

  let output = field('결과물', outputs);
  if (output && isWeb) output += '- 단일 HTML 파일로 제작 (별도 외부 파일 없이 .html 하나로 완성) — Claude Artifacts에서 즉시 실행 가능하도록\n';

  let curriculum = '';
  curriculum += field('교육과정', sels['교육과정']);
  curriculum += field('핵심역량', sels['핵심역량']);
  curriculum += field('학년군', sels['학년군']);
  curriculum += field('교과', sels['교과']);
  curriculum += field('기능적 생활 영역', sels['기능영역']);

  let design = '';
  design += field('교육과정 수정', sels['교육과정수정']);
  design += field('교수·환경·평가 수정', sels['수정유형']);
  design += field('수업 형태', sels['수업인원']);
  design += field('수업 시간', sels['수업시간']);
  design += field('협력교수', sels['협력교수']);
  design += field('수업 단계별 전략', sels['수업단계']);

  let assess = '';
  assess += field('IEP 목표 형식', sels['IEP목표']);
  assess += field('평가 방법', sels['평가방법']);
  assess += field('일반화 계획', sels['일반화']);

  let pedagogy = '';
  pedagogy += field('근거기반 교수법', sels['EBP']);
  pedagogy += field('촉진·강화 전략', sels['촉진강화']);

  const access = field('접근성·보조공학', sels['접근성']);

  let style = '';
  style += field('UI 스타일', sels['UI스타일']);
  style += field('언어·형식', sels['형식']);

  let p = `${g.intro}\n\n`;
  p += section('👤 학생 프로파일', profile, '(미지정 — UDL 원칙 적용, 다양한 학습자 고려)');
  p += section('🎯 만들 결과물', output, '(미지정 — 아래 조건에 가장 알맞은 형식으로)');
  p += section('📘 교육과정 · 6대 핵심역량 · 학년군 · 교과', curriculum, '(미지정 — 기본 교육과정 원칙 적용)');
  p += section('📚 수업 주제 & 학습 내용', topicText, '(미지정 — 학생 프로파일에 적합한 내용으로 구성)');
  p += section('✂️ 수업 수정 & 설계', design, '(미지정 — 간소화 수정, 1:1 또는 소그룹, 도입-전개-정리 구조)');
  p += section('📋 IEP 목표 & 평가 계획', assess, '(미지정 — 관찰기록 + SMART 목표 형식)');
  p += section('🎓 적용할 교수법', pedagogy, '(미지정 — UDL + 긍정적 강화 + 스캐폴딩)');
  p += section('♿ 접근성 & 보조공학', access, isWeb
    ? '(필수: 큰 터치 영역·TTS·고대비·픽토그램·긍정 피드백)'
    : '(문서·인쇄물: 쉬운 말, 이모지+텍스트 시각 지원, 큰 글씨)');
  p += section('🎨 디자인 & 형식', style, isWeb
    ? '(파스텔 진정 톤, 짧고 쉬운 한국어, 완성형 출력)'
    : '(마크다운 표·헤더, 짧고 쉬운 한국어, 완성형 출력)');
  p += `${g.tail}\n\n`;
  p += '⚠️ 특수교육 필수 원칙 (절대 준수)\n' + PRINCIPLES.map((s) => `- ${s}`).join('\n');
  return p.trim();
}
