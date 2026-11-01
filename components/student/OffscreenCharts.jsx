import { useEffect, useRef } from 'react';
import EvalPage from '../pages/EvalPage';
import QabfFnChart from '../ui/QabfFnChart';

// 보고서·엑셀용 차트를 화면 밖에 그려 두는 래퍼(새 디자인 3단계, mds/54 §7 '3단계').
//   결과 보고서(EvalReportModal → printEvalReport)는 그래프 캔버스를 그림으로 떠서 넣는다(chartRefs). 그래서
//   그래프·평가 탭이 아닌 곳(문서 탭·문서 허브)에서 보고서를 만들면 캔버스가 없거나, 숨긴 칸에 그리면 폭 0으로 빈 그림이 된다.
//   → 그래프 탭과 **같은 화면(EvalPage)을 그대로** 화면 밖(왼쪽 바깥, 폭 960px, 보이는 상태)에 한 번 그리고,
//     캔버스 5개(행동 추이·충실도·QABF 레이더·안정실 도넛·월별 막대)가 그려지면 chartRefs로 넘긴다.
//     차트 계산을 새로 만들지 않는다 — 그래프 탭과 같은 코드가 같은 자료로 그린다.
//   · 숨은 탭 마운트 금지 규칙(mds/54 §3-3 규칙 4)과 부딪히지 않게: 보고서를 만들 때만 잠깐 마운트하고, 창을 닫으면 내린다.
//     폭이 있는 상자라 캔버스 폭 0이 생기지 않는다. 길잡이·화면 낭독기가 보지 않게 aria-hidden + inert.
//   · 애니메이션 도중 캡처를 막으려고 차트마다 update('none')(애니메이션 없이 마지막 모습)로 한 번 다시 그린다.
const BOX = { position: 'fixed', left: -12000, top: 0, width: 960, pointerEvents: 'none', zIndex: -1 };

let chartLib = null;
async function loadChart() {
  if (chartLib) return chartLib;
  const mod = await import('chart.js/auto');
  chartLib = mod.default;
  return chartLib;
}


function pick(box) {
  const sz = box.querySelectorAll('[data-tour="ev-sz"] canvas');
  return {
    radar: box.querySelector('[data-tour="ev-func"] canvas'), // 첫 캔버스 = 레이더(둘째는 QABF 공식 그래프)
    behavior: box.querySelector('[data-tour="ev-trend"] canvas'),
    fid: box.querySelector('[data-tour="ev-fid"] canvas'),
    szDonut: sz[0] || null,
    szBar: sz[1] || null,
  };
}

// 캔버스마다 Chart 인스턴스가 붙고 폭이 0보다 크면서, 그 인스턴스가 한동안(STABLE번 연속) 바뀌지 않으면 준비 끝.
//   EvalPage는 처음 그린 뒤 자료·기간 기본값이 정해지며 차트를 한 번 더 새로 만든다 — 첫 인스턴스에서 캡처하면 빈 그림.
const STABLE = 4; // 150ms × 4
async function snapshot(canvases) {
  const Chart = await loadChart();
  const list = canvases.filter(Boolean);
  if (!list.length) return null;
  const inst = list.map((c) => (c.width > 0 ? Chart.getChart(c) : null));
  if (inst.some((x) => !x)) return null;
  return inst;
}

function useSettle(boxRef, picker, onReady, timeoutMs = 9000) {
  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    let timer = null;
    let last = null;
    let same = 0;
    const tick = async () => {
      if (!alive || !boxRef.current) return;
      const refs = picker(boxRef.current);
      const inst = await snapshot(Object.values(refs));
      if (!alive) return;
      if (inst && last && inst.length === last.length && inst.every((x, i) => x === last[i])) same += 1; else same = 0;
      last = inst;
      const done = !!inst && same >= STABLE;
      if (done) inst.forEach((ch) => { try { ch.update('none'); } catch (_e) { /* 그림은 이미 있음 */ } });
      if (done || Date.now() - t0 > timeoutMs) { onReady(refs, done); return; }
      timer = setTimeout(tick, 150);
    };
    timer = setTimeout(tick, 300);
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** 결과 보고서용 — onReady({radar, behavior, fid, szDonut, szBar}, 다그려졌나). 부모가 key로 학생마다 새로 마운트. */
export default function OffscreenCharts({ onReady }) {
  const boxRef = useRef(null);
  useSettle(boxRef, pick, onReady);
  return (
    <div ref={boxRef} style={BOX} aria-hidden="true" inert="" data-offscreen-charts="eval">
      <EvalPage />
    </div>
  );
}

/** QABF 엑셀용 — QabfPage와 같은 #qabf-fn-chart 안에 같은 그래프. onReady(canvas). QabfPage가 같이 떠 있지 않을 때만 쓴다(id 중복 방지). */
export function OffscreenQabfChart({ responses, onReady }) {
  const boxRef = useRef(null);
  useSettle(boxRef, (box) => ({ fn: box.querySelector('#qabf-fn-chart canvas') }), (refs, done) => onReady(refs.fn, done));
  return (
    <div ref={boxRef} style={BOX} aria-hidden="true" inert="" data-offscreen-charts="qabf">
      <div id="qabf-fn-chart"><QabfFnChart responses={responses} /></div>
    </div>
  );
}
