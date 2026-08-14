import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { fetchDashLayout, saveDashLayout, resetDashLayout } from '../../../lib/api/dashLayout';

// gridstack 기반 위젯 대시보드 래퍼 — 사용자별 배치 저장.
//
// React × gridstack 공존 규칙(중요):
//   · 위젯 목록은 마운트 동안 고정(id 불변) — React는 위젯 "내용"만 다시 그리고,
//     위치/크기(gs-* 속성·inline style)는 init 이후 gridstack이 소유한다.
//   · gs-* 속성은 최초 1회 계산한 posRef 값으로만 렌더 → 리렌더 시 diff가 없어
//     React가 gridstack이 바꾼 DOM을 되돌리지 않는다.
//   · 'gridstack' 모듈은 useEffect에서 동적 import(SSR 안전). CSS는 _app.js에서.
//
// props:
//   dashKey : 'dash1' | 'dash2' | 'dash3' | 'dashIep' (저장 키)
//   color   : 섹션 색 (위젯 머리줄 포인트)
//   widgets : [{ id, title, x, y, w, h, minW?, minH?, body }]
export default function DashGrid({ dashKey, color, widgets }) {
  const toast = useToast();
  const ref = useRef(null);          // .grid-stack 컨테이너
  const gridRef = useRef(null);      // GridStack 인스턴스
  const posRef = useRef(null);       // 최초 렌더에 쓸 위치(저장본∪기본값) — 이후 불변
  const saveTimer = useRef(null);
  const suppressSave = useRef(false);
  const editingRef = useRef(false);  // change 핸들러에서 최신 편집 상태 참조
  const [ready, setReady] = useState(false);   // 저장된 배치 로드 완료
  const [editing, setEditing] = useState(false);

  // 1) 저장된 배치 로드(1회) → 기본값과 병합해 posRef 확정
  useEffect(() => {
    let alive = true;
    (async () => {
      let saved = [];
      try {
        const d = await fetchDashLayout(dashKey);
        if (Array.isArray(d.layout)) saved = d.layout;
      } catch (_e) { /* 저장본 없음/실패 → 기본 배치 */ }
      if (!alive) return;
      const by = {};
      saved.forEach((n) => { if (n && n.id) by[n.id] = n; });
      const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
      posRef.current = Object.fromEntries(widgets.map((w) => [w.id, {
        x: num(by[w.id]?.x, w.x), y: num(by[w.id]?.y, w.y),
        w: num(by[w.id]?.w, w.w), h: num(by[w.id]?.h, w.h),
      }]));
      setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashKey]);

  // 2) 배치가 준비되면 gridstack 초기화(1회). 언마운트 시 파괴.
  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    (async () => {
      const { GridStack } = await import('gridstack');
      if (!alive || !ref.current || gridRef.current) return;
      const grid = GridStack.init({
        column: 12,
        cellHeight: 24,                 // 촘촘한 셀 — sizeToContent 반올림 여백 최소화
        margin: 8,
        float: false,
        staticGrid: true,               // 기본 잠금 — 표 클릭 등 오조작 방지
        sizeToContent: true,            // 위젯 높이 = 내용 높이(내부 스크롤 금지)
        handle: '.dw-head',             // 머리줄로만 드래그
        columnOpts: { breakpointForWindow: true, breakpoints: [{ w: 860, c: 1 }] },
      }, ref.current);
      grid.on('change', () => {
        // 내용 증감에 따른 자동 높이 조절은 저장하지 않는다 — 편집 모드에서
        // 사용자가 직접 움직였을 때만 배치를 저장.
        if (suppressSave.current || !editingRef.current) return;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(persist, 700);
      });
      gridRef.current = grid;
    })();
    return () => {
      alive = false;
      clearTimeout(saveTimer.current);
      if (gridRef.current) { gridRef.current.destroy(false); gridRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function persist() {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const nodes = (grid.save(false) || []).map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
      if (nodes.length) await saveDashLayout(dashKey, nodes);
    } catch (_e) {
      toast('배치 저장에 실패했어요. 네트워크를 확인해주세요.', 'error');
    }
  }

  function toggleEdit() {
    const next = !editing;
    setEditing(next);
    editingRef.current = next;
    gridRef.current?.setStatic(!next);
    if (!next) { clearTimeout(saveTimer.current); persist(); } // 편집 종료 시 확정 저장
  }

  async function reset() {
    const grid = gridRef.current;
    if (!grid) return;
    suppressSave.current = true;
    try {
      grid.load(widgets.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })));
      await resetDashLayout(dashKey);
      toast('기본 배치로 되돌렸어요.', 'success');
    } catch (_e) {
      toast('초기화에 실패했어요.', 'error');
    } finally {
      suppressSave.current = false;
    }
  }

  const initialPos = useMemo(() => posRef.current, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready || !initialPos) return <div className="empty-state"><span className="emoji">🧩</span>위젯 배치를 불러오는 중…</div>;

  return (
    <>
      <div className="dz-gridbar">
        {editing ? (
          <>
            <span className="dz-gridhint">⠿ 머리줄을 끌어 위치를 바꾸고, 오른쪽 아래 모서리로 크기를 조절하세요 — 자동 저장됩니다.</span>
            <button className="btn btn-sm btn-ghost" onClick={reset}>↺ 기본 배치</button>
            <button className="btn btn-sm btn-pri" onClick={toggleEdit}>✅ 편집 완료</button>
          </>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={toggleEdit} title="위젯을 원하는 배치로 정리하고 저장해요">🧩 위젯 편집</button>
        )}
      </div>
      <div ref={ref} className={'grid-stack dz-grid' + (editing ? ' editing' : '')} style={{ '--wc': color }}>
        {widgets.map((w) => {
          const p = initialPos[w.id];
          return (
            <div
              key={w.id}
              className="grid-stack-item"
              gs-id={w.id}
              gs-x={p.x} gs-y={p.y} gs-w={p.w} gs-h={p.h}
              gs-min-w={w.minW || 2}
            >
              {/* sizeToContent는 item-content의 '첫 번째 자식 하나'의 높이를 측정한다 —
                  반드시 .dw 단일 래퍼 구조를 유지할 것(형제를 추가하면 높이 계산이 깨짐). */}
              <div className="grid-stack-item-content">
                <div className="dw">
                  <div className="dw-head">
                    <span className="dw-grip" aria-hidden="true">⠿</span>
                    <span className="dw-title">{w.title}</span>
                  </div>
                  <div className="dw-body">{w.body}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
