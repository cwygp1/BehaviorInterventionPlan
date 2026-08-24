import { useStudents } from '../../../contexts/StudentContext';
import { SECTIONS } from '../../../lib/tiers';
import DashGrid from './DashGrid';
import { computeIepReviews } from '../../../lib/dashReviews';
import { useDashboard, KpiBody, Chip, FlowStrip, ReviewList, DashLoading, DashError } from './DashBits';

// IEP 대시보드 — 학생별 개별화교육계획 진행 (gridstack 위젯 · 배치는 사용자별 저장)
export default function IepDashboard({ onNavigate }) {
  const { curClass, curSemester, selectStudent } = useStudents();
  const { data, loading, error, reload } = useDashboard();
  const C = SECTIONS.iep.color;

  if (!curClass) return <div className="empty-state"><span className="emoji">📘</span>학급을 먼저 만들어주세요.</div>;
  if (loading) return <DashLoading />;
  if (error) return <DashError error={error} onRetry={reload} />;

  const stu = data?.stu || {};
  const rows = (data?.students || []).map((s) => ({ ...s, d: stu[s.id] || {} }));
  const go = (sid, page) => { selectStudent(sid); onNavigate(page); };

  const spDone = rows.filter((r) => r.d.startpointDone).length;
  const totalGoals = rows.reduce((a, r) => a + (r.d.iepGoals || 0), 0);
  const goalStudents = rows.filter((r) => (r.d.iepGoals || 0) > 0).length;
  // 0824: 이번 달 월별 구간의 평가 칸이 빈 목표 수 — 학기말 몰림 방지 위젯용
  const monthEvalMissing = rows.reduce((a, r) => a + (r.d.iepMonthEvalMissing || 0), 0);
  const monthEvalStudents = rows.filter((r) => (r.d.iepMonthEvalMissing || 0) > 0);
  const curMonth = new Date().getMonth() + 1;

  // 검토 규칙은 lib/dashReviews.js 단일 출처 — 여기서 onClick만 입힌다.
  const reviews = computeIepReviews(data).map((it) => ({
    ...it,
    onClick: () => (it.sid ? go(it.sid, it.page) : onNavigate(it.page)),
  }));

  const flow = [
    { key: 'prior', icon: '🗓', label: '전년도 IEP', hint: '이력 확인·이어받기', state: 'todo', onClick: () => onNavigate('priorIep') },
    { key: 'sp', icon: '🧭', label: '출발점 분석', hint: `${spDone}/${rows.length}명 완료`, state: rows.length && spDone === rows.length ? 'done' : 'now', onClick: () => onNavigate('startpoint') },
    { key: 'goal', icon: '📋', label: '목표 생성', hint: `${curSemester}학기 목표 ${totalGoals}개`, state: totalGoals > 0 ? (goalStudents === rows.length ? 'done' : 'now') : 'todo', onClick: () => onNavigate('iep') },
    { key: 'report', icon: '📄', label: '계획서 완성·출력', hint: '나이스 양식 출력', state: 'todo', onClick: () => onNavigate('iepReport') },
  ];

  const roster = rows.length === 0 ? (
    <div className="dz-review-empty">등록된 학생이 없어요.</div>
  ) : (
    <div className="dz-table-wrap">
      <table className="dz-table">
        <thead><tr><th>학생</th><th>전년도</th><th>출발점 분석</th><th>학기목표</th><th>월별 계획</th><th>행동목표 연계</th><th>계획서</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const d = r.d;
            return (
              <tr key={r.id}>
                <td className="strong">{r.code}<div className="dim" style={{ fontWeight: 400 }}>{[r.level, r.disability].filter(Boolean).join(' · ')}</div></td>
                <td onClick={() => go(r.id, 'priorIep')} className="click"><Chip kind="muted">확인</Chip></td>
                <td onClick={() => go(r.id, 'startpoint')} className="click">{d.startpointDone ? <Chip kind="ok">완료</Chip> : <Chip kind="muted">미완료</Chip>}</td>
                <td onClick={() => go(r.id, 'iep')} className="click">{(d.iepSemGoals || 0) > 0 ? <Chip kind="ok">{d.iepSemGoals}개</Chip> : (d.iepGoals || 0) > 0 ? <Chip kind="warn">작성중</Chip> : <Chip kind="muted">없음</Chip>}</td>
                <td onClick={() => go(r.id, 'iep')} className="click">{(d.iepMonthly || 0) > 0 ? <Chip kind="ok">{d.iepMonthly}개 목표</Chip> : <Chip kind="muted">비어 있음</Chip>}</td>
                <td onClick={() => go(r.id, 'bip')} className="click">
                  {!d.bgoal ? <Chip kind="muted">-</Chip>
                    : d.bgoalDest === 'iep' ? <Chip kind="info">📘 개별화로</Chip>
                    : d.bgoalDest === 'subject' ? <Chip kind="info">📚 교과로</Chip>
                    : <Chip kind="warn">미선택</Chip>}
                </td>
                <td onClick={() => go(r.id, 'iepReport')} className="click">
                  {(d.iepSemGoals || 0) > 0 && (d.iepMonthly || 0) > 0 ? <Chip kind="ok">출력 가능</Chip> : <Chip kind="muted">준비 중</Chip>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const widgets = [
    { id: 'kpi-students', title: '대상 학생', x: 0, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🧑‍🎓" value={`${rows.length}명`} label="대상 학생" hint={`${curClass.name} · ${curSemester}학기`} /> ) },
    { id: 'kpi-sp', title: '출발점 분석', x: 3, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🧭" value={rows.length ? `${spDone}/${rows.length}` : '-'} label="출발점 분석 완료" hint={spDone < rows.length ? '다음: 미완료 학생 분석' : '모두 완료!'} onClick={() => onNavigate('startpoint')} /> ) },
    { id: 'kpi-goals', title: 'IEP 목표', x: 6, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="📋" value={totalGoals} label="IEP 목표 (올해)" hint={goalStudents ? `목표 있는 학생 ${goalStudents}명` : '다음: 목표 생성'} onClick={() => onNavigate('iep')} /> ) },
    { id: 'kpi-month-eval', title: '이번 달 평가', x: 9, y: 0, w: 3, h: 2, body: (
      <KpiBody
        icon="🗓"
        value={monthEvalMissing ? `${monthEvalMissing}건` : '완료'}
        label={`${curMonth}월 구간 평가 미작성`}
        hint={monthEvalMissing
          ? `${monthEvalStudents.slice(0, 3).map((r) => r.code).join(', ')}${monthEvalStudents.length > 3 ? ' 외' : ''} — 이 달이 가기 전에!`
          : '이번 달 월별 평가 모두 작성됨 👏'}
        onClick={() => onNavigate('iepReport')}
      /> ) },
    { id: 'flow', title: '🧭 IEP 업무 흐름 — Tier 1·2·3 기록이 이 흐름의 재료가 돼요', x: 0, y: 2, w: 12, h: 3, minW: 4, body: (
      <FlowStrip color={C} steps={flow} /> ) },
    { id: 'roster', title: '🗂 학생별 IEP 진행', x: 0, y: 5, w: 12, h: 7, minW: 6, minH: 4, body: roster },
    { id: 'reviews', title: `🔎 검토가 필요한 항목${reviews.filter((r) => r.level !== 'ok').length ? ` (${reviews.filter((r) => r.level !== 'ok').length})` : ''}`, x: 0, y: 12, w: 12, h: 5, minW: 3, minH: 3, body: <ReviewList items={reviews} /> },
  ];

  return <DashGrid dashKey="dashIep" color={C} widgets={widgets} />;
}
