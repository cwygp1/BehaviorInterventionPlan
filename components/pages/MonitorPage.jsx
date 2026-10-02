import { useEffect, useMemo, useRef, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntryDate } from '../../lib/hooks/useEntryDate';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup } from '../ui/QChip';
import AIActionBar from '../ui/AIActionBar';
import PromptResultBlock from '../modals/PromptResultBlock';
import { createMonitor, updateMonitor, deleteMonitor as apiDelMon, createFidelity } from '../../lib/api/students';
import ObservationPeriodModal from '../modals/ObservationPeriodModal';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import TeachingRecordPanel from '../student/TeachingRecordPanel';
import DesignPicker from '../student/DesignPicker';
import StageTabs from '../student/StageTabs';
import { stageTabsFor, criterionStageTabs, atdStageTabs, atdTabIndexOfRecord, runIndexOfRecord, suggestsABAB, normalizeDesign, designTitle } from '../../lib/scedDesigns';
import { ccConfig, atdConfig, criterionWarning, METRICS } from '../../lib/utils/scedChart';
import { escortSignal } from '../../lib/escortSignal';

import { STD_BEHS } from '../../lib/chartCatalog'; // 칩 단일 출처(1001, 사용자 차트와 공유)

export default function MonitorPage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const toast = useToast();
  const { call, status: llmStatus } = useLLM();

  // AI 추세 분석
  const [aiOutput, setAiOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const entryDate = useEntryDate('monitor'); // 기록 달력에서 고른 날짜(mds/33)
  const [date, setDate] = useState(() => entryDate || new Date().toISOString().slice(0, 10));
  const [beh, setBeh] = useState('');
  const [freq, setFreq] = useState(0);
  const [dur, setDur] = useState(0);
  const [intensity, setIntensity] = useState(1);
  const [alt, setAlt] = useState('Y');
  const [altFreq, setAltFreq] = useState(0); // 0719: 대체행동 발생 빈도(문제행동과 분리)
  const [lat, setLat] = useState(0);
  const [dbr, setDbr] = useState(5);
  // 1001(현장 엑셀·ChatGPT 분석): 학교에 있었던 시간(시간당 발생률용) + 그날 메모(배경사건·특이사항 — 그래프 위 표식).
  const [obsHours, setObsHours] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState(null); // 0719: 기록 목록에서 불러와 수정
  // 0819 피드백: 저장 성공 후 "다음 단계(결과 평가)로 이동" 배너 — 새 기록을 입력하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([date, beh, freq, dur, intensity, alt, altFreq, lat, dbr, obsHours, note]);
  // 1002(mds/47 ①): 단계는 A/B 칩이 아니라 '단계 탭'으로 고른다. 저장 값은 여전히 A/B.
  //   탭 목록·"지금 구간"은 저장된 기록을 날짜순 phaseRuns로 유도(작성 순서 recs[0]가 아님 — 과거 A를 뒤늦게 채워도 어긋나지 않게).
  const design = normalizeDesign(curStuData?.bip?.design);
  const tabDesign = design === 'ABAB' ? 'ABAB' : design === 'CC' ? 'CC' : design === 'ATD' ? 'ATD' : 'AB'; // 중다기초선 탭은 ④
  const [extraStages, setExtraStages] = useState(0); // '+ 단계'(ABABAB)
  // 1002 ②: 기준변경은 탭이 '기초선 → 기준1·10 → 기준2·7 → + 새 기준'(criterionRuns). 저장 값은 A/B + criterion 스냅숏.
  const cc = useMemo(() => ccConfig(curStuData?.bip?.design_cfg), [curStuData?.bip?.design_cfg]);
  // 1002 ③: 교대중재는 탭이 [기초선] + 조건 칩(모두 누를 수 있음, 가장 적게 쓴 조건에 '추천'). 저장 값은 phase(A/B) + condition.
  const atd = useMemo(() => atdConfig(curStuData?.bip?.design_cfg), [curStuData?.bip?.design_cfg]);
  const stage = useMemo(() => (tabDesign === 'CC' ? criterionStageTabs(curStuData?.mon || []) : tabDesign === 'ATD' ? atdStageTabs(curStuData?.mon || [], atd) : stageTabsFor(tabDesign, curStuData?.mon || [], { extra: extraStages })), [tabDesign, curStuData?.mon, extraStages, atd]);
  const [criterion, setCriterion] = useState(''); // 기준변경: 현재 기준값(글자 상태, 저장 때 숫자)
  const [stageIdx, setStageIdx] = useState(0);
  const [lockedStage, setLockedStage] = useState(null); // 수정 중: 그 기록이 속한 구간만 강조·나머지 잠금
  const phase = stage.tabs[stageIdx]?.phase || 'A';
  const stageNow = stage.tabs[stageIdx];
  const condition = tabDesign === 'ATD' ? (stageNow?.condition ?? '') : undefined; // 교대중재: 고른 탭의 조건(저장 body에 실림). 다른 설계는 안 보냄(기존 값 유지)
  const phaseInitedFor = useRef(null);
  // 기준변경: 탭을 고르면 기준값 칸을 맞춘다 — 지금 구간 탭이면 그 기준값, '+ 새 기준' 탭이면 비움(새 값 입력). 수정 중에는 기록 값 그대로.
  useEffect(() => {
    if (tabDesign !== 'CC' || lockedStage != null) return;
    const t = stage.tabs[stageIdx];
    if (!t) return;
    if (t.phase !== 'B') { setCriterion(''); return; }
    setCriterion(t.isNew ? '' : (t.criterion == null ? '' : String(t.criterion)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabDesign, stageIdx, stage.tabs, lockedStage]);

  const [fidPrev, setFidPrev] = useState(false);
  const [fidTeach, setFidTeach] = useState(false);
  const [fidReinf, setFidReinf] = useState(false);
  const [fidResp, setFidResp] = useState(false);

  const [busy, setBusy] = useState(false);
  // 0915(mds/31 · 갑 결정): 탭 2개 — 문제행동 데이터 | 교수 회기 기록. 메뉴는 늘리지 않는다.
  //   0916(mds/34 §15): 기록 형태가 늘어나 탭 이름에서 형태 목록을 뺐다(형태는 탭 안 칩에서 고른다).
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('kb_monitor_tab') || 'behavior'; } catch (_) { return 'behavior'; } });
  const pickTab = (t) => { setTab(t); try { sessionStorage.setItem('kb_monitor_tab', t); } catch (_) { /* 무시 */ } };
  const [periodModalOpen, setPeriodModalOpen] = useState(false);

  // 학생을 열 때·기록이 바뀔 때(저장·삭제 뒤) 단계 탭을 "지금 구간"으로 맞춘다. 수정 중에는 건드리지 않는다.
  useEffect(() => {
    if (!curStuId) return;
    if (!curStuData?.mon) return; // 데이터 로딩 대기
    if (phaseInitedFor.current !== curStuId) { phaseInitedFor.current = curStuId; setExtraStages(0); setLockedStage(null); }
    if (lockedStage != null) return;
    setStageIdx(stage.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curStuId, curStuData?.mon, stage.current]);

  const recentBehs = useMemo(() => {
    const cached = curStuData?.mon || [];
    return [...new Set(cached.map((r) => r.beh).filter(Boolean))];
  }, [curStuData]);

  const behOptions = useMemo(() => {
    const recentSet = new Set(recentBehs);
    const recentObjs = recentBehs.map((b) => ({ text: b, recent: true }));
    const stdObjs = STD_BEHS.filter((b) => !recentSet.has(b)).map((b) => ({ text: b, recent: false }));
    return [...recentObjs, ...stdObjs].slice(0, 12);
  }, [recentBehs]);

  // 오늘 날짜에 저장된 충실도를 체크박스에 복원 (어떤 항목을 체크했는지 items로 보관)
  useEffect(() => {
    const todays = (curStuData?.fid || []).find((r) => r.date === date);
    const it = todays?.items || '';
    setFidPrev(it[0] === '1');
    setFidTeach(it[1] === '1');
    setFidReinf(it[2] === '1');
    setFidResp(it[3] === '1');
  }, [curStuId, date, curStuData?.fid]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  const tabBar = (
    <div className="tabs" role="tablist" aria-label="행동 데이터 종류" data-help="mon-tabs">
      <button type="button" role="tab" className={'tab' + (tab === 'behavior' ? ' on' : '')} aria-selected={tab === 'behavior'} onClick={() => pickTab('behavior')}>🔴 문제행동 데이터</button>
      <button type="button" role="tab" className={'tab' + (tab === 'sessions' ? ' on' : '')} aria-selected={tab === 'sessions'} onClick={() => pickTab('sessions')}>🧩 교수 회기 기록</button>
    </div>
  );
  if (tab === 'sessions') return <><StuHero />{tabBar}<TeachingRecordPanel onNavigate={onNavigate} /></>;
  // 서버 데이터 도착 전 입력 UI를 띄우지 않는다 — 로드 중 입력이 덮어써지는 것 방지.
  if (!curStuDataLoaded) return <><StuHero />{tabBar}<FormLoading label="행동 데이터를 불러오는 중…" /></>;

  const monRecords = curStuData?.mon || [];
  const todayFid = (curStuData?.fid || []).find((r) => r.date === date);

  async function onSaveMon() {
    if (!beh.trim()) { toast('대상 행동을 입력해주세요.'); return; }
    if (tabDesign === 'ATD' && phase === 'B' && !condition) { toast('교대중재설계는 회기마다 "오늘 쓴 조건"을 골라야 해요. 조건이 없으면 위 ⚙ 조건 설정에서 먼저 정해 주세요.'); return; }
    if (tabDesign === 'CC' && phase === 'B') {
      if (criterion === '') { toast('기준변경설계는 중재 회기마다 "현재 기준값"이 필요해요.'); return; }
      const prevCrit = lockedStage != null ? null : [...stage.runs].reverse().find((r) => r.phase === 'B' && r.criterion != null && (stageNow?.isNew || r.criterion !== Number(criterion)))?.criterion ?? null;
      const warn = criterionWarning(stageNow?.isNew ? prevCrit : null, criterion, cc);
      if (warn && (warn.includes('0 이상') || !window.confirm(warn))) { if (warn.includes('0 이상')) toast(warn); return; }
    }
    setBusy(true);
    try {
      // criterion은 설계와 무관하게 항상 실어 보낸다(설계를 되돌려 칸이 숨어도 값이 지워지지 않게, §11-6). 기초선(A)에는 기준이 없다.
      const body = { date, beh, freq: +freq, dur: +dur, int: +intensity, alt, alt_freq: +altFreq, lat: +lat, dbr: +dbr, phase, obs_hours: obsHours === '' ? null : +obsHours, note: note.trim(), criterion: phase === 'A' || criterion === '' ? null : +criterion, ...(condition !== undefined ? { condition: phase === 'A' ? '' : condition } : {}) };
      if (editingId) {
        // 0719: 기록 목록에서 불러온 항목 수정
        const res = await updateMonitor(curStuId, { ...body, id: editingId });
        updateStudentData(curStuId, (cur) => ({ ...cur, mon: cur.mon.map((r) => (r.id === editingId ? res.record : r)) }));
        setEditingId(null); setLockedStage(null);
        toast('기록을 수정했어요.');
        markSaved(); hintNextStep('eval'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
      } else {
        const res = await createMonitor(curStuId, body);
        updateStudentData(curStuId, (cur) => ({ ...cur, mon: [res.record, ...cur.mon] }));
        // 0824 간결화④: 충실도 체크가 바뀌어 있으면 같은 날짜로 함께 저장 — 클릭 1번 절약.
        let withFid = false;
        if (fidDirty()) { try { await fidSaveCore(); withFid = true; } catch (_e) { /* 본 저장은 성공 — 조용히 넘어감 */ } }
        toast(withFid ? '데이터 저장 완료 (충실도 포함)' : '데이터 저장 완료');
        markSaved(); hintNextStep('eval'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
      }
      escortSignal('monitor-saved'); // 🧭 길잡이 '저장' 단계 끝(새 기록·수정 모두)
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  // 0719: 기록 목록 클릭 → 해당 기록을 입력 폼으로 불러와 수정 (날짜를 몰라도 찾아가짐).
  function loadRecord(r) {
    setEditingId(r.id);
    setDate(r.date || new Date().toISOString().slice(0, 10));
    setBeh(r.beh || '');
    setFreq(r.freq ?? 0); setDur(r.dur ?? 0); setIntensity(r.int ?? 1);
    setAlt(r.alt || 'N'); setAltFreq(r.alt_freq ?? 0); setLat(r.lat ?? 0); setDbr(r.dbr ?? 5);
    setObsHours(r.obs_hours == null ? '' : String(r.obs_hours)); setNote(r.note || '');
    setCriterion(r.criterion == null ? '' : String(r.criterion));
    // 수정 중에는 그 기록이 속한 구간 탭만 강조하고 나머지는 잠근다(단계가 바뀌지 않게).
    const ri = tabDesign === 'ATD' ? atdTabIndexOfRecord(stage.tabs, r) : runIndexOfRecord(stage.runs, stage.sorted, r);
    if (ri >= 0) { setStageIdx(ri); setLockedStage(ri); } else { setLockedStage(null); }
    setTimeout(() => {
      const el = typeof document !== 'undefined' && document.getElementById('mon-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    toast(`${r.date} 기록을 불러왔어요. 수정 후 저장하세요.`);
  }
  function cancelEdit() {
    setEditingId(null);
    setBeh(''); setFreq(0); setDur(0); setIntensity(1); setAlt('Y'); setAltFreq(0); setLat(0); setDbr(5);
    setObsHours(''); setNote(''); setCriterion('');
    setDate(new Date().toISOString().slice(0, 10));
    setLockedStage(null); setStageIdx(stage.current); // 취소 → 지금 구간으로
  }

  // 0824 퀵윈⑦: 매일 반복 입력 단축 — 최근 기록 값으로 폼을 채우되
  // 날짜는 오늘, 새 기록으로 저장(수정 아님). 수치만 고치고 Enter로 끝.
  function prefillFromLatest() {
    const r = monRecords[0];
    if (!r) { toast('아직 저장된 기록이 없어요. 첫 기록은 직접 입력해 주세요.'); return; }
    setEditingId(null); // 새 기록으로
    setDate(new Date().toISOString().slice(0, 10));
    setBeh(r.beh || '');
    setFreq(r.freq ?? 0); setDur(r.dur ?? 0); setIntensity(r.int ?? 1);
    setAlt(r.alt || 'N'); setAltFreq(r.alt_freq ?? 0); setLat(r.lat ?? 0); setDbr(r.dbr ?? 5);
    setObsHours(r.obs_hours == null ? '' : String(r.obs_hours)); setNote(''); // 메모는 그날의 일이라 비운다
    setCriterion(r.criterion == null ? '' : String(r.criterion)); // 기준값도 같게(글자 그대로 '같게', §11-3)
    setLockedStage(null);
    if (tabDesign === 'ATD') { const ti = atdTabIndexOfRecord(stage.tabs, r); setStageIdx(ti >= 0 ? ti : stage.current); } // 조건도 같게
    else setStageIdx(stage.current); // 단계는 지금 구간(날짜순)으로
    toast(`최근 기록(${r.date})과 같게 채웠어요 — 오늘 수치만 고치고 저장(Enter)하세요.`);
  }

  // Enter로 저장 — 폼 카드 안 어디서든(텍스트영역·셀렉트 제외) Enter 한 번이면 저장.
  function onFormKeyDown(e) {
    if (e.key !== 'Enter' || busy) return;
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    e.preventDefault();
    onSaveMon();
  }

  async function onDeleteMon(id) {
    // 0923: 확인 없이 바로 지워지던 것 — 삭제 전에 한 번 묻는다(되돌릴 수 없음).
    const r = monRecords.find((x) => x.id === id);
    const label = r ? [r.date, r.beh].filter(Boolean).join(' · ') : '';
    if (!window.confirm(`이 행동 데이터 기록${label ? `(${label})` : ''}을 삭제할까요?\n지운 기록은 되돌릴 수 없어요.`)) return;
    try {
      await apiDelMon(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, mon: cur.mon.filter((r) => r.id !== id) }));
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  // A(기초선) vs B(중재) 데이터를 비식별 텍스트로 정리해 추세 분석 프롬프트를 만든다.
  // 학생 이름 등 PII는 절대 포함하지 않고 학생 코드만 사용한다.
  function buildTrendPrompt() {
    const recs = (curStuData?.mon || []);
    const fmt = (r) => `  - ${r.date} [${r.beh || '대상행동'}] 빈도 ${r.freq}회${r.obs_hours ? ` (관찰 ${r.obs_hours}시간 → 시간당 ${(r.freq / r.obs_hours).toFixed(1)}회)` : ''} · 지속 ${r.dur}분 · 강도 ${r.int}/5 · 대체행동수행 ${r.alt}${r.alt_freq ? `(${r.alt_freq}회)` : ''} · 지연 ${r.lat}분 · DBR ${r.dbr}/10${r.criterion != null && r.criterion !== '' ? ` · 기준 ${r.criterion}` : ''}${r.condition ? ` · 조건 ${r.condition}` : ''}${r.note ? ` · 메모: ${r.note}` : ''}`;
    // 오래된→최근 순으로 정렬해 추세를 읽기 쉽게.
    const ordered = [...recs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const phaseA = ordered.filter((r) => (r.phase || 'B') === 'A');
    const phaseB = ordered.filter((r) => (r.phase || 'B') === 'B');
    const aText = phaseA.length ? phaseA.map(fmt).join('\n') : '  (기초선 데이터 없음)';
    const bText = phaseB.length ? phaseB.map(fmt).join('\n') : '  (중재 데이터 없음)';
    return `당신은 단일대상연구 데이터를 해석하는 PBS(긍정적 행동지원) 컨설턴트입니다.

## 대상 (비식별)
- 학생 코드: ${curStu?.code || '미상'}

## A · 기초선 (중재 전) — ${phaseA.length}건
${aText}

## B · 중재 (전략 적용 후) — ${phaseB.length}건
${bText}

## 분석 요구
- A(기초선) 대비 B(중재) 단계의 추세를 요약 (빈도·지속·강도·대체행동·DBR 변화 중심. 관찰 시간이 있으면 빈도 대신 시간당 발생률로 비교)
- 메모(수면·몸 상태·날씨 같은 배경사건)가 있는 날의 수치 변화를 따로 짚어 중재 효과와 구분${design === 'ATD' ? `\n- 이 학생은 교대중재설계(조건: ${atd.conditions.map((c) => c.name).join(' · ')}${atd.control ? ' · 무중재' : ''}). 중재(B) 기록의 '조건'별로 묶어 조건 간 수준 차이와 분리 정도(겹침)로 어느 조건이 나은지 판단. 조건 간 비교에는 PND 대신 평균 차·Tau-U를 써라` : ''}${design === 'CC' ? `\n- 이 학생은 기준변경설계(기준 지표: ${METRICS[cc.metric]?.label || cc.metric}, ${cc.direction === 'up' ? '늘리기' : '줄이기'}). 구간마다 '기준 N'이 적혀 있으니 기준을 바꿀 때 행동이 따라왔는지(기준 근처에 머물렀는지)로 판단` : ''}
- 문제행동이 개선되고 있는지(감소/유지/악화) 데이터 근거로 판단
- 구체적인 다음 단계 제안 — 현 중재를 (1) 그대로 지속, (2) 조정, (3) 강화/집중 중 무엇이 적절한지와 이유
- 한국어로, 특수교사가 바로 참고할 수 있게 작성`;
  }

  async function runTrend() {
    if (llmStatus !== 'on') { toast('AI가 지금 꺼져 있어요. 직접 쓰기는 그대로 돼요 — 연결은 관리자에게 알려 주세요.'); return; }
    if (!(curStuData?.mon || []).length) { toast('분석할 행동 데이터가 없습니다.'); return; }
    setAiBusy(true); setAiOutput('');
    try {
      const reply = await call(buildTrendPrompt(), { tier: 'quality', label: '행동 추세 분석' });
      setAiOutput(reply);
    } catch (e) {
      toast('AI 호출 실패: ' + e.message, 'error');
    } finally {
      setAiBusy(false);
    }
  }

  // 충실도 체크 상태가 저장본과 다른가 — 데이터 저장 시 함께 저장할지 판단(0824 간결화④).
  function fidDirty() {
    const items = [fidPrev, fidTeach, fidReinf, fidResp].map((b) => (b ? '1' : '0')).join('');
    if (!todayFid) return items !== '0000'; // 저장본 없음 → 하나라도 체크했을 때만
    return (todayFid.items || '0000') !== items;
  }

  async function fidSaveCore() {
    const flags = [fidPrev, fidTeach, fidReinf, fidResp];
    const score = flags.filter(Boolean).length;
    const items = flags.map((b) => (b ? '1' : '0')).join('');
    const res = await createFidelity(curStuId, { date, score, total: 4, items });
    // 같은 날짜 기록은 교체 (서버에서 upsert되므로 캐시도 중복 제거)
    updateStudentData(curStuId, (cur) => ({
      ...cur,
      fid: [res.record, ...cur.fid.filter((r) => r.date !== res.record.date)],
    }));
    return score;
  }

  async function onSaveFid() {
    setBusy(true);
    try {
      const score = await fidSaveCore();
      toast(`충실도 ${score}/4 저장`);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <StuHero />
      {tabBar}

      {/* B3 Phase A/B 명시적 전환 + B4 관찰 기간 */}
      <div className="card" style={{ background: phase === 'A' ? '#fff5f5' : '#f0f7ff' }} data-tour="mon-phase">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>📍 현재 관찰 단계 (Phase)</div>
            <div className="card-subtitle">단일대상연구의 핵심 — <strong>A(기초선)</strong>는 중재 전 현재 수준, <strong>B(중재)</strong>는 BIP·전략을 <u>실제로 적용한 이후</u>의 데이터입니다. 두 단계를 명확히 구분해야 결과 차트가 의미를 가집니다.</div>
          </div>
        </div>
        {/* 1002(mds/47 ①): 설계 고르기(접힘) + 단계 탭. 저장 값은 A/B, 탭 이름·번호는 날짜순 구간에서 유도. */}
        <div style={{ marginTop: 10 }}><DesignPicker /></div>
        <StageTabs
          tabs={stage.tabs}
          selected={stageIdx}
          lockedIndex={lockedStage}
          onPick={(i) => setStageIdx(i)}
          onAddStage={tabDesign === 'ABAB' && stage.tabs.length <= stage.runs.length ? () => setExtraStages((n) => n + 1) : undefined}
        />
        {suggestsABAB(design, stage.runs) && (
          <div style={{ marginTop: 8, fontSize: '.8rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }} data-tour="mon-abab-suggest">
            중재를 멈춘 구간이 보여요(기초선 → 중재 → 다시 기초선). 위 "설계: 바꾸기"에서 <strong>ABAB(반전설계)</strong>로 바꾸면 철회·재개 단계 이름이 붙어요.
          </div>
        )}
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>
          {lockedStage != null
            ? <>수정 중인 기록은 <strong style={{ color: 'var(--pri)' }}>{stageNow?.label}({stageNow?.short})</strong> 구간이에요. 단계는 바꿀 수 없고, 날짜를 바꾸면 그 날짜의 구간으로 들어가요.</>
            : <>지금 저장하면 <strong style={{ color: 'var(--pri)' }}>{stageNow?.label} ({stageNow?.short ? `${stageNow.short} · ` : ''}{phase === 'A' ? '기초선' : tabDesign === 'ATD' ? '조건 · 중재' : '중재'})</strong>{stageNow?.state === 'next' ? ' — 새 단계로 넘어가요' : ''}. {tabDesign === 'ABAB' ? '중재를 잠깐 멈출 때는 "중재 철회" 탭을 눌러요. 하루 빠진 날은 메모에 적어요.' : tabDesign === 'CC' ? '기준을 바꿀 때는 "+ 새 기준" 탭을 누르고 새 기준값을 적어요. 같은 기준이면 지금 구간 탭 그대로 저장해요.' : tabDesign === 'ATD' ? `오늘 쓴 교수법(조건)을 고르세요. 번갈아 쓰는 게 핵심이에요${stage.suggested ? ` — 가장 적게 쓴 "${stage.suggested}"을(를) 권해요` : ''}.` : '먼저 기초선으로 중재 전 수준을 충분히 모은 뒤, BIP 전략을 실제로 적용한 다음 "중재" 탭으로 넘어가요.'}</>}
          {curStuData?.periods?.length > 0 && (() => {
            const active = curStuData.periods.find((p) => !p.end_date);
            if (active) {
              return (
                <span style={{ marginLeft: 6, padding: '2px 8px', background: 'var(--pri-soft)', borderRadius: 4, color: 'var(--pri)', fontSize: '.74rem' }}>
                  현재 기간: {active.tier === 'baseline' ? '기초선' : active.tier} ({active.start_date}~)
                </span>
              );
            }
            return null;
          })()}
        </p>
        {/* 더 보기(0914 P0): 새 관찰 기간 시작·이력은 접어 두고, 현재 기간 배지는 위에 항상 표시 */}
        <details className="fold-inline" style={{ marginTop: 10 }} data-tour="mon-periods">
          <summary>🗓 관찰 기간 이력 · 새 기간 시작</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.8rem' }}>
            {(curStuData?.periods || []).length === 0 && <span style={{ color: 'var(--muted)' }}>아직 기록된 관찰 기간이 없어요. 기초선(A)부터 시작해 보세요.</span>}
            {(curStuData?.periods || []).map((p, i) => (
              <div key={p.id || `${p.start_date}-${i}`} data-help="mon-period-row">
                <strong>{p.tier === 'baseline' ? '기초선' : p.tier}</strong> · {p.start_date} ~ {p.end_date || '진행 중'}
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setPeriodModalOpen(true)} style={{ alignSelf: 'flex-start' }}>📍 새 관찰 기간 시작</button>
          </div>
        </details>
      </div>
      <ObservationPeriodModal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} />

      <div className="card" id="mon-form" data-help="mon-form" onKeyDown={onFormKeyDown}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          📝 일일 행동 데이터 기록
          {editingId && <span className="badge badge-purple">수정 중 · {date}</span>}
          {!editingId && monRecords.length > 0 && (
            <button className="btn btn-ghost btn-sm" data-help="mon-prefill" onClick={prefillFromLatest} title="최근 기록의 값으로 채우고 날짜만 오늘로 — 수치만 고쳐 저장하세요">
              ↻ 최근 기록과 같게
            </button>
          )}
        </div>
        <div className="card-subtitle">매일 행동 데이터를 기록합니다. <strong>기록 날짜</strong>는 행동을 관찰한 그 날짜로 적으세요(작성일과 달라도 됩니다). 숫자 칸에서 <strong>Enter</strong>를 누르면 바로 저장돼요.</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">기록 날짜 (행동을 관찰한 날)</label>
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group" data-help="mon-hours">
            <label className="form-label">학교에 있었던 시간 (시간 · 선택)</label>
            <input type="number" className="form-input" min="0" max="12" step="0.5" placeholder="예: 6 (조퇴한 날은 짧게)" value={obsHours} onChange={(e) => setObsHours(e.target.value)} />
          </div>
        </div>
        {tabDesign === 'CC' && phase === 'B' && (
          <div className="form-group" data-tour="mon-criterion" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 12px' }}>
            <label className="form-label" style={{ color: '#5b21b6' }}>🎯 현재 기준값 ({METRICS[cc.metric]?.label || cc.metric} · {cc.direction === 'up' ? '늘리기' : '줄이기'}){stageNow?.isNew ? ' — 새 기준' : ''}</label>
            <input type="number" className="form-input" min="0" step="any" value={criterion} onChange={(e) => setCriterion(e.target.value)} placeholder={stageNow?.isNew ? '새 기준값' : '이 구간의 기준값'} disabled={lockedStage != null && false} style={{ maxWidth: 200 }} />
            <div style={{ fontSize: '.74rem', color: '#6d28d9', marginTop: 4 }}>
              {stageNow?.isNew ? '이 값으로 새 구간이 시작돼요. 이전 기준과 방향이 다르거나 크게 바뀌면 한 번 물어봐요.' : '지금 구간의 기준이에요. 값을 바꿔 저장하면 그 날짜부터 새 구간이 돼요.'} 달성 판정: 연속 {cc.hitRuns}회기 · 근처 폭 {cc.nearPct}%.
            </div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">기록 대상 행동 (목표행동 = 줄이려는 문제행동)</label>
          <EditableChipGroup storageKey="mon_beh" defaults={behOptions} mode="set" target={beh} onChange={setBeh} />
          <input className="form-input" value={beh} onChange={(e) => setBeh(e.target.value)} />
        </div>
        {/* 0719 피드백: 문제행동 기록 칸과 대체행동 기록 칸을 시각적으로 분리 */}
        <div style={{ border: '1px solid #f4c2c2', background: '#fff5f5', borderRadius: 10, padding: '10px 12px', marginTop: 6 }}>
          <div style={{ fontWeight: 700, color: '#c43653', fontSize: '.88rem', marginBottom: 6 }}>🔴 목표행동(문제행동) 기록</div>
          <div className="mon-grid">
            <div className="mon-field"><label>발생 빈도 (횟수)</label><input type="number" min="0" value={freq} onChange={(e) => setFreq(e.target.value)} /></div>
            <div className="mon-field"><label>지속 시간 (분)</label><input type="number" min="0" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
            <div className="mon-field"><label>강도 (1~5)</label><input type="number" min="1" max="5" value={intensity} onChange={(e) => setIntensity(e.target.value)} /></div>
          </div>
        </div>
        <div data-help="mon-alt" style={{ border: '1px solid #b7e2c8', background: '#f0fbf4', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
          <div style={{ fontWeight: 700, color: '#0a7d4e', fontSize: '.88rem', marginBottom: 6 }}>🟢 대체행동 기록 (BIP에서 가르치는 바람직한 행동)</div>
          <div className="mon-grid">
            <div className="mon-field"><label>대체행동 수행</label><select value={alt} onChange={(e) => setAlt(e.target.value)}><option value="Y">예</option><option value="N">아니오</option></select></div>
            <div className="mon-field"><label>대체행동 발생 빈도 (횟수)</label><input type="number" min="0" value={altFreq} onChange={(e) => setAltFreq(e.target.value)} /></div>
            <div className="mon-field"><label>지연시간 (분)</label><input type="number" min="0" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: '.74rem', color: '#0a7d4e', opacity: 0.8, marginTop: 4 }}>지연시간 = 신호(선행사건) 후 대체행동을 하기까지 걸린 시간.</div>
        </div>
        <div data-help="mon-dbr" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: '.88rem', marginBottom: 6 }}>📏 하루 종합 평정</div>
          <div className="mon-grid">
            <div className="mon-field">
              <label>일일 행동 평정 DBR (0~10)</label>
              <input type="number" min="0" max="10" value={dbr} onChange={(e) => setDbr(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 4 }}>
            DBR(Daily Behavior Rating·일일 행동 평정) — 오늘 하루 행동 전반을 0(전혀 좋지 않음)~10(매우 좋음)으로 매기는 <strong>종합 점수</strong>예요. 강화(차별강화)가 아니라 평정 척도입니다.
          </div>
        </div>
        <div className="form-group" data-help="mon-note" style={{ marginTop: 8 }}>
          <label className="form-label">📝 그날 메모 (배경사건·특이사항 · 선택)</label>
          <input className="form-input" maxLength={300} placeholder="예: 새벽 3시 30분 기상 · 고열로 조퇴 · 폭발 1회" value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 4 }}>결과 평가 그래프의 그 날짜 점 위에 ▲로 표시돼요. 수면·몸 상태·날씨처럼 그날 수치를 설명하는 일을 적으세요.</div>
        </div>
        {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {editingId && <button className="btn btn-ghost" onClick={cancelEdit}>취소 (새 기록으로)</button>}
          <button className="btn btn-pri" data-help="mon-save" onClick={onSaveMon} disabled={busy}>{editingId ? '💾 수정 저장' : '💾 데이터 저장'}</button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('eval')}>✅ 결과 평가 →</button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ 행동 데이터 저장 완료"
          hint="데이터가 쌓였다면 오른쪽 버튼(결과 평가)에서 중재 효과를 그래프로 확인해보세요"
        />
      </div>

      <div className="card" data-tour="mon-fid">
        <div className="card-title">📋 BIP 실행 충실도 (오늘)
          {todayFid && (
            <span style={{ marginLeft: 8, fontSize: '.72rem', fontWeight: 700, color: 'var(--ok-t)', background: 'var(--ok-l)', padding: '2px 8px', borderRadius: 99 }}>
              {date} 저장됨 · {todayFid.score}/{todayFid.total}
            </span>
          )}
        </div>
        <div className="card-subtitle">오늘 BIP를 얼마나 충실하게 실행했는지 체크하세요. <strong>위의 [데이터 저장]을 누르면 함께 저장</strong>되고, 같은 날 다시 저장하면 기존 기록이 갱신됩니다.</div>
        {/* 0914(홍준표 부록): BIP 실행 역할분담표가 있으면 누가·언제 점검하는지 함께 보여준다(편집은 BIP 화면). */}
        {Array.isArray(curStuData?.bip?.roles) && curStuData.bip.roles.some((r) => r && String(r.task || r.owner || '').trim()) && (
          <div style={{ fontSize: '.78rem', color: 'var(--sub)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, lineHeight: 1.6 }}>
            🤝 <strong>역할분담(BIP)</strong> — {curStuData.bip.roles.filter((r) => r && String(r.task || r.owner || '').trim()).map((r) => `${r.task || '과제'}: ${r.owner || '담당 미정'}${r.check ? ` · 점검 ${r.check}` : ''}`).join(' / ')}
            <span style={{ color: 'var(--muted)' }}> · 아래 체크가 이 표의 점검 기록이 돼요</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidPrev} onChange={(e) => setFidPrev(e.target.checked)} /> 예방 전략 실행
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidTeach} onChange={(e) => setFidTeach(e.target.checked)} /> 교수 전략 실행
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidReinf} onChange={(e) => setFidReinf(e.target.checked)} /> 강화 제공
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidResp} onChange={(e) => setFidResp(e.target.checked)} /> 위기 절차 준수
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-ok btn-sm" onClick={onSaveFid} disabled={busy}>{todayFid ? '충실도 업데이트' : '충실도 저장'}</button>
        </div>
      </div>

      <div className="card" data-tour="mon-ai">
        <div className="card-title">✨ AI 추세 분석</div>
        <div className="card-subtitle">기초선(A)과 중재(B) 데이터를 비교해 행동 추세와 다음 단계(지속·조정·강화)를 제안합니다. (학생 코드만 사용 · 비식별)</div>
        <AIActionBar prompt={buildTrendPrompt()} onCallAI={runTrend} busy={aiBusy} callLabel="✨ AI 추세 분석" />
        {(aiOutput || aiBusy) && <PromptResultBlock prompt={buildTrendPrompt()} output={aiOutput} busy={aiBusy} onChange={setAiOutput} />}
      </div>

      <div className="card" data-tour="mon-list">
        <div className="card-title">📄 기록 목록 <span className="badge badge-pri">{monRecords.length}건</span></div>
        <div className="card-subtitle">앞의 날짜가 <strong>기록 해당일(관찰일)</strong>입니다. 항목을 누르면 위 입력 폼으로 불러와 바로 수정할 수 있어요.</div>
        {monRecords.length === 0 ? (
          <div className="empty-state"><span className="emoji">📄</span>기록된 데이터가 없습니다.</div>
        ) : (
          <ul className="data-list">
            {monRecords.slice().reverse().map((r) => (
              <li key={r.id} className="data-item" data-help="mon-row" onClick={() => loadRecord(r)} title="누르면 이 기록을 불러와 수정"
                style={{ cursor: 'pointer', outline: editingId === r.id ? '2px solid var(--pri)' : 'none' }}>
                <button className="data-item-del" onClick={(e) => { e.stopPropagation(); onDeleteMon(r.id); }} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri" title="기록 해당일(관찰일)">📅 {r.date}</span>
                  <span className="data-item-date">{r.beh || ''} <span style={{ marginLeft: 8, padding: '2px 6px', background: r.phase === 'A' ? '#ffe3e3' : '#dbe8ff', borderRadius: 4, fontSize: '.7rem' }}>Phase {r.phase || 'B'}</span>{r.criterion != null && r.criterion !== '' && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#ede9fe', color: '#5b21b6', borderRadius: 4, fontSize: '.7rem' }}>기준 {r.criterion}</span>}{r.condition && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#e0f2fe', color: '#075985', borderRadius: 4, fontSize: '.7rem' }}>조건 {r.condition}</span>}{design === 'ATD' && r.phase !== 'A' && !r.condition && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 4, fontSize: '.7rem' }}>조건 없음 — 불러와 조건 붙이기</span>}</span>
                </div>
                <div className="data-item-body">
                  문제행동 — 빈도:{r.freq}회{r.obs_hours ? ` (${r.obs_hours}시간 중)` : ''} | 지속:{r.dur}분 | 강도:{r.int} · 대체행동 — 수행:{r.alt}{r.alt_freq ? ` | 빈도:${r.alt_freq}회` : ''} · DBR:{r.dbr}
                  {r.note && <div style={{ marginTop: 2, color: '#92400e' }}>📝 {r.note}</div>}
                  <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>작성 {r.created_at || '-'}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); loadRecord(r); }}>✏ 불러와 수정</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
