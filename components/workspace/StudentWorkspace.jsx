import { useEffect, useRef, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { STUDENT_TABS, formatRoute, withStudent } from '../../lib/routes';
import { levelLabel, levelGradeLabel } from '../../lib/schoolLevel';
import { stuColor } from '../../lib/utils/colors';
import { tier3DoneMap } from '../ui/StepNav';
import { useNextHint } from '../../lib/hooks/useNextHint';
import { OldScreen, SubTabs } from './OldScreen';
import RecordTab from './tabs/RecordTab';
import PlanTab from './tabs/PlanTab';
import ChartTab from './tabs/ChartTab';
import ProfileTab from './tabs/ProfileTab';
import DocsPage from '../docs/DocsPage';
import IepCards from '../iep/IepCards';

// 학생 수첩(#student/{id}/{탭}) — 머리(학생 바꾸기 ▾ · ◀ ▶ · 🚨 급해요) + 탭 6개(mds/52 §5-2).
//   1단계: 각 탭 본문에 기존 화면 컴포넌트를 그대로 넣는다(모양은 옛 화면).
//   규칙(mds/54 §3-3):
//     · 보이는 탭·하위 화면 하나만 마운트(display:none 금지) — 현황판 gridstack·평가 캔버스·#qabf-fn-chart 중복 방지.
//     · 본문 key = 학생id·탭·하위·이동 번호 → 이동마다 다시 마운트(달력 날짜·IEP→DTT 교차 링크가 useState 초기값에서만 읽힘).
//     · 주소 학생과 앱 학생이 맞고 학생 자료가 도착한 뒤에만 그린다(이전 학생 자료가 잠깐 보이지 않게).
//   3단계: 기록·이유·계획·그래프·문서·프로필 탭은 components/workspace/tabs/*·components/docs/DocsPage가 그린다
//     (처음 설정·진행 줄·접힌 줄·문서 내보내기).
//   4단계: IEP 탭 기본(sub '')은 목표 카드(components/iep/IepCards) — 옛 화면 넷은 하위 칩으로 그대로(③ 목표 만들기 = 자세히 고치기 출구).
//     본문을 .kb-ws-body로 감싸 옛 화면 머리표(StuHero)를 숨긴다 — 수첩 머리와 겹침(프로필 수정 입구는 프로필 탭에 있다).
//     🚨 급해요는 학생 수첩에서는 머리 것 하나만(상단바 것은 학생 화면에서 숨김, NewTopbar).

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
  // 1102(mds/57 #17): WAI-ARIA 탭 — 고른 탭만 Tab 순서에 두고(roving tabindex), ←/→/Home/End로 옮기며 바로 연다.
  const tabRefs = useRef({});
  const onTabKey = (e) => {
    const keys = STUDENT_TABS.map((t) => t.key);
    const i = Math.max(0, keys.indexOf(tab.key));
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % keys.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + keys.length) % keys.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = keys.length - 1;
    if (n < 0) return;
    e.preventDefault();
    const el = tabRefs.current[keys[n]];
    if (el) el.focus();
    if (keys[n] !== route.tab) goTab(keys[n]);
  };

  const c = curStu ? stuColor(curStu.code) : '#78839c';

  return (
    <div>
      <div className="kb-ws-head">
        <div className="kb-av" style={{ background: c }} aria-hidden="true">{(curStu?.code || '?').slice(0, 2)}</div>
        <div className="kb-grow">
          <h2 className="kb-ws-name">{curStu ? curStu.code : '학생 불러오는 중…'}</h2>
          {curStu && <div className="kb-ws-meta">{levelGradeLabel(curStu.level, curStu.grade) || levelLabel(curStu.level)} · {curStu.disability || '장애 영역 미입력'}{curStu.is_sample ? ' · 샘플' : ''}</div>}
        </div>
        <button type="button" className="kb-btn kb-sq" onClick={() => goStu(prev?.id)} disabled={!prev} title={prev ? `이전 학생 (${prev.code})` : '이전 학생 없음'} aria-label="이전 학생">◀</button>
        <select className="kb-ws-pick" value={route.sid} onChange={(e) => goStu(e.target.value)} aria-label="학생 바꾸기">
          {idx < 0 && <option value={route.sid}>{curStu ? curStu.code : '…'}</option>}
          {students.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <button type="button" className="kb-btn kb-sq" onClick={() => goStu(next?.id)} disabled={!next} title={next ? `다음 학생 (${next.code})` : '다음 학생 없음'} aria-label="다음 학생">▶</button>
        <button type="button" className="kb-btn kb-danger" onClick={() => onNavigate('crisis')}>🚨 급해요</button>
      </div>

      <div className="kb-tabs" role="tablist" aria-label="학생 수첩" onKeyDown={onTabKey}>
        {STUDENT_TABS.map((t) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[t.key] = el; }}
            id={'kb-wstab-' + t.key}
            type="button"
            role="tab"
            className={'kb-tab' + (tabHint(t) ? ' kb-hinting' : '')}
            aria-selected={t.key === tab.key}
            aria-controls="kb-ws-panel"
            tabIndex={t.key === tab.key ? 0 : -1}
            onClick={() => goTab(t.key)}
            data-tour={'ws-tab-' + t.key}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab.key === 'iep' && <SubTabs subs={tab.subs} cur={route.sub} onPick={goSub} done={done} hint={hint} label={tab.label + ' 안 화면'} lead={{ label: '목표 카드', tour: 'ws-iep-cards' }} />}

      {!ready ? (
        <LoadStall route={route} onNavigate={onNavigate} />
      ) : (
        <div className="kb-ws-body" id="kb-ws-panel" role="tabpanel" aria-labelledby={'kb-wstab-' + tab.key} key={`${route.sid}|${route.tab}|${route.sub}|${route.seq}`}>
          {tab.key === 'record' && <RecordTab route={route} onNavigate={onNavigate} />}
          {tab.key === 'plan' && <PlanTab route={route} onNavigate={onNavigate} />}
          {tab.key === 'iep' && (route.sub ? <OldScreen page={route.sub} onNavigate={onNavigate} /> : <IepCards route={route} onNavigate={onNavigate} />)}
          {tab.key === 'chart' && <ChartTab onNavigate={onNavigate} />}
          {tab.key === 'docs' && <DocsPage mode="student" onNavigate={onNavigate} />}
          {tab.key === 'profile' && <ProfileTab actions={actions} />}
        </div>
      )}
    </div>
  );
}

// 학생 자료가 오래 안 오면(학생 목록·학급·학생 자료 받기 실패) '불러오는 중…'에 멈추지 않게 —
//   다시 불러오기 단추와 되돌아갈 길(학생 목록·오늘)을 보인다(mds/56 #14). 실패를 알면 바로, 모르면 6초 뒤.
function LoadStall({ route, onNavigate }) {
  const { studentsLoaded, studentsError, studentDataErrors, classes, reloadStudents, reloadClasses, selectStudent } = useStudents();
  // 1102(mds/57 #1): 이 학생 자료(/all) 받기가 실패했으면 기다리지 않고 바로 '불러오지 못했어요 · 다시 시도'.
  const dataError = (studentDataErrors && studentDataErrors[route.sid]) || '';
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [route.sid, tries]);
  const show = slow || !!studentsError || !!dataError;
  const retry = async () => {
    setBusy(true);
    try {
      if (!classes || classes.length === 0) await reloadClasses();
      if (!studentsLoaded) await reloadStudents();
      else await selectStudent(route.sid);
    } catch (_e) { /* 아래 안내가 그대로 남는다 */ }
    finally { setBusy(false); setTries((n) => n + 1); }
  };
  if (!show || busy) return <div className="kb-loading">학생 자료를 불러오는 중…</div>;
  return (
    <div className="kb-card" role="alert">
      <h2 className="kb-h3">{dataError ? '학생 자료를 불러오지 못했어요' : '학생 자료를 아직 못 불러왔어요'}</h2>
      <p className="kb-muted">
        {dataError ? `서버에서 이 학생의 기록을 받지 못했어요(${dataError}). 빈 수첩으로 보이지 않게 멈춰 두었어요. ` : ''}
        인터넷 연결을 확인한 뒤 다시 시도해 주세요. 적어 둔 기록은 지워지지 않았어요.
      </p>
      <div className="kb-q-grp">
        <button type="button" className="kb-btn kb-pri" onClick={retry}>{dataError ? '다시 시도' : '다시 불러오기'}</button>
        <button type="button" className="kb-btn" onClick={() => onNavigate('#students')}>학생 목록으로</button>
        <button type="button" className="kb-btn" onClick={() => onNavigate('#today')}>오늘로</button>
      </div>
    </div>
  );
}
