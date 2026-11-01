// 학생 기초 평가 3가지(초기면담·강화제·표적행동 우선순위)의 '작성했나' 판정 — 단일 출처(새 디자인 3단계).
//   AssessmentLauncher(components/student/AssessmentLauncher.jsx)가 카드에 '✓ 작성됨'을 붙이는 규칙과 같다:
//     · 초기면담  interviewProgress(bip.interview).done > 0  — 8섹션 중 하나라도 채움
//     · 강화제    RAISD 선호 순위(_meta.ranking) 또는 선호도 체크리스트 4·5점 항목이 하나라도
//     · 우선순위  새 9기준 평정의 1순위 총점 > 0 (옛 숫자 배열은 '다시 평정'이라 미작성으로 침)
//   새 디자인의 프로필 탭('미완이면 펼침')·오늘 표 할 일('기초 평가 남음')·GET /api/students/assess-status가 같이 쓴다.
//   ⚠ React·DB 없는 순수 함수(node --test, lib/utils/__tests__/assessStatus.test.js). 서버에서도 import한다.
import { normalizePriority, priorityRank } from './priority.js';
import { rcTopPreferred } from './reinforcerChecklist.js';

const s = (v) => String(v == null ? '' : v).trim();
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * 초기면담지 8섹션 중 채운 섹션 수 — components/modals/InitialInterviewModal.jsx interviewProgress와 같은 판정.
 *   (그 함수는 JSX 파일 안이라 서버·node 테스트에서 못 불러 같은 규칙을 여기에 둔다. 규칙을 바꾸면 두 곳 다.)
 */
export function interviewDoneCount(interview) {
  const iv = interview && typeof interview === 'object' ? interview : {};
  const filled = [
    Object.values(iv.traits || {}).some((v) => +v >= 1),
    !!s(iv.referReason),
    !!s(iv.priorityBehavior),
    arr(iv.reasons).length > 0 || !!s(iv.reasonEtc),
    !!(s(iv.abcA) || s(iv.abcB) || s(iv.abcC)),
    Object.keys(iv.concerns || {}).length > 0,
    arr(iv.envMethods).length + arr(iv.teachMethods).length > 0,
    arr(iv.antecedents).length + arr(iv.consequences).length > 0 || !!s(iv.expectation),
  ];
  return filled.filter(Boolean).length;
}

/** RAISD 응답(raisd_assessments.responses)으로 강화제 평가를 했나. */
export function reinforcerDone(raisdResponses) {
  const meta = (raisdResponses && raisdResponses._meta) || {};
  const ranked = arr(meta.ranking).filter(Boolean);
  return ranked.length > 0 || rcTopPreferred(meta.checklist, 3).length > 0;
}

/** 표적행동 우선순위(priority_checklist.responses)를 매겼나. */
export function priorityDone(priorityResponses) {
  const prio = priorityRank(normalizePriority(priorityResponses));
  return prio.length > 0 && prio[0].total > 0;
}

export const ASSESS_ITEMS = [
  { key: 'interview', label: '초기면담' },
  { key: 'reinf', label: '강화제 평가' },
  { key: 'prio', label: '표적행동 우선순위' },
];

/**
 * 원재료 → { interview, reinf, prio, done(개수), missing:[이름…] }.
 * @param {{interview?:object, raisd?:object, priority?:any}} p  interview=bip.interview, raisd=raisd.responses, priority=priority.responses
 */
export function assessStatus({ interview, raisd, priority } = {}) {
  const st = {
    interview: interviewDoneCount(interview) > 0,
    reinf: reinforcerDone(raisd),
    prio: priorityDone(priority),
  };
  const missing = ASSESS_ITEMS.filter((it) => !st[it.key]).map((it) => it.label);
  return { ...st, done: ASSESS_ITEMS.length - missing.length, missing };
}

/** 학생 일괄 자료(GET /api/students/{id}/all 응답 = StudentContext curStuData)로. */
export function assessStatusOfData(data) {
  return assessStatus({
    interview: data && data.bip ? data.bip.interview : null,
    raisd: data && data.raisd ? data.raisd.responses : null,
    priority: data && data.priority ? data.priority.responses : null,
  });
}
