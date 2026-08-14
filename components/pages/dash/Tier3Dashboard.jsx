import { useStudents } from '../../../contexts/StudentContext';
import { SECTIONS } from '../../../lib/tiers';
import DashGrid from './DashGrid';
import { useDashboard, KpiBody, Chip, ReviewList, DashLoading, DashError, agoLabel, daysAgo, fmtDate } from './DashBits';

// Tier 3 대시보드 — 학생별 5단계 진행 명부 (gridstack 위젯 · 배치는 사용자별 저장)
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

  const reviews = [];
  rows.forEach((r) => {
    const d = r.d;
    if ((d.abc || 0) >= 3 && !d.qabfDone) reviews.push({ level: 'warn', text: `${r.code} — ABC ${d.abc}건인데 기능평가(QABF) 미실시`, sub: '관찰이 쌓였으니 행동 기능을 분석해볼 때예요', cta: 'QABF', onClick: () => go(r.id, 'qabf') });
    if (d.qabfDone && !d.bipFilled) reviews.push({ level: 'err', text: `${r.code} — 기능평가는 했는데 BIP 미작성`, sub: '분석 결과를 중재계획으로 이어주세요', cta: 'BIP 작성', onClick: () => go(r.id, 'bip') });
    if (d.bgoal && !d.bgoalDest) reviews.push({ level: 'warn', text: `${r.code} — 행동목표의 IEP 반영 방식 미선택`, sub: '개별화 목표로 가져갈지, 교과에 녹일지 골라주세요', cta: '선택하기', onClick: () => go(r.id, 'bip') });
    const dm = d.monLast ? daysAgo(d.monLast) : null;
    if (d.bipFilled && (d.mon || 0) > 0 && dm != null && dm >= 7) reviews.push({ level: 'err', text: `${r.code} — 행동 데이터가 ${dm}일째 없음`, sub: '중재 중이라면 데이터 기록을 이어가야 효과를 볼 수 있어요', cta: '기록', onClick: () => go(r.id, 'monitor') });
    if (d.bipFilled && (d.mon || 0) === 0) reviews.push({ level: 'warn', text: `${r.code} — BIP는 있는데 행동 데이터가 0건`, sub: '기초선(A)부터 기록을 시작해보세요', cta: '기록 시작', onClick: () => go(r.id, 'monitor') });
  });

  const stepChip = (done, activeLabel, doneLabel = '완료') =>
    done ? <Chip kind="ok">{doneLabel}</Chip> : <Chip kind="muted">{activeLabel}</Chip>;

  const roster = rows.length === 0 ? (
    <div className="dz-review-empty">등록된 학생이 없어요. 상단 + 버튼으로 학생을 추가하세요.</div>
  ) : (
    <>
      <div className="dw-sub">칸을 누르면 그 학생·그 단계로 바로 이동해요</div>
      <div className="dz-table-wrap">
        <table className="dz-table">
          <thead>
            <tr><th>학생</th><th>① 관찰(ABC)</th><th>② 기능평가</th><th>③ BIP</th><th>행동목표 → IEP</th><th>④ 데이터</th><th>⑤ 평가</th></tr>
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

  const widgets = [
    { id: 'kpi-students', title: '학급 학생', x: 0, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🧑‍🎓" value={`${rows.length}명`} label="학급 학생" hint={tier3Ids.size ? `이 중 Tier 3 지정 ${tier3Ids.size}명 🎯` : 'Tier 3 지정은 소그룹에서'} /> ) },
    { id: 'kpi-abc', title: 'ABC 누적', x: 3, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🔍" value={totalAbc} label="ABC 관찰 누적" hint="다음: 관찰 → 기능평가" onClick={() => onNavigate('observe')} /> ) },
    { id: 'kpi-mon', title: '행동 데이터', x: 6, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="📈" value={totalMon} label="행동 데이터 누적" hint="중재 효과의 근거가 돼요" onClick={() => onNavigate('monitor')} /> ) },
    { id: 'kpi-review', title: '검토 필요', x: 9, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🔎" value={reviews.length} label="검토 필요" hint={reviews.length ? '검토 위젯을 확인하세요' : '모두 정상'} /> ) },
    { id: 'roster', title: '🗂 학생별 진행 명부', x: 0, y: 2, w: 12, h: 7, minW: 6, minH: 4, body: roster },
    { id: 'reviews', title: `🔎 검토가 필요한 항목${reviews.length ? ` (${reviews.length})` : ''}`, x: 0, y: 9, w: 6, h: 6, minW: 3, minH: 3, body: <ReviewList items={reviews} /> },
    { id: 'recent', title: '🕒 최근 관찰 기록', x: 6, y: 9, w: 6, h: 6, minW: 3, minH: 3, body: recentList },
  ];

  return <DashGrid dashKey="dash3" color={C} widgets={widgets} />;
}
