import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchIEP, saveIEPGoal, deleteIEPGoal } from '../../lib/api/students';
import { downloadNiceIepDocx } from '../../lib/utils/niceIepDocx';
import { formatRoute } from '../../lib/routes';
import { isDraft, kstToday, draftGoalBody, copyGoalBody } from '../../lib/iepCard';
import { saveMonthEval, requestOpenOld } from './iepApi';
import GoalCard from './GoalCard';
import { SUBJECTS } from './subjects';

// 학생 수첩 > 개별화교육(IEP) 탭 본문(새 디자인 4단계, 프로토타입 vStudent iep · mds/52 §5-2·§6 흐름 ②).
//   맨 위 '학기목표' + 다른 학생 목표 복사 + '+ 목표 추가' → 교과별 목표 카드(GoalCard). 한 화면 카드 5장 상한 — 넘치면 '더 보기'.
//   학기목표 한 줄만 적어도 저장 = 초안(status 'draft', monthly []). 월별 계획이 생기면 서버가 'active'로 바꾼다.
//   기존 API(/api/students/:id/iep)·기존 lib 함수만 쓴다. 고급 기능은 카드의 '자세히 고치기(기존 화면)'로.
const CARD_MAX = 5;

export default function IepCards({ route, onNavigate }) {
  const { curStu, curStuId, students, curYear, curSemester } = useStudents();
  const { user } = useAuth();
  const toast = useToast();
  const [goals, setGoals] = useState(null);
  const [err, setErr] = useState('');
  const [reloading, setReloading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nSubj, setNSubj] = useState('');
  const [nGoal, setNGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySid, setCopySid] = useState(null);
  const [copyGoals, setCopyGoals] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const { month } = kstToday();
  const sid = curStuId;

  const reload = useCallback(async () => {
    if (!sid) return;
    // 1102(mds/57 #5): 실패하면 목표를 빈 배열로 만들지 않는다 — '목표가 아직 없어요' 안내가 오류와 함께 뜨지 않게.
    //   처음 불러오기가 실패하면 goals는 null 그대로(오류 + 다시 시도만), 이미 보이던 목표는 그대로 둔다.
    setReloading(true);
    try { const d = await fetchIEP(sid); setGoals(d.goals || []); setErr(''); } catch (e) { setErr('IEP 목표를 불러오지 못했어요: ' + e.message); }
    finally { setReloading(false); }
  }, [sid]);
  useEffect(() => { setGoals(null); setErr(''); reload(); }, [reload]);

  const year = Number(curYear) || new Date().getFullYear();
  const sem = Number(curSemester) || 1;
  const { mine, other } = useMemo(() => {
    const all = goals || [];
    const thisYear = all.filter((g) => !g.school_year || g.school_year === year);
    return {
      mine: thisYear.filter((g) => Number(g.semester) === sem),
      other: all.filter((g) => !thisYear.includes(g) || Number(g.semester) !== sem),
    };
  }, [goals, year, sem]);

  const replaceGoal = (g) => setGoals((prev) => (prev || []).map((x) => (x.id === g.id ? g : x)));

  async function patchGoal(id, patch, msg) {
    try {
      const r = await saveIEPGoal(sid, { id, ...patch }); // 부분 갱신 — 보낸 칸만 바뀐다
      if (r && r.goal) replaceGoal(r.goal);
      if (msg) toast(msg);
      return true;
    } catch (e) { toast('저장하지 못했어요: ' + e.message); return false; }
  }
  async function saveEval(goalId, idx, v, monthLabel) {
    try {
      const g = await saveMonthEval(sid, goalId, { monthIdx: idx, monthLabel, mark: v.mark, text: v.text });
      if (g) replaceGoal(g);
      toast('이 달 평가를 저장했어요');
      return true;
    } catch (e) { toast('평가를 저장하지 못했어요: ' + e.message); return false; }
  }
  async function addDraft() {
    if (!nGoal.trim()) return;
    setBusy(true);
    try {
      const r = await saveIEPGoal(sid, draftGoalBody({ subject: nSubj, semesterGoal: nGoal, schoolYear: year, semester: sem }));
      setGoals((prev) => [...(prev || []), r.goal]);
      setAdding(false); setNSubj(''); setNGoal('');
      toast('초안으로 저장했어요. 다음은 ‘월별 계획 만들기’예요.');
    } catch (e) { toast('저장하지 못했어요: ' + e.message); } finally { setBusy(false); }
  }
  async function pickCopyStudent(id) {
    setCopySid(id); setCopyGoals(null);
    try { const d = await fetchIEP(id); setCopyGoals(d.goals || []); } catch (e) { setCopyGoals([]); toast('그 학생 목표를 불러오지 못했어요: ' + e.message); }
  }
  async function copyOne(src) {
    setBusy(true);
    try {
      const r = await saveIEPGoal(sid, copyGoalBody(src, { schoolYear: year, semester: sem }));
      setGoals((prev) => [...(prev || []), r.goal]);
      toast('복사해 초안으로 저장했어요. 이 학생에 맞게 고쳐 쓰세요.');
      setCopyOpen(false); setCopySid(null); setCopyGoals(null);
    } catch (e) { toast('복사하지 못했어요: ' + e.message); } finally { setBusy(false); }
  }
  async function removeGoal(g) {
    const t = g.semester_goal ? `\n\n"${g.semester_goal.slice(0, 40)}${g.semester_goal.length > 40 ? '…' : ''}"` : '';
    if (!window.confirm(`이 IEP 목표를 지울까요?${t}\n\n월별 계획까지 함께 지워지고 되돌릴 수 없어요.`)) return;
    try { await deleteIEPGoal(sid, g.id); setGoals((prev) => (prev || []).filter((x) => x.id !== g.id)); toast('지웠어요.'); } catch (e) { toast('지우지 못했어요: ' + e.message); }
  }
  function word(g) {
    if (isDraft(g)) return;
    downloadNiceIepDocx({
      student: { code: curStu.code, level: curStu.level, grade: curStu.grade },
      teacherName: user?.name || '',
      year: g.school_year || year,
      goals: [g],
    }).then(() => toast('Word 파일을 만들었어요.')).catch((e) => toast('Word 생성 실패: ' + e.message));
  }
  function openOld(goalId, gen) {
    requestOpenOld(sid, goalId, gen);
    onNavigate(formatRoute({ kind: 'student', sid, tab: 'iep', sub: 'iep' }));
  }

  if (!curStu) return null;
  const errStrip = err ? (
    <div className="kb-strip kb-err" role="alert">
      <div>{err}</div>
      <div className="kb-go"><button type="button" className="kb-btn" onClick={reload} disabled={reloading}>{reloading ? '다시 불러오는 중…' : '다시 시도'}</button></div>
    </div>
  ) : null;
  if (goals == null) return err && !reloading ? <div className="kb-stack">{errStrip}</div> : <div className="kb-loading">IEP 목표를 불러오는 중…</div>;

  const shown = showAll ? mine : mine.slice(0, CARD_MAX);
  const others = (students || []).filter((s) => s.id !== sid);
  const card = (g) => (
    <GoalCard
      key={g.id}
      goal={g}
      month={month}
      onPatch={(patch, msg) => patchGoal(g.id, patch, msg)}
      onSaveEval={saveEval}
      onOpenOld={openOld}
      onWord={word}
      onDelete={removeGoal}
    />
  );

  return (
    <div className="kb-stack" data-tour="iep-cards">
      <div className="kb-q-row kb-iep-top">
        <h3 className="kb-h3 kb-grow">학기목표 <span className="kb-small">{year}학년도 {sem}학기 · {mine.length}개{mine.some(isDraft) ? ` (초안 ${mine.filter(isDraft).length})` : ''}</span></h3>
        <button type="button" className="kb-btn" onClick={() => { setCopyOpen(!copyOpen); setAdding(false); }} aria-expanded={copyOpen} disabled={!others.length} title={others.length ? '' : '다른 학생이 없어요'} data-tour="iep-copy">다른 학생 목표 복사</button>
        <button type="button" className="kb-btn kb-pri" onClick={() => { setAdding(!adding); setCopyOpen(false); }} aria-expanded={adding} data-tour="iep-add">+ 목표 추가</button>
      </div>
      {errStrip}

      {adding && (
        <section className="kb-card" aria-labelledby="kb-iep-add-h">
          <h3 className="kb-h3" id="kb-iep-add-h">새 목표 — 학기목표 한 줄만 적어도 돼요</h3>
          <div className="kb-q-field">
            <label className="kb-q-lb" htmlFor="kb-iep-add-subj">교과</label>
            <input id="kb-iep-add-subj" className="kb-q-input" list="kb-iep-add-subjects" value={nSubj} onChange={(e) => setNSubj(e.target.value)} placeholder="예: 국어" />
            <datalist id="kb-iep-add-subjects">{SUBJECTS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="kb-q-field">
            <label className="kb-q-lb" htmlFor="kb-iep-add-goal">학기목표</label>
            <textarea id="kb-iep-add-goal" className="kb-q-input" rows={3} value={nGoal} onChange={(e) => setNGoal(e.target.value)} placeholder="예: 그림 카드를 보고 낱말을 소리 내어 읽을 수 있다." />
          </div>
          <div className="kb-q-grp">
            <button type="button" className="kb-btn kb-pri" onClick={addDraft} disabled={busy || !nGoal.trim()} data-tour="iep-add-save">{busy ? '저장 중…' : '초안으로 저장'}</button>
            <button type="button" className="kb-btn" onClick={() => setAdding(false)}>취소</button>
          </div>
          <p className="kb-small">초안은 목표 수·현황판·계획서·나이스 복사에 아직 들어가지 않아요. 성취기준부터 고르고 싶으면 ‘③ 목표 만들기(기존 화면)’ 칩을 누르세요.</p>
        </section>
      )}

      {copyOpen && (
        <section className="kb-card" aria-labelledby="kb-iep-copy-h">
          <h3 className="kb-h3" id="kb-iep-copy-h">다른 학생 목표 복사 (고쳐 쓰기)</h3>
          <div className="kb-q-grp" role="radiogroup" aria-label="복사해 올 학생">
            {others.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={copySid === s.id} className="kb-pill" onClick={() => pickCopyStudent(s.id)}>{s.code}</button>
            ))}
          </div>
          {copySid && copyGoals == null && <div className="kb-loading">불러오는 중…</div>}
          {copySid && copyGoals && !copyGoals.length && <div className="kb-small">이 학생은 저장된 목표가 없어요.</div>}
          {copySid && copyGoals && copyGoals.length > 0 && (
            <div className="kb-list">
              {copyGoals.slice(0, 12).map((g) => (
                <div key={g.id} className="kb-row kb-row-sm">
                  <div className="kb-t"><b>{g.subject || '교과 미정'}</b> · {g.school_year}·{g.semester}학기 · {(g.semester_goal || '').slice(0, 60)}</div>
                  <button type="button" className="kb-btn" onClick={() => copyOne(g)} disabled={busy}>이 목표 복사</button>
                </div>
              ))}
            </div>
          )}
          <p className="kb-small">교과·성취기준·학기목표·평가 방식만 가져와 초안으로 저장해요. 현행수준·월별 계획·평가는 이 학생에 맞게 새로 만들어요.</p>
        </section>
      )}

      {!mine.length && !adding && (
        <section className="kb-card">
          <div className="kb-muted">이번 학기 목표가 아직 없어요. ‘+ 목표 추가’로 학기목표 한 줄부터 적어 보세요.</div>
        </section>
      )}
      {shown.map(card)}
      {mine.length > CARD_MAX && (
        <button type="button" className="kb-fold" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
          {showAll ? '목표 카드 접기' : `목표 ${mine.length - CARD_MAX}개 더 보기`}<span className="kb-go">{showAll ? '▴' : '▾'}</span>
        </button>
      )}

      {other.length > 0 && (
        <section className={'kb-fold2' + (otherOpen ? ' kb-open' : '')}>
          <button type="button" className="kb-fold2-h" aria-expanded={otherOpen} aria-controls="kb-iep-other" onClick={() => setOtherOpen(!otherOpen)}>
            <span className="kb-fold2-t">다른 학기·학년도 목표 {other.length}개</span>
            <span className="kb-go">{otherOpen ? '접기 ▾' : '펼치기 ▸'}</span>
          </button>
          {otherOpen && <div className="kb-fold2-in kb-stack" id="kb-iep-other">{other.map(card)}</div>}
        </section>
      )}

      <p className="kb-small">작년 IEP·출발점 분석·계획서 전체 출력(나이스 복사)은 위 칩 ①·②·④에서 열어요.</p>
    </div>
  );
}
