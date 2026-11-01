import { useStudents } from '../../contexts/StudentContext';
import { STUDENT_TABS, formatRoute, withStudent } from '../../lib/routes';
import { levelLabel } from '../../lib/schoolLevel';
import { stuColor } from '../../lib/utils/colors';
import { tier3DoneMap } from '../ui/StepNav';
import { useNextHint } from '../../lib/hooks/useNextHint';
import { OldScreen, SubTabs } from './OldScreen';
import RecordTab from './tabs/RecordTab';
import PlanTab from './tabs/PlanTab';
import ChartTab from './tabs/ChartTab';
import ProfileTab from './tabs/ProfileTab';
import DocsPage from '../docs/DocsPage';

// 학생 수첩(#student/{id}/{탭}) — 머리(학생 바꾸기 ▾ · ◀ ▶ · 🚨 급해요) + 탭 6개(mds/52 §5-2).
//   1단계: 각 탭 본문에 기존 화면 컴포넌트를 그대로 넣는다(모양은 옛 화면).
//   규칙(mds/54 §3-3):
//     · 보이는 탭·하위 화면 하나만 마운트(display:none 금지) — 현황판 gridstack·평가 캔버스·#qabf-fn-chart 중복 방지.
//     · 본문 key = 학생id·탭·하위·이동 번호 → 이동마다 다시 마운트(달력 날짜·IEP→DTT 교차 링크가 useState 초기값에서만 읽힘).
//     · 주소 학생과 앱 학생이 맞고 학생 자료가 도착한 뒤에만 그린다(이전 학생 자료가 잠깐 보이지 않게).
//   3단계: 기록·이유·계획·그래프·문서·프로필 탭은 components/workspace/tabs/*·components/docs/DocsPage가 그린다
//     (처음 설정·진행 줄·접힌 줄·문서 내보내기). IEP 탭만 1단계 그대로(하위 칩 + 옛 화면, 카드화는 4단계).

export default function StudentWorkspace({ route, onNavigate, actions }) {
  const { students, curStu, curStuId, curStuData, curStuDataLoaded } = useStudents();
  const [hint] = useNextHint();
  const ready = curStuId === route.sid && curStuDataLoaded && !!curStu;
  const tab = STUDENT_TABS.find((t) => t.key === route.tab) || STUDENT_TABS[0];
  const done = ready ? tier3DoneMap(curStuData) : {};

  const idx = students.findIndex((s) => s.id === route.sid);
  const prev = idx > 0 ? students[idx - 1] : null;
  const next = idx >= 0 && idx < students.length - 1 ? students[idx + 1] : null;
  const goStu = (sid) => { if (sid) onNavigate(withStudent(route, Number(sid))); };
  const goTab = (key) => onNavigate(formatRoute({ kind: 'student', sid: route.sid, tab: key, sub: '' }));
  const goSub = (sub) => onNavigate(formatRoute({ kind: 'student', sid: route.sid, tab: route.tab, sub }));
  const tabHint = (t) => !!hint && t.subs.includes(hint) && t.key !== route.tab;

  const c = curStu ? stuColor(curStu.code) : '#78839c';

  return (
    <div>
      <div className="kb-ws-head">
        <div className="kb-av" style={{ background: c }} aria-hidden="true">{(curStu?.code || '?').slice(0, 2)}</div>
        <div className="kb-grow">
          <div className="kb-ws-name">{curStu ? curStu.code : '학생 불러오는 중…'}</div>
          {curStu && <div className="kb-ws-meta">{levelLabel(curStu.level)}{curStu.grade ? ` ${curStu.grade}학년` : ''} · {curStu.disability || '장애 영역 미입력'}{curStu.is_sample ? ' · 샘플' : ''}</div>}
        </div>
        <button type="button" className="kb-btn kb-sq" onClick={() => goStu(prev?.id)} disabled={!prev} title={prev ? `이전 학생 (${prev.code})` : '이전 학생 없음'} aria-label="이전 학생">◀</button>
        <select className="kb-ws-pick" value={route.sid} onChange={(e) => goStu(e.target.value)} aria-label="학생 바꾸기">
          {idx < 0 && <option value={route.sid}>{curStu ? curStu.code : '…'}</option>}
          {students.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <button type="button" className="kb-btn kb-sq" onClick={() => goStu(next?.id)} disabled={!next} title={next ? `다음 학생 (${next.code})` : '다음 학생 없음'} aria-label="다음 학생">▶</button>
        <button type="button" className="kb-btn kb-danger" onClick={() => onNavigate('crisis')}>🚨 급해요</button>
      </div>

      <div className="kb-tabs" role="tablist" aria-label="학생 수첩">
        {STUDENT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={'kb-tab' + (tabHint(t) ? ' kb-hinting' : '')}
            aria-selected={t.key === route.tab}
            onClick={() => goTab(t.key)}
            data-tour={'ws-tab-' + t.key}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab.key === 'iep' && <SubTabs subs={tab.subs} cur={route.sub} onPick={goSub} done={done} hint={hint} label={tab.label + ' 안 화면'} />}

      {!ready ? (
        <div className="kb-loading">학생 자료를 불러오는 중…</div>
      ) : (
        <div key={`${route.sid}|${route.tab}|${route.sub}|${route.seq}`}>
          {tab.key === 'record' && <RecordTab route={route} onNavigate={onNavigate} />}
          {tab.key === 'plan' && <PlanTab route={route} onNavigate={onNavigate} />}
          {tab.key === 'iep' && <OldScreen page={route.sub} onNavigate={onNavigate} />}
          {tab.key === 'chart' && <ChartTab onNavigate={onNavigate} />}
          {tab.key === 'docs' && <DocsPage mode="student" onNavigate={onNavigate} />}
          {tab.key === 'profile' && <ProfileTab actions={actions} />}
        </div>
      )}
    </div>
  );
}
