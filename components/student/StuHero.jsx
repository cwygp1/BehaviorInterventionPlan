import { useStudents } from '../../contexts/StudentContext';
import { stuColor } from '../../lib/utils/colors';

export default function StuHero() {
  const { curStu, curStuData } = useStudents();
  if (!curStu) return null;
  const c = stuColor(curStu.code);
  const abc = curStuData?.abc?.length || 0;
  const mon = curStuData?.mon?.length || 0;
  const sz = curStuData?.sz?.length || 0;

  return (
    <div className="stu-hero">
      <div className="stu-hero-avatar" style={{ background: `linear-gradient(135deg,${c},${c}cc)` }}>
        {(curStu.code || '?').charAt(0)}
      </div>
      <div className="stu-hero-main">
        <div className="stu-hero-name">{curStu.code}
          <span className="badge badge-pri">{curStu.level}</span>
          <span className="badge badge-purple">{curStu.disability}</span>
        </div>
        <div className="stu-hero-note">{curStu.note || '(비식별 요약 없음)'}</div>
      </div>
      <div className="stu-hero-meta">
        <div className="m"><div className="v">{abc}</div><div className="l">ABC</div></div>
        <div className="m"><div className="v">{mon}</div><div className="l">데이터</div></div>
        <div className="m"><div className="v">{sz}</div><div className="l">안정실</div></div>
      </div>
    </div>
  );
}

export function NoStudentHint() {
  return (
    <div className="card">
      <div className="empty-state">
        <span className="emoji">👤</span>
        학생을 먼저 선택해 주세요. (우측 상단 셀렉트)
      </div>
    </div>
  );
}
