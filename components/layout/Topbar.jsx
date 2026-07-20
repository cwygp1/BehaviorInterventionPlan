import LLMIndicator from './LLMIndicator';
import { useStudents } from '../../contexts/StudentContext';

// 사이드바의 모든 페이지 키에 제목이 있어야 한다. 빠지면 상단 제목이 빈칸으로
// 뜬다(0720: pbssurvey·classcheck·generator·startpoint·iep 계열이 그랬음).
const TITLES = {
  home: '홈',
  students: '학생 관리',
  observe: '학생 관찰 및 이해',
  qabf: '기능평가 (QABF)',
  bip: '행동중재계획 (BIP)',
  monitor: '행동 데이터 기록',
  eval: '결과 확인 / 평가',
  builder: 'AI 어시스턴트',
  crisis: '위기행동 관리 및 대처',
  support: '교사 지원 자료실',
  classpbs: '학급 차원 PBS (Tier 1)',
  pbssurvey: 'PBS 기초 설문조사 (Tier 1)',
  classcheck: '학급관리 체크리스트 (Tier 1)',
  tier2: 'Tier 2 · 소그룹 지원 (CICO / DPR)',
  tier3: 'Tier 3 · 개별 맞춤형 중재',
  startpoint: '출발점 분석 (현행수준)',
  iep: 'IEP 목표 생성',
  priorIep: '전년도 IEP',
  iepReport: 'IEP 계획서 (완성·출력)',
  generator: 'AI 생성기',
  qa: 'PBS Q&A 전문가',
  videos: 'PBS 영상 강의실',
};

export default function Topbar({ activePage, onMenu, onOpenLLMSettings, onAddStudent, onManageClasses }) {
  const {
    students, curStuId, selectStudent,
    years, curYear, selectYear,
    curSemester, selectSemester,
    yearClasses, curClassId, selectClass,
  } = useStudents();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={onMenu}>☰</button>
        <h1>{TITLES[activePage] || ''}</h1>
      </div>
      <div className="topbar-right">
        <LLMIndicator onClick={onOpenLLMSettings} />
        <div className="stu-bar">
          {/* 년도 선택 */}
          <select
            className="stu-select"
            value={curYear}
            onChange={(e) => selectYear(e.target.value)}
            title="학년도"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          {/* 학기 선택 */}
          <select
            className="stu-select"
            value={curSemester}
            onChange={(e) => selectSemester(e.target.value)}
            title="학기"
          >
            <option value={1}>1학기</option>
            <option value={2}>2학기</option>
          </select>
          {/* 학급 선택 */}
          <select
            className="stu-select"
            value={curClassId || ''}
            onChange={(e) => selectClass(e.target.value || null)}
            title="학급"
          >
            {yearClasses.length === 0 && <option value="">학급 없음</option>}
            {yearClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="stu-add" onClick={onManageClasses} title="학급 관리">⚙</button>
          {/* 학생 선택 */}
          <select
            className="stu-select"
            value={curStuId || ''}
            onChange={(e) => selectStudent(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- 학생 선택 --</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.code}</option>
            ))}
          </select>
          <button className="stu-add" onClick={onAddStudent} title="학생 추가" disabled={!curClassId}>+</button>
        </div>
      </div>
    </div>
  );
}
