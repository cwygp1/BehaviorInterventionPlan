import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { useStudents } from '../../contexts/StudentContext';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';

// ──────────────────────────────────────────────────────────────────────
// CATEGORIES — Full Prompt Studio V2 chip system, organized by tab
// ──────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: '0', title: '0. 학생 프로파일', required: '권장',
    groups: [
      { sub: '🩺 장애 유형', cat: '장애', items: ['🧠 지적장애', '🔵 자폐스펙트럼(ASD)', '♿ 지체장애', '👂 청각장애', '👁 시각장애', '💛 정서행동장애', '📖 학습장애', '⚡ ADHD', '🌱 발달지연', '🤝 중복중증'] },
      { sub: '📊 기능 수준', cat: '수준', items: ['🟢 입문', '🟡 기초', '🟠 중급', '🔴 기능적', '🔵 심화'] },
      { sub: '🏫 학급 환경', cat: '학급환경', items: ['🏠 특수학급', '🌐 통합학급', '🎒 특수학교', '🏡 순회/재가'] },
    ],
  },
  {
    id: '1', title: '1. 결과물 형태', required: '★ 필수 · 한 가지만 선택',
    groups: [
      { sub: '🖥 인터랙티브 웹 앱 (HTML 단일 파일)', cat: '결과물', items: ['🎮 학습 게임 HTML', '🖼 그림 퀴즈 HTML', '💬 AAC 보드 HTML', '📖 사회적 이야기', '📅 시각 일과표', '😊 감정 조절 HTML', '🪙 토큰 경제 HTML', '🔗 매칭 게임 HTML', '🔢 수 개념 HTML', '🏪 지역사회 시뮬 HTML', '✅ 과제분석 앱 HTML'] },
      { sub: '📄 문서 / 양식 (Markdown · 인쇄)', cat: '결과물', items: ['📜 특수교육 지도안', '👩‍🏫 협력교수 계획안', '✏️ 수정 활동지', '📋 IEP 목표 초안', '📊 행동지원계획(PBS)', '📬 가정연계 통신문', '📈 데이터 양식', '👨‍👩‍👧 보호자 안내'] },
      { sub: '🖼 시각 지원 자료 (인쇄용)', cat: '결과물', items: ['🃏 PECS 카드', '🚦 시각 규칙판', '⏳ 전환 지원', '🗂 과제분석 카드'] },
    ],
  },
  {
    id: '2', title: '2. 교육과정 & 수업 내용', required: '핵심 추가',
    groups: [
      { sub: '📘 2-A 교육과정 유형 (2022 개정)', cat: '교육과정', items: ['📗 기본 교육과정', '📘 공통 교육과정', '📙 선택 중심 교육과정', '📒 IEP 기반 개별화'] },
      { sub: '🏫 학년군', cat: '학년군', items: ['🧡 유치원', '1~2학년', '3~4학년', '5~6학년', '중학교', '고등학교'] },
      { sub: '📚 교과', cat: '교과', items: ['📗 국어', '📘 수학', '📙 사회', '🔬 과학', '🏃 체육', '🎵 음악', '🎨 미술', '🔧 실과', '💼 진로와직업', '💻 정보통신', '🌍 생활영어', '🏥 보건', '💚 도덕', '🌟 창체'] },
      { sub: '🎯 기능적 생활 영역', cat: '기능영역', items: ['🗣 의사소통', '🏠 일상생활(ADL)', '🤝 사회성', '🏙 지역사회', '✊ 자기결정', '🎲 여가'] },
    ],
  },
  {
    id: '3', title: '3. 수업 수정 & 설계', required: '★',
    groups: [
      { sub: '✂️ 3-A 교육과정 수정 유형', cat: '교육과정수정', items: ['⬆️ 확대', '⬇️ 축소', '🔄 대체', '✂️ 간소화', '↔️ 병행'] },
      { sub: '🔧 교수·환경·평가 수정', cat: '수정유형', items: ['🎓 교수법 수정', '🏫 환경 수정', '📝 평가 수정', '📱 보조공학(AT)'] },
      { sub: '👤 3-B 수업 인원', cat: '수업인원', items: ['👤 1:1 개별', '👥 소그룹', '🏫 학급 전체'] },
      { sub: '⏱ 수업 시간', cat: '수업시간', items: ['⏱ 20분', '⏱ 40분', '⏱ 45분'] },
      { sub: '🤝 협력교수 (Co-teaching)', cat: '협력교수', items: ['교수-보조', '평행교수', '스테이션 교수', '팀티칭'] },
      { sub: '📐 수업 단계별 전략', cat: '수업단계', items: ['🚪 도입 전략', '📖 전개 전략', '🎯 정리 전략'] },
    ],
  },
  {
    id: '4', title: '4. IEP 목표 & 평가 계획', required: '신규',
    groups: [
      { sub: '📋 IEP 목표 형식', cat: 'IEP목표', items: ['📐 조건-행동-기준', '🎯 SMART', '📆 연간·단기 분리', '📋 PLAAFP(현재 수행 수준)'] },
      { sub: '📊 평가 방법', cat: '평가방법', items: ['👁 관찰 기록', '✅ 수행 기반', '📂 포트폴리오', '🔄 과정 중심', '📈 데이터 수집'] },
      { sub: '🌐 일반화 계획 (Stokes & Baer)', cat: '일반화', items: ['🏠 장소 일반화', '👥 사람 일반화', '📦 자료 일반화', '👨‍👩‍👧 가정 연계'] },
    ],
  },
  {
    id: '5', title: '5. 특수교육 교수법 (EBP)', required: '',
    groups: [
      { sub: '🔬 근거기반 교수법', cat: 'EBP', items: ['🔬 ABA', '🔁 DTT', '🌈 UDL', '📖 Social Story', '🔗 과제분석', '🃏 PECS', '💚 PBS', '🌀 감각통합', '🎥 비디오모델링', '📊 자기관리', '👫 또래지원(PMI)'] },
      { sub: '🪜 촉진 & 강화 전략', cat: '촉진강화', items: ['🪜 촉진 위계(Prompting Hierarchy)', '⏱ 시간 지연(Time Delay)', '🎁 연속 강화(CRF)', '🪙 토큰 경제', '➡️ Premack 원리'] },
    ],
  },
  {
    id: '6', title: '6. 접근성 & 보조공학 (AT)', required: '',
    groups: [
      { sub: '👁 시각적 접근성', cat: '접근성', items: ['👆 큰 터치', '🔤 큰 글씨', '🎨 고대비'] },
      { sub: '🔊 청각·다감각 지원', cat: '접근성', items: ['🔊 TTS(자동 낭독)', '🖼 픽토그램', '🎉 다감각 피드백'] },
      { sub: '⏸ 학습 흐름 지원', cat: '접근성', items: ['⏸ 자기 속도', '💚 긍정 오류(부드러운 재시도)'] },
      { sub: '📲 하드웨어 / AAC 연계', cat: '접근성', items: ['📲 태블릿', '🖥 전자칠판', '📱 AAC 연계', '🕹 스위치 접근'] },
    ],
  },
  {
    id: '7', title: '7. 디자인 & 형식 옵션', required: '',
    groups: [
      { sub: '🎨 UI 스타일', cat: 'UI스타일', items: ['🌿 파스텔(진정)', '⬛ 고대비', '☀️ 밝은 따뜻', '⬜ 미니멀(산만 최소)', '🐻 캐릭터(동기 유발)'] },
      { sub: '✍️ 언어 & 형식', cat: '형식', items: ['🟢 쉬운 말', '🎉 즉각 칭찬', '💛 부드러운 재시도', '💾 단일파일 오프라인', '🔊 TTS 코드 삽입', '📝 마크다운+교사 메모', '✅ 완성형(즉시 배포)', '💜 특수교육 윤리 준수'] },
    ],
  },
];

// 2-B 기본 틀 칩 — 수업 주제 입력에 자동 추가
const TOPIC_TEMPLATES = [
  { label: '🎯 성취기준 연계', text: '성취기준 코드: [국가교육과정정보센터(ncic.re.kr) 기준 코드 자동 연결]' },
  { label: '🗂 차시·범위', text: '차시: ___차시 / 단원 범위: ___' },
  { label: '📊 현재 수준', text: '학생의 현재 수행 수준: ___' },
  { label: '📋 자료 붙여넣기', text: '교과서·활동지 원문:\n[여기에 붙여넣기]' },
  { label: '💡 관심사 연계', text: '학생 관심사: ___ (이를 활용한 동기 유발 자료 생성)' },
  { label: '🎯 학습 목표', text: '학습 목표: ___\n핵심 어휘: ___' },
];

// ──────────────────────────────────────────────────────────────────────
// 추천 20선 — 완성형 프롬프트 라이브러리
// ──────────────────────────────────────────────────────────────────────
const PRESETS_20 = [
  { id: 1, icon: '🎮', tag: '웹 앱', title: '수세기 학습 게임 (지적장애·기초)', presets: { 장애: ['🧠 지적장애'], 수준: ['🟡 기초'], 결과물: ['🎮 학습 게임 HTML'], 교육과정: ['📗 기본 교육과정'], 학년군: ['1~2학년'], 교과: ['📘 수학'], EBP: ['🔁 DTT'], 접근성: ['🔊 TTS(자동 낭독)', '👆 큰 터치'] }, topic: '주제: 1~5까지 수 세기\n핵심 어휘: 하나~다섯\n현재 수준: 3까지 손가락으로 세기 가능\n학생 관심사: 공룡' },
  { id: 2, icon: '📖', tag: '웹 앱', title: '사회적 이야기 — 수업 시간 앉아 있기', presets: { 장애: ['🔵 자폐스펙트럼(ASD)'], 수준: ['🟠 중급'], 결과물: ['📖 사회적 이야기'], EBP: ['📖 Social Story'], 접근성: ['🔊 TTS(자동 낭독)', '⏸ 자기 속도'] }, topic: '주제: 수업 시간에 앉아 있기\n학생 관심사: 기차\nCarol Gray의 5:1 서술-지시 비율 적용' },
  { id: 3, icon: '😊', tag: '웹 앱', title: '감정 조절 — 감정 온도계 (정서행동)', presets: { 장애: ['💛 정서행동장애'], 수준: ['🟠 중급'], 결과물: ['😊 감정 조절 HTML'], EBP: ['💚 PBS', '📊 자기관리'], 'UI스타일': ['🌿 파스텔(진정)'], 접근성: ['🔊 TTS(자동 낭독)', '⏸ 자기 속도'] }, topic: '주제: 화가 날 때 내 마음 알아차리기\n현재: 화·슬픔 구분 가능\n진정 전략 3가지(호흡·쿨다운·도움 요청) 포함' },
  { id: 4, icon: '🪙', tag: '웹 앱', title: '토큰 경제 시스템', presets: { 결과물: ['🪙 토큰 경제 HTML'], EBP: ['🪙 토큰 경제'], '촉진강화': ['🎁 연속 강화(CRF)'], 접근성: ['🎉 다감각 피드백'] }, topic: '대상 행동: 자리에 앉아 과제 수행\n10토큰 = 선호 활동 5분\n시각 진행 바 + 별/스티커 누적 표시' },
  { id: 5, icon: '💬', tag: '웹 앱', title: 'AAC 보드 — 일상생활 의사소통', presets: { 장애: ['🤝 중복중증'], 수준: ['🟢 입문'], 결과물: ['💬 AAC 보드 HTML'], EBP: ['🃏 PECS'], 접근성: ['🔊 TTS(자동 낭독)', '👆 큰 터치', '📱 AAC 연계'] }, topic: '카테고리: 인사·요구·거부·감정\n각 카테고리당 6개 픽토그램\n클릭 시 TTS 자동 발화' },
  { id: 6, icon: '🃏', tag: '시각', title: 'PECS 카드 세트 (인쇄용)', presets: { 결과물: ['🃏 PECS 카드'], EBP: ['🃏 PECS'], 접근성: ['🖼 픽토그램'] }, topic: '주제: 학교 일과 30종 (등교·수업·점심·하교 등)\n8.5x5cm 카드 형식, 그림+글자\n인쇄 후 코팅·고리 보관용' },
  { id: 7, icon: '🚦', tag: '시각', title: '시각 규칙판 — 학급 약속', presets: { 결과물: ['🚦 시각 규칙판'], 접근성: ['🖼 픽토그램'], 'UI스타일': ['☀️ 밝은 따뜻'] }, topic: '학급 규칙 5가지: 자리에 앉기·차례 지키기·손 들고 말하기·친구 도와주기·정리하기\nA4 1장 인쇄용' },
  { id: 8, icon: '📅', tag: '웹 앱', title: '하루 시각 일과표', presets: { 장애: ['🔵 자폐스펙트럼(ASD)'], 결과물: ['📅 시각 일과표'], 접근성: ['🖼 픽토그램', '⏸ 자기 속도'] }, topic: '하루 7시간 일과(등교~하교)\n각 활동: 시간·이름·픽토그램\n완료 시 체크 + 다음 활동 강조' },
  { id: 9, icon: '🏪', tag: '웹 앱', title: '지역사회 시뮬 — 마트에서 물건 사기', presets: { 장애: ['🧠 지적장애'], 수준: ['🔴 기능적'], 결과물: ['🏪 지역사회 시뮬 HTML'], '기능영역': ['🏙 지역사회'], EBP: ['🔗 과제분석'] }, topic: '시뮬레이션: 마트에서 우유 사기\n과제분석 6단계(입장→찾기→선택→계산→지불→영수증)\n각 단계마다 시각 피드백' },
  { id: 10, icon: '🔢', tag: '웹 앱', title: '수 개념 — 텐프레임 시각화', presets: { 결과물: ['🔢 수 개념 HTML'], 교과: ['📘 수학'], 학년군: ['1~2학년'] }, topic: '주제: 1~10 수 개념 (텐프레임)\n구체물(사과·구슬) 클릭 시 칸 채워짐\n5의 보수 자동 표시' },
  { id: 11, icon: '📜', tag: '문서', title: '특수교육 지도안 — 40분 수업', presets: { 결과물: ['📜 특수교육 지도안'], '수업인원': ['👤 1:1 개별'], '수업시간': ['⏱ 40분'], '수업단계': ['🚪 도입 전략', '📖 전개 전략', '🎯 정리 전략'] }, topic: '단원: ___\n학습 목표: ___\n도입 5분 + 전개 30분 + 정리 5분 구조' },
  { id: 12, icon: '👩‍🏫', tag: '문서', title: '협력교수 계획안 — 통합학급', presets: { 결과물: ['👩‍🏫 협력교수 계획안'], '학급환경': ['🌐 통합학급'], '협력교수': ['교수-보조'] }, topic: '교과: ___ / 차시: ___\n주교사·보조교사 역할 분리\n특수교육 학생 1명 + 일반학급 24명' },
  { id: 13, icon: '✏️', tag: '문서', title: '수정 활동지 — 통합학급 국어', presets: { 장애: ['♿ 지체장애'], 수준: ['🔴 기능적'], 결과물: ['✏️ 수정 활동지'], 교육과정: ['📘 공통 교육과정'], 교과: ['📗 국어'], '교육과정수정': ['✂️ 간소화'], 형식: ['📝 마크다운+교사 메모'] }, topic: '단원: 시 읽기와 감상\n원본 활동지 첨부 (붙여넣기)\n학생용 1장 + 교사용 답안·지도 메모 1장' },
  { id: 14, icon: '📋', tag: '문서', title: 'IEP 목표 초안 — SMART 형식', presets: { 결과물: ['📋 IEP 목표 초안'], 'IEP목표': ['🎯 SMART', '📐 조건-행동-기준'], '평가방법': ['📈 데이터 수집'] }, topic: '대상 영역: ___\n현재 수행 수준(PLAAFP): ___\n장기 목표 1개 + 단기 목표 3개 (SMART)' },
  { id: 15, icon: '📊', tag: '문서', title: '행동지원계획 (PBS)', presets: { 장애: ['💛 정서행동장애'], 결과물: ['📊 행동지원계획(PBS)'], EBP: ['💚 PBS', '🔬 ABA', '📊 자기관리'] }, topic: '문제행동: ___\n발생 상황(A-B-C): ___\n기능 추정: 관심/회피/획득/감각 중 ___\n예방·교수·강화·반응 4영역' },
  { id: 16, icon: '📬', tag: '문서', title: '가정연계 통신문', presets: { 결과물: ['📬 가정연계 통신문'], '일반화': ['👨‍👩‍👧 가정 연계'] }, topic: '오늘 수업: ___\n학생의 변화·성취: ___\n가정 협력 요청: ___\n따뜻한 어조로 작성' },
  { id: 17, icon: '📈', tag: '문서', title: '데이터 수집 양식 (관찰 기록지)', presets: { 결과물: ['📈 데이터 양식'], '평가방법': ['📈 데이터 수집', '👁 관찰 기록'] }, topic: '대상 행동: ___\n측정 지표: 빈도·지속·강도·지연·DBR\n주간 1장(7일×교시), 인쇄용' },
  { id: 18, icon: '⏳', tag: '시각', title: '활동 전환 시각 지원 카드', presets: { 결과물: ['⏳ 전환 지원'], 접근성: ['🖼 픽토그램', '⏸ 자기 속도'] }, topic: '5단계 카드: 활동 종료 5분 전 → 정리 → 다음 활동 안내 → 이동 → 새 활동 시작\nA4 1장, 카드 5장 출력' },
  { id: 19, icon: '🗂', tag: '시각', title: '과제분석 카드 — 손씻기 6단계', presets: { 결과물: ['🗂 과제분석 카드'], EBP: ['🔗 과제분석'], '기능영역': ['🏠 일상생활(ADL)'] }, topic: '주제: 손씻기 6단계\n각 단계: 그림 + 한 줄 설명\n학생이 보면서 따라 할 수 있는 형태' },
  { id: 20, icon: '👨‍👩‍👧', tag: '문서', title: '보호자 안내 매뉴얼 (가정 사용)', presets: { 결과물: ['👨‍👩‍👧 보호자 안내'], '일반화': ['👨‍👩‍👧 가정 연계', '🏠 장소 일반화'] }, topic: '대상 학습 영역: ___\n가정에서 5분만에 할 수 있는 활동 3가지\n학교에서 사용한 카드·신호와 동일하게' },
];

// ──────────────────────────────────────────────────────────────────────
// 학생 유형별 예시 5가지
// ──────────────────────────────────────────────────────────────────────
const STUDENT_EXAMPLES = [
  { icon: '🧠', title: '예시 1 — 지적장애 초3 기초, 수 개념', preset: PRESETS_20[0] },
  { icon: '🔵', title: '예시 2 — 자폐 초2 중급, 사회성', preset: PRESETS_20[1] },
  { icon: '😊', title: '예시 4 — 정서행동 초5 중급, 감정 조절', preset: PRESETS_20[2] },
  { icon: '♿', title: '예시 3 — 지체 중2 기능적, 국어 수정', preset: PRESETS_20[12] },
  { icon: '💼', title: '예시 5 — 지적 고2 기능적, 진로직업', preset: { ...PRESETS_20[8], title: '편의점 물건 정리 (고2 진로직업)' } },
];

// ──────────────────────────────────────────────────────────────────────
// 목적별 추천 조합 6가지
// ──────────────────────────────────────────────────────────────────────
const PURPOSE_RECIPES = [
  { icon: '🎮', title: '바로 쓸 수 있는 웹 학습 자료', steps: ['1번에서 게임/퀴즈/AAC 중 선택', '2-B 주제 한 줄 입력', '6번 TTS·큰터치·다감각 선택', '→ Claude Artifacts에서 바로 실행'] },
  { icon: '📜', title: '수업 지도안 만들기', steps: ['1번 → 특수교육 지도안', '2-A 교육과정+학년군+교과', '2-B 단원명·목표·수행수준 상세히', '3번 수업수정+협력교수+단계별 전략', '4번 평가방법·데이터시트'] },
  { icon: '📋', title: 'IEP 목표 초안 작성', steps: ['1번 → IEP 목표 초안', '0번 장애유형·기능수준 상세히', '2-A 교과 또는 기능영역', '2-B 현재 수행 수준 구체적으로', '4번 SMART·조건-행동-기준'] },
  { icon: '📬', title: '가정연계 통신문 5분 완성', steps: ['1번 → 가정연계 통신문', '2-B 오늘 수업 내용 간단히', '4번 가정 일반화 계획 선택', '→ 나머지 비워도 OK, AI가 따뜻한 어조로 자동 완성'] },
  { icon: '🔗', title: '수정 활동지 (통합학급용)', steps: ['1번 → 수정·보완 활동지', '0번 장애유형·기능수준', '2-A 공통 교육과정+학년군+교과', '2-B 일반 수업 교과서 내용 붙여넣기', '3번 간소화/축소 수정+환경수정'] },
  { icon: '📊', title: '행동지원계획 (PBS)', steps: ['1번 → 행동지원계획(PBS)', '0번 장애유형(EBD/자폐 등)', '2-B 문제행동·발생 상황·기능 추정', '5번 PBS·ABA·자기관리', '4번 ABC 기록·관찰기록'] },
];

const AI_TIPS = [
  { icon: '🔁', title: '반복 대화로 완성도 끌어올리기', desc: '"버튼 더 크게", "문항 10개로", "더 쉬운 말로" 식으로 3~5회 주고받기' },
  { icon: '📋', title: '교과서·활동지 그대로 붙여넣기', desc: '2-B 칸에 교과서 본문·기존 활동지 붙여넣기 가능. 타이핑 불필요' },
  { icon: '💬', title: '학생 관심사 활용', desc: '"공룡을 좋아함", "버스 번호에 관심" 등 추가 시 동기 유발 자료 생성' },
  { icon: '🖥️', title: 'Claude Artifacts 최적화', desc: '웹 앱 계열은 Claude Artifacts 모드에서 즉시 실행. ChatGPT·Gemini는 Canvas 모드' },
  { icon: '💾', title: 'HTML 오프라인 저장', desc: '생성된 HTML을 메모장에 붙여 .html로 저장 → 학교 PC·태블릿·USB 사용' },
];

const AI_WARNINGS = [
  { icon: '⚠️', title: 'AI는 보조 도구', desc: '생성 자료는 반드시 검토·수정 후 사용. IEP 목표·PBS는 전문가 판단 필수.' },
  { icon: '🔒', title: '학생 개인정보 절대 입력 금지', desc: '이름·생년월일·학번 금지. "A학생" 또는 "대상 학생"으로 표기.' },
  { icon: '📋', title: '교육과정 성취기준 대조', desc: 'AI 제시 코드는 오류 가능. ncic.re.kr에서 반드시 확인.' },
  { icon: '🎨', title: '저작권 유의', desc: 'AI 생성 자료라도 상업적 배포·대외 공개 시 주의. 교실 내 사용은 자유.' },
];

// ──────────────────────────────────────────────────────────────────────
// Auto-fill student profile from currently selected student
// ──────────────────────────────────────────────────────────────────────
function findDisabilityChip(disability) {
  if (!disability) return null;
  const items = CATEGORIES[0].groups[0].items; // 장애 chips
  // Match by inclusion of disability text in chip text
  return items.find((it) => it.includes(disability)) || null;
}

function inferGradeChip(student) {
  const note = student?.note || '';
  const level = student?.level || '';
  // Try note first (most specific)
  if (/유치|유아/.test(note)) return '🧡 유치원';
  const m = note.match(/(?:초|초등)\s*(\d+)\s*학년/);
  if (m) {
    const grade = parseInt(m[1], 10);
    if (grade <= 2) return '1~2학년';
    if (grade <= 4) return '3~4학년';
    if (grade <= 6) return '5~6학년';
  }
  if (/중\s*(\d+)|중학/.test(note)) return '중학교';
  if (/고\s*(\d+)|고등|고교/.test(note)) return '고등학교';
  // Fallback to level
  if (level === '중등') return '중학교';
  if (level === '고등') return '고등학교';
  if (level === '유치원') return '🧡 유치원';
  return null; // 초등이면 학년 정보 없으니 사용자 선택에 맡김
}

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────
export default function BuilderPage() {
  const { callDetailed, status } = useLLM();
  const { curStu } = useStudents();
  const toast = useToast();
  const [tab, setTab] = useState('builder'); // 'builder' | 'presets' | 'guide'
  const [selected, setSelected] = useState({}); // { cat: Set(item) }
  const [topic, setTopic] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState(null);
  // Track which chips were auto-set by student selection (so user knows which
  // came from student vs. their own choice).
  const [autoSet, setAutoSet] = useState({ 장애: null, 학년군: null, 학급환경: null });
  const lastStuIdRef = useRef(null);

  // Sync student profile chips whenever the selected student changes.
  // Replaces the previous student's auto-selected chips (장애/학년군/학급환경)
  // but keeps any chip the user manually changed in other categories.
  useEffect(() => {
    if (!curStu) {
      lastStuIdRef.current = null;
      setAutoSet({ 장애: null, 학년군: null, 학급환경: null });
      return;
    }
    if (lastStuIdRef.current === curStu.id) return;
    lastStuIdRef.current = curStu.id;

    const disChip = findDisabilityChip(curStu.disability);
    const gradeChip = inferGradeChip(curStu);
    const envChip = '🏠 특수학급'; // default for special-ed platform

    setSelected((prev) => {
      const next = { ...prev };
      // Replace 장애 with this student's value
      if (disChip) next['장애'] = new Set([disChip]);
      else delete next['장애'];
      // Replace 학년군 if we can infer (otherwise keep user's choice)
      if (gradeChip) next['학년군'] = new Set([gradeChip]);
      // Default 학급환경 only if user hasn't picked anything
      if (!prev['학급환경'] || prev['학급환경'].size === 0) {
        next['학급환경'] = new Set([envChip]);
      }
      return next;
    });
    setAutoSet({ 장애: disChip, 학년군: gradeChip, 학급환경: envChip });
  }, [curStu]);

  function toggle(cat, item) {
    setSelected((prev) => {
      const set = new Set(prev[cat] || []);
      if (set.has(item)) set.delete(item); else set.add(item);
      // For "결과물" (single-select), clear others first
      if (cat === '결과물' && !prev[cat]?.has?.(item)) {
        // Allow only one selection
        return { ...prev, [cat]: new Set([item]) };
      }
      return { ...prev, [cat]: set };
    });
  }

  function isSelected(cat, item) {
    return selected[cat]?.has(item) || false;
  }

  function appendTopic(text) {
    setTopic((cur) => cur ? cur + '\n' + text : text);
  }

  function reset() {
    if (Object.keys(selected).length === 0 && !topic) return;
    if (!window.confirm('모두 지우고 새로 시작할까요?')) return;
    setSelected({});
    setTopic('');
    setAiResult('');
    setAiMeta(null);
  }

  function buildPrompt() {
    const sels = {};
    Object.entries(selected).forEach(([cat, set]) => {
      if (set instanceof Set && set.size) sels[cat] = [...set];
    });
    if (!Object.keys(sels).length && !topic.trim()) return '';

    let p = '당신은 특수교육 전문가이자 맞춤형 수업자료 제작 AI입니다.\n2022 개정 기본교육과정 기준에 맞춰, 아래 조건에 부합하는 수업 자료를 한국어로 제작해 주세요.\n\n';

    if (sels['결과물']) {
      const r = sels['결과물'].join(', ');
      const isHTML = sels['결과물'].some((v) => v.includes('HTML'));
      p += `## 결과물 형태\n${r}\n`;
      if (isHTML) p += '- 단일 HTML 파일로 제작 (별도 외부 파일 없이 .html 하나로 완성)\n- Claude Artifacts에서 즉시 실행 가능하도록\n';
      p += '\n';
    }

    if (sels['장애'] || sels['수준'] || sels['학급환경'] || curStu?.note) {
      p += '## 학생 프로파일\n';
      if (curStu) p += `- 학생 ID(익명): ${curStu.code}\n`;
      if (sels['장애']) p += `- 장애 유형: ${sels['장애'].join(', ')}\n`;
      if (sels['수준']) p += `- 기능 수준: ${sels['수준'].join(', ')}\n`;
      if (sels['학급환경']) p += `- 학급 환경: ${sels['학급환경'].join(', ')}\n`;
      if (curStu?.note) p += `- 비식별 요약: ${curStu.note}\n`;
      p += '- 학생 기능 수준에 맞게 어휘·문장 길이·시각 지원 정도를 조절\n\n';
    }

    if (sels['교육과정'] || sels['학년군'] || sels['교과'] || sels['기능영역']) {
      p += '## 교육과정 & 수업 정보\n';
      if (sels['교육과정']) p += `- 교육과정 유형: ${sels['교육과정'].join(', ')} (2022 개정)\n`;
      if (sels['학년군']) p += `- 학년군: ${sels['학년군'].join(', ')}\n`;
      if (sels['교과']) p += `- 교과: ${sels['교과'].join(', ')}\n`;
      if (sels['기능영역']) p += `- 기능적 생활 영역: ${sels['기능영역'].join(', ')}\n`;
      p += '\n';
    }

    if (sels['교육과정수정'] || sels['수정유형'] || sels['수업인원'] || sels['수업시간'] || sels['협력교수'] || sels['수업단계']) {
      p += '## 수업 수정 & 설계\n';
      if (sels['교육과정수정']) p += `- 교육과정 수정 유형: ${sels['교육과정수정'].join(', ')}\n`;
      if (sels['수정유형']) p += `- 수정 영역: ${sels['수정유형'].join(', ')}\n`;
      if (sels['수업인원']) p += `- 수업 인원: ${sels['수업인원'].join(', ')}\n`;
      if (sels['수업시간']) p += `- 수업 시간: ${sels['수업시간'].join(', ')}\n`;
      if (sels['협력교수']) p += `- 협력교수 유형: ${sels['협력교수'].join(', ')}\n`;
      if (sels['수업단계']) p += `- 수업 단계별 전략: ${sels['수업단계'].join(', ')}\n`;
      p += '\n';
    }

    if (sels['IEP목표'] || sels['평가방법'] || sels['일반화']) {
      p += '## IEP 목표 & 평가 계획\n';
      if (sels['IEP목표']) p += `- IEP 목표 형식: ${sels['IEP목표'].join(', ')}\n`;
      if (sels['평가방법']) p += `- 평가 방법: ${sels['평가방법'].join(', ')}\n`;
      if (sels['일반화']) p += `- 일반화 계획: ${sels['일반화'].join(', ')}\n`;
      p += '\n';
    }

    if (sels['EBP'] || sels['촉진강화']) {
      p += '## 적용 교수법 (EBP)\n';
      if (sels['EBP']) p += `- 근거기반 교수법: ${sels['EBP'].join(', ')}\n`;
      if (sels['촉진강화']) p += `- 촉진·강화 전략: ${sels['촉진강화'].join(', ')}\n`;
      p += '\n';
    }

    if (sels['접근성']) {
      p += `## 접근성 & 보조공학\n- ${sels['접근성'].join(', ')}\n\n`;
    }

    if (sels['UI스타일'] || sels['형식']) {
      p += '## 디자인 & 형식\n';
      if (sels['UI스타일']) p += `- UI 스타일: ${sels['UI스타일'].join(', ')}\n`;
      if (sels['형식']) p += `- 언어 & 형식: ${sels['형식'].join(', ')}\n`;
      p += '\n';
    }

    if (topic.trim()) p += `## 수업 주제 & 학습 내용\n${topic.trim()}\n\n`;

    p += '## 작성 원칙\n- 학생 실명·민감정보 금지 (익명 ID로만)\n- 한국 특수교육 현장에서 즉시 사용 가능한 구체적 형태\n- 교사가 검토·수정 후 사용함을 전제';
    return p;
  }

  async function runAI() {
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    const p = buildPrompt();
    if (!p) { toast('칩을 선택하거나 수업 내용을 입력해주세요.'); return; }
    setAiBusy(true); setAiResult(''); setAiMeta(null);
    try {
      const r = await callDetailed(p);
      setAiResult(r.content);
      setAiMeta({ finish_reason: r.finish_reason, usage: r.usage });
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  function applyPreset(preset) {
    const next = {};
    Object.entries(preset.presets || {}).forEach(([cat, items]) => {
      next[cat] = new Set(items);
    });
    setSelected(next);
    setTopic(preset.topic || '');
    setTab('builder');
    toast('프리셋이 적용되었습니다. 검토 후 사용하세요.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const selectedCount = Object.values(selected).reduce((s, set) => s + (set instanceof Set ? set.size : 0), 0);
  const requiredOk = selected['결과물'] && selected['결과물'].size > 0;

  return (
    <>
      {/* Tab nav */}
      <div className="card" style={{ padding: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { id: 'builder', label: '🛠 프롬프트 빌더', desc: '칩으로 조립' },
            { id: 'presets', label: '⭐ 추천 20선', desc: '완성형 프롬프트' },
            { id: 'guide', label: '📖 가이드', desc: 'Quick Start · 학생 예시 · 팁' },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 8,
                  border: '1px solid ' + (on ? 'var(--pri)' : 'var(--border)'),
                  background: on ? 'var(--pri)' : '#fff',
                  color: on ? '#fff' : 'var(--text)',
                  cursor: 'pointer', fontWeight: on ? 700 : 500,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: '.15s',
                }}
              >
                <span>{t.label}</span>
                <span style={{ fontSize: '.72rem', opacity: 0.8 }}>{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'builder' && (
        <BuilderTab
          curStu={curStu}
          autoSet={autoSet}
          selected={selected}
          isSelected={isSelected}
          toggle={toggle}
          topic={topic}
          setTopic={setTopic}
          appendTopic={appendTopic}
          reset={reset}
          selectedCount={selectedCount}
          requiredOk={requiredOk}
          buildPrompt={buildPrompt}
          runAI={runAI}
          aiBusy={aiBusy}
          aiResult={aiResult}
          aiMeta={aiMeta}
        />
      )}

      {tab === 'presets' && <PresetsTab onApply={applyPreset} />}

      {tab === 'guide' && <GuideTab onApplyExample={applyPreset} />}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Builder tab
// ──────────────────────────────────────────────────────────────────────
function BuilderTab({ curStu, autoSet, selected, isSelected, toggle, topic, setTopic, appendTopic, reset, selectedCount, requiredOk, buildPrompt, runAI, aiBusy, aiResult, aiMeta }) {
  const promptText = useMemo(() => buildPrompt(), [selected, topic, buildPrompt]);
  const [showPreview, setShowPreview] = useState(false);

  // Quick visibility: which auto-selected chips are still active
  const autoActive = autoSet ? Object.entries(autoSet).filter(([cat, val]) => val && selected[cat]?.has(val)) : [];

  return (
    <>
      {/* Student auto-fill notice */}
      {curStu && autoActive.length > 0 && (
        <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.84rem', color: 'var(--pri)', fontWeight: 700 }}>
              📌 학생 정보로 자동 선택됨 · <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4 }}>{curStu.code}</code>
            </span>
            <span style={{ fontSize: '.78rem', color: 'var(--sub)' }}>
              {autoActive.map(([cat, val]) => val.replace(/^[\W_]+\s*/, '')).join(' · ')}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '.74rem', color: 'var(--muted)' }}>
              자유롭게 변경 가능
            </span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="card" style={{ background: requiredOk ? '#e7f7ee' : '#fff7e6', borderColor: requiredOk ? '#9be0b9' : '#f3c47b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '.9rem' }}>
            {requiredOk
              ? <span style={{ color: '#0a7d4e', fontWeight: 700 }}>✅ 필수 항목 OK · 선택 {selectedCount}개</span>
              : <span style={{ color: '#a76200', fontWeight: 700 }}>⚠ 1번 결과물 형태(★ 필수)를 선택하세요 · 선택 {selectedCount}개</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={reset}>🔄 초기화</button>
        </div>
      </div>

      {/* Categories */}
      {CATEGORIES.map((cat) => (
        <div key={cat.id} className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>{cat.title}</div>
            {cat.required && (
              <span style={{ fontSize: '.74rem', color: cat.required.includes('필수') ? '#ef476f' : 'var(--muted)', fontWeight: 600 }}>
                {cat.required}
              </span>
            )}
          </div>
          {cat.groups.map((g, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>{g.sub}</div>
              <div className="qchip-area">
                {g.items.map((it) => {
                  const on = isSelected(g.cat, it);
                  return (
                    <span
                      key={it}
                      className={'qchip' + (on ? ' on' : '')}
                      onClick={() => toggle(g.cat, it)}
                    >{it}</span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* 2-B 수업 주제 — 입력 보조 */}
      <div className="card">
        <div className="card-title">📝 2-B 수업 주제 & 학습 내용 <span style={{ fontSize: '.74rem', color: '#ef476f', fontWeight: 600 }}>★★ 핵심 — 자세할수록 맞춤형!</span></div>
        <div className="card-subtitle">아래 칩을 클릭하면 입력창에 기본 틀이 자동 추가됩니다. 직접 입력도 가능합니다.</div>
        <div className="qchip-area" style={{ marginTop: 10 }}>
          {TOPIC_TEMPLATES.map((t) => (
            <span key={t.label} className="qchip" onClick={() => appendTopic(t.text)}>{t.label}</span>
          ))}
        </div>
        <textarea
          className="form-textarea"
          rows={6}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 손씻기 6단계&#10;핵심 어휘: 비누·물·거품·헹구기·말리기&#10;현재 수준: 1~3단계는 가능, 4~6단계는 신체 촉진 필요&#10;학생 관심사: 공룡 (공룡 그림으로 동기 유발)"
        />
      </div>

      {/* 프롬프트 미리보기 + AI 호출 */}
      <div className="card">
        <div className="card-title">🚀 프롬프트 생성 & AI 호출</div>
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? '▲ 미리보기 숨기기' : '▼ 프롬프트 미리보기'}
          </button>
        </div>
        {showPreview && promptText && (
          <pre style={{ background: 'var(--surface2)', padding: 14, borderRadius: 8, fontSize: '.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', lineHeight: 1.65, maxHeight: 360, overflow: 'auto', marginBottom: 12 }}>
            {promptText}
          </pre>
        )}
        <AIActionBar
          prompt={promptText}
          onCallAI={runAI}
          busy={aiBusy}
          callLabel="🤖 AI에 직접 호출"
          disabled={!promptText}
        />
        {(aiResult || aiBusy) && <PromptResultBlock prompt={promptText} output={aiResult} busy={aiBusy} meta={aiMeta} />}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Presets tab — 추천 20선
// ──────────────────────────────────────────────────────────────────────
function PresetsTab({ onApply }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? PRESETS_20 : PRESETS_20.filter((p) => p.tag === filter);

  return (
    <>
      <div className="card" style={{
        background: 'linear-gradient(135deg, #4f6bed 0%, #9c36b5 100%)',
        color: '#fff', border: 'none',
      }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 6 }}>⭐ 특수교육 Best Prompts 20선</h2>
        <p style={{ fontSize: '.9rem', opacity: 0.95 }}>현장 특수교사가 자주 쓰는 완성형 프롬프트. 카드 클릭 시 빌더에 자동 적용됩니다.</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { v: 'all', l: '전체' }, { v: '웹 앱', l: '🖥 웹 앱' }, { v: '문서', l: '📄 문서' }, { v: '시각', l: '🖼 시각 지원' },
          ].map((f) => (
            <span key={f.v} className={'qchip' + (filter === f.v ? ' on' : '')} onClick={() => setFilter(f.v)}>{f.l}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => onApply(p)}
              style={{
                padding: '14px 16px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
                transition: '.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pri)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '1.4rem' }}>{p.icon}</span>
                <span style={{ background: 'var(--pri-soft)', color: 'var(--pri)', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>#{p.id}</span>
                <span style={{ background: 'var(--surface2)', color: 'var(--sub)', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>{p.tag}</span>
              </div>
              <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6, lineHeight: 1.4 }}>{p.title}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                칩 {Object.values(p.presets).reduce((s, arr) => s + arr.length, 0)}개 + 주제 자동 입력
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Guide tab — Quick Start, 학생 예시, 목적별 추천, AI 팁, 주의사항
// ──────────────────────────────────────────────────────────────────────
function GuideTab({ onApplyExample }) {
  return (
    <>
      <div className="card" style={{
        background: 'linear-gradient(135deg, #12b886 0%, #0d7d4e 100%)',
        color: '#fff', border: 'none',
      }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 6 }}>📖 완전 활용 가이드</h2>
        <p style={{ fontSize: '.9rem', opacity: 0.95 }}>처음 쓰시는 분도, 바쁜 선생님도 5분이면 수업 자료 완성</p>
      </div>

      {/* Quick Start */}
      <div className="card">
        <div className="card-title">🚀 Quick Start — 3단계</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {[
            { n: 1, t: '결과물 형태 선택 (1번)', d: '무엇을 만들 건지 먼저 정해요. 웹 게임? 수업 지도안? 활동지? AAC 보드? 이것만 선택해도 생성 가능!' },
            { n: 2, t: '학생 정보 + 수업 내용 입력', d: '0번 학생 프로파일, 2-A 교육과정, 2-B 수업 내용을 채워요. 주제만 간단히 적어도 OK. 예: "손씻기 6단계"' },
            { n: 3, t: '생성 & 붙여넣기', d: '"AI에 직접 호출" 버튼 클릭하거나, 프롬프트를 복사해서 ChatGPT/Claude/Gemini에 Ctrl+V' },
          ].map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, borderLeft: '4px solid var(--pri)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--pri)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{s.n}</div>
              <div>
                <strong style={{ color: 'var(--pri)' }}>{s.t}</strong>
                <p style={{ fontSize: '.86rem', color: 'var(--sub)', marginTop: 4, lineHeight: 1.6 }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 학생 유형별 예시 5가지 */}
      <div className="card">
        <div className="card-title">👨‍🎓 학생 유형별 예시 5가지</div>
        <div className="card-subtitle">카드 클릭 시 빌더에 해당 예시가 자동 적용됩니다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
          {STUDENT_EXAMPLES.map((ex, i) => (
            <div
              key={i}
              onClick={() => onApplyExample(ex.preset)}
              style={{
                padding: 14, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, cursor: 'pointer', transition: '.15s',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pri)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ fontSize: '2rem', flexShrink: 0 }}>{ex.icon}</div>
              <div>
                <div style={{ fontSize: '.92rem', fontWeight: 700 }}>{ex.title}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>클릭하여 적용</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 목적별 추천 조합 */}
      <div className="card">
        <div className="card-title">🎯 목적별 추천 조합</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 12 }}>
          {PURPOSE_RECIPES.map((r, i) => (
            <div key={i} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '1.3rem' }}>{r.icon}</span>
                <strong style={{ fontSize: '.92rem' }}>{r.title}</strong>
              </div>
              <ol style={{ paddingLeft: 20, fontSize: '.82rem', color: 'var(--sub)', lineHeight: 1.7 }}>
                {r.steps.map((s, si) => <li key={si}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* AI 활용 팁 */}
      <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)' }}>
        <div className="card-title">💡 AI 200% 활용 팁</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {AI_TIPS.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 10, background: '#fff', borderRadius: 8 }}>
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{t.icon}</span>
              <div>
                <strong style={{ color: 'var(--pri)', fontSize: '.88rem' }}>{t.title}</strong>
                <p style={{ fontSize: '.82rem', color: 'var(--sub)', marginTop: 2, lineHeight: 1.6 }}>{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 주의사항 */}
      <div className="card" style={{ background: 'var(--warn-l)', borderColor: '#fde7b8' }}>
        <div className="card-title" style={{ color: '#b45309' }}>⚠ 반드시 알아두세요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {AI_WARNINGS.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 10, background: '#fff', borderRadius: 8 }}>
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{w.icon}</span>
              <div>
                <strong style={{ color: '#b45309', fontSize: '.88rem' }}>{w.title}</strong>
                <p style={{ fontSize: '.82rem', color: '#92400e', marginTop: 2, lineHeight: 1.6 }}>{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
