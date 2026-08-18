// '다음 할 일' 제안 — 데이터 상태를 보고 지금 가장 도움이 되는 한 가지를 고른다.
// (mds/23 기능③ '도움 커서(빛)' — 홈 포털의 🔦 배너가 사용)
//
// 규칙:
//   - 한 번에 1개만 제안한다. 이미 다른 배너가 담당하는 상태(학생 0명)는 건드리지 않는다.
//   - 선생님이 안 쓰기로 한 Tier(used_tiers)의 일은 제안하지 않는다.
//   - 추가 API 호출 없이, 홈 포털이 이미 들고 있는 데이터만 쓴다.
// 카피: 쉬운 말 먼저, 용어는 괄호. CTA는 동사로 구체적으로.

import { tierEnabled } from './tiers';

/**
 * @param {object} p
 * @param {object|null} p.curClass        현재 선택된 학급
 * @param {number}      p.studentCount    학급 학생 수
 * @param {number}      p.tier2GroupCount 소그룹 수
 * @param {{abc:number, mon:number}} p.totals  학급 전체 ABC·행동 데이터 누적
 * @param {number[]|null} p.usedTiers     parseUsedTiers 결과 (null=미설정=전체)
 * @param {boolean}     p.aiOn            AI 연결 여부
 * @returns {{text:string, sub:string, cta:string, page?:string, action?:'manageClasses'|'aiSettings'}|null}
 */
export function computeNextStep({ curClass, studentCount, tier2GroupCount, totals, usedTiers, aiOn }) {
  if (!curClass) {
    return {
      text: '우리 반부터 만들어주세요',
      sub: '반이 있어야 학생을 등록하고 기록을 시작할 수 있어요.',
      cta: '학급 만들기',
      action: 'manageClasses',
    };
  }
  if (!studentCount) return null; // 홈의 '🚀 시작하기' 배너가 담당

  const abc = totals?.abc || 0;
  const mon = totals?.mon || 0;

  if (tierEnabled(usedTiers, 3) && abc === 0) {
    return {
      text: '행동이 신경 쓰이는 학생이 있다면, 관찰 기록부터 시작해보세요',
      sub: '언제·무슨 일이 있었는지 앞뒤로 짧게 적으면 돼요 (전문용어로는 ABC 기록).',
      cta: '한 학생 집중 열기',
      page: 'dash3',
    };
  }
  if (tierEnabled(usedTiers, 2) && !tier2GroupCount) {
    return {
      text: '조금 더 챙길 학생 몇 명을 소그룹으로 묶어보세요',
      sub: '아침·하교에 1~2분씩 점검하는 루틴(체크인·체크아웃)이 시작돼요.',
      cta: '소그룹 만들기',
      page: 'dash2',
    };
  }
  if (tierEnabled(usedTiers, 3) && abc > 0 && mon === 0) {
    return {
      text: '관찰이 쌓였어요 — 이제 행동을 매일 숫자로 남겨보세요',
      sub: '몇 번·몇 분·얼마나 세게. 나중에 "좋아졌는지"를 그래프로 확인할 근거가 돼요.',
      cta: '행동 데이터 시작',
      page: 'dash3',
    };
  }
  if (!aiOn) {
    return {
      text: 'AI를 연결하면 계획서·문장 초안을 대신 써줘요',
      sub: '학생 정보는 익명 ID로만 전달돼요. 초안은 언제나 선생님이 고칠 수 있어요.',
      cta: 'AI 연결하기',
      action: 'aiSettings',
    };
  }
  return null;
}
