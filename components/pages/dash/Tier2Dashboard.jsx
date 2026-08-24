import { useStudents } from '../../../contexts/StudentContext';
import { SECTIONS } from '../../../lib/tiers';
import DashGrid from './DashGrid';
import { computeT2Reviews } from '../../../lib/dashReviews';
import { useDashboard, KpiBody, Chip, ReviewList, DashLoading, DashError, agoLabel, fmtDate } from './DashBits';

// Tier 2 대시보드 — 소그룹(CICO/DPR) 운영 현황 (gridstack 위젯 · 배치는 사용자별 저장)
export default function Tier2Dashboard({ onNavigate }) {
  const { curClass, curSemester, students } = useStudents();
  const { data, loading, error, reload } = useDashboard();
  const C = SECTIONS.t2.color;

  if (!curClass) return <div className="empty-state"><span className="emoji">👥</span>학급을 먼저 만들어주세요.</div>;
  if (loading) return <DashLoading />;
  if (error) return <DashError error={error} onRetry={reload} />;

  const t2 = data?.t2 || { groups: [], cico: {}, recent: [] };
  const codeOf = (sid) => data?.students?.find((s) => s.id === sid)?.code || `#${sid}`;
  const memberIds = [...new Set(t2.groups.flatMap((g) => g.members.map((m) => m.student_id)))];
  const todayDone = memberIds.filter((sid) => t2.cico[sid]?.today).length;
  const avgList = memberIds.map((sid) => t2.cico[sid]?.avg14).filter((v) => v != null);
  const avgAll = avgList.length ? Math.round(avgList.reduce((a, b) => a + b, 0) / avgList.length) : null;

  // 검토 규칙은 lib/dashReviews.js 단일 출처 — 여기서 onClick만 입힌다.
  const reviews = computeT2Reviews(data).map((it) => ({ ...it, onClick: () => onNavigate(it.page) }));

  // 📊 최근 2주 요일 패턴 — 날짜별 학급 평균 수행률 막대 (기록 없는 날은 빈 칸)
  const dailyMap = {};
  (t2.daily || []).forEach((r) => { dailyMap[String(r.date).slice(0, 10)] = r; });
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const wd = dt.getDay();
    if (wd === 0 || wd === 6) continue; // 주말 제외
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const rec = dailyMap[key];
    days.push({
      key,
      label: `${dt.getMonth() + 1}/${dt.getDate()}`,
      wd: '일월화수목금토'[wd],
      pct: rec?.pct != null ? Math.round(Number(rec.pct) * 100) : null,
      n: rec?.n || 0,
    });
  }
  const dailyBars = days.every((d) => d.pct == null) ? (
    <div className="dz-review-empty">최근 2주 CICO 기록이 없어요. 기록이 쌓이면 요일 패턴이 보여요.</div>
  ) : (
    <>
      <div className="dw-sub">날짜별 학급 평균 수행률 — 특정 요일이 유독 낮다면 그날의 일과·환경을 점검해보세요</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96, padding: '4px 2px' }}>
        {days.map((d) => (
          <div key={d.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={d.pct != null ? `${d.label} · ${d.pct}% (${d.n}건)` : `${d.label} · 기록 없음`}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>{d.pct != null ? d.pct : ''}</div>
            <div style={{
              width: '70%', borderRadius: '3px 3px 0 0',
              height: d.pct != null ? `${Math.max(4, Math.round(d.pct * 0.56))}px` : '3px',
              background: d.pct == null ? 'var(--border, #e5e7eb)' : d.pct >= 80 ? C : d.pct >= 60 ? '#e8a23d' : '#d94b3f',
              opacity: d.pct == null ? 0.7 : 1,
            }} />
            <div style={{ fontSize: 9.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.wd}</div>
          </div>
        ))}
      </div>
    </>
  );

  const groupsTable = t2.groups.length === 0 ? (
    <div className="dz-review-empty">아직 소그룹이 없어요. <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => onNavigate('tier2')}>＋ 소그룹 만들기</button></div>
  ) : (
    <div className="dz-table-wrap">
      <table className="dz-table">
        <thead><tr><th>그룹</th><th>구성원</th><th>오늘 기록</th><th>최근 수행률</th><th>마지막 기록</th><th></th></tr></thead>
        <tbody>
          {t2.groups.map((g) => {
            const ids = g.members.map((m) => m.student_id);
            const done = ids.filter((sid) => t2.cico[sid]?.today).length;
            const avgs = ids.map((sid) => t2.cico[sid]?.avg14).filter((v) => v != null);
            const avg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
            const lasts = ids.map((sid) => t2.cico[sid]?.last).filter(Boolean).sort();
            const last = lasts[lasts.length - 1];
            return (
              <tr key={g.id}>
                <td className="strong">{g.name}{g.members.some((m) => m.tier3) && <span title="Tier 3 대상 포함" style={{ marginLeft: 6 }}>🎯</span>}</td>
                <td>{ids.length ? ids.map(codeOf).join(', ') : <span className="dim">없음</span>}</td>
                <td>{ids.length === 0 ? '-' : done === ids.length ? <Chip kind="ok">완료 {done}/{ids.length}</Chip> : <Chip kind={done === 0 ? 'err' : 'warn'}>{done}/{ids.length}</Chip>}</td>
                <td>{avg != null ? <Chip kind={avg >= 80 ? 'ok' : avg >= 60 ? 'warn' : 'err'}>{avg}%</Chip> : <span className="dim">-</span>}</td>
                <td>{last ? agoLabel(last) : <span className="dim">기록 없음</span>}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => onNavigate('tier2')}>열기</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const recentList = (t2.recent || []).length === 0 ? (
    <div className="dz-review-empty">아직 CICO 기록이 없어요.</div>
  ) : (
    <ul className="recent-list">
      {t2.recent.map((r, i) => (
        <li key={i} className="recent-item">
          <span className="recent-dot" style={{ background: C }} />
          <div className="recent-body">
            <div className="t">{r.code} · {r.max_score ? `${r.total_score}/${r.max_score}점` : '기록'}</div>
            <div className="d">{r.comment || 'CICO 일일 점검'}</div>
          </div>
          <span className="recent-when">{fmtDate(r.date)}</span>
        </li>
      ))}
    </ul>
  );

  const widgets = [
    { id: 'kpi-groups', title: '운영 소그룹', x: 0, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="👥" value={t2.groups.length} label="운영 소그룹" hint={`${curClass.name} · ${curSemester}학기`} onClick={() => onNavigate('tier2')} /> ) },
    { id: 'kpi-members', title: '대상 학생', x: 3, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🧑‍🎓" value={`${memberIds.length}명`} label="소그룹 대상 학생" hint={`반 전체 ${students.length}명 중`} /> ) },
    { id: 'kpi-today', title: '오늘 CICO', x: 6, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="📝" value={memberIds.length ? `${todayDone}/${memberIds.length}` : '-'} label="오늘 CICO 기록" hint={memberIds.length ? (todayDone === memberIds.length ? '오늘 기록 완료!' : '다음: 미기록 학생 체크인') : '대상 학생 없음'} onClick={() => onNavigate('tier2')} /> ) },
    { id: 'kpi-avg', title: '평균 수행률', x: 9, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="📈" value={avgAll != null ? `${avgAll}%` : '-'} label="최근 2주 평균 수행률" hint={avgList.length ? `기록 있는 학생 ${avgList.length}명 기준` : '기록이 쌓이면 표시돼요'} /> ) },
    { id: 'groups', title: '👥 소그룹 현황', x: 0, y: 2, w: 12, h: 5, minW: 4, minH: 3, body: groupsTable },
    { id: 'daily', title: '📊 최근 2주 수행률 — 요일 패턴', x: 0, y: 7, w: 12, h: 4, minW: 4, minH: 3, body: dailyBars },
    { id: 'reviews', title: `🔎 검토가 필요한 항목${reviews.filter((r) => r.level !== 'ok').length ? ` (${reviews.filter((r) => r.level !== 'ok').length})` : ''}`, x: 0, y: 11, w: 6, h: 5, minW: 3, minH: 3, body: <ReviewList items={reviews} /> },
    { id: 'recent', title: '🕒 최근 CICO 기록', x: 6, y: 11, w: 6, h: 5, minW: 3, minH: 3, body: recentList },
  ];

  return <DashGrid dashKey="dash2" color={C} widgets={widgets} />;
}
