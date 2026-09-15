import { useEffect, useState } from 'react';

// 월별 개별화교육계획 표 열 너비(비율용 px) — 월/교육목표/교육내용/교육방법/평가계획/평가.
// 0915: 교육방법이 너무 좁다는 피드백으로 기본값을 170 → 200으로(목표·내용에서 덜어냄).
export const MONTHLY_COL_DEFAULT = [50, 200, 200, 200, 190, 220];
const MIN = 48;

/**
 * 헤더 경계를 끌어 열 너비를 조절하는 표용 훅. 너비는 브라우저(localStorage)에 기억한다.
 * 같은 storageKey를 쓰는 표끼리(IEP 작성·IEP 계획서 화면) 너비를 공유한다.
 * 드래그한 열과 오른쪽 이웃 열이 폭을 주고받아 전체 폭은 그대로다.
 *
 *   const { widths, startResize, reset, colgroup } = useColumnWidths('iep_colw', MONTHLY_COL_DEFAULT);
 *   <table style={{ tableLayout: 'fixed' }}>{colgroup}…<th>…<span onPointerDown={(e) => startResize(i, e)} /></th>
 */
export default function useColumnWidths(storageKey, defaults) {
  const [widths, setWidths] = useState(defaults);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(s) && s.length === defaults.length && s.every((x) => Number.isFinite(x) && x > 0)) setWidths(s.map(Math.round));
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = (w) => { try { localStorage.setItem(storageKey, JSON.stringify(w)); } catch (_) {} };

  function startResize(idx, e) {
    e.preventDefault();
    const th = e.currentTarget.closest('table');
    // 화면 px 이동량을 비율 단위로 환산 — 표 실제 폭과 너비 합이 달라도 커서를 따라가게.
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = th ? total / th.getBoundingClientRect().width : 1;
    const startX = e.clientX;
    const a = widths[idx];
    const b = widths[idx + 1];
    let last = widths;
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none'; // 끄는 동안 헤더 글자가 선택되지 않게
    const move = (ev) => {
      let d = (ev.clientX - startX) * scale;
      d = Math.max(d, MIN - a);
      d = Math.min(d, b - MIN);
      d = Math.round(d);
      last = widths.map((w, k) => (k === idx ? a + d : k === idx + 1 ? b - d : w));
      setWidths(last);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.style.userSelect = prevSelect;
      save(last);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function reset() { setWidths(defaults); save(defaults); }

  const total = widths.reduce((a, b) => a + b, 0);
  const colgroup = (
    <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${(w / total) * 100}%` }} />)}</colgroup>
  );

  return { widths, startResize, reset, colgroup };
}
