import { useEffect, useRef, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import EvalPromptModal from '../modals/EvalPromptModal';
import EvalReportModal from '../modals/EvalReportModal';
import { pnd, pndInterpretation, tauU, tauUInterpretation } from '../../lib/utils/effectSize';
import QabfFnChart from '../ui/QabfFnChart';
import FoldCard from '../ui/FoldCard';
import { METRICS, availableMetrics, sortByDate, phaseRuns, runMean, phaseSeries, noteMarks, periodMarks, chartHeader, rangeOptions, filterByRange, semesterMarks, behaviorOptions, filterByBehavior, parseGoalLine, RANGE_ALL, BEH_ALL } from '../../lib/utils/scedChart';

const PHASE_COLOR = { A: '#ef476f', B: '#12b886' };

const FUNC_LABELS = ['관심', '회피', '자동·감각', '신체', '강화물'];
const FUNC_COLORS = ['#4f6bed', '#ef476f', '#12b886', '#9c36b5', '#f59f00'];

let chartLib = null;
async function loadChart() {
  if (chartLib) return chartLib;
  // Dynamic import — Chart.js is heavy and only needed on this page.
  const mod = await import('chart.js/auto');
  chartLib = mod.default;
  return chartLib;
}

function useChart(canvasRef, build, deps) {
  const instRef = useRef(null);
  useEffect(() => {
    let alive = true;
    loadChart().then((Chart) => {
      if (!alive || !canvasRef.current) return;
      if (instRef.current) instRef.current.destroy();
      instRef.current = new Chart(canvasRef.current, build());
    });
    return () => { alive = false; if (instRef.current) { instRef.current.destroy(); instRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function EvalPage() {
  const { curStu, curStuData } = useStudents();
  const [metric, setMetric] = useState('freq');
  // 1001 2차(교사 엑셀 반영): 행동 고르기(합산/행동별) · 기간 고르기(전체/학기) · 목표선(가로 기준선, 기기에 저장).
  const [behSel, setBehSel] = useState(BEH_ALL);
  const [range, setRange] = useState(RANGE_ALL);
  const goalKey = `kb_goal_line_${curStu?.id || 0}_${metric}`;
  const [goalInput, setGoalInput] = useState('');
  useEffect(() => { try { setGoalInput(localStorage.getItem(goalKey) || ''); } catch (_) { setGoalInput(''); } }, [goalKey]);
  const goalLine = parseGoalLine(goalInput);
  function onGoalChange(v) {
    setGoalInput(v);
    try { if (String(v).trim() === '') localStorage.removeItem(goalKey); else localStorage.setItem(goalKey, String(v)); } catch (_) { /* 저장 못 해도 그래프는 그린다 */ }
  }
  const [aiOpen, setAiOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [compA1, setCompA1] = useState('');
  const [compA2, setCompA2] = useState('');
  const [compB1, setCompB1] = useState('');
  const [compB2, setCompB2] = useState('');
  const [compResult, setCompResult] = useState(null);

  const radarRef = useRef(null);
  const behRef = useRef(null);
  const fidRef = useRef(null);
  const szDonutRef = useRef(null);
  const szBarRef = useRef(null);

  const qabf = curStuData?.qabf || new Array(25).fill(-1);
  const mon = curStuData?.mon || [];
  const fid = curStuData?.fid || [];
  const sz = curStuData?.sz || [];
  const hasQabf = qabf.some((v) => v >= 0);
  // 결과 보고서 직전에 접힌 차트를 모두 펼친다(0914 P0) — 캡처는 clip 접기라 원래 비지 않지만 안전망.
  const [forceAll, setForceAll] = useState(false);
  function openReport() {
    setForceAll(true);
    setTimeout(() => setReportOpen(true), 160);
  }

  // QABF Radar
  useChart(radarRef, () => {
    const sums = [0, 0, 0, 0, 0];
    qabf.forEach((v, i) => { if (v >= 0) sums[i % 5] += v; });
    return {
      type: 'radar',
      data: {
        labels: FUNC_LABELS,
        datasets: [{
          label: curStu?.code + ' QABF',
          data: sums,
          backgroundColor: 'rgba(79,107,237,.15)',
          borderColor: '#4f6bed',
          borderWidth: 2,
          pointBackgroundColor: FUNC_COLORS,
          pointRadius: 6,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { r: { beginAtZero: true, max: 15, ticks: { stepSize: 3 } } }, plugins: { legend: { display: false } } },
    };
  }, [qabf]);

  // 행동 변화 추이 — 단일대상설계(SCED) 그래프 관례로 다시 그림(1001, ChatGPT·현장 엑셀 분석 반영. 계산은 lib/utils/scedChart.js).
  //   · 직선 데이터 경로 + 둥근 점, 단계 경계를 넘어 선을 잇지 않음(ABAB도 자동으로 끊김)
  //   · 단계 변경선(실선) + 단계 이름을 구간 위 가운데에 — 범례·배경 음영·전체 폭 평균선은 뺐다
  //   · 평균 수준선은 그 단계 안에서만(점선), 메모(배경사건)는 점 위에 짧게, 관찰 기간 시작은 점선 구분선
  //   흐름: 날짜 정렬 → 기간 고르기 → 행동 고르기(합산이면 같은 날짜를 하나로) → 그래프.
  const allSorted = sortByDate(mon);
  const behChips = behaviorOptions(allSorted);
  const rangeChips = rangeOptions(allSorted);
  const sortedMon = filterByBehavior(filterByRange(allSorted, range), behChips.length ? behSel : BEH_ALL);
  const header = chartHeader(sortedMon);
  const notes = noteMarks(sortedMon);
  const metricChips = availableMetrics(sortedMon);
  const metricShort = Object.fromEntries(metricChips.map(([k, l]) => [k, l]));
  useChart(behRef, () => {
    const sorted = sortedMon;
    const labels = sorted.map((r) => (r.date || '').slice(5));
    const { a: baseData, b: intData } = phaseSeries(sorted, metric);
    const runs = phaseRuns(sorted);
    const means = runs.map((run) => runMean(sorted, run, metric));
    const marks = notes;
    const pMarks = periodMarks(sorted, curStuData?.periods);
    const sMarks = range === RANGE_ALL ? semesterMarks(sorted) : []; // 학기 구분선은 전체 보기에서만
    const goal = goalLine;

    // 단계 변경선·단계 이름·단계 안 평균선·메모·관찰 기간 구분선을 한 플러그인에서 그린다.
    const scedOverlay = {
      id: 'scedOverlay',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales: { x, y } } = chart;
        if (!chartArea || !x || !y || !labels.length) return;
        const { left, right, top, bottom } = chartArea;
        const px = (i) => x.getPixelForValue(i);
        const mid = (i, j) => (px(i) + px(j)) / 2;
        ctx.save();

        // ⓪ 학기 구분선(굵은 회색 점선) — 엑셀 '1학기/2학기' 행에 해당
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(71,85,105,.7)';
        ctx.lineWidth = 1.5;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = 'rgba(71,85,105,.95)';
        ctx.textAlign = 'left';
        sMarks.forEach((m) => {
          const bx = mid(m.index - 1, m.index);
          ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, bottom); ctx.stroke();
          ctx.fillText(m.label, bx + 4, top + 26);
        });

        // ① 관찰 기간 시작(점선, 회색) — 아래쪽에 짧은 이름
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(100,116,139,.55)';
        ctx.lineWidth = 1;
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(100,116,139,.9)';
        ctx.textAlign = 'left';
        pMarks.forEach((m) => {
          const bx = mid(m.index - 1, m.index);
          ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, bottom); ctx.stroke();
          if (m.label) ctx.fillText(m.label + ' 시작', bx + 4, bottom - 6);
        });

        // ② 단계 변경선(실선) + 단계 이름(구간 위 가운데) + 단계 안 평균선(점선)
        runs.forEach((run, k) => {
          const color = PHASE_COLOR[run.phase];
          if (k > 0) {
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(15,23,42,.65)';
            ctx.lineWidth = 1.5;
            const bx = mid(run.start - 1, run.start);
            ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, bottom); ctx.stroke();
          }
          const x0 = k === 0 ? left : mid(run.start - 1, run.start);
          const x1 = k === runs.length - 1 ? right : mid(run.end, run.end + 1);
          if (x1 - x0 > 36) {
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.fillText(run.label, (x0 + x1) / 2, top + 12);
          }
          const m = means[k];
          if (m != null && run.end > run.start) {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            const yy = y.getPixelForValue(m);
            ctx.beginPath(); ctx.moveTo(px(run.start), yy); ctx.lineTo(px(run.end), yy); ctx.stroke();
            ctx.setLineDash([]);
            // 라벨은 첫 두 점 사이 위에 — 점 위에 올라앉지 않는다.
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('평균 ' + (Math.round(m * 10) / 10), (px(run.start) + px(run.start + 1)) / 2, yy - 4);
          }
        });

        // ②-1 목표선(가로 기준선) — 엑셀 CCL 40 가로선. 기준변경설계의 기준선과 같은 자리.
        if (goal != null) {
          const gy = y.getPixelForValue(goal);
          if (gy >= top && gy <= bottom) {
            ctx.setLineDash([8, 4]);
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(right, gy); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#7c3aed';
            ctx.textAlign = 'right';
            ctx.fillText('목표 ' + goal, right - 4, gy - 4);
          }
        }

        // ③ 메모(배경사건·특이사항) — 점 위에 작은 표식과 짧은 글
        ctx.setLineDash([]);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        marks.forEach((m) => {
          const r = sorted[m.index];
          const v = (r.phase || 'A') === 'A' ? baseData[m.index] : intData[m.index];
          if (v == null) return;
          const cx = px(m.index);
          const cy = y.getPixelForValue(v) - 9;
          ctx.fillStyle = '#f59f00';
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy - 6); ctx.lineTo(cx + 4, cy - 6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#92400e';
          ctx.fillText(m.short, cx, cy - 9);
        });
        ctx.restore();
      },
    };

    const mkSet = (label, data, color) => ({
      label, data, borderColor: color, backgroundColor: color, pointBackgroundColor: color, pointBorderColor: '#fff',
      pointRadius: 4.5, pointHoverRadius: 6, borderWidth: 2, tension: 0, fill: false, spanGaps: false,
    });
    return {
      type: 'line',
      data: { labels, datasets: [mkSet('기초선 (A)', baseData, PHASE_COLOR.A), mkSet('중재 (B)', intData, PHASE_COLOR.B)] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => { const r = sorted[items[0]?.dataIndex]; return r ? `${r.date} · ${(r.phase || 'A') === 'A' ? '기초선(A)' : '중재(B)'}` : ''; },
              afterBody: (items) => {
                const r = sorted[items[0]?.dataIndex];
                if (!r) return [];
                const out = [];
                if (r.obs_hours) out.push(`관찰 시간 ${r.obs_hours}시간`);
                if (r.note) out.push(`메모: ${r.note}`);
                return out;
              },
            },
          },
        },
        scales: {
          y: { beginAtZero: true, grace: '15%', suggestedMax: goal != null ? goal : undefined, title: { display: true, text: METRICS[metric]?.label || '값' }, grid: { color: 'rgba(0,0,0,.06)' } }, // grace: 단계 이름이 맨 위 점과 겹치지 않게 머리 공간
          x: { title: { display: true, text: '회기 (관찰일)' }, grid: { display: false } },
        },
      },
      plugins: [scedOverlay],
    };
  }, [mon, metric, curStuData?.periods, behSel, range, goalLine]);

  useChart(fidRef, () => {
    const sorted = [...fid].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const labels = sorted.map((r) => (r.date || '').slice(5));
    const data = sorted.map((r) => Math.round((r.score / r.total) * 100));
    return {
      type: 'bar',
      data: { labels, datasets: [{ label: '충실도 %', data, backgroundColor: data.map((v) => v >= 75 ? '#12b886' : v >= 50 ? '#f59f00' : '#ef476f'), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } } } },
    };
  }, [fid]);

  useChart(szDonutRef, () => {
    const counts = {};
    sz.forEach((r) => { counts[r.reason || '미분류'] = (counts[r.reason || '미분류'] || 0) + 1; });
    return {
      type: 'doughnut',
      data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#4f6bed', '#ef476f', '#f59f00', '#12b886', '#9c36b5'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    };
  }, [sz]);

  useChart(szBarRef, () => {
    const monthly = {};
    sz.forEach((r) => {
      const m = (r.date || '').slice(0, 7);
      if (m) monthly[m] = (monthly[m] || 0) + 1;
    });
    const labels = Object.keys(monthly).sort();
    return {
      type: 'bar',
      data: { labels, datasets: [{ label: '이용 횟수', data: labels.map((l) => monthly[l]), backgroundColor: '#1098ad', borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    };
  }, [sz]);

  function onCompare() {
    const inA = (d) => d >= compA1 && d <= compA2;
    const inB = (d) => d >= compB1 && d <= compB2;
    const grpA = mon.filter((r) => inA(r.date || ''));
    const grpB = mon.filter((r) => inB(r.date || ''));
    if (!grpA.length || !grpB.length) { setCompResult({ error: '두 기간 모두에 데이터가 필요합니다.' }); return; }
    const avg = (arr, k) => arr.length ? (arr.reduce((s, r) => s + (r[k] || 0), 0) / arr.length).toFixed(1) : 0;
    // 0719 피드백: 빈도만이 아니라 빈도·지속·강도·DBR 4가지 모두 효과크기(PND·Tau-U) 비교.
    // DBR은 높을수록 좋음(higherIsBetter), 나머지는 낮을수록 좋음.
    const vals = (arr, k) => arr.map((r) => r[k] || 0);
    const es = {};
    [['freq', false], ['dur', false], ['int', false], ['dbr', true]].forEach(([k, hib]) => {
      const a = vals(grpA, k), b = vals(grpB, k);
      es[k] = { pnd: pnd(a, b, hib), tau: tauU(a, b) };
    });
    setCompResult({
      grpA, grpB,
      freq: { a: avg(grpA, 'freq'), b: avg(grpB, 'freq') },
      dur: { a: avg(grpA, 'dur'), b: avg(grpB, 'dur') },
      int: { a: avg(grpA, 'int'), b: avg(grpB, 'int') },
      dbr: { a: avg(grpA, 'dbr'), b: avg(grpB, 'dbr') },
      es,
      // 하위 호환(보고서 모달 등): 대표값은 기존대로 빈도 기준.
      pnd: es.freq.pnd,
      tau: es.freq.tau,
    });
  }

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  return (
    <>
      <StuHero />

      <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} data-tour="ev-actions">
        <button className="btn btn-pri" data-help="ev-ai" onClick={() => setAiOpen(true)}>💡 AI 성과 분석</button>
        <button className="btn btn-ok" data-help="ev-report" onClick={openReport}>📊 결과 보고서 생성</button>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>차트·표·BIP·교사 의견을 통합한 A4 PDF</span>
      </div>

      <div className="card" data-tour="ev-trend">
        <div className="card-title">📈 행동 변화 추이 (기초선 A vs 중재 B)</div>
        {header.count > 0 && (
          <div className="card-subtitle" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 엑셀 서식 제목 "(학생이름)의 OO행동 총발생횟수그래프 (관찰지속 기간)"과 같은 틀 */}
            <span><strong>{curStu.code}</strong>의 <strong>{header.behaviors.length ? header.behaviors.join(' · ') : '대상 행동'}</strong> {metricShort[metric] || ''} 그래프</span>
            <span style={{ color: 'var(--muted)' }}>{header.from} ~ {header.to} · {header.count}회기</span>
            {curStuData?.bip?.opdef && <span style={{ color: 'var(--muted)' }} title={curStuData.bip.opdef}>정의: {curStuData.bip.opdef.length > 40 ? curStuData.bip.opdef.slice(0, 40) + '…' : curStuData.bip.opdef}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)', minWidth: 34 }}>지표</span>
          {metricChips.map(([k, l]) => (
            <span key={k} className={'qchip' + (metric === k ? ' on' : '')} onClick={() => setMetric(k)}>{l}</span>
          ))}
        </div>
        {(behChips.length > 0 || rangeChips.length > 1) && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }} data-help="ev-filters">
            {behChips.length > 0 && (<>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)', minWidth: 34 }}>행동</span>
              {behChips.map(([k, l]) => (
                <span key={k} className={'qchip' + (behSel === k ? ' on' : '')} onClick={() => setBehSel(k)}>{l}</span>
              ))}
              <span style={{ width: 8 }} />
            </>)}
            {rangeChips.length > 1 && (<>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)', minWidth: 34 }}>기간</span>
              {rangeChips.map(([k, l]) => (
                <span key={k} className={'qchip' + (range === k ? ' on' : '')} onClick={() => setRange(k)}>{l}</span>
              ))}
            </>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }} data-help="ev-goal">
          <span style={{ fontSize: '.74rem', color: 'var(--muted)', minWidth: 34 }}>목표선</span>
          <input type="number" className="form-input" min="0" step="any" value={goalInput} onChange={(e) => onGoalChange(e.target.value)} placeholder={`예: ${METRICS[metric]?.higherIsBetter ? '8' : '2'}`} style={{ width: 110, padding: '4px 8px', fontSize: '.84rem' }} />
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{goalLine != null ? `보라 점선 — ${metricShort[metric] || ''} 목표 ${goalLine} (이 기기에만 저장)` : '그래프에 가로 기준선을 그어요 (지표마다 따로, 이 기기에만 저장)'}</span>
        </div>
        <div style={{ position: 'relative', height: 320 }}><canvas ref={behRef} /></div>
        <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          세로 실선 = 단계가 바뀐 자리(선은 경계를 넘어 잇지 않아요) · 색 점선 = 그 단계의 평균 · ▲ = 그날 메모(배경사건) · 회색 점선 = 관찰 기간 시작 · 굵은 회색 점선 = 학기 바뀜 · 보라 점선 = 목표선
          {behSel === BEH_ALL && behChips.length > 0 && ' · 합산 = 같은 날 행동들의 빈도·지속·대체행동은 더하고 강도는 최대, DBR은 평균'}
          {metric === 'rate' && ' · 시간당 발생률 = 빈도 ÷ 학교에 있었던 시간(관찰 시간을 적은 날만 표시)'}
        </div>
        {notes.length > 0 && (
          <details className="fold-inline" style={{ marginTop: 8 }}>
            <summary>📝 메모 있는 날 {notes.length}건</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.8rem', lineHeight: 1.7 }}>
              {notes.map((m) => <li key={m.index}>{m.date} — {m.note}</li>)}
            </ul>
          </details>
        )}
      </div>

      <div className="card" data-tour="ev-fid">
        <div className="card-title">📋 BIP 실행 충실도 추이</div>
        <div style={{ position: 'relative', height: 250 }}><canvas ref={fidRef} /></div>
      </div>

      {/* 더 보기(0914 P0): 부속 차트는 접되 캔버스는 DOM에 그대로(clip) — 결과 보고서의 canvas 캡처가 비지 않는다.
          데이터가 있으면 기본 펼침. height:0 접기는 responsive 차트를 0으로 만들므로 금지. */}
      <FoldCard key={`f-${curStu.id}-${hasQabf}`} id="ev-func" tourAnchor="ev-func" mode="clip" title="🕸 기능 분석 — QABF 레이더 · 기능/심각도" summary={hasQabf ? 'QABF 응답 있음' : 'QABF 응답 없음 — 행동의 이유 찾기(QABF) 뒤에 채워져요'} defaultOpen={hasQabf} forceOpen={forceAll}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <div>
            <div className="card-title">🕸 QABF 행동 기능 분석 (레이더)</div>
            <div style={{ position: 'relative', height: 280 }}><canvas ref={radarRef} /></div>
          </div>
          <div>
            <div className="card-title">📈 QABF 기능·심각도 그래프 (공식 양식)</div>
            <QabfFnChart responses={qabf} />
          </div>
        </div>
      </FoldCard>

      <FoldCard key={`s-${curStu.id}-${sz.length > 0}`} id="ev-sz" tourAnchor="ev-sz" mode="clip" title="💚 위기 기록 — 심리안정실 사유 · 월별 이용" summary={sz.length ? `기록 ${sz.length}건` : '심리안정실 기록 없음'} defaultOpen={sz.length > 0} forceOpen={forceAll}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <div>
            <div className="card-title">💚 심리안정실 사유 분포</div>
            <div style={{ position: 'relative', height: 280 }}><canvas ref={szDonutRef} /></div>
          </div>
          <div>
            <div className="card-title">💚 심리안정실 월별 이용</div>
            <div style={{ position: 'relative', height: 240 }}><canvas ref={szBarRef} /></div>
          </div>
        </div>
      </FoldCard>

      <div className="card" data-tour="ev-compare">
        <div className="card-title">⚖ 기간별 비교 (효과크기 포함)</div>
        <div className="card-subtitle">
          <strong>기간 A(기초선)</strong>와 <strong>기간 B(중재)</strong>의 시작·종료 날짜를 각각 고르면, 두 구간의 행동 데이터를 비교합니다.
          각 기간에 데이터가 최소 1건 이상 있어야 하며, 신뢰할 만한 결과를 위해 <strong>구간당 3건 이상</strong>을 권장해요.
        </div>
        <details style={{ margin: '0 0 12px', background: 'var(--pri-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.86rem', color: 'var(--pri-d)' }}>❓ PND·Tau-U가 무엇인가요?</summary>
          <div style={{ marginTop: 8, fontSize: '.84rem', color: 'var(--sub)', lineHeight: 1.7 }}>
            둘 다 “중재가 기초선보다 얼마나 나아졌는지”를 나타내는 효과크기 지표예요. 클수록 효과가 큽니다.
            <ul style={{ margin: '6px 0 0 18px' }}>
              <li><strong>PND</strong>: 중재 데이터가 기초선의 최고치를 넘지 않은(=개선된) 비율(%). <em>대략 90%↑ 매우 효과적 · 70~90% 효과적 · 50~70% 의심 · 50%↓ 효과 미미</em></li>
              <li><strong>Tau-U</strong>: 두 구간의 중첩을 보정한 지표(0~1). <em>대략 0.8↑ 큼 · 0.6~0.8 중간 · 0.2~0.6 작음</em></li>
            </ul>
          </div>
        </details>
        <div className="form-row">
          <div className="form-group"><label className="form-label">기간 A (기초선)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" className="form-input" value={compA1} onChange={(e) => setCompA1(e.target.value)} />
              <input type="date" className="form-input" value={compA2} onChange={(e) => setCompA2(e.target.value)} />
            </div>
          </div>
          <div className="form-group"><label className="form-label">기간 B (중재)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" className="form-input" value={compB1} onChange={(e) => setCompB1(e.target.value)} />
              <input type="date" className="form-input" value={compB2} onChange={(e) => setCompB2(e.target.value)} />
            </div>
          </div>
        </div>
        <button className="btn btn-pri btn-sm" onClick={onCompare}>비교 생성</button>
        {compResult && (compResult.error ? (
          <p style={{ color: 'var(--err)', marginTop: 10 }}>{compResult.error}</p>
        ) : (
          <div style={{ marginTop: 14 }}>
            {/* 0719 피드백: 4지표(빈도·지속·강도·DBR) 모두 평균 + 효과크기(PND·Tau-U) 비교 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead><tr style={{ background: 'var(--pri-l)' }}><th style={{ padding: 8 }}>지표</th><th>기간 A ({compResult.grpA.length}건)</th><th>기간 B ({compResult.grpB.length}건)</th><th>변화</th><th>PND</th><th>Tau-U</th></tr></thead>
              <tbody>
                {[['freq', '빈도'], ['dur', '지속시간'], ['int', '강도'], ['dbr', '일일 행동 평정(DBR)']].map(([k, l]) => {
                  const a = compResult[k].a, b = compResult[k].b, d = (b - a).toFixed(1);
                  const good = k === 'dbr' ? d > 0 : d < 0; // DBR은 높아져야 개선
                  const e = compResult.es?.[k] || {};
                  const pi = pndInterpretation(e.pnd);
                  const ti = tauUInterpretation(e.tau);
                  return (
                    <tr key={k} data-help="ev-compare-row">
                      <td style={{ padding: 8 }}>{l}{k === 'dbr' && <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}> (↑ 좋음)</span>}</td>
                      <td style={{ padding: 8 }}>{a}</td>
                      <td style={{ padding: 8 }}>{b}</td>
                      <td style={{ padding: 8, color: good ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{d > 0 ? '+' : ''}{d}</td>
                      <td style={{ padding: 8 }}><span style={{ color: pi.color, fontWeight: 700 }}>{e.pnd != null ? e.pnd + '%' : '—'}</span> <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{pi.label}</span></td>
                      <td style={{ padding: 8 }}><span style={{ color: ti.color, fontWeight: 700 }}>{e.tau != null ? e.tau.toFixed(2) : '—'}</span> <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{ti.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 8 }}>
              빈도·지속시간·강도는 낮아질수록, 일일 행동 평정(DBR)은 높아질수록 개선입니다. PND·Tau-U도 지표별로 그 방향에 맞춰 계산됩니다.
            </div>
          </div>
        ))}
      </div>

      <EvalPromptModal open={aiOpen} onClose={() => setAiOpen(false)} />
      <EvalReportModal
        open={reportOpen}
        onClose={() => { setReportOpen(false); setForceAll(false); }}
        chartRefs={{
          radar: radarRef.current,
          behavior: behRef.current,
          fid: fidRef.current,
          szDonut: szDonutRef.current,
          szBar: szBarRef.current,
        }}
        effectSize={compResult && !compResult.error ? { pnd: compResult.pnd, tau: compResult.tau } : null}
        period={compA1 && compB2 ? `${compA1} ~ ${compB2}` : undefined}
      />
    </>
  );
}
