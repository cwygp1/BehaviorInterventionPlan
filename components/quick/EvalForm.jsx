import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { fetchIEP } from '../../lib/api/students';
import { activeGoals, kstToday, monthIndexFor, isMonthMarked } from '../../lib/iepCard';
import MonthEvalFields, { initialEval } from '../iep/MonthEvalFields';
import { saveMonthEval } from '../iep/iepApi';

// 빠른 기록 창 '이달 평가' 모드(새 디자인 4단계, 프로토타입 vQuick eval).
//   이번 학기 IEP 목표(초안 제외) 가운데 이번 달 칸이 있는 것마다: 이달 계획(읽기 전용) + 달성/부분/미달 + 한 줄 평가.
//   저장 = 바꾼 목표만, 그 목표의 '이번 달 칸'만 부분 갱신(saveMonthEval — 서버 최신값 위에 그 칸만 합쳐 { id, monthly }).
//   다른 달 평가는 지우지 않는다. 평가 문장은 개조식 명사형 종결 안전망(lib/iepCard evalSafeText)을 거쳐 저장된다.
const same = (a, b) => (a.mark || '') === (b.mark || '') && String(a.text || '').trim() === String(b.text || '').trim();

const EvalForm = forwardRef(function EvalForm({ studentId, onDirty, onNavigate, onClose, onGo }, ref) {
  const { curSemester } = useStudents();
  const [goals, setGoals] = useState(null);
  const [vals, setVals] = useState({}); // { goalId: {mark,text} }
  const [base, setBase] = useState({});
  const [err, setErr] = useState('');
  const { month } = kstToday();
  const sem = Number(curSemester) || 1;

  const load = async () => {
    try {
      const d = await fetchIEP(studentId);
      const list = activeGoals(d.goals).filter((g) => Number(g.semester) === sem && monthIndexFor(g.monthly, month, g.semester) >= 0);
      const init = Object.fromEntries(list.map((g) => [g.id, initialEval(g.monthly[monthIndexFor(g.monthly, month, g.semester)])]));
      setGoals(list); setVals(init); setBase(init); setErr('');
    } catch (e) { setGoals([]); setErr('IEP 목표를 불러오지 못했어요: ' + e.message); }
  };
  useEffect(() => { load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = useMemo(() => (goals || []).filter((g) => vals[g.id] && base[g.id] && !same(vals[g.id], base[g.id]) && (vals[g.id].mark || String(vals[g.id].text || '').trim())), [goals, vals, base]);
  const dirty = changed.length > 0;
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty, onDirty]);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!changed.length) return { ok: false, error: '바꾼 평가가 없어요. 결과를 고르거나 한 줄 평가를 적어 주세요.' };
      const next = { ...base };
      for (const g of changed) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const saved = await saveMonthEval(studentId, g.id, { month, mark: vals[g.id].mark, text: vals[g.id].text });
          const e = saved && saved.monthly ? saved.monthly[monthIndexFor(saved.monthly, month, saved.semester)] : null;
          next[g.id] = e ? initialEval(e) : vals[g.id];
          setGoals((prev) => (prev || []).map((x) => (x.id === g.id && saved ? saved : x)));
          setVals((prev) => ({ ...prev, [g.id]: next[g.id] }));
        } catch (e) {
          setBase(next);
          return { ok: false, error: `${g.subject || '목표'} 평가를 저장하지 못했어요: ${e.message}` };
        }
      }
      setBase(next);
      return { ok: true };
    },
    discard: () => setVals(base),
    isDirty: () => dirty,
  }));

  if (goals == null) return <div className="kb-loading">이번 달 IEP 계획을 불러오는 중…</div>;
  if (err) return <div className="kb-strip kb-err" role="alert">{err}</div>;
  if (!goals.length) {
    return (
      <div className="kb-q-body" data-tour="qr-eval">
        <div className="kb-q-banner">
          이번 달({month}월) 칸이 있는 IEP 월별 계획이 없어요. 월별 계획을 먼저 만들면 여기서 한 달 평가를 쓸 수 있어요.
          <div><button type="button" className="kb-btn" onClick={() => { const h = `#student/${studentId}/iep`; if (onGo) { onGo(h); return; } if (onClose) onClose(); onNavigate(h); }}>IEP 목표 카드 열기</button></div>
        </div>
      </div>
    );
  }
  return (
    <div className="kb-q-body" data-tour="qr-eval">
      <div className="kb-q-banner">이달 계획을 위에 보여 드려요. 평가는 사실대로 한 줄만 적으면 돼요. 이번 달({month}월) 칸만 저장하고 다른 달 평가는 그대로 둬요.</div>
      {goals.map((g) => {
        const idx = monthIndexFor(g.monthly, month, g.semester);
        const entry = g.monthly[idx];
        return (
          <div key={g.id} className="kb-iep-evalbox">
            <MonthEvalFields
              id={`qe-${studentId}-${g.id}`}
              label={`${g.subject || '교과 미정'}: ${(g.semester_goal || '').slice(0, 40)}${(g.semester_goal || '').length > 40 ? '…' : ''}${isMonthMarked(entry) ? ' · 평가함' : ''}`}
              entry={entry}
              prevEntry={g.monthly[idx - 1]}
              value={vals[g.id] || { mark: '', text: '' }}
              onChange={(v) => setVals((prev) => ({ ...prev, [g.id]: v }))}
            />
          </div>
        );
      })}
    </div>
  );
});

export default EvalForm;
