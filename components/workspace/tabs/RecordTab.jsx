import { useEffect, useState } from 'react';
import { useStudents } from '../../../contexts/StudentContext';
import { recordSetup, recentRecords } from '../../../lib/notebook';
import { todayKst } from '../../../lib/utils/calendarRules';
import { formatRoute } from '../../../lib/routes';
import DesignPicker from '../../student/DesignPicker';
import DeadMansModal from '../../modals/DeadMansModal';
import ObservationPeriodModal from '../../modals/ObservationPeriodModal';
import QuickRecordDrawer from '../../quick/QuickRecordDrawer';
import { OldScreen } from '../OldScreen';
import Fold from './Fold';

// 학생 수첩 > 기록 탭(새 디자인 3단계, mds/52 §5-2 '기록', 프로토타입 rec).
//   ① 맨 위 '처음 설정'(표적행동 정의·관찰 기간·기록 설계·점검표 교시) — 미설정이면 펼침, 끝났으면 요약 한 줄로 접힘.
//      정의 글칸은 아래 '행동 관찰' 화면(ObservePage)에 그대로 두고 여기서는 상태와 입구만 — 같은 칸을 두 곳에서 고치면
//      한쪽 자동 저장이 다른 쪽 값을 덮는다. 관찰 기간·설계·🧟 도우미는 기존 창·부품을 그대로 연다.
//   ② 오늘 기록 카드 — 빠른 기록 창(관찰·수치·회기) 열기.  ③ 지난 기록 5줄.
//   ④ 기존 화면(하위 선택): 행동 관찰(ABC) · 행동 데이터 · 교수 회기 — 회기는 MonitorPage의 '교수 회기 기록' 탭(sessionStorage
//      kb_monitor_tab, 화면이 마운트 때 한 번 읽음)이라 고를 때 다시 마운트한다.
const SCROLL_KEY = 'kb_ws_scroll'; // 다시 마운트한 뒤 이 앵커로 내려가기(정의 쓰기)
const MON_TAB = 'kb_monitor_tab';

const readMonTab = () => { try { return sessionStorage.getItem(MON_TAB) || 'behavior'; } catch (_e) { return 'behavior'; } };

export default function RecordTab({ route, onNavigate }) {
  const { curStu, curStuId, curStuData, tier2MemberIds } = useStudents();
  const inGroup = !!(tier2MemberIds && tier2MemberIds.has(curStuId));
  const setup = recordSetup(curStuData, { inGroup });
  const [setupOpen, setSetupOpen] = useState(setup.open);
  const [deadOpen, setDeadOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [quick, setQuick] = useState(null);
  const [monTab, setMonTab] = useState(readMonTab);
  const [screenKey, setScreenKey] = useState(0);
  const today = todayKst();
  const rec = recentRecords(curStuData, today, 5);

  // 다른 하위 화면에서 '정의 쓰기'를 눌러 넘어왔으면 그 칸으로.
  useEffect(() => {
    let a = '';
    try { a = sessionStorage.getItem(SCROLL_KEY) || ''; sessionStorage.removeItem(SCROLL_KEY); } catch (_e) { /* noop */ }
    if (!a) return undefined;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${a}"]`);
      if (el) el.scrollIntoView({ block: 'center' });
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const goSub = (sub, mt) => {
    if (sub === 'monitor') {
      try { sessionStorage.setItem(MON_TAB, mt); } catch (_e) { /* noop */ }
      setMonTab(mt);
    }
    if (sub === route.sub) { setScreenKey((k) => k + 1); return; }
    onNavigate(formatRoute({ kind: 'student', sid: route.sid, tab: 'record', sub }));
  };
  const toOpdef = () => {
    if (route.sub === 'observe') {
      const el = document.querySelector('[data-tour="ob-opdef"]');
      if (el) { el.scrollIntoView({ block: 'center' }); const ta = el.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true }); }
      return;
    }
    try { sessionStorage.setItem(SCROLL_KEY, 'ob-opdef'); } catch (_e) { /* noop */ }
    goSub('observe');
  };
  const openQuick = (mode) => setQuick({ sid: curStuId, mode, nonce: Date.now() });

  const subs = [
    { key: 'observe', mt: '', label: '행동 관찰 (ABC)', on: route.sub === 'observe', tour: 'nav-observe' },
    { key: 'monitor', mt: 'behavior', label: '행동 데이터', on: route.sub === 'monitor' && monTab !== 'sessions', tour: 'nav-monitor' },
    { key: 'monitor', mt: 'sessions', label: '교수 회기 기록', on: route.sub === 'monitor' && monTab === 'sessions', tour: 'ws-rec-sessions' },
  ];

  return (
    <div className="kb-stack">
      <Fold
        id="ws-rec-setup"
        anchor="ws-rec-setup"
        title={setup.done ? '처음 설정' : '처음 설정 — 아직 남았어요'}
        summary={setup.done ? setup.items.map((it) => (it.key === 'opdef' || it.key === 'period' ? `${it.label} ✓` : it.text)).join(' · ') : `${setup.items.filter((it) => !it.done).map((it) => it.label).join('·')} 남음`}
        tone={setup.done ? 'green' : 'rose'}
        open={setupOpen}
        onToggle={setSetupOpen}
      >
        <p className="kb-small">처음 한 번 하는 설정이에요. 끝내면 이렇게 한 줄로 접히고, 새 학생이면 펼쳐져 있어요.</p>
        <div className="kb-setup">
          {setup.items.map((it) => (
            <div key={it.key} className="kb-setup-row">
              <div className="kb-setup-l">
                <b>{it.label}</b>
                <span className={'kb-status kb-tone-' + (it.done ? 'green' : 'rose')}>{it.done ? (it.key === 'design' || it.key === 'cico' ? it.text : '됨') : '아직'}</span>
                {(it.key === 'opdef' || it.key === 'period') && <span className="kb-small">{it.text}</span>}
              </div>
              <div className="kb-setup-a">
                {it.key === 'opdef' && (
                  <>
                    <button type="button" className="kb-btn kb-out" onClick={toOpdef}>{it.done ? '정의 고치기' : '정의 쓰기'}</button>
                    <button type="button" className="kb-btn" onClick={() => setDeadOpen(true)} title='"죽은 사람 검사"로 행동 표현을 점검'>조작적 정의 도우미</button>
                  </>
                )}
                {it.key === 'period' && <button type="button" className="kb-btn kb-out" onClick={() => setPeriodOpen(true)}>{it.done ? '관찰 기간 보기·바꾸기' : '관찰 기간 시작하기'}</button>}
                {it.key === 'design' && <div className="kb-setup-design"><DesignPicker /></div>}
                {it.key === 'cico' && <button type="button" className="kb-btn" onClick={() => onNavigate('#class/cico')}>매일 점검표 설정 열기</button>}
              </div>
            </div>
          ))}
        </div>
      </Fold>

      <section className="kb-card" data-tour="ws-rec-today">
        <h3 className="kb-h3">오늘 기록</h3>
        <div className="kb-muted">
          {rec.todayN > 0 ? `오늘 ${rec.todayN}건 기록했어요.` : '오늘 관찰·수치 기록은 아직 없어요.'}
          {rec.total > 0 ? ` 지난 기록 ${rec.total}건이 아래에 있어요.` : ''}
        </div>
        <div className="kb-q-grp">
          <button type="button" className="kb-btn kb-pri kb-big" onClick={() => openQuick('obs')} data-tour="ws-rec-quick">빠른 기록 열기</button>
          <button type="button" className="kb-btn" onClick={() => openQuick('num')}>행동 수치</button>
          <button type="button" className="kb-btn" onClick={() => openQuick('ses')}>교수 회기</button>
        </div>
      </section>

      {rec.rows.length > 0 && (
        <div className="kb-list" aria-label="지난 기록">
          {rec.rows.map((r) => (
            <div key={r.id} className="kb-row kb-row-sm">
              <span className={'kb-status kb-tone-' + (r.kind === 'abc' ? 'blue' : 'amber')}>{r.kind === 'abc' ? '관찰' : '수치'}</span>
              <div className="kb-t">{(r.date || '').slice(5).replace('-', '/')} · {r.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className="kb-subtabs" role="group" aria-label="기록 화면 고르기">
        {subs.map((s) => (
          <button key={s.label} type="button" className="kb-chip" aria-pressed={s.on} onClick={() => goSub(s.key, s.mt)} data-tour={s.tour}>{s.label}</button>
        ))}
      </div>
      <div key={screenKey}>
        <OldScreen page={route.sub} onNavigate={onNavigate} />
      </div>

      <DeadMansModal open={deadOpen} onClose={() => setDeadOpen(false)} />
      <ObservationPeriodModal open={periodOpen} onClose={() => setPeriodOpen(false)} />
      <QuickRecordDrawer
        start={quick}
        rows={[{ id: curStuId, code: curStu ? curStu.code : '', task: 'done', mode: 'obs' }]}
        summary={{ recorded: rec.todayN > 0 ? 1 : 0, total: 1 }}
        onClose={() => setQuick(null)}
        onSaved={() => {}}
        onNavigate={onNavigate}
      />
    </div>
  );
}
