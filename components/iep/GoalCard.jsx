import { useState } from 'react';
import { goalSteps, isDraft, isMonthMarked } from '../../lib/iepCard';
import MonthEvalFields, { initialEval } from './MonthEvalFields';
import GoalRefs from './GoalRefs';
import { SUBJECTS } from './subjects';

// IEP 목표 카드 한 장(새 디자인 4단계, 프로토타입 vStudent iep · mds/52 §5-2).
//   교과 · 상태(저장됨/초안, 점+글자) · 학기목표 · 4단계 줄(1 교과 → 2 목표 → 3 월별 계획 → 4 평가, 지금 할 단계 강조)
//   · 접힌 '참고하기'(성취기준·수준 사다리·지도서 카드) · Word로 받기 · 자세히 고치기(기존 화면).
//   카드에서 바로 되는 것: 교과·학기목표 고치기(부분 저장), 월별 평가 쓰기(그 달만 부분 저장), 사다리 문장 고르기, 지도서 차시 → 교육내용.
//   월별 계획 만들기는 기존 화면의 같은 생성기(규칙 초안 → AI n차·이전 판 보관)로 넘어간다(onOpenOld gen='rule').

/**
 * @param {object} p
 * @param {object} p.goal    iep_goals 행
 * @param {number} p.month   이번 달(KST)
 * @param {(patch:object, msg?:string)=>Promise<boolean>} p.onPatch   { id 빼고 바꿀 칸 } — 부분 저장
 * @param {(goalId:number, idx:number, v:{mark,text}, monthLabel?:string)=>Promise<boolean>} p.onSaveEval
 * @param {(goalId:number, gen?:string)=>void} p.onOpenOld
 * @param {(goal)=>void} p.onWord
 * @param {(goal)=>void} p.onDelete
 */
export default function GoalCard({ goal, month, onPatch, onSaveEval, onOpenOld, onWord, onDelete }) {
  const draft = isDraft(goal);
  const { steps, now, monthIdx } = goalSteps(goal, month);
  const monthly = Array.isArray(goal.monthly) ? goal.monthly : [];
  const [editing, setEditing] = useState(false);
  const [subj, setSubj] = useState(goal.subject || '');
  const [text, setText] = useState(goal.semester_goal || '');
  const [refsOpen, setRefsOpen] = useState(false);
  const [evalIdx, setEvalIdx] = useState(-1); // 평가 칸을 연 달(-1 = 닫힘)
  const [ev, setEv] = useState({ mark: '', text: '' });
  const [busy, setBusy] = useState(false);
  const idBase = `kb-goal-${goal.id}`;
  const subjLocked = !!goal.standard_code; // 성취기준이 붙어 있으면 교과는 기존 화면에서(mds/56 #34)

  const startEdit = () => { setSubj(goal.subject || ''); setText(goal.semester_goal || ''); setEditing(true); };
  const saveEdit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    // 성취기준이 붙은 목표는 교과를 여기서 바꾸지 않는다 — 성취기준 코드·영역·학년군이 옛 교과 것으로 남아 '[2국01-01] 수학'이 되므로(mds/56 #34).
    const patch = subjLocked ? { semester_goal: text.trim() } : { subject: subj.trim(), semester_goal: text.trim() };
    const ok = await onPatch(patch, '학기목표를 저장했어요');
    setBusy(false);
    if (ok) setEditing(false);
  };
  const openEval = (i) => {
    if (i === evalIdx) { setEvalIdx(-1); return; }
    setEvalIdx(i);
    setEv(initialEval(monthly[i]));
  };
  const saveEval = async () => {
    if (!ev.text.trim() && !ev.mark) return;
    setBusy(true);
    const ok = await onSaveEval(goal.id, evalIdx, ev, monthly[evalIdx] ? monthly[evalIdx].month : undefined); // 라벨도 함께(mds/56 #32)
    setBusy(false);
    if (ok) setEvalIdx(-1);
  };

  const evalTarget = monthIdx >= 0 ? monthIdx : monthly.findIndex((e) => !isMonthMarked(e));

  return (
    <section className={'kb-card kb-iep-card' + (draft ? ' kb-iep-draft' : '')} aria-labelledby={idBase + '-h'} data-tour="iep-goal-card">
      <div className="kb-q-row kb-iep-head">
        <h3 className="kb-h3" id={idBase + '-h'}>{goal.subject || '교과 미정'}</h3>
        <span className={'kb-status kb-tone-' + (draft ? 'amber' : 'green')}>{draft ? '초안' : '저장됨'}</span>
        <span className="kb-small kb-grow">{goal.semester}학기{goal.standard_code ? ` · [${goal.standard_code}]` : ''}{goal.updated_at ? ` · 고친 때 ${goal.updated_at}` : ''}</span>
        {!editing && <button type="button" className="kb-btn" onClick={startEdit}>학기목표 고치기</button>}
      </div>

      {editing ? (
        <div className="kb-q-body">
          <div className="kb-q-field">
            <label className="kb-q-lb" htmlFor={idBase + '-subj'}>교과</label>
            <input id={idBase + '-subj'} className="kb-q-input" list={subjLocked ? undefined : idBase + '-subjects'} value={subj} onChange={(e) => setSubj(e.target.value)} readOnly={subjLocked} aria-describedby={subjLocked ? idBase + '-subj-note' : undefined} />
            {subjLocked
              ? <p className="kb-small" id={idBase + '-subj-note'} style={{ margin: 0 }}>성취기준 [{goal.standard_code}]이 붙은 목표라 교과는 여기서 못 바꿔요. 교과를 바꾸려면 아래 ‘자세히 고치기 (기존 화면)’에서 성취기준과 함께 바꿔 주세요.</p>
              : <datalist id={idBase + '-subjects'}>{SUBJECTS.map((s) => <option key={s} value={s} />)}</datalist>}
          </div>
          <div className="kb-q-field">
            <label className="kb-q-lb" htmlFor={idBase + '-goal'}>학기목표</label>
            <textarea id={idBase + '-goal'} className="kb-q-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="kb-q-grp">
            <button type="button" className="kb-btn kb-pri" onClick={saveEdit} disabled={busy || !text.trim()}>{busy ? '저장 중…' : '저장'}</button>
            <button type="button" className="kb-btn" onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      ) : (
        <div className="kb-iep-goal">{goal.semester_goal || <span className="kb-small">학기목표가 아직 비어 있어요.</span>}</div>
      )}

      <ol className="kb-gsteps" aria-label="진행 단계" data-tour="iep-goal-steps">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'kb-gs-done' : i === now ? 'kb-gs-now' : ''} aria-current={i === now ? 'step' : undefined}>
            {s.label}{s.done ? ' ✓' : ''}
          </li>
        ))}
      </ol>

      {monthly.length === 0 ? (
        <div className="kb-iep-next">
          <p className="kb-small">학기목표만 적어 둔 <b>초안</b>이에요. 월별 계획을 만들어 저장하면 ‘저장됨’이 되고 계획서·나이스·현황판에 들어가요.</p>
          <div className="kb-q-grp">
            <button type="button" className="kb-btn kb-pri" onClick={() => onOpenOld(goal.id, 'rule')} data-tour="iep-goal-gen">월별 계획 만들기</button>
          </div>
          <p className="kb-small">기존 ‘③ 목표 만들기’ 화면이 이 목표로 열리고 규칙 초안이 바로 만들어져요. AI 초안·이전 판 비교도 거기서 하고 ‘저장’을 누르면 돼요.</p>
        </div>
      ) : (
        <div className="kb-iep-months">
          <div className="kb-q-lb" id={idBase + '-mh'}>월별 평가 {monthIdx >= 0 ? `· 이번 달은 ${monthly[monthIdx].month}월 칸` : ''}</div>
          <div className="kb-q-grp kb-q-grp-sm" role="group" aria-labelledby={idBase + '-mh'}>
            {monthly.map((e, i) => (
              <button
                key={i}
                type="button"
                className="kb-pill"
                aria-pressed={evalIdx === i}
                onClick={() => openEval(i)}
                title={isMonthMarked(e) ? `${e.month}월 평가함${e.eval_mark ? ' — ' + e.eval_mark : ''}` : `${e.month}월 평가 쓰기`}
              >
                {e.month}월 {isMonthMarked(e) ? `✓${e.eval_mark ? ' ' + e.eval_mark : ''}` : i === monthIdx ? '· 이번 달' : ''}
              </button>
            ))}
          </div>
          {evalIdx < 0 && evalTarget >= 0 && !isMonthMarked(monthly[evalTarget]) && (
            <div><button type="button" className="kb-btn kb-pri" onClick={() => openEval(evalTarget)} data-tour="iep-goal-eval">{monthly[evalTarget].month}월 평가 쓰기</button></div>
          )}
          {evalIdx >= 0 && monthly[evalIdx] && (
            <div className="kb-iep-evalbox">
              <MonthEvalFields id={`${idBase}-ev${evalIdx}`} entry={monthly[evalIdx]} prevEntry={monthly[evalIdx - 1]} value={ev} onChange={setEv} />
              <div className="kb-q-grp">
                <button type="button" className="kb-btn kb-pri" onClick={saveEval} disabled={busy || (!ev.text.trim() && !ev.mark)}>{busy ? '저장 중…' : `${monthly[evalIdx].month}월 평가 저장`}</button>
                <button type="button" className="kb-btn" onClick={() => setEvalIdx(-1)}>닫기</button>
              </div>
              <p className="kb-small">이 달 칸만 저장해요. 다른 달 평가는 그대로 남아요.</p>
            </div>
          )}
        </div>
      )}

      <section className={'kb-fold2' + (refsOpen ? ' kb-open' : '')}>
        <button type="button" className="kb-fold2-h" aria-expanded={refsOpen} aria-controls={idBase + '-refs'} onClick={() => setRefsOpen(!refsOpen)} data-tour="iep-goal-refs">
          <span className="kb-fold2-t">참고하기 · 성취기준 · 수준 사다리 · 지도서</span>
          <span className="kb-go">{refsOpen ? '접기 ▾' : '펼치기 ▸'}</span>
        </button>
        {refsOpen && <div className="kb-fold2-in" id={idBase + '-refs'}><GoalRefs goal={goal} onPatch={onPatch} /></div>}
      </section>

      <div className="kb-q-grp">
        <button type="button" className="kb-btn" onClick={() => onWord(goal)} disabled={draft} title={draft ? '초안은 월별 계획을 만든 뒤 내보낼 수 있어요' : '나이스 양식 Word(.docx) — 이 목표만'}>Word로 받기</button>
        <button type="button" className="kb-btn kb-out" onClick={() => onOpenOld(goal.id, '')} data-tour="iep-goal-old">자세히 고치기 (기존 화면)</button>
        <button type="button" className="kb-btn" onClick={() => onDelete(goal)}>지우기</button>
      </div>
    </section>
  );
}
