import LLMIndicator from './LLMIndicator';
import { useStudents } from '../../contexts/StudentContext';

const TITLES = {
  home: '홈',
  observe: '학생 관찰 및 이해',
  qabf: '기능평가 (QABF)',
  bip: '행동중재계획 (BIP)',
  monitor: '행동 데이터 기록',
  eval: '결과 확인 / 평가',
  builder: 'AI 어시스턴트',
  crisis: '위기행동 관리 및 대처',
  support: '교사 지원 자료실',
  classpbs: '학급 차원 PBS (Tier 1)',
  tier2: 'Tier 2 · 소그룹 지원 (CICO / DPR)',
  tier3: 'Tier 3 · 개별 맞춤형 중재',
  qa: 'PBS Q&A 전문가',
  videos: 'PBS 영상 강의실',
};

export default function Topbar({ activePage, onMenu, onOpenLLMSettings, onAddStudent }) {
  const { students, curStuId, selectStudent } = useStudents();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={onMenu}>☰</button>
        <h1>{TITLES[activePage] || ''}</h1>
      </div>
      <div className="topbar-right">
        <LLMIndicator onClick={onOpenLLMSettings} />
        <div className="stu-bar">
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
          <button className="stu-add" onClick={onAddStudent} title="학생 추가">+</button>
        </div>
      </div>
    </div>
  );
}
