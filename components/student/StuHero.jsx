import { useStudents } from '../../contexts/StudentContext';
import { stuColor } from '../../lib/utils/colors';
import { studentProfileParts, decomposeNote } from '../../lib/utils/splitNote';

// 강점(초록)/어려움(주황)을 나눠 보여주는 프로필 요약. 분리 정보가 없으면 note 원문.
// StuHero와 관찰 페이지 프로필 카드에서 공용.
export function ProfileSummary({ stu, style }) {
  if (!stu) return null;
  const { strengths, difficulties } = studentProfileParts(stu);
  const dec = stu.note ? decomposeNote(stu.note) : { strengths: '', difficulties: '', extra: '' };
  // note가 [강점]/[어려움] 라벨 형식일 때만 라벨 없는 줄이 '진짜 추가 요약'이다.
  // 구버전 note(라벨 없는 원문 한 줄)는 이미 강점/어려움 칩으로 표시되므로
  // 그대로 또 보여주면 같은 문장이 두 번 나온다 → 그럴 땐 숨긴다.
  const noteIsLabeled = !!(dec.strengths || dec.difficulties);
  const extra = noteIsLabeled ? dec.extra : '';
  if (!strengths && !difficulties) {
    return <div className="stu-hero-note" style={style}>{stu.note || '(비식별 요약 없음)'}</div>;
  }
  const chip = (bg, fg) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color: fg,
    borderRadius: 8, padding: '2px 8px', fontSize: '.78rem', fontWeight: 600,
    marginRight: 6, marginTop: 4, lineHeight: 1.5,
  });
  return (
    <div style={{ marginTop: 2, ...style }}>
      {strengths && <span style={chip('#e7f7ee', '#0a7d4e')}>🌟 {strengths}</span>}
      {difficulties && <span style={chip('#fff3e2', '#b45309')}>⚠ {difficulties}</span>}
      {extra && <span style={{ display: 'block', fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>{extra}</span>}
    </div>
  );
}

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
        <ProfileSummary stu={curStu} />
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
