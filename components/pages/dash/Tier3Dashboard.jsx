import { useStudents } from '../../../contexts/StudentContext';
import { SECTIONS } from '../../../lib/tiers';
import DashGrid from './DashGrid';
import Sparkline from '../../ui/Sparkline';
import { computeT3Reviews } from '../../../lib/dashReviews';
import { useDashboard, KpiBody, Chip, ReviewList, DashLoading, DashError, agoLabel, daysAgo, fmtDate } from './DashBits';

// Tier 3 대시보드 — 학생별 진행 명부 (gridstack 위젯 · 배치는 사용자별 저장. 정식 워크플로는 8단계 — 개요 보드 참조)
// 0824 위젯 확장: 행동 추이 스파크라인 · Phase 현황 · 충실도 KPI · 심리안정실 위젯
export default function Tier3Dashboard({ onNavigate }) {
  const { curClass, selectStudent, tier3Ids } = useStudents();
  const { data, loading, error, reload } = useDashboard();
  const C = SECTIONS.t3.color;

  if (!curClass) return <div className="empty-state"><span className="emoji">🎯</span>학급을 먼저 만들어주세요.</div>;
  if (loading) return <DashLoading />;
  if (error) return <DashError error={error} onRetry={reload} />;

  const stu = data?.stu || {};
  const rows = (data?.students || []).map((s) => ({ ...s, d: stu[s.id] || {} }));
  const go = (sid, page) => { selectStudent(sid); onNavigate(page); };

  const totalAbc = rows.reduce((a, r) => a + (r.d.abc || 0), 0);
  const totalMon = rows.reduce((a, r) => a + (r.d.mon || 0), 0);

  // 검토 규칙은 lib/dashReviews.js 단일 출처 — 여기서 onClick만 입힌다.
  const reviews = computeT3Reviews(data).map((it) => ({
    ...it,
    onClick: () => (it.sid ? go(it.sid, it.page) : onNavigate(it.page)),
  }));

  // 최근 2주 충실도 — 기록 있는 학생들의 평균
  const fidList = rows.map((r) => r.d.fid14).filter((v) => v != null);
  const fidAvg = fidList.length ? Math.round(fidList.reduce((a, b) => a + b, 0) / fidList.length) : null;

  // 심리안정실 — 최근 30일 이용 학생(내림차순)
  const szRows = rows.filter((r) => (r.d.sz30 || 0) > 0).sort((a, b) => (b.d.sz30 || 0) - (a.d.sz30 || 0));
  const szTotal30 = szRows.reduce((a, r) => a + (r.d.sz30 || 0), 0);

  const stepChip = (done, activeLabel, doneLabel = '완료') =>
    done ? <Chip kind="ok">{doneLabel}</Chip> : <Chip kind="muted">{activeLabel}</Chip>;

  // 현재 phase 칩 — A(기초선)는 회색/경고, B(중재)는 파랑 + 지속일
  const phaseChip = (d) => {
    if (!d.phase) return <span className="dim">-</span>;
    const days = d.phaseSince ? daysAgo(d.phaseSince) + 1 : null;
    if (d.phase === 'B') return <Chip kind="info">중재 B{days ? ` · ${days}일째` : ''}</Chip>;
    return <Chip kind={days != null && days >= 14 && d.bipFilled ? 'warn' : 'muted'}>기초선 A{days ? ` · ${days}일째` : ''}</Chip>;
  };

  const roster = rows.length === 0 ? (
    <div className="dz-review-empty">등록된 학생이 없어요. 상단 + 버튼으로 학생을 추가하세요.</div>
  ) : (
    <>
      <div className="dw-sub">칸을 누르면 그 학생·그 단계로 바로 이동해요 · 추이: 실선=중재(B), 점선=기초선(A)</div>
      <div className="dz-table-wrap" data-tour="t3-roster">
        <table className="dz-table">
          <thead>
            <tr><th>학생</th><th>① 관찰(ABC)</th><th>② 기능평가</th><th>③ BIP</th><th>행동목표 → IEP</th><th>④ 데이터</th><th>📉 추이(14일) · Phase</th><th>⑤ 평가</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.d;
              return (
                <tr key={r.id}>
                  <td className="strong">
                    {tier3Ids.has(r.id) && <span title="Tier 3 지정 학생">🎯 </span>}{r.code}
                    <div className="dim" style={{ fontWeight: 400 }}>{[r.level, r.disability].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td onClick={() => go(r.id, 'observe')} className="click">
                    {(d.abc || 0) > 0 ? <Chip kind="info">{d.abc}건</Chip> : <Chip kind="muted">0건</Chip>}
                    <div className="dim">{d.abcLast ? agoLabel(d.abcLast) : ''}</div>
                  </td>
                  <td onClick={() => go(r.id, 'qabf')} className="click">{stepChip(d.qabfDone, '미실시')}</td>
                  <td onClick={() => go(r.id, 'bip')} className="click">{stepChip(d.bipFilled, '미작성', '작성됨')}</td>
                  <td onClick={() => go(r.id, 'bip')} className="click">
                    {!d.bgoal ? <Chip kind="muted">목표 없음</Chip>
                      : d.bgoalDest === 'iep' ? <Chip kind="info">📘 개별화로</Chip>
                      : d.bgoalDest === 'subject' ? <Chip kind="info">📚 교과로</Chip>
                      : <Chip kind="err">행선지 미선택</Chip>}
                  </td>
                  <td onClick={() => go(r.id, 'monitor')} className="click">
                    {(d.mon || 0) > 0 ? <Chip kind={daysAgo(d.monLast) >= 7 ? 'warn' : 'ok'}>{d.mon}건</Chip> : <Chip kind="muted">0건</Chip>}
                    <div className="dim">{d.monLast ? agoLabel(d.monLast) : ''}</div>
                  </td>
                  <td onClick={() => go(r.id, 'eval')} className="click">
                    <Sparkline series={d.mon14} color={C} />
                    <div style={{ marginTop: 2 }}>{phaseChip(d)}</div>
                  </td>
                  <td onClick={() => go(r.id, 'eval')} className="click">
                    {(d.mon || 0) >= 4 ? <Chip kind="ok">차트 보기</Chip> : <Chip kind="muted">데이터 부족</Chip>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  const recentList = (data?.recentAbc || []).length === 0 ? (
    <div className="dz-review-empty">아직 ABC 관찰 기록이 없어요.</div>
  ) : (
    <ul className="recent-list">
      {data.recentAbc.map((r, i) => (
        <li key={i} className="recent-item">
          <span className="recent-dot" style={{ background: C }} />
          <div className="recent-body">
            <div className="t">{r.code} · ABC 기록</div>
            <div className="d">{r.behavior || r.antecedent || ''}</div>
          </div>
          <span className="recent-when">{fmtDate(r.date)}</span>
        </li>
      ))}
    </ul>
  );

  // 🧯 심리안정실 — 최근 30일 이용 현황 (위기 조기 신호)
  const szList = szRows.length === 0 ? (
    <div className="dz-review-empty">최근 30일 심리안정실 이용 기록이 없어요 👍</div>
  ) : (
    <ul className="recent-list">
      {szRows.map((r) => (
        <li key={r.id} className="recent-item click" onClick={() => go(r.id, 'crisis')} role="button">
          <span className="recent-dot" style={{ background: (r.d.sz30 || 0) >= 3 ? '#d94b3f' : '#e8a23d' }} />
          <div className="recent-body">
            <div className="t">{r.code} · 최근 30일 {r.d.sz30}회</div>
            <div className="d">누적 {r.d.sz}회 · 마지막 이용 {r.d.szLast ? agoLabel(r.d.szLast) : '-'}</div>
          </div>
          <Chip kind={(r.d.sz30 || 0) >= 3 ? 'err' : 'warn'}>{r.d.sz30}회</Chip>
        </li>
      ))}
    </ul>
  );

  const widgets = [
    { id: 'kpi-students', title: '학급 학생', x: 0, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🧑‍🎓" value={`${rows.length}명`} label="학급 학생" hint={tier3Ids.size ? `이 중 Tier 3 지정 ${tier3Ids.size}명 🎯` : 'Tier 3 지정은 소그룹에서'} /> ) },
    { id: 'kpi-abc', title: 'ABC 누적', x: 3, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🔍" value={totalAbc} label="ABC 관찰 누적" hint="다음: 관찰 → 기능평가" onClick={() => onNavigate('observe')} /> ) },
    { id: 'kpi-mon', title: '행동 데이터', x: 6, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="📈" value={totalMon} label="행동 데이터 누적" hint="중재 효과의 근거가 돼요" onClick={() => onNavigate('monitor')} /> ) },
    { id: 'kpi-fid', title: '충실도', x: 9, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="✅" value={fidAvg != null ? `${fidAvg}%` : '-'} label="최근 2주 BIP 실행 충실도" hint={fidList.length ? `기록 있는 학생 ${fidList.length}명 평균` : '행동 데이터 페이지에서 체크해요'} onClick={() => onNavigate('monitor')} /> ) },
    { id: 'roster', title: '🗂 학생별 진행 명부', x: 0, y: 2, w: 12, h: 7, minW: 6, minH: 4, body: roster },
    { id: 'reviews', title: `🔎 검토가 필요한 항목${reviews.length ? ` (${reviews.length})` : ''}`, x: 0, y: 9, w: 6, h: 6, minW: 3, minH: 3, body: <div data-tour="t3-reviews"><ReviewList items={reviews} /></div> },
    { id: 'sz', title: `🧯 심리안정실 · 최근 30일${szTotal30 ? ` (${szTotal30}회)` : ''}`, x: 6, y: 9, w: 6, h: 6, minW: 3, minH: 3, body: szList },
    { id: 'recent', title: '🕒 최근 관찰 기록', x: 0, y: 15, w: 12, h: 5, minW: 3, minH: 3, body: recentList },
  ];

  return <DashGrid dashKey="dash3" color={C} widgets={widgets} />;
}
