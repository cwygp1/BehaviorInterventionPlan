import { stdGoalsForDoc } from './iepGoalStyle';
// NEIS 붙여넣기용 텍스트 생성 (0824 퀵윈⑤ — SEM 벤치마킹).
// NEIS 입력칸은 서식 없는 일반 텍스트라, 마크다운·표 없이 항목 라벨이 붙은
// 순수 텍스트로 만든다. 교사는 통째로 붙여넣고 필요 없는 항목만 지우면 된다.

function lines(s) {
  return String(s || '').trim();
}

// 한 영역(goal) → NEIS 텍스트.
export function buildNeisGoalText(g) {
  const head = `[${g.subject}${g.area ? ' · ' + g.area : ''}] ${g.school_year || ''}학년도 ${g.semester}학기`;
  const parts = [head];

  if (lines(g.plop)) parts.push(`\n■ 현행수준\n${lines(g.plop)}`);
  if (lines(g.semester_goal)) parts.push(`\n■ 교육목표(학기)\n${lines(g.semester_goal)}`);
  // 0903(B안): 성취기준별 목표 — 문서 설정('한 문장만')이면 생략.
  const sgDoc = stdGoalsForDoc(g);
  if (sgDoc.length) parts.push(`\n■ 성취기준별 목표\n${sgDoc.map((x) => `- [${x.code}] ${x.goal}`).join('\n')}`);

  const monthly = (g.monthly || []).filter((m) => lines(m.goal) || lines(m.content) || lines(m.eval));
  if (monthly.length) {
    const rows = monthly.map((m) => {
      const seg = [`${m.month}월`];
      if (lines(m.goal)) seg.push(`목표: ${lines(m.goal).replace(/\n/g, ' ')}`);
      if (lines(m.content)) seg.push(`내용: ${lines(m.content).replace(/\n/g, ' ')}`);
      if ((m.methods || []).length) seg.push(`방법: ${m.methods.join(', ')}`);
      if (lines(m.eval_plan)) seg.push(`평가계획: ${lines(m.eval_plan).replace(/\n/g, ' ')}`);
      if (lines(m.eval)) seg.push(`평가: ${lines(m.eval).replace(/\n/g, ' ')}`);
      return seg.join(' / ');
    });
    parts.push(`\n■ 월별 교육계획\n${rows.join('\n')}`);
  }

  if (lines(g.semestral_eval)) parts.push(`\n■ 평가(학기)\n${lines(g.semestral_eval)}`);

  return parts.join('\n');
}

// 여러 영역 → 구분선으로 이어붙인 전체 텍스트.
export function buildNeisAllText(goals) {
  return (goals || []).map(buildNeisGoalText).join('\n\n────────────────────\n\n');
}

// 클립보드 복사 — 성공 여부를 돌려주고, 실패하면 호출부가 안내 토스트를 띄운다.
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_e) {
    return false;
  }
}
