import { useEffect, useState } from 'react';
import { useStudents } from '../../../contexts/StudentContext';
import { fetchChartData } from '../../../lib/api/chartData';
import { SOURCES, dimOf, hintOf, titleOf, OTHER_LABEL } from '../../../lib/chartCatalog';
import BarChart from './BarChart';
import LineChart from './LineChart';
import HeatGrid from './HeatGrid';

// 사용자 차트 위젯 본문 — 설정(cfg) → 데이터 요청 → 로딩/빈 상태/오류/차트 (1001, mds/45 §5-2).
// 높이는 고정 상자(.uc-box) 안에 맞춰 그린다: gridstack sizeToContent 가 init 때 잰 높이가 데이터 도착 뒤에도 안 바뀌게.
// props: cfg, dashKey, color, onNavigate, preview(모달 미리보기 — 클릭 이동 끔)
export default function ChartWidget({ cfg, dashKey, color, onNavigate, preview = false }) {
  const { curClassId, curSemester, students, tier2Groups, selectStudent } = useStudents();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const cfgKey = JSON.stringify(cfg);

  useEffect(() => {
    if (!curClassId || !cfg) return undefined;
    let alive = true;
    setLoading(true); setError('');
    fetchChartData(curClassId, curSemester, dashKey, cfg, tick > 0)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message || '불러오지 못했어요'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curClassId, curSemester, dashKey, cfgKey, tick]);

  const src = SOURCES[cfg?.source];
  const dim = dimOf(cfg?.source, cfg?.x);
  if (!src || !dim) return <div className="uc-box"><div className="dz-review-empty">설정이 올바르지 않아요. ✎로 다시 골라주세요.</div></div>;

  const studentCode = cfg.filter?.student ? (students.find((s) => s.id === Number(cfg.filter.student))?.code || '') : '';
  const groupName = cfg.filter?.group ? (tier2Groups?.find((g) => g.id === Number(cfg.filter.group))?.name || '') : '';
  const aria = titleOf(cfg, { studentCode, groupName });

  // 학생 축·격자 세로 클릭 → 그 학생을 고르고 소스 화면으로
  const goStudent = (sid) => {
    if (preview || !onNavigate || !sid) return;
    selectStudent(Number(sid));
    if (src.monitorTab) { try { sessionStorage.setItem('kb_monitor_tab', src.monitorTab); } catch (_e) { /* noop */ } }
    onNavigate(src.page);
  };

  let body;
  if (loading && !data) body = <div className="dz-review-empty">차트를 그리는 중…</div>;
  else if (error) body = <div className="dz-review-empty">{error} <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => setTick((t) => t + 1)}>다시 시도</button></div>;
  else if (!data || !data.x.length || data.meta?.n === 0 || allEmpty(data)) body = <div className="dz-review-empty">{src.empty}</div>;
  else if (cfg.chart === 'grid') {
    const s0 = data.series[0];
    body = (
      <HeatGrid x={data.x} rows={data.rows} cells={data.cells} unit={s0.unit} max={s0.max} color={color} higherIsBetter={s0.higherIsBetter}
        onPickRow={!preview && onNavigate ? (ri) => goStudent(data.rows[ri]?.key) : undefined} ariaLabel={aria} />
    );
  } else if (cfg.chart === 'line') {
    body = <LineChart x={data.x} series={data.series} color={color} bands={data.bands} refLine={data.refLine} ariaLabel={aria} />;
  } else {
    const horizontal = (dim.kind === 'student' || dim.kind === 'cat') && (data.x.length > 6 || data.x.some((it) => String(it.label).length > 4));
    body = (
      <BarChart x={data.x} series={data.series} color={color} bands={data.bands} horizontal={horizontal} ariaLabel={aria}
        onPick={dim.kind === 'student' && !preview && onNavigate ? (i) => goStudent(data.x[i]?.key) : undefined} />
    );
  }

  const hint = hintOf(cfg);
  const other = data?.meta?.otherShare >= 0.5 && data.x.some((it) => it.key === OTHER_LABEL)
    ? ' · 기타가 많아요 — 칩으로 기록하면 더 잘 묶여요' : '';
  return (
    <div className="uc-box" data-help="dz-user-chart">
      {(hint || other) && <div className="dw-sub">{hint}{other}</div>}
      <div className="uc-area">{body}</div>
    </div>
  );
}

// 값이 하나도 없으면(격자 전 칸 비움·시리즈 전부 null) 빈 상태 — 예: 월별 계획이 없는 IEP 목표만 있을 때
function allEmpty(data) {
  if (data.cells) return data.cells.every((row) => row.every((v) => v == null));
  return (data.series || []).every((s) => (s.values || []).every((v) => v == null));
}
