import { useCallback, useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchIEP } from '../../lib/api/students';
import { activeGoals } from '../../lib/iepCard';
import { buildFullStudentContext } from '../../lib/tierContext';
import {
  DOC_KINDS, docKind, iepFilter, iepYears, niceWordPayload, formWordPayload, taskGoals, taskSheetPayload,
  bipHasContent, bipPrintPayload, letterPrintPayload, contractBlankPayload, crisisPrintPayload, tier3Payload, qabfSaved,
} from '../../lib/docs';
// 출력 함수 — 기존 화면이 부르는 것과 같은 함수(수정 없이 호출만).
import { downloadNiceIepDocx } from '../../lib/utils/niceIepDocx';
import { downloadIepFormDocx, downloadTaskSheetDocx } from '../../lib/utils/iepFormDocx';
import { buildNeisAllText, copyToClipboard } from '../../lib/utils/neisCopy';
import { printBIP } from '../../lib/utils/printBIP';
import { printFamilyLetter } from '../../lib/utils/printFamilyLetter';
import { printBehaviorContract } from '../../lib/utils/printContract';
import { downloadContractDocx } from '../../lib/utils/contractDocx';
import { printCrisisScenario } from '../../lib/utils/printCrisisScenario';
import { downloadTier3Doc } from '../../lib/utils/printTier3';
import { downloadQabfExcel } from '../../lib/utils/exportQabf';
import EvalReportModal from '../modals/EvalReportModal';
import FamilyLetterModal from '../modals/FamilyLetterModal';
import OffscreenCharts, { OffscreenQabfChart } from '../student/OffscreenCharts';

// 문서 내보내기 — 학생 수첩 '문서' 탭(학생 고정)과 '문서·자료' 허브(학생 고르기부터)가 같이 쓴다(3단계, mds/52 §5-1·§8).
//   1 학생 → 2 문서 종류 카드 → 내보내기 방식 알약. 출력은 전부 기존 lib/utils 함수를 같은 입력으로 부른다(lib/docs.js).
//   각 화면 안의 1클릭 출력 단추는 그대로 — 여기는 입구를 하나 더 둔 것.
//   4단계(이월 5-a): '한 화면 카드 5장' 규칙 — 자주 쓰는 5종(IEP·BIP·결과 보고서·가정 통신문·Tier 3 통합 문서)만 늘 보이고,
//   행동 계약서·위기 시나리오와 나머지 3종은 '더 보기' 접힘(행동 계약서는 이유·계획 탭 '함께 만들기'에도 입구가 있다).

const MAIN = ['iep', 'bip', 'eval', 'letter', 'tier3'];
const MORE = ['contract', 'crisis', 'qabf', 'dpr', 'aac'];
const curYearNow = () => new Date().getFullYear();

function Dot({ tone, children }) {
  return <span className={'kb-status kb-tone-' + tone}>{children}</span>;
}

function DocCard({ kind, status, busyKey, onRun, children }) {
  const d = docKind(kind);
  return (
    <section className="kb-doc" aria-labelledby={`kb-doc-${kind}`} data-tour={'doc-' + kind}>
      <h3 id={`kb-doc-${kind}`} className="kb-h3">{d.title}</h3>
      <p className="kb-small">{d.desc}</p>
      {status}
      {children}
      <div className="kb-q-grp" role="group" aria-label={`${d.title} 내보내기 방식`}>
        {d.formats.map((f) => (
          <button
            key={f.key}
            type="button"
            className="kb-pill"
            onClick={() => onRun(kind, f.key)}
            disabled={!!busyKey}
            aria-busy={busyKey === `${kind}.${f.key}` || undefined}
            data-doc={`${kind}.${f.key}`}
          >
            {busyKey === `${kind}.${f.key}` ? '만드는 중…' : f.label}
          </button>
        ))}
      </div>
      <p className="kb-small kb-doc-from">{d.from}</p>
    </section>
  );
}

function StudentPills({ students, cur, onPick }) {
  return (
    <div className="kb-q-grp" role="radiogroup" aria-labelledby="kb-doc-stu-lb" data-tour="doc-student">
      <b className="kb-muted" id="kb-doc-stu-lb">1 학생</b>
      {students.map((s) => (
        <button key={s.id} type="button" role="radio" className="kb-pill" aria-checked={cur === s.id} onClick={() => onPick(s.id)}>
          {s.code}
        </button>
      ))}
    </div>
  );
}

/**
 * @param {object} p
 * @param {'hub'|'student'} p.mode  hub = 학생 고르기부터, student = 학생 수첩 문서 탭(지금 학생 고정)
 * @param {(target:string)=>void} p.onNavigate  새 셸 navigate(옛 id 또는 #주소)
 */
export default function DocsPage({ mode = 'hub', onNavigate }) {
  const { students, curStu, curStuId, curStuData, curStuDataLoaded, studentDataErrors, selectStudent, tier2Groups, curSemester } = useStudents();
  const { user } = useAuth();
  const toast = useToast();
  const [goals, setGoals] = useState(null); // 저장된 IEP 목표(이 학생)
  const [goalsErr, setGoalsErr] = useState(false); // 1102(mds/56 #28): 목표를 못 불러옴 — '목표 없음'과 구분
  const [busyKey, setBusyKey] = useState('');
  const [year, setYear] = useState(curYearNow());
  const [sem, setSem] = useState('');
  const [taskGoalId, setTaskGoalId] = useState('');
  const [letterId, setLetterId] = useState('');
  const [crisisId, setCrisisId] = useState('');
  const [evalStep, setEvalStep] = useState(''); // '' | 'drawing' | 'open'
  const [evalRefs, setEvalRefs] = useState(null);
  const [qabfRun, setQabfRun] = useState(0);
  const [letterOpen, setLetterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const ready = !!curStu && curStuDataLoaded;

  // 학생이 바뀌면 고른 값·목표를 새로.
  useEffect(() => {
    setGoals(null); setGoalsErr(false); setTaskGoalId(''); setLetterId(''); setCrisisId(''); setEvalStep(''); setEvalRefs(null); setQabfRun(0);
    // 1102(mds/56 #26): QABF 엑셀처럼 화면 밖 그림을 기다리던 단추는 위에서 그림을 내렸으니 잠금도 푼다(안 풀면 모든 단추가 잠긴 채 남음).
    setBusyKey('');
    if (!curStuId) return undefined;
    let alive = true;
    fetchIEP(curStuId).then((d) => { if (alive) setGoals(activeGoals(d.goals)); }) // 4단계: 초안 목표는 출력에서 뺀다
      .catch(() => {
        if (!alive) return;
        setGoals([]); setGoalsErr(true);
        toast('IEP 목표를 불러오지 못했어요 — 잠시 뒤 새로고침해 주세요.');
      });
    return () => { alive = false; };
  }, [curStuId]);

  const run = useCallback(async (kind, fmt) => {
    if (!curStu) { toast('학생을 먼저 골라 주세요.'); return; }
    const stu = curStu;
    const key = `${kind}.${fmt}`;
    const wrap = async (fn) => {
      setBusyKey(key);
      try { await fn(); } catch (e) { toast('만들지 못했어요: ' + (e && e.message ? e.message : e)); } finally { setBusyKey(''); }
    };
    const all = goals || [];
    if (kind === 'iep' && goalsErr) { toast('IEP 목표를 불러오지 못했어요 — 새로고침한 뒤 다시 눌러 주세요.'); return; }
    switch (key) {
      // ── IEP (IepReportPage onWord·onNeisCopy, IepPage exportFormWord·downloadTaskSheetNow) ──
      case 'iep.niceWord': {
        const list = iepFilter(all, { year, sem });
        if (!list.length) { toast('출력할 목표가 없습니다.'); return; }
        await wrap(async () => {
          await downloadNiceIepDocx(niceWordPayload({ stu, user, year, sem, goals: list, curYear: curYearNow() }));
          toast('나이스 양식 Word 파일을 내려받았어요 — 브라우저 다운로드 폴더를 확인하세요.', 'success');
        });
        return;
      }
      case 'iep.neisCopy': {
        const list = iepFilter(all, { year, sem });
        const text = buildNeisAllText(list);
        if (!text.trim()) { toast('복사할 내용이 없습니다.'); return; }
        const ok = await copyToClipboard(text);
        toast(ok ? `${list.length}개 영역의 NEIS용 텍스트를 복사했어요.` : '복사 권한이 없어요 — 화면의 내용을 직접 선택해 복사해 주세요.');
        return;
      }
      case 'iep.formWord':
        if (!all.length) { toast('저장된 IEP 목표가 없습니다. 먼저 저장하세요.'); return; }
        await wrap(async () => { await downloadIepFormDocx(formWordPayload({ stu, user, goals: all })); toast('양식 Word 파일을 내려받았어요.', 'success'); });
        return;
      case 'iep.taskSheet': {
        const tg = taskGoals(all);
        const g = tg.find((x) => String(x.id) === String(taskGoalId)) || tg[0];
        if (!g) { toast('과제분석 단계가 저장된 목표가 없어요 — IEP 탭 ③에서 단계를 만들어 저장해 주세요.'); return; }
        await wrap(async () => { await downloadTaskSheetDocx(taskSheetPayload({ stu, user, goal: g })); toast('과제분석 기록지 Word 파일을 내려받았어요.', 'success'); });
        return;
      }
      // ── BIP (BipPage onPrintBIP) ──
      case 'bip.print':
        if (!bipHasContent(curStuData?.bip)) { toast('BIP 내용을 먼저 작성해주세요.'); return; }
        printBIP(bipPrintPayload({ stu, user, bip: curStuData?.bip }));
        return;
      // ── 결과 보고서 (EvalPage → EvalReportModal) ──
      case 'eval.report':
        setEvalRefs(null);
        setEvalStep('drawing');
        return;
      // ── 가정 통신문 ──
      case 'letter.write':
        setLetterOpen(true);
        return;
      case 'letter.reprint': {
        const ls = curStuData?.letters || [];
        const l = ls.find((x) => String(x.id) === String(letterId)) || ls[0];
        if (!l) { toast('저장된 통신문이 없어요 — ‘쓰기 · 인쇄 창 열기’로 먼저 써 주세요.'); return; }
        printFamilyLetter(letterPrintPayload({ stu, user, letter: l }));
        return;
      }
      // ── 행동 계약서 (ContractPage) ──
      case 'contract.open':
        onNavigate('contract');
        return;
      case 'contract.blankPrint':
        printBehaviorContract(contractBlankPayload({ stu, user }));
        return;
      case 'contract.blankWord':
        await wrap(async () => { await downloadContractDocx(contractBlankPayload({ stu, user })); toast('Word(.docx) 문서로 내려받았습니다.'); });
        return;
      // ── 위기 시나리오 (CrisisPage printSaved) ──
      case 'crisis.print': {
        const cs = curStuData?.crisis || [];
        const r = cs.find((x) => String(x.id) === String(crisisId)) || cs[0];
        if (!r) { toast('저장된 위기 시나리오가 없어요 — 위기 대처 화면에서 만든 뒤 💾 저장해 주세요.'); return; }
        printCrisisScenario(crisisPrintPayload({ stu, user, record: r }));
        return;
      }
      case 'crisis.open':
        onNavigate('crisis');
        return;
      // ── Tier 3 통합 문서 (Tier3Page onExportTier3) ──
      case 'tier3.word':
        await wrap(async () => {
          const data = curStuData;
          let gs = [];
          try { const d = await fetchIEP(curStuId); gs = activeGoals(d.goals); } catch (_) { /* IEP 미작성 가능 */ }
          const { linkage } = await buildFullStudentContext({ student: stu, studentId: curStuId, data, tier2Groups, semester: curSemester });
          downloadTier3Doc(tier3Payload({ stu, user, goals: gs, data, linkage }));
          toast('Tier 3 통합 문서(Word)를 생성했어요.', 'success');
        });
        return;
      // ── QABF 엑셀 (QabfPage ⬇ 엑셀) — 그래프를 화면 밖에 그린 뒤 ──
      case 'qabf.excel':
        setBusyKey(key);
        setQabfRun((n) => n + 1);
        return;
      case 'dpr.open':
        onNavigate('#class/cico');
        return;
      case 'aac.open':
        onNavigate('#docs/generator');
        toast('문서 초안 화면에서 ‘AAC 의사소통 카드’를 누르세요.');
        return;
      default:
        toast('아직 연결되지 않은 출력이에요: ' + key);
    }
  }, [curStu, curStuId, curStuData, user, goals, goalsErr, year, sem, taskGoalId, letterId, crisisId, tier2Groups, curSemester, onNavigate, toast]);

  const onQabfChart = useCallback(async (canvas) => {
    try {
      await downloadQabfExcel(qabfSaved(curStuData), curStu, canvas);
      toast('QABF 엑셀(.xlsx)을 내려받았어요 — 그래프 포함.', 'success');
    } catch (e) { toast('엑셀 생성 실패: ' + e.message); }
    finally { setBusyKey(''); setQabfRun(0); }
  }, [curStuData, curStu, toast]);

  // ── 1 학생 ──
  const head = mode === 'hub' ? (
    <div className="kb-stack" style={{ gap: 10 }}>
      {students.length === 0
        ? <p className="kb-muted">이 학급에 학생이 없어요. 오늘 화면에서 학생을 먼저 추가해 주세요.</p>
        : <StudentPills students={students} cur={curStuId} onPick={(sid) => { if (sid !== curStuId) selectStudent(sid).catch(() => {}); }} />}
    </div>
  ) : null;

  if (!curStu) {
    return (
      <div className="kb-stack">
        {head}
        {students.length > 0 && <p className="kb-muted">문서를 만들 학생을 골라 주세요.</p>}
      </div>
    );
  }
  if (!ready) {
    // 1102(mds/57 #1): 학생 자료 받기가 실패했으면 '불러오는 중…'에 멈추지 않고 다시 시도 단추.
    const dataErr = studentDataErrors && studentDataErrors[curStuId];
    if (dataErr) {
      return (
        <div className="kb-stack">
          {head}
          <div className="kb-strip kb-err" role="alert">
            <div>학생 자료를 불러오지 못했어요({dataErr}). 잠시 뒤 다시 시도해 주세요.</div>
            <div className="kb-go"><button type="button" className="kb-btn" onClick={() => selectStudent(curStuId).catch(() => {})}>다시 시도</button></div>
          </div>
        </div>
      );
    }
    return <div className="kb-stack">{head}<div className="kb-loading">학생 자료를 불러오는 중…</div></div>;
  }

  const d = curStuData || {};
  const all = goals || [];
  const years = iepYears(all, curYearNow());
  const iepList = iepFilter(all, { year, sem });
  const tg = taskGoals(all);
  const letters = d.letters || [];
  const crises = d.crisis || [];
  const mon = d.mon || [];
  const qabfN = (d.qabf || []).filter((v) => v >= 0 || v === -2).length;

  const cards = {
    iep: (
      <DocCard
        key="iep" kind="iep" busyKey={busyKey} onRun={run}
        status={goalsErr ? <Dot tone="rose">목표를 불러오지 못했어요 — 새로고침해 주세요</Dot> : goals == null ? <Dot tone="blue">목표 불러오는 중</Dot> : all.length ? <Dot tone="green">저장된 목표 {all.length}개 · 고른 기간 {iepList.length}개</Dot> : <Dot tone="rose">아직 저장된 목표 없음</Dot>}
      >
        <div className="kb-q-row">
          <label className="kb-q-field">
            <span className="kb-q-lb">학년도 (나이스 Word·복사)</span>
            <select className="kb-q-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              <option value={0}>전체 학년도</option>
              {years.map((y) => <option key={y} value={y}>{y}학년도</option>)}
            </select>
          </label>
          <label className="kb-q-field">
            <span className="kb-q-lb">학기</span>
            <select className="kb-q-input" value={sem} onChange={(e) => setSem(e.target.value)}>
              <option value="">전체 학기</option>
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
        </div>
        {tg.length > 1 && (
          <label className="kb-q-field">
            <span className="kb-q-lb">과제분석 기록지 — 어느 목표</span>
            <select className="kb-q-input" value={taskGoalId || tg[0].id} onChange={(e) => setTaskGoalId(e.target.value)}>
              {tg.map((g) => <option key={g.id} value={g.id}>{g.subject ? `[${g.subject}] ` : ''}{(g.semester_goal || '').slice(0, 40)}</option>)}
            </select>
          </label>
        )}
      </DocCard>
    ),
    bip: (
      <DocCard key="bip" kind="bip" busyKey={busyKey} onRun={run}
        status={bipHasContent(d.bip) ? <Dot tone="green">작성됨</Dot> : <Dot tone="rose">아직 안 씀 — 이유·계획 탭에서</Dot>} />
    ),
    eval: (
      <DocCard key="eval" kind="eval" busyKey={evalStep === 'drawing' ? 'eval.report' : busyKey} onRun={run}
        status={mon.length ? <Dot tone="green">행동 기록 {mon.length}건</Dot> : <Dot tone="amber">행동 기록이 없어 그래프가 비어요</Dot>} />
    ),
    letter: (
      <DocCard key="letter" kind="letter" busyKey={busyKey} onRun={run}
        status={letters.length ? <Dot tone="green">저장된 통신문 {letters.length}건</Dot> : <Dot tone="blue">저장된 통신문 없음</Dot>}
      >
        {letters.length > 1 && (
          <label className="kb-q-field">
            <span className="kb-q-lb">다시 인쇄할 통신문</span>
            <select className="kb-q-input" value={letterId || letters[0].id} onChange={(e) => setLetterId(e.target.value)}>
              {letters.map((l) => <option key={l.id} value={l.id}>{(l.created_at || '').slice(0, 10)} · {l.category || ''} {l.subject ? `· ${l.subject}` : ''}</option>)}
            </select>
          </label>
        )}
      </DocCard>
    ),
    contract: <DocCard key="contract" kind="contract" busyKey={busyKey} onRun={run} status={<Dot tone="blue">내용은 저장되지 않는 양식</Dot>} />,
    crisis: (
      <DocCard key="crisis" kind="crisis" busyKey={busyKey} onRun={run}
        status={crises.length ? <Dot tone="green">저장된 시나리오 {crises.length}건</Dot> : <Dot tone="blue">저장된 시나리오 없음</Dot>}
      >
        {crises.length > 1 && (
          <label className="kb-q-field">
            <span className="kb-q-lb">인쇄할 시나리오</span>
            <select className="kb-q-input" value={crisisId || crises[0].id} onChange={(e) => setCrisisId(e.target.value)}>
              {crises.map((r) => <option key={r.id} value={r.id}>{(r.created_at || '').slice(0, 16)} · {(r.situation || '').slice(0, 24)}</option>)}
            </select>
          </label>
        )}
      </DocCard>
    ),
    tier3: <DocCard key="tier3" kind="tier3" busyKey={busyKey} onRun={run} status={<Dot tone="blue">있는 자료만 모아요</Dot>} />,
    qabf: (
      <DocCard key="qabf" kind="qabf" busyKey={busyKey} onRun={run}
        status={qabfN ? <Dot tone={qabfN >= 25 ? 'green' : 'amber'}>{qabfN}/25 문항 답함</Dot> : <Dot tone="rose">아직 안 답함</Dot>} />
    ),
    dpr: <DocCard key="dpr" kind="dpr" busyKey={busyKey} onRun={run} />,
    aac: <DocCard key="aac" kind="aac" busyKey={busyKey} onRun={run} />,
  };

  return (
    <div className="kb-stack">
      {head}
      {/* 1102(mds/57 #18): 제목 순서 h1 → h2 → h3(문서 카드) — 굵은 글자를 h2로(모양은 그대로) */}
      <h2 className="kb-muted kb-h2-plain">{mode === 'hub' ? '2 문서 종류와 내보내기 방식' : `${curStu.code} 학생의 문서 — 종류를 보고 내보내기 방식을 누르세요`}</h2>
      <p className="kb-small">각 화면 안의 출력 단추(Word·인쇄·복사)는 그대로 있어요. 여기는 한곳에서 모아 내보내는 입구예요. 인쇄 창이 안 뜨면 주소창 오른쪽의 팝업 차단을 풀어 주세요.</p>
      <div className="kb-docs">{MAIN.map((k) => cards[k])}</div>
      <button type="button" className="kb-fold" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} data-tour="doc-more">
        <span>더 보기 5가지 — 행동 계약서 · 위기 시나리오 · 이유 질문지(QABF) 엑셀 · 매일 점검표 카드 · AAC 카드</span>
        <span className="kb-go">{moreOpen ? '접기 ▾' : '펼치기 ▸'}</span>
      </button>
      {moreOpen && <div className="kb-docs">{MORE.map((k) => cards[k])}</div>}

      {/* 결과 보고서: 그래프를 화면 밖에 그린 뒤 그래프 탭과 같은 창을 연다 */}
      {evalStep && (
        <OffscreenCharts
          key={'oc-' + curStuId}
          onReady={(refs, done) => {
            setEvalRefs(refs);
            setEvalStep('open');
            if (!done) toast('그래프 일부를 그리지 못했어요 — 보고서에서 빈 그림이 보이면 그래프·평가 탭에서 만들어 주세요.');
          }}
        />
      )}
      <EvalReportModal
        open={evalStep === 'open'}
        onClose={() => { setEvalStep(''); setEvalRefs(null); }}
        chartRefs={evalRefs || {}}
        effectSize={null}
        period={undefined}
      />
      {qabfRun > 0 && <OffscreenQabfChart key={'oq-' + qabfRun} responses={qabfSaved(curStuData)} onReady={onQabfChart} />}
      <FamilyLetterModal open={letterOpen} onClose={() => setLetterOpen(false)} />
    </div>
  );
}

export { DOC_KINDS };
