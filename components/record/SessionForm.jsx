import { useEffect } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import TeachingRecordPanel from '../student/TeachingRecordPanel';
import { ESCORT_EVENT } from '../../lib/escortSignal';

// 교수 회기 기록(과제분석·DTT·5점 척도 …) 폼 — MonitorPage '교수 회기 기록' 탭 본문을 학생 id prop 컴포넌트로 감쌌다
//   (새 디자인 2단계, mds/54 §2-1 #18). 기록 형태 고르기 + 형태별 패널(ProgramSessionPanel·DttPanel·ScalePanel)을 통째로 쓴다.
//   ⚠ 세 패널은 600줄 안팎이고 안에서 '지금 학생(curStuId)'을 읽는다 — 패널을 고치지 않고, 이 폼은
//     studentId가 지금 학생과 같을 때만 그린다(빠른 기록 창은 창을 열 때 그 학생을 지금 학생으로 고른다).
//   onSaved: 회기 저장 성공 신호(escortSignal 'session-saved', 세 패널이 보냄)를 받으면 부른다 — 창의 '✓ 저장함' 표시용.
export default function SessionForm({ studentId, onNavigate, onSaved }) {
  const { curStuId } = useStudents();
  useEffect(() => {
    if (!onSaved) return undefined;
    const h = (e) => { if (e?.detail?.kind === 'session-saved') onSaved(); };
    window.addEventListener(ESCORT_EVENT, h);
    return () => window.removeEventListener(ESCORT_EVENT, h);
  }, [onSaved]);
  if (!studentId || studentId !== curStuId) return <div className="kb-loading">학생 자료를 여는 중…</div>;
  return <TeachingRecordPanel key={studentId} onNavigate={onNavigate} />;
}
