import { useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { EditableChipGroup, makeAppender } from '../ui/QChip';
import { printBehaviorContract } from '../../lib/utils/printContract';

// ✍ 행동 계약서 — Tier 2 독립 메뉴 (0827 동료 피드백: CICO 화면 안 카드가 아니라
// CICO·집단강화·행동계약이 나란한 Tier 2 중재로 보이도록 메뉴 분리).
// 학생은 상단 학생 선택(또는 메뉴 클릭 시 선택 창)으로 고른다. 인쇄 전용 — 저장하지 않는다.
const REWARD_CHIPS = ['스티커 5개당 작은 선물', '특별 활동 시간', '선택 시간', '또래 칭찬 카드', '보호자 칭찬 통신문', '자리 선택권'];

export default function ContractPage() {
  const { curStu, curStuData, curStuDataLoaded } = useStudents();
  const { user } = useAuth();
  const toast = useToast();

  const [conStu, setConStu] = useState('');
  const [conCrit, setConCrit] = useState('');
  const [conTch, setConTch] = useState('');
  const [conStart, setConStart] = useState('');
  const [conEnd, setConEnd] = useState('');

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="학생 자료를 불러오는 중…" /></>;

  // 중재계획(BIP)을 이미 작성한 학생이면 대체행동·성공 기준을 약속 칸에 채워준다.
  function fillFromBip() {
    const bip = curStuData?.bip || {};
    const alt = String(bip.alt || '').trim();
    const crit = String(bip.crit || '').trim();
    if (!alt && !crit) { toast('가져올 내용이 없어요 — 중재계획(BIP)의 대체 행동·성공 기준을 먼저 작성하면 자동으로 채울 수 있어요.'); return; }
    if (alt) setConStu(alt);
    if (crit) setConCrit(crit);
    toast('중재계획(BIP) 내용으로 채웠습니다.');
  }

  function onPrint() {
    if (!conStu.trim()) { toast('학생의 약속을 입력해주세요.'); return; }
    printBehaviorContract({
      studentId: curStu.code,
      teacherName: user?.name || '',
      stu: conStu, crit: conCrit, tch: conTch, d1: conStart, d2: conEnd,
    });
  }

  return (
    <>
      <StuHero />

      <div className="card" style={{ background: '#fff8e8', borderColor: '#f2dfad', fontSize: '.84rem', lineHeight: 1.6 }}>
        ✍ <strong>행동 계약</strong>은 CICO·집단강화와 함께 Tier 2 수준의 대표 중재예요. 학생과 함께 <strong>목표 행동과 보상</strong>을
        약속하고 서명한 뒤, 매일의 실천은 <strong>CICO / DPR 운영</strong>에서 점검하면 됩니다.
      </div>

      <div className="card" data-tour="ct-form">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>✍ 행동 계약서 작성</div>
            <div className="card-subtitle">작성한 내용은 서명란이 있는 인쇄용 계약서로 출력됩니다.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={fillFromBip} title="중재계획(BIP)의 대체 행동·성공 기준으로 채우기">📋 중재계획(BIP)에서 가져오기</button>
        </div>
        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">나(학생)의 약속</label>
          <input className="form-input" value={conStu} onChange={(e) => setConStu(e.target.value)} placeholder="목표 행동 — 예: 수업 시간에 자리에 앉아 과제하기" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">성공 기준</label>
            <input className="form-input" value={conCrit} onChange={(e) => setConCrit(e.target.value)} placeholder="예: 하루 3회 이상, 2주 연속" />
          </div>
          <div className="form-group">
            <label className="form-label">선생님의 약속 (보상)</label>
            <EditableChipGroup storageKey="bip_reward" defaults={REWARD_CHIPS} onPick={makeAppender(conTch, setConTch, true)} />
            <input className="form-input" value={conTch} onChange={(e) => setConTch(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">계약 시작일</label><input type="date" className="form-input" value={conStart} onChange={(e) => setConStart(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">계약 종료일</label><input type="date" className="form-input" value={conEnd} onChange={(e) => setConEnd(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-ok" onClick={onPrint}>🖨 계약서 인쇄/저장</button>
        </div>
      </div>
    </>
  );
}
