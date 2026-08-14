import { useStudents } from '../../../contexts/StudentContext';
import { SECTIONS } from '../../../lib/tiers';
import DashGrid from './DashGrid';
import { useDashboard, KpiBody, FlowStrip, ReviewList, DashLoading, DashError, agoLabel } from './DashBits';

// Tier 1 대시보드 — 학급 전체 보편 지원 현황 (gridstack 위젯 · 배치는 사용자별 저장)
export default function Tier1Dashboard({ onNavigate }) {
  const { curClass, curSemester, students } = useStudents();
  const { data, loading, error, reload } = useDashboard();
  const C = SECTIONS.t1.color;

  if (!curClass) return <div className="empty-state"><span className="emoji">🏫</span>학급을 먼저 만들어주세요. 상단 ⚙(학급 관리)에서 추가할 수 있어요.</div>;
  if (loading) return <DashLoading />;
  if (error) return <DashError error={error} onRetry={reload} />;

  const t1 = data?.t1 || {};
  const pbs = t1.pbs || null;
  const target = Number(pbs?.target_points || 0);
  const current = Number(pbs?.current_points || 0);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const rewards = Array.isArray(pbs?.rewards) ? pbs.rewards : [];

  const flow = [
    { key: 'survey', icon: '📋', label: '기초 설문조사', state: t1.surveyDone ? 'done' : 'now', hint: t1.surveyDone ? '작성 완료' : '다음: 실태 파악하기', onClick: () => onNavigate('pbssurvey') },
    { key: 'goal', icon: '🎯', label: '규칙·목표 설정', state: pbs?.goal ? 'done' : (t1.surveyDone ? 'now' : 'todo'), hint: pbs?.goal ? `"${String(pbs.goal).slice(0, 14)}…"` : '다음: 학급 목표 정하기', onClick: () => onNavigate('classpbs') },
    { key: 'points', icon: '⭐', label: '포인트 운영', state: current > 0 ? 'done' : (pbs?.goal ? 'now' : 'todo'), hint: target ? `${current}/${target}점` : '보상판 운영', onClick: () => onNavigate('classpbs') },
    { key: 'check', icon: '✅', label: '학급관리 점검', state: t1.checklistDone ? 'done' : 'todo', hint: t1.checklistDone ? `점검 ${agoLabel(t1.checklistUpdated)}` : '체크리스트로 점검', onClick: () => onNavigate('classcheck') },
  ];

  const reviews = [];
  if (!t1.surveyDone) reviews.push({ level: 'err', text: 'PBS 기초 설문조사가 아직 없어요', sub: '학급 실태를 먼저 파악하면 규칙·목표 설정이 쉬워져요', cta: '설문 작성', onClick: () => onNavigate('pbssurvey') });
  if (!pbs?.goal) reviews.push({ level: 'warn', text: '학급 공통 목표가 미설정 상태예요', sub: '이번 학기 우리 반의 기대행동/목표를 정해주세요', cta: '목표 설정', onClick: () => onNavigate('classpbs') });
  if (pbs?.goal && rewards.length === 0) reviews.push({ level: 'warn', text: '보상 목록이 비어 있어요', sub: '포인트 달성 시 받을 보상을 학생들과 정해보세요', cta: '보상 추가', onClick: () => onNavigate('classpbs') });
  if (!t1.checklistDone) reviews.push({ level: 'warn', text: '학급관리 체크리스트 점검 전이에요', sub: '학기 중 1회 이상 점검을 권장해요', cta: '점검하기', onClick: () => onNavigate('classcheck') });

  const widgets = [
    { id: 'kpi-scope', title: '운영 범위', x: 0, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="🏫" value={`${curClass.name} · ${curSemester}학기`} label="운영 범위" hint={`학생 ${students.length}명`} /> ) },
    { id: 'kpi-points', title: '목표 진행률', x: 3, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="⭐" value={target ? `${pct}%` : '-'} label="학급 목표 진행률" hint={target ? `${current} / ${target}점` : '포인트 목표 미설정'} onClick={() => onNavigate('classpbs')} /> ) },
    { id: 'kpi-survey', title: '기초 설문', x: 6, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="📋" value={t1.surveyDone ? '완료' : '미작성'} label="기초 설문조사" hint={t1.surveyDone ? agoLabel(t1.surveyUpdated) + ' 수정' : '다음: 설문 작성'} onClick={() => onNavigate('pbssurvey')} /> ) },
    { id: 'kpi-check', title: '학급관리 점검', x: 9, y: 0, w: 3, h: 2, body: (
      <KpiBody icon="✅" value={t1.checklistDone ? '완료' : '미점검'} label="학급관리 체크리스트" hint={t1.checklistDone ? agoLabel(t1.checklistUpdated) + ' 점검' : '다음: 자가 점검'} onClick={() => onNavigate('classcheck')} /> ) },
    { id: 'flow', title: '🧭 Tier 1 업무 흐름', x: 0, y: 2, w: 12, h: 3, minW: 4, body: (
      <FlowStrip color={C} steps={flow} /> ) },
    { id: 'reviews', title: `🔎 검토가 필요한 항목${reviews.length ? ` (${reviews.length})` : ''}`, x: 0, y: 5, w: 6, h: 5, minW: 3, minH: 3, body: (
      <ReviewList items={reviews} /> ) },
    { id: 'goalboard', title: '⭐ 학급 목표 & 보상판', x: 6, y: 5, w: 6, h: 5, minW: 3, minH: 3, body: (
      pbs?.goal ? (
        <>
          <div className="dz-goal">“{pbs.goal}”</div>
          <div className="dz-bar"><div className="dz-bar-fill" style={{ width: pct + '%', background: C }} /></div>
          <div className="dz-bar-meta"><span>{current}점</span><span>목표 {target}점 ({pct}%)</span></div>
          {rewards.length > 0 && (
            <div className="dz-rewards">
              {rewards.slice(0, 4).map((r, i) => <span key={i} className="dz-chip info">🎁 {typeof r === 'string' ? r : r?.name || r?.label || ''}</span>)}
            </div>
          )}
        </>
      ) : (
        <div className="dz-review-empty">아직 학급 목표가 없어요. <button className="btn btn-sm btn-ghost" onClick={() => onNavigate('classpbs')} style={{ marginLeft: 6 }}>목표 만들기</button></div>
      )
    ) },
  ];

  return <DashGrid dashKey="dash1" color={C} widgets={widgets} />;
}
