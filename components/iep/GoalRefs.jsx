import { useEffect, useMemo, useState } from 'react';
import { goalLadder, GOAL_LEVELS } from '../../lib/utils/goalLadder';
import { loadCurriculumContent, contentEntries, guideKeysOf, loadCurriculumGuides, guideUnitsFor } from '../../lib/curriculumContent';
import CurriculumGuideUnits from '../ui/CurriculumGuideUnits';

// 목표 카드 '참고하기'(접힘, 새 디자인 4단계) — 성취기준 · 5수준 사다리 · 교사용 지도서 단원 카드.
//   지도서 카드는 기존 부품(CurriculumGuideUnits)·기존 lib 함수(curriculumContent)를 그대로 쓴다. 펼쳤을 때만 마운트(부르는 쪽).
//   사다리 줄 '이 문장으로' → 학기목표 바꾸기, 지도서 차시 → 학기 교육내용(sem_content)에 한 줄 더하기 — 둘 다 부분 저장(onPatch).

export default function GoalRefs({ goal, onPatch }) {
  const codes = useMemo(() => [goal.standard_code, ...(Array.isArray(goal.related_stds) ? goal.related_stds.map((x) => x.code) : [])].filter(Boolean), [goal]);
  const [cc, setCc] = useState(null);
  const [cg, setCg] = useState(null);
  useEffect(() => {
    if (!codes.length) return undefined;
    let alive = true;
    loadCurriculumContent().then((d) => { if (alive && d) setCc(d); });
    return () => { alive = false; };
  }, [codes.length]);
  const entries = useMemo(() => contentEntries(cc, codes), [cc, codes]);
  const keys = guideKeysOf(entries).sort().join(',');
  useEffect(() => {
    if (!keys) return undefined;
    let alive = true;
    loadCurriculumGuides(keys.split(',')).then((d) => { if (alive && d) setCg(d); });
    return () => { alive = false; };
  }, [keys]);
  const units = useMemo(() => guideUnitsFor(cg, entries), [cg, entries]);
  const ladder = goal.standard_text ? goalLadder(goal.standard_text) : null;

  const addContent = (lines) => {
    const cur = String(goal.sem_content || '').split(/\n/).map((s) => s.trim()).filter(Boolean);
    const add = (lines || []).map((l) => '- ' + String(l).replace(/^\s*[-•·]\s*/, '').trim()).filter((l) => !cur.includes(l));
    if (!add.length) return;
    onPatch({ sem_content: [...cur, ...add].join('\n') }, '학기 교육내용에 넣었어요');
  };

  return (
    <div className="kb-stack kb-iep-refs">
      <div>
        <div className="kb-q-lb">성취기준</div>
        {goal.standard_code
          ? <div>[{goal.standard_code}] {goal.standard_text}{codes.length > 1 ? <span className="kb-small"> · 관련 성취기준 {codes.length - 1}개</span> : null}</div>
          : <div className="kb-small">고른 성취기준이 없어요. 성취기준 고르기는 ‘자세히 고치기(기존 화면)’에서 해요.</div>}
      </div>
      {ladder && ladder[0] && (
        <div>
          <div className="kb-q-lb">수준 사다리 (성취기준 → 5수준)</div>
          <ol className="kb-iep-ladder">
            {ladder.map((t, i) => (
              <li key={i}>
                <span className="kb-small">{GOAL_LEVELS[i] ? GOAL_LEVELS[i].label || '' : ''}</span>
                <span className="kb-grow">{t}</span>
                <button type="button" className="kb-btn" onClick={() => onPatch({ semester_goal: t }, '학기목표를 바꿨어요')} disabled={goal.semester_goal === t}>이 문장으로</button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {units.length > 0 && (
        <div className="kb-iep-guide">
          <CurriculumGuideUnits units={units} onAdd={(lines) => addContent(lines)} />
        </div>
      )}
      {codes.length > 0 && !units.length && <div className="kb-small">이 성취기준의 교사용 지도서 단원 자료는 아직 없어요(국어·수학 1~4학년군만 있어요).</div>}
    </div>
  );
}
