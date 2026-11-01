import { useEffect, useRef, useState } from 'react';
import HelpMenu from '../guide/HelpMenu';
import { useAuth } from '../../contexts/AuthContext';
import SaveBadge from '../ui/SaveBadge';
import { useStudents } from '../../contexts/StudentContext';
import { pageTitle } from '../../lib/tiers';
import { CLASS_TABS, STUDENT_TABS, DOCS_SUBS, HELP_SUBS } from '../../lib/routes';

// 새 디자인 상단바 — 기존 Topbar가 공급하던 4가지를 같은 이름으로 다시 준다(mds/54 §1 조건 4).
//   ① 학년도·학기·학급 바꾸기(앱에서 유일한 입구) — '2026 · 1반 · 1학기 ▾' 팝오버 + ⚙ 학급 관리
//   ② SaveBadge(자동 저장 상태) — activePage에 '화면+하위 탭' 주소를 넘겨 하위 탭 전환 때도 초기화(N13)
//   ③ 🧭 HelpMenu(길잡이) — components/guide 그대로
//   ④ 투어·길잡이 앵커 data-tour="stu-bar"(학급 고르기 묶음)·"add-student"(+ 학생)
//   + 🚨 급해요(위기행동 대처 즉시), ← 이전 화면.
//   3단계: 폰 폭(600px 이하) 한 줄 — 제목은 화면 낭독용으로만(아래 탭바·탭 줄이 자리를 알려 줌), 학급 단추는 학급 이름만,
//          '+ 학생'은 학급 팝오버 안으로, 길잡이는 🧭만. 태블릿(1023px 이하)은 왼쪽 메뉴의 사용자 칸 대신 상단 사용자 단추(도움 맨 아래 묶음으로).

function titleOf(route) {
  switch (route.kind) {
    case 'today': return '오늘';
    case 'calendar': return '기록 달력';
    case 'students': return '학생';
    case 'student': return '학생 수첩 · ' + (STUDENT_TABS.find((t) => t.key === route.tab)?.label || '');
    case 'class': return '우리 반 · ' + (CLASS_TABS.find((t) => t.key === route.tab)?.label || '');
    case 'docs': return route.sub ? pageTitle(DOCS_SUBS[route.sub]) : '문서·자료';
    case 'help': return route.sub === 'settings' ? '도움 · 설정' : route.sub ? pageTitle(HELP_SUBS[route.sub]) : '도움';
    case 'crisis': return pageTitle('crisis');
    case 'menu': return '전체 메뉴 (옛 메뉴)';
    case 'page': return pageTitle(route.old);
    default: return '';
  }
}

function ClassPicker({ onManageClasses, onAddStudent }) {
  const { classes, years, curYear, selectYear, curSemester, selectSemester, curClassId, curClass, selectClass } = useStudents();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // 기존 Topbar와 같은 규칙: 학년도별 묶음 + 학급을 고르면 학년도도 함께.
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
  const label = `${curYear} · ${curClass ? curClass.name : '학급 없음'} · ${curSemester}학기`;
  const short = curClass ? curClass.name : '학급';

  return (
    <div className="kb-ctx" ref={boxRef} data-tour="stu-bar">
      <button type="button" className="kb-btn kb-ctx-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title="학년도·학급·학기 바꾸기" aria-label={`학년도·학급·학기 바꾸기 — 지금 ${label}`}>
        <span className="kb-hide-sm">{label}</span><span className="kb-show-sm">{short}</span> <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="kb-pop" role="dialog" aria-label="학년도·학급·학기">
          <label>
            학년도 · 학급
            <select value={curClassId || ''} onChange={(e) => onPickClass(e.target.value)}>
              {classesByYear.length === 0 && <option value="">학급 없음</option>}
              {classesByYear.length > 0 && !curClassId && <option value="">— 학급을 선택하세요 —</option>}
              {classesByYear.map((g) => (
                <optgroup key={g.year} label={`${g.year}학년도`}>
                  {g.list.map((c) => <option key={c.id} value={c.id}>{g.year} · {c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            학기
            <select value={curSemester} onChange={(e) => selectSemester(e.target.value)}>
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
            </select>
          </label>
          <button type="button" className="kb-btn" onClick={() => { setOpen(false); onManageClasses(); }}>⚙ 학급 관리 (새 학년도·학급 추가)</button>
          <button type="button" className="kb-btn kb-show-sm" onClick={() => { setOpen(false); onAddStudent(); }} disabled={!curClassId}>+ 학생 추가</button>
        </div>
      )}
    </div>
  );
}

export default function NewTopbar({ route, onNavigate, canGoBack, onBack, actions }) {
  const { curClassId } = useStudents();
  const { user } = useAuth();
  const title = titleOf(route);
  const toAccount = () => {
    onNavigate('#help');
    setTimeout(() => { const el = document.querySelector('[data-tour="help-foot"]'); if (el) { try { el.scrollIntoView({ block: 'start' }); } catch (_e) { /* noop */ } } }, 150);
  };
  return (
    <div className="kb-topbar">
      {canGoBack && (
        <button type="button" className="kb-btn kb-sq" onClick={onBack} title="이전 화면으로 (브라우저 뒤로가기와 같음)" aria-label="이전 화면으로 돌아가기">←</button>
      )}
      <h1 title={title} className="kb-top-title">{title}</h1>
      <div className="kb-top-r">
        <ClassPicker onManageClasses={actions.openManageClasses} onAddStudent={actions.openAddStudent} />
        <button type="button" className="kb-btn kb-hide-sm" onClick={actions.openAddStudent} disabled={!curClassId} data-tour="add-student" title="학생 추가">+ 학생</button>
        <span className="kb-hide-sm"><SaveBadge activePage={route.hash} /></span>
        <HelpMenu />
        <button type="button" className="kb-btn kb-sq kb-touch-only kb-hide-sm" onClick={toAccount} title={`${user?.name || '선생님'} — 계정·설정·로그아웃`} aria-label="계정 · 설정 · 로그아웃" data-tour="kb-top-user">{(user?.name || 'T').charAt(0)}</button>
        {/* 4단계: 학생 수첩에서는 수첩 머리의 🚨 급해요 하나만(두 개가 나란히 보이지 않게, 프로토타입과 같음) */}
        {route.kind !== 'student' && <button type="button" className="kb-btn kb-danger" onClick={() => onNavigate('crisis')} title="위기행동 대처 화면을 바로 열어요(학생 없이도 열려요)">🚨 급해요</button>}
      </div>
    </div>
  );
}
