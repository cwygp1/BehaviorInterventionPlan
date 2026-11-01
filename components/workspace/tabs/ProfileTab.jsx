import { useState } from 'react';
import { useStudents } from '../../../contexts/StudentContext';
import { levelGradeLabel } from '../../../lib/schoolLevel';
import { assessStatusOfData } from '../../../lib/assessStatus';
import { ProfileSummary } from '../../student/StuHero';
import AssessmentLauncher from '../../student/AssessmentLauncher';
import Fold from './Fold';

// 학생 수첩 > 프로필 탭(새 디자인 3단계, mds/52 §5-2 '프로필', mds/54 §2-3 N4).
//   ① 학생 정보 + '프로필 수정' 단추(셸의 EditStudentModal — 옛 화면 머리표 StuHero의 ✏ 단추도 그대로 남아 있다).
//   ② 학생 기초 평가 — 초기면담·강화제(RAISD·선호도)·표적행동 우선순위(AssessmentLauncher 그대로).
//      미완이면 펼침 + 오늘 표 할 일('기초 평가 남음', lib/todo.js), 셋 다 했으면 한 줄로 접힘(0821).
export default function ProfileTab({ actions }) {
  const { curStu, curStuData } = useStudents();
  const st = assessStatusOfData(curStuData);
  const allDone = st.missing.length === 0;
  const [open, setOpen] = useState(!allDone);
  if (!curStu) return null;
  const row = (k, v) => (
    <div className="kb-kv"><span className="kb-small">{k}</span><span>{v || <span className="kb-small">입력 전 (나중에 채워도 돼요)</span>}</span></div>
  );
  return (
    <div className="kb-stack">
      <section className="kb-card" data-tour="ws-profile-info">
        <div className="kb-q-row" style={{ alignItems: 'center' }}>
          <h3 className="kb-h3" style={{ flex: 1 }}>학생 정보</h3>
          <button type="button" className="kb-btn kb-out" onClick={actions.openEditStudent} data-tour="ws-profile-edit">프로필 수정</button>
        </div>
        {row('코드(별명)', curStu.code)}
        {row('학교급 · 학년', levelGradeLabel(curStu.level, curStu.grade))}
        {row('장애 영역', curStu.disability)}
        <div className="kb-kv"><span className="kb-small">강점 · 어려움</span><ProfileSummary stu={curStu} /></div>
      </section>
      <Fold
        id="ws-profile-assess"
        anchor="ws-profile-assess"
        title="학생 기초 평가 — 초기면담 · 강화제 · 표적행동 우선순위"
        summary={allDone ? '3가지 모두 작성함' : `${st.missing.join('·')} 남음`}
        tone={allDone ? 'green' : 'rose'}
        open={open}
        onToggle={setOpen}
      >
        <AssessmentLauncher />
      </Fold>
    </div>
  );
}
