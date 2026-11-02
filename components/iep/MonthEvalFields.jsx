import { PillRadio, QField } from '../quick/QuickBits';
import { EVAL_MARKS, MARK_DEFAULT_EVAL, isDefaultEval, isMonthMarked } from '../../lib/iepCard';

// 한 달 평가 칸(새 디자인 4단계) — 목표 카드와 빠른 기록 '이달 평가'가 같이 쓴다(프로토타입 vQuick eval).
//   위: 이 달 계획(읽기 전용 상자) · 아래: 달성/부분/미달 알약 + 한 줄 평가. 저장은 부르는 쪽(부분 갱신 saveMonthEval).
//   값은 { mark, text } — 처음 열 때 initialEval(entry)로 채운다(이미 평가했으면 그 글, 아니면 빈 칸).

const MARK_OPTS = [
  { value: '달성', label: '+ 달성' },
  { value: '부분', label: '○ 부분' },
  { value: '미달', label: '− 미달' },
];

const firstLines = (s, n = 2) => String(s || '').split(/\n/).map((x) => x.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean).slice(0, n);

/** 처음 값 — 새 디자인에서 평가한 칸이면 그 글·표시, 아니면 빈 칸(미리 채워진 평가 방법 문장은 참고로만 보인다). */
export function initialEval(entry) {
  // 표시만 골라 저장한 달(기본 문장)은 글 칸을 비워 보인다 — 표시를 바꾸면 기본 문장도 따라 바뀐다(mds/56 #4).
  if (isMonthMarked(entry)) return { mark: EVAL_MARKS.includes(entry.eval_mark) ? entry.eval_mark : '', text: isDefaultEval(entry.eval) ? '' : String(entry.eval || '') };
  return { mark: '', text: '' };
}

export function PlanBox({ entry, prevEntry }) {
  if (!entry) return null;
  const goal = firstLines(entry.goal, 2);
  const content = firstLines(entry.content, 2);
  const method = firstLines(isMonthMarked(entry) ? entry.eval_method : (entry.eval_method || entry.eval), 1);
  return (
    <div className="kb-iep-plan" aria-label={`${entry.month}월 계획(읽기 전용)`}>
      <div><b>{entry.month}월 계획</b>{goal.length ? ' · ' + goal.join(' / ') : ''}</div>
      {content.length > 0 && <div className="kb-small">지도 내용: {content.join(' / ')}</div>}
      {method.length > 0 && <div className="kb-small">평가 방법(계획 때 적은 것): {method[0]}</div>}
      {prevEntry && isMonthMarked(prevEntry) && <div className="kb-small">지난 칸 평가({prevEntry.month}월): {firstLines(prevEntry.eval, 1)[0] || '—'}{prevEntry.eval_mark ? ` (${prevEntry.eval_mark})` : ''}</div>}
    </div>
  );
}

/**
 * @param {{id:string, entry:object, prevEntry?:object, value:{mark:string,text:string}, onChange:(v)=>void, label?:string}} p
 */
export default function MonthEvalFields({ id, entry, prevEntry, value, onChange, label }) {
  return (
    <div className="kb-q-body kb-iep-eval">
      {label && <div className="kb-q-lb">{label}</div>}
      <PlanBox entry={entry} prevEntry={prevEntry} />
      <PillRadio id={id + '-mk'} label="이번 달 결과" options={MARK_OPTS} value={value.mark} onChange={(mark) => onChange({ ...value, mark })} allowClear small />
      <QField id={id + '-tx'} label="한 줄 평가 (사실대로 — 끝은 ‘~함·~음’으로 맞춰 저장돼요)">
        <textarea id={id + '-tx'} className="kb-q-input" rows={2} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="예: 5회 중 4회 스스로 읽음" />
      </QField>
      {value.mark && !String(value.text || '').trim() && (
        <p className="kb-small">결과만 고르고 비워 두면 ‘{MARK_DEFAULT_EVAL[value.mark] || ''}’ 문장으로 저장돼요(계획서 평가 칸에 들어가요).</p>
      )}
    </div>
  );
}
