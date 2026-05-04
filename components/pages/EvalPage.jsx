import { useEffect, useRef, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import EvalPromptModal from '../modals/EvalPromptModal';
import EvalReportModal from '../modals/EvalReportModal';
import { pnd, pndInterpretation, tauU, tauUInterpretation } from '../../lib/utils/effectSize';

const FUNC_LABELS = ['관심', '회피', '획득', '감각', '비사회적'];
const FUNC_COLORS = ['#4f6bed', '#ef476f', '#f59f00', '#12b886', '#1098ad'];

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

  // Behavior chart with Phase A/B coloring
  useChart(behRef, () => {
    const sorted = [...mon].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const labels = sorted.map((r) => (r.date || '').slice(5));
    const baseData = sorted.map((r) => (r.phase === 'A' ? r[metric] : null));
    const intData = sorted.map((r) => (r.phase !== 'A' ? r[metric] : null));
    const baseAvg = (() => { const a = sorted.filter((r) => r.phase === 'A').map((r) => r[metric]); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; })();
    const intAvg = (() => { const a = sorted.filter((r) => r.phase !== 'A').map((r) => r[metric]); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; })();
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '기초선 (A)', data: baseData, borderColor: '#ef476f', backgroundColor: 'rgba(239,71,111,.08)', tension: 0.3, pointRadius: 5, pointBackgroundColor: '#ef476f', spanGaps: false },
          { label: '중재 (B)', data: intData, borderColor: '#12b886', backgroundColor: 'rgba(18,184,134,.08)', tension: 0.3, pointRadius: 5, pointBackgroundColor: '#12b886', spanGaps: false },
          { label: 'A 평균(' + baseAvg.toFixed(1) + ')', data: labels.map(() => baseAvg), borderColor: 'rgba(239,71,111,.4)', borderDash: [6, 4], pointRadius: 0 },
          { label: 'B 평균(' + intAvg.toFixed(1) + ')', data: labels.map(() => intAvg), borderColor: 'rgba(18,184,134,.4)', borderDash: [6, 4], pointRadius: 0 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
    };
  }, [mon, metric]);

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
    const aFreqs = grpA.map((r) => r.freq || 0);
    const bFreqs = grpB.map((r) => r.freq || 0);
    setCompResult({
      grpA, grpB,
      freq: { a: avg(grpA, 'freq'), b: avg(grpB, 'freq') },
      dur: { a: avg(grpA, 'dur'), b: avg(grpB, 'dur') },
      int: { a: avg(grpA, 'int'), b: avg(grpB, 'int') },
      dbr: { a: avg(grpA, 'dbr'), b: avg(grpB, 'dbr') },
      pnd: pnd(aFreqs, bFreqs, false),
      tau: tauU(aFreqs, bFreqs),
    });
  }

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  return (
    <>
      <StuHero />

      <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-pri" onClick={() => setAiOpen(true)}>💡 AI 성과 분석</button>
        <button className="btn btn-ok" onClick={() => setReportOpen(true)}>📊 결과 보고서 생성</button>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>차트·표·BIP·교사 의견을 통합한 A4 PDF</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
        <div className="card">
          <div className="card-title">🕸 QABF 행동 기능 분석</div>
          <div style={{ position: 'relative', height: 280 }}><canvas ref={radarRef} /></div>
        </div>
        <div className="card">
          <div className="card-title">💚 심리안정실 사유 분포</div>
          <div style={{ position: 'relative', height: 280 }}><canvas ref={szDonutRef} /></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📈 행동 변화 추이 (기초선 A vs 중재 B)</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {[['freq', '빈도'], ['dur', '지속'], ['int', '강도'], ['dbr', 'DBR']].map(([k, l]) => (
            <span key={k} className={'qchip' + (metric === k ? ' on' : '')} onClick={() => setMetric(k)}>{l}</span>
          ))}
        </div>
        <div style={{ position: 'relative', height: 320 }}><canvas ref={behRef} /></div>
      </div>

      <div className="card">
        <div className="card-title">📋 BIP 실행 충실도 추이</div>
        <div style={{ position: 'relative', height: 250 }}><canvas ref={fidRef} /></div>
      </div>

      <div className="card">
        <div className="card-title">💚 심리안정실 월별 이용</div>
        <div style={{ position: 'relative', height: 240 }}><canvas ref={szBarRef} /></div>
      </div>

      <div className="card">
        <div className="card-title">⚖ 기간별 비교 (효과크기 포함)</div>
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
              <thead><tr style={{ background: 'var(--pri-l)' }}><th style={{ padding: 8 }}>지표</th><th>기간 A ({compResult.grpA.length}건)</th><th>기간 B ({compResult.grpB.length}건)</th><th>변화</th></tr></thead>
              <tbody>
                {[['freq', '빈도'], ['dur', '지속시간'], ['int', '강도'], ['dbr', 'DBR']].map(([k, l]) => {
                  const a = compResult[k].a, b = compResult[k].b, d = (b - a).toFixed(1);
                  return <tr key={k}><td style={{ padding: 8 }}>{l}</td><td style={{ padding: 8 }}>{a}</td><td style={{ padding: 8 }}>{b}</td><td style={{ padding: 8, color: d < 0 ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{d > 0 ? '+' : ''}{d}</td></tr>;
                })}
              </tbody>
            </table>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>PND (빈도 기준)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: pndInterpretation(compResult.pnd).color }}>{compResult.pnd != null ? compResult.pnd + '%' : '—'}</div>
                <div style={{ fontSize: '.78rem' }}>{pndInterpretation(compResult.pnd).label}</div>
              </div>
              <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Tau-U (빈도 기준)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: tauUInterpretation(compResult.tau).color }}>{compResult.tau != null ? compResult.tau.toFixed(2) : '—'}</div>
                <div style={{ fontSize: '.78rem' }}>{tauUInterpretation(compResult.tau).label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <EvalPromptModal open={aiOpen} onClose={() => setAiOpen(false)} />
      <EvalReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
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
