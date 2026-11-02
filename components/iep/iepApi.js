import { fetchIEP, saveIEPGoal } from '../../lib/api/students';
import { evalIndexFor, mergeMonthEval, kstToday, IEP_OPEN_KEY } from '../../lib/iepCard';

// 새 디자인 4단계 — IEP 목표 저장 도우미(카드·빠른 기록 '이달 평가'가 같이 쓴다). 기존 API(/api/students/:id/iep)만 부른다.

/**
 * 한 목표의 '그 달' 평가만 저장 — 보내기 직전에 서버의 최신 목표를 다시 받아 그 칸만 바꾸고 { id, monthly }만 보낸다
 * (서버 부분 갱신 규약: body에 없는 칸은 그대로). 다른 달 평가·다른 칸은 서버 값 그대로 남는다.
 * @returns {Promise<object>} 저장된 목표
 */
//   monthIdx(카드의 칸 번호)를 줄 때는 monthLabel(그 칸의 월 라벨)도 함께 — 서버 배열에서 라벨이 다르면 저장하지 않는다(mds/56 #32).
export async function saveMonthEval(sid, goalId, { month, monthIdx, monthLabel, mark, text }) {
  const d = await fetchIEP(sid);
  const g = (d.goals || []).find((x) => x.id === goalId);
  if (!g) throw new Error('목표를 찾지 못했어요(다른 곳에서 지웠을 수 있어요).');
  const idx = evalIndexFor(g.monthly, { monthIdx, monthLabel, month, sem: g.semester });
  if (idx === -2) throw new Error('월별 계획이 다른 곳에서 바뀌었어요 — 새로고침한 뒤 다시 써 주세요.');
  if (idx < 0) throw new Error('이 달 칸이 월별 계획에 없어요.');
  const monthly = mergeMonthEval(g.monthly, idx, { mark, text, date: kstToday().date });
  const r = await saveIEPGoal(sid, { id: goalId, monthly });
  return r.goal;
}

/** '자세히 고치기(기존 화면)' — 옛 IepPage가 열리면 이 목표를 불러오게 남겨 둔다(IepPage.jsx 4단계 효과가 읽고 지운다). */
export function requestOpenOld(sid, goalId, gen = '') {
  try { sessionStorage.setItem(IEP_OPEN_KEY, JSON.stringify({ sid, goalId, gen })); } catch (_e) { /* noop */ }
}
