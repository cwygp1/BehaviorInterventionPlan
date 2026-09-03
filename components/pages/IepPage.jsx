import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import ExternalAIModal from '../ui/ExternalAIModal';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchIEP, saveIEPGoal, deleteIEPGoal, fetchStartpoint, fetchClassPBS } from '../../lib/api/students';
import { parseLooseJSON } from '../../lib/utils/looseJson';
import { buildTermIndex, stdKeyTerms, goalCoverage, syncStdGoals, skeletonGoal, joinGoals, toCanDoText } from '../../lib/utils/stdTerms';
import { getGoalStyle, setGoalStyle } from '../../lib/utils/iepGoalStyle';
import { buildPyeongPrompt, parsePyeongLines, PYEONG_LEVELS } from '../../lib/pyeong';
import { downloadIepFormDocx, downloadTaskSheetDocx } from '../../lib/utils/iepFormDocx';
import { downloadNiceIepDocx } from '../../lib/utils/niceIepDocx';
import { buildStudentSummary as tcBuildStudentSummary, buildTierLinkage as tcBuildTierLinkage } from '../../lib/tierContext';
import { profileNarrative } from '../../lib/utils/splitNote';
import { findHanja, findNegative } from '../../lib/utils/aiText';
import { ebpBlockForGoal } from '../../lib/ebp';
import { functionSkillsBlock } from '../../lib/functionSkills';
import AssessmentLauncher from '../student/AssessmentLauncher';
import { FORMAT_EX_MATH, FORMAT_EX_COMM, findExampleEchoes } from '../../lib/exampleGuard';
import { qabfScores, QABF_SHORT_LABELS } from '../../lib/qabf';
import { methodsForType, methodsForTask, buildDisabilityMethodBlock, TEACH_SCENES } from '../../lib/disabilityMethods';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import { GRADES_BY_LEVEL } from '../modals/EditStudentModal';

const GRADE = { 0: '일상생활(공통)', 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };
const GORDER = [2, 4, 6, 9, 12];

// 「일상생활 활동」 영역 계층 구조: 대영역(5) → 중영역(하위 영역)
// 출처: 개별화교육계획 가이드북 / 일상생활 활동 영역 구분
const DAILY_SUBJECT = '일상생활 활동';
// 0902: 공통교육과정을 적용하는 장애영역(장특법 기준 통상 적용) — 성취기준 목록 기본값 판단용.
const COMMON_CURR_DIS = /시각|청각|지체|학습|건강/;
const DAILY_AREA_GROUPS = {
  '의사소통': ['의사소통의 기초', '보완대체의사소통의 탐색과 선택', '의사소통의 활용'],
  '자립생활': ['신변 자립', '자기 관리', '안전한 생활', '자기 결정과 상호 작용'],
  '생활 적응': ['감각 지각과 활용', '의사소통 방법의 선택과 적용', '수용과 표현', '대인 관계 형성과 규범 실천', '공동체 및 지역사회 참여', '신체 긴장도 조절', '신체 동작 기초 기술', '의사소통 기초 기술'],
  '여가활동': ['개인 여가활동', '공동체 여가활동', '지역사회 여가활동'],
  '신체활동': ['신체 인지와 움직임', '신체 조절과 이동', '생활 속 체력 증진'],
};
const DAILY_BIG_AREAS = Object.keys(DAILY_AREA_GROUPS);
// 중영역(하위 영역) → 대영역 역매핑
const DAILY_MID_TO_BIG = Object.entries(DAILY_AREA_GROUPS).reduce((acc, [big, mids]) => {
  mids.forEach((m) => { acc[m] = big; });
  return acc;
}, {});

// 월별 점증 시 지원 수준 표현(서술 보조용). 평가초점을 나누는 기준이 아님.
const SUP = ['교사의 도움을 받아 ', '부분적으로 ', '교사 감독 하에 스스로 ', '스스로 ', '다양한 상황에서 스스로 '];

// P15: 평가초점 종결형("~한다.")을 관형형("~하는")으로 — 학기 교육내용 초안용.
// 1) "먹는다"류(는다) → "먹는"  2) 종성 ㄴ("요약한다·이어간다") → ㄴ 탈락+"는"  3) 그 외는 원문 유지.
function toActivityPhrase(s) {
  const t = String(s || '').trim().replace(/\.$/, '');
  if (/는다$/.test(t)) return t.replace(/는다$/, '는') + ' 활동';
  const m = t.match(/^(.*)([가-힣])다$/);
  if (m) {
    const ch = m[2], code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code % 28 === 4) { // 종성 ㄴ
      return m[1] + String.fromCharCode(ch.charCodeAt(0) - 4) + '는 활동';
    }
  }
  return t + ' 관련 활동';
}
const CONTENT_SUFFIX = ['탐색·모방 활동', '구조화된 연습 활동', '실제 상황 적용 연습', '모의·실제 상황 일반화 활동'];

// 장애영역별 기본 교육방법(methodsForType/methodsForTask)은 lib/disabilityMethods.js로 이동(0902) —
// 규칙 초안·채우기 버튼·AI 프롬프트가 같은 표(장특법 11개 영역, EBP 명칭)를 읽는다.
// 과제 분석 — 교수 순서(연쇄)·촉진 체계 라벨 및 서술 도우미.
const CHAIN_LABEL = { forward: '전진형', backward: '후진형', total: '전체과제 제시형' };
const PROMPT_LABEL = { mtl: '최대-최소촉진', slp: '최소촉진체계', td: '시간지연', sim: '동시촉진' };
// 교수 순서(연쇄)에 따라 "이번 달 독립 수행 단계" 서술.
function chainDesc(chainType, totalSteps, indep) {
  if (indep <= 0) return `전 단계 교사 촉진(${CHAIN_LABEL[chainType] || '전진형'}: 한 단계씩 독립화 시작)`;
  if (chainType === 'backward') {
    const from = Math.max(1, totalSteps - indep + 1);
    return `마지막 ${indep}단계(${from}~${totalSteps}단계)를 독립 수행, 앞 단계는 교사 촉진`;
  }
  if (chainType === 'total') return `매 회기 전체 ${totalSteps}단계를 순서대로 수행하며 독립 수행 단계를 ${indep}개로 확대`;
  return `1~${indep}단계를 독립 수행, 이후 단계는 교사 촉진`;
}
// 촉진 체계에 따라 "이번 달 촉진 방식" 서술. i/n로 점증.
function promptDesc(promptSystem, i, n, supFn) {
  const frac = n > 1 ? i / (n - 1) : 1;
  if (promptSystem === 'slp') return `최소촉진체계 — 독립 시도 후 못 하면 약한 촉진(언어→시범→신체) 순으로 제공`;
  if (promptSystem === 'td') { const sec = [0, 2, 3, 4, 5][Math.min(4, Math.round(frac * 4))]; return `시간지연 — 촉진 전 ${sec}초 대기로 독립 반응 기회 확대`; }
  if (promptSystem === 'sim') return `동시촉진 — 교수 회기엔 촉진과 동시 수행, 매일 점검(probe)으로 독립 수준 평가`;
  return `최대-최소촉진 — ${supFn(i).trim()} 수준에서 촉진을 점차 줄여 독립으로`;
}
// 0819 피드백(구병모): 월별 교육방법의 지원수준·강화 스케줄이 매달 같은 문장으로 반복됨 →
// 구간마다 "그 구간의 단계"만 서술하는 점증 사다리. 시작 단계는 출발점(모듈1)의
// '수행 가능 수준'(없으면 현행수준) 텍스트에서 앵커링해 학생 수준을 반영한다.
// 같은 단계가 여러 구간 이어질 때는 단계 내 위치(pos)별 변형 문안으로 대기 시간·강화 비율을
// 점증시켜, 인접 구간의 문장이 항상 최소 1가지 이상 달라지게 한다(학기 최대 6구간 기준 3변형).
const FADE_STAGES = [
  { label: '습득 초기', short: '최대-최소 촉진', descs: [
    '최대-최소 촉진 — 신체·시범 촉진으로 정확한 수행을 만들고, 회기 안에서 촉진 강도를 한 단계씩 낮춤',
    '최대-최소 촉진 계속 — 신체 촉진은 어려운 부분에서만 쓰고, 시범·몸짓 촉진 위주로 낮춤',
    '몸짓·언어 촉진까지 낮추기 — 스스로 시작하는지 잠깐 기다려보며 시간지연으로 넘어갈 준비',
  ] },
  { label: '습득 후기', short: '시간지연 도입', descs: [
    '언어·몸짓 촉진 위주로 낮추고 시간지연 도입 — 촉진 전 2초 기다려 스스로 시작할 기회 제공',
    '시간지연 3초로 확대 — 언어 촉진은 간접 단서("다음은 뭘까?")로 약화',
    '시간지연 3~4초 유지 — 촉진 없이 시작한 횟수를 세어 대기 확대 단계 준비',
  ] },
  { label: '유지', short: '시간지연 확대', descs: [
    '시간지연 확대(4초 대기) — 스스로 수행을 기본으로 하고, 막힐 때만 최소 촉진 제공',
    '시간지연 5초 대기 — 촉진 없이 수행한 횟수를 기록하며 최소 촉진도 점차 제거',
    '대기 후에도 촉진이 거의 필요 없는지 확인 — 자료·상황이 바뀌어도 스스로 하는지 살펴보기',
  ] },
  { label: '일반화', short: '독립 수행 확인', descs: [
    '촉진 없이 독립 수행 확인 — 익숙한 수업 장면에서 스스로 수행하는지 점검',
    '다른 장소·사람·자료로 바꿔도 독립 수행이 유지되는지 확인 — 필요할 때만 짧게 지원',
    '유지 점검 — 일과 속에서 자연스럽게 수행하는지 간헐적으로만 확인하고 스스로 하기를 격려',
  ] },
];
const fadeDesc = (stage, pos) => {
  const d = FADE_STAGES[stage].descs;
  return d[Math.min(pos, d.length - 1)];
};
// 0819(4차 피드백 — 구병모): "학기 교육방법과 월별 교육방법이 연결되는 느낌이 없다" →
// 학기 교육방법의 "→" 단계 흐름(교사 작성·시드·AI 생성)을 월별 구간에 배분해,
// 월별 지원수준·강화가 "[학기 계획 k/m단계] …"로 학기 방향을 펼친 것임이 보이게 한다.
function methodChain(line) {
  const body = String(line || '').replace(/^[\s•·-]+/, '').replace(/^[^:：→]*[:：]\s*/, '');
  const segs = body.split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return [];
  // 시드 문장 정리: 첫 단계의 "현행 … 수준에서 시작해" 접두, 마지막 단계의 "순서로 …"/"…로 전환" 꼬리 제거.
  segs[0] = segs[0].replace(/^.*시작해\s+/, '');
  segs[segs.length - 1] = segs[segs.length - 1].replace(/\s*순서로.*$/, '').replace(/(으로|로)\s*전환\s*$/, '');
  return segs.map((s) => s.trim()).filter(Boolean);
}
// 구간 i(전체 n)가 체인의 몇 번째 단계인지. 같은 단계가 이어지는 구간은 "계속" 표기 +
// 변형 꼬리(extras)로 인접 구간 문장이 겹치지 않게 한다.
function chainStageIdx(len, i, n) {
  return Math.min(len - 1, Math.round((n <= 1 ? 1 : i / (n - 1)) * (len - 1)));
}
function chainLine(segs, i, n, extras) {
  const len = segs.length;
  const k = chainStageIdx(len, i, n);
  let contPos = 0;
  for (let b = i - 1; b >= 0 && chainStageIdx(len, b, n) === k; b--) contPos++;
  const extra = contPos ? ` — ${extras[Math.min(contPos - 1, extras.length - 1)]}` : '';
  return `[학기 계획 ${k + 1}/${len}단계${contPos ? ' 계속' : ''}] ${segs[k]}${extra}`;
}
const SUP_CHAIN_EXTRAS = ['촉진 빈도·강도를 지난 구간보다 한 단계 줄이기', '거의 촉진 없이 되는지 확인하며 필요할 때만 짧게 지원'];
const REINF_CHAIN_EXTRAS = ['강화 간격(비율)을 지난 구간보다 늘리기', '자연적 칭찬 비중을 늘리고 강화물은 가끔만 사용'];
// 강화 스케줄 — 촉구 단계와 같은 축으로 전환(0·1=습득 즉시강화, 2=유지 간헐강화, 3=일반화 자연적 강화).
// pos = 같은 강화 묶음(습득/유지/일반화)이 이어지는 구간 내 위치 — 비율·방식을 점증.
function reinforceStage(stage, pos, topReinf) {
  const pick = (arr) => arr[Math.min(pos, arr.length - 1)];
  if (stage <= 1) return '습득 단계 — ' + pick([
    `연속강화(CRF): 정반응마다 즉시 칭찬·선호 강화물${topReinf ? `(예: ${topReinf})` : ''} 제공`,
    '연속강화 유지 — 칭찬은 구체적으로("스스로 했네!") 하고, 강화물은 수행 직후 잠깐 뒤에 주어 지연에 익숙해지기',
    '고정비율(FR2)로 늘리기 — 2회 정반응마다 강화하며 간헐강화로 넘어갈 준비',
  ]);
  if (stage === 2) return '유지 단계 — ' + pick([
    '간헐강화 전환(고정비율 FR2~FR3): 2~3회에 한 번 강화하며 강화물 의존 줄이기',
    '변동비율(VR3)로 불규칙하게 강화 — 언제 받을지 모르게 하여 수행 유지력 높이기',
    '변동비율 확대(VR4~VR5) — 자연적 칭찬·성취감 비중을 늘리고 강화물은 가끔만',
  ]);
  return '일반화 단계 — ' + pick([
    '자연적 강화 중심: 활동 자체의 성취감·또래 인정으로 전환하고, 강화물은 확인 차원에서만 사용',
    '자연적 강화 정착 — 강화물 없이도 수행이 유지되는지 확인하고, 이따금 칭찬으로만 인정',
    '자기강화로 확장 — 스스로 잘했는지 표시(스티커·체크)하게 하고 교사는 간헐적으로만 확인',
  ]);
}
// 출발점 '수행 가능 수준'·현행수준 텍스트 → 시작 촉구 단계. 강한 지원 키워드부터 검사
// (여러 촉진이 섞여 있으면 가장 강한 지원 기준). 키워드가 없으면 시작/도달 기준 비율로 추정.
function fadeStartStage(perfText, cStart, cEnd) {
  const t = String(perfText || '');
  // "신체적·언어적 촉진"류는 '신체적'이 먼저 걸려 0단계(가장 강한 지원 기준). "신체활동"은 매칭 안 됨.
  if (/신체\s*촉진|신체적|전적\s*도움|손\s*위\s*손|전반적\s*도움|1\s*[대:]\s*1\s*촉진|일대일\s*촉진/.test(t)) return 0;
  if (/시범|모델링|부분\s*도움|부분적/.test(t)) return 0;
  if (/언어\s*촉진|구어\s*촉진|시각\s*촉진|그림\s*촉진|몸짓|시각적?\s*(지원|단서|구조화|일정표)|그림\s*카드/.test(t)) return 1;
  if (/교사\s*감독|단서만|지켜보/.test(t)) return 2;
  const ratio = +cEnd > 0 ? +cStart / +cEnd : 0;
  return ratio >= 0.8 ? 2 : ratio >= 0.6 ? 1 : 0;
}
// 구간 phase(탐색→연습→적용→일반화)별 지도전략 중점 — 지도전략 줄이 매달 똑같지 않게.
// 0902: 구간 중점에 "교수 장면"(DTT→삽입 교수→자연적 중재)을 붙여 DTT·자연적 중재가 사다리 축에 들어가게 한다.
//       핵심 방법(기본 전략)은 학기 내내 고정하고, 구간마다 바뀌는 것은 장면·중점뿐.
const PHASE_STRATEGY = [
  `${TEACH_SCENES[0].scene} — 교사 시범·모델링을 보고 따라 하기 중심`,
  `${TEACH_SCENES[1].scene} — 반복연습으로 정확도 높이기 중심`,
  `${TEACH_SCENES[2].scene} — 촉진을 줄이며 자기점검(스스로 확인하기) 활용 중심`,
  `${TEACH_SCENES[3].scene} — 장소·자료·사람을 바꿔 적용하기 중심`,
];
// 0819(동료 피드백): 학기목표 문장은 "~할 수 있다."로 끝맺는다. '~한다'로 끝나는 문장만 안전 변환
// (다른 어미는 형태 변형이 위험해 그대로 두고, AI 프롬프트 지시로 보완).
// 0903: 구현은 lib/utils/stdTerms.toCanDoText 하나로 통일(시드·AI 결과·요약이 같은 규칙을 쓰도록).
const toCanDo = (s) => toCanDoText(s);
const monthsOf = (sem) => (String(sem) === '2' ? [9, 10, 11, 12, 1] : [3, 4, 5, 6, 7]);
// 학기에 넣을 수 있는 월 후보(학사일정 순서). 교사가 이 중에서 실제 운영 월을 고른다.
const MONTH_POOL = (sem) => (String(sem) === '2' ? [9, 10, 11, 12, 1, 2] : [3, 4, 5, 6, 7, 8]);
// 선택한 월들을 학사일정 순서로 정렬(2학기 1·2월이 뒤로 가도록).
const orderMonths = (arr, sem) => {
  const pool = MONTH_POOL(sem);
  return [...new Set(arr)].filter((m) => pool.includes(m)).sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
};
const baseOf = (goal) => goal.replace(/^스스로\s*/, '').replace(/\s*\.?$/, '');

// ── 월 묶기 (현장 관행: 3-4월/5월/6-7월처럼 묶어 계획·평가) ──────────────
// "3-4/5/6-7" 같은 묶음 문자열을 선택된 월 기준의 그룹 배열로 푼다.
// 비어 있으면 월마다 한 그룹. 표기에 없는 선택 월은 단독 그룹으로 붙인다.
function parseMonthGroups(spec, selectedMonths, sem) {
  const pool = MONTH_POOL(sem);
  const ms = orderMonths(selectedMonths, sem);
  const used = new Set();
  const groups = [];
  String(spec || '').split(/[/,]/).map((t) => t.trim()).filter(Boolean).forEach((tok) => {
    const mm = tok.match(/^(\d{1,2})\s*[-~·]\s*(\d{1,2})$/);
    let g = [];
    if (mm) {
      const a = pool.indexOf(+mm[1]); const b = pool.indexOf(+mm[2]);
      if (a >= 0 && b >= 0 && a <= b) g = pool.slice(a, b + 1);
    } else if (/^\d{1,2}$/.test(tok)) {
      g = [+tok];
    }
    g = g.filter((m) => ms.includes(m) && !used.has(m));
    if (g.length) { g.forEach((m) => used.add(m)); groups.push(g); }
  });
  ms.forEach((m) => { if (!used.has(m)) groups.push([m]); });
  groups.sort((x, y) => pool.indexOf(x[0]) - pool.indexOf(y[0]));
  return groups;
}
// 그룹 → 표기 라벨. 연속이면 "3-4", 아니면 "3·5", 단일이면 "5".
function monthGroupLabel(g, sem) {
  const pool = MONTH_POOL(sem);
  if (g.length === 1) return String(g[0]);
  const consecutive = g.every((m, i) => i === 0 || pool.indexOf(m) === pool.indexOf(g[i - 1]) + 1);
  return consecutive ? `${g[0]}-${g[g.length - 1]}` : g.join('·');
}
// 저장된 월 라벨("3-4", "5", "3·5")을 실제 월 배열로 복원.
function expandMonthLabel(label, sem) {
  const pool = MONTH_POOL(sem);
  const s = String(label == null ? '' : label).trim();
  const mm = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (mm) {
    const a = pool.indexOf(+mm[1]); const b = pool.indexOf(+mm[2]);
    if (a >= 0 && b >= 0 && a <= b) return pool.slice(a, b + 1);
  }
  return s.split(/[·,]/).map((x) => parseInt(x, 10)).filter((n) => pool.includes(n));
}

// 평서형 평가초점("…나눈다.")을 평가계획 질문("…나눌 수 있는가?")으로 변환.
function toEvalQuestion(s) {
  const t = String(s || '').trim().replace(/\.+$/, '');
  if (!t) return '';
  if (t.endsWith('한다')) return t.slice(0, -2) + '할 수 있는가?';
  if (t.endsWith('는다')) {
    const stem = t.slice(0, -2);
    const c = stem.charCodeAt(stem.length - 1);
    const inRange = c >= 0xAC00 && c <= 0xD7A3;
    const jong = inRange ? (c - 0xAC00) % 28 : 0;
    if (inRange && !jong) return stem.slice(0, -1) + String.fromCharCode(c + 8) + ' 수 있는가?'; // 받침 ㄹ 붙임
    return stem + '을 수 있는가?';
  }
  if (t.endsWith('다')) {
    const c = t.charCodeAt(t.length - 2);
    if (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 === 4) {
      return t.slice(0, -2) + String.fromCharCode(c + 4) + ' 수 있는가?'; // 받침 ㄴ→ㄹ (나눈다→나눌)
    }
    return t.slice(0, -1) + '는가?';
  }
  return t + ' — 할 수 있는가?';
}

// 받침 유무로 을/를 조사 선택
function josaEulReul(word) {
  const w = (word || '').trim();
  if (!w) return '을';
  const last = w[w.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '을(를)';
  return (code - 0xAC00) % 28 === 0 ? '를' : '을';
}
// 동사를 평서형(~한다)으로 변환
function verbToDeclarative(verb) {
  const v = (verb || '').trim();
  if (!v) return '수행한다';
  if (v.endsWith('하기')) return v.slice(0, -2) + '한다';
  if (v.endsWith('기')) return v.slice(0, -1) + '다';
  if (v.endsWith('다')) return v;
  return v + '한다';
}
// 성취기준 분석/해석 결과(동사·행위지향·서술자)로 평가초점 목록 생성.
// 지원 수준이 아니라 "서술자(대상/내용) + 같은 의미의 여러 동사"의 스펙트럼을 펼쳐 평가초점을 만든다.
// verbAlts: 대표 동사와 "같은 의미"로 쓸 수 있는 측정 가능한 동사 목록(예: 시도하기 → 말 걸기, 대답하기 …).
//           주어지면 평가초점마다 동사를 번갈아 사용해 같은 의미를 다양한 행동으로 표현한다.
function buildEvalFoci(verb, intent, descriptor, fallbackText, verbAlts) {
  const raw = (descriptor || '').trim() || (fallbackText || '').replace(/\s*\.?$/, '');
  const items = raw.split(/[,/·、|\n]+| 및 | 와 | 과 /).map((s) => s.trim()).filter(Boolean);
  const objs = items.length ? items : [raw];
  // 동의어 동사 목록: verbAlts 우선, 없으면 동사 칸에 쉼표·줄바꿈으로 직접 적은 여러 동사도 허용.
  const verbs = (Array.isArray(verbAlts) && verbAlts.length
    ? verbAlts
    : String(verb || '').split(/[,/·、|\n]+/))
    .map((v) => v.trim()).filter(Boolean);
  const vlist = verbs.length ? verbs : [verb];
  const lead = intent ? intent.trim() + ' ' : '';
  // 서술자·동사 중 많은 쪽 길이에 맞춰 펼치되, 동사를 번갈아 써서 같은 의미를 다양하게 표현.
  const n = Math.max(objs.length, vlist.length);
  const list = [];
  for (let i = 0; i < n; i++) {
    const it = objs[i % objs.length];
    const decl = verbToDeclarative(vlist[i % vlist.length]);
    list.push(`${lead}${it}${josaEulReul(it)} ${decl}.`);
  }
  return [...new Set(list)];
}

// LLM이 종종 살짝 깨진 JSON을 내놓는다(예: "eval":": " 처럼 콜론·따옴표 중복, 후행 콤마).
// 1차 파싱 실패 시 흔한 오류를 보정해 한 번 더 시도한다.
// JSON 파싱은 공용 강건 파서 사용(lib/utils/looseJson.js — jsonrepair 기반, 0824).

export default function IepPage({ onNavigate }) {
  const { curStu, curStuId, curStuData, ensureStudentData, editStudent, curYear, curSemester, studentTier, tier2Groups } = useStudents();
  const { user } = useAuth();
  const toast = useToast();
  const { callDetailed, config, status: llmStatus, pushLog } = useLLM();
  const aiOn = llmStatus !== 'off';
  const [manualOpen, setManualOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [pasteText, setPasteText] = useState('');
  // 🌐 외부AI 연동(로컬 AI와 비교용): ''|'analyze'|'verbs'|'steps'|'pyeong'
  // ※ 0719 요청으로 외부AI 버튼은 전부 주석 처리됨(모달·설정 코드는 복원 대비 유지).
  const [extKind, setExtKind] = useState('');
  // 학기목표 작성 경로(0719 피드백 — 학기목표 선행이 원칙, 두 경로 중 선택):
  //   'std'  = A. 성취기준 선택 → 학기목표 작성 (연수자료 21~26p, 교과 중심)
  //   'goal' = B. 학기목표 작성 → 성취기준 연결 (연수자료 48~54p, 필요 기술 중심)
  const [flowMode, setFlowMode] = useState('std');
  const [goalAiBusy, setGoalAiBusy] = useState(false); // 학기목표 AI 생성·다듬기
  const [stdRecBusy, setStdRecBusy] = useState(false); // 학기목표 → 성취기준 추천
  const [stdRecs, setStdRecs] = useState([]); // 추천 성취기준 목록
  const [fociGoalBusy, setFociGoalBusy] = useState(false); // 학기목표 쪼개기(평가초점)
  const [fociCount, setFociCount] = useState(5); // 0720: 만들 평가초점 개수(2~10, 교사 선택)

  // reasoning 모델(Qwen3 등) 대응. 요청/응답 로그는 LLMContext가 자동 기록하며
  // (상단 AI 연결 모달에서 확인), 여기서는 JSON 추출 단계 실패만 추가로 남긴다.
  async function llmJSON(label, prompt, opts) {
    const r = await callDetailed('/no_think\n' + prompt, { ...opts, label });
    const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
    const meta = `finish=${r.finish_reason} · content ${(r.content || '').length}자 · reasoning ${(r.reasoning || '').length}자`;
    const m = (out || '').match(/\{[\s\S]*\}/);
    if (!m) {
      pushLog('error', label, 'JSON 없음 · ' + meta, out);
      throw new Error(r.finish_reason === 'length' ? 'AI 응답이 토큰 한도로 잘렸어요. AI 설정에서 max_tokens를 늘려보세요.' : 'AI 응답에서 JSON을 찾지 못했어요.');
    }
    try {
      const j = parseLooseJSON(m[0]);
      return j;
    } catch (e) {
      pushLog('error', label, 'AI 응답 읽기 실패 · ' + meta, m[0]);
      throw new Error('AI 응답을 읽지 못했어요: ' + e.message);
    }
  }

  const [rows, setRows] = useState([]); // achievement standards
  // 0903(B안): 교과 패밀리별 낱말 빈도 인덱스 — 성취기준별 필수 낱말·커버리지 판정용(한 번만 계산).
  const termIndex = useMemo(() => buildTermIndex(rows), [rows]);
  const [fSubject, setFSubject] = useState('');
  const [fGrade, setFGrade] = useState('');
  // 0902: 교육과정 구분 — '기본'(특수교육 기본교육과정) | '공통'(초·중등 공통교육과정). 학생 장애영역에 따라 기본값.
  const [fCurr, setFCurr] = useState('기본');
  const [fBigArea, setFBigArea] = useState(''); // 일상생활 활동 대영역
  const [fArea, setFArea] = useState('');
  // 0720: 성취기준 여러 개 선택(연수자료 22~26p "관련성취기준" 목록). 화면상 '대표' 개념은 없음.
  // sel = 첫 번째 선택(내부용 — DB·문서의 과목/영역/성취기준 단일 칸과 분석 도구가 이걸 쓴다),
  // selExtra = 나머지 선택 목록. 저장·프롬프트에는 [sel, ...selExtra] 전체가 반영된다.
  const [sel, setSel] = useState(null);
  const [selExtra, setSelExtra] = useState([]);

  const [verb, setVerb] = useState('');
  const [verbAlts, setVerbAlts] = useState([]); // 대표 동사와 같은 의미의 측정 가능한 동사 목록
  const [intent, setIntent] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [evalFoci, setEvalFoci] = useState([]); // 평가초점 목록(성취기준 분석→해석→개발)
  // 0903(B안): 성취기준별 도달 목표 [{code, std, goal}] — 선택한 성취기준마다 학생 수준으로 조정한 목표 1개.
  // 학기목표(goal)는 이 묶음의 요약 한 문장이고, 평가초점·월별 계획은 이 목록을 앵커로 파생한다.
  const [stdGoals, setStdGoals] = useState([]);
  const autoSummaryRef = useRef(''); // 마지막 자동 요약 — 교사가 학기목표를 손대지 않았으면 목록을 따라 갱신
  // 문서(Word·인쇄)의 학기목표 표기: 'full'(한 문장 + 성취기준별 목표) | 'summary'(한 문장만). 브라우저에 저장.
  const [goalStyle, setGoalStyleState] = useState('full');
  useEffect(() => { setGoalStyleState(getGoalStyle()); }, []);
  const changeGoalStyle = (v) => { setGoalStyle(v); setGoalStyleState(v); };

  const [goal, setGoal] = useState('');
  const [plop, setPlop] = useState('');
  // P15(0720 현장 피드백): 학기 수준 교육내용·교육방법 — 월별 생성 전에 한번 방향을 잡으면
  // 규칙 초안·AI 생성이 이를 이어받아 월별이 더 구체적으로 나온다.
  const [semContent, setSemContent] = useState('');
  const [semMethods, setSemMethods] = useState('');
  const [semAiBusy, setSemAiBusy] = useState(false); // P16: 연수자료 방식 AI 채우기
  // 기본 학년도·학기는 상단 전역 선택값을 따른다(반·학기 일관성).
  const [schoolYear, setSchoolYear] = useState(curYear || new Date().getFullYear());
  const [sem, setSem] = useState(String(curSemester || 1));
  // 학기에 포함할 월(교사가 직접 선택). 기본값은 표준 학사일정(1학기 3~7월 / 2학기 9~12·1월).
  const [months, setMonths] = useState(() => monthsOf(String(curSemester || 1)));
  // 월 묶기 표기(예: "3-4/5/6-7"). 비워 두면 매월 한 행. — 현장 관행 반영(피드백4)
  const [monthGroups, setMonthGroups] = useState('');
  const [critType, setCritType] = useState('rate');
  const [supportTier, setSupportTier] = useState(''); // 모듈4: 지원체계(Tier 1/2/3)
  const [startpoint, setStartpoint] = useState(null); // 모듈1 출발점 산출물(연동용)
  const [pyeongLines, setPyeongLines] = useState([]); // 교과 평어 생성 결과
  const [pyeongLevel, setPyeongLevel] = useState('');
  const [pyeongBusy, setPyeongBusy] = useState(false);
  // P10(0720): 평어는 공개 문서 — 행동·정서 지원 언급은 기본 제외, 교사가 켜야 포함.
  const [pyeongBehavior, setPyeongBehavior] = useState(false);
  const [cStart, setCStart] = useState(30);
  const [cEnd, setCEnd] = useState(80);
  const [taskSteps, setTaskSteps] = useState([]); // 과제 분석(critType='task')용 순차 단계 목록
  const [taskBusy, setTaskBusy] = useState(false); // 단계 자동 분석 진행 상태
  const [chainType, setChainType] = useState('forward'); // 교수 순서(연쇄): forward/backward/total
  const [promptSystem, setPromptSystem] = useState('mtl'); // 촉진 체계: mtl/slp/td/sim
  const [monthly, setMonthly] = useState([]);
  const [semEval, setSemEval] = useState('');
  // 초안 보관함(피드백: AI 1차·2차 결과가 매번 달라지는데 비교할 수 없고, 규칙 초안을
  // 누르면 AI 내용이 사라짐). 생성할 때마다 초안이 차수별로 보관되어 전환하며 비교한다.
  // 규칙 초안은 결정적이라 1칸, AI 생성은 'AI 1차, 2차…'로 최근 4개까지 쌓인다.
  const [drafts, setDrafts] = useState([]); // [{ kind: 'rule'|'ai', label, data }]
  const [curDraft, setCurDraft] = useState(-1); // 지금 화면에 펼쳐진 초안의 index
  const aiSeq = useRef(0); // AI 초안 차수 카운터

  const [savedGoals, setSavedGoals] = useState([]);
  const [busy, setBusy] = useState(false);
  // 0819 피드백: 저장 성공 후 "다음 단계(IEP 계획서)로 이동" 배너 — 내용을 다시 수정하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([goal, plop, monthly, semEval]);
  const [aiDecBusy, setAiDecBusy] = useState(false);
  const [verbBusy, setVerbBusy] = useState(false); // 같은 의미 동사 펼치기 진행 상태
  const [aiGenBusy, setAiGenBusy] = useState(false);
  const [editingId, setEditingId] = useState(null); // 수정 중인 저장 목표 id
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [wordDone, setWordDone] = useState(false); // 이번 세션에서 계획서 Word를 출력했는지(진행바 마지막 단계)
  const [colW, setColW] = useState([50, 210, 210, 170, 190, 220]); // 월별 표 열 너비(px) — 월/목표/내용/방법/평가계획/평가

  // Load achievement standards (public/data) once.
  useEffect(() => {
    fetch('/data/achievement-standards.json')
      .then((r) => r.json())
      .then((d) => setRows((d.rows || []).map((a) => ({ subject: a[0], gradeCode: a[1], area: a[2], code: a[3], text: a[4], verb: a[5], intent: a[6], descriptor: a[7], curriculum: a[8] || '기본' }))))
      .catch(() => toast('성취기준 데이터를 불러오지 못했습니다.'));
  }, [toast]);

  // P6(0720): 학생을 고르면 학년군 필터를 학생 학교급에 맞춰 미리 맞춘다.
  // (중등 학생인데 목록이 초등 3~4학년부터 보이던 문제)
  // 학생이 바뀔 때 한 번만 적용 — 이후 교사가 바꾼 필터는 그대로 존중한다.
  const gradePresetFor = useRef(null);
  useEffect(() => {
    if (!curStuId || gradePresetFor.current === curStuId) return;
    gradePresetFor.current = curStuId;
    const lv = String(curStu?.level || '');
    const preset = lv.includes('중') ? '9' : lv.includes('고') ? '12' : '';
    if (preset) { setFGrade(preset); setFArea(''); }
    // 0902: 시각·청각·지체·학습·건강장애는 공통교육과정 적용 대상 → 성취기준 목록 기본값을 공통으로.
    setFCurr(COMMON_CURR_DIS.test(String(curStu?.disability || '')) ? '공통' : '기본');
    setFSubject(''); setFBigArea(''); setFArea('');
  }, [curStuId, curStu?.level, curStu?.disability]);

  // Load saved IEP goals when the selected student changes.
  useEffect(() => {
    if (!curStuId) { setSavedGoals([]); return; }
    setGoalsLoading(true);
    fetchIEP(curStuId).then((d) => setSavedGoals(d.goals || [])).catch(() => {}).finally(() => setGoalsLoading(false));
  }, [curStuId]);

  // 0819(동료 피드백): 학생을 바꾸면 이전 학생의 편집 내용(학기목표·월별·성취기준 선택 등)이
  // 화면에 그대로 남던 문제 — 학생 전환 시 편집 상태를 전부 초기화한다(저장된 자료는 위 효과가 다시 로드).
  const editStuRef = useRef(curStuId);
  useEffect(() => {
    if (editStuRef.current === curStuId) return;
    editStuRef.current = curStuId;
    setSel(null); setSelExtra([]); setStdRecs([]); setStdGoals([]); autoSummaryRef.current = '';
    setVerb(''); setVerbAlts([]); setIntent(''); setDescriptor(''); setEvalFoci([]);
    setGoal(''); setSemContent(''); setSemMethods('');
    setMonthly([]); setSemEval(''); setTaskSteps([]);
    setCritType('rate'); setCStart(30); setCEnd(80);
    setChainType('forward'); setPromptSystem('mtl'); setMonthGroups('');
    setSupportTier(''); setEditingId(null);
    setDrafts([]); setCurDraft(-1); aiSeq.current = 0;
    if (curStuId) toast('학생이 바뀌어 편집 중이던 IEP 내용을 비웠어요. 저장된 목표는 아래 목록에서 불러올 수 있어요.');
  }, [curStuId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 모듈1 출발점 산출물 로드 (모듈2 목표 생성의 출발점으로 연동).
  useEffect(() => {
    if (!curStuId) { setStartpoint(null); return; }
    fetchStartpoint(curStuId).then((r) => setStartpoint(r?.data?.data || null)).catch(() => setStartpoint(null));
  }, [curStuId]);

  // Default 현행수준 — 강점/어려움을 서술형 문장으로 조합(라벨 텍스트 그대로 넣지 않음).
  useEffect(() => {
    setPlop(profileNarrative(curStu) || curStu?.note || '교사의 신체적·언어적 촉진이 있을 때 부분적으로 수행하며, 독립 수행은 어려움.');
  }, [curStuId, curStu?.note, curStu?.strengths, curStu?.difficulties]);

  // 0902: 현재 교육과정 구분의 성취기준만(교과·학년군·영역 필터와 경로B 추천의 공통 풀).
  const crows = useMemo(() => rows.filter((r) => (r.curriculum || '기본') === fCurr), [rows, fCurr]);
  const currCounts = useMemo(() => ({ 기본: rows.filter((r) => (r.curriculum || '기본') === '기본').length, 공통: rows.filter((r) => r.curriculum === '공통').length }), [rows]);
  const subjects = useMemo(() => [...new Set(crows.map((r) => r.subject))], [crows]);
  const grades = useMemo(() => {
    const pool = crows.filter((r) => !fSubject || r.subject === fSubject);
    return GORDER.filter((g) => pool.some((r) => r.gradeCode === g));
  }, [crows, fSubject]);
  const isDaily = fSubject === DAILY_SUBJECT;
  // 일상생활 활동: 데이터에 실제 존재하는 대영역만 노출
  const bigAreas = useMemo(() => {
    if (!isDaily) return [];
    const present = new Set(rows.filter((r) => r.subject === DAILY_SUBJECT).map((r) => DAILY_MID_TO_BIG[r.area]).filter(Boolean));
    return DAILY_BIG_AREAS.filter((b) => present.has(b));
  }, [crows, isDaily]);
  const areas = useMemo(() => {
    const pool = crows.filter((r) => (!fSubject || r.subject === fSubject) && (!fGrade || r.gradeCode === +fGrade));
    let list = [...new Set(pool.map((r) => r.area).filter(Boolean))];
    // 일상생활 활동이고 대영역이 선택된 경우, 중영역만 그 그룹으로 좁힘
    if (isDaily && fBigArea) list = list.filter((a) => DAILY_MID_TO_BIG[a] === fBigArea);
    return list;
  }, [crows, fSubject, fGrade, isDaily, fBigArea]);
  const candidates = useMemo(() => {
    return crows.filter((r) =>
      (!fSubject || r.subject === fSubject) &&
      (!fGrade || r.gradeCode === +fGrade) &&
      (!isDaily || !fBigArea || DAILY_MID_TO_BIG[r.area] === fBigArea) &&
      (!fArea || r.area === fArea)
    );
  }, [crows, fSubject, fGrade, isDaily, fBigArea, fArea]);

  // 0903(B안): 교과중심 경로에서 선택한 성취기준 목록에 맞춰 성취기준별 목표를 맞춘다
  // (있던 문장 유지 · 새 것은 성취기준 원문을 "~할 수 있다."로 시드 · 빠진 것은 제거).
  useEffect(() => {
    if (flowMode !== 'std') return;
    const stds = [sel, ...selExtra].filter((s) => s && s.code && s.code !== 'PRIOR');
    setStdGoals((prev) => {
      const next = syncStdGoals(prev, stds);
      const same = next.length === prev.length && next.every((x, i) => prev[i] && prev[i].code === x.code && prev[i].goal === x.goal && prev[i].std === x.std);
      return same ? prev : next;
    });
  }, [sel, selExtra, flowMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // 학기목표 한 문장은 교사가 손대지 않은 동안(비어 있거나 직전 자동 요약 그대로) 목록의 결정론 요약을 따라간다.
  useEffect(() => {
    if (flowMode !== 'std' || !stdGoals.length) return;
    const summary = joinGoals(stdGoals);
    const cur = String(goal || '').trim();
    if (!cur || cur === autoSummaryRef.current) {
      autoSummaryRef.current = summary;
      if (cur !== summary) setGoal(summary);
    }
  }, [stdGoals, flowMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // 최신 stdGoals 미러 — AI 생성처럼 오래 걸리는 작업이 끝났을 때 생성 중 바뀐 선택과 대조하기 위해.
  const stdGoalsRef = useRef([]);
  useEffect(() => { stdGoalsRef.current = stdGoals; }, [stdGoals]);
  // 성취기준별 목표 각 줄의 필수 낱말 커버리지(변별 명사·인지 동사가 남아 있는지) — 타이핑마다 갱신.
  // 단일 성취기준이면 학기목표 한 문장이 곧 그 줄이므로 학기목표를 판정한다.
  const stdCoverage = useMemo(() => {
    const stds = [sel, ...selExtra].filter(Boolean);
    return stdGoals.map((x) => {
      const s = stds.find((z) => z.code === x.code) || { code: x.code, text: x.std, subject: sel?.subject, gradeCode: sel?.gradeCode };
      return goalCoverage(stdGoals.length === 1 ? goal : x.goal, s, termIndex);
    });
  }, [stdGoals, sel, selExtra, termIndex, goal]);
  function editStdGoal(i, val) { setStdGoals((prev) => prev.map((x, idx) => (idx === i ? { ...x, goal: val } : x))); }
  function resetStdGoal(i) {
    setStdGoals((prev) => prev.map((x, idx) => (idx === i ? { ...x, goal: skeletonGoal({ text: x.std }) } : x)));
  }

  // 0720: 성취기준 다중 선택 — 단순 토글(누르면 담고, 다시 누르면 뺌).
  // '대표'는 화면 개념에서 제거. 다만 DB·문서 양식의 과목/영역/성취기준 단일 칸이 있어서
  // 내부적으로는 "첫 번째 선택(sel)"이 조용히 그 칸을 채운다(첫 항목을 빼면 다음 항목이 이어받음).
  function pickStandard(r) {
    if (sel && sel.code === r.code) {
      const [next, ...rest] = selExtra;
      if (next) {
        setSel(next);
        setVerb(next.verb || ''); setIntent(next.intent || ''); setDescriptor(next.descriptor || '');
        setSelExtra(rest);
        setStdGoals((p) => p.filter((x) => x.code !== r.code));
      } else {
        setSel(null); setVerb(''); setIntent(''); setDescriptor(''); setStdGoals([]);
      }
      return;
    }
    if (selExtra.some((x) => x.code === r.code)) {
      setSelExtra((prev) => prev.filter((x) => x.code !== r.code));
      setStdGoals((p) => p.filter((x) => x.code !== r.code));
      return;
    }
    if (sel) {
      if (selExtra.length >= 7) { toast('성취기준은 8개까지 선택할 수 있어요.'); return; }
      setSelExtra((prev) => [...prev, r]);
      return;
    }
    // 첫 선택 — 내부적으로 과목·영역·분석 도구의 기준이 된다(화면에는 표시하지 않음).
    setSel(r);
    setSelExtra([]); setStdGoals([]);
    setVerb(r.verb || ''); setIntent(r.intent || ''); setDescriptor(r.descriptor || '');
    if (flowMode === 'std') {
      // 경로A: 성취기준 → 학기목표. 0903(B안): 성취기준별 목표 목록이 원문으로 채워지고(아래 sync 효과),
      // 학기목표 한 문장은 그 묶음의 요약으로 자동 시드된다. 여기서는 비워 두어 요약 효과가 채우게 한다.
      // 평가초점은 여기서 만들지 않는다 — 학기목표 확정 후 "학기목표 쪼개기"로 개발(0719 피드백:
      // 성취기준을 바로 평가초점으로 나누던 방식 교정).
      setGoal(''); autoSummaryRef.current = '';
      setEvalFoci([]);
    }
    // 경로B(학기목표 먼저): 교사가 쓴 학기목표·평가초점을 유지한 채 성취기준만 연결한다.
    setMonthly([]); setSemEval('');
    setEditingId(null);
    resetDrafts();
  }

  // 저장된 목표를 편집기로 불러오기 (수정 모드).
  function loadGoal(g) {
    const std = rows.find((r) => r.code === g.standard_code) ||
      { subject: g.subject, gradeCode: g.grade_code, area: g.area, code: g.standard_code, text: g.standard_text, verb: '', intent: '', descriptor: '' };
    setSel(std);
    // 관련 성취기준(다중 선택) 복원
    setSelExtra(Array.isArray(g.related_stds)
      ? g.related_stds.map((x) => rows.find((r) => r.code === x.code) ||
          { subject: x.subject || '', gradeCode: x.grade_code ?? x.gradeCode ?? 0, area: x.area || '', code: x.code, text: x.text || '', verb: '', intent: '', descriptor: '' })
      : []);
    setVerb(std.verb || ''); setIntent(std.intent || ''); setDescriptor(std.descriptor || '');
    setEvalFoci(Array.isArray(g.eval_foci) ? g.eval_foci : []);
    {
      let loaded = Array.isArray(g.std_goals) ? g.std_goals.filter((x) => x && x.code) : [];
      // B안 이전 저장본(std_goals 없음)이고 성취기준이 1개면 학기목표 문장이 곧 그 줄 — 원문 시드로 갈리지 않게 학기목표로 채운다.
      const relatedN = Array.isArray(g.related_stds) ? g.related_stds.length : 0;
      if (!loaded.length && std.code && std.code !== 'PRIOR' && relatedN === 0) loaded = [{ code: std.code, std: std.text || '', goal: g.semester_goal || '' }];
      setStdGoals(loaded);
      // 저장 당시 학기목표가 자동 요약 그대로였다면 계속 목록을 따라가고, 교사가 고친 문장이면 그대로 둔다.
      autoSummaryRef.current = loaded.length > 1 ? joinGoals(loaded) : '';
    }
    setGoal(g.semester_goal || ''); setPlop(g.plop || '');
    setSemContent(g.sem_content || ''); setSemMethods(g.sem_methods || '');
    setSchoolYear(g.school_year || new Date().getFullYear());
    setSem(String(g.semester || 1)); setCritType(g.crit_type || 'rate');
    setSupportTier(g.support_tier || '');
    if ((g.crit_type || 'rate') === 'freq' && ((g.crit_start ?? 0) > 10 || (g.crit_end ?? 0) > 10)) {
      // 예전 데이터 자가 치유: %처럼 저장된 값(30/80)을 10회 기회 중 성공 횟수(3/8)로 환산
      setCStart(Math.min(10, Math.round((g.crit_start ?? 30) / 10)));
      setCEnd(Math.min(10, Math.round((g.crit_end ?? 80) / 10)));
    } else {
      setCStart(g.crit_start ?? 30); setCEnd(g.crit_end ?? 80);
    }
    setTaskSteps(Array.isArray(g.task_steps) ? g.task_steps : []);
    setChainType(g.chain_type || 'forward'); setPromptSystem(g.prompt_system || 'mtl');
    // 저장된 월별 계획에서 실제 운영 월·월 묶기를 복원(없으면 표준 학사일정).
    {
      const gSem = g.semester || 1;
      const labels = (Array.isArray(g.monthly) ? g.monthly : []).map((m) => String(m.month));
      const savedMonths = labels.flatMap((l) => expandMonthLabel(l, gSem));
      setMonths(savedMonths.length ? orderMonths(savedMonths, gSem) : monthsOf(gSem));
      setMonthGroups(labels.some((l) => /[-·]/.test(l)) ? labels.join('/') : '');
    }
    setMonthly(Array.isArray(g.monthly) ? g.monthly : []);
    setSemEval(g.semestral_eval || '');
    setEditingId(g.id);
    resetDrafts();
    toast('불러왔어요. 수정 후 저장하면 이 목표가 갱신됩니다.');
    setTimeout(() => {
      const el = typeof document !== 'undefined' && document.getElementById('iep-editor');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function newGoal() {
    setSel(null); setSelExtra([]); setEditingId(null); setMonthly([]); setSemEval(''); setGoal('');
    setSemContent(''); setSemMethods(''); setStdGoals([]); autoSummaryRef.current = '';
    setVerb(''); setIntent(''); setDescriptor(''); setEvalFoci([]); setSupportTier(''); setTaskSteps([]);
    setChainType('forward'); setPromptSystem('mtl'); setMonths(monthsOf(sem)); setMonthGroups('');
    resetDrafts();
  }

  // 전년도 목표 하나를 "기준"으로 삼아 올해 목표 작성을 시작.
  function startFromPrior(g) {
    // 0903: 성취기준 코드가 있으면 진짜 성취기준 행을 sel로 세운다(작년 학기목표 문장을 성취기준으로 오인하지 않게).
    // 코드가 없는 전년도 목표는 'PRIOR' 가짜 sel — 성취기준별 목표 시드·검증에서 제외되고 AI는 작년 문장을 바탕으로 올해 목표를 쓴다.
    const row = g.standard_code ? rows.find((r) => r.code === g.standard_code) : null;
    const s = row
      ? { ...row }
      : { subject: g.subject, gradeCode: g.grade_code, area: g.area, code: g.standard_code || 'PRIOR', text: g.standard_text || g.semester_goal || '', verb: '', intent: '', descriptor: '' };
    const seedGoal = g.semester_goal || toCanDo((s.text || '').replace(/\s*\.?$/, ''));
    setSel(s); setSelExtra([]); autoSummaryRef.current = '';
    // 단일 성취기준이면 학기목표가 곧 그 줄 — 작년 문장으로 시드(원문 스켈레톤과 갈리지 않게). 코드 없는 PRIOR는 목록 없음.
    setStdGoals(s.code !== 'PRIOR' ? [{ code: s.code, std: s.text || '', goal: seedGoal }] : []);
    setVerb(s.verb || ''); setIntent(s.intent || ''); setDescriptor(s.descriptor || ''); setEvalFoci([]); setTaskSteps([]);
    setChainType('forward'); setPromptSystem('mtl');
    setGoal(seedGoal);
    if (g.plop) setPlop(g.plop);
    setEditingId(null); setMonthly([]); setSemEval('');
    toast(`${g.school_year} ${g.subject} 목표를 기준으로 불러왔어요. "✨ AI 생성"으로 올해 목표를 만드세요.`);
    setTimeout(() => { const el = typeof document !== 'undefined' && document.getElementById('iep-editor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }

  // 평가초점 목록 편집
  function genFociNow() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    setEvalFoci(buildEvalFoci(verb, intent, descriptor, sel.text, verbAlts));
    toast('성취기준 분석·해석을 바탕으로 평가초점을 생성했어요.');
  }
  function addFocus() { setEvalFoci((prev) => [...prev, '']); }
  function editFocus(i, val) { setEvalFoci((prev) => prev.map((f, idx) => (idx === i ? val : f))); }
  function removeFocus(i) { setEvalFoci((prev) => prev.filter((_, idx) => idx !== i)); }

  // 과제 분석(critType='task') 단계 목록 편집 + 자동 분해
  function addStep() { setTaskSteps((prev) => [...prev, '']); }
  function editStep(i, val) { setTaskSteps((prev) => prev.map((s, idx) => (idx === i ? val : s))); }
  function removeStep(i) { setTaskSteps((prev) => prev.filter((_, idx) => idx !== i)); }
  // 특정 단계를 더 잘게 쪼갠다. 한 단계 글에 구분기호(→ / · ; ,)가 있으면 그 기준으로 나누고,
  // 없으면 같은 내용의 빈 하위 단계 1개를 뒤에 붙여(2개로 나눠) 교사가 채우게 한다.
  function splitStep(i) {
    setTaskSteps((prev) => {
      const cur = String(prev[i] || '').trim();
      const parts = cur.split(/\s*(?:→|·|;|\/|,)\s*/).map((p) => p.trim()).filter(Boolean);
      const pieces = parts.length >= 2 ? parts : [cur, ''];
      const next = [...prev];
      next.splice(i, 1, ...pieces);
      return next;
    });
  }
  // 단계 수에 맞춰 목표 독립 단계를 동기화(목표=전체 단계, 시작은 범위 내로 클램프).
  function syncTaskTargets(count) {
    if (!count) return;
    setCEnd(count);
    setCStart((p) => Math.min(Number(p) || 0, count));
  }
  // AI 없이도 쓸 수 있는 기본 단계 골격(교사가 편집해 완성).
  function ruleStepsNow() {
    const base = baseOf(goal) || (sel?.text || '').replace(/\s*\.?$/, '') || '과제';
    const arr = [
      '준비물·상황 확인하기',
      `${base} 시범 관찰하기`,
      `${base} 첫 단계 따라 하기`,
      `${base} 중간 단계 수행하기`,
      `${base} 전체 순서대로 수행하기`,
      '수행 결과 정리·점검하기',
    ];
    setTaskSteps(arr);
    syncTaskTargets(arr.length);
    toast('기본 단계 골격을 만들었어요. 학생 과제에 맞게 편집하세요.');
  }
  // 과제분석 단계 분해 프롬프트 — 로컬 AI 호출·외부AI 복사 공용.
  function buildStepsPrompt() {
    const target = (goal || sel?.text || '').trim();
    const ctx = [];
    if (verb) ctx.push(`핵심 수행 동사: ${verb}`);
    if (descriptor) ctx.push(`대상·내용(서술자): ${descriptor}`);
    if (intent) ctx.push(`행위지향(태도): ${intent}`);
    const fociList = (evalFoci || []).map((f) => f.trim()).filter(Boolean);
    if (fociList.length) ctx.push(`평가초점: ${fociList.join(' / ')}`);
    return (
      '다음 특수교육 학기목표를 학생이 순서대로 수행할 "과제분석 단계"로 분해하라.\n' +
      '규칙:\n' +
      '1) 각 단계는 관찰 가능한 하나의 행동, 4~8개.\n' +
      `2) 모든 단계는 "${target}"을(를) 실제로 완성하기 위한 하위 행동이어야 한다. 마지막 단계는 목표 행동(위 핵심 동사) 자체를 직접 수행한다.\n` +
      '3) "손 씻기", "자리에 앉기" 같은 일반적 준비 행동이나 목표와 무관한 행동은 절대 넣지 말 것.\n' +
      '4) 아래 맥락(동사·대상·평가초점)을 반드시 반영할 것.\n' +
      '5) 단계 설명은 영어 단어·어려운 한자어 없이, 일상에서 자주 쓰는 쉬운 우리말로 쓸 것.\n' +
      `학기목표: ${target}\n` +
      (sel?.text ? `성취기준: ${sel.text}\n` : '') +
      (ctx.length ? `맥락:\n- ${ctx.join('\n- ')}\n` : '') +
      '출력은 JSON만. 아래 형식에서 < > 안을 실제 단계 행동으로 채우되, 형식 예시 문구를 그대로 복사하지 말 것:\n' +
      '{"steps":["<1단계 행동>","<2단계 행동>","<3단계 행동>"]}'
    );
  }

  // 학기목표·성취기준을 순차 단계(과제분석)로 분해 — LLM 사용, 실패 시 기본 골격.
  async function aiStepsNow() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (!aiOn) { ruleStepsNow(); return; }
    setTaskBusy(true);
    try {
      const j = await llmJSON('과제분석 단계 분해', buildStepsPrompt(), { temperature: 0.3 });
      const steps = Array.isArray(j.steps) ? j.steps.map((s) => String(s).trim()).filter(Boolean) : [];
      if (!steps.length) throw new Error('단계를 추출하지 못했어요.');
      setTaskSteps(steps);
      syncTaskTargets(steps.length);
      toast(`과제를 ${steps.length}개 단계로 분해했어요. 필요하면 편집하세요.`);
    } catch (e) {
      toast('단계 분해 실패: ' + e.message + ' — 기본 골격으로 대체합니다.');
      ruleStepsNow();
    } finally {
      setTaskBusy(false);
    }
  }

  function generate() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    const groups = parseMonthGroups(monthGroups, months, sem), n = groups.length;
    if (!n) { toast('포함할 월을 한 개 이상 선택하세요.'); return; }
    if (!supportTier) toast('참고: 지원체계(모듈4)가 미지정이에요 — 지정하면 현행수준·교육방법에 지원 강도가 반영됩니다.');
    beginDraft('rule'); // 보고 있던 초안(예: AI n차)을 보관하고 규칙 초안 칸을 활성화
    const base = baseOf(goal);
    const s = +cStart, e = +cEnd;
    const isQual = critType === 'qual';
    const isTask = critType === 'task';
    const methods = isTask ? methodsForTask(curStu?.disability, promptSystem) : methodsForType(curStu?.disability);
    const foci = (evalFoci || []).map((f) => f.trim()).filter(Boolean);
    const steps = (taskSteps || []).map((t) => t.trim()).filter(Boolean);
    // P15: 학기 교육내용·교육방법(교사 방향) — 월별에 배분/반영.
    const semCLines = String(semContent || '').split(/\n/).map((s) => s.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean);
    const semMLines = String(semMethods || '').split(/\n/).map((s) => s.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean);
    const semStrategy = (semMLines.find((l) => /^지도\s*전략/.test(l)) || '').replace(/^지도\s*전략\s*[:：]\s*/, '')
      || (semMLines.length && !semMLines.some((l) => /^(지원\s*수준|강화)/.test(l)) ? semMLines.join(', ') : '');
    const semCFor = (i) => semCLines.filter((_, k) => k % n === i || (semCLines.length <= n && k === i));
    const totalSteps = steps.length || Math.max(+e || 0, 4); // 단계 미입력 시 목표 단계 수로 대체
    const stepChain = steps.length ? steps.map((t, k) => `${k + 1}) ${t}`).join(' → ') : '단계 목록 참조';
    // 0903(B안): 성취기준별 목표가 2개 이상이면 교육목표 줄의 소재를 구간 순서대로 배정한다(목표가 구간보다 많으면 한 구간에
    // 여러 목표를 이어 쓰고, 적으면 한 목표가 여러 구간에 걸침). 지원 수준·평가 기준·촉진 단계의 점증은 종전처럼 학기 전체 흐름.
    const sgList = (flowMode === 'std' ? stdGoals : []).filter((x) => x && x.code && String(x.goal || '').trim());
    const rangeFor = (i) => {
      const m = sgList.length;
      if (m < 2) return [];
      const lo = Math.floor((i * m) / n);
      const hi = i === n - 1 ? m - 1 : Math.max(lo, Math.floor(((i + 1) * m) / n) - 1);
      return sgList.slice(lo, hi + 1);
    };
    const frac = (i) => (i + 1) / n; // 첫 구간부터 시작수준보다 한 걸음 위로 점증(피드백: 첫 달 목표 = 시작수준은 오류)
    const baseFor = (i) => { const r = rangeFor(i); return r.length ? (baseOf(joinGoals(r)) || base) : base; };
    const stepCount = (i) => Math.max(0, Math.min(totalSteps, Math.round(s + (e - s) * frac(i))));
    const crit = (i) => {
      const v = Math.round(s + (e - s) * frac(i));
      if (isTask) return `${totalSteps}단계 중 ${stepCount(i)}단계 독립 수행`;
      return critType === 'rate' ? `독립 수행 ${v}%` : `10회 중 ${Math.max(1, Math.min(10, v))}회 성공`;
    };
    const support = (i) => SUP[Math.min(SUP.length - 1, Math.round(frac(i) * (SUP.length - 1)))];
    const stem = (verb || sel.verb || '').replace(/하기$|기$/, '');
    const obj = (descriptor || base).trim();
    const phaseIdx = (i) => Math.min(CONTENT_SUFFIX.length - 1, Math.floor(i / (n / CONTENT_SUFFIX.length)));
    const phase = (i) => CONTENT_SUFFIX[phaseIdx(i)];
    // 평가초점을 구간에 고르게 배분(질적 평가 서술의 기준점)
    const fociFor = (i) => (foci.length ? foci.filter((_, k) => k % n === i || (foci.length <= n && k === i)) : []);
    // 교육방법 3구조(피드백1) + 구간별 점증(0819 피드백): 지도전략 · 지원수준(촉구·용암) · 강화 스케줄.
    // 매달 같은 문장이 반복되지 않도록 구간마다 "그 구간의 단계"만 서술한다.
    // 시작 단계는 출발점(모듈1) '수행 가능 수준'(없으면 현행수준)에서 앵커링, 마지막 구간은 항상 독립·일반화.
    const startStage = fadeStartStage(startpoint?.perfLevel || plop, s, e);
    const stageFor = (i) => (n <= 1
      ? FADE_STAGES.length - 1
      : Math.min(FADE_STAGES.length - 1, startStage + Math.round((i / (n - 1)) * (FADE_STAGES.length - 1 - startStage))));
    const stagesArr = groups.map((_, i) => stageFor(i));
    // 같은 단계가 여러 구간 이어질 때의 위치(0,1,2…) — 변형 문안 선택용(인접 구간 문장 중복 방지).
    const runPos = stagesArr.map((st, i) => { let p = 0; for (let k = i - 1; k >= 0 && stagesArr[k] === st; k--) p++; return p; });
    const reinfGroupOf = (st) => (st <= 1 ? 0 : st === 2 ? 1 : 2); // 습득/유지/일반화 묶음
    const reinfPos = stagesArr.map((st, i) => { let p = 0; for (let k = i - 1; k >= 0 && reinfGroupOf(stagesArr[k]) === reinfGroupOf(st); k--) p++; return p; });
    const raisdMeta = curStuData?.raisd?.responses?._meta || {};
    const topReinf = Array.isArray(raisdMeta.ranking) ? (raisdMeta.ranking.filter(Boolean)[0] || '') : '';
    // 0819(4차): 학기 교육방법에 "→" 단계 흐름이 있으면 그 체인을 월별 구간에 배분(학기↔월별 연결).
    // 없으면 종전대로 학생 수준 앵커링 점증 사다리. 과제분석 목표는 교사 선택 촉진 체계 유지.
    const semSupChain = isTask ? [] : methodChain(semMLines.find((l) => /^지원\s*수준/.test(l)) || '');
    const semReinfChain = methodChain(semMLines.find((l) => /^강화/.test(l)) || '');
    const methodsFor = (i) => {
      const stg = stagesArr[i];
      const nxt = i < n - 1 ? stagesArr[i + 1] : stg;
      // 구간이 1개뿐이면(전체 월을 한 구간으로 묶음) 단계 서술 대신 학기 전체 흐름을 쓴다.
      const fadeLine = isTask
        ? promptDesc(promptSystem, i, n, support)
        : n <= 1
        ? (semSupChain.length
          ? `${semSupChain.join(' → ')} (학기 전체 흐름)`
          : `${FADE_STAGES.slice(startStage).map((x) => x.short).join(' → ')} 순서로 촉구를 점차 줄여 독립 수행으로 (학기 전체 흐름 — 월을 구간으로 나누면 단계별로 서술됩니다)`)
        : semSupChain.length
        ? chainLine(semSupChain, i, n, SUP_CHAIN_EXTRAS)
        : `[${FADE_STAGES[stg].label}] ${fadeDesc(stg, runPos[i])}${nxt !== stg ? ` (다음 구간: ${FADE_STAGES[nxt].short})` : ''}`;
      const reinfLine = n <= 1
        ? (semReinfChain.length
          ? `${semReinfChain.join(' → ')} (학기 전체 흐름)`
          : startStage >= 2
          ? `간헐강화(변동비율)에서 자연적 강화·자기강화로 전환 (학기 전체 흐름)`
          : `습득 단계 즉시(연속)강화 → 유지 단계 간헐강화 → 자연적 강화로 전환 (학기 전체 흐름)`)
        : semReinfChain.length
        ? chainLine(semReinfChain, i, n, REINF_CHAIN_EXTRAS)
        : reinforceStage(stg, reinfPos[i], topReinf);
      return [
        // P15: 교사가 학기 교육방법에 적은 지도전략을 우선 반영 + 구간별 중점을 문두에.
        `지도전략: 핵심 방법(학기 고정): ${semStrategy || methods.join(', ')} / 이번 구간 중점: ${PHASE_STRATEGY[phaseIdx(i)]}`,
        `지원수준(촉구·용암): ${fadeLine}`,
        `강화 스케줄: ${reinfLine}`,
      ];
    };
    const list = groups.map((grp, i) => {
      const m = monthGroupLabel(grp, sem);
      // 이 달에 배분된 평가초점 — 교육내용·평가가 평가초점에서 출발하도록 공유.
      const fThis = fociFor(i);
      const fLead = fThis.length ? fThis.join(' / ') : (foci.length ? foci[Math.min(i, foci.length - 1)] : '');
      const goal = [
        `- ${support(i)}${baseFor(i)}.`,
        isQual ? null : `- ${crit(i)} 수준으로 수행하기.`,
        intent ? `- ${intent} 태도를 유지하며 활동에 참여하기.` : null,
      ].filter(Boolean).join('\n');
      const content = (isTask
        ? [
            fLead ? `- 평가초점 '${fLead}'에 도달하도록 아래 과제 단계 수행을 지도` : null,
            ...semCFor(i).map((c) => `- ${c}`), // P15: 학기 교육내용 배분
            `- 과제분석 ${totalSteps}단계를 순서대로 지도(${CHAIN_LABEL[chainType]}): ${stepChain}`,
            `- 이번 달 중점(${phase(i)}): ${chainDesc(chainType, totalSteps, stepCount(i))}`,
            `- 촉진: ${promptDesc(promptSystem, i, n, support)}`,
            i === n - 1 ? `- 유지·일반화: 다양한 장소·사람·자료로 ${stem ? stem + '하기 ' : ''}반복하고, 그림 촉진·비디오 모델링으로 자기주도 수행 지원` : null,
          ].filter(Boolean)
        : [
            // 0720: "${obj} 학습내용을 지도"가 "주요 내용 학습내용을 지도" 같은 비문을 만들고,
            // 평가초점이 월마다 바뀌는데 지도 문구는 고정되던 문제 → 평가초점 자체를 지도 대상으로 서술.
            fLead ? `- 평가초점 '${fLead}'에 도달하기 위한 학습내용을 지도` : null,
            // P15: 교사가 적은 학기 교육내용을 월별로 배분해 활동으로 반영.
            ...semCFor(i).map((c) => `- ${c}`),
            `- ${sel.area ? sel.area + ' ' : ''}${obj} ${phase(i)}`,
            `- 교사 시범 후 ${stem ? stem + '하기를 ' : ''}단계별(과제분석)로 따라 하기`,
            `- ${i < n - 1 ? '구조화된 학습 자료로' : '실제·모의 상황에서'} ${stem ? stem + '하기 ' : ''}반복·적용하기`,
          ].filter(Boolean)).join('\n');
      const evalText = isQual
        ? [
            fThis.length ? `- 평가초점: ${fThis.join(' / ')}` : (foci.length ? `- 평가초점: ${foci.join(' / ')}` : `- 평가초점을 중심으로 수행 양상을 질적으로 기록`),
            `- 수업 맥락(교사 중재·학생 반응·또래/환경 상호작용)을 포함해 학습 과정과 결과를 서술 평가`,
            `- 초기 ${i === 0 ? '촉진 필요' : '부분 수행'} → 반복 후 ${i < n - 1 ? '독립성 증가' : '대부분 독립 수행'} 등 변곡점을 내러티브로 기록`,
          ].join('\n')
        : isTask
        ? [
            `- ${totalSteps}단계 중 ${stepCount(i)}단계 독립 수행을 단계별 점검표로 확인 (${CHAIN_LABEL[chainType]})`,
            `- 촉진 수준 변화 기록(${PROMPT_LABEL[promptSystem]}): ${promptDesc(promptSystem, i, n, support)}`,
            steps.length ? `- 미습득 단계 분석 후 과제분석 세분화·추가 지도(다음 지도 단계: ${steps[Math.min(steps.length - 1, stepCount(i))] || steps[steps.length - 1]})` : `- 미습득 단계 분석 후 추가 지도 계획 반영`,
          ].join('\n')
        : [
            `- ${crit(i)} 기준 도달 여부 확인`,
            foci.length ? `- 평가초점(${fThis.length ? fThis.join(' / ') : foci[0]}) 중심의 질적 수행 기록 병행` : `- 수행 과정과 지원 수준의 변화를 서술 기록`,
          ].join('\n');
      // 평가계획(피드백1): 교육목표·교육내용(평가초점)에 근거한 "~는가?" 질문.
      // 다각적 측면(수행 + 태도/지속성/일반화)을 시기별로 섞는다.
      const planQs = (fThis.length ? fThis : foci.slice(0, 2)).map(toEvalQuestion).filter(Boolean);
      const facetQ = i === n - 1
        ? '- 배운 내용을 다른 상황·자료·사람에게도 적용하는가?'
        : (frac(i) < 0.5
          ? '- 활동에 거부감 없이 관심을 보이며 참여하는가?'
          : '- 활동에 일정 시간 이상 지속해서 참여하는가?');
      const evalPlan = [
        ...(planQs.length ? planQs.map((q) => '- ' + q) : [`- ${obj}${josaEulReul(obj)} ${stem ? stem + '할' : '수행할'} 수 있는가?`]),
        facetQ,
      ].join('\n');
      return { month: m, goal, content, methods: methodsFor(i), eval: evalText, eval_plan: evalPlan };
    });
    setMonthly(list);
    // P3: AI 없이도 규칙 초안이 모듈1 출발점·지원 수준(Tier)을 이어받게 한다(결정적, LLM 없음).
    // 0720 사용성 테스트: 요구 전체를 괄호에 밀어넣고 학기목표 전문을 인용해 조합하던 방식이
    // "…보일 수 있다와 관련해…" 같은 비문을 만들었음 → 항목별 불릿("- " 여러 줄)로 재작성.
    {
      const tierNum = supportTier ? (supportTier.match(/[123]/) || [])[0] : '';
      const tierLine = tierNum === '2'
        ? '소그룹 표적 지원(체크인·체크아웃(CICO)·일일 행동점검표)을 함께 받고 있음.'
        : tierNum === '1'
        ? '학급 보편 지원(시각 일과표·학급 규칙·일관된 칭찬)을 받고 있음.'
        : tierNum === '3'
        ? '1:1 개별 집중 지원(맞춤 촉진·강화, 필요 시 행동중재계획(BIP) 연계)을 받고 있음.'
        : '';
      const needsLines = String(startpoint?.supportNeeds || '')
        .split(/\n/)
        .map((s) => s.replace(/^\s*[-•·]\s*/, '').trim())
        .filter(Boolean);
      if (tierLine || needsLines.length) {
        const seed = [
          ...needsLines.map((l) => `- ${l}`),
          tierLine ? `- ${tierLine}` : null,
          `- 위 지원 요구를 고려할 때, 이 학기목표 관련 과제는 교사의 촉진이 있을 때 부분적으로 수행하며 독립 수행은 어려움.`,
        ].filter(Boolean).join('\n');
        setPlop(seed);
      }
    }
    setSemEval(isQual
      ? `평가초점을 중심으로 한 학기 학습 과정과 결과를 내러티브(서술형)로 종합 평가 — 수치·등급이 아니라 학생의 성장·변화 양상과 변곡점을 질적으로 기술.`
      : isTask
      ? `학기말 ${totalSteps}단계 중 ${Math.max(0, Math.min(totalSteps, e))}단계 독립 수행 도달 여부와 함께, 단계별 촉진 수준의 감소 양상과 미습득 단계의 변화를 과제분석 점검표 기준으로 종합 평가. 유지·일반화(다양한 상황에 적용)와 스스로 하기(그림 촉진·동영상 따라하기) 수행 정도도 함께 기술.`
      : `학기말 ${critType === 'rate' ? `${e}%` : `10회 중 ${e}회`} 기준 도달 여부와 함께, 평가초점 중심의 학습 과정 변화·일반화 정도를 질적으로 서술 평가.`);
  }

  // ── 초안 보관·전환 (규칙 초안 · AI 1차 · AI 2차… 비교) ─────────────
  function draftSnapshot() {
    return { goal, plop, monthly, semEval, taskSteps };
  }
  // 새 초안 생성 직전에 호출: 보고 있던 초안을 제자리에 보관하고, 새 초안 칸을 만들어 활성화.
  // (활성 초안의 내용은 화면(작업 영역)에 있으므로 data는 전환 시점에 채워진다.)
  function beginDraft(kind) {
    const snap = monthly.length ? draftSnapshot() : null;
    let next = drafts.map((d, i) => (i === curDraft && snap ? { ...d, data: snap } : d));
    let idx;
    if (kind === 'rule') {
      idx = next.findIndex((d) => d.kind === 'rule');
      if (idx < 0) { next = [{ kind: 'rule', label: '규칙 초안', data: null }, ...next]; idx = 0; }
      else next[idx] = { ...next[idx], data: null };
    } else {
      const aiIdxs = next.map((d, i) => (d.kind === 'ai' ? i : -1)).filter((i) => i >= 0);
      if (aiIdxs.length >= 4) next = next.filter((_, i) => i !== aiIdxs[0]); // 최근 4차까지만 보관
      aiSeq.current += 1;
      next = [...next, { kind: 'ai', label: `AI ${aiSeq.current}차`, data: null }];
      idx = next.length - 1;
    }
    setDrafts(next);
    setCurDraft(idx);
  }
  function switchDraft(i) {
    if (i === curDraft || !drafts[i]) return;
    const d = drafts[i];
    if (!d.data) { toast('이 초안은 아직 비어 있어요.'); return; }
    const snap = draftSnapshot();
    setDrafts(drafts.map((x, k) => (k === curDraft ? { ...x, data: snap } : x)));
    setGoal(d.data.goal); setPlop(d.data.plop); setMonthly(d.data.monthly); setSemEval(d.data.semEval);
    if (Array.isArray(d.data.taskSteps) && d.data.taskSteps.length) setTaskSteps(d.data.taskSteps);
    setCurDraft(i);
  }
  function resetDrafts() { setDrafts([]); setCurDraft(-1); aiSeq.current = 0; }

  function editMonth(i, key, val) {
    setMonthly((prev) => prev.map((row, idx) => (idx === i
      ? { ...row, [key]: key === 'methods' ? val.split(/\r?\n/).map((x) => x.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean) : val }
      : row)));
  }

  // 열 너비: localStorage에서 복원
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('iep_colw'));
      if (Array.isArray(s) && s.length === 6) setColW(s);
    } catch (_) {}
  }, []);
  // 헤더 경계 드래그: idx 열과 오른쪽 이웃(idx+1) 열이 폭을 주고받아 전체 폭은 고정 유지.
  function startResize(idx, e) {
    e.preventDefault();
    const startX = e.clientX;
    const a = colW[idx];
    const b = colW[idx + 1];
    const move = (ev) => {
      let d = ev.clientX - startX;
      d = Math.max(d, 48 - a);
      d = Math.min(d, b - 48);
      setColW((prev) => {
        const n = [...prev];
        n[idx] = a + d;
        n[idx + 1] = b - d;
        return n;
      });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setColW((prev) => { try { localStorage.setItem('iep_colw', JSON.stringify(prev)); } catch (_) {} return prev; });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  function resetColW() {
    const d = [50, 210, 210, 170, 190, 220];
    setColW(d);
    try { localStorage.setItem('iep_colw', JSON.stringify(d)); } catch (_) {}
  }

  // 같은 의미 동사 목록(vs)을 받아, 각 동사를 쓰는 자연스러운 평가초점 1문장씩 생성해 배열로 반환.
  // 동사를 한 문장씩 분리해 시키므로(작은 로컬 모델도) 동사가 실제로 다양해진다.
  async function requestFociFromVerbs(vs, useIntent, useDesc) {
    const prompt =
      '아래 성취기준의 "평가초점"을 작성합니다. 주어진 동사 목록의 각 동사마다, 그 동사를 사용하는 자연스러운 평가초점 문장을 정확히 1개씩 만드세요.\n' +
      '- 출력 foci의 개수 = 동사 목록의 개수, 순서도 동일.\n' +
      '- 각 문장은 해당 동사를 평서형(~한다)으로 끝내고, 대상에 맞는 조사·목적어를 자연스럽게 붙일 것(억지 조합 금지).\n' +
      '- 같은 의미를 서로 다른 구체 행동으로 표현. "지원 수준(도움받아/부분/독립)"으로 나누지 말 것.\n' +
      '- 영어 단어·어려운 한자어 없이 일상에서 자주 쓰는 쉬운 우리말로, 맞춤법·문장 오류 없이 쓸 것.\n' +
      (useIntent ? `- 행위지향 "${useIntent}"의 취지를 자연스럽게 반영(모든 문장에 억지로 넣지는 말 것).\n` : '') +
      `성취기준: [${sel.code}] ${sel.text}\n` +
      `서술자(대상): ${useDesc || sel.text}\n` +
      `동사 목록: ${vs.join(', ')}\n` +
      '반드시 JSON 객체 하나만 출력. 예: {"foci":["생활 주변의 물체를 형태에 따라 나눈다.","생활 주변의 물체를 종류에 따라 구분한다.","비슷한 물체끼리 묶는다.","기준에 맞는 물체를 가려낸다."]}';
    const j = await llmJSON('평가초점 생성', prompt, { tier: 'fast', temperature: 0.45 });
    return Array.isArray(j.foci) ? j.foci.map(String).map((s) => s.trim()).filter(Boolean) : [];
  }

  // 동사 칸의 대표 동사를 "같은 의미의 측정 가능한 동사" 목록으로 펼친다(좁은 단일 과제 → 로컬 모델도 안정적).
  async function aiExpandVerbs() {
    const base = (verb || (sel && sel.verb) || '').trim();
    if (!base) { toast('먼저 측정 가능한 동사를 입력하거나 ✨ AI 분석을 실행하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setVerbBusy(true);
    try {
      const prompt =
        '특수교육 평가초점 작성을 돕습니다. 아래 "대표 동사"와 같은 의미·같은 성취 의도로 바꿔 쓸 수 있는 측정 가능한 동사(구체 행동 표현)를 6~8개 제시하세요.\n' +
        '- 모두 명사형(~하기/~기). 대표 동사 자신도 포함. 서로 다른 구체 행동이되 의미는 동일.\n' +
        '예: "분류하기" → {"verbs":["분류하기","나누기","구분하기","묶기","가려내기","골라내기","모으기"]}\n' +
        '예: "시도하기" → {"verbs":["시도하기","말 걸기","대답하기","표현하기","반응하기"]}\n' +
        '반드시 JSON 객체 하나만 출력.\n\n' +
        `대표 동사: ${base}` + (sel ? `\n맥락(성취기준): [${sel.code}] ${sel.text}` : '');
      const j = await llmJSON('동사 펼치기', prompt, { tier: 'fast', temperature: 0.4 });
      let alts = Array.isArray(j.verbs) ? j.verbs.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (base && !alts.includes(base)) alts = [base, ...alts];
      alts = [...new Set(alts)];
      if (!alts.length) { toast('같은 의미 동사를 받지 못했어요.'); return; }
      setVerbAlts(alts);
      // 성취기준이 선택돼 있으면 곧바로 동사별 평가초점까지 자연스럽게 생성.
      if (sel) {
        try { const foci = await requestFociFromVerbs(alts, intent, descriptor); if (foci.length) setEvalFoci(foci); } catch (_) {}
      }
      toast(`같은 의미 동사 ${alts.length}개로 펼쳤어요.`);
    } catch (e) {
      toast('동사 펼치기 실패: ' + e.message);
    } finally {
      setVerbBusy(false);
    }
  }

  async function aiDecompose() {
    if (!sel) return;
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setAiDecBusy(true);
    try {
      // 1단계: 성취기준 분석 — 대표 동사 + "같은 의미 동사" 목록 + 행위지향 + 서술자만 추출(평가초점 문장은 다음 단계에서).
      const aPrompt =
        '다음 2022 개정 교육과정 성취기준을 분석하세요. 평가초점 문장은 만들지 말고 "요소"만 추출합니다.\n' +
        '- verb: 측정 가능한 대표 동사. 명사형(예: 분류하기, 탐색하기).\n' +
        '- verbs: 위 verb와 "같은 의미·같은 성취 의도"로 바꿔 쓸 수 있는 측정 가능한 동사 6~8개. 모두 명사형(~하기/~기), 대표 동사 자신도 포함. 서로 다른 구체 행동이되 의미는 동일.\n' +
        '   예: "분류하기" → ["분류하기","나누기","구분하기","묶기","가려내기","골라내기"]\n' +
        '   예: "시도하기" → ["시도하기","말 걸기","대답하기","표현하기","반응하기"]\n' +
        '- intent: 행위지향(가치·태도). 필수 — 성취기준에 명시된 부사어가 있으면 그대로, 없으면 성취기준의 취지에서 반드시 유추해 한 구절(부사구)로 쓸 것. 빈 문자열 금지.\n' +
        '   예: "자신을 소개한다" → "자신 있게" / "물체를 분류한다" → "형태나 종류에 따라" / "규칙을 지키며 논다" → "규칙을 지키며"\n' +
        '- descriptor: 서술자(핵심 대상·내용).\n' +
        '- 모든 값은 맞춤법·문장 오류 없이, 영어 단어 없이 쉬운 우리말로 쓸 것.\n' +
        '반드시 JSON 객체 하나만 출력. 예: {"verb":"분류하기","verbs":["분류하기","나누기","구분하기","묶기","가려내기"],"intent":"형태나 종류에 따라","descriptor":"생활 주변의 물체"}\n\n' +
        `성취기준: [${sel.code}] ${sel.text}`;
      const a = await llmJSON('AI 분석', aPrompt, { tier: 'fast', temperature: 0.2 });
      const aVerb = a.verb != null ? String(a.verb).trim() : verb;
      let alts = Array.isArray(a.verbs) ? a.verbs.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (aVerb && !alts.includes(aVerb)) alts = [aVerb, ...alts];
      alts = [...new Set(alts)];
      // 행위지향(intent)은 첫 응답에서 자주 빠지는 필드 — 비어 오면 intent만 뽑는 재호출 1회.
      let aIntent = a.intent != null ? String(a.intent).trim() : '';
      if (!aIntent) {
        try {
          const ip = await llmJSON('행위지향 추출', (
            '아래 성취기준의 "행위지향(가치·태도)"을 한 구절(부사구)로 반드시 추출하거나 취지에서 유추하세요. 빈 값 금지.\n' +
            '예: "자신을 소개한다" → {"intent":"자신 있게"} / "물체를 분류한다" → {"intent":"형태나 종류에 따라"}\n' +
            '반드시 JSON 객체 하나만 출력. {"intent":"..."}\n\n' +
            `성취기준: [${sel.code}] ${sel.text}`
          ), { tier: 'fast', temperature: 0.3 });
          aIntent = ip.intent != null ? String(ip.intent).trim() : '';
        } catch (_) { /* best-effort */ }
      }
      if (!aIntent) aIntent = intent; // 그래도 비면 기존 값 유지(빈 응답이 덮어쓰지 않게)
      const aDesc = a.descriptor != null ? String(a.descriptor) : descriptor;
      if (a.verb != null) setVerb(aVerb);
      setVerbAlts(alts);
      if (aIntent) setIntent(aIntent);
      if (a.descriptor != null) setDescriptor(aDesc);

      // 2단계: 같은 의미 동사마다 자연스러운 평가초점 1문장 — 동사가 실제로 다양해지도록 분리 호출.
      let foci = [];
      if (alts.length >= 2) {
        try { foci = await requestFociFromVerbs(alts, aIntent, aDesc); } catch (_) {}
      }
      if (foci.length) setEvalFoci(foci);
      else setEvalFoci(buildEvalFoci(aVerb, aIntent, aDesc, sel.text, alts));
      toast(`성취기준을 분석하고 같은 의미 동사 ${alts.length}개로 평가초점을 펼쳤어요.`);
    } catch (e) {
      toast('AI 분석 실패: ' + e.message);
    } finally {
      setAiDecBusy(false);
    }
  }

  // 학생의 누적 데이터를 비식별 요약으로 묶는다 (AI 프롬프트용).
  // 단일 출처(lib/tierContext.js)로 위임 — 기존 동작·출력 동일.
  function buildStudentSummary(data) {
    return tcBuildStudentSummary({ student: curStu, data, startpoint });
  }

  // 이 학생에게 실제 운영 중인 다층 지원(Tier 1 학급 PBS · Tier 2 소그룹/CICO)을
  // 불러와 프롬프트에 풀어 넣는다. classPBS는 호출부에서 받아온다(반·학기 단위).
  // 단일 출처(lib/tierContext.js)로 위임 — 기존 동작·출력 동일.
  function buildTierLinkage(data, classPBS) {
    return tcBuildTierLinkage({ studentId: curStuId, data, classPBS, tier2Groups });
  }

  // QABF 추정 주요기능 라벨(예: '회피'). 응답 자료가 없거나 0점이면 ''.
  function topQabfLabel(data) {
    const resp = data?.qabf;
    if (!Array.isArray(resp) || !resp.some((v) => v >= 0)) return '';
    const { sev } = qabfScores(resp);
    let top = 0;
    for (let i = 1; i < 5; i += 1) if (sev[i] > sev[top]) top = i;
    return sev[top] > 0 ? (QABF_SHORT_LABELS[top] || '') : '';
  }

  // ── 학기목표 2경로 (0719 피드백) ────────────────────────────────
  // 경로A: 선택한 성취기준 + 학생 자료 → 학기목표 초안 AI 생성.
  // 0903(B안): 성취기준별 목표 + 학기목표 요약을 한 번에 생성.
  //   - 코드가 성취기준마다 "반드시 그대로 쓸 낱말"(변별 명사·인지 동사)을 뽑아 프롬프트에 넣고, 결과를 같은 낱말로 검증한다.
  //   - 공통교육과정 성취기준은 엄격(낱말 모두 반영), 기본교육과정은 완화(소재 낱말이 하나라도 있으면 통과 — 가이드북식 재구성 허용).
  //   - 실패한 성취기준만 빠진 낱말을 명시해 1회 재시도한다. 두 후보 모두 이탈(0점)이면 그 줄은 현재 문장을 유지하고,
  //     낱말이 일부 빠진 후보(1점)는 채택하되 경고를 띄운다. 쓸 수 있는 줄이 하나도 없으면 아무것도 바꾸지 않는다.
  //   - 요약 문장은 AI 것이 소재를 빠뜨리면 결정론 요약(joinGoals)으로 대체한다. 결과가 빈손이 되는 일은 없다.
  //   - 코드 없는 전년도 목표(PRIOR)는 작년 문장을 유일한 '성취기준'으로 삼아 올해 학기목표 한 문장만 만든다(성취기준별 목록은 건드리지 않음).
  async function aiGoalFromStd() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    const realStds = [sel, ...selExtra].filter((x) => x && x.code && x.code !== 'PRIOR');
    const prior = !realStds.length;
    const stds = prior ? [{ ...sel, curriculum: '기본' }] : realStds;
    setGoalAiBusy(true);
    try {
      const data = curStuData || (await ensureStudentData(curStuId)) || {};
      const summary = buildStudentSummary(data);
      const priors = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear).slice(0, 8);
      const priorBlock = priors.length
        ? '\n[전년도 목표 참고]\n' + priors.map((g) => `· (${g.school_year}) ${g.subject}: ${g.semester_goal}`).join('\n')
        : '';
      const commonAt = (i) => ((stds[i].curriculum || sel.curriculum || '기본') === '공통');
      const anyCommon = stds.some((_, i) => commonAt(i));
      // 전년도 목표(PRIOR)는 작년 문장이 참고일 뿐이라 필수 낱말을 뽑지 않는다(지원 조건·부정 표현 토큰이 '그대로 쓸 낱말'로 실리던 문제).
      const terms = stds.map((x) => (prior ? { nouns: [], verbs: [], required: [], attitude: false } : stdKeyTerms(x, termIndex)));
      const stdBlock = stds.map((x, i) => `- [${prior ? '전년도 목표' : x.code}] ${x.text}${terms[i].required.length ? ` (반드시 그대로 쓸 낱말: ${terms[i].required.join(', ')})` : ''}`).join('\n');
      const jsonShape = '{"goals":{' + stds.map((x) => `"${x.code}":"..."`).join(',') + '},"summary":"..."}';
      const basePrompt = (missingNote) =>
        '너는 특수교육 IEP 작성 전문가다. 아래 성취기준마다 이 학생이 한 학기 동안 도달할 "성취기준별 목표"를 1문장씩 쓰고, 마지막에 그 묶음을 요약한 "학기목표" 1문장을 써라.\n' +
        '규칙:\n' +
        '1) [가장 중요] 각 목표는 그 성취기준의 소재를 그대로 다룬다. 괄호 안 "반드시 그대로 쓸 낱말"은 한 글자도 바꾸지 말 것. 정당화·판별처럼 성취기준에 있는 동사를 설명·말하기로 낮추지 말 것 — 학생에게 어렵다면 동사를 낮추지 말고 지원 조건(그림·힌트 카드·확대 자료·충분한 시간·교사의 안내 질문 등)을 앞에 붙일 것.\n' +
        '2) 학생 자료는 지원 조건과 난이도 조정에만 쓴다. 학생 자료의 행동중재 내용(대체행동·의사소통 카드·안정실 등)을 목표의 소재로 삼지 말 것.\n' +
        (anyCommon
          ? '3) 이 학생은 공통교육과정을 따른다. 내용 범위를 줄이지 말고 수행 방식·지원 조건만 조정할 것.\n'
          : '3) 학생이 언어적 촉구만으로 이미 하는 내용은 목표가 아니다(현행수준). 신체적 지원·촉진이 필요한 수준에서 목표를 잡되, 소재는 성취기준의 낱말을 유지하고 학생 생활 속 구체 상황으로 써도 된다.\n') +
        '4) 모든 문장은 "~할 수 있다."로 끝맺는다. "~하거나/또는"처럼 선택형으로 여러 행동을 묶지 말 것. 부정 진술("~하지 않는다") 금지. 교수전략 이름·영어 단어·어려운 한자어 금지(단, 성취기준에 있는 낱말은 그대로 쓴다).\n' +
        '5) summary(학기목표)는 위 목표들을 한 문장으로 요약하되 "반드시 그대로 쓸 낱말"을 빠뜨리지 말 것. 성취기준이 1개면 그 목표와 같아도 된다.\n' +
        `[성취기준]\n${stdBlock}\n` +
        `[학생 자료]\n${summary}\n` +
        (plop ? `[현행수준] ${plop}\n` : '') + priorBlock + '\n' +
        (missingNote ? `※ 직전 답변에서 빠진 낱말: ${missingNote} — 이번에는 그 낱말을 반드시 그대로 넣어 다시 써라.\n` : '') +
        `반드시 JSON만 출력(코드마다 1문장): ${jsonShape}`;

      // 소형 모델의 흔한 출력 변형을 흡수: goals 키 없음, 코드에 괄호/공백, 값이 객체, 배열(순서대로), {code, goal} 배열.
      const normCode = (k) => String(k || '').replace(/[\[\]\s]/g, '');
      const pickGoals = (j) => {
        const out = {};
        const put = (k, v) => {
          const val = typeof v === 'string' ? v : (v && typeof v === 'object' ? String(v.goal || v.text || '') : '');
          const nk = normCode(k);
          const hit = stds.find((x) => normCode(x.code) === nk) || stds.find((x) => nk.includes(normCode(x.code)));
          if (hit && val.trim()) out[hit.code] = val.trim();
        };
        const g = (j && typeof j === 'object' && j.goals !== undefined) ? j.goals : j;
        if (Array.isArray(g)) {
          if (g.every((x) => typeof x === 'string') && g.length === stds.length) g.forEach((v, i) => put(stds[i].code, v));
          else g.forEach((x) => { if (x && typeof x === 'object' && x.code) put(x.code, x); });
        } else if (g && typeof g === 'object') {
          Object.keys(g).forEach((k) => { if (k !== 'summary') put(k, g[k]); });
        }
        return out;
      };
      // 성취기준별 점수: 2=필수 낱말 충족(공통은 빠진 낱말 0개), 1=소재 낱말 일부 반영, 0=이탈/빈 문장.
      const score = (text, i) => {
        if (!text) return { s: 0, c: null };
        if (prior) return { s: 2, c: null }; // 전년도 문장 기준 생성은 AI 결과를 그대로 받는다
        const c = goalCoverage(text, stds[i], termIndex);
        if (c.terms.attitude || !c.terms.required.length) return { s: 2, c }; // 태도형·요구 낱말 없음 = 항상 통과
        const hit = c.nounHits.length + c.verbHits.length;
        const full = commonAt(i) ? (c.ok && c.missing.length === 0) : c.ok;
        if (full) return { s: 2, c };
        if (hit > 0) return { s: 1, c };
        return { s: 0, c };
      };
      const passes = (sc, i) => (commonAt(i) ? sc.s === 2 : sc.s >= 1);

      let j = await llmJSON('성취기준별 목표·학기목표 생성', basePrompt(''), { temperature: 0.3 });
      let cand1 = pickGoals(j);
      let sum1 = String(j?.summary || '').trim();
      const sc1 = stds.map((x, i) => score(cand1[x.code], i));
      const failed = stds.map((x, i) => i).filter((i) => !passes(sc1[i], i));
      let cand2 = {}, sum2 = '', sc2 = [];
      if (failed.length) {
        const note = failed.map((i) => {
          const miss = (sc1[i].c?.missing || terms[i].required);
          return `[${stds[i].code}] ${miss.length ? miss.join(', ') : '(문장 누락)'}`;
        }).join(' / ');
        try {
          const j2 = await llmJSON('성취기준별 목표 생성(재시도)', basePrompt(note), { temperature: 0.15 });
          cand2 = pickGoals(j2); sum2 = String(j2?.summary || '').trim();
        } catch (_) { cand2 = {}; }
        sc2 = stds.map((x, i) => score(cand2[x.code], i));
      }
      // 성취기준별로 두 후보 중 나은 쪽. 둘 다 0점이면 현재 줄(원문 시드/교사 문장) 유지.
      const kept = [], fixed = [];
      const aiByCode = {};
      const finalGoals = stds.map((x, i) => {
        const a = sc1[i], b = sc2[i] || { s: -1 };
        const best = b.s > a.s ? { text: cand2[x.code], sc: b } : { text: cand1[x.code], sc: a };
        const curLine = (prior || stds.length === 1) ? (String(goal || '').trim() || skeletonGoal(x)) : (stdGoals.find((z) => z.code === x.code)?.goal || skeletonGoal(x));
        if (!best.text || best.sc.s === 0) { kept.push(x.code); return { code: x.code, std: x.text, goal: curLine }; }
        if (!passes(best.sc, i)) fixed.push(`[${x.code}] ${(best.sc.c?.missing || []).slice(0, 3).join('·')}`);
        aiByCode[x.code] = toCanDo(best.text);
        return { code: x.code, std: x.text, goal: aiByCode[x.code] };
      });
      // 요약: AI 요약이 소재 낱말을 지켰으면 채택, 아니면 결정론 요약. 성취기준이 1개면 요약 = 그 줄.
      // 쓸 수 있는 줄이 하나도 없으면 아무것도 바꾸지 않는다(토스트만).
      if (kept.length === stds.length) {
        toast(prior ? 'AI가 쓸 만한 문장을 만들지 못해 전년도 문장을 그대로 두었어요 — 다시 시도해 주세요.' : 'AI가 성취기준과 무관한 문장을 만들어 적용하지 않았어요. 다시 시도해 주세요.');
        return;
      }
      const sumOk = (t) => !!t && stds.every((x, i) => {
        const c = goalCoverage(t, x, termIndex);
        if (c.terms.attitude || !c.terms.required.length) return true;
        return commonAt(i) ? (c.ok && c.missing.length === 0) : (c.nounHits.length + c.verbHits.length > 0);
      });
      // 생성 중 선택이 바뀌었으면(코드 집합 불일치) AI 요약 대신 결정론 요약으로 강등 — 현재 목록과 맞게.
      const nowCodes = new Set(stdGoalsRef.current.map((z) => z.code));
      const snapshotMatches = stds.length === nowCodes.size && stds.every((x) => nowCodes.has(x.code));
      let finalSummary;
      let summaryAuto = false;
      if (!prior && !snapshotMatches) { finalSummary = ''; summaryAuto = true; }
      else if (stds.length === 1) { finalSummary = finalGoals[0].goal; summaryAuto = true; }
      else if (sumOk(sum2)) finalSummary = toCanDo(sum2);
      else if (sumOk(sum1)) finalSummary = toCanDo(sum1);
      else { finalSummary = joinGoals(finalGoals); summaryAuto = true; }

      if (prior) {
        setGoal(finalSummary);
      } else {
        // 생성 중 교사가 선택·편집한 내용을 잃지 않도록 코드별로 병합(전체 교체 금지).
        const merged = stdGoalsRef.current.map((z) => (aiByCode[z.code] ? { ...z, goal: aiByCode[z.code] } : z));
        setStdGoals(merged);
        if (!finalSummary) finalSummary = joinGoals(merged);
        // 결정론 요약(또는 단일 줄)이면 이후 줄 편집을 따라가고, AI 요약이면 교사 문장처럼 고정.
        autoSummaryRef.current = summaryAuto ? finalSummary : '';
        setGoal(finalSummary);
      }
      const all = finalGoals.map((x) => x.goal).join('\n') + '\n' + finalSummary;
      const hanja = findHanja(all);
      if (hanja.length) toast(`⚠ 한자 혼입(${hanja.join(', ')})이 있어요 — 수정해 주세요.`);
      if (findNegative(all).length) toast('⚠ "~하지 않는다"식 부정 진술이 있어요 — 무엇을 하는지(대체행동)로 고쳐 주세요.');
      if (kept.length) toast(`${kept.join(', ')}은(는) 문장을 받지 못했거나 성취기준과 무관해 현재 문장을 그대로 두었어요 — 직접 다듬어 주세요.`.replace('PRIOR', '전년도 목표'));
      if (fixed.length) toast(`⚠ 낱말이 빠진 줄이 있어요: ${fixed.join(' / ')} — 보태 주세요.`);
      if (!prior && !snapshotMatches) toast('생성 중에 성취기준 선택이 바뀌어, 현재 선택에 맞는 줄만 반영하고 학기목표는 자동 요약으로 두었어요.');
      else if (!kept.length && !fixed.length) toast(prior ? '전년도 목표를 바탕으로 올해 학기목표 초안을 만들었어요.' : (stds.length === 1 ? '성취기준·학생 자료를 반영한 학기목표 초안을 만들었어요. 문장을 다듬어 확정하세요.' : `성취기준 ${stds.length}개의 목표와 학기목표 요약을 만들었어요. 줄을 다듬어 확정하세요.`));
    } catch (e) { toast('학기목표 생성 실패: ' + e.message); }
    finally { setGoalAiBusy(false); }
  }

  // P16(0720 현장 피드백): 학기 교육내용·교육방법을 연수자료(대전 개별화연수) 양식으로 AI 초안.
  //   교육내용 = 학기목표를 잘게 쪼갠 "~하기" 활동 목록,
  //   교육방법 = 교사의 실제 교수 행동 + 지원을 점차 줄이는 단계 흐름("→" 서술).
  async function aiSemContentMethods() {
    if (!String(goal || '').trim()) { toast('학기목표를 먼저 적어주세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setSemAiBusy(true);
    try {
      const stds = [sel, ...selExtra].filter(Boolean).map((x) => `[${x.code}] ${x.text}`).join(' / ');
      const prompt =
        '너는 특수교육 IEP 작성 전문가다. 아래 학기목표를 "학기 수준의 교육내용·교육방법"으로 펼쳐라.\n' +
        '개별화교육 연수자료의 서술 방식을 따른다.\n\n' +
        `[학기목표] ${goal}\n` +
        (stds ? `[성취기준] ${stds}\n` : '') +
        (String(plop || '').trim() ? `[현행수준] ${String(plop).trim()}\n` : '') +
        (String(startpoint?.perfLevel || '').trim() ? `[출발점 — 수행 가능 수준] ${String(startpoint.perfLevel).replace(/\n/g, ' / ').trim()}\n` : '') +
        (curStu?.disability ? `[장애영역] ${curStu.disability}\n` : '') +
        '\n작성 규칙:\n' +
        '1) content(교육내용): 학기목표에 도달하기 위한 구체 활동을 "~하기" 명사형으로 4~7개. 활동을 잘게 쪼개고 실제 자료·상황을 담을 것. 학기목표에 여러 요소(예: 읽기와 대화)가 있으면 모든 요소를 고르게 다룰 것. "~하기"는 항목 끝에 1번만 쓸 것("돌리기하기"처럼 겹치면 안 됨).\n' +
        '   (서술 방식 예 — 내용은 베끼지 말 것: "화재경보기 소리와 다른 유사한 소리 구별하기" / "혼자서 버스 타기" / "버스 타고 내리기 순서 익히기")\n' +
        '2) methods(교육방법): 교사가 실제로 어떻게 가르치는지 2~4개 항목. 그중 1개 이상은 지원을 점차 줄여 독립 수행으로 가는 단계 흐름을 "→"로 이어 서술할 것.\n' +
        '   (서술 방식 예 — 내용은 베끼지 말 것: "교사가 학생의 손을 잡고 대피하기 → 대피 방법을 말로 설명하며 반복하기 → 설명 없이 함께 대피하기 → 교사가 한 걸음 뒤에서 지켜보기 → 학생이 머뭇거릴 때만 촉구 제공하며 스스로 대피하기")\n' +
        '   [중요] "→" 단계 흐름의 첫 단계는 위 [현행수준]·[출발점 — 수행 가능 수준]에 적힌 이 학생의 실제 촉진 수준(예: 신체 촉진, 언어·시각 촉진, 시간지연)에서 시작할 것. "최대-최소 촉진에서 시간지연으로 촉구를 점차 줄여 독립 수행으로" 같은 일반 문구를 그대로 쓰지 말고, 이 학기목표의 실제 활동·자료·촉진 방법을 담아 이 학생만의 문장으로 쓸 것.\n' +
        '3) 각 항목은 "- "로 시작하는 한 줄. 쉬운 우리말, 학생 실명·영어 단어 금지.\n' +
        '4) [부정 진술 금지] 교육내용에 "~하지 않기"처럼 무엇을 안 하는지를 쓰지 말고, 대신 무엇을 하는지(대체행동)로 쓸 것.\n' +
        (curStu?.disability ? '5) 교육방법의 핵심 방법은 이 학생 장애영역의 기본 교수전략에서 1~2개를 고르고, "→" 단계 흐름은 구조화된 1:1 시행(비연속 시행 훈련, DTT)에서 시작해 일과 속 자연적 중재로 넘어가는 순서로 쓸 것.\n' : '') +
        '\n' + buildDisabilityMethodBlock(curStu?.disability) + '\n' +
        '반드시 JSON만 출력: {"content":"- ...하기\\n- ...하기","methods":"- ...\\n- ... → ... → ..."}';
      const j = await llmJSON('학기 교육내용·방법 생성(연수자료 방식)', prompt, { tier: 'fast', temperature: 0.5 });
      const c = String(j.content || '').trim(), m = String(j.methods || '').trim();
      if (!c && !m) throw new Error('내용을 받지 못했어요.');
      if (c) setSemContent(c);
      if (m) setSemMethods(m);
      const hanja = findHanja(c + '\n' + m);
      if (hanja.length) toast(`⚠ 한자 혼입(${hanja.join(', ')})이 있어요 — 수정해 주세요.`);
      toast('연수자료 방식으로 교육내용·교육방법 초안을 만들었어요 — 다듬어 쓰세요.');
    } catch (e) { toast('AI 채우기 실패: ' + e.message); }
    finally { setSemAiBusy(false); }
  }

  // 결과가 원문(초안·성취기준)의 소재를 유지했는지 검사 — 핵심 단어가 하나도 안 겹치면 이탈.
  // (로컬 소형 모델이 학생 자료의 행동중재 내용으로 끌려가는 사고 방지)
  function topicOverlap(source, out) {
    const tokens = String(source || '').replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/)
      .map((t) => t.trim()).filter((t) => t.length >= 2)
      .filter((t) => !['필요한', '스스로', '있는', '있다', '한다', '수행', '학생'].includes(t));
    if (!tokens.length) return true;
    const o = String(out || '');
    // 조사 변형 대응: 앞 2글자 겹침도 인정 (화폐로→화폐, 물건을→물건)
    return tokens.some((t) => o.includes(t) || (t.length >= 2 && o.includes(t.slice(0, 2))));
  }

  // 경로B: 교사가 쓴 학기목표 초안을 관찰·측정 가능한 문장으로 AI 다듬기.
  // ※ 문장 정련 작업이므로 학생 자료(BIP·안정실 등)는 프롬프트에 넣지 않는다 —
  //    소형 모델이 행동중재 내용으로 주제를 바꿔버리는 문제(0720 보고)의 원인이었음.
  async function aiRefineGoal() {
    const draft = String(goal || '').trim();
    if (!draft) { toast('학기목표 초안을 먼저 적어주세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setGoalAiBusy(true);
    try {
      const basePrompt = (strict) =>
        '너는 특수교육 IEP 작성 전문가다. 교사가 쓴 학기목표 초안을 다듬어라.\n' +
        '규칙:\n' +
        '1) [가장 중요] 초안의 소재·활동을 그대로 유지한다. 초안에 없는 행동·장소·물건(예: 의사소통 카드, 안정실, 대체행동 등)을 절대 새로 만들지 않는다.\n' +
        '2) 의미는 그대로 두고, 조건(어디서/무엇으로) + 행동(무엇을 한다) + 기준(얼마나)이 드러나는 한 문장으로만 정련한다.\n' +
        '3) 교수전략 이름 금지. 영어 단어 없이 쉬운 우리말. 초안이 이미 좋으면 표현만 자연스럽게 손본다.\n' +
        '4) 문장은 반드시 "~할 수 있다."로 끝맺는다.\n' +
        '5) [부정 진술 금지] 초안이 "~하지 않는다"처럼 무엇을 안 하는지로 쓰여 있으면, 같은 상황에서 대신 무엇을 하는지(대체행동)로 바꿔 쓴다. 예) "지루함을 표현하지 않는다" → "지루할 때 쉬고 싶어요 카드를 교사에게 건넬 수 있다."\n' +
        '예) 초안 "점심 먹기 전에 손을 씻는다." → "급식 전과 화장실 이용 후, 비누를 사용해 손 씻기 6단계를 10회 기회 중 8회 이상 스스로 수행할 수 있다."\n' +
        (strict ? '※ 직전 답변이 초안과 무관한 내용이었다. 이번에는 반드시 초안의 소재(단어)를 그대로 사용해 다듬기만 하라.\n' : '') +
        (curStu?.disability ? `(참고 — 장애유형 ${curStu.disability}: 문장 난이도 조정에만 사용, 소재 변경 금지)\n` : '') +
        `[교사 초안] ${draft}\n` +
        '반드시 JSON만 출력: {"semester_goal":"..."}';
      // 0720: 문장 품질이 관건 — 큰(품질) 모델로 라우팅.
      let j = await llmJSON('학기목표 다듬기', basePrompt(false), { tier: 'quality', temperature: 0.2 });
      let g = String(j.semester_goal || '').trim();
      // 주제 이탈 가드: 초안의 핵심 단어가 하나도 없으면 1회 재시도 → 그래도 이탈이면 초안 유지.
      if (g && !topicOverlap(draft, g)) {
        try {
          j = await llmJSON('학기목표 다듬기(재시도)', basePrompt(true), { tier: 'quality', temperature: 0.1 });
          g = String(j.semester_goal || '').trim();
        } catch (_) { g = ''; }
      }
      if (!g) throw new Error('다듬은 문장을 받지 못했어요.');
      if (!topicOverlap(draft, g)) {
        toast('AI가 초안과 다른 내용을 만들어 적용하지 않았어요. 초안을 그대로 두었습니다 — 다시 시도하거나 직접 다듬어 주세요.');
        return;
      }
      setGoal(toCanDo(g)); // 0819: "~할 수 있다." 서술형 보정
      if (findNegative(g).length) toast('⚠ 다듬은 문장이 아직 부정 진술("~하지 않는다")이에요 — 대체행동으로 고쳐 주세요.');
      toast('학기목표 문장을 다듬었어요.');
    } catch (e) { toast('학기목표 다듬기 실패: ' + e.message); }
    finally { setGoalAiBusy(false); }
  }

  // 경로B: 학기목표 문장으로 관련 성취기준 후보를 찾는다(키워드 점수 선별).
  function keywordStdCandidates(text, limit, allowGrades) {
    // 0819(5차 피드백): 학생 학교급과 무관한 학년(초1·중학 등) 기준이 추천되던 문제 —
    // allowGrades가 있으면 그 학년군의 성취기준만 후보로 삼는다.
    const pool = allowGrades ? crows.filter((r) => allowGrades.includes(r.gradeCode)) : crows;
    const tokens = [...new Set(String(text).replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/)
      .map((t) => t.trim()).filter((t) => t.length >= 2)
      .flatMap((t) => (t.length >= 3 ? [t, t.slice(0, 2), t.slice(0, 3)] : [t])))]; // 조사 붙은 어절 대응
    const scored = pool.map((r) => {
      const hay = `${r.subject} ${r.area} ${r.text}`;
      let s = 0;
      tokens.forEach((t) => { if (hay.includes(t)) s += t.length; });
      return { r, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map((x) => x.r);
  }
  // 학생 학교급·학년이 허용하는 학년군 코드. 일상생활 활동(공통, 0)은 학년 구분이 없어 항상 포함.
  // 0819(동료 피드백): 프로필에 세부 학년(초1~6)이 있으면 해당 학년군까지 좁힌다
  // (초1~2→2, 초3~4→4, 초5~6→6). 학년 미지정이면 종전대로 학교급 전체.
  function allowedGradeCodes() {
    const lv = String(curStu?.level || '');
    const gr = parseInt(String(curStu?.grade || '').replace(/[^0-9]/g, ''), 10);
    if (lv.includes('중')) return [0, 9];
    if (lv.includes('고')) return [0, 12];
    if (lv.includes('초')) {
      if (gr >= 1 && gr <= 6) return [0, gr <= 2 ? 2 : gr <= 4 ? 4 : 6];
      return [0, 2, 4, 6];
    }
    return null; // 학교급 미상 → 제한 없음
  }
  // 추천 안내에 쓸 학년 표기(예: '초등 3학년').
  const levelLabel = `${curStu?.level || ''}${curStu?.grade ? ` ${curStu.grade}학년` : ''}`.trim();
  // 0819(동료 재요청): 학년이 비어 있으면 조용히 학교급 전체로 돌아가 "학년이 반영 안 된다"고 느껴졌다
  //   → 추천 박스에 지금 적용 중인 기준을 항상 보여주고, 학년을 그 자리에서 바로 입력하게 한다.
  const gradeBasisLabel = (() => {
    const codes = allowedGradeCodes();
    if (!codes) return '학교급 미지정 — 전체 학년 성취기준에서 추천';
    const names = codes.filter((c) => c !== 0).map((c) => GRADE[c] || '').filter(Boolean);
    return `${levelLabel || '학생'} · ${names.join(', ')} + 일상생활(공통) 성취기준에서 추천`;
  })();
  // 학년 인라인 저장 — 프로필의 다른 값이 지워지지 않도록 현재 값을 함께 보낸다.
  async function saveGradeInline(g) {
    if (!curStu) return;
    try {
      await editStudent({
        id: curStu.id, level: curStu.level || '', grade: g,
        disability: curStu.disability || '', note: curStu.note || '',
        class_id: curStu.class_id || undefined,
      });
      toast(g ? `학년을 ${g}학년으로 저장했어요 — 이 학년군 성취기준으로 추천합니다.` : '학년을 지웠어요(학교급 전체 기준).');
      setStdRecs([]);
    } catch (e) { toast('학년 저장 실패: ' + e.message); }
  }
  // 키워드 후보 → (AI 연결 시) AI 재정렬로 상위 추천. AI 없이도 키워드 순으로 동작.
  async function aiRecommendStandards() {
    const g = String(goal || '').trim();
    if (!g) { toast('학기목표를 먼저 적어주세요.'); return; }
    if (!rows.length) { toast('성취기준 데이터가 아직 로드되지 않았어요.'); return; }
    setStdRecBusy(true);
    try {
      // 0819(5차 피드백): 후보를 학생 학교급으로 제한 — 학교급 안에서 못 찾으면 전체로 확장(안내).
      const allow = allowedGradeCodes();
      let cands = keywordStdCandidates(g, 30, allow);
      let widened = false;
      if (!cands.length && allow) { cands = keywordStdCandidates(g, 30, null); widened = !!cands.length; }
      if (!cands.length) { setStdRecs([]); toast('학기목표와 닿는 성취기준을 찾지 못했어요. 아래 목록에서 직접 선택하세요.'); return; }
      let picked = cands.slice(0, 8);
      if (aiOn) {
        try {
          const prompt =
            '아래 학기목표와 가장 관련 있는 성취기준을 후보 중에서 5개 고르라(관련이 큰 순).\n' +
            (curStu?.level ? `[학생] 학교급 ${levelLabel}${curStu?.disability ? ` · 장애영역 ${curStu.disability}` : ''}\n` +
              '  → 학생의 학교급·학기목표 난이도에 맞는 학년군을 고를 것. 같은 관련도라면 학기목표 수준에 가까운 학년군을 우선.\n' : '') +
            `[학기목표] ${g}\n[후보]\n` +
            cands.map((r) => `${r.code} | ${r.subject}${r.area ? '·' + r.area : ''} | ${GRADE[r.gradeCode] || ''} | ${r.text}`).join('\n') +
            '\n반드시 JSON만 출력: {"codes":["코드1","코드2","코드3","코드4","코드5"]}';
          const j = await llmJSON('성취기준 추천', prompt, { tier: 'fast', temperature: 0.2 });
          const codes = Array.isArray(j.codes) ? j.codes.map((c) => String(c).trim()) : [];
          const byCode = codes.map((c) => cands.find((r) => r.code === c)).filter(Boolean);
          if (byCode.length) picked = [...new Set([...byCode, ...picked])].slice(0, 8);
        } catch (_) { /* AI 실패 시 키워드 순 유지 */ }
      }
      setStdRecs(picked);
      toast(widened
        ? `이 학교급(${curStu?.level}) 성취기준에서는 관련 후보가 없어 전체 학년에서 추천했어요 — 학년군을 확인하고 고르세요.`
        : `학기목표와 관련된 성취기준 ${picked.length}개를 추천했어요${levelLabel ? ` (${levelLabel} 학년군 기준)` : ''}. 눌러서 연결하세요.`);
    } finally { setStdRecBusy(false); }
  }

  // 평가초점 개발(0719 피드백): 확정한 학기목표를 쪼갠다.
  // 0720 품질 교정: "쪼개기"를 하위 수행으로 엄밀히 정의하고(자세·또래 협동 같은 새 활동 금지),
  // 좋은/나쁜 예시 + 자기 검증 지시 + 이탈 항목 필터·재시도를 넣었다.
  async function aiFociFromGoal() {
    const g = String(goal || '').trim();
    if (!g) { toast('학기목표를 먼저 확정하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setFociGoalBusy(true);
    // 0903(B안): 성취기준별 목표가 평가초점의 앵커. 목표 수보다 개수가 적으면 배분이 구조적으로 불가능하므로 올린다.
    const sgAll = (flowMode === 'std' ? stdGoals : []).filter((x) => x && x.code && String(x.goal || '').trim());
    const multi = sgAll.length >= 2; // 단일 성취기준은 종전 프롬프트·동작 그대로
    const sg = multi ? sgAll : [];
    let n = Math.max(2, Math.min(10, parseInt(fociCount, 10) || 5)); // 교사가 고른 개수
    if (multi && n < sg.length + 1) { n = Math.min(10, sg.length + 1); toast(`성취기준별 목표가 ${sg.length}개라 평가초점을 ${n}개로 늘려 만들어요.`); }
    const sgStd = (x) => ([sel, ...selExtra].find((z) => z && z.code === x.code) || { code: x.code, text: x.std, subject: sel?.subject, gradeCode: sel?.gradeCode });
    // 변별 명사가 없는 목표는 배정 판정 대상에서 뺀다(어떤 문장으로도 판정할 수 없어 헛된 재시도·경고가 나므로).
    const unassigned = (arr) => sg.filter((x) => {
      const nouns = goalCoverage('', sgStd(x), termIndex).terms.nouns;
      return nouns.length > 0 && !arr.some((f) => goalCoverage(f, sgStd(x), termIndex).nounHits.length > 0);
    });
    try {
      // 0720 재교정: 예시 소재가 실제 목표와 겹쳐 그대로 베끼던 문제 → 다른 소재의 예시로 교체.
      // "핵심 동사 그대로" 규칙이 장소만 바꾼 반복문을 만들던 문제 → 구성 동작(하위 기술) 분해 허용.
      const verbHints = (verbAlts || []).map((v) => String(v).trim()).filter(Boolean);
      const basePrompt = (strict) =>
        '특수교육 개별화교육계획의 "평가초점" 목록을 만든다.\n' +
        '평가초점이란: 학기목표에 도달했는지 확인하기 위해, 학기목표의 수행을 구성하는 "하위 수행"으로 나눈 것이다.\n' +
        '규칙:\n' +
        '1) 모든 평가초점은 학기목표 수행의 한 부분(구성 동작)이거나 수행 범위를 좁힌·넓힌 것이어야 하며, 학기목표의 소재(대상 단어)를 담아야 한다.\n' +
        '   학기목표에 없는 새로운 활동은 금지 — 자세(바르게 앉기 등), 준비·관찰 행동, 또래 협동(친구와 함께 등), 태도(소중히 여긴다 등).\n' +
        (sg.length ? '   [성취기준별 목표]가 있으면 각 목표마다 그 소재(낱말)를 담은 평가초점을 최소 1개씩 만들 것. 단, 목표 문장을 그대로 옮겨 적지 말고 그 수행의 하위 동작으로 나눌 것.\n' : '') +
        '2) [중요] 문장들이 서로 뚜렷이 달라야 한다. 같은 문장에서 장소·수식어만 바꾼 반복 금지. 아래를 섞어서 만들 것:\n' +
        '   ① 수행을 이루는 구성 동작(과제분석적 하위 기술 — 동사가 목표와 달라져도 됨)\n' +
        '   ② 대상·범위를 좁힌 것 → 넓힌 것\n' +
        '   ③ 상황·자료 확장(모의 → 실제 등)은 많아야 1~2개만.\n' +
        (verbHints.length ? `   ④ 필요하면 이 동사 후보를 활용해 표현을 다양하게: ${verbHints.join(', ')}\n` : '') +
        `3) 정확히 ${n}개 만들 것(규칙을 어긴 문장을 빼느라 줄어드는 것은 허용). 평서형("~한다.")으로 끝낼 것. 지원 수준(도움받아/독립)으로 나누지 말 것. 쉬운 우리말.\n` +
        '4) [부정 진술 금지] "~하지 않는다", "~않고 기다린다"처럼 무엇을 안 하는지로 쓰지 말고, 대신 무엇을 하는지(대체행동)로 쓸 것. 예) "다른 행동을 하지 않고 기다린다" → "자리에 앉아 손을 무릎에 두고 기다린다".\n' +
        '예) 학기목표 "급식 시간에 수저로 밥을 먹는다." — 이 예시는 소재가 다르므로 문장을 절대 베끼지 말 것.\n' +
        '  좋은 평가초점: "수저를 바르게 잡는다." / "숟가락으로 밥을 떠서 먹는다." / "젓가락으로 반찬을 집어 먹는다." / "흘리지 않고 밥을 먹는다." / "급식 시간 동안 수저로 스스로 밥을 먹는다."\n' +
        '  나쁜 평가초점: "식탁에 바르게 앉는다."(목표에 없는 행동) / "교실에서 수저로 밥을 먹는다."와 "식당에서 수저로 밥을 먹는다."(장소만 바꾼 반복)\n' +
        (strict ? `※ 직전 답변이 서로 비슷한 문장의 반복이었거나 무관한 활동이 섞여 있었다${typeof strict === 'string' ? `. 특히 다음 목표의 소재가 빠졌다: ${strict}` : ''}. 이번에는 구성 동작으로 뚜렷이 나눠 다시 작성하라.\n` : '') +
        `[학기목표] ${g}\n` +
        (sg.length
          ? `[성취기준별 목표] (학기목표의 근거 — 각 줄의 소재를 담은 평가초점을 최소 1개씩)\n${sg.map((x) => `· [${x.code}] ${x.goal}`).join('\n')}\n`
          : (sel ? `[관련 성취기준(참고)] [${sel.code}] ${sel.text}${selExtra.length ? ' / ' + selExtra.map((x) => `[${x.code}] ${x.text}`).join(' / ') : ''}\n` : '')) +
        '출력 전에 스스로 검증하라: 각 문장이 규칙 1·2를 지키는가? 장소·수식어만 다른 중복 문장은 하나로 합쳐라.\n' +
        '반드시 JSON만 출력: {"foci":["...","..."]}';
      const parse = (j) => (Array.isArray(j.foci) ? j.foci.map((s) => String(s).trim()).filter(Boolean) : []);
      // 명백히 이탈한 항목 제거 — 학기목표 핵심 단어가 없더라도 성취기준별 목표의 소재(변별 명사)를 담았으면 이탈이 아니다.
      const keepOnTopic = (arr) => arr.filter((f) => topicOverlap(g, f) || sg.some((x) => goalCoverage(f, sgStd(x), termIndex).nounHits.length > 0));
      // 0720: 품질이 관건이라 큰(품질) 모델로 라우팅 — 느려도 정확하게 (사용자 요청).
      let foci = keepOnTopic(parse(await llmJSON('평가초점 개발(학기목표 쪼개기)', basePrompt(false), { tier: 'quality', temperature: 0.3 })));
      let missedSg = unassigned(foci);
      if (foci.length < Math.min(3, n) || missedSg.length) {
        // 대부분 이탈했거나 어떤 성취기준별 목표에도 평가초점이 안 붙음 → 빠진 소재를 명시해 1회 재시도.
        try {
          const note = missedSg.length ? missedSg.map((x) => `[${x.code}] ${goalCoverage('', sgStd(x), termIndex).terms.nouns.slice(0, 3).join('·')}`).join(' / ') : true;
          const retry = keepOnTopic(parse(await llmJSON('평가초점 개발(재시도)', basePrompt(note), { tier: 'quality', temperature: 0.2 })));
          const retryMissed = unassigned(retry);
          if (retry.length && (retryMissed.length < missedSg.length || retry.length > foci.length)) { foci = retry; missedSg = retryMissed; }
        } catch (_) { /* 첫 결과 유지 */ }
      }
      if (!foci.length) throw new Error('학기목표에 맞는 평가초점을 받지 못했어요. 다시 시도해 주세요.');
      setEvalFoci(foci);
      if (missedSg.length) toast(`⚠ ${missedSg.map((x) => `[${x.code}]`).join(' ')} 목표의 소재가 평가초점에 없어요 — 그 목표의 하위 수행을 하나 보태 주세요.`);
      const negFoci = findNegative(foci.join('\n'));
      if (negFoci.length) toast(`⚠ 부정 진술 평가초점 ${negFoci.length}개("${negFoci[0].slice(0, 20)}…") — 대신 무엇을 하는지로 고쳐 주세요.`);
      toast(`학기목표를 쪼개 평가초점 ${foci.length}개를 만들었어요. 목표의 하위 수행이 맞는지 확인해 주세요.`);
    } catch (e) { toast('평가초점 생성 실패: ' + e.message); }
    finally { setFociGoalBusy(false); }
  }

  // 생성 프롬프트 문자열을 만든다(AI 호출/수동 복사 공용).
  async function buildGenPrompt() {
    const data = curStuData || (await ensureStudentData(curStuId)) || {};
    const mGroups = parseMonthGroups(monthGroups, months, sem);
    const ms = mGroups.map((g) => monthGroupLabel(g, sem));
    const isQual = critType === 'qual';
    const isTask = critType === 'task';
    const u = isTask ? '단계' : (critType === 'rate' ? '%' : '회');
    const summary = buildStudentSummary(data);
    // Tier 1/2 실제 운영 내용 연동 — 반·학기 단위 학급 PBS를 불러온다(실패해도 진행).
    let classPBS = null;
    if (curStu?.class_id) {
      try { classPBS = (await fetchClassPBS(curStu.class_id, sem))?.data || null; } catch (_e) { /* best-effort */ }
    }
    const tierLinkage = buildTierLinkage(data, classPBS);
    // 0903(B안): 성취기준별 목표 — 2개 이상일 때 월별 구간 배정의 축.
    const sgGen = (flowMode === 'std' ? stdGoals : []).filter((x) => x && x.code && String(x.goal || '').trim());
    const fociBlock = (evalFoci || []).filter((f) => f.trim()).length
      ? `[평가초점] (성취기준 분석→해석으로 개발 — 교육목표·교육내용·교육방법·평가를 하나로 잇는 축)\n${evalFoci.filter((f) => f.trim()).map((f) => '· ' + f.trim()).join('\n')}\n`
      : '';
    const stepsArr = (taskSteps || []).map((t) => t.trim()).filter(Boolean);
    const stepsBlock = isTask
      ? (stepsArr.length
          ? `[과제 단계] (과제분석 — 학생이 순서대로 수행할 단계)\n${stepsArr.map((t, k) => `${k + 1}) ${t}`).join('\n')}\n`
          : `[과제 단계] 아직 미입력 — 학기목표를 4~8개의 순차 단계로 분해해 task_steps로 제안할 것.\n`)
      : '';
    const priorGoals2 = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear);
    const priorBlock = priorGoals2.length
      ? '\n[전년도 IEP 참고]\n' + priorGoals2.slice(0, 12).map((g) => `· (${g.school_year} ${g.semester}학기) ${g.subject}${g.area ? '·' + g.area : ''}: 목표 "${g.semester_goal}" / 평가 "${g.semestral_eval || '-'}"`).join('\n') + '\n'
      : '';
    const critLine = isQual
      ? `[평가 방식] 질적 평가 — 수치·등급이 아니라 위 평가초점을 중심으로 학습 과정과 결과를 내러티브(서술형)로 평가.\n`
      : isTask
      ? `[평가 방식] 과제 분석 — 전체 ${stepsArr.length || cEnd}단계. 교수 순서: ${CHAIN_LABEL[chainType]}, 촉진 체계: ${PROMPT_LABEL[promptSystem]}. (a) 독립 수행 단계 수를 ${cStart}→${cEnd}단계로 ${CHAIN_LABEL[chainType]} 방식으로 매월 점증, (b) 각 단계 촉진을 ${PROMPT_LABEL[promptSystem]}로 점차 약화. 단계별 체크리스트로 평가. 비디오 모델링·시간지연·그림 촉진 등 결합 EBP를 교육방법에 포함.\n`
      : `[평가 기준] ${critType === 'rate' ? '독립 수행 비율' : '10회 기회 중 성공 횟수'} 기준을 ${cStart}${u}에서 ${cEnd}${u}로 구간마다 점증(양적, 첫 구간부터 시작 수준보다 높게). 평가초점 중심의 질적 서술을 병행.\n`;
    const TIER_DESC = {
      1: '학급 전체에 적용하는 보편적 지원 — 시각 일과표·명확한 학급 규칙·일관된 칭찬과 강화 등 학급 차원 PBS. 또래와 같은 환경·자료에서 최소한의 조정으로 학습.',
      2: '소그룹 단위의 표적 지원 — 체크인·체크아웃(CICO), 소그룹 사회성/학습 지도, 일일 행동점검표(DPR), 주 단위 진전 점검 등. 보편적 지원에 더해 집단 중재를 병행.',
      3: '개별 집중 지원 — 1:1 또는 고강도 개별 중재, 학생 맞춤 촉진·강화 체계, 기능평가 기반 행동중재계획(BIP) 연계. 가장 높은 강도의 개별화 지원.',
    };
    const tierNum = supportTier ? (supportTier.match(/[123]/) || [])[0] : '';
    const tierLine = supportTier
      ? `[지원체계] ${supportTier}\n  의미: ${TIER_DESC[tierNum] || ''}\n  → 교육방법·촉진 수준을 이 지원 강도에 맞춰 명시하되, 결과물에는 "Tier 1/2/3" 같은 단계 라벨만 적지 말고${tierLinkage ? ' 위 [지원 체계 연동]에 적힌 이 학생의 실제 운영 내용(학급 PBS·소그룹·CICO 등)을 우선 반영해' : ' 위 의미를 풀어서'} 구체적인 지원 내용으로 서술할 것(Word 제출본만 단독으로 읽어도 무슨 지원인지 이해되도록).\n`
      : '';
    // P7: 증거기반실제(EBP) 근거연결 — 목표유형·목표텍스트로 후보를 골라 교육방법이 "근거 있는"
    //     방법을 우선 쓰도록 프롬프트에 주입(규칙기반, 결정적).
    //     ※ QABF 행동기능은 '행동·사회·정서' 목표일 때만 반영한다. 순수 교과·학습 목표에
    //       차별강화·FCT·소거 같은 행동감소 EBP가 끌려와 행동중재로 쏠리는 것을 막기 위함.
    const behaviorRelated = /행동|사회|정서|또래|감정|자기\s*조절|문제\s*행동|의사소통|상호작용|적응/.test(
      `${sel?.subject || ''} ${sel?.area || ''} ${sel?.text || ''} ${goal || ''}`
    );
    const ebpBlock = ebpBlockForGoal({
      goalType: critType,
      goalText: goal || sel?.text || '',
      qabfFunction: behaviorRelated ? topQabfLabel(data) : '',
    });
    // 기능기반 IEPBS(0819): 행동·사회성 목표일 때 추정 기능의 대체 핵심기술 + PBS 3전략 예시 주입.
    const funcSkillsB = behaviorRelated ? functionSkillsBlock(topQabfLabel(data)) : '';
    return (
      `너는 특수교육 IEP 작성 전문가다. 아래 "학생 자료"와 "전년도 IEP"를 실제로 반영해, 선택한 성취기준에 대한 개별화교육계획을 작성하라.\n\n` +
      `[학생 자료]\n${summary}\n${priorBlock}\n` +
      tierLinkage +
      `[성취기준] ${[sel, ...selExtra].map((x) => `[${x.code}] ${x.text}`).join(' / ')} (교과 ${sel.subject}${sel.area ? ' · ' + sel.area : ''})\n` +
      (selExtra.length
        ? `  → 성취기준이 여러 개다. 학기목표와 월별 교육내용이 선택된 성취기준들을 통합적으로 다루도록 반영할 것. [크로스체크 — 중요] 각 성취기준의 핵심 내용이 최소 1개 구간의 교육내용(content)에 구체 활동으로 나타나야 한다. 출력 전에 성취기준별로 "어느 구간에 반영했는지" 스스로 점검하고, 빠진 성취기준이 있으면 해당 구간 교육내용에 활동을 보탤 것.\n`
        : '') +
      fociBlock + stepsBlock +
      `[학기목표(확정)] ${goal}\n` +
      `  → 이 학기목표가 월별 계획 전체의 축이다(학기목표 선 확정 → 월별 후 작성). 각 구간(월)의 교육목표·교육내용은 이 학기목표에 도달하기 위한 중간 단계로 설계하고, 마지막 구간은 학기목표 수준에 도달하게 할 것.\n` +
      (sgGen.length >= 2
        ? `[성취기준별 목표] (학기목표의 근거 — 월별 구간은 이 순서대로 배정)\n${sgGen.map((x, i) => `${i + 1}. [${x.code}] ${x.goal}`).join('\n')}\n` +
          `  → 구간마다 성취기준별 목표를 순서대로 배정해, 그 구간의 교육목표·교육내용은 배정된 목표의 소재를 다룰 것(목표보다 구간이 많으면 앞 목표부터 이어서 여러 구간에, 적으면 한 구간에 여러 목표). 지원 수준·평가 기준의 점증은 학기 전체 흐름(규칙 2·5)을 그대로 따른다.\n`
        : '') +
      // P15(0720 현장 피드백): 교사가 학기 수준에서 잡은 교육내용·교육방법 방향을 월별에 구체화.
      (String(semContent || '').trim()
        ? `[학기 교육내용(교사 방향)]\n${String(semContent).trim()}\n  → 월별 교육내용(content)은 이 방향의 활동을 월 순서에 맞게 나누어 구체화·심화할 것(방향에 없는 활동을 새로 만들 수 있으나, 위 방향과 어긋나지 않게).\n`
        : '') +
      (String(semMethods || '').trim()
        ? `[학기 교육방법(교사 방향)]\n${String(semMethods).trim()}\n  → 월별 교육방법(methods)의 지도전략은 이 방향을 우선 반영할 것. 이 방향에 "→"로 이어진 단계 흐름이 있으면 무관한 새 흐름을 만들지 말고 그 단계들을 구간 순서대로 배분할 것 — 각 구간의 ②지원수준·③강화 스케줄 문장 앞에 "[학기 계획 n/m단계]"를 붙여 학기 방향의 몇 번째 단계인지 표시하고, 그 단계를 이 구간의 교육내용 활동·자료에 맞게 구체화할 것(학기 방향 문장을 그대로 복사하지 말 것).\n`
        : '') +
      `[대상 월(구간)] ${ms.map((x) => x + '월').join(', ')} (총 ${ms.length}구간 — 월을 묶은 구간은 한 행으로 작성)\n` +
      critLine + tierLine + buildDisabilityMethodBlock(curStu?.disability) + ebpBlock + funcSkillsB +
      `\n[형식 본보기 — 일부러 고른 "다른 교과"의 한 구간 예시]\n` +
      `아래 예시는 지금 작성하는 교과(${sel.subject})와 무관하다. 구조(개조식 content, methods 3구조, 질문형 eval_plan의 측면 구성)와 어미만 본보기로 삼을 것. 예시의 소재·활동·문장은 이 교과와 맞지 않으므로 가져다 쓰지 말 것.\n` +
      `${/수학|과학/.test(sel.subject || '') ? FORMAT_EX_COMM : FORMAT_EX_MATH}\n\n` +
      `요구사항:\n` +
      `1) 현행수준(plop)은 이 성취기준·평가초점에 대한 학생의 현재 수행 수준(무엇을 어디까지 하는지)을 중심으로 쓰고, 행동·지원 정보(ABC·BIP·안정실 등)는 학습에 영향을 주는 범위에서만 보조적으로 덧붙인다.\n` +
      `2) 구간이 지날수록 지원 수준을 점차 줄이며(도움받아→부분→독립→적용) 목표를 점증시킬 것.\n` +
      `3) [교육목표(goal) 진술 규칙 — 중요] 교육목표는 성취기준과 현행수준에 근거해 학생이 도달할 행동·능력만 진술한다. 교수전략·증거기반실제의 기법명이나 지도 방법 서술은 교육목표에 절대 넣지 말 것 — 그런 내용은 전부 교육방법(methods)에만 쓴다.\n` +
      `   [부정 진술 금지] 교육목표·교육내용·평가초점에 "~하지 않는다", "~않고 기다린다"처럼 무엇을 안 하는지를 쓰지 말고, 대신 무엇을 하는지(대체행동)로 쓸 것. 예) "소리 지르지 않는다" → "쉬고 싶어요 카드를 교사에게 건넨다", "다른 행동을 하지 않고 기다린다" → "자리에 앉아 손을 무릎에 두고 기다린다".\n` +
      `4) [교육내용(content) 진술 규칙] 교육내용은 "~하기"로 끝나는 개조식 명사형 활동 목록으로 쓴다. 이 학생이 수업에서 실제로 할 구체적 활동(재료·놀잇감·상황 포함)을 스스로 구상해 항목 3~6개로 쓸 것. "~할 수 있다", "~한다" 같은 목표·평가식 문장 금지.\n` +
      `5) [교육방법(methods) 3구조] methods 배열은 반드시 "지도전략: ...", "지원수준(촉구·용암): ...", "강화 스케줄: ..." 세 항목으로 구성한다.\n` +
      `   ① 지도전략 — [고정 축] 핵심 방법 1~2개를 [학기 교육방법(교사 방향)] 또는 [장애영역 기본 교육방법]·[EBP 후보]에서 골라 모든 구간에 똑같이 쓸 것(구간마다 기법을 바꿔 넣지 말 것 — 교사가 매달 새 방법을 준비하는 부담이 생긴다). 구간마다 달라지는 것은 그 방법을 적용하는 활동·자료·지시어와 "교수 장면"뿐이다. 교수 장면은 ${TEACH_SCENES.map((t, k) => `${k + 1}단계 ${t.label}: ${t.scene}`).join(' → ')} 순서로 점증하며, 마지막 구간에서만 자연적 중재(교수) 하나를 새로 더할 수 있다. 서술 형식: "핵심 방법(학기 고정): ○○, ○○ / 이번 구간: [교수 장면] 어떤 활동에서 어떤 지시어·상황으로"(전략명은 우리말 명칭+약어 병기).\n` +
      `   ② 지원수준(촉구·용암) — 무엇을 촉구하고 언제 어떻게 줄이는지, 이 학생의 현행수준에 맞는 촉구 체계와 용암 계획을 서술.\n` +
      `   ③ 강화 스케줄 — 습득 단계와 유지 단계의 강화 계획을 서술하고, 학생 자료에 나온 이 학생이 실제 좋아하는 것을 강화물로 연결.\n` +
      `   ※ 3구조의 틀은 구간마다 일관되게 유지하되, 내용은 매 구간 이 학생·이 교육내용에서 출발해 새로 쓸 것.\n` +
      `   ※ [구간별 점증 — 중요] ②지원수준과 ③강화 스케줄은 그 구간에서 실제로 쓰는 단계만 서술할 것. 전체 용암 흐름(최대-최소 촉진→시간지연→독립)을 매 구간 반복해 쓰지 말 것. 첫 구간은 [모듈1 출발점]의 수행 가능 수준(없으면 현행수준)에 적힌 촉진 수준에서 시작하고, 구간이 지날수록 최대-최소 촉진→시간지연→독립 수행, 즉시(연속)강화→간헐강화→자연적 강화로 점증해 마지막 구간은 독립 수행·자연적 강화에 도달할 것.\n` +
      `   ※ 인접 구간과 같거나 거의 같은 문장 금지는 ②지원수준·③강화 스케줄에만 적용 — 구간마다 촉진 종류·대기 시간·강화 비율 중 최소 1가지를 명시적으로 다르게 쓸 것. ①지도전략의 핵심 방법은 반대로 구간이 바뀌어도 같아야 한다.\n` +
      `6) [평가초점 연결 — 핵심] 평가초점이 교육목표·교육내용·교육방법·평가를 하나로 꿰는 축이다. 교육목표는 평가초점이 가리키는 능력에 도달하도록 진술하고, 교육내용은 그 평가초점을 배우는 구체적 학습내용·활동으로, 교육방법은 그 내용을 가르치는 방법으로, 평가는 평가초점을 기준으로 작성한다(평가초점이 비어 있으면 성취기준을 먼저 분석해 세운다). 교육목표·평가는 "- "로 시작하는 항목 2~3개로 쓴다.\n` +
      `7) [평가계획(eval_plan)] 구간마다 교육목표·교육내용에 근거한 "~는가?" 질문형 항목 2~4개. 반드시 서로 다른 측면을 다각적으로 다룰 것 — (a) 수행·도달, (b) 참여 태도, (c) 지속성(시간·횟수), (d) 독립·모방 수준, (e) 일반화(다른 상황·자료·사람) 중 2~4개 측면을 골라 한 측면당 1개 질문. 같은 측면 반복 금지. 질문은 이 구간의 교육내용에 나온 실제 활동·재료를 담아 구체적으로 쓸 것.\n` +
      `8) 평가(eval)는 ${isQual ? '평가초점을 중심으로, 수업 맥락·학생 반응·성장 변곡점을 담은 내러티브(서술형)로만 작성(수치 금지).' : isTask ? '전체 N단계 중 독립 수행 단계 수와 단계별 촉진 수준(전신→부분→시범→독립)의 변화를 함께 기록하는 과제분석 체크리스트형 서술로 작성.' : '양적 기준 도달 여부와 함께 평가초점 중심의 질적 서술을 함께 포함.'}\n` +
      `9) 학생 실명/식별정보는 절대 쓰지 말 것(익명 ID만).\n` +
      `10) semester_goal에는 위 [학기목표(확정)] 문장을 그대로 출력할 것(새로 쓰거나 바꾸지 말 것).\n` +
      `11) "Tier 1/2/3" 같은 단계 라벨을 결과 텍스트에 그대로 쓰지 말 것. 지원 단계를 언급해야 하면 그 단계가 실제로 어떤 지원인지(예: 소그룹 CICO·일일 행동점검표 등)를 구체적으로 풀어서 서술해, 제출본만 읽어도 이해되게 할 것.\n` +
      `12) 표현은 일상에서 자주 쓰는 쉬운 우리말로 쓸 것. 영어 단어(모니터링·피드백·케이스 등)와 어려운 한자어(제고·함양·도모 등)는 쓰지 말고 쉬운 말로 바꿀 것(교육방법의 증거기반실제 명칭은 예외 — 우리말 명칭+약어 병기). 동사도 잘 안 쓰는 표현 대신 교사·보호자가 바로 이해하는 익숙한 말을 쓸 것.\n` +
      `13) 이 IEP 목표는 성취기준 기반의 학습 목표다. 행동중재(BIP)·Tier 지원·기능평가(QABF) 정보는 '현행수준 파악'과 '지원 강도·교수 방법 선택'의 참고로만 쓰고, 교육목표·교육내용 자체가 문제행동 감소로 치우치지 않게 한다(배워야 할 학습 내용·기능적 기술 습득이 중심이며, 사회·정서 목표도 바람직한 대체기술 습득으로 긍정적으로 진술).\n` +
      `14) 출력 전에 맞춤법·띄어쓰기·문장 오류를 스스로 점검해 바로잡을 것.\n` +
      `15) monthly의 goal·content·eval·eval_plan 문자열에서 항목 구분은 반드시 줄바꿈(\\n)으로 할 것 — 항목들을 쉼표로 이어 붙이지 말 것.\n\n` +
      `반드시 아래 JSON만 출력(설명 금지):\n` +
      `{"semester_goal":"...","plop":"...",${isTask ? '"task_steps":["1단계 행동","2단계 행동"],' : ''}"monthly":[{"month":"${ms[0]}","goal":"- ...\\n- ...","content":"- ...하기\\n- ...하기","methods":["지도전략: ...","지원수준(촉구·용암): ...","강화 스케줄: ..."],"eval":"- ...\\n- ...","eval_plan":"- ...는가?\\n- ...는가?"}],"semestral_eval":"..."}`
    );
  }

  // P7: 성취기준 코드 화이트리스트 검증(방어용). 로드된 목록에 없으면 경고만(차단하지 않음).
  function warnUnknownStandard(code) {
    const c = String(code || '').trim();
    if (!c || !rows.length) return;
    if (!rows.some((r) => r.code === c)) {
      toast(`성취기준 코드 ${c}가 2022 개정 교육과정(기본·공통) 목록에 없습니다 — 확인하세요`);
    }
  }

  // 파싱된 JSON을 화면에 적용(AI 응답/수동 붙여넣기 공용).
  // 0720: 모델이 항목을 줄바꿈(\n) 대신 쉼표로 이어 붙이는 경우("- a,- b") 표에서 읽기 어려움 →
  //       쉼표+"- " 패턴을 줄바꿈으로 정규화한다.
  function normItemList(s) {
    return String(s || '').replace(/\s*,\s*(?=-\s)/g, '\n');
  }
  // 0819(2차 피드백 — 구병모: "요건 유사하게 계속 나오는 듯"): 프롬프트로 점증을 지시해도
  // 모델이 구간별 지원수준·강화를 거의 같은 문장으로 반복할 수 있다 → 결정적 안전망.
  // 인접 구간에 같은 문장이 있으면 그 항목 전체를 규칙 점증 사다리로 대체한다(지도전략·기타 줄은 AI 문장 유지).
  // 과제분석 목표는 교사가 고른 촉진 체계가 축이므로 건드리지 않는다.
  function fixAiMethodRepetition(list) {
    if (critType === 'task' || !Array.isArray(list) || list.length < 2) return { list, fixed: false };
    const n = list.length;
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const catLine = (m, re) => (m.methods || []).find((x) => re.test(String(x)));
    const hasAdjDup = (re) => list.some((m, i) => {
      if (i === 0) return false;
      const a = norm(catLine(m, re)), b = norm(catLine(list[i - 1], re));
      return !!a && a === b;
    });
    const fadeDup = hasAdjDup(/^지원수준/);
    const reinfDup = hasAdjDup(/^강화/);
    if (!fadeDup && !reinfDup) return { list, fixed: false };
    // 0819(4차): 학기 교육방법에 "→" 체인이 있으면 그 체인 배분으로 대체(학기↔월별 연결 유지),
    // 없으면 학생 수준 앵커링 점증 사다리로 대체.
    const semML = String(semMethods || '').split(/\n/).map((s) => s.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean);
    const semSupChain = methodChain(semML.find((l) => /^지원\s*수준/.test(l)) || '');
    const semReinfChain = methodChain(semML.find((l) => /^강화/.test(l)) || '');
    const startStage = fadeStartStage(startpoint?.perfLevel || plop, +cStart, +cEnd);
    const stageFor = (i) => Math.min(FADE_STAGES.length - 1, startStage + Math.round((i / (n - 1)) * (FADE_STAGES.length - 1 - startStage)));
    const stagesArr = list.map((_, i) => stageFor(i));
    const runPos = stagesArr.map((st, i) => { let p = 0; for (let k = i - 1; k >= 0 && stagesArr[k] === st; k--) p++; return p; });
    const rg = (st) => (st <= 1 ? 0 : st === 2 ? 1 : 2);
    const reinfPos = stagesArr.map((st, i) => { let p = 0; for (let k = i - 1; k >= 0 && rg(stagesArr[k]) === rg(st); k--) p++; return p; });
    const raisdMeta = curStuData?.raisd?.responses?._meta || {};
    const topReinf = Array.isArray(raisdMeta.ranking) ? (raisdMeta.ranking.filter(Boolean)[0] || '') : '';
    const fixedList = list.map((m, i) => ({
      ...m,
      methods: (m.methods || []).map((line) => {
        if (fadeDup && /^지원수준/.test(String(line))) {
          if (semSupChain.length) return `지원수준(촉구·용암): ${chainLine(semSupChain, i, n, SUP_CHAIN_EXTRAS)}`;
          const stg = stagesArr[i]; const nxt = i < n - 1 ? stagesArr[i + 1] : stg;
          return `지원수준(촉구·용암): [${FADE_STAGES[stg].label}] ${fadeDesc(stg, runPos[i])}${nxt !== stg ? ` (다음 구간: ${FADE_STAGES[nxt].short})` : ''}`;
        }
        if (reinfDup && /^강화/.test(String(line))) {
          if (semReinfChain.length) return `강화 스케줄: ${chainLine(semReinfChain, i, n, REINF_CHAIN_EXTRAS)}`;
          return `강화 스케줄: ${reinforceStage(stagesArr[i], reinfPos[i], topReinf)}`;
        }
        return line;
      }),
    }));
    return { list: fixedList, fixed: true };
  }

  function applyGen(j) {
    const ms = parseMonthGroups(monthGroups, months, sem).map((g) => monthGroupLabel(g, sem));
    if (j && (j.standard_code || j.standardCode)) warnUnknownStandard(j.standard_code || j.standardCode);
    // 0903: 확정된 학기목표(규칙10: 그대로 출력)를 AI 반환값으로 덮어쓰지 않는다 — 비어 있을 때만 채움.
    if (j.semester_goal || j.semesterGoal) setGoal((cur) => (String(cur || '').trim() ? cur : String(j.semester_goal || j.semesterGoal)));
    if (j.plop) setPlop(String(j.plop));
    if (Array.isArray(j.monthly) && j.monthly.length) {
      const mapped = j.monthly.map((x, i) => ({
        month: String(x.month || ms[i] || ms[ms.length - 1]),
        goal: normItemList(x.goal),
        content: normItemList(x.content),
        methods: Array.isArray(x.methods) ? x.methods.map(String) : String(x.methods || '').split(/\n|,/).map((s) => s.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean),
        eval: normItemList(x.eval || x.evaluation),
        eval_plan: normItemList(x.eval_plan || x.evalPlan),
      }));
      const { list, fixed } = fixAiMethodRepetition(mapped);
      setMonthly(list);
      if (fixed) toast('AI가 구간별 지원수준·강화를 비슷하게 반복해, 구간별 점증(촉구 줄이기·강화 전환)으로 자동 보정했어요.');
      // 0819(동료 피드백): 성취기준을 2~3개 골랐을 때 각 성취기준이 교육내용에 실제로
      // 반영됐는지 크로스체크 — 핵심 단어가 학기목표·월별 어디에도 없으면 경고.
      if (selExtra.length) {
        const allText = [String(goal || j.semester_goal || ''), ...list.map((m) => `${m.goal || ''}\n${m.content || ''}`)].join('\n');
        const missed = [sel, ...selExtra].filter(Boolean).filter((x) => !topicOverlap(x.text, allText));
        if (missed.length) {
          toast(`⚠ 성취기준 ${missed.map((x) => `[${x.code}]`).join(' ')}의 내용이 교육내용에 충분히 반영되지 않은 것 같아요 — 해당 활동을 보태거나 다시 생성해 보세요.`);
        }
      }
    }
    if (j.semestral_eval || j.semestralEval) setSemEval(String(j.semestral_eval || j.semestralEval));
    if (Array.isArray(j.task_steps) && j.task_steps.length) setTaskSteps(j.task_steps.map((s) => String(s).trim()).filter(Boolean));
  }

  async function aiGenerateFromData() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (!supportTier) toast('참고: 지원체계(모듈4)가 미지정이에요 — 지정하면 교육방법에 지원 강도가 반영됩니다.');
    setAiGenBusy(true);
    // P1(0720): 4~5분 걸리는 작업임을 시작 시점에 예고 — 실패·멈춤과 구분되도록.
    toast('월별 계획 AI 생성을 시작했어요 — 품질 모델로 보통 3~5분 걸립니다. 이 화면에 머물러 주세요.');
    try {
      const prompt = await buildGenPrompt();
      let j = await llmJSON('학생 데이터 반영 생성', prompt, { temperature: 0.4 });
      // 예시 베끼기 가드: 예시 자료 문장과 그대로 겹치면 그 구절을 금지어로 붙여 1회 재작성.
      let echoes = findExampleEchoes(j);
      if (echoes.length) {
        try {
          const fixPrompt = prompt +
            '\n\n[재작성 지시] 직전 초안에 예시 자료의 문장이 그대로 들어갔다. 아래 구절은 절대 쓰지 말고, 해당 부분을 이 학생·이 교육내용에 맞는 새로운 표현으로 바꿔 전체 JSON을 다시 출력하라:\n' +
            echoes.map((e) => `- "${e}"`).join('\n');
          const j2 = await llmJSON('예시 겹침 재작성', fixPrompt, { temperature: 0.55 });
          const e2 = findExampleEchoes(j2);
          if (e2.length < echoes.length) { j = j2; echoes = e2; }
        } catch (_) { /* 재작성 실패 시 초안 유지 */ }
      }
      beginDraft('ai'); // 보고 있던 초안을 보관하고 새 'AI n차' 칸을 활성화
      applyGen(j);
      // P11(0720): 치환표에 없는 한자(중국어 혼입 의심)가 남았으면 교사에게 경고.
      const hanja = findHanja(JSON.stringify(j));
      if (hanja.length) toast(`⚠ 생성문에 한자 혼입 ${hanja.length}곳(${hanja.slice(0, 3).join(', ')}…)이 있어요 — 해당 칸을 확인·수정해 주세요.`);
      // 0902: 교육목표·교육내용의 부정 진술("~하지 않는다") 검출 — 교육방법("촉진 없이")은 검사하지 않는다.
      const negTargets = [j.semester_goal, ...(Array.isArray(j.monthly) ? j.monthly.flatMap((m) => [m.goal, m.content]) : [])].filter(Boolean).join('\n');
      const negs = findNegative(negTargets);
      if (negs.length) toast(`⚠ 교육목표·교육내용에 부정 진술 ${negs.length}곳("${negs[0].slice(0, 22)}…") — 대신 무엇을 하는지(대체행동)로 고쳐 주세요.`);
      if (echoes.length) toast(`생성했어요. 다만 예시 자료와 겹치는 표현이 ${echoes.length}곳 남아 있어요 — 해당 칸을 다듬어 주세요.`);
      else toast('학생 데이터를 반영해 생성했어요.');
    } catch (e) {
      // P1(0720): 실패를 조용히 넘기지 않는다 — 원인·다음 행동을 함께 안내.
      toast('AI 생성 실패: ' + e.message + ' — 우측 상단 AI 연결 상태를 확인한 뒤 다시 시도하세요. 이전 초안은 "초안 전환"에 그대로 남아 있어요.');
    } finally {
      setAiGenBusy(false);
    }
  }

  // 교과 평어(세부능력·특기사항) 생성 — 선택 성취기준 + 목표/현행수준/평가초점 반영.
  async function aiPyeong() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setPyeongBusy(true); setPyeongLines([]);
    try {
      const perfParts = [];
      if (goal) perfParts.push('학기목표: ' + goal);
      if ((evalFoci || []).filter((f) => f.trim()).length) perfParts.push('평가초점: ' + evalFoci.filter((f) => f.trim()).join(' / '));
      if (plop) perfParts.push('현행수준: ' + plop);
      const prompt = buildPyeongPrompt({
        standard: `[${sel.code}] ${sel.text}`,
        performance: perfParts.join('\n') || '수업 활동 및 수행 전반',
        level: pyeongLevel,
        count: 12,
        context: profileNarrative(curStu) || curStu?.note || '',
        includeBehaviorSupport: pyeongBehavior,
      });
      const r = await callDetailed(prompt, { temperature: 0.6, label: '교과 평어 생성' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const parsed = parsePyeongLines(out);
      if (!parsed.length) { toast('평어를 추출하지 못했어요. 다시 시도해 주세요.'); }
      // P11: 한자 혼입 경고.
      const hanja = findHanja(parsed.join('\n'));
      if (hanja.length) toast(`⚠ 평어에 한자 혼입 ${hanja.length}곳(${hanja.slice(0, 3).join(', ')}…)이 있어요 — 확인·수정해 주세요.`);
      setPyeongLines(parsed);
    } catch (e) { toast('평어 생성 실패: ' + e.message); }
    finally { setPyeongBusy(false); }
  }
  async function copyPyeongAll() {
    try { await navigator.clipboard.writeText(pyeongLines.map((l) => '- ' + l).join('\n')); toast('평어 전체 복사했어요.'); }
    catch (_) { toast('복사가 막혔어요. 직접 선택해 복사하세요.'); }
  }
  // 생성된 평어는 교사가 직접 수정 가능.
  function editPyeong(i, val) { setPyeongLines((prev) => prev.map((x, idx) => (idx === i ? val : x))); }
  function removePyeong(i) { setPyeongLines((prev) => prev.filter((_, idx) => idx !== i)); }

  // AI 미연결: 프롬프트를 만들어 복사 → 외부 AI 응답을 붙여넣어 파싱.
  async function openManualPrompt() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    setManualOpen(true); setPasteText(''); setPromptText('프롬프트 생성 중…');
    try { setPromptText(await buildGenPrompt()); } catch (e) { setPromptText('프롬프트 생성 실패: ' + e.message); }
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(promptText); toast('프롬프트를 복사했어요.'); }
    catch (_) { toast('자동 복사가 막혔어요. 텍스트를 직접 선택해 복사하세요.'); }
  }
  function applyPasted() {
    try {
      const j = parseLooseJSON(pasteText);
      beginDraft('ai');
      applyGen(j);
      const echoes = findExampleEchoes(j);
      if (echoes.length) toast(`적용했어요. 예시 자료와 겹치는 표현이 ${echoes.length}곳 있어요(예: "${echoes[0]}") — 다른 표현으로 다듬어 주세요.`);
      else toast('응답을 읽어 적용했어요.');
      setManualOpen(false);
    }
    catch (e) { toast('AI 응답을 읽지 못했어요: ' + e.message); }
  }


  async function save() {
    if (!curStuId || !sel) { toast('학생과 성취기준을 선택하세요.'); return; }
    if (!monthly.length) { toast('월별 목표를 먼저 생성하세요.'); return; }
    // P7: 성취기준 코드 화이트리스트 검증(방어용, 차단하지 않음).
    warnUnknownStandard(sel.code);
    setBusy(true);
    try {
      // P2: 실제 데이터로서의 Tier 연동 — 이 학생의 현재 Tier 2 소그룹 id를 함께 저장.
      const myTierGroups = (tier2Groups || []).filter((g) => (g.members || []).some((m) => m.student_id === curStuId));
      const body = {
        school_year: schoolYear,
        subject: sel.subject, grade_code: sel.gradeCode, area: sel.area,
        standard_code: sel.code, standard_text: sel.text,
        // 0720: 관련 성취기준(다중 선택) — 연수자료 양식의 "관련성취기준" 목록.
        related_stds: selExtra.map((x) => ({ code: x.code, text: x.text, subject: x.subject, area: x.area, grade_code: x.gradeCode })),
        semester: +sem, semester_goal: goal, plop,
        sem_content: semContent, sem_methods: semMethods,
        // 0903(B안): 성취기준별 도달 목표 — 교과중심 경로(또는 저장본 편집)에서, 현재 선택된 성취기준에 있는 것만.
        // 단일 성취기준이면 학기목표가 곧 그 줄이므로 학기목표 문장을 그대로 담는다.
        std_goals: (flowMode === 'std' || editingId)
          ? (stdGoals || [])
            .filter((x) => x && x.code && (x.code === sel.code || selExtra.some((s) => s.code === x.code)))
            .map((x, _i, arr) => ({ code: x.code, std: String(x.std || ''), goal: String(arr.length === 1 ? goal : (x.goal || '')).trim() }))
          : [],
        crit_type: critType, crit_start: +cStart, crit_end: +cEnd,
        support_tier: supportTier,
        tier2_group_id: myTierGroups[0]?.id ?? null,
        eval_foci: (evalFoci || []).map((f) => f.trim()).filter(Boolean),
        task_steps: (taskSteps || []).map((t) => t.trim()).filter(Boolean),
        chain_type: chainType, prompt_system: promptSystem,
        monthly, semestral_eval: semEval,
      };
      if (editingId) body.id = editingId;
      const r = await saveIEPGoal(curStuId, body);
      toast(editingId ? 'IEP 목표 수정 완료' : 'IEP 목표 저장 완료');
      markSaved(); hintNextStep('iepReport'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
      if (r?.goal?.id) setEditingId(r.goal.id);
      const d = await fetchIEP(curStuId);
      setSavedGoals(d.goals || []);
      return r;
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeGoal(id) {
    try {
      await deleteIEPGoal(curStuId, id);
      setSavedGoals((prev) => prev.filter((g) => g.id !== id));
      toast('삭제했습니다.');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  // 나이스 양식(학기별/월별/평가계획) 진짜 .docx 내보내기 — 깨짐 없이 열린다.
  function exportNiceWord(goals) {
    if (!goals.length) { toast('저장된 IEP 목표가 없습니다. 먼저 저장하세요.'); return; }
    downloadNiceIepDocx({
      student: { code: curStu.code, level: curStu.level },
      teacherName: user?.name || '',
      year: schoolYear,
      goals,
    }).then(() => setWordDone(true)).catch((e) => toast('Word 생성 실패: ' + e.message));
  }

  // 평가초점 연수자료 양식(생활지원/교과 중심)대로 Word 내보내기 — 진짜 .docx (0824)
  function exportFormWord(goals) {
    if (!goals.length) { toast('저장된 IEP 목표가 없습니다. 먼저 저장하세요.'); return; }
    downloadIepFormDocx({
      student: { code: curStu.code, level: curStu.level, disability: curStu.disability },
      teacherName: user?.name || '',
      goals,
    })
      .then(() => setWordDone(true))
      .catch((e) => toast('Word 생성 실패: ' + e.message));
  }

  // 과제분석 단계별 평가 기록지(데이터 수집 체크리스트) 인쇄용 Word 출력 — 진짜 .docx (0824)
  function downloadTaskSheetNow() {
    const steps = (taskSteps || []).map((t) => t.trim()).filter(Boolean);
    if (!steps.length) { toast('단계를 먼저 만들어 주세요.'); return; }
    downloadTaskSheetDocx({
      student: { code: curStu.code, level: curStu.level, disability: curStu.disability },
      teacherName: user?.name || '',
      goalText: goal,
      steps, chainType, promptSystem,
    }).catch((e) => toast('기록지 생성 실패: ' + e.message));
  }

  // ── 🌐 외부AI 연동 설정 — 각 AI 기능의 프롬프트 생성·응답 적용(로컬 AI와 비교용) ──
  const EXT_CONFIGS = {
    analyze: {
      title: '🌐 외부 AI — 성취기준 분석 (동사·행위지향·평가초점)',
      buildPrompt: async () => (
        '다음 2022 개정 교육과정 성취기준을 분석해 "평가초점"까지 한 번에 작성하세요.\n' +
        '- verb: 측정 가능한 대표 동사(명사형, 예: 분류하기)\n' +
        '- verbs: 같은 의미·같은 성취 의도로 바꿔 쓸 수 있는 측정 가능한 동사 6~8개(모두 명사형, 대표 동사 포함)\n' +
        '- intent: 행위지향(가치·태도). 명시된 부사어가 없으면 성취기준의 취지에서 반드시 유추해 한 구절로(빈 값 금지)\n' +
        '- descriptor: 서술자(핵심 대상·내용)\n' +
        '- foci: verbs의 각 동사를 하나씩 사용한 자연스러운 평가초점 문장 목록(평서형 "~한다."로 끝냄, 지원 수준으로 나누지 말 것)\n' +
        '- 모두 영어 단어·어려운 한자어 없이 쉬운 우리말로, 맞춤법·문장 오류 없이.\n' +
        '반드시 JSON 객체 하나만 출력: {"verb":"...","verbs":["...","..."],"intent":"...","descriptor":"...","foci":["...","..."]}\n\n' +
        `성취기준: [${sel?.code}] ${sel?.text}`
      ),
      apply: (raw) => {
        const j = parseLooseJSON(raw);
        const aVerb = j.verb != null ? String(j.verb).trim() : '';
        let alts = Array.isArray(j.verbs) ? j.verbs.map(String).map((s) => s.trim()).filter(Boolean) : [];
        if (aVerb && !alts.includes(aVerb)) alts = [aVerb, ...alts];
        if (aVerb) setVerb(aVerb);
        if (alts.length) setVerbAlts([...new Set(alts)]);
        if (j.intent != null && String(j.intent).trim()) setIntent(String(j.intent).trim());
        if (j.descriptor != null && String(j.descriptor).trim()) setDescriptor(String(j.descriptor));
        const foci = Array.isArray(j.foci) ? j.foci.map(String).map((s) => s.trim()).filter(Boolean) : [];
        if (foci.length) setEvalFoci(foci);
        toast('외부 AI 분석 결과를 적용했어요.');
        return true;
      },
    },
    verbs: {
      title: '🌐 외부 AI — 같은 의미 동사 펼치기',
      buildPrompt: async () => (
        '특수교육 평가초점 작성을 돕습니다. 아래 "대표 동사"와 같은 의미·같은 성취 의도로 바꿔 쓸 수 있는 측정 가능한 동사(구체 행동 표현)를 6~8개 제시하고, 각 동사를 사용한 자연스러운 평가초점 문장을 1개씩 만드세요.\n' +
        '- 동사는 모두 명사형(~하기/~기), 대표 동사 자신도 포함.\n' +
        '- 평가초점 문장은 평서형("~한다.")으로 끝내고, 지원 수준(도움받아/독립)으로 나누지 말 것.\n' +
        '- 쉬운 우리말로, 맞춤법 오류 없이.\n' +
        '반드시 JSON 객체 하나만 출력: {"verbs":["...","..."],"foci":["...","..."]}\n\n' +
        `대표 동사: ${(verb || sel?.verb || '').trim()}` + (sel ? `\n맥락(성취기준): [${sel.code}] ${sel.text}` : '') +
        (descriptor ? `\n서술자(대상): ${descriptor}` : '') + (intent ? `\n행위지향: ${intent}` : '')
      ),
      apply: (raw) => {
        const j = parseLooseJSON(raw);
        const alts = Array.isArray(j.verbs) ? [...new Set(j.verbs.map(String).map((s) => s.trim()).filter(Boolean))] : [];
        if (alts.length) setVerbAlts(alts);
        const foci = Array.isArray(j.foci) ? j.foci.map(String).map((s) => s.trim()).filter(Boolean) : [];
        if (foci.length) setEvalFoci(foci);
        if (!alts.length && !foci.length) { toast('동사/평가초점을 찾지 못했어요.'); return false; }
        toast('외부 AI의 동사·평가초점을 적용했어요.');
        return true;
      },
    },
    steps: {
      title: '🌐 외부 AI — 과제분석 단계 분해',
      buildPrompt: async () => buildStepsPrompt(),
      apply: (raw) => {
        const j = parseLooseJSON(raw);
        const steps = Array.isArray(j.steps) ? j.steps.map((s) => String(s).trim()).filter(Boolean) : [];
        if (!steps.length) { toast('단계를 찾지 못했어요.'); return false; }
        setTaskSteps(steps);
        syncTaskTargets(steps.length);
        toast(`외부 AI가 분해한 ${steps.length}개 단계를 적용했어요.`);
        return true;
      },
    },
    pyeong: {
      title: '🌐 외부 AI — 교과 평어 생성',
      buildPrompt: async () => {
        const perfParts = [];
        if (goal) perfParts.push('학기목표: ' + goal);
        if ((evalFoci || []).filter((f) => f.trim()).length) perfParts.push('평가초점: ' + evalFoci.filter((f) => f.trim()).join(' / '));
        if (plop) perfParts.push('현행수준: ' + plop);
        return buildPyeongPrompt({
          standard: `[${sel?.code}] ${sel?.text}`,
          performance: perfParts.join('\n') || '수업 활동 및 수행 전반',
          level: pyeongLevel,
          count: 12,
          context: profileNarrative(curStu) || curStu?.note || '',
          includeBehaviorSupport: pyeongBehavior,
        });
      },
      apply: (raw) => {
        const parsed = parsePyeongLines(raw);
        if (!parsed.length) { toast('평어 문장을 찾지 못했어요.'); return false; }
        setPyeongLines(parsed);
        toast(`외부 AI 평어 ${parsed.length}개를 적용했어요.`);
        return true;
      },
    },
  };
  const extCfg = EXT_CONFIGS[extKind];
  function openExt(kind) {
    if (!sel && kind !== 'pyeong') { toast('성취기준을 먼저 선택하세요.'); return; }
    if (kind === 'pyeong' && !sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (kind === 'verbs' && !(verb || sel?.verb)) { toast('먼저 측정 가능한 동사를 입력하거나 분석을 실행하세요.'); return; }
    setExtKind(kind);
  }

  if (!curStu) return (<><StuHero /><NoStudentHint /></>);

  const priorGoals = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear);

  const curTier = curStuId ? studentTier(curStuId) : 1;
  const curTierGroups = (tier2Groups || []).filter((g) => (g.members || []).some((m) => m.student_id === curStuId));
  const TIER_BADGE = { 1: { t: 'Tier 1 (학급 보편)', c: '#4f6bed' }, 2: { t: 'Tier 2 (소그룹)', c: '#e8590c' }, 3: { t: 'Tier 3 (개별)', c: '#c43653' } };

  // 경로별 카드 번호 (A: 성취기준→학기목표 / B: 학기목표→성취기준)
  const stepNo = flowMode === 'goal'
    ? { goal: '①', std: '②', foci: '③', editor: '④' }
    : { std: '①', goal: '②', foci: '③', editor: '④' };

  // 학기목표 설정 카드 — 경로A(성취기준 다음)·경로B(맨 처음) 공용 (0719 피드백: 학기목표 선행).
  const goalCard = (
    <div className="card" id="iep-goal">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>🎯 {stepNo.goal} 학기목표 설정</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {flowMode === 'std' && aiOn && !!sel && (
            <button className="btn btn-ok btn-sm" onClick={aiGoalFromStd} disabled={goalAiBusy}>
              {goalAiBusy ? '생성 중…' : '✨ AI로 성취기준별 목표·학기목표 생성 (성취기준+학생 자료)'}
            </button>
          )}
          {flowMode === 'goal' && aiOn && (
            <button className="btn btn-ok btn-sm" onClick={aiRefineGoal} disabled={goalAiBusy}>
              {goalAiBusy ? '다듬는 중…' : '✨ AI 문장 다듬기'}
            </button>
          )}
        </div>
      </div>
      <div className="card-subtitle">
        {flowMode === 'goal'
          ? '학생에게 지금 필요한 기술·내용 중심으로 한 학기 동안 도달할 목표를 먼저 적으세요. 다음 단계에서 관련 성취기준을 연결합니다. (생활 지원 중심)'
          : '선택한 성취기준마다 이 학생 수준으로 조정한 목표를 확정하고, 학기목표 한 문장은 그 묶음의 요약으로 정리하세요. (교과 중심)'}
        {' '}학기목표를 먼저 확정하면 평가초점과 월별 계획이 이 목표에서 나옵니다.
      </div>
      {/* 0903(B안): 성취기준별 목표 — 성취기준 자체가 아니라 학생 수준으로 조정한 목표 1개씩. 평가초점·월별의 앵커.
          단일 성취기준이면 학기목표가 곧 그 줄이라 목록을 따로 보이지 않는다(종전 화면 그대로). */}
      {flowMode === 'std' && stdGoals.length > 1 && (
        <div className="form-group">
          <label className="form-label">성취기준별 목표 (성취기준마다 1개 · 학생 수준으로 조정 · 수정 가능)</label>
          <div style={{ display: 'grid', gap: 6 }}>
            {stdGoals.map((x, i) => {
              const c = stdCoverage[i];
              const req = c?.terms?.required || [];
              return (
                <div key={x.code} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'start', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                  <span className="qchip on" title={x.std} style={{ marginTop: 2 }}>[{x.code}]</span>
                  <textarea className="form-textarea" rows={2} value={x.goal} onChange={(e) => editStdGoal(i, e.target.value)} style={{ minHeight: 0 }}
                    placeholder={x.std} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    {req.length > 0 && (c.ok
                      ? <span title={`필수 낱말 반영: ${[...c.nounHits, ...c.verbHits].join(', ')}`} style={{ fontSize: '.72rem', color: '#15803d', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ 반영</span>
                      : <span title={`빠진 낱말: ${c.missing.join(', ')}`} style={{ fontSize: '.72rem', color: '#b45309', fontWeight: 700, whiteSpace: 'nowrap' }}>⚠ {c.missing.slice(0, 3).join('·')} 빠짐</span>)}
                    <button type="button" className="btn btn-sm" onClick={() => resetStdGoal(i)} title="성취기준 원문으로 되돌리기">원문</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            각 줄은 그 성취기준을 이 학생 수준으로 조정한 목표예요(성취기준 자체가 아님). 평가초점은 이 줄들의 하위 수행으로, 월별 교육목표는 줄 순서대로 배정돼요. 아래 학기목표 한 문장은 이 묶음의 요약입니다.
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {flowMode === 'std' && stdGoals.length > 1 ? '학기목표 (성취기준별 목표의 요약 한 문장 · 수정 가능)' : '학기목표 (한 문장 · 수정 가능)'}
          {flowMode === 'std' && stdGoals.length === 1 && (stdCoverage[0]?.terms?.required?.length > 0) && (stdCoverage[0].ok
            ? <span title={`성취기준 낱말 반영: ${[...stdCoverage[0].nounHits, ...stdCoverage[0].verbHits].join(', ')}`} style={{ fontSize: '.72rem', color: '#15803d', fontWeight: 700 }}>✓ 성취기준 반영</span>
            : <span title={`빠진 낱말: ${stdCoverage[0].missing.join(', ')}`} style={{ fontSize: '.72rem', color: '#b45309', fontWeight: 700 }}>⚠ {stdCoverage[0].missing.slice(0, 3).join('·')} 빠짐</span>)}
        </label>
        <textarea className="form-textarea" value={goal} onChange={(e) => { const v = e.target.value; setGoal(v); if (flowMode === 'std' && stdGoals.length === 1) editStdGoal(0, v); }}
          placeholder="예: 학교에서 있었던 일을 활동사진을 보고 단어로 적어 문장을 완성할 수 있다." />
      </div>
      {/* P15(0720 현장 피드백): 학기목표와 함께 교육내용·교육방법도 학기 수준에서 같이 작성 —
          여기서 잡은 방향이 월별 계획(규칙 초안·AI 생성)의 교육내용·교육방법으로 이어진다. */}
      <div className="form-row" style={{ marginBottom: 0 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <label className="form-label" style={{ margin: 0 }}>교육내용 (학기 방향 · 여러 줄 "-")</label>
            {/* P16: 연수자료 방식 AI 초안 — 교육내용("~하기" 활동)+교육방법("→" 단계 서술)을 한 번에. */}
            {aiOn && (
              <button type="button" className="btn btn-ok btn-sm" onClick={aiSemContentMethods} disabled={semAiBusy}
                title="연수자료 방식(활동 목록 + 지원을 줄여가는 단계 서술)으로 교육내용·교육방법 초안을 AI가 만듭니다">
                {semAiBusy ? '⏳ 채우는 중…' : '✨ AI로 내용·방법 채우기'}
              </button>
            )}
            {/* 0720: "평가초점에서 채우기"는 순서가 거꾸로였음(평가초점은 다음 ③단계).
                이 단계에 이미 있는 학기목표·성취기준을 재료로 초안을 만든다. */}
            <button type="button" className="btn btn-ghost btn-sm" title="학기목표와 선택한 성취기준에서 학기 교육내용 초안을 만듭니다"
              onClick={() => {
                const srcs = [...new Set([
                  ...[sel, ...selExtra].filter(Boolean).map((x) => String(x.text || '').trim()),
                  String(goal || '').trim(),
                ].filter(Boolean))];
                if (!srcs.length) { toast('학기목표를 적거나 성취기준을 선택하면 초안을 채울 수 있어요.'); return; }
                setSemContent(srcs.map((s) => `- ${toActivityPhrase(s)}`).join('\n'));
                toast('학기목표·성취기준에서 학기 교육내용 초안을 채웠어요 — 다듬어 쓰세요.');
              }}>↻ 목표·성취기준에서 채우기</button>
          </div>
          <textarea className="form-textarea" rows={3} style={{ marginTop: 6 }} value={semContent} onChange={(e) => setSemContent(e.target.value)}
            placeholder={'이 학기에 다룰 학습내용·활동의 큰 방향 (예: - 짧은 글 읽고 주요 내용 찾기 활동)'} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <label className="form-label" style={{ margin: 0 }}>교육방법 (학기 방향 · 여러 줄 "-")</label>
            <button type="button" className="btn btn-ghost btn-sm" title="장애유형·촉진체계와 출발점 수행 수준을 반영해 학기 교육방법 초안을 만듭니다"
              onClick={() => {
                const ms = critType === 'task' ? methodsForTask(curStu?.disability, promptSystem) : methodsForType(curStu?.disability);
                // 0819(3차 피드백 — 구병모): 지원수준·강화 줄이 학생과 무관한 고정 문장이라
                // 모든 학생·과목에서 똑같이 반복됨 → 출발점 '수행 가능 수준'(없으면 현행수준)에서
                // 시작 단계를 앵커링해, 이 학생이 지금 어디서 출발하는지가 문장에 드러나게 한다.
                const startStage = fadeStartStage(startpoint?.perfLevel || plop, +cStart, +cEnd);
                const START_DESC = ['신체·시범 촉진이 필요한', '언어·시각 촉진이 필요한', '시간지연·최소 촉진으로 수행하는'];
                const fadeChain = FADE_STAGES.slice(startStage).map((x) => x.short).join(' → ');
                const raisdMeta = curStuData?.raisd?.responses?._meta || {};
                const topReinf = Array.isArray(raisdMeta.ranking) ? (raisdMeta.ranking.filter(Boolean)[0] || '') : '';
                const supLine = critType === 'task'
                  ? `- 지원수준: 현행 '${START_DESC[startStage]}' 수준에서 시작해 ${PROMPT_LABEL[promptSystem]}로 촉구를 점차 줄여, 학기말 독립 수행으로`
                  : `- 지원수준: 현행 '${START_DESC[startStage]}' 수준에서 시작해 ${fadeChain} 순서로 촉구를 점차 줄여, 학기말 독립 수행으로`;
                const reinfLine = startStage >= 2
                  ? `- 강화: 간헐 강화(변동비율)${topReinf ? ` — 선호 강화물(${topReinf}) 활용` : ''} → 자연적 강화 → 스스로 확인하기(자기강화)로 전환`
                  : `- 강화: 습득 단계 즉시(연속) 강화${topReinf ? `(선호: ${topReinf})` : ''} → 유지 단계 간헐 강화 → 자연적 강화로 전환`;
                setSemMethods([`- 지도전략: ${ms.join(', ')}`, supLine, reinfLine].join('\n'));
                toast('출발점 수행 수준을 반영해 학기 교육방법 초안을 채웠어요 — 학생·과목에 맞게 다듬어 쓰세요.');
              }}>↻ 기본 전략으로 채우기</button>
          </div>
          <textarea className="form-textarea" rows={3} style={{ marginTop: 6 }} value={semMethods} onChange={(e) => setSemMethods(e.target.value)}
            placeholder={'이 학기에 쓸 지도전략·지원 방법의 큰 방향 (예: - 시각적 지원과 직접교수 중심)'} />
        </div>
      </div>
      <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>
        여기 적은 학기목표·교육내용·교육방법이 아래 <strong>월별 계획(규칙 초안·AI 생성)</strong>에 이어져 더 구체적으로 만들어져요. 비워 두면 기존 방식대로 자동 구성됩니다.
      </div>
    </div>
  );

  return (
    <>
      <StuHero />
      {/* 0821: IEP 교육방법(강화 전략)·목표 선정에 쓰이는 기초 평가 — 여기서 바로 작성·수정 */}
      <AssessmentLauncher compact />

      {/* Tier 구성 참고 — IEP는 Tier 1·2·3 데이터를 조합해 목표를 세운다 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 14px', marginBottom: 4, borderRadius: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '.84rem',
      }}>
        <strong style={{ color: 'var(--pri)' }}>🧩 Tier 구성</strong>
        <span style={{
          padding: '2px 10px', borderRadius: 99, color: '#fff', fontWeight: 700, fontSize: '.76rem',
          background: TIER_BADGE[curTier].c,
        }}>{TIER_BADGE[curTier].t}</span>
        {curTierGroups.length > 0 && (
          <span style={{ color: 'var(--muted)' }}>소속 소그룹: {curTierGroups.map((g) => g.name).join(', ')}</span>
        )}
        <span style={{ color: 'var(--muted)' }}>· IEP 목표는 Tier 1(학급)·Tier 2(소그룹)·Tier 3(개별) 자료를 조합해 작성합니다.</span>
      </div>

      {/* 작성 순서 진행바(스텝퍼) — 성취기준 → 평가초점 → 목표 생성 → 저장 → 계획서 */}
      {(() => {
        const stdStep = { label: flowMode === 'goal' ? '성취기준 연결' : '성취기준 선택', done: !!sel, id: 'iep-std' };
        const goalStep = { label: '학기목표', done: !!String(goal).trim(), id: 'iep-goal' };
        const steps = [
          ...(flowMode === 'goal' ? [goalStep, stdStep] : [stdStep, goalStep]),
          { label: '평가초점', done: (evalFoci || []).some((f) => String(f).trim()), id: 'iep-foci' },
          { label: '월별 계획 생성', done: monthly.length > 0, id: 'iep-editor' },
          { label: '저장', done: !!editingId, id: 'iep-editor' },
          { label: '계획서 Word', done: wordDone, id: 'iep-saved' },
        ];
        const firstUndone = steps.findIndex((s) => !s.done);
        const cur = firstUndone === -1 ? steps.length - 1 : firstUndone;
        const go = (id) => { const el = typeof document !== 'undefined' && document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        return (
          <div className="stepnav-progress" role="navigation" aria-label="IEP 작성 순서"
            style={{ position: 'sticky', top: 0, zIndex: 30, marginTop: 6, padding: '8px 0', background: 'var(--bg, #fff)', boxShadow: '0 4px 8px -6px rgba(0,0,0,.25)' }}>
            {steps.map((s, i) => (
              <button key={i} type="button"
                className={'stepnav-pill' + (i === cur ? ' cur' : '') + (s.done ? ' done' : '')}
                onClick={() => go(s.id)} title={`${i + 1}. ${s.label}`} aria-current={i === cur ? 'step' : undefined}>
                <span className="pnum" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
                <span className="plabel">{s.label}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* 저장된 목표 — 수정 진입점(맨 위) */}
      {(goalsLoading || savedGoals.length > 0) && (
        <div className="card" id="iep-saved">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🗂 저장된 IEP 목표 ({savedGoals.length}) <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>— 수정하려면 [✏ 수정], 새로 만들려면 아래에서 성취기준 선택</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.78rem', color: 'var(--sub)' }} title="문서의 학기목표 칸에 성취기준별 목표를 함께 찍을지 정해요(이 브라우저에 저장)">
                문서 학기목표
                <select className="form-select" style={{ width: 'auto', padding: '4px 6px', fontSize: '.78rem' }} value={goalStyle} onChange={(e) => changeGoalStyle(e.target.value)}>
                  <option value="full">한 문장 + 성취기준별 목표</option>
                  <option value="summary">한 문장만</option>
                </select>
              </label>
              <button className="btn btn-ok btn-sm" onClick={() => exportNiceWord(savedGoals)} disabled={goalsLoading}>📄 나이스 양식 Word(.docx)</button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportFormWord(savedGoals)} disabled={goalsLoading}>📄 양식 Word (생활지원/교과 중심)</button>
            </div>
          </div>
          {goalsLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 2px', color: '#6b7280' }}>
              <span style={spinner} /> 저장된 목표를 불러오는 중…
            </div>
          )}
          {!goalsLoading && savedGoals.map((g) => (
            <div key={g.id} style={{ border: '1px solid ' + (editingId === g.id ? '#7c4dff' : '#e3e6eb'), background: editingId === g.id ? '#f5f0ff' : '#fff', borderRadius: 9, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220, flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#3b6ef5', fontWeight: 700 }}>[{g.standard_code}]{Array.isArray(g.related_stds) && g.related_stds.length ? ` 외 ${g.related_stds.length}개` : ''} {g.subject}{g.area ? ' · ' + g.area : ''} · {GRADE[g.grade_code]} · {g.semester}학기</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>{g.semester_goal}</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3 }}>월별 {Array.isArray(g.monthly) ? g.monthly.length : 0}개월 · 수정 {g.updated_at}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <button className="btn btn-pri btn-sm" onClick={() => loadGoal(g)}>{editingId === g.id ? '수정 중' : '✏ 수정'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportNiceWord([g])}>나이스 Word</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportFormWord([g])}>양식 Word</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeGoal(g.id)}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 전년도 IEP 기준으로 시작 */}
      {priorGoals.length > 0 && (
        <div className="card" style={{ borderColor: '#d8c9ff' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>🔁 전년도 IEP 기준으로 생성 ({priorGoals.length})</div>
          <div className="card-subtitle">전년도 목표를 기준으로 불러온 뒤 "✨ AI 생성"을 누르면, 그 목표·평가를 이어받아 올해 목표를 만듭니다.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8 }}>
            {priorGoals.slice(0, 12).map((g) => (
              <div key={g.id} style={{ border: '1px solid #e3e6eb', borderRadius: 9, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11.5, color: '#7c4dff', fontWeight: 700 }}>{g.school_year}학년도 {g.semester}학기 · {g.subject}{g.area ? ' · ' + g.area : ''}</div>
                <div style={{ fontSize: 13 }}>{g.semester_goal}</div>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => startFromPrior(g)}>이 목표 기준으로 →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 학기목표 작성 경로 선택 (0719 피드백: 학기목표 선행 — 두 경로 중 선택) */}
      <div className="card">
        <div className="card-title" data-tour="iep-flow">🧭 학기목표 작성 경로</div>
        <div className="card-subtitle">학기목표를 먼저 확정하고, 평가초점·월별 계획은 학기목표에서 나옵니다. 어떤 순서로 학기목표를 만들지 선택하세요.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8 }}>
          {[
            { key: 'std', t: 'A. 성취기준 먼저 → 학기목표', d: '교과 성취기준을 먼저 고르고, 학생에 맞게 재구성해 학기목표를 만듭니다. (교과 중심)' },
            { key: 'goal', t: 'B. 학기목표 먼저 → 성취기준', d: '학생에게 필요한 기술·내용 중심으로 학기목표를 먼저 쓰고, 관련 성취기준을 연결합니다. (생활 지원 중심)' },
          ].map((m) => (
            <button key={m.key} type="button" onClick={() => { setFlowMode(m.key); setStdRecs([]); if (m.key === 'goal' && !editingId) { setStdGoals([]); autoSummaryRef.current = ''; } }}
              aria-pressed={flowMode === m.key}
              style={{ textAlign: 'left', border: '2px solid ' + (flowMode === m.key ? '#3b6ef5' : '#e3e6eb'), background: flowMode === m.key ? '#eaf0ff' : '#fff', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, color: flowMode === m.key ? '#3b6ef5' : '#374151' }}>{flowMode === m.key ? '✓ ' : ''}{m.t}</div>
              <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>{m.d}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 경로B: 학기목표 카드가 맨 앞 */}
      {flowMode === 'goal' && goalCard}

      {/* 성취기준 선택/연결 — 경로A: 첫 단계, 경로B: 학기목표 다음 */}
      {(flowMode === 'std' || !!String(goal).trim()) && (
      <div className="card" id="iep-std">
        <div className="card-title">📋 {stepNo.std} {flowMode === 'goal' ? '성취기준 연결 (학기목표와 관련된 기준 선택)' : '성취기준 선택'}</div>
        <div className="card-subtitle">2022 개정 교육과정 성취기준 {rows.length || ''}개(기본교육과정 {currCounts.기본} · 공통교육과정 {currCounts.공통})에서 교육과정·교과·학년군·영역으로 좁혀 선택합니다. 교육과정 구분은 학생 장애영역에 맞춰 미리 골라집니다. <strong>여러 개 선택 가능</strong> — 누르면 담기고, 다시 누르면 빠집니다.</div>
        {/* 0720: 선택된 성취기준 목록 — 단순 토글(대표 개념 없음) */}
        {(sel || selExtra.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0 8px', padding: '8px 10px', background: '#f3f6fc', border: '1px solid #d5e0f5', borderRadius: 8 }}>
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#3b6ef5' }}>선택됨 {1 * !!sel + selExtra.length}개:</span>
            {[...(sel ? [sel] : []), ...selExtra].map((x) => (
              <span key={x.code} className="qchip on" title={x.text} style={{ maxWidth: 340 }}>
                [{x.code}]
                <button type="button" onClick={() => pickStandard(x)}
                  title="선택에서 빼기" aria-label={`${x.code} 빼기`}
                  style={{ marginLeft: 4, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>×</button>
              </span>
            ))}
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>계획서의 과목·영역 칸에는 첫 번째로 선택한 성취기준의 교과({sel?.subject || ''})가 쓰여요.</span>
          </div>
        )}
        {flowMode === 'goal' && (
          <div style={{ background: '#eef4ff', border: '1px solid #b9cdf0', borderRadius: 8, padding: '10px 12px', margin: '4px 0 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '.86rem', color: '#274690' }}>✨ 학기목표로 추천</strong>
              <button className="btn btn-pri btn-sm" onClick={aiRecommendStandards} disabled={stdRecBusy}>
                {stdRecBusy ? '추천 중…' : (aiOn ? '✨ 관련 성취기준 추천 (AI)' : '🔎 키워드로 관련 기준 찾기')}
              </button>
              {sel && <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>✓ 연결됨: [{sel.code}]{selExtra.length ? ` 외 ${selExtra.length}개` : ''}</span>}
            </div>
            {/* 0819: 지금 어떤 학년 기준으로 추천되는지 항상 표시 + 학년 없으면 그 자리에서 입력 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: '.78rem', color: '#274690' }}>
              <span>🎓 추천 기준: <strong>{gradeBasisLabel}</strong></span>
              {curStu?.level && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>학년</span>
                  <select
                    className="form-select"
                    style={{ height: 28, padding: '0 6px', fontSize: '.78rem', width: 'auto' }}
                    value={curStu.grade || ''}
                    onChange={(e) => saveGradeInline(e.target.value)}
                  >
                    <option value="">미지정</option>
                    {GRADES_BY_LEVEL(curStu.level).map((g) => <option key={g} value={g}>{g}학년</option>)}
                  </select>
                </label>
              )}
              {curStu?.level && !curStu?.grade && (
                <span style={{ color: '#b45309' }}>← 학년을 고르면 그 학년군 성취기준만 추천해요</span>
              )}
            </div>
            {stdRecs.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 6, marginTop: 8 }}>
                {stdRecs.map((r) => {
                  const isOn = sel?.code === r.code || selExtra.some((x) => x.code === r.code);
                  return (
                    <div key={r.code} onClick={() => pickStandard(r)}
                      style={{ border: '1px solid ' + (isOn ? '#3b6ef5' : '#cdd9f0'), background: isOn ? '#eaf0ff' : '#fff', borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>
                      <div style={{ fontSize: 11, color: '#3b6ef5', fontWeight: 700 }}>{isOn ? '✓ ' : ''}[{r.code}] {r.subject}{r.area ? ' · ' + r.area : ''} · {GRADE[r.gradeCode]}</div>
                      <div style={{ fontSize: 12.5, marginTop: 2 }}>{r.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: '.76rem', color: '#6b7280', marginTop: 6 }}>여러 개를 눌러 담을 수 있어요(다시 누르면 빠짐). 추천이 맞지 않으면 아래 필터로 직접 찾아 선택해도 됩니다. 성취기준을 선택해도 위에 쓴 학기목표는 유지됩니다.</div>
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">교육과정</label>
            <select className="form-input" value={fCurr} onChange={(e) => { setFCurr(e.target.value); setFSubject(''); setFBigArea(''); setFArea(''); }}>
              <option value="기본">특수교육 기본교육과정 ({currCounts.기본}개)</option>
              <option value="공통">초·중등 공통교육과정 ({currCounts.공통}개)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">교과</label>
            <select className="form-input" value={fSubject} onChange={(e) => { setFSubject(e.target.value); setFGrade(''); setFBigArea(''); setFArea(''); }}>
              <option value="">전체 교과</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">학년군</label>
            <select className="form-input" value={fGrade} onChange={(e) => { setFGrade(e.target.value); setFArea(''); }}>
              <option value="">전체 학년군</option>
              {grades.map((g) => <option key={g} value={g}>{GRADE[g]}</option>)}
            </select>
          </div>
          {isDaily && (
            <div className="form-group">
              <label className="form-label">대영역</label>
              <select className="form-input" value={fBigArea} onChange={(e) => { setFBigArea(e.target.value); setFArea(''); }}>
                <option value="">전체 대영역</option>
                {bigAreas.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{isDaily ? '중영역(하위 영역)' : '영역'}</label>
            <select className="form-input" value={fArea} onChange={(e) => setFArea(e.target.value)}>
              <option value="">{isDaily ? '전체 중영역' : '전체 영역'}</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="form-label" style={{ marginTop: 4 }}>후보 {candidates.length}개{candidates.length > 200 ? ' (상위 200개 표시)' : ''}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8, maxHeight: 280, overflow: 'auto' }}>
          {candidates.slice(0, 200).map((r) => {
            const isOn = sel?.code === r.code || selExtra.some((x) => x.code === r.code);
            return (
              <div key={r.code} onClick={() => pickStandard(r)}
                style={{ border: '1px solid ' + (isOn ? '#3b6ef5' : '#e3e6eb'), background: isOn ? '#eaf0ff' : '#fff', borderRadius: 9, padding: '8px 11px', cursor: 'pointer' }}>
                <div style={{ fontSize: 11, color: '#3b6ef5', fontWeight: 700 }}>
                  {isOn ? '✓ ' : ''}[{r.code}] {GRADE[r.gradeCode]}{r.subject === DAILY_SUBJECT && DAILY_MID_TO_BIG[r.area] ? ' · ' + DAILY_MID_TO_BIG[r.area] + ' › ' + r.area : (r.area ? ' · ' + r.area : '')}
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{r.text}</div>
              </div>
            );
          })}
          {!candidates.length && <div className="empty-state">조건에 맞는 성취기준이 없어요.</div>}
        </div>
      </div>
      )}

      {/* 경로A: 성취기준 다음에 학기목표 카드 */}
      {flowMode === 'std' && sel && goalCard}

      {/* 평가초점 개발 — 확정한 학기목표를 쪼개어 개발 (0719 피드백: 성취기준을 바로 나누지 않음) */}
      {sel && !!String(goal).trim() && (
        <div className="card" id="iep-foci">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 0 }}>🔍 {stepNo.foci} 평가초점 개발 (학기목표 쪼개기)</div>
              <div className="card-subtitle">학기목표: {goal} <span style={{ color: '#9ca3af' }}>· 성취기준 [{sel.code}]{selExtra.length ? ` 외 ${selExtra.length}개` : ''}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* 0720: AI 버튼 3개(쪼개기/성취기준 분석/동사 펼치기) → 1개로 통합(혼동 방지). */}
              {aiOn && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.8rem', color: 'var(--sub)' }} title="만들 평가초점 개수 (2~10)">
                  <input type="number" className="form-input" style={{ width: 58, padding: '4px 6px' }} min={2} max={10}
                    value={fociCount} onChange={(e) => setFociCount(e.target.value)} aria-label="평가초점 개수" />
                  개
                </span>
              )}
              {aiOn && <button className="btn btn-ok btn-sm" onClick={aiFociFromGoal} disabled={fociGoalBusy} title="학기목표를 하위 수행으로 쪼개 선택한 개수만큼 평가초점을 만듭니다. 품질 모델을 사용해 조금 느릴 수 있어요.">{fociGoalBusy ? '⏳ 정밀 생성 중… (품질 모델)' : '✨ 평가초점 생성 (AI)'}</button>}
              {/* ✨ 성취기준 분석(보조) — 0720 버튼 통합으로 비표시. 복원 시 주석 해제
              <button className="btn btn-ghost btn-sm" onClick={aiDecompose} disabled={aiDecBusy} title="성취기준을 동사·행위지향·서술자로 분석하는 보조 도구">{aiDecBusy ? 'AI 분석 중…' : '✨ 성취기준 분석 (보조)'}</button> */}
              {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
              <button className="btn btn-ghost btn-sm" onClick={() => openExt('analyze')} title="프롬프트를 복사해 클로드·ChatGPT 등에서 실행 후 응답을 붙여넣기">🌐 외부AI</button> */}
            </div>
          </div>
          <div className="card-subtitle" style={{ marginTop: 2 }}>
            평가초점은 <strong>확정한 학기목표를</strong> 대상(무엇을)·장소(어디서)·상황(언제·누구와) 등으로 쪼개어 개발합니다. <strong>지원 수준으로 나누는 것이 아닙니다.</strong> AI 없이 만들 때는 아래 "🔧 성취기준 분석 도구"를 쓰세요.
          </div>
          <details style={{ margin: '6px 0 12px', background: 'var(--pri-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.86rem', color: 'var(--pri-d)' }}>❓ 평가초점이 무엇인가요? (예시 보기)</summary>
            <div style={{ marginTop: 8, fontSize: '.84rem', color: 'var(--sub)', lineHeight: 1.7 }}>
              평가초점은 한 성취기준 안에서 학생이 <strong>“무엇을(서술자) 어떻게(동사)”</strong> 수행하는지를 여러 갈래로 펼쳐 둔, 질적 평가의 기준점이에요.
              ‘도움받아 / 독립’ 같은 지원 수준으로 나누는 것이 아닙니다.
              <div style={{ marginTop: 8, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>예) 성취기준: “자신을 소개한다”</div>
                <div style={{ marginTop: 4 }}>→ 평가초점 목록</div>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  <li>나의 신상(이름·나이)을 말한다</li>
                  <li>나의 선호(좋아하는 것)를 표현한다</li>
                  <li>나의 몸·기분 상태를 나타낸다</li>
                </ul>
              </div>
              팁: 아래 <strong>서술자</strong> 칸에 대상(예: 나의 신상, 나의 선호…)을 쉼표로 나열하면 초점이 자동으로 여러 개 만들어져요.
            </div>
          </details>
          {/* 0720: 접힌 <details>로 뒀더니 도구가 안 보인다는 요청 → 항상 펼쳐진 블록으로 변경. */}
          <div style={{ margin: '6px 0 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
            <div style={{ fontWeight: 700, fontSize: '.84rem', color: 'var(--sub)' }}>🔧 성취기준 분석 도구 (AI 없이 평가초점을 만들 때 사용)</div>
            <div style={{ marginTop: 8 }}>
              <div className="form-row">
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <label className="form-label" style={{ margin: 0 }}>측정 가능한 동사 (과정·기능) — 쉼표로 같은 의미의 여러 동사 입력 가능</label>
                    {/* 0720: 사용자 요청으로 동사 펼치기 AI 버튼 복원(고급 영역 안이라 기본 화면은 여전히 버튼 1개) */}
                    {aiOn && <button className="btn btn-ghost btn-sm" onClick={aiExpandVerbs} disabled={verbBusy} title="대표 동사를 같은 의미의 여러 동사로 펼칩니다">{verbBusy ? '펼치는 중…' : '✨ 같은 의미 동사 펼치기'}</button>}
                    {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
                    <button className="btn btn-ghost btn-sm" onClick={() => openExt('verbs')} title="외부 AI로 동사 펼치기">🌐 외부AI</button> */}
                  </div>
                  <input className="form-input" style={{ marginTop: 6 }} value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="예: 분류하기" />
                  {verbAlts.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>같은 의미 동사:</span>
                        {verbAlts.map((v, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, background: 'var(--surface2)', color: 'var(--sub)', borderRadius: 6, padding: '1px 4px 1px 8px' }}>
                            {v}
                            <button type="button" onClick={() => setVerbAlts((prev) => prev.filter((_, idx) => idx !== i))}
                              title={`${v} 빼기`} aria-label={`${v} 빼기`}
                              style={{ border: 'none', background: 'transparent', color: 'var(--err)', cursor: 'pointer', fontWeight: 700, lineHeight: 1, padding: '0 3px', fontSize: 13 }}>×</button>
                          </span>
                        ))}
                        <button className="btn btn-ghost btn-sm" style={{ padding: '0 8px' }} onClick={() => setVerbAlts([])} title="같은 의미 동사 전부 비우기">전체 비우기</button>
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3 }}>
                        이 동사들은 "✨ 평가초점 생성 (AI)"에서 표현을 다양하게 만드는 후보로 쓰여요. 목표와 안 맞는 동사(예: 빌리기·갚아주기)는 ×로 빼세요 — 남긴 것만 반영됩니다.
                      </div>
                    </div>
                  )}
                </div>
                <div className="form-group"><label className="form-label">행위의 지향 (가치·태도)</label><input className="form-input" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="예: 다양한 방법으로 (없으면 비움)" /></div>
              </div>
              <div className="form-group"><label className="form-label">서술자 (지식·이해·대상) — 쉼표·줄바꿈으로 여러 대상 나열 시 평가초점이 여러 개 생성됩니다</label><textarea className="form-textarea" value={descriptor} onChange={(e) => setDescriptor(e.target.value)} placeholder="예: 나의 신상, 나의 몸, 나의 선호, 나의 흥미" /></div>
              <button className="btn btn-ghost btn-sm" onClick={genFociNow} title="AI 없이, 위 동사·서술자 분석으로 평가초점을 만듭니다">↻ 분석·해석으로 생성 (AI 없음)</button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <label className="form-label" style={{ margin: 0 }}>평가초점 목록 — 사전에 수립해 질적 평가의 기준점으로 사용</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={addFocus}>+ 평가초점 추가</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {/* 0720: 품질 모델 생성 중 스피너 — 어디에서 작업 중인지 보이게 */}
            {fociGoalBusy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', color: '#6b7280', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                <span style={spinner} /> 품질 모델이 평가초점 {Math.max(2, Math.min(10, parseInt(fociCount, 10) || 5))}개를 만드는 중… (수십 초 걸릴 수 있어요)
              </div>
            )}
            {!fociGoalBusy && evalFoci.length === 0 && <div className="empty-state" style={{ padding: 12 }}>아직 평가초점이 없습니다. 위 "✨ 평가초점 생성 (AI)" 또는 "+ 평가초점 추가"를 눌러 만드세요.</div>}
            {evalFoci.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color: '#6b7280', textAlign: 'center' }}>{i + 1}</div>
                <input className="form-input" value={f} onChange={(e) => editFocus(i, e.target.value)} placeholder="예: 다양한 방법으로 나의 신상을 탐색한다." />
                <button className="btn btn-ghost btn-sm" onClick={() => removeFocus(i)} title="삭제">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 월별 계획 생성 — 확정된 학기목표 기반 (0719: 학기목표 선 작성 → 월별 후 작성) */}
      {sel && !!String(goal).trim() && (
        <div className="card" id="iep-editor">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>📅 {stepNo.editor} 월별 계획 생성 (학기목표 기반 점증)
              {editingId && <span className="badge badge-purple" style={{ marginLeft: 8 }}>수정 중</span>}
            </div>
            {editingId && <button className="btn btn-ghost btn-sm" onClick={newGoal}>+ 새 목표 작성</button>}
          </div>
          {startpoint && (startpoint.supportNeeds || startpoint.functions || startpoint.perfLevel) && (
            <div style={{ background: '#eef4ff', border: '1px solid #b9cdf0', borderRadius: 8, padding: '10px 12px', margin: '4px 0 12px', fontSize: 12.5, color: '#274690', lineHeight: 1.6 }}>
              <strong>🧭 모듈1 출발점 연동</strong> — 이 산출물이 목표의 출발점입니다(AI 생성에 자동 반영).
              {startpoint.supportNeeds && <div>· 생활지원 요구: {String(startpoint.supportNeeds).replace(/\n/g, ' / ')}</div>}
              {startpoint.functions && <div>· 기능 목록화: {String(startpoint.functions).replace(/\n/g, ' / ')}</div>}
              {startpoint.perfLevel && <div>· 수행 가능 수준: {String(startpoint.perfLevel).replace(/\n/g, ' / ')}</div>}
            </div>
          )}
          {/* 학기목표 입력은 위 "학기목표 설정" 카드로 이동(0719: 학기목표 선행 흐름) */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '.84rem' }}>
            <strong>학기목표</strong> — {goal} <span style={{ color: 'var(--muted)' }}>(수정은 위 {stepNo.goal} 학기목표 설정 카드에서)</span>
          </div>
          <div className="form-group"><label className="form-label">현행수준 (학생 비식별 요약에서 연동 · 수정 가능)</label><textarea className="form-textarea" value={plop} onChange={(e) => setPlop(e.target.value)} /></div>
          {/* P15: 학기 교육내용·교육방법 입력은 ② 학기목표 설정 카드로 이동(현장 피드백 — 학기목표와 함께 작성).
              여기서는 확정된 방향을 참고로만 보여준다. */}
          {(String(semContent || '').trim() || String(semMethods || '').trim()) && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '.82rem', color: 'var(--sub)' }}>
              {String(semContent || '').trim() && <div><strong>학기 교육내용</strong> — {String(semContent).replace(/\n/g, ' / ').replace(/-\s*/g, '')} </div>}
              {String(semMethods || '').trim() && <div style={{ marginTop: 2 }}><strong>학기 교육방법</strong> — {String(semMethods).replace(/\n/g, ' / ').replace(/-\s*/g, '')} </div>}
              <span style={{ color: 'var(--muted)' }}>(수정은 위 {stepNo.goal} 학기목표 설정 카드에서 · 교육방법의 "→" 단계 흐름은 아래 월별 교육방법에 "[학기 계획 n/m단계]"로 구간별 배분됩니다)</span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group"><label className="form-label">학년도</label>
              <input type="number" className="form-input" value={schoolYear} onChange={(e) => setSchoolYear(Number(e.target.value))} /></div>
            <div className="form-group"><label className="form-label">학기</label>
              <select className="form-input" value={sem} onChange={(e) => { setSem(e.target.value); setMonths(monthsOf(e.target.value)); }}><option value="1">1학기 (3~7월)</option><option value="2">2학기 (9~12월)</option></select></div>
            <div className="form-group"><label className="form-label">평가 방식</label>
              <select className="form-input" value={critType} onChange={(e) => {
                const v = e.target.value;
                if (v !== critType) {
                  if (v === 'task') { const cnt = (taskSteps || []).filter((t) => t.trim()).length; setCStart(0); setCEnd(cnt || 5); }
                  else if (v === 'freq') { setCStart(3); setCEnd(8); } // 10회 기회 중 성공 횟수(0~10)
                  else if (v === 'rate') { setCStart(30); setCEnd(80); } // 독립 수행 비율(%)
                }
                setCritType(v);
              }}>
                <option value="rate">양적 · 독립 수행 비율(%)</option>
                <option value="freq">양적 · 기회 중 성공 횟수(10회 중)</option>
                <option value="qual">질적 · 평가초점 기반 서술(내러티브)</option>
                <option value="task">과제 분석 · 단계별 점증(과제 분해)</option>
              </select></div>
            <div className="form-group"><label className="form-label">지원체계 (모듈4)</label>
              <select className="form-input" value={supportTier} onChange={(e) => setSupportTier(e.target.value)}>
                <option value="">미지정</option>
                <option value="Tier 1 (보편적 지원)">Tier 1 · 보편적 지원</option>
                <option value="Tier 2 (소그룹 지원)">Tier 2 · 소그룹 지원</option>
                <option value="Tier 3 (개별 집중 지원)">Tier 3 · 개별 집중 지원</option>
              </select></div>
            {critType !== 'qual' ? (
              <>
                <div className="form-group"><label className="form-label">{critType === 'task' ? '시작 독립 단계' : critType === 'freq' ? '시작 수준 (10회 중 성공 횟수)' : '시작 수준 (%)'}</label><input type="number" className="form-input" min={0} max={critType === 'freq' ? 10 : undefined} value={cStart} onChange={(e) => setCStart(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{critType === 'task' ? '목표 독립 단계' : critType === 'freq' ? '학기말 목표 (10회 중 성공 횟수)' : '학기말 목표 (%)'}</label><input type="number" className="form-input" min={0} max={critType === 'freq' ? 10 : undefined} value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></div>
              </>
            ) : (
              <div className="form-group" style={{ flex: '2 1 280px' }}><label className="form-label">질적 평가 안내</label>
                <div className="form-input" style={{ background: 'var(--surface2)', color: 'var(--sub)', fontSize: '.82rem', display: 'flex', alignItems: 'center' }}>수치 기준 없이 ②의 평가초점을 중심으로 학습 과정·결과를 서술 평가합니다.</div>
              </div>
            )}
          </div>
          {/* IEP·Tier 관계 안내 — 'Tier 3 완료'가 IEP의 출발점이 아님을 명확히 한다 */}
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>
            ℹ️ IEP는 'Tier 3 완료'의 결과가 아니라 특수교육대상자 선정(진단·평가 → 특수교육운영위원회 → 배치 → 개별화교육지원팀)에서 시작됩니다. 여기서 'Tier'는 IEP 목표 달성을 위한 지원의 강도(보편/표적/집중)를 뜻하며, 행동지원(PBS·BIP)은 IEP에 포함되는 구성요소입니다.
          </div>
          {/* 학기에 포함할 월 선택 — 표준 학사일정이 기본, 학교 사정에 맞게 켜고 끈다 */}
          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">월별 계획에 넣을 월 ({orderMonths(months, sem).length}개월)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {MONTH_POOL(sem).map((m) => {
                const on = months.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={'btn btn-sm ' + (on ? 'btn-pri' : 'btn-ghost')}
                    aria-pressed={on}
                    onClick={() => setMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : orderMonths([...prev, m], sem)))}
                  >
                    {on ? '✓ ' : ''}{m}월
                  </button>
                );
              })}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonths(monthsOf(sem))} title="표준 학사일정으로 되돌리기">↺ 기본</button>
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>실제 수업하는 월만 켜 두면 그 개월 수만큼 월별 목표가 만들어집니다(예: 4개월만 운영하면 4칸).</div>
            {/* 월 묶기 — 현장 관행(3-4월/5월/6-7월)대로 여러 월을 한 행으로 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>월 묶기 (선택)</label>
              <input className="form-input" style={{ maxWidth: 200 }} value={monthGroups} onChange={(e) => setMonthGroups(e.target.value)}
                placeholder={String(sem) === '2' ? '예: 9-10/11/12-1' : '예: 3-4/5/6-7'} />
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setMonthGroups(String(sem) === '2' ? '9-10/11/12-1' : '3-4/5/6-7')}>{String(sem) === '2' ? '9-10/11/12-1' : '3-4/5/6-7'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonthGroups('')} title="묶지 않고 매월 한 행">매월</button>
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>묶은 구간마다 한 행이 만들어집니다(예: 3-4/5/6-7 → 3행). 비워 두면 매월 한 행.</div>
          </div>
          {critType === 'task' && (
            <div style={{ marginTop: 10, padding: 12, border: '1px solid #c7b9f0', borderRadius: 8, background: '#f7f4ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#5b3fb0' }}>🧩 과제 분석 — 단계 목록 (순차 분해)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={aiStepsNow} disabled={taskBusy}>{taskBusy ? '분석 중…' : (aiOn ? '↻ 단계 자동 분석(AI)' : '↻ 기본 단계 골격')}</button>
                  {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
                  <button className="btn btn-ghost btn-sm" onClick={() => openExt('steps')} title="외부 AI로 단계 분해">🌐 외부AI</button> */}
                  <button className="btn btn-ghost btn-sm" onClick={addStep}>+ 단계 추가</button>
                  <button className="btn btn-ghost btn-sm" onClick={downloadTaskSheetNow} title="단계×회기 기록지 Word">📋 기록지</button>
                </div>
              </div>
              <div style={{ fontSize: '.8rem', color: '#5b3fb0', opacity: 0.85, marginTop: 4 }}>
                복잡한 행동·기술을 학생이 순서대로 수행할 단계로 나눕니다(예: 손 씻기 → 자리 앉기 → …). 전체 {taskSteps.filter((t) => t.trim()).length || '–'}단계 · 독립 수행 단계가 매월 늘고, 단계별 촉진은 점차 약화됩니다.
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="form-group"><label className="form-label">교수 순서(연쇄)</label>
                  <select className="form-input" value={chainType} onChange={(e) => setChainType(e.target.value)}>
                    <option value="forward">전진형 — 1단계부터 독립 확대</option>
                    <option value="backward">후진형 — 마지막 단계부터 역순</option>
                    <option value="total">전체과제 제시형 — 매회 전체 수행</option>
                  </select></div>
                <div className="form-group"><label className="form-label">촉진 체계</label>
                  <select className="form-input" value={promptSystem} onChange={(e) => setPromptSystem(e.target.value)}>
                    <option value="mtl">최대-최소촉진 (전신→부분→시범→독립)</option>
                    <option value="slp">최소촉진체계 (독립 시도→단계적 촉진)</option>
                    <option value="td">시간지연 (촉진 전 대기 점증)</option>
                    <option value="sim">동시촉진 (촉진 동시 후 점검)</option>
                  </select></div>
              </div>
              {(() => {
                const f = taskSteps.filter((t) => t.trim()).length;
                if (!f) return null;
                if (f < 4) return <div style={{ fontSize: '.78rem', color: '#9a3412', marginTop: 6 }}>⚠ 단계가 적어요(권장 4~8). 학습자 수준이 낮거나 과제가 어려우면 "⊟ 쪼개기"로 더 잘게 나누세요.</div>;
                if (f > 8) return <div style={{ fontSize: '.78rem', color: '#9a3412', marginTop: 6 }}>⚠ 단계가 많아요({f}단계, 권장 4~8). 학습자 수준이 높으면 일부 단계를 합쳐 보세요.</div>;
                return <div style={{ fontSize: '.78rem', color: '#15803d', marginTop: 6 }}>✓ 알맞은 단계 수({f}단계, 권장 4~8). 가르치다 막히는 단계는 "⊟ 쪼개기"로 더 잘게 나누세요.</div>;
              })()}
              {(() => {
                const f = taskSteps.filter((t) => t.trim()).length;
                const cs = Number(cStart) || 0, ce = Number(cEnd) || 0;
                const msgs = [];
                if (f && ce > f) msgs.push(`목표 독립 단계(${ce})가 전체 단계(${f})보다 큽니다.`);
                if (cs > ce) msgs.push(`시작(${cs})이 목표(${ce})보다 큽니다.`);
                if (!msgs.length) return null;
                return (
                  <div style={{ fontSize: '.78rem', color: '#b91c1c', marginTop: 4 }}>⚠ {msgs.join(' ')}{' '}
                    <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px' }} onClick={() => { const t = f || ce; setCEnd(t); setCStart(Math.min(cs, t)); }}>전체 단계에 맞춤</button>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {taskSteps.length === 0 && <div className="empty-state" style={{ padding: 12 }}>아직 단계가 없습니다. "단계 자동 분석" 또는 "+ 단계 추가"로 만드세요.</div>}
                {taskSteps.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: '#6b7280', textAlign: 'center' }}>{i + 1}</div>
                    <input className="form-input" value={t} onChange={(e) => editStep(i, e.target.value)} placeholder="예: 수저를 바르게 잡는다." />
                    <button className="btn btn-ghost btn-sm" onClick={() => splitStep(i)} title="이 단계를 더 잘게 나누기" aria-label="단계 쪼개기">⊟ 쪼개기</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeStep(i)} title="삭제" aria-label="단계 삭제">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-pri" onClick={generate}>규칙 초안 (빠름, AI 없음)</button>
            {aiOn && <button className="btn btn-ok" onClick={aiGenerateFromData} disabled={aiGenBusy}>{aiGenBusy ? '⏳ AI 생성 중… (약 3~5분)' : '✨ AI 생성 (학생 데이터 반영)'}</button>}
            {aiGenBusy && (
              <span style={{ fontSize: '.8rem', color: '#0d9488', alignSelf: 'center' }}>
                품질 모델이 월별 계획 전체를 쓰는 중이에요 — 페이지를 이동하면 결과가 사라질 수 있어요.
              </span>
            )}
            {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
            <button className={'btn ' + (aiOn ? 'btn-ghost' : 'btn-ok')} onClick={openManualPrompt} title="프롬프트를 복사해 클로드·ChatGPT 등에서 실행 후 응답(JSON)을 붙여넣기">🌐 외부AI 연동 (복사→붙여넣기)</button> */}
          </div>
          <div className="card-subtitle" style={{ marginTop: 8 }}>
            <strong>규칙 초안</strong>은 AI 없이 고정된 틀로 즉시 만드는 기본형이고, <strong>✨ AI 생성</strong>은 학생 자료·평가초점을 반영해 문장을 새로 쓰는 방식이에요(AI 특성상 누를 때마다 표현이 조금씩 달라집니다).
            생성할 때마다 초안이 따로 보관되어(규칙 초안 · AI 1차 · AI 2차…) 아래 표 위의 <strong>초안 전환</strong> 버튼으로 오가며 비교할 수 있고, 마음에 드는 초안을 보이게 한 상태에서 저장하면 됩니다.
          </div>
          <div className="card-subtitle" style={{ marginTop: 4 }}>교육방법 기본값은 학생 장애유형({curStu.disability || '미지정'})에 맞춰 채워집니다: {methodsForType(curStu.disability).join(', ')}</div>

          {/* 교과 평어(세부능력·특기사항) 생성 */}
          <div style={{ marginTop: 14, padding: 12, border: '1px solid #fdba74', borderRadius: 8, background: '#fff7ed' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 700, color: '#9a3412' }}>✍ 교과 평어 생성 (세부능력·특기사항)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* P10: 평어는 공개 문서(생기부) — 행동·정서 지원 언급은 기본 제외 */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.78rem', color: '#9a3412', cursor: 'pointer' }} title="켜면 위기 서술 없이 자기 조절·참여 태도의 긍정적 성장으로만 최소 반영합니다.">
                  <input type="checkbox" checked={pyeongBehavior} onChange={(e) => setPyeongBehavior(e.target.checked)} />
                  행동·정서 성장 포함
                </label>
                <select className="form-input" style={{ width: 'auto', padding: '4px 8px' }} value={pyeongLevel} onChange={(e) => setPyeongLevel(e.target.value)}>
                  {PYEONG_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <button className="btn btn-sm" style={{ background: '#ea580c', color: '#fff' }} onClick={aiPyeong} disabled={pyeongBusy}>
                  {pyeongBusy ? '⏳ 생성 중…' : '평어 생성'}
                </button>
                {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
                <button className="btn btn-ghost btn-sm" onClick={() => openExt('pyeong')} title="외부 AI로 평어 생성">🌐 외부AI</button> */}
              </div>
            </div>
            <div style={{ fontSize: '.8rem', color: '#9a3412', opacity: 0.8, marginTop: 4 }}>선택한 성취기준 + 학기목표·평가초점·현행수준을 반영해 명사형 평어 문장을 생성합니다. 행동 지원·위기 대응(안정실 등) 내용은 기본으로 제외돼요.</div>
            {pyeongLines.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={copyPyeongAll}>📋 전체 복사</button>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
                  {pyeongLines.map((l, i) => (
                    <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #fde4cc' }}>
                      <input className="form-input" value={l} onChange={(e) => editPyeong(i, e.target.value)} style={{ flex: 1, fontSize: '.86rem', padding: '4px 8px' }} />
                      <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '2px 8px' }} onClick={() => removePyeong(i)} title="삭제" aria-label="평어 삭제">✕</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {monthly.length > 0 && (
            <>
              {drafts.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                  <span className="form-label" style={{ margin: 0 }}>초안 전환:</span>
                  {drafts.map((d, i) => (
                    <button key={i} className={'btn btn-sm ' + (curDraft === i ? 'btn-pri' : 'btn-ghost')}
                      onClick={() => switchDraft(i)}>
                      {curDraft === i ? '✓ ' : ''}{d.label}
                    </button>
                  ))}
                  <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>AI를 다시 생성해도 이전 차수가 지워지지 않아요(최근 4차 보관). 저장은 지금 보이는 초안 기준.</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div className="form-label" style={{ margin: 0 }}>월별 개별화교육계획/평가 (모든 칸 수정 가능 · 헤더 경계를 끌어 열 너비 조절)</div>
                <button className="btn btn-ghost btn-sm" onClick={resetColW}>열 너비 초기화</button>
              </div>
              <div>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' }}>
                  <colgroup>{(() => { const t = colW.reduce((a, b) => a + b, 0); return colW.map((w, i) => <col key={i} style={{ width: (w / t * 100) + '%' }} />); })()}</colgroup>
                  <thead><tr>
                    {['월', '교육목표', '교육내용', '교육방법', '평가계획', '평가(서술형)'].map((h, i) => (
                      <th key={i} style={{ ...thS(), position: 'relative', whiteSpace: 'nowrap' }}>{h}
                        {i < 5 && <span onMouseDown={(e) => startResize(i, e)} title="드래그하여 너비 조절"
                          style={{ position: 'absolute', top: 0, right: -3, width: 8, height: '100%', cursor: 'col-resize', userSelect: 'none' }} />}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {monthly.map((m, i) => (
                      <tr key={i}>
                        <td style={{ ...tdS, fontWeight: 700, textAlign: 'center', background: '#f3f6fc', color: '#3b6ef5' }}>{m.month}월</td>
                        <td style={tdS}><textarea style={cellInput} value={m.goal} onChange={(e) => editMonth(i, 'goal', e.target.value)} /></td>
                        <td style={tdS}><textarea style={cellInput} value={m.content} onChange={(e) => editMonth(i, 'content', e.target.value)} /></td>
                        <td style={tdS}><textarea style={cellInput} value={(m.methods || []).map((x) => '- ' + x).join('\n')} onChange={(e) => editMonth(i, 'methods', e.target.value)} /></td>
                        <td style={tdS}><textarea style={cellInput} value={m.eval_plan || ''} onChange={(e) => editMonth(i, 'eval_plan', e.target.value)} placeholder={'- …는가?'} /></td>
                        <td style={tdS}><textarea style={cellInput} value={m.eval} onChange={(e) => editMonth(i, 'eval', e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}><label className="form-label">학기말 종합 평가 (서술형)</label><textarea className="form-textarea" value={semEval} onChange={(e) => setSemEval(e.target.value)} /></div>
              {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-pri" onClick={save} disabled={busy}>{editingId ? '💾 수정 저장' : '💾 IEP 목표 저장'}</button>
                <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
                <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('iepReport')}
                  title={savedOk ? undefined : '저장을 마친 뒤 이동하는 것을 추천해요'}>
                  📄 IEP 계획서(완성·출력) →
                </button>
              </div>
              <NextStepBanner
                show={savedOk}
                message="✅ IEP 목표 저장 완료"
                hint="저장된 목표는 오른쪽 버튼(IEP 계획서)에서 완성·출력할 수 있어요"
              />
            </>
          )}
        </div>
      )}

      {/* 🌐 외부AI 연동 모달 — 분석/동사/단계/평어 공용 */}
      {extCfg && (
        <ExternalAIModal
          open={!!extKind}
          onClose={() => setExtKind('')}
          title={extCfg.title}
          buildPrompt={extCfg.buildPrompt}
          onApply={(raw) => { try { return extCfg.apply(raw); } catch (e) { toast('적용 실패: ' + e.message); return false; } }}
        />
      )}

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} maxWidth={700}>
        <h3>🌐 외부 AI 연동 — 월별 계획 생성</h3>
        <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, marginTop: 4 }}>
          ① 아래 프롬프트를 복사해 ChatGPT·Claude 등 외부 AI에 붙여넣으세요. ② AI가 준 <b>JSON 응답</b>을 아래 칸에 붙여넣고 "응답 적용"을 누르면 화면에 채워집니다.
        </p>
        <div className="form-group">
          <label className="form-label">① 프롬프트 (복사해서 외부 AI에 붙여넣기)</label>
          <textarea className="form-textarea" rows={8} readOnly value={promptText} onFocus={(e) => e.target.select()} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-ghost" onClick={copyPrompt}>📋 프롬프트 복사</button>
        </div>
        <div className="form-group">
          <label className="form-label">② AI 응답 붙여넣기 (JSON)</label>
          <textarea className="form-textarea" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'AI가 준 응답을 그대로 붙여넣으세요. {"semester_goal":...,"monthly":[...]} 형태의 JSON을 자동으로 찾아 적용합니다.'} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setManualOpen(false)}>닫기</button>
          <button className="btn btn-pri" onClick={applyPasted}>응답 적용</button>
        </div>
      </Modal>
    </>
  );
}

const thS = (w) => ({ background: '#2f5496', color: '#fff', border: '1px solid #d9d9d9', padding: '8px 9px', fontSize: 12, ...(w ? { width: w } : {}) });
const tdS = { border: '1px solid #e3e6eb', padding: 6, verticalAlign: 'top', wordBreak: 'break-word', overflow: 'hidden' };
const cellInput = { width: '100%', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: 12.5, background: 'transparent', lineHeight: 1.55, minHeight: 70, whiteSpace: 'pre-wrap' };
const spinner = { display: 'inline-block', width: 18, height: 18, border: '3px solid rgba(79,107,237,.25)', borderTopColor: '#4f6bed', borderRadius: '50%', animation: 'spin .8s linear infinite' };
