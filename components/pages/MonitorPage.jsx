import { useEffect, useMemo, useRef, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup } from '../ui/QChip';
import AIActionBar from '../ui/AIActionBar';
import PromptResultBlock from '../modals/PromptResultBlock';
import { createMonitor, updateMonitor, deleteMonitor as apiDelMon, createFidelity } from '../../lib/api/students';
import ObservationPeriodModal from '../modals/ObservationPeriodModal';
import NextStepBanner, { useSavedFlag } from '../ui/NextStepBanner';

const STD_BEHS = ['자리 이탈', '소리 지르기', '자해', '공격 행동', '거부', '회피', '반복 행동', '울기', '물건 던지기', '도주'];

export default function MonitorPage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const toast = useToast();
  const { call, status: llmStatus } = useLLM();

  // AI 추세 분석
  const [aiOutput, setAiOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [beh, setBeh] = useState('');
  const [freq, setFreq] = useState(0);
  const [dur, setDur] = useState(0);
  const [intensity, setIntensity] = useState(1);
  const [alt, setAlt] = useState('Y');
  const [altFreq, setAltFreq] = useState(0); // 0719: 대체행동 발생 빈도(문제행동과 분리)
  const [lat, setLat] = useState(0);
  const [dbr, setDbr] = useState(5);
  const [editingId, setEditingId] = useState(null); // 0719: 기록 목록에서 불러와 수정
  // 0819 피드백: 저장 성공 후 "다음 단계(결과 평가)로 이동" 배너 — 새 기록을 입력하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([date, beh, freq, dur, intensity, alt, altFreq, lat, dbr]);
  // 기본값은 A(기초선). 학생별로 한 번, 데이터가 있으면 가장 최근 기록의 단계를 이어받는다.
  const [phase, setPhase] = useState('A');
  const phaseInitedFor = useRef(null);

  const [fidPrev, setFidPrev] = useState(false);
  const [fidTeach, setFidTeach] = useState(false);
  const [fidReinf, setFidReinf] = useState(false);
  const [fidResp, setFidResp] = useState(false);

  const [busy, setBusy] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);

  // 학생을 처음 열 때(데이터 도착 후) 한 번만 적절한 단계로 초기화.
  useEffect(() => {
    if (!curStuId) return;
    const recs = curStuData?.mon;
    if (!recs) return; // 데이터 로딩 대기
    if (phaseInitedFor.current === curStuId) return;
    phaseInitedFor.current = curStuId;
    setPhase(recs.length ? (recs[0].phase || 'A') : 'A');
  }, [curStuId, curStuData?.mon]);

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
  // 서버 데이터 도착 전 입력 UI를 띄우지 않는다 — 로드 중 입력이 덮어써지는 것 방지.
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="행동 데이터를 불러오는 중…" /></>;

  const monRecords = curStuData?.mon || [];
  const todayFid = (curStuData?.fid || []).find((r) => r.date === date);

  async function onSaveMon() {
    if (!beh.trim()) { toast('대상 행동을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const body = { date, beh, freq: +freq, dur: +dur, int: +intensity, alt, alt_freq: +altFreq, lat: +lat, dbr: +dbr, phase };
      if (editingId) {
        // 0719: 기록 목록에서 불러온 항목 수정
        const res = await updateMonitor(curStuId, { ...body, id: editingId });
        updateStudentData(curStuId, (cur) => ({ ...cur, mon: cur.mon.map((r) => (r.id === editingId ? res.record : r)) }));
        setEditingId(null);
        toast('기록을 수정했어요.');
        markSaved();
      } else {
        const res = await createMonitor(curStuId, body);
        updateStudentData(curStuId, (cur) => ({ ...cur, mon: [res.record, ...cur.mon] }));
        toast('데이터 저장 완료');
        markSaved();
      }
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
    setPhase(r.phase || 'A');
    setTimeout(() => {
      const el = typeof document !== 'undefined' && document.getElementById('mon-form');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    toast(`${r.date} 기록을 불러왔어요. 수정 후 저장하세요.`);
  }
  function cancelEdit() {
    setEditingId(null);
    setBeh(''); setFreq(0); setDur(0); setIntensity(1); setAlt('Y'); setAltFreq(0); setLat(0); setDbr(5);
    setDate(new Date().toISOString().slice(0, 10));
  }

  async function onDeleteMon(id) {
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
    const fmt = (r) => `  - ${r.date} [${r.beh || '대상행동'}] 빈도 ${r.freq}회 · 지속 ${r.dur}분 · 강도 ${r.int}/5 · 대체행동수행 ${r.alt}${r.alt_freq ? `(${r.alt_freq}회)` : ''} · 지연 ${r.lat}분 · DBR ${r.dbr}/10`;
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
- A(기초선) 대비 B(중재) 단계의 추세를 요약 (빈도·지속·강도·대체행동·DBR 변화 중심)
- 문제행동이 개선되고 있는지(감소/유지/악화) 데이터 근거로 판단
- 구체적인 다음 단계 제안 — 현 중재를 (1) 그대로 지속, (2) 조정, (3) 강화/집중 중 무엇이 적절한지와 이유
- 한국어로, 특수교사가 바로 참고할 수 있게 작성`;
  }

  async function runTrend() {
    if (llmStatus !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
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

  async function onSaveFid() {
    setBusy(true);
    try {
      const flags = [fidPrev, fidTeach, fidReinf, fidResp];
      const score = flags.filter(Boolean).length;
      const items = flags.map((b) => (b ? '1' : '0')).join('');
      const res = await createFidelity(curStuId, { date, score, total: 4, items });
      // 같은 날짜 기록은 교체 (서버에서 upsert되므로 캐시도 중복 제거)
      updateStudentData(curStuId, (cur) => ({
        ...cur,
        fid: [res.record, ...cur.fid.filter((r) => r.date !== res.record.date)],
      }));
      toast(`충실도 ${score}/4 저장`);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <StuHero />

      {/* B3 Phase A/B 명시적 전환 + B4 관찰 기간 */}
      <div className="card" style={{ background: phase === 'A' ? '#fff5f5' : '#f0f7ff' }} data-tour="mon-phase">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>📍 현재 관찰 단계 (Phase)</div>
            <div className="card-subtitle">단일대상연구의 핵심 — <strong>A(기초선)</strong>는 중재 전 현재 수준, <strong>B(중재)</strong>는 BIP·전략을 <u>실제로 적용한 이후</u>의 데이터입니다. 두 단계를 명확히 구분해야 결과 차트가 의미를 가집니다.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setPeriodModalOpen(true)}>📍 새 관찰 기간 시작</button>
        </div>
        <div className="qchip-area" style={{ marginTop: 10 }} role="group" aria-label="관찰 단계 선택">
          <span
            className={'qchip' + (phase === 'A' ? ' on' : '')}
            role="button" tabIndex={0} aria-pressed={phase === 'A'}
            onClick={() => setPhase('A')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPhase('A'); } }}
            style={phase === 'A' ? { background: 'var(--err)', borderColor: 'var(--err)', color: '#fff' } : { borderColor: 'var(--err)', color: 'var(--err)' }}
          >📊 A · 기초선 (중재 전)</span>
          <span
            className={'qchip' + (phase === 'B' ? ' on' : '')}
            role="button" tabIndex={0} aria-pressed={phase === 'B'}
            onClick={() => setPhase('B')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPhase('B'); } }}
            style={phase === 'B' ? { background: 'var(--pri)', borderColor: 'var(--pri)', color: '#fff' } : { borderColor: 'var(--pri)', color: 'var(--pri)' }}
          >🎯 B · 중재 (전략 적용 후)</span>
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>
          현재 저장될 phase: <strong style={{ color: 'var(--pri)' }}>{phase}</strong> — 먼저 <strong>A(기초선)</strong>으로 중재 전 수준을 충분히 모은 뒤, BIP·중재 전략을 <strong>실제로 적용한 다음</strong> 그 효과 데이터를 <strong>B(중재)</strong>로 기록하세요. (B는 기초선이 아니라 전략 적용 이후의 수집 데이터입니다.)
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
      </div>
      <ObservationPeriodModal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} />

      <div className="card" id="mon-form">
        <div className="card-title">📝 일일 행동 데이터 기록
          {editingId && <span className="badge badge-purple" style={{ marginLeft: 8 }}>수정 중 · {date}</span>}
        </div>
        <div className="card-subtitle">CICO (Check-In/Check-Out) — 매일 행동 데이터를 기록합니다. <strong>기록 날짜</strong>는 행동을 관찰한 그 날짜로 적으세요(작성일과 달라도 됩니다).</div>
        <div className="form-group">
          <label className="form-label">기록 날짜 (행동을 관찰한 날)</label>
          <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
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
        <div style={{ border: '1px solid #b7e2c8', background: '#f0fbf4', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
          <div style={{ fontWeight: 700, color: '#0a7d4e', fontSize: '.88rem', marginBottom: 6 }}>🟢 대체행동 기록 (BIP에서 가르치는 바람직한 행동)</div>
          <div className="mon-grid">
            <div className="mon-field"><label>대체행동 수행</label><select value={alt} onChange={(e) => setAlt(e.target.value)}><option value="Y">예</option><option value="N">아니오</option></select></div>
            <div className="mon-field"><label>대체행동 발생 빈도 (횟수)</label><input type="number" min="0" value={altFreq} onChange={(e) => setAltFreq(e.target.value)} /></div>
            <div className="mon-field"><label>지연시간 (분)</label><input type="number" min="0" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: '.74rem', color: '#0a7d4e', opacity: 0.8, marginTop: 4 }}>지연시간 = 신호(선행사건) 후 대체행동을 하기까지 걸린 시간.</div>
        </div>
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
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
        {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {editingId && <button className="btn btn-ghost" onClick={cancelEdit}>취소 (새 기록으로)</button>}
          <button className="btn btn-pri" onClick={onSaveMon} disabled={busy}>{editingId ? '💾 수정 저장' : '💾 데이터 저장'}</button>
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
            <span style={{ marginLeft: 8, fontSize: '.72rem', fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-l)', padding: '2px 8px', borderRadius: 99 }}>
              {date} 저장됨 · {todayFid.score}/{todayFid.total}
            </span>
          )}
        </div>
        <div className="card-subtitle">오늘 BIP를 얼마나 충실하게 실행했는지 체크하세요. 같은 날 다시 저장하면 기존 기록이 갱신됩니다.</div>
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
              <li key={r.id} className="data-item" onClick={() => loadRecord(r)} title="누르면 이 기록을 불러와 수정"
                style={{ cursor: 'pointer', outline: editingId === r.id ? '2px solid var(--pri)' : 'none' }}>
                <button className="data-item-del" onClick={(e) => { e.stopPropagation(); onDeleteMon(r.id); }} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri" title="기록 해당일(관찰일)">📅 {r.date}</span>
                  <span className="data-item-date">{r.beh || ''} <span style={{ marginLeft: 8, padding: '2px 6px', background: r.phase === 'A' ? '#ffe3e3' : '#dbe8ff', borderRadius: 4, fontSize: '.7rem' }}>Phase {r.phase || 'B'}</span></span>
                </div>
                <div className="data-item-body">
                  문제행동 — 빈도:{r.freq}회 | 지속:{r.dur}분 | 강도:{r.int} · 대체행동 — 수행:{r.alt}{r.alt_freq ? ` | 빈도:${r.alt_freq}회` : ''} · DBR:{r.dbr}
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
