import { useCallback, useEffect, useState } from 'react';
import { useStudents } from '../../../contexts/StudentContext';
import { fetchDashboard } from '../../../lib/api/dashboard';

// 영역별 대시보드 공용 조각 (kimju.zip '교사기록실' 패턴 참고):
//   KPI 카드 · 업무 흐름 스트립 · 상태 칩 · 검토 필요 목록 · 날짜 유틸 · 데이터 훅

// ── 데이터 훅: 반·학기 기준 집계 1회 로드 ──────────────────────
// 4개 대시보드가 같은 /api/dashboard 응답을 쓰므로 모듈 캐시로 공유한다:
//   · 진행 중(inflight) 요청 공유 — StrictMode(dev)의 이중 마운트에도 fetch 1번
//   · 60초 TTL — 대시보드 간 이동(T1→T2→T3) 시 재요청 없이 즉시 표시
//   · reload()는 강제 새로고침(캐시 무시), 기록 저장 후엔 invalidateDashboard()
const dashCache = { key: null, data: null, ts: 0, promise: null };
const DASH_TTL = 60 * 1000;

/** 기록이 바뀐 뒤 다음 대시보드 진입에서 새로 불러오게 하고 싶을 때 호출. */
export function invalidateDashboard() {
  dashCache.key = null; dashCache.data = null; dashCache.ts = 0; dashCache.promise = null;
}

export function useDashboard() {
  const { curClassId, curSemester } = useStudents();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (force) => {
    if (!curClassId) { setData(null); setLoading(false); return; }
    const key = `${curClassId}:${curSemester}`;
    // 신선한 캐시 → 요청 없이 바로 사용
    if (!force && dashCache.key === key && dashCache.data && Date.now() - dashCache.ts < DASH_TTL) {
      setData(dashCache.data); setLoading(false); setError('');
      return;
    }
    setLoading(true); setError('');
    try {
      // 같은 키로 이미 요청 중이면 그 Promise를 같이 기다린다(중복 fetch 방지).
      if (force || dashCache.key !== key || !dashCache.promise) {
        dashCache.key = key;
        dashCache.promise = fetchDashboard(curClassId, curSemester)
          .then((d) => { dashCache.data = d; dashCache.ts = Date.now(); return d; })
          .finally(() => { dashCache.promise = null; });
      }
      const p = dashCache.promise;
      const d = p ? await p : dashCache.data;
      setData(d);
    } catch (e) {
      setError(e.message || '대시보드를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  }, [curClassId, curSemester]);

  useEffect(() => { load(false); }, [load]);
  const reload = useCallback(() => load(true), [load]);
  return { data, loading, error, reload };
}

// ── 날짜 유틸 ──────────────────────────────────────────────────
export function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
export function daysAgo(v) {
  const d = toDate(v);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '-';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
export function agoLabel(v) {
  const n = daysAgo(v);
  if (n == null) return '기록 없음';
  if (n <= 0) return '오늘';
  if (n === 1) return '어제';
  return `${n}일 전`;
}

// ── KPI 카드 줄 ────────────────────────────────────────────────
export function KpiRow({ children }) {
  return <div className="dz-kpis">{children}</div>;
}
export function Kpi({ icon, value, label, hint, color, onClick }) {
  return (
    <div
      className={'dz-kpi' + (onClick ? ' click' : '')}
      style={color ? { '--kc': color } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="dz-kpi-top"><span className="ic" aria-hidden="true">{icon}</span><span className="v">{value}</span></div>
      <div className="dz-kpi-label">{label}</div>
      {hint && <div className="dz-kpi-hint">{hint}</div>}
    </div>
  );
}

// 위젯(DashGrid) 안에서 쓰는 상자 없는 KPI — 위젯 자체가 카드 역할을 한다.
export function KpiBody({ icon, value, label, hint, onClick }) {
  return (
    <div className={'dz-kpib' + (onClick ? ' click' : '')} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="dz-kpi-top"><span className="ic" aria-hidden="true">{icon}</span><span className="v">{value}</span></div>
      <div className="dz-kpi-label">{label}</div>
      {hint && <div className="dz-kpi-hint">{hint}</div>}
    </div>
  );
}

// ── 업무 흐름 스트립 (성취기준 → 평가설계 → … 스타일) ──────────
export function FlowStrip({ steps, color }) {
  return (
    <div className="dz-flow" style={color ? { '--fc': color } : undefined}>
      {steps.map((s, i) => (
        <div className="dz-flow-item" key={s.key || i}>
          {i > 0 && <span className="dz-flow-arrow" aria-hidden="true">→</span>}
          <button
            type="button"
            className={'dz-flow-step ' + (s.state || 'todo')}
            onClick={s.onClick}
            title={s.hint || undefined}
          >
            <span className="fs-ic" aria-hidden="true">{s.state === 'done' ? '✓' : s.icon}</span>
            <span className="fs-body">
              <b>{s.label}</b>
              {s.hint && <small>{s.hint}</small>}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── 상태 칩 ────────────────────────────────────────────────────
// kind: ok(완료·초록) | warn(진행/임박·주황) | err(검토필요·빨강) | muted(미작성·회색) | info(파랑)
export function Chip({ kind = 'muted', children, onClick, title }) {
  const El = onClick ? 'button' : 'span';
  return <El type={onClick ? 'button' : undefined} className={`dz-chip ${kind}${onClick ? ' click' : ''}`} onClick={onClick} title={title}>{children}</El>;
}

// ── 검토가 필요한 항목 ─────────────────────────────────────────
export function ReviewList({ items, emptyText = '검토할 항목이 없어요. 잘 관리되고 있습니다 👍' }) {
  if (!items.length) return <div className="dz-review-empty">{emptyText}</div>;
  return (
    <ul className="dz-review">
      {items.map((it, i) => (
        <li key={i} className={'dz-review-item ' + (it.level || 'warn')}>
          <span className="ri-dot" aria-hidden="true" />
          <div className="ri-body">
            <div className="ri-t">{it.text}</div>
            {it.sub && <div className="ri-s">{it.sub}</div>}
          </div>
          {it.cta && <button className="btn btn-sm btn-ghost" onClick={it.onClick}>{it.cta}</button>}
        </li>
      ))}
    </ul>
  );
}

// ── 로딩/빈 상태 ───────────────────────────────────────────────
export function DashLoading({ label = '대시보드를 불러오는 중…' }) {
  return <div className="empty-state"><span className="emoji">⏳</span>{label}</div>;
}
export function DashError({ error, onRetry }) {
  return (
    <div className="empty-state">
      <span className="emoji">⚠️</span>{error}
      <div style={{ marginTop: 12 }}><button className="btn btn-ghost" onClick={onRetry}>다시 시도</button></div>
    </div>
  );
}
