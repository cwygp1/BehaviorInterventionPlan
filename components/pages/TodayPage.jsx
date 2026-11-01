import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { levelLabel } from '../../lib/schoolLevel';
import { stuColor } from '../../lib/utils/colors';
import WeekStrip from '../ui/WeekStrip';
import PageFrame from '../onboarding/PageFrame';

// 새 디자인 '오늘'(#today) — 1단계 임시판: 🚨 급해요 + 이번 주 기록 띠(WeekStrip) + 학생 목록(mds/54 §7 1단계).
//   오늘 표(학생×할 일)·빠른 기록 창은 2단계. 홈(PortalHome)이 하던 것 중 끊기면 안 되는 것:
//   샘플 넣기·지우기(N3), '검토할 일' 펼치기(kb_focus_reviews → 현황판), 시작하기 목록(PageFrame page='home').

export function StudentList({ onNavigate, actions }) {
  const { students, studentsLoaded, curClassId, hasSamples, seedSamples, clearSamples, homeSummary } = useStudents();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onSeed = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const first = await seedSamples();
      toast('샘플 학생 2명과 9주치 기록을 만들었어요. 학생을 눌러 수첩을 열어 보세요!');
      if (first) onNavigate(`#student/${first.id}/record`);
    } catch (e) {
      toast('샘플 만들기 실패: ' + e.message);
    } finally { setBusy(false); }
  };
  const onClear = async () => {
    if (busy) return;
    if (!window.confirm('샘플 학생 2명과 그 기록을 모두 삭제할까요?\n(선생님이 직접 등록한 학생은 그대로 남아요.)')) return;
    setBusy(true);
    try { await clearSamples(); toast('샘플을 정리했어요. 이제 내 학생으로 시작해 보세요!'); } catch (e) { toast('샘플 삭제 실패: ' + e.message); } finally { setBusy(false); }
  };

  if (!studentsLoaded) return <div className="kb-loading">학생 목록을 불러오는 중…</div>;

  return (
    <div className="kb-stack">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="kb-h3" style={{ flex: 1 }}>우리 반 학생 {students.length}명</h2>
        <button type="button" className="kb-btn kb-pri" onClick={actions.openAddStudent} disabled={!curClassId}>+ 학생 추가</button>
        {hasSamples && <button type="button" className="kb-btn" onClick={onClear} disabled={busy}>🧹 샘플 학생 지우기</button>}
      </div>
      {students.length === 0 ? (
        <div className="kb-card">
          <div className="kb-muted">아직 이 학급에 학생이 없어요. 학생을 한 명 추가하거나, 기록이 채워진 샘플 학생으로 화면을 먼저 둘러보세요.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="kb-btn kb-pri" onClick={actions.openAddStudent} disabled={!curClassId}>+ 첫 학생 추가</button>
            {!hasSamples && <button type="button" className="kb-btn" onClick={onSeed} disabled={busy || !curClassId}>🧪 샘플 학생으로 미리 보기</button>}
          </div>
        </div>
      ) : (
        <div className="kb-list">
          {students.map((s) => {
            const sm = homeSummary?.summaries?.[s.id] || {};
            const go = (tab) => onNavigate(`#student/${s.id}/${tab}`);
            return (
              <div className="kb-row" key={s.id}>
                <div className="kb-av" style={{ background: stuColor(s.code) }} aria-hidden="true">{s.code.slice(0, 2)}</div>
                <div className="kb-t">
                  <button type="button" className="kb-nm" onClick={() => go('record')}>{s.code}{s.is_sample ? ' (샘플)' : ''}</button>
                  <div className="kb-small">
                    {levelLabel(s.level)}{s.grade ? ` ${s.grade}학년` : ''} · {s.disability || '장애 영역 미입력'}
                    {' · '}관찰 {sm.abc_count || 0} · 데이터 {sm.mon_count || 0} · IEP 목표 {sm.iep_count || 0}
                  </div>
                </div>
                <div className="kb-acts">
                  <button type="button" className="kb-btn" onClick={() => go('record')}>기록</button>
                  <button type="button" className="kb-btn" onClick={() => go('iep')}>IEP</button>
                  <button type="button" className="kb-btn" onClick={() => go('chart')}>그래프</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TodayPage({ onNavigate, actions }) {
  const today = new Date();
  const wd = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
  const focusReviews = () => {
    try { sessionStorage.setItem('kb_focus_reviews', '1'); } catch (_e) { /* noop */ }
    onNavigate('dash3');
  };
  return (
    <div className="kb-stack">
      <PageFrame page="home" onNavigate={onNavigate} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="kb-h2" style={{ flex: 1 }}>{today.getMonth() + 1}월 {today.getDate()}일 ({wd})</h2>
        <button type="button" className="kb-btn" onClick={() => onNavigate('#today/calendar')}>📅 달력 보기</button>
        <button type="button" className="kb-btn" onClick={focusReviews}>📋 검토할 일 보기</button>
      </div>
      <div className="kb-urgent">
        <div style={{ flex: 1, minWidth: 200 }}>
          <b style={{ fontSize: 'var(--kb-fs-head)' }}>위기 상황인가요?</b>
          <div className="kb-small">학생을 고르지 않아도 바로 대처 순서를 볼 수 있어요.</div>
        </div>
        <button type="button" className="kb-btn kb-danger kb-big" onClick={() => onNavigate('crisis')}>🚨 급해요</button>
      </div>
      <WeekStrip onNavigate={onNavigate} />
      <StudentList onNavigate={onNavigate} actions={actions} />
      <p className="kb-small">오늘 할 일 표와 빠른 기록 창은 다음 단계에서 들어와요. 예전 홈 화면은 <button type="button" className="kb-btn" style={{ minHeight: 36 }} onClick={() => onNavigate('#page/home')}>예전 홈 보기</button>에서 볼 수 있어요.</p>
    </div>
  );
}
