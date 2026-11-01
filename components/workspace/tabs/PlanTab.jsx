import { useCallback, useState } from 'react';
import { useStudents } from '../../../contexts/StudentContext';
import { useAuth } from '../../../contexts/AuthContext';
import { planProgress } from '../../../lib/notebook';
import { qabfFunctionText } from '../../../lib/qabf';
import { crisisPrintPayload } from '../../../lib/docs';
import { printCrisisScenario } from '../../../lib/utils/printCrisisScenario';
import FamilyLetterModal from '../../modals/FamilyLetterModal';
import { OldScreen } from '../OldScreen';
import Fold from './Fold';

// 학생 수첩 > 이유·계획 탭(새 디자인 3단계, mds/52 §5-2 '이유·계획', 프로토타입 plan).
//   위: 진행 줄 3칸(관찰 → 이유 찾기 → 계획 세우기, lib/notebook.js planProgress) + '지금 할 칸' 카드 한 장만 크게.
//   아래: 접힌 줄 — 이유 찾기(QABF 화면 통째) · 계획 세우기(BIP 화면 통째) · 자세한 순서 보기(8단계, Tier3 화면) ·
//         함께 만들기(행동 계약서 화면 + 가정 통신문 창) · 위기 기록(위기 시나리오·심리안정실 이력과 입구).
//   규칙: 한 번에 한 줄만 펼친다(옛 화면을 하나만 마운트 — #qabf-fn-chart 중복·무거움 방지).
//         처음 펼침 = 주소에 하위 화면이 있으면 그것(옛 화면 '다음 단계' 단추·길잡이가 onNavigate('bip') 등으로 부름),
//         없으면 지금 할 칸(이유·계획). 끝난 칸은 접혀 요약만 보인다(0821: 미설정이면 펼침, 끝났으면 접힘).
const SUB_FOLD = { qabf: 'why', bip: 'plan', tier3: 'steps', contract: 'together' };

function Steps({ steps, onPick }) {
  return (
    <div className="kb-steps3" role="list" aria-label="진행 순서" data-tour="ws-plan-steps">
      {steps.map((s) => (
        <button key={s.key} type="button" role="listitem" className={'kb-s3 kb-s3-' + s.state} onClick={() => onPick(s.key)} aria-current={s.state === 'now' ? 'step' : undefined}>
          <span className="kb-s3-n" aria-hidden="true">{s.state === 'done' ? '✓' : s.n}</span>
          <span><b>{s.label}</b><span className="kb-s3-t">{s.state === 'done' ? '끝 · ' : ''}{s.text}</span></span>
        </button>
      ))}
    </div>
  );
}

function NowCard({ prog, fnText, onOpen, onRecord }) {
  if (prog.now === 'obs') {
    return (
      <section className="kb-card kb-now" data-tour="ws-plan-now">
        <h3 className="kb-h3">1 · 행동을 먼저 관찰해요</h3>
        <div className="kb-muted">이유를 찾으려면 행동이 언제·어디서·어떻게 일어나는지 기록이 있어야 해요. 기록 탭에서 관찰(ABC)이나 행동 수치를 한 건 남겨 주세요.</div>
        <div className="kb-q-grp"><button type="button" className="kb-btn kb-pri kb-big" onClick={onRecord}>기록 탭에서 관찰하기</button></div>
      </section>
    );
  }
  if (prog.now === 'why') {
    return (
      <section className="kb-card kb-now" data-tour="ws-plan-now">
        <h3 className="kb-h3">2 · 행동의 이유 찾기 <span className="kb-abbr">QABF = 행동 기능 질문지</span></h3>
        <div className="kb-muted">관찰한 행동이 왜 일어나는지 25개 질문으로 알아봐요. 관찰 {prog.obsN}건이 쌓여 있어요{prog.qabfN ? ` · 지금 ${prog.qabfN}/25 답함` : ''}.</div>
        <div className="kb-q-grp"><button type="button" className="kb-btn kb-pri kb-big" onClick={() => onOpen('why')}>{prog.qabfN ? '이어서 답하기' : '이유 찾기 시작'}</button></div>
      </section>
    );
  }
  if (prog.now === 'plan') {
    return (
      <section className="kb-card kb-now" data-tour="ws-plan-now">
        <h3 className="kb-h3">3 · 계획 세우기 <span className="kb-abbr">BIP = 행동중재계획</span></h3>
        <div className="kb-muted">이유{fnText ? `(주된 이유: ${fnText})` : ''}에 맞춰 대체 행동과 예방·가르치기·강화·반응 방법을 정해요.</div>
        <div className="kb-q-grp"><button type="button" className="kb-btn kb-pri kb-big" onClick={() => onOpen('plan')}>계획 세우기</button></div>
      </section>
    );
  }
  return (
    <section className="kb-card kb-now" data-tour="ws-plan-now">
      <h3 className="kb-h3">세 칸 모두 끝났어요</h3>
      <div className="kb-muted">계획대로 지도하면서 기록 탭에 기록을 쌓고, 그래프·평가 탭에서 효과를 확인해요. 고칠 때는 아래 줄을 펼치세요.</div>
    </section>
  );
}

function CrisisBlock({ onNavigate }) {
  const { curStu, curStuData } = useStudents();
  const { user } = useAuth();
  const sz = curStuData?.sz || [];
  const crisis = curStuData?.crisis || [];
  return (
    <div className="kb-stack" style={{ gap: 12 }}>
      <p className="kb-small">위기 시나리오를 만들거나 심리안정실 이용을 적는 칸은 위기 대처 화면에 있어요(🚨 급해요와 같은 화면, 이 학생으로 열려요).</p>
      <div className="kb-q-grp">
        <button type="button" className="kb-btn kb-out" onClick={() => onNavigate('crisis')}>위기 대처 화면 열기</button>
      </div>
      <div className="kb-cols2">
        <div>
          <b>저장된 위기 시나리오 {crisis.length}건</b>
          {crisis.length === 0 ? <p className="kb-small">아직 없어요.</p> : (
            <ul className="kb-mini">
              {crisis.slice(0, 3).map((r) => (
                <li key={r.id}>
                  <span>{(r.created_at || '').slice(0, 10)} · {(r.situation || '').slice(0, 30)}{(r.situation || '').length > 30 ? '…' : ''}</span>
                  <button type="button" className="kb-btn" onClick={() => printCrisisScenario(crisisPrintPayload({ stu: curStu, user, record: r }))}>인쇄 · PDF</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <b>심리안정실 이용 {sz.length}회</b>
          {sz.length === 0 ? <p className="kb-small">아직 없어요.</p> : (
            <ul className="kb-mini">
              {sz.slice(0, 3).map((r) => <li key={r.id}><span>{r.date} {r.in_t}~{r.out_t} · {r.reason} · {r.ret === 'Y' ? '복귀' : '미복귀'}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlanTab({ route, onNavigate }) {
  const { curStuData } = useStudents();
  const prog = planProgress(curStuData);
  const fnText = prog.qabfN > 0 ? qabfFunctionText(curStuData?.qabf).replace(/ \([A-Za-z]+\)/g, '') : '';
  const explicit = /[?&]sub=/.test(route.hash || '') ? SUB_FOLD[route.sub] : '';
  const [open, setOpen] = useState(() => explicit || (prog.now === 'why' ? 'why' : prog.now === 'plan' ? 'plan' : ''));
  const [contractOn, setContractOn] = useState(route.sub === 'contract' && !!explicit);
  const [letterOpen, setLetterOpen] = useState(false);
  const sz = curStuData?.sz || [];
  const crisis = curStuData?.crisis || [];

  const toggle = useCallback((key) => (v) => setOpen(v ? key : ''), []);
  const openFold = (key) => {
    setOpen(key);
    setTimeout(() => {
      const el = document.querySelector(`[data-fold-id="ws-plan-${key}"]`);
      if (el) { try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_e) { el.scrollIntoView(); } }
    }, 60);
  };
  const toRecord = () => onNavigate(`#student/${route.sid}/record`);
  const onPickStep = (k) => { if (k === 'obs') toRecord(); else openFold(k); };

  const whySum = prog.qabfDone ? `다 답함${fnText ? ` · 주된 이유: ${fnText}` : ''}` : prog.qabfN ? `${prog.qabfN}/25 답함` : '아직 안 함';
  const planSum = prog.planDone ? '중재 계획 있음' : '아직 안 씀';

  return (
    <div className="kb-stack">
      <Steps steps={prog.steps} onPick={onPickStep} />
      <NowCard prog={prog} fnText={fnText} onOpen={openFold} onRecord={toRecord} />

      <Fold id="ws-plan-why" anchor="ws-plan-why" title="2 이유 찾기 — 행동 기능 질문지(QABF)" summary={whySum} tone={prog.qabfDone ? 'green' : prog.qabfN ? 'amber' : 'rose'} open={open === 'why'} onToggle={toggle('why')}>
        <OldScreen page="qabf" onNavigate={onNavigate} />
      </Fold>
      <Fold id="ws-plan-plan" anchor="ws-plan-plan" title="3 계획 세우기 — 행동중재계획(BIP)" summary={planSum} tone={prog.planDone ? 'green' : 'rose'} open={open === 'plan'} onToggle={toggle('plan')}>
        <OldScreen page="bip" onNavigate={onNavigate} />
      </Fold>
      <Fold id="ws-plan-steps" anchor="ws-plan-steps8" title="자세한 순서 보기 (8단계)" summary="한 학생 집중 지원 절차 · 통합 문서 Word" open={open === 'steps'} onToggle={toggle('steps')}>
        <OldScreen page="tier3" onNavigate={onNavigate} />
      </Fold>
      <Fold id="ws-plan-together" anchor="ws-plan-together" title="함께 만들기 — 행동 계약서 · 가정 통신문" summary={`통신문 ${(curStuData?.letters || []).length}건 저장`} open={open === 'together'} onToggle={toggle('together')}>
        <div className="kb-q-grp">
          <button type="button" className="kb-btn kb-out" aria-pressed={contractOn} onClick={() => setContractOn((v) => !v)} data-tour="nav-contract">{contractOn ? '행동 계약서 닫기' : '행동 계약서 쓰기'}</button>
          <button type="button" className="kb-btn kb-out" onClick={() => setLetterOpen(true)} data-tour="ws-plan-letter">가정 통신문 쓰기 · 지난 통신문</button>
        </div>
        {contractOn && <OldScreen page="contract" onNavigate={onNavigate} />}
      </Fold>
      <Fold id="ws-plan-crisis" anchor="ws-plan-crisis" title="위기 기록 — 위기 시나리오 · 심리안정실" summary={`시나리오 ${crisis.length}건 · 안정실 ${sz.length}회`} tone={crisis.length || sz.length ? 'amber' : 'blue'} open={open === 'crisis'} onToggle={toggle('crisis')}>
        <CrisisBlock onNavigate={onNavigate} />
      </Fold>

      <FamilyLetterModal open={letterOpen} onClose={() => setLetterOpen(false)} />
    </div>
  );
}
