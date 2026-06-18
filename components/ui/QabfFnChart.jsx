import { useEffect, useRef } from 'react';
import { QABF_SHORT_LABELS as FUNC_LABELS, qabfScores } from '../../lib/qabf';

// 공식 QABF 양식의 그래프 재현 — 5개 기능별 "기능(0~5)"과 "심각도(0~15)" 선 그래프.
//  - 기능(function): 그 기능에서 0점 초과로 응답한 문항 수 (0~5)
//  - 심각도(severity): 그 기능 문항 점수의 합 (0~15)

let chartLib = null;
async function loadChart() {
  if (chartLib) return chartLib;
  const mod = await import('chart.js/auto');
  chartLib = mod.default;
  return chartLib;
}

export default function QabfFnChart({ responses, label, height = 280 }) {
  const ref = useRef(null);
  const inst = useRef(null);
  useEffect(() => {
    let alive = true;
    loadChart().then((Chart) => {
      if (!alive || !ref.current) return;
      const { func, sev } = qabfScores(responses);
      if (inst.current) inst.current.destroy();
      inst.current = new Chart(ref.current, {
        type: 'line',
        data: {
          labels: FUNC_LABELS,
          datasets: [
            { label: '심각도 (0~15)', data: sev, borderColor: '#4f6bed', backgroundColor: 'rgba(79,107,237,.12)', pointRadius: 5, pointBackgroundColor: '#4f6bed', tension: 0.2, fill: true },
            { label: '기능 (0~5)', data: func, borderColor: '#f59f00', backgroundColor: 'rgba(245,159,0,0)', pointRadius: 5, pointBackgroundColor: '#f59f00', tension: 0.2, borderDash: [5, 4], fill: false },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' }, title: { display: !!label, text: label } },
          scales: {
            y: { beginAtZero: true, suggestedMax: 15, title: { display: true, text: '점수' }, ticks: { stepSize: 3 } },
            x: { title: { display: true, text: '행동 기능' } },
          },
        },
      });
    });
    return () => { alive = false; if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [responses, label, height]);
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>;
}
