import { useStudents } from '../../../contexts/StudentContext';
import { SECTIONS } from '../../../lib/tiers';
import DashGrid from './DashGrid';
import { useDashboard, KpiBody, Chip, ReviewList, DashLoading, DashError, agoLabel, daysAgo, fmtDate } from './DashBits';

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

  const reviews = [];
  if (t2.groups.length === 0) {
    reviews.push({ level: 'err', text: '운영 중인 소그룹이 없어요', sub: '지원이 더 필요한 학생 몇 명을 소그룹으로 묶어보세요', cta: '그룹 만들기', onClick: () => onNavigate('tier2') });
  }
  const notToday = memberIds.filter((sid) => !t2.cico[sid]?.today);
  if (memberIds.length > 0 && notToday.length > 0) {
    reviews.push({ level: 'warn', text: `오늘 CICO 기록이 없는 학생 ${notToday.length}명`, sub: notToday.slice(0, 5).map(codeOf).join(', ') + (notToday.length > 5 ? ' 외' : ''), cta: '기록하기', onClick: () => onNavigate('tier2') });
  }
  memberIds.forEach((sid) => {
    const c = t2.cico[sid];
    const d = c?.last ? daysAgo(c.last) : null;
    if (d != null && d >= 7) reviews.push({ level: 'err', text: `${codeOf(sid)} — ${d}일째 CICO 기록 없음`, sub: '중단됐다면 그룹 구성/목표를 다시 점검해보세요', cta: '열기', onClick: () => onNavigate('tier2') });
    if (c && c.cnt14 >= 3 && c.avg14 != null && c.avg14 >= 80) reviews.push({ level: 'ok', text: `${codeOf(sid)} — 최근 2주 수행률 ${c.avg14}% 👏`, sub: '목표 상향 또는 Tier 축소(졸업)를 검토해볼 수 있어요', cta: '검토', onClick: () => onNavigate('tier2') });
  });

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
    { id: 'reviews', title: `🔎 검토가 필요한 항목${reviews.filter((r) => r.level !== 'ok').length ? ` (${reviews.filter((r) => r.level !== 'ok').length})` : ''}`, x: 0, y: 7, w: 6, h: 5, minW: 3, minH: 3, body: <ReviewList items={reviews} /> },
    { id: 'recent', title: '🕒 최근 CICO 기록', x: 6, y: 7, w: 6, h: 5, minW: 3, minH: 3, body: recentList },
  ];

  return <DashGrid dashKey="dash2" color={C} widgets={widgets} />;
}
