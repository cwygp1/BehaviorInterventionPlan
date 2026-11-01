import { useEffect, useRef } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import TeachingRecordPanel from '../student/TeachingRecordPanel';
import { ESCORT_EVENT } from '../../lib/escortSignal';

// 교수 회기 기록(과제분석·DTT·5점 척도 …) 폼 — MonitorPage '교수 회기 기록' 탭 본문을 학생 id prop 컴포넌트로 감쌌다
//   (새 디자인 2단계, mds/54 §2-1 #18). 기록 형태 고르기 + 형태별 패널(ProgramSessionPanel·DttPanel·ScalePanel)을 통째로 쓴다.
//   ⚠ 세 패널은 600줄 안팎이고 안에서 '지금 학생(curStuId)'을 읽는다 — 패널을 고치지 않고, 이 폼은
//     studentId가 지금 학생과 같을 때만 그린다(빠른 기록 창은 창을 열 때 그 학생을 지금 학생으로 고른다).
//   onSaved: 회기 저장 성공 신호(escortSignal 'session-saved', 세 패널이 보냄)를 받으면 부른다 — 창의 '✓ 저장함' 표시용.
//   onDirty(3단계): 패널 상태는 패널 안(600줄 안팎)에 있어 직접 못 읽는다 — 대신 패널 안에서 일어난 입력을 본다.
//     · 글칸·선택칸 입력(input/change), 기회 칸·빠른 표시(+ − P I)·단계 고르기 같은 누름 단추(aria-label·aria-pressed 있는 단추)
//     → '쓰다 만 내용 있음'. 회기 저장 신호가 오면 다시 '없음'. 프로그램 고르기 같은 이동성 누름도 잡힐 수 있어(거짓 양성)
//     창의 확인 줄은 '버리고 닫기'를 늘 함께 보인다.
const isMarkButton = (el) => {
  const b = el && el.closest ? el.closest('button') : null;
  if (!b) return false;
  return b.hasAttribute('aria-pressed') || /기회|단계|점|표시/.test(b.getAttribute('aria-label') || '');
};

export default function SessionForm({ studentId, onNavigate, onSaved, onDirty }) {
  const { curStuId } = useStudents();
  const dirtyRef = useRef(false);
  const setDirty = (v) => { if (dirtyRef.current === v) return; dirtyRef.current = v; if (onDirty) onDirty(v); };
  useEffect(() => {
    const h = (e) => {
      if (e?.detail?.kind !== 'session-saved') return;
      setDirty(false);
      if (onSaved) onSaved();
    };
    window.addEventListener(ESCORT_EVENT, h);
    return () => window.removeEventListener(ESCORT_EVENT, h);
  }, [onSaved, onDirty]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!studentId || studentId !== curStuId) return <div className="kb-loading">학생 자료를 여는 중…</div>;
  if (!onDirty) return <TeachingRecordPanel key={studentId} onNavigate={onNavigate} />;
  return (
    <div
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
      onClickCapture={(e) => { if (isMarkButton(e.target)) setDirty(true); }}
    >
      <TeachingRecordPanel key={studentId} onNavigate={onNavigate} />
    </div>
  );
}
