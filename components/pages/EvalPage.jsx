import { useEffect, useRef, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import EvalPromptModal from '../modals/EvalPromptModal';
import EvalReportModal from '../modals/EvalReportModal';
import { pnd, pndInterpretation, tauU, tauUInterpretation } from '../../lib/utils/effectSize';
import QabfFnChart from '../ui/QabfFnChart';
import FoldCard from '../ui/FoldCard';
import { METRICS, availableMetrics, sortByDate, phaseRuns, runMean, phaseSeries, noteMarks, periodMarks, chartHeader, rangeOptions, filterByRange, semesterMarks, behaviorOptions, filterByBehavior, parseGoalLine, RANGE_ALL, BEH_ALL, ccConfig, criterionStats, CC_HIT_LABEL, atdConfig, conditionSeries, conditionStats, conditionPairs, ATD_MARKER_GLYPH, mblConfig, mblFilterBehavior, mblPanels, mblTierStats, MBL_DIMENSIONS } from '../../lib/utils/scedChart';
import { normalizeDesign, sinceRangeKey } from '../../lib/scedDesigns';
import DesignPicker from '../student/DesignPicker';

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
  // 1002(mds/47 ①·§4-1): 설계 시작일이 있으면 '현재 설계(MM-DD~)' 칩을 기본 선택 — 설계를 바꾼 뒤 옛 기록을 그래프에서 분리.
  const design = normalizeDesign(curStuData?.bip?.design);
  const cc = ccConfig(curStuData?.bip?.design_cfg);
  const atd = atdConfig(curStuData?.bip?.design_cfg);
  const mbl = mblConfig(curStuData?.bip?.design_cfg);
  const sinceKey = sinceRangeKey(curStuData?.bip?.design_since);
  //   단, 시작일 뒤 기록이 아직 없으면(방금 바꾼 경우) 빈 그래프가 되므로 '전체'를 기본으로.
  const sinceHasData = !!sinceKey && (curStuData?.mon || []).some((r) => (r.date || '') >= sinceKey.slice(6));
  useEffect(() => { setRange(sinceKey && sinceHasData ? sinceKey : RANGE_ALL); setBehSel(BEH_ALL); }, [curStu?.id, sinceKey, sinceHasData]);
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
  const rangeChips = rangeOptions(allSorted, { since: sinceKey ? sinceKey.slice(6) : null });
  // 1002 ② 기준변경: 행동이 여럿이면 표적행동(CC.behavior, 비면 첫 행동)으로 고정하고 합산 경로를 타지 않는다. 기준선·달성 표시는 설정 지표를 볼 때만.
  const ccBehavior = design === 'CC' && behChips.length ? (cc.behavior && behChips.some(([k]) => k === cc.behavior) ? cc.behavior : behChips[1]?.[0]) : null;
  // 1002 ④ 중다기초선: 합산 경로를 타지 않는다(날짜만 키라 층 기록이 하루로 뭉개짐). 상황·사람 간은 표적행동 1개로 고정.
  const mblActive = design === 'MBL';
  const sortedMon = mblActive ? mblFilterBehavior(filterByRange(allSorted, range), mbl) : filterByBehavior(filterByRange(allSorted, range), ccBehavior || (behChips.length ? behSel : BEH_ALL));
  const panels = mblActive ? mblPanels(sortedMon, mbl, metric) : null;
  const mblStats = panels ? mblTierStats(panels, metric) : [];
  const ccActive = design === 'CC' && metric === cc.metric;
  const ccStats = ccActive ? criterionStats(sortedMon, cc) : [];
  // 1002 ③ 교대중재: 조건별 경로(같은 조건끼리만 선) + 범례(이 설계만) + 조건별 표·조건 간 비교(평균 차·Tau-U).
  const atdActive = design === 'ATD';
  const atdStats = atdActive ? conditionStats(sortedMon, atd, metric) : [];
  const atdPairs = atdActive ? conditionPairs(atdStats) : [];
  const header = chartHeader(sortedMon);
  const notes = noteMarks(sortedMon, 40); // 글은 그릴 때 이웃 메모와의 간격에 맞춰 자른다(아래 플러그인)
  const metricChips = availableMetrics(sortedMon);
  const metricShort = Object.fromEntries(metricChips.map(([k, l]) => [k, l]));
  useChart(behRef, () => {
    const sorted = sortedMon;
    const mblP = panels;
    // 중다기초선은 X축이 날짜(중복 없음) — 층마다 같은 날 기록이 따로 있어서 기록 행으로 늘어놓으면 X가 두 배가 됨.
    const labels = mblP ? mblP.dates.map((d) => d.slice(5)) : sorted.map((r) => (r.date || '').slice(5));
    const { a: baseData, b: intData } = phaseSeries(sorted, metric);
    const atdSeries = atdActive ? conditionSeries(sorted, atd, metric) : null;
    const runs = phaseRuns(sorted);
    const means = runs.map((run) => runMean(sorted, run, metric));
    const marks = notes;
    const pMarks = periodMarks(sorted, curStuData?.periods);
    const sMarks = range === RANGE_ALL || String(range).startsWith('since:') ? semesterMarks(sorted) : []; // 학기 구분선은 전체·현재 설계 보기에서
    const goal = ccActive ? null : goalLine; // 기준변경에서는 기준선이 목표선 역할(목표선 칸 숨김)
    const ccRuns = ccActive ? ccStats : [];

    // 단계 변경선·단계 이름·단계 안 평균선·메모·관찰 기간 구분선을 한 플러그인에서 그린다.
    const scedOverlay = {
      id: 'scedOverlay',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales: { x, y } } = chart;
        if (!chartArea || !x || !y || !labels.length) return;
        const { left, right, top, bottom } = chartArea;
        const px = (i) => x.getPixelForValue(i);
        const mid = (i, j) => (px(i) + px(j)) / 2;
        const slotWFor = () => (labels.length > 1 ? Math.abs(px(1) - px(0)) : (right - left));
        ctx.save();

        // ④ 중다기초선 — 패널(층)마다 자기 단계 변경선·이름·평균선, 패널 사이를 잇는 계단 점선. 다른 겹치기(단계선·메모)는 생략.
        if (mblP) {
          const prevLine = { x: null, bottom: null };
          mblP.tiers.forEach((t) => {
            const sc = chart.scales[t.yAxisID];
            if (!sc) return;
            const pt = sc.top; const pb = sc.bottom;
            ctx.setLineDash([]); ctx.fillStyle = t.color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(`${t.name}${t.missing ? `  (결측 ${t.missing}회기)` : ''}`, left + 6, pt + 12);
            if (t.aMean != null) { ctx.setLineDash([4, 4]); ctx.strokeStyle = PHASE_COLOR.A; ctx.lineWidth = 1; const yy = sc.getPixelForValue(t.aMean); const lastA = t.a.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0); if (lastA.length > 1) { ctx.beginPath(); ctx.moveTo(px(lastA[0]), yy); ctx.lineTo(px(lastA[lastA.length - 1]), yy); ctx.stroke(); } }
            if (t.bMean != null) { ctx.setLineDash([4, 4]); ctx.strokeStyle = PHASE_COLOR.B; ctx.lineWidth = 1; const yy = sc.getPixelForValue(t.bMean); const idxB = t.b.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0); if (idxB.length > 1) { ctx.beginPath(); ctx.moveTo(px(idxB[0]), yy); ctx.lineTo(px(idxB[idxB.length - 1]), yy); ctx.stroke(); } }
            ctx.setLineDash([]);
            if (t.boundary != null && t.boundary > 0) {
              const bx = mid(t.boundary - 1, t.boundary);
              ctx.strokeStyle = 'rgba(15,23,42,.65)'; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(bx, pt); ctx.lineTo(bx, pb); ctx.stroke();
              ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
              ctx.fillStyle = PHASE_COLOR.A; if (bx - left > 40) ctx.fillText('기초선', (left + bx) / 2, pt + 12);
              ctx.fillStyle = PHASE_COLOR.B; if (right - bx > 40) ctx.fillText('중재', (bx + right) / 2, pt + 12);
              // 계단 점선: 위 패널의 단계선 아래 끝 → 이 패널의 단계선 위 끝(가로로 꺾어)
              if (prevLine.x != null) { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(15,23,42,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(prevLine.x, prevLine.bottom); ctx.lineTo(prevLine.x, pt); ctx.lineTo(bx, pt); ctx.stroke(); ctx.setLineDash([]); }
              prevLine.x = bx; prevLine.bottom = pb;
            } else {
              ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = PHASE_COLOR.A; ctx.fillText('기초선(아직 중재 전)', (left + right) / 2, pt + 12);
              if (prevLine.x != null) { ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(15,23,42,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(prevLine.x, prevLine.bottom); ctx.lineTo(prevLine.x, pb); ctx.stroke(); ctx.setLineDash([]); }
            }
            // 패널 경계
            ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, pb); ctx.lineTo(right, pb); ctx.stroke();
          });
          ctx.restore();
          return;
        }

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
          if (m != null && run.end > run.start && !((ccActive || atdActive) && run.phase === 'B')) {
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

        // ②-2 기준변경설계(mds/47 §4): 구간마다 보라 실선 기준선 + '기준 N', 기준이 바뀌는 자리 세로 점선, 구간 끝에 ✓/△/✕, 구간 안 평균 점선.
        if (ccRuns.length) {
          ccRuns.forEach((run, k) => {
            const x0 = px(run.start) - slotWFor() / 2;
            const x1 = px(run.end) + slotWFor() / 2;
            const cy = y.getPixelForValue(run.criterion);
            if (cy >= top && cy <= bottom) {
              ctx.setLineDash([]);
              ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(Math.max(left, x0), cy); ctx.lineTo(Math.min(right, x1), cy); ctx.stroke();
              ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#6d28d9'; ctx.textAlign = 'left';
              ctx.fillText(`기준${k + 1} · ${run.criterion}`, Math.max(left, x0) + 4, cy - 4);
            }
            if (k > 0) { // 기준이 바뀐 자리 — 세로 점선(실선은 A↔B 경계에만)
              const bx = mid(run.start - 1, run.start);
              ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(124,58,237,.6)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx, bottom); ctx.stroke();
              ctx.setLineDash([]);
              if (ccRuns[k - 1].status === 'miss') { ctx.font = '10px sans-serif'; ctx.fillStyle = '#b45309'; ctx.textAlign = 'center'; ctx.fillText('미달성 중 변경', bx, bottom - 18); }
            }
            if (run.mean != null && run.end > run.start) { // 구간 안 평균(초록 점선)
              const yy = y.getPixelForValue(run.mean);
              ctx.setLineDash([4, 4]); ctx.strokeStyle = PHASE_COLOR.B; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(px(run.start), yy); ctx.lineTo(px(run.end), yy); ctx.stroke(); ctx.setLineDash([]);
            }
            // 구간 끝 판정 표식
            const mark = run.status === 'hit' ? '✓' : run.status === 'over' ? '△' : run.status === 'miss' ? '✕' : '…';
            const mc = run.status === 'hit' ? '#0d7d4e' : run.status === 'over' ? '#6b7280' : run.status === 'miss' ? '#dc2626' : '#9ca3af';
            ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = mc; ctx.textAlign = 'center';
            ctx.fillText(mark, px(run.end), Math.max(top + 24, (cy >= top && cy <= bottom ? cy : top + 30) - 10));
          });
        }

        // ③ 메모(배경사건·특이사항) — 점 위에 ▲ + 글. 글은 이웃 메모까지의 간격에 맞춰 자르고,
        //    그래도 겹치면 위아래 두 줄로 번갈아 놓는다(전체 보기처럼 점이 많아도 글이 사라지지 않게).
        //    전체 내용은 그 날짜 열 어디에 마우스를 올려도 툴팁에 보인다(interaction mode 'index').
        ctx.setLineDash([]);
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const slotW = labels.length > 1 ? Math.abs(px(1) - px(0)) : (right - left);
        const fit = (text, maxW) => {
          if (ctx.measureText(text).width <= maxW) return text;
          let t = text;
          while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
          return t.length <= 1 ? '' : t + '…';
        };
        const visible = marks.filter((m) => {
          const r = sorted[m.index];
          const v = (r.phase || 'A') === 'A' ? baseData[m.index] : intData[m.index];
          return v != null;
        });
        let lastRow0Right = -Infinity; let lastRow1Right = -Infinity;
        visible.forEach((m, k) => {
          const r = sorted[m.index];
          const v = (r.phase || 'A') === 'A' ? baseData[m.index] : intData[m.index];
          const cx = px(m.index);
          const cy = y.getPixelForValue(v) - 9;
          ctx.fillStyle = '#f59f00';
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy - 6); ctx.lineTo(cx + 4, cy - 6); ctx.closePath(); ctx.fill();
          // 글 폭: 양옆 이웃 메모까지 거리(최소 1.6칸, 최대 5칸) 안에서
          const prev = visible[k - 1]; const next = visible[k + 1];
          const gapL = prev ? cx - px(prev.index) : Infinity;
          const gapR = next ? px(next.index) - cx : Infinity;
          const maxW = Math.max(slotW * 1.6, Math.min(Math.min(gapL, gapR) * 1.9, slotW * 5));
          const text = fit(m.note, Math.min(maxW, right - left));
          if (!text) return;
          const w = ctx.measureText(text).width;
          // 같은 줄의 직전 글과 겹치면 윗줄로
          let row = 0;
          if (cx - w / 2 < lastRow0Right + 4) row = (cx - w / 2 < lastRow1Right + 4) ? 0 : 1;
          const ty = cy - 9 - row * 11;
          if (row === 0) lastRow0Right = cx + w / 2; else lastRow1Right = cx + w / 2;
          ctx.fillStyle = '#92400e';
          ctx.fillText(text, cx, Math.max(top + 26, ty)); // 단계 이름(top+12) 아래로
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
      data: { labels, datasets: mblP
        ? mblP.tiers.flatMap((t) => [
          { ...mkSet(`${t.name} · 기초선`, t.a, PHASE_COLOR.A), yAxisID: t.yAxisID, pointBorderColor: t.color, pointBorderWidth: 2 },
          { ...mkSet(`${t.name} · 중재`, t.b, PHASE_COLOR.B), yAxisID: t.yAxisID, pointBorderColor: t.color, pointBorderWidth: 2 },
        ])
        : atdSeries
        ? [
          mkSet('기초선 (A)', baseData, PHASE_COLOR.A),
          // 조건별 경로 — 같은 조건끼리만 잇는다(spanGaps true). 점 모양 ●▲■◆, 무중재는 회색 ○.
          ...atdSeries.series.map((c) => ({ ...mkSet(c.name, c.data, c.color), spanGaps: true, pointStyle: c.marker, pointRadius: 5, pointBackgroundColor: c.control ? '#fff' : c.color, pointBorderColor: c.color, pointBorderWidth: 2, borderDash: c.control ? [4, 3] : undefined })),
          ...(atdSeries.hasNone ? [{ ...mkSet('조건 없음', atdSeries.none, '#9ca3af'), showLine: false, pointStyle: 'circle', pointBackgroundColor: '#d1d5db' }] : []),
        ]
        : [mkSet('기초선 (A)', baseData, PHASE_COLOR.A), mkSet('중재 (B)', intData, PHASE_COLOR.B)] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        // 'index' 모드: 그 날짜 열 어디에 마우스를 올려도(▲·메모 글 위 포함) 툴팁이 뜬다 → 메모 전문 확인.
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: !!atdSeries, position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, font: { size: 11 }, filter: (item) => item.text !== '기초선 (A)' || baseData.some((v) => v != null) } }, // 범례는 교대중재에서만(조건 이름)
          tooltip: {
            filter: (item) => item.raw != null,
            callbacks: {
              title: (items) => { if (mblP) return mblP.dates[items[0]?.dataIndex] || ''; const r = sorted[items[0]?.dataIndex]; return r ? `${r.date} · ${(r.phase || 'A') === 'A' ? '기초선(A)' : '중재(B)'}` : ''; },
              afterBody: (items) => {
                if (mblP) return [];
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
        scales: mblP ? {
          // 층별 패널 — 같은 stack에 쌓이고(stackWeight 1), Y 최대는 전 패널 공통(suggestedMax = yMax)
          ...Object.fromEntries(mblP.tiers.map((t, k) => [t.yAxisID, { type: 'linear', position: 'left', stack: 'mbl', stackWeight: 1, offset: true, beginAtZero: true, suggestedMax: Math.max(1, mblP.yMax), grace: '25%', grid: { color: 'rgba(0,0,0,.06)' }, title: { display: k === Math.floor(mblP.tiers.length / 2), text: METRICS[metric]?.label || '값' }, ticks: { maxTicksLimit: 4, font: { size: 10 } } }])),
          x: { title: { display: true, text: '회기 (관찰일)' }, grid: { display: false } },
        } : {
          y: { beginAtZero: true, grace: '15%', suggestedMax: goal != null ? goal : (ccRuns.length ? Math.max(...ccRuns.map((r) => r.criterion)) : undefined), title: { display: true, text: METRICS[metric]?.label || '값' }, grid: { color: 'rgba(0,0,0,.06)' } }, // grace: 단계 이름이 맨 위 점과 겹치지 않게 머리 공간
          x: { title: { display: true, text: '회기 (관찰일)' }, grid: { display: false } },
        },
      },
      plugins: [scedOverlay],
    };
  }, [mon, metric, curStuData?.periods, behSel, range, goalLine, design, cc.metric, cc.direction, cc.hitRuns, cc.nearPct, cc.behavior, JSON.stringify(atd), JSON.stringify(mbl)]);

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
        {/* 1002 햇살: 그래프 화면에서도 설계를 바로 보고 바꿀 수 있게(눈에 띄는 띠) */}
        <div style={{ marginBottom: 10 }}><DesignPicker where="eval" /></div>
        {header.count > 0 && (
          <div className="card-subtitle" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 엑셀 서식 제목 "(학생이름)의 OO행동 총발생횟수그래프 (관찰지속 기간)"과 같은 틀 */}
            <span><strong>{curStu.code}</strong>의 <strong>{header.behaviors.length ? header.behaviors.join(' · ') : '대상 행동'}</strong> {metricShort[metric] || ''} 그래프</span>
            <span style={{ color: 'var(--muted)' }}>{header.from} ~ {header.to} · {header.count}회기</span>
            {sinceKey && <span style={{ color: 'var(--muted)' }}>· {sinceKey.slice(11)}부터 현재 설계</span>}
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
            {ccBehavior && <span style={{ fontSize: '.78rem', color: '#6d28d9' }}>표적행동 <strong>{ccBehavior}</strong> (기준변경 설정 ⚙에서 바꿔요)</span>}
            {mblActive && <span style={{ fontSize: '.78rem', color: '#166534' }}>층 {panels?.tiers.length || 0}개 · {MBL_DIMENSIONS[mbl.dimension]}{mbl.dimension !== 'behavior' && mbl.behavior ? ` · 표적행동 ${mbl.behavior}` : ''}</span>}
            {behChips.length > 0 && !ccBehavior && !mblActive && (<>
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
        {design === 'CC' && (
          <div style={{ fontSize: '.78rem', color: '#5b21b6', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
            🎯 기준변경설계 — 기준 지표 <strong>{METRICS[cc.metric]?.label}</strong> · {cc.direction === 'up' ? '늘리기' : '줄이기'} · 달성 = 연속 {cc.hitRuns}회기 기준 근처(폭 {cc.nearPct}%).
            {!ccActive && <> 기준선은 <strong>{METRICS[cc.metric]?.label}</strong> 지표를 볼 때 그려져요.</>}
          </div>
        )}
        {mblActive && (
          <div style={{ fontSize: '.78rem', color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
            🪜 중다기초선설계({MBL_DIMENSIONS[mbl.dimension]}) — 층마다 패널이 따로 쌓여요. 중재를 시작한 층만 내려가고 아직 중재 전인 층은 그대로면, 변화가 중재 때문이라고 볼 수 있어요(계단 점선 = 중재 시작 시차).
            {panels && panels.tiers.length < 2 && ' 층이 2개 이상이어야 시차 비교가 돼요.'}
          </div>
        )}
        {atdActive && (
          <div style={{ fontSize: '.78rem', color: '#075985', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
            🔀 교대중재설계 — 조건 {atd.conditions.map((c) => `${ATD_MARKER_GLYPH[c.marker] || '●'} ${c.name}`).join(' · ')}{atd.control ? ' · ○ 무중재' : ''}. 같은 조건끼리만 선을 잇고, 조건별 경로가 벌어질수록(겹침이 적을수록) 차이가 분명해요.
          </div>
        )}
        <div style={{ display: ccActive ? 'none' : 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }} data-help="ev-goal">
          <span style={{ fontSize: '.74rem', color: 'var(--muted)', minWidth: 34 }}>목표선</span>
          <input type="number" className="form-input" min="0" step="any" value={goalInput} onChange={(e) => onGoalChange(e.target.value)} placeholder={`예: ${METRICS[metric]?.higherIsBetter ? '8' : '2'}`} style={{ width: 110, padding: '4px 8px', fontSize: '.84rem' }} />
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{goalLine != null ? `보라 점선 — ${metricShort[metric] || ''} 목표 ${goalLine} (이 기기에만 저장)` : '그래프에 가로 기준선을 그어요 (지표마다 따로, 이 기기에만 저장)'}</span>
        </div>
        <div style={{ position: 'relative', height: mblActive ? Math.max(320, 170 * Math.max(1, (panels?.tiers || []).length)) : 320 }}><canvas ref={behRef} /></div>
        <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
          세로 실선 = 단계가 바뀐 자리(선은 경계를 넘어 잇지 않아요) · 색 점선 = 그 단계의 평균 · ▲ = 그날 메모(배경사건, 글이 잘렸으면 그 날짜 위에 마우스를 올리면 전문) · 회색 점선 = 관찰 기간 시작 · 굵은 회색 점선 = 학기 바뀜 · 보라 점선 = 목표선
          {behSel === BEH_ALL && behChips.length > 0 && ' · 합산 = 같은 날 행동들의 빈도·지속·대체행동은 더하고 강도는 최대, DBR은 평균'}
          {metric === 'rate' && ' · 시간당 발생률 = 빈도 ÷ 학교에 있었던 시간(관찰 시간을 적은 날만 표시)'}
          {ccActive && ' · 보라 실선 = 그 구간의 기준, 보라 세로 점선 = 기준이 바뀐 자리, ✓ 달성 · △ 과잉 달성(기준보다 훨씬 아래 — 기준이 이끈 증거 아님) · ✕ 미달성'}
          {atdActive && ' · 조건별 색·점 모양은 아래 범례, 회색 점 = 조건 없이 저장된 기록(기록 목록에서 조건을 붙여요)'}
          {mblActive && ' · 패널마다 세로 실선 = 그 층의 중재 시작, 계단 점선 = 층 사이 시차, 점 테두리 색 = 층'}
        </div>
        {mblActive && mblStats.length > 0 && (
          <div style={{ marginTop: 10 }} data-tour="ev-mbl-table">
            <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: 4 }}>🪜 층별 결과 <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.76rem' }}>— 층마다 기초선 vs 중재 ({METRICS[metric]?.label || metric})</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead><tr style={{ background: '#f0fdf4' }}><th style={{ padding: 6, textAlign: 'left' }}>층</th><th>중재 시작</th><th>기초선</th><th>중재</th><th>평균 A → B</th><th>PND</th><th>Tau-U</th></tr></thead>
              <tbody>
                {mblStats.map((t) => {
                  const pi = pndInterpretation(t.pnd); const ti = tauUInterpretation(t.tau);
                  return (
                    <tr key={t.name} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: t.color, marginRight: 6 }} />{t.name}{t.missing ? <span style={{ color: 'var(--muted)', fontSize: '.74rem' }}> (결측 {t.missing})</span> : null}</td>
                      <td style={{ textAlign: 'center' }}>{t.bStart ? t.bStart.slice(5) : '아직'}</td>
                      <td style={{ textAlign: 'center' }}>{t.aCount}회</td>
                      <td style={{ textAlign: 'center' }}>{t.bCount}회</td>
                      <td style={{ textAlign: 'center' }}>{t.aMean ?? '—'} → {t.bMean ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}><span style={{ color: pi.color, fontWeight: 700 }}>{t.pnd != null ? t.pnd + '%' : '—'}</span></td>
                      <td style={{ textAlign: 'center' }}><span style={{ color: ti.color, fontWeight: 700 }}>{t.tau != null ? t.tau.toFixed(2) : '—'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {atdActive && atdStats.some((c) => c.sessions > 0) && (
          <div style={{ marginTop: 10 }} data-tour="ev-atd-table">
            <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: 4 }}>🔀 조건별 결과 <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.76rem' }}>— {METRICS[metric]?.label || metric}. 조건 비교는 평균 차·Tau-U로(PND는 기초선 기준이라 조건 비교엔 안 맞아요)</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead><tr style={{ background: '#f0f9ff' }}><th style={{ padding: 6, textAlign: 'left' }}>조건</th><th>회기</th><th>평균</th><th>최근 5회 평균</th></tr></thead>
              <tbody>
                {atdStats.map((c) => (
                  <tr key={c.name} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}><span style={{ color: c.color }}>{ATD_MARKER_GLYPH[c.marker] || '●'}</span> {c.name}</td>
                    <td style={{ textAlign: 'center' }}>{c.sessions}</td>
                    <td style={{ textAlign: 'center' }}>{c.mean ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>{c.recent ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {atdPairs.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem', marginTop: 8 }}>
                <thead><tr style={{ background: '#f0f9ff' }}><th style={{ padding: 6, textAlign: 'left' }}>비교</th><th>평균 차 (뒤 − 앞)</th><th>Tau-U</th><th>해석</th></tr></thead>
                <tbody>
                  {atdPairs.map((p) => {
                    const ti = tauUInterpretation(p.tau);
                    const better = p.diff == null ? null : (METRICS[metric]?.higherIsBetter ? p.diff > 0 : p.diff < 0) ? p.b : (METRICS[metric]?.higherIsBetter ? p.diff < 0 : p.diff > 0) ? p.a : null;
                    return (
                      <tr key={p.a + p.b} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 6 }}>{p.a} vs {p.b}</td>
                        <td style={{ textAlign: 'center' }}>{p.diff == null ? '—' : (p.diff > 0 ? '+' : '') + p.diff}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: ti.color }}>{p.tau == null ? '—' : p.tau.toFixed(2)}</td>
                        <td style={{ textAlign: 'center', fontSize: '.78rem', color: 'var(--sub)' }}>{ti.label}{better ? ` · ${better} 쪽이 나음` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
        {ccActive && ccStats.length > 0 && (
          <div style={{ marginTop: 10 }} data-tour="ev-cc-table">
            <div style={{ fontWeight: 700, fontSize: '.86rem', marginBottom: 4 }}>🎯 구간별 기준 달성 <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.76rem' }}>— 기준변경설계의 주 지표. 아래 PND·Tau-U는 참고치</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead><tr style={{ background: '#f5f3ff' }}><th style={{ padding: 6, textAlign: 'left' }}>구간</th><th>기준</th><th>회기</th><th>평균</th><th>평균−기준</th><th>기준 안 회기</th><th>판정</th></tr></thead>
              <tbody>
                {ccStats.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>기준{i + 1} <span style={{ color: 'var(--muted)' }}>({(sortedMon[r.start]?.date || '').slice(5)} ~ {(sortedMon[r.end]?.date || '').slice(5)})</span></td>
                    <td style={{ textAlign: 'center' }}>{r.criterion}</td>
                    <td style={{ textAlign: 'center' }}>{r.sessions}</td>
                    <td style={{ textAlign: 'center' }}>{r.mean ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: r.diff == null ? 'inherit' : (cc.direction === 'up' ? r.diff >= 0 : r.diff <= 0) ? 'var(--ok)' : 'var(--err)' }}>{r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + r.diff}</td>
                    <td style={{ textAlign: 'center' }}>{r.insidePct == null ? '—' : r.insidePct + '%'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: r.status === 'hit' ? '#0d7d4e' : r.status === 'over' ? '#6b7280' : r.status === 'miss' ? '#dc2626' : 'var(--muted)' }}>{CC_HIT_LABEL[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
