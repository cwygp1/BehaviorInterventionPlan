// '다음 할 일' 제안 — 데이터 상태를 보고 지금 가장 도움이 되는 한 가지를 고른다.
// (mds/23 기능③ '도움 커서(빛)' — 홈 포털의 🔦 배너가 사용)
//
// 규칙:
//   - 한 번에 1개만 제안한다. 이미 다른 배너가 담당하는 상태(학생 0명)는 건드리지 않는다.
//   - 추가 API 호출 없이, 홈 포털이 이미 들고 있는 데이터만 쓴다.
// 카피: 쉬운 말 먼저, 용어는 괄호. CTA는 동사로 구체적으로.

/**
 * @param {object} p
 * @param {object|null} p.curClass        현재 선택된 학급
 * @param {number}      p.studentCount    학급 학생 수
 * @param {number}      p.tier2GroupCount 소그룹 수
 * @param {{abc:number, mon:number}} p.totals  학급 전체 ABC·행동 데이터 누적
 * @param {boolean}     p.aiOn            AI 연결 여부
 * @returns {{text:string, sub:string, cta:string, page?:string, action?:'manageClasses'|'aiSettings', studentPage?:string, studentCta?:string}|null}
 *   studentPage/studentCta: 학생이 선택돼 있을 때 현황판 대신 바로 갈 화면과 그 버튼 문구(0914 P0)
 */
export function computeNextStep({ curClass, studentCount, tier2GroupCount, totals, aiOn }) {
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

  if (abc === 0) {
    return {
      text: '행동이 신경 쓰이는 학생이 있다면, 관찰 기록부터 시작해보세요',
      sub: '언제·무슨 일이 있었는지 앞뒤로 짧게 적으면 돼요 (전문용어로는 ABC 기록).',
      cta: '한 학생 집중 열기',
      page: 'dash3',
      studentPage: 'observe',
      studentCta: '관찰 기록 열기',
    };
  }
  if (!tier2GroupCount) {
    return {
      text: '조금 더 챙길 학생 몇 명에게 매일 점검표(CICO)를 시작해보세요',
      sub: '아침·하교에 1~2분씩 점검하는 루틴(체크인·체크아웃)이 시작돼요. 점검 그룹을 만들어 학생을 넣으면 돼요 — 꼭 소그룹 형태가 아니어도 괜찮아요.',
      cta: '표적 학생 지원 열기',
      page: 'dash2',
    };
  }
  if (abc > 0 && mon === 0) {
    return {
      text: '관찰이 쌓였어요 — 이제 행동을 매일 숫자로 남겨보세요',
      sub: '몇 번·몇 분·얼마나 세게. 나중에 "좋아졌는지"를 그래프로 확인할 근거가 돼요.',
      cta: '행동 데이터 시작',
      page: 'dash3',
      studentPage: 'monitor',
      studentCta: '행동 데이터 기록 열기',
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

// ── 도움말 모드 '다음 할 일' (0923) ────────────────────────────────────────
// 어느 화면에서든 ❓ → '다음 할 일'을 누르면 지금 가장 도움이 되는 한 가지를 짚어준다.
// 규칙은 새로 만들지 않는다: 영역 화면이면 그 영역 현황판의 '검토 필요' 규칙(lib/dashReviews.js),
// 아니면 홈 🔦 배너 규칙(computeNextStep), 그래도 없으면 전 영역 검토 항목에서 고른다.
// dashReviews는 JSX 모듈(DashBits)을 import해서 테스트에서 못 부르므로 reviewers로 주입받는다.

const SECTION_ORDER = ['t3', 'iep', 't2', 't1'];

/** 검토 항목 중 하나 — 칭찬(ok) 제외, 선택된 학생 것 우선, 빨강(err) 우선. */
export function pickReview(items, curStuId) {
  const act = (items || []).filter((it) => it && it.level !== 'ok');
  if (!act.length) return null;
  const mine = curStuId ? act.filter((it) => it.sid === curStuId) : [];
  const pool = mine.length ? mine : act;
  return pool.find((it) => it.level === 'err') || pool[0];
}

/**
 * 짚어줄 자리(앵커 키) — 홈에서는 영역 카드, 그 밖에서는 사이드바 메뉴.
 * @param {string} page 가야 할 화면
 * @param {string} activePage 지금 화면
 * @param {Record<string,string>} pageSection 화면 → 영역 키 (lib/tiers.js PAGE_SECTION)
 */
export function anchorForPage(page, activePage, pageSection) {
  if (!page) return null;
  if (activePage === 'home') {
    const sec = pageSection[page];
    return sec ? 'pcard-' + sec : 'nav-' + page;
  }
  return 'nav-' + page;
}

/**
 * @param {object} p
 * @param {string} p.activePage
 * @param {Record<string,string>} p.pageSection  PAGE_SECTION
 * @param {object|null} p.curClass
 * @param {Array} p.students
 * @param {number|null} p.curStuId
 * @param {number} p.tier2GroupCount
 * @param {{abc:number, mon:number}} p.totals
 * @param {boolean} p.aiOn
 * @param {object|null} p.dash  /api/dashboard 응답(없으면 영역 규칙은 건너뜀)
 * @param {Record<string, (dash:object)=>Array>} p.reviewers  { t1, t2, t3, iep } — lib/dashReviews.js
 * @returns {{text:string, sub?:string, cta?:string, page?:string, sid?:number, action?:string, anchor?:string|null}}
 */
export function pickHelpNextStep({ activePage, pageSection, curClass, students, curStuId, tier2GroupCount, totals, aiOn, dash, reviewers }) {
  const studentCount = (students || []).length;
  if (!curClass) {
    return { ...computeNextStep({ curClass, studentCount, tier2GroupCount, totals, aiOn }), anchor: 'stu-bar' };
  }
  if (!studentCount) {
    return {
      text: '학생부터 등록해 주세요',
      sub: '실명 대신 "A학생" 같은 익명 ID로 등록해요. 학생이 있어야 기록을 시작할 수 있어요.',
      cta: '학생 등록',
      action: 'addStudent',
      anchor: 'add-student',
    };
  }
  const fromReview = (it) => ({
    text: it.text,
    sub: it.sub,
    cta: it.cta,
    page: it.page,
    sid: it.sid,
    anchor: it.page === activePage ? null : anchorForPage(it.page, activePage, pageSection),
  });

  // 1) 지금 영역의 검토 항목
  const section = pageSection[activePage] || null;
  if (section && dash && reviewers?.[section]) {
    const it = pickReview(reviewers[section](dash), curStuId);
    if (it) return fromReview(it);
  }

  // 2) 홈 🔦 배너 규칙
  const g = computeNextStep({ curClass, studentCount, tier2GroupCount, totals, aiOn });
  if (g) {
    const direct = !!(curStuId && g.studentPage);
    const page = direct ? g.studentPage : g.page;
    return {
      text: g.text,
      sub: g.sub,
      cta: direct ? g.studentCta : g.cta,
      page,
      action: g.action,
      anchor: page ? (page === activePage ? null : anchorForPage(page, activePage, pageSection)) : null,
    };
  }

  // 3) 전 영역 검토 항목 — 빨강 먼저
  if (dash && reviewers) {
    const picks = SECTION_ORDER.map((k) => (reviewers[k] ? pickReview(reviewers[k](dash), curStuId) : null)).filter(Boolean);
    const it = picks.find((x) => x.level === 'err') || picks[0];
    if (it) return fromReview(it);
  }

  return { text: '지금은 급한 할 일이 없어요 👍', sub: '기록이 잘 쌓이고 있어요. 현황판에서 영역별로 한 번씩 둘러보세요.' };
}
