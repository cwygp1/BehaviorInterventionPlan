import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useStudents } from '../../../contexts/StudentContext';
import { fetchDashLayout, saveDashLayout, resetDashLayout } from '../../../lib/api/dashLayout';
import { validateChart, titleOf, dashHasCharts, MAX_CHARTS } from '../../../lib/chartCatalog';
import ChartWidget from '../../ui/charts/ChartWidget';
import ChartBuilderModal from '../../modals/ChartBuilderModal';

// gridstack 기반 위젯 대시보드 래퍼 — 사용자별 배치 저장.
//
// React × gridstack 공존 규칙(중요):
//   · 위젯 목록은 한 세대(gen) 동안 고정 — React는 위젯 "내용"만 다시 그리고,
//     위치/크기(gs-* 속성·inline style)는 init 이후 gridstack이 소유한다.
//   · gs-* 속성은 세대 시작 시 계산한 posRef 값으로만 렌더 → 리렌더 시 diff가 없어
//     React가 gridstack이 바꾼 DOM을 되돌리지 않는다.
//   · 숨기기/복원처럼 위젯 "목록"이 바뀔 때는 gen을 올려 그리드를 통째로
//     재마운트한다(부분 add/remove로 gridstack과 React가 싸우지 않도록).
//   · 'gridstack' 모듈은 useEffect에서 동적 import(SSR 안전). CSS는 _app.js에서.
//
// 0824: 편집 모드에서 위젯 숨기기(✕) / 복원(숨긴 위젯 칩) 추가 — 저장 노드에
//   hidden 플래그로 기록하고 위치는 보존해 복원 시 원래 자리 근처로 돌아온다.
// TODO(위젯 갤러리): 전체 위젯 카탈로그에서 골라 "추가"하는 방식은 각 대시보드에
//   하드코딩된 위젯 정의를 카탈로그로 리팩터링한 뒤에 — 지금은 숨김/복원만 제공.
// 0914 P0(mds/30 §3-5 dash): 편집 모드에 들어가지 않고도 '⚙ 보기 설정' 체크리스트로 위젯을
//   즉시 보이거나 숨길 수 있다(같은 hidden 플래그·같은 저장). 드래그·폭 조절은 '배치 바꾸기(고급)'
//   = 기존 편집 모드 그대로. ↺ 기본 배치는 확인창을 거친다. 높이는 내용에 맞춰 자동(sizeToContent)이라
//   손으로 늘린 높이는 유지되지 않는다 — 힌트 문구도 그 사실대로.
// 1001(mds/45): 사용자 차트 위젯 — 저장 노드에 chart 설정이 있으면 그 노드가 곧 위젯이다
//   (📈 차트 추가 → ChartBuilderModal → 노드 추가, ✎ 수정, ✕ 삭제). 목록이 바뀌는 조작이므로
//   숨김/복원과 같은 gen 재마운트 경로를 탄다. 대시보드당 MAX_CHARTS 개.
//
// props:
//   dashKey : 'dash1' | 'dash2' | 'dash3' | 'dashIep' (저장 키)
//   color   : 섹션 색 (위젯 머리줄 포인트)
//   widgets : [{ id, title, x, y, w, h, minW?, minH?, body }]
//   onNavigate : 사용자 차트에서 학생 축을 눌렀을 때 이동(없으면 클릭 이동 없음)
const CHART_W = 6;
const CHART_H = 11;

export default function DashGrid({ dashKey, color, widgets, onNavigate }) {
  const toast = useToast();
  const { students, tier2Groups } = useStudents();
  const ref = useRef(null);          // .grid-stack 컨테이너
  const gridRef = useRef(null);      // GridStack 인스턴스
  const posRef = useRef(null);       // 현 세대 렌더에 쓸 위치(저장본∪기본값)
  const hiddenRef = useRef(new Set()); // persist에서 최신 숨김 목록 참조
  const chartsRef = useRef([]);      // persist에서 최신 사용자 차트 노드 참조 [{ id, chart }]
  const saveTimer = useRef(null);
  const suppressSave = useRef(false);
  const editingRef = useRef(false);  // change 핸들러에서 최신 편집 상태 참조
  const [ready, setReady] = useState(false);   // 저장된 배치 로드 완료
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(() => new Set()); // 숨긴 위젯 id
  const [charts, setCharts] = useState([]);    // 사용자 차트 노드 [{ id, chart }]
  const [gen, setGen] = useState(0); // 위젯 목록이 바뀔 때 그리드 재마운트용 세대 번호
  const [settingsOpen, setSettingsOpen] = useState(false); // ⚙ 보기 설정 드롭다운
  const [builder, setBuilder] = useState(null); // null | { id: null(새로) | 기존 id, chart }
  const canChart = dashHasCharts(dashKey);

  // 1) 저장된 배치 로드(1회) → 기본값과 병합해 posRef·숨김 목록·사용자 차트 확정
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
      // 사용자 차트 노드: chart 설정이 있고 카탈로그 검증을 통과한 것만
      const userCharts = saved.filter((n) => n && n.id && n.chart && !validateChart(n.chart, dashKey)).slice(0, MAX_CHARTS).map((n) => ({ id: n.id, chart: n.chart }));
      const pos = Object.fromEntries(widgets.map((w) => [w.id, {
        x: num(by[w.id]?.x, w.x), y: num(by[w.id]?.y, w.y),
        w: num(by[w.id]?.w, w.w), h: num(by[w.id]?.h, w.h),
      }]));
      userCharts.forEach((c) => { pos[c.id] = { x: num(by[c.id]?.x, 0), y: num(by[c.id]?.y, 0), w: num(by[c.id]?.w, CHART_W), h: num(by[c.id]?.h, CHART_H) }; });
      posRef.current = pos;
      const hid = new Set([...widgets.map((w) => w.id), ...userCharts.map((c) => c.id)].filter((id) => by[id]?.hidden));
      hiddenRef.current = hid;
      chartsRef.current = userCharts;
      setHidden(hid);
      setCharts(userCharts);
      setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashKey]);

  // 2) 배치가 준비되면 gridstack 초기화. 세대(gen)가 바뀌면 재마운트·재초기화.
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
        staticGrid: !editingRef.current, // 기본 잠금 — 편집 중 재마운트면 잠그지 않는다
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
  }, [ready, gen]);

  // 사용자 차트 노드 → 위젯 정의. 제목 문맥(학생 코드·소그룹 이름)은 컨텍스트에서.
  const chartWidgets = useMemo(() => charts.map((c) => {
    const f = c.chart.filter || {};
    const studentCode = f.student ? (students.find((s) => s.id === Number(f.student))?.code || '') : '';
    const groupName = f.group ? ((tier2Groups || []).find((g) => g.id === Number(f.group))?.name || '') : '';
    return {
      id: c.id, user: true, chart: c.chart, help: 'dz-user-chart', minW: 4, minH: 4,
      title: `📈 ${titleOf(c.chart, { studentCode, groupName })}`,
      x: 0, y: 0, w: CHART_W, h: CHART_H,
      body: <ChartWidget cfg={c.chart} dashKey={dashKey} color={color} onNavigate={onNavigate} />,
    };
  }), [charts, students, tier2Groups, dashKey, color, onNavigate]);
  const allWidgets = useMemo(() => [...widgets, ...chartWidgets], [widgets, chartWidgets]);

  // 그리드가 들고 있는 현재 위치를 posRef로 되읽는다(재마운트·저장 전 공용).
  function syncPosFromGrid() {
    const grid = gridRef.current;
    if (!grid) return;
    (grid.save(false) || []).forEach((n) => {
      if (n.id && posRef.current[n.id]) {
        posRef.current[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
      }
    });
  }

  async function persist() {
    if (!posRef.current) return;
    syncPosFromGrid();
    try {
      // 숨긴 위젯도 마지막 위치와 함께 저장 — 복원 시 원래 자리 근처로 돌아온다.
      const nodes = widgets.map((w) => ({
        id: w.id,
        ...posRef.current[w.id],
        ...(hiddenRef.current.has(w.id) ? { hidden: true } : {}),
      }));
      chartsRef.current.forEach((c) => {
        nodes.push({ id: c.id, ...(posRef.current[c.id] || { x: 0, y: 0, w: CHART_W, h: CHART_H }), ...(hiddenRef.current.has(c.id) ? { hidden: true } : {}), chart: c.chart });
      });
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

  // 목록이 바뀌는 조작 공용 — 위치를 되읽고 그리드를 내린 뒤 세대를 올리고 저장을 예약한다.
  function remount(apply) {
    syncPosFromGrid();
    if (gridRef.current) { gridRef.current.destroy(false); gridRef.current = null; }
    apply();
    setGen((g) => g + 1);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 700);
  }

  // 위젯 숨기기/복원
  function setWidgetHidden(id, hide) {
    remount(() => {
      const next = new Set(hiddenRef.current);
      if (hide) next.add(id); else next.delete(id);
      hiddenRef.current = next;
      setHidden(next);
    });
  }

  // 사용자 차트 추가·수정
  function saveChart(cfg) {
    const editingId = builder?.id || null;
    setBuilder(null);
    remount(() => {
      let next;
      if (editingId) next = chartsRef.current.map((c) => (c.id === editingId ? { id: c.id, chart: cfg } : c));
      else {
        const id = `chart-${Date.now().toString(36)}`;
        const maxY = Math.max(0, ...Object.values(posRef.current).map((p) => (p.y || 0) + (p.h || 0)));
        posRef.current[id] = { x: 0, y: maxY, w: CHART_W, h: CHART_H };
        next = [...chartsRef.current, { id, chart: cfg }];
      }
      chartsRef.current = next;
      setCharts(next);
    });
    toast(editingId ? '차트를 바꿨어요.' : '차트를 추가했어요. 맨 아래에 있어요.', 'success');
  }

  function removeChart(id) {
    if (!window.confirm('이 차트를 지울까요? (기록은 그대로예요)')) return;
    remount(() => {
      const next = chartsRef.current.filter((c) => c.id !== id);
      chartsRef.current = next;
      setCharts(next);
      delete posRef.current[id];
      if (hiddenRef.current.has(id)) { const h = new Set(hiddenRef.current); h.delete(id); hiddenRef.current = h; setHidden(h); }
    });
  }

  async function reset() {
    const n = chartsRef.current.length;
    if (!window.confirm(`위젯 배치와 숨김을 기본값으로 되돌릴까요?\n(기록·데이터는 그대로예요. 화면 배치만 바뀝니다.${n ? `\n내가 만든 차트 ${n}개도 지워져요.` : ''})`)) return;
    suppressSave.current = true;
    try {
      syncPosFromGrid();
      if (gridRef.current) { gridRef.current.destroy(false); gridRef.current = null; }
      posRef.current = Object.fromEntries(widgets.map(({ id, x, y, w, h }) => [id, { x, y, w, h }]));
      hiddenRef.current = new Set();
      chartsRef.current = [];
      setHidden(new Set());
      setCharts([]);
      setGen((g) => g + 1);
      await resetDashLayout(dashKey);
      toast('기본 배치로 되돌렸어요.', 'success');
    } catch (_e) {
      toast('초기화에 실패했어요.', 'error');
    } finally {
      suppressSave.current = false;
    }
  }

  const initialPos = useMemo(() => posRef.current, [ready, gen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready || !initialPos) return <div className="empty-state"><span className="emoji">🧩</span>위젯 배치를 불러오는 중…</div>;

  const visible = allWidgets.filter((w) => !hidden.has(w.id));
  const hiddenWidgets = allWidgets.filter((w) => hidden.has(w.id));
  const chartFull = charts.length >= MAX_CHARTS;

  return (
    <>
      <div className="dz-gridbar">
        {editing ? (
          <>
            <span className="dz-gridhint">⠿ 머리줄을 끌어 위치를 바꾸고, 모서리로 폭을 조절, ✕로 숨기기 — 자동 저장됩니다. (높이는 내용에 맞춰 자동)</span>
            <button className="btn btn-sm btn-ghost" onClick={reset}>↺ 기본 배치</button>
            <button className="btn btn-sm btn-pri" onClick={toggleEdit}>✅ 편집 완료</button>
          </>
        ) : (
          <>
            <div className="dz-settings">
              <button className="btn btn-sm btn-ghost" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} aria-haspopup="menu" title="보일 위젯을 고르세요 — 바로 적용돼요">
                ⚙ 보기 설정 {settingsOpen ? '▴' : '▾'}{hiddenWidgets.length ? ` · 숨김 ${hiddenWidgets.length}` : ''}
              </button>
              {settingsOpen && (
                <>
                  <div className="dz-settings-backdrop" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
                  <div className="dz-settings-drop" role="menu" aria-label="보일 위젯 선택">
                    <div className="dz-settings-title">보일 위젯 (체크를 풀면 바로 숨겨져요)</div>
                    {allWidgets.map((w) => (
                      <label key={w.id} className="dz-settings-item">
                        <input type="checkbox" checked={!hidden.has(w.id)} onChange={(e) => setWidgetHidden(w.id, !e.target.checked)} />
                        <span>{w.title}</span>
                      </label>
                    ))}
                    {canChart && (
                      <>
                        <div className="dz-settings-sep" />
                        <button className="btn btn-sm btn-ghost" data-help="dz-chart-add" disabled={chartFull} title={chartFull ? `차트는 ${MAX_CHARTS}개까지예요 — 하나를 지우면 추가할 수 있어요` : '기록 종류·가로축·세로축·모양을 골라 내 차트를 만들어요'}
                          onClick={() => { setSettingsOpen(false); setBuilder({ id: null, chart: null }); }}>
                          📈 차트 추가 ({charts.length}/{MAX_CHARTS})
                        </button>
                      </>
                    )}
                    <button className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={() => { setSettingsOpen(false); toggleEdit(); }}>🧩 배치 바꾸기 (고급) — 끌어서 위치·폭 조절</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => { setSettingsOpen(false); reset(); }}>↺ 기본 배치로</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {editing && hiddenWidgets.length > 0 && (
        <div className="dz-hiddenbar">
          <span className="dz-hiddenlabel">숨긴 위젯 ({hiddenWidgets.length}) — 누르면 복원:</span>
          {hiddenWidgets.map((w) => (
            <button key={w.id} className="dz-hiddenchip" onClick={() => setWidgetHidden(w.id, false)} title="이 위젯을 대시보드에 다시 표시">
              ➕ {w.title}
            </button>
          ))}
        </div>
      )}
      <div ref={ref} key={gen} className={'grid-stack dz-grid' + (editing ? ' editing' : '')} style={{ '--wc': color }}>
        {visible.map((w) => {
          const p = initialPos[w.id] || { x: 0, y: 0, w: CHART_W, h: CHART_H };
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
                {/* data-help: ❓ 도움말 모드에서 위젯 설명(lib/helpText.js HELP_TEXT) — 속성만이라 높이 측정과 무관 */}
                <div className="dw" data-help={w.help || undefined}>
                  <div className="dw-head">
                    <span className="dw-grip" aria-hidden="true">⠿</span>
                    <span className="dw-title">{w.title}</span>
                    {w.user && !editing && (
                      <span className="dw-tools">
                        <button className="dw-tool" onClick={() => setBuilder({ id: w.id, chart: w.chart })} title="이 차트의 축·모양 바꾸기" aria-label={`${w.title} 바꾸기`}>✎</button>
                        <button className="dw-tool danger" onClick={() => removeChart(w.id)} title="이 차트 지우기" aria-label={`${w.title} 지우기`}>✕</button>
                      </span>
                    )}
                    {editing && (
                      <button className="dw-hide" onClick={() => setWidgetHidden(w.id, true)} title="이 위젯 숨기기 (편집 바의 '숨긴 위젯'에서 복원)" aria-label={`${w.title} 위젯 숨기기`}>✕</button>
                    )}
                  </div>
                  <div className="dw-body">{w.body}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {canChart && (
        <ChartBuilderModal
          open={!!builder}
          onClose={() => setBuilder(null)}
          dashKey={dashKey}
          color={color}
          initial={builder?.chart || null}
          onSave={saveChart}
        />
      )}
    </>
  );
}
