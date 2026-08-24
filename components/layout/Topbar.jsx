import LLMIndicator from './LLMIndicator';
import HelpMenu from '../guide/HelpMenu';
import SaveBadge from '../ui/SaveBadge';
import { useStudents } from '../../contexts/StudentContext';
import { SECTIONS, PAGE_SECTION } from '../../lib/tiers';

// 사이드바의 모든 페이지 키에 제목이 있어야 한다. 빠지면 상단 제목이 빈칸으로
// 뜬다(0720: pbssurvey·classcheck·generator·startpoint·iep 계열이 그랬음).
const TITLES = {
  home: '홈',
  students: '학생 관리',
  dash1: 'Tier 1 대시보드 · 학급 전체',
  dash2: 'Tier 2 대시보드 · 소그룹',
  dash3: 'Tier 3 대시보드 · 한 학생 집중',
  dashIep: 'IEP 대시보드 · 개별화교육',
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

export default function Topbar({ activePage, sectionKey, onNavigate, canGoBack, onBack, onMenu, onOpenLLMSettings, onAddStudent, onManageClasses }) {
  const {
    students, curStuId, selectStudent,
    classes, years, curYear, selectYear,
    curSemester, selectSemester,
    curClassId, selectClass,
  } = useStudents();

  // 0824 간결화①: 년도+학급을 "2026 · 1반" 통합 셀렉트 하나로.
  // 학급은 년도에 소속되므로 학급을 고르면 년도가 함께 정해진다 — 조작 2번 → 1번.
  const classesByYear = years.map((y) => ({
    year: y,
    list: classes.filter((c) => c.school_year === y).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  })).filter((g) => g.list.length > 0);
  const onPickClass = (cid) => {
    const cls = classes.find((c) => c.id === Number(cid));
    if (!cls) return;
    if (cls.school_year !== curYear) selectYear(cls.school_year);
    selectClass(cls.id);
  };

  // 워크스페이스에 있을 때만 영역 전환 칩 표시(시안 B).
  // 0824: 공통 페이지에서도 직전 영역 맥락을 유지하도록 Layout이 내려준 값을 우선 사용.
  const curSection = sectionKey !== undefined ? sectionKey : (PAGE_SECTION[activePage] || null);
  // Tier 1·2·3 + IEP는 항상 전부 표시(2026-08-14: '사용 단계 설정' 숨김 기능 폐지).
  const chips = curSection ? Object.values(SECTIONS) : [];

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="mobile-toggle" onClick={onMenu}>☰</button>
        {/* 이전 화면으로 — 브라우저 뒤로가기와 동일(히스토리 한 칸 뒤로). */}
        {canGoBack && (
          <button className="tb-back" onClick={onBack} title="이전 화면으로 (브라우저 뒤로가기와 동일)" aria-label="이전 화면으로 돌아가기">←</button>
        )}
        <h1>{TITLES[activePage] || ''}</h1>
        {chips.length > 0 && (
          <div className="tb-chips" role="tablist" aria-label="지원 영역 전환" data-tour="tb-chips">
            {/* 워크스페이스 어디서든 한 번에 홈(영역 선택)으로. */}
            <button
              className="tb-chip tb-home"
              onClick={() => onNavigate && onNavigate('home')}
              title="홈 (영역 선택)"
            >
              ⌂ 홈
            </button>
            {chips.map((s) => {
              const on = s.key === curSection;
              return (
                <button
                  key={s.key}
                  className={'tb-chip' + (on ? ' on' : '')}
                  style={on ? { background: s.color, borderColor: s.color } : undefined}
                  onClick={() => onNavigate && onNavigate(s.dash)}
                  title={s.label}
                  role="tab"
                  aria-selected={on}
                >
                  {s.key === 'iep' ? 'IEP' : 'T' + s.tier}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="topbar-right">
        <SaveBadge />
        <HelpMenu />
        <LLMIndicator onClick={onOpenLLMSettings} />
        <div className="stu-bar" data-tour="stu-bar">
          {/* 년도·학급 통합 선택 — "2026 · 1반" 하나로 (년도가 여럿이면 그룹으로 표시) */}
          <select
            className="stu-select"
            value={curClassId || ''}
            onChange={(e) => onPickClass(e.target.value)}
            title="학년도·학급"
          >
            {classesByYear.length === 0 && <option value="">학급 없음</option>}
            {classesByYear.length === 1
              ? classesByYear[0].list.map((c) => (
                  <option key={c.id} value={c.id}>{c.school_year} · {c.name}</option>
                ))
              : classesByYear.map((g) => (
                  <optgroup key={g.year} label={`${g.year}학년도`}>
                    {g.list.map((c) => (
                      <option key={c.id} value={c.id}>{g.year} · {c.name}</option>
                    ))}
                  </optgroup>
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
          <button className="stu-add" onClick={onManageClasses} title="학급 관리 (새 학년도·학급 추가)">⚙</button>
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
          <button className="stu-add" onClick={onAddStudent} title="학생 추가" disabled={!curClassId} data-tour="add-student">+</button>
        </div>
      </div>
    </div>
  );
}
