import { useEffect, useRef } from 'react';
import { qabfScores } from '../../lib/qabf';

// 공식 QABF 양식의 그래프 재현 — 5개 기능별 "기능(0~5)"과 "심각도(0~15)" 선 그래프.
//  - 기능(function): 그 기능에서 0점 초과로 응답한 문항 수 (0~5)
//  - 심각도(severity): 그 기능 문항 점수의 합 (0~15)
// 0822(동료 피드백): 원문 엑셀 그래프처럼 곡선(tension)·면 채움 없이
// 마커를 직선으로만 잇는 꺾은선(선형)으로 그린다.
// 0825(동료 피드백): 원문 엑셀처럼 Y축 2개 — 왼쪽 기능(0~5)·오른쪽 기능/심각도(0~15),
// 색상도 원문과 동일하게 기능=파랑, 기능/심각도=빨강. 눈금은 좌 1·우 3 간격으로
// 격자선이 맞물리게 한다.
// X축도 원문처럼 기능당 2칸(…기능 / …기능·심각도) 총 10칸 — 파란 점은 홀수째,
// 빨간 점은 짝수째 칸에 찍고(spanGaps로 빈칸을 건너 이어 그림) 서로 엇갈리게 한다.

// 원문 양식의 X축 표기(기능별 정식 이름).
const FN_NAMES = ['관심습득', '회피', '자동·감각적', '신체적', '강화물습득'];

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
      // 기능당 2칸: [관심습득기능, 관심습득\n기능/심각도, 회피기능, …] 총 10칸.
      // 파란(기능) 점은 앞 칸, 빨간(심각도) 점은 뒤 칸에만 두고 나머지는 null.
      const labels = FN_NAMES.flatMap((n) => [`${n} 기능`, [n, '기능/심각도']]);
      const funcData = FN_NAMES.flatMap((_, i) => [func[i], null]);
      const sevData = FN_NAMES.flatMap((_, i) => [null, sev[i]]);
      if (inst.current) inst.current.destroy();
      inst.current = new Chart(ref.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            // clip:false — 만점(5·15)이면 점이 차트 맨 윗선에 걸리는데, 기본값은 영역
            // 밖을 잘라내 마커가 반쪽만 보였다("차트가 짤린다" 피드백). 축 최대값은
            // 실제 척도(0~5·0~15) 그대로 두고 마커만 경계를 넘어 그리게 한다.
            { label: '기능 (0~5)', data: funcData, yAxisID: 'yFunc', spanGaps: true, clip: false, borderColor: '#0000ff', pointRadius: 5, pointStyle: 'circle', pointBackgroundColor: '#0000ff', tension: 0, fill: false, borderWidth: 2.5 },
            { label: '기능/심각도 (0~15)', data: sevData, yAxisID: 'ySev', spanGaps: true, clip: false, borderColor: '#ff0000', pointRadius: 5, pointStyle: 'circle', pointBackgroundColor: '#ff0000', tension: 0, fill: false, borderWidth: 2.5 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 8 } }, // 경계를 넘은 만점 마커가 캔버스 밖으로 나가지 않게 여유
          plugins: { legend: { position: 'bottom' }, title: { display: !!label, text: label } },
          scales: {
            yFunc: {
              position: 'left', beginAtZero: true, min: 0, max: 5,
              title: { display: true, text: '기능 (0~5)', color: '#0000ff' },
              ticks: { stepSize: 1, color: '#0000ff' },
            },
            ySev: {
              position: 'right', beginAtZero: true, min: 0, max: 15,
              title: { display: true, text: '기능/심각도 (0~15)', color: '#ff0000' },
              ticks: { stepSize: 3, color: '#ff0000' },
              grid: { drawOnChartArea: false }, // 격자선은 왼쪽 축 기준만 — 겹침 방지(좌 1칸 = 우 3칸으로 맞물림)
            },
            x: { title: { display: true, text: '행동 기능' } },
          },
        },
      });
    });
    return () => { alive = false; if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [responses, label, height]);
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>;
}
