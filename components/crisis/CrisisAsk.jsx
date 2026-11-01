import { useCallback, useRef, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import PageFrame from '../onboarding/PageFrame';
import CrisisPage from '../pages/CrisisPage';
import PickStudentModal from '../modals/PickStudentModal';

// 🚨 급해요(#crisis) — 학생 없이도 바로 열리는 위기행동 대처 화면에 '학생 묻기'를 씌운 래퍼(mds/54 §2-1 #31, 2단계).
//   예전엔 학생 없이 열면 'AI 시나리오'·'심리안정실 기록'이 "우측 상단에서 학생을 선택" 토스트로 끝났다(새 디자인엔 그 자리가 없다).
//   이제 그 단추를 누르면 학생 고르기 창이 뜨고, 고르면 하려던 일(시나리오 창 열기 / 기록 칸 보이기)이 이어진다.
//   7단계 대처·자료실·그라운딩은 지금처럼 학생 없이 본다. 원 화면(CrisisPage)은 askStudent prop 하나만 받는다.
export default function CrisisAsk({ onNavigate }) {
  const { curStu, selectStudent } = useStudents();
  const { openAddStudent } = useUIActions();
  const [pickOpen, setPickOpen] = useState(false);
  const resolver = useRef(null);
  const pickingRef = useRef(false); // PickStudentModal은 고르면 onPicked 다음에 바로 onClose를 부른다 — 그 onClose는 '취소'가 아니다

  const askStudent = useCallback(() => new Promise((resolve) => {
    resolver.current = resolve;
    setPickOpen(true);
  }), []);
  const finish = (ok) => {
    const r = resolver.current;
    resolver.current = null;
    if (r) r(ok);
  };

  return (
    <>
      <PageFrame page="crisis" onNavigate={onNavigate} />
      <div className="kb-card" style={{ marginBottom: 14, padding: '12px 18px' }} data-tour="crisis-student">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="kb-muted" style={{ flex: 1, minWidth: 220 }}>
            {curStu
              ? <>지금 학생: <b>{curStu.code}</b> — 시나리오와 심리안정실 기록이 이 학생 것으로 저장돼요.</>
              : <>7단계 대처·자료는 학생 없이 바로 보세요. 시나리오 만들기·심리안정실 기록은 학생을 고르면 이어져요.</>}
          </div>
          <button type="button" className="kb-btn kb-out" onClick={() => askStudent()}>{curStu ? '학생 바꾸기' : '학생 고르기'}</button>
        </div>
      </div>
      <CrisisPage askStudent={askStudent} />
      <PickStudentModal
        open={pickOpen}
        forPage="crisis"
        onClose={() => { setPickOpen(false); if (!pickingRef.current) finish(false); }}
        onPicked={async (sid) => {
          pickingRef.current = true;
          try { await selectStudent(sid); finish(true); } catch (_e) { finish(false); } finally { pickingRef.current = false; }
        }}
        onAddNew={() => { setPickOpen(false); finish(false); openAddStudent(); }}
      />
    </>
  );
}
