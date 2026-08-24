// '검토가 필요한 항목' 규칙의 단일 출처 (0824 간결화③).
// 이전엔 4개 대시보드가 각자 규칙을 들고 있어 홈에서는 전체 현황을 볼 수 없었다.
// 여기서는 데이터만으로 항목을 만들고({ level, text, sub, cta, page, sid }),
// 대시보드가 onClick(학생 선택+이동)을 입히고, 홈 포털은 영역별 건수 배지로 쓴다.
import { daysAgo } from '../components/pages/dash/DashBits';

// level: err(빨강) | warn(주황) | ok(칭찬·집계 제외)
export function computeT1Reviews(data) {
  const t1 = data?.t1 || {};
  const pbs = t1.pbs || null;
  const rewards = Array.isArray(pbs?.rewards) ? pbs.rewards : [];
  const items = [];
  if (!t1.surveyDone) items.push({ level: 'err', text: 'PBS 기초 설문조사가 아직 없어요', sub: '학급 실태를 먼저 파악하면 규칙·목표 설정이 쉬워져요', cta: '설문 작성', page: 'pbssurvey' });
  if (!pbs?.goal) items.push({ level: 'warn', text: '학급 공통 목표가 미설정 상태예요', sub: '이번 학기 우리 반의 기대행동/목표를 정해주세요', cta: '목표 설정', page: 'classpbs' });
  if (pbs?.goal && rewards.length === 0) items.push({ level: 'warn', text: '보상 목록이 비어 있어요', sub: '포인트 달성 시 받을 보상을 학생들과 정해보세요', cta: '보상 추가', page: 'classpbs' });
  if (!t1.checklistDone) items.push({ level: 'warn', text: '학급관리 체크리스트 점검 전이에요', sub: '학기 중 1회 이상 점검을 권장해요', cta: '점검하기', page: 'classcheck' });
  return items;
}

export function computeT2Reviews(data) {
  const t2 = data?.t2 || { groups: [], cico: {} };
  const codeOf = (sid) => data?.students?.find((s) => s.id === sid)?.code || `#${sid}`;
  const memberIds = [...new Set((t2.groups || []).flatMap((g) => g.members.map((m) => m.student_id)))];
  const items = [];
  if ((t2.groups || []).length === 0) {
    items.push({ level: 'err', text: '운영 중인 소그룹이 없어요', sub: '지원이 더 필요한 학생 몇 명을 소그룹으로 묶어보세요', cta: '그룹 만들기', page: 'tier2' });
  }
  const notToday = memberIds.filter((sid) => !t2.cico[sid]?.today);
  if (memberIds.length > 0 && notToday.length > 0) {
    items.push({ level: 'warn', text: `오늘 CICO 기록이 없는 학생 ${notToday.length}명`, sub: notToday.slice(0, 5).map(codeOf).join(', ') + (notToday.length > 5 ? ' 외' : ''), cta: '기록하기', page: 'tier2' });
  }
  memberIds.forEach((sid) => {
    const c = t2.cico[sid];
    const d = c?.last ? daysAgo(c.last) : null;
    if (d != null && d >= 7) items.push({ level: 'err', text: `${codeOf(sid)} — ${d}일째 CICO 기록 없음`, sub: '중단됐다면 그룹 구성/목표를 다시 점검해보세요', cta: '열기', page: 'tier2', sid });
    if (c && c.cnt14 >= 3 && c.avg14 != null && c.avg14 >= 80) items.push({ level: 'ok', text: `${codeOf(sid)} — 최근 2주 수행률 ${c.avg14}% 👏`, sub: '목표 상향 또는 Tier 축소(졸업)를 검토해볼 수 있어요', cta: '검토', page: 'tier2', sid });
  });
  return items;
}

export function computeT3Reviews(data) {
  const stu = data?.stu || {};
  const rows = (data?.students || []).map((s) => ({ ...s, d: stu[s.id] || {} }));
  const items = [];
  rows.forEach((r) => {
    const d = r.d;
    if ((d.abc || 0) >= 3 && !d.qabfDone) items.push({ level: 'warn', text: `${r.code} — ABC ${d.abc}건인데 기능평가(QABF) 미실시`, sub: '관찰이 쌓였으니 행동 기능을 분석해볼 때예요', cta: 'QABF', page: 'qabf', sid: r.id });
    if (d.qabfDone && !d.bipFilled) items.push({ level: 'err', text: `${r.code} — 기능평가는 했는데 BIP 미작성`, sub: '분석 결과를 중재계획으로 이어주세요', cta: 'BIP 작성', page: 'bip', sid: r.id });
    if (d.bgoal && !d.bgoalDest) items.push({ level: 'warn', text: `${r.code} — 행동목표의 IEP 반영 방식 미선택`, sub: '개별화 목표로 가져갈지, 교과에 녹일지 골라주세요', cta: '선택하기', page: 'bip', sid: r.id });
    const dm = d.monLast ? daysAgo(d.monLast) : null;
    if (d.bipFilled && (d.mon || 0) > 0 && dm != null && dm >= 7) items.push({ level: 'err', text: `${r.code} — 행동 데이터가 ${dm}일째 없음`, sub: '중재 중이라면 데이터 기록을 이어가야 효과를 볼 수 있어요', cta: '기록', page: 'monitor', sid: r.id });
    if (d.bipFilled && (d.mon || 0) === 0) items.push({ level: 'warn', text: `${r.code} — BIP는 있는데 행동 데이터가 0건`, sub: '기초선(A)부터 기록을 시작해보세요', cta: '기록 시작', page: 'monitor', sid: r.id });
    // 0824: 기초선이 길어지는데 중재(B)로 넘어가지 않은 경우 — phase 데이터 기반
    const ps = d.phaseSince ? daysAgo(d.phaseSince) : null;
    if (d.phase === 'A' && d.bipFilled && ps != null && ps >= 14) items.push({ level: 'warn', text: `${r.code} — 기초선(A)만 ${ps}일째`, sub: 'BIP가 준비됐다면 중재를 시작하고 phase를 B로 기록하세요', cta: '기록', page: 'monitor', sid: r.id });
    // 0824: 심리안정실 이용 급증 — 위기 조기 신호
    if ((d.sz30 || 0) >= 3) items.push({ level: 'warn', text: `${r.code} — 최근 30일 심리안정실 ${d.sz30}회`, sub: '위기행동 패턴을 점검하고 BIP 예방 전략을 살펴보세요', cta: '위기 기록', page: 'crisis', sid: r.id });
  });
  return items;
}

export function computeIepReviews(data) {
  const stu = data?.stu || {};
  const rows = (data?.students || []).map((s) => ({ ...s, d: stu[s.id] || {} }));
  const items = [];
  rows.forEach((r) => {
    const d = r.d;
    if (!d.startpointDone) items.push({ level: 'warn', text: `${r.code} — 출발점 분석(현행수준) 미완료`, sub: 'IEP의 출발점 — 강점·요구를 먼저 정리해주세요', cta: '출발점', page: 'startpoint', sid: r.id });
    if (d.startpointDone && (d.iepGoals || 0) === 0) items.push({ level: 'err', text: `${r.code} — IEP 목표가 아직 없어요`, sub: '출발점 분석이 끝났으니 학기목표를 세워볼 때예요', cta: '목표 생성', page: 'iep', sid: r.id });
    if ((d.iepSemGoals || 0) > 0 && (d.iepMonthly || 0) === 0) items.push({ level: 'warn', text: `${r.code} — 학기목표만 있고 월별 계획이 비어 있어요`, sub: '월별 지도 계획까지 채우면 계획서가 완성돼요', cta: '월별 계획', page: 'iep', sid: r.id });
    // 0824: 이번 달 월별 구간의 평가 칸이 비어 있음 — 학기말 몰림 방지
    if ((d.iepMonthEvalMissing || 0) > 0) items.push({ level: 'warn', text: `${r.code} — 이번 달 월별 평가 미작성 ${d.iepMonthEvalMissing}건`, sub: '이 달이 가기 전에 구간 평가를 채워두면 학기말이 가벼워져요', cta: '평가 쓰기', page: 'iepReport', sid: r.id });
    if (d.bgoal && d.bgoalDest === 'iep') items.push({ level: 'ok', text: `${r.code} — BIP 행동목표를 개별화 목표로 가져가기로 했어요`, sub: '학기목표 먼저(경로 B)에 붙여넣어 활용하세요', cta: '목표 생성', page: 'iep', sid: r.id });
  });
  return items;
}

// 홈 포털 배지용 — ok(칭찬)를 뺀 영역별 검토 건수.
export function reviewCounts(data) {
  const cnt = (items) => items.filter((it) => it.level !== 'ok').length;
  return {
    t1: cnt(computeT1Reviews(data)),
    t2: cnt(computeT2Reviews(data)),
    t3: cnt(computeT3Reviews(data)),
    iep: cnt(computeIepReviews(data)),
  };
}
