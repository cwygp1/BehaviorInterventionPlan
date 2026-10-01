import { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useGuide } from '../guide/GuideContext';
import { buildChecklist, checklistProgress } from '../../lib/onboarding';

// 홈 '시작하기' 체크리스트(mds/46 방법 4) — 홈 맨 위. 다 하면 저절로 사라지고, '접기'로 언제든 닫는다.
//   · 단추는 실제 일을 하는 곳으로 바로 데려간다(학생 등록 창 열기 / 그 학생으로 화면 이동).
//   · 🧭 길잡이(다른 세션 작업)가 들어오면 같은 이름의 길을 함께 띄운다 — 없으면 화면 이동만.

const OFF_KEY = 'kb_start_list_off';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) { /* 사생활 모드 */ } };

export default function StartChecklist({ onNavigate }) {
  const { classes, students, studentsLoaded, homeSummary, curStu, selectStudent } = useStudents();
  const guide = useGuide();
  const [off, setOff] = useState(true);
  useEffect(() => { setOff(lsGet(OFF_KEY) === '1'); }, []);

  const items = useMemo(
    () => buildChecklist({ classes, students, summaries: homeSummary?.summaries }),
    [classes, students, homeSummary]
  );
  const prog = checklistProgress(items);
  if (off || !studentsLoaded || !homeSummary || prog.complete) return null;

  const run = async (it) => {
    if (it.action === 'addStudent') { guide.actions?.openAddStudent?.(); return; }
    if (it.action === 'manageClasses') { guide.actions?.openManageClasses?.(); return; }
    if (it.needsStudent) {
      // 지금 고른 학생이 내 학생이면 그대로, 아니면 첫 내 학생으로.
      const own = (students || []).filter((s) => !s.is_sample);
      if (!own.length) { guide.actions?.openAddStudent?.(); return; }
      if (!curStu || curStu.is_sample) await selectStudent(own[0].id);
    }
    if (it.escort && typeof guide.startEscort === 'function') guide.startEscort(it.escort);
    if (it.page) onNavigate(it.page);
  };

  return (
    <div className="card ob-check" data-demo="start-checklist">
      <div className="ob-check-head">
        <div>
          <div className="ob-check-k">🚀 시작하기</div>
          <div className="ob-check-t">처음 한 바퀴 — {prog.done}/{prog.total} 했어요</div>
        </div>
        <div className="ob-check-bar" aria-hidden="true"><span style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></div>
        <button type="button" className="ob-check-off" onClick={() => { lsSet(OFF_KEY, '1'); setOff(true); }} title="체크리스트 접기 — 다시 보려면 🧭 길잡이를 쓰세요">접기 ×</button>
      </div>
      <ol className="ob-check-list">
        {items.map((it) => {
          const isNext = prog.next && prog.next.id === it.id;
          return (
            <li key={it.id} className={'ob-check-item' + (it.done ? ' done' : '') + (isNext ? ' next' : '')}>
              <span className="ob-check-box" aria-hidden="true">{it.done ? '✓' : ''}</span>
              <div className="ob-check-body">
                <div className="ob-check-it">{it.title}{it.done && <span className="sr-only"> (완료)</span>}</div>
                {!it.done && <div className="ob-check-is">{it.sub}</div>}
              </div>
              {!it.done && it.cta && (
                <button type="button" className={'btn btn-sm ' + (isNext ? 'btn-pri' : 'btn-ghost')} onClick={() => run(it)}>{it.cta}</button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
