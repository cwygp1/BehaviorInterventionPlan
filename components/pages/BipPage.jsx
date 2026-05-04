import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { QChipGroup, makeAppender } from '../ui/QChip';
import BIPPromptModal from '../modals/BIPPromptModal';
import FamilyLetterModal from '../modals/FamilyLetterModal';
import { saveBIP as apiSaveBIP } from '../../lib/api/students';
import { printBehaviorContract } from '../../lib/utils/printContract';
import { printBIP } from '../../lib/utils/printBIP';

const ALT_CHIPS = ['쉬어 카드 들기', '"도와주세요" 카드', '심호흡 3회', '감각 도구 요청', '휴식 신호', '대안 활동 선택'];
const FCT_CHIPS = ['"도와주세요" 카드', '"쉬고 싶어요" 카드', '"이해 안 돼요" 카드', '"그만" 카드', 'PECS 그림 카드', 'AAC 음성 출력'];
const CRIT_CHIPS = ['하루 3회 미만', '주 5회 이상', '2주 연속', '한 달 연속', '80% 이상', '강도 2 이하'];
const PREV_CHIPS = ['시각적 일과표 제공', '선택권 2~3가지 제공', '환경 조정(파티션)', '과제 난이도 조정', '사전 예고 5분 전', '감각 휴식 시간 배치', '4:1 긍정 비율 유지', '좌석 배치 변경', '시각 단서 카드', '작업 분량 시각적 표시'];
const TEACH_CHIPS = ['FCT 직접 교수', '모델링 후 역할극', '사회적 이야기(Carol Gray)', '비디오 모델링', '자기관리 훈련', '또래 매개 중재(PMI)', '과제 분석 단계별', '점진적 촉진 줄이기'];
const REINF_CHIPS = ['차별강화 DRA(대체행동)', '차별강화 DRO(부재 강화)', '토큰 경제', '즉각 칭찬 + 스티커', '활동 강화(선호 활동)', '4:1 긍정:재지도 비율', '자연 강화 활용'];
const RESP_CHIPS = ['계획적 무시 10초', '대체행동 즉각 촉진', '안전 거리 확보', '심리안정실 이동', '위기관리팀 호출', '보호자 연락', '그라운딩 5-4-3-2-1', '신체적 개입(최후 수단)'];
const REWARD_CHIPS = ['스티커 5개당 작은 선물', '특별 활동 시간', '선택 시간', '또래 칭찬 카드', '보호자 칭찬 통신문', '자리 선택권'];

export default function BipPage() {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const { user } = useAuth();
  const toast = useToast();

  const [alt, setAlt] = useState('');
  const [fct, setFct] = useState('');
  const [crit, setCrit] = useState('');
  const [prev, setPrev] = useState('');
  const [teach, setTeach] = useState('');
  const [reinf, setReinf] = useState('');
  const [resp, setResp] = useState('');

  const [conStu, setConStu] = useState('');
  const [conCrit, setConCrit] = useState('');
  const [conTch, setConTch] = useState('');
  const [conStart, setConStart] = useState('');
  const [conEnd, setConEnd] = useState('');

  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);

  useEffect(() => {
    const b = curStuData?.bip || {};
    setAlt(b.alt || ''); setFct(b.fct || ''); setCrit(b.crit || '');
    setPrev(b.prev || ''); setTeach(b.teach || ''); setReinf(b.reinf || ''); setResp(b.resp || '');
  }, [curStuId, curStuData?.bip]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const body = { alt, fct, crit, prev, teach, reinf, resp };
      await apiSaveBIP(curStuId, body);
      updateStudentData(curStuId, (cur) => ({ ...cur, bip: body }));
      toast('BIP 저장 완료');
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function copyBIPToContract() {
    if (!alt && !crit) { toast('BIP 칸을 먼저 작성해주세요.'); return; }
    if (alt) setConStu(alt);
    if (crit) setConCrit(crit);
    toast('BIP 데이터로 채웠습니다.');
  }

  function onPrintBIP() {
    if (!alt && !prev && !teach && !reinf && !resp) {
      toast('BIP 내용을 먼저 작성해주세요.');
      return;
    }
    printBIP({
      studentId: curStu.code,
      level: curStu.level,
      disability: curStu.disability,
      note: curStu.note,
      teacherName: user?.name,
      school: user?.school,
      bip: { alt, fct, crit, prev, teach, reinf, resp },
    });
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

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>🎯 목표 행동(대체 행동) 설정</div>
            <div className="card-subtitle">ABC + QABF + 학생 정보를 기반으로 AI가 4영역 초안을 만들어줍니다.</div>
          </div>
          <button className="btn btn-pri btn-sm" onClick={() => setAiOpen(true)}>📜 AI BIP 중재안 프롬프트</button>
        </div>
        <div className="form-group">
          <label className="form-label">대체 행동</label>
          <QChipGroup options={ALT_CHIPS} onPick={makeAppender(alt, setAlt, true)} />
          <input className="form-input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="문제행동 대신 할 바람직한 행동" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">FCT 기술</label>
            <QChipGroup options={FCT_CHIPS} onPick={makeAppender(fct, setFct, true)} />
            <input className="form-input" value={fct} onChange={(e) => setFct(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">성공 기준</label>
            <QChipGroup options={CRIT_CHIPS} onPick={makeAppender(crit, setCrit, true)} />
            <input className="form-input" value={crit} onChange={(e) => setCrit(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📜 중재 전략 (예방-교수-강화-반응)</div>
        <div className="form-group">
          <label className="form-label">🛡 예방 전략</label>
          <QChipGroup options={PREV_CHIPS} onPick={makeAppender(prev, setPrev, false)} />
          <textarea className="form-textarea" value={prev} onChange={(e) => setPrev(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">📖 교수 전략</label>
          <QChipGroup options={TEACH_CHIPS} onPick={makeAppender(teach, setTeach, false)} />
          <textarea className="form-textarea" value={teach} onChange={(e) => setTeach(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">⭐ 강화 전략</label>
          <QChipGroup options={REINF_CHIPS} onPick={makeAppender(reinf, setReinf, false)} />
          <textarea className="form-textarea" value={reinf} onChange={(e) => setReinf(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">🚨 반응 절차</label>
          <QChipGroup options={RESP_CHIPS} onPick={makeAppender(resp, setResp, false)} />
          <textarea className="form-textarea" value={resp} onChange={(e) => setResp(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onPrintBIP}>🖨 BIP 인쇄/PDF</button>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 BIP 저장</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>✍ 행동 계약서</div>
          <button className="btn btn-ghost btn-sm" onClick={copyBIPToContract}>📋 BIP에서 가져오기</button>
        </div>
        <div className="form-group">
          <label className="form-label">나(학생)의 약속</label>
          <input className="form-input" value={conStu} onChange={(e) => setConStu(e.target.value)} placeholder="목표 행동" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">성공 기준</label>
            <input className="form-input" value={conCrit} onChange={(e) => setConCrit(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">선생님의 약속 (보상)</label>
            <QChipGroup options={REWARD_CHIPS} onPick={makeAppender(conTch, setConTch, true)} />
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

      {/* 가정 연계 통신문 — 별도의 카드로 격상 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #f0fbf4 0%, #e7f7ee 100%)', borderColor: '#9be0b9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: '1.4rem' }}>✉</span>
              <strong style={{ fontSize: '1.05rem', color: '#0a7d4e' }}>가정 연계 통신문</strong>
              {(curStuData?.letters?.length || 0) > 0 && (
                <span style={{ background: '#0a7d4e', color: '#fff', fontSize: '.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>
                  📜 {curStuData.letters.length}건
                </span>
              )}
            </div>
            <p style={{ fontSize: '.85rem', color: '#0a7d4e', opacity: 0.85, lineHeight: 1.6 }}>
              학부모와의 협력을 위한 통신문을 카테고리별로 작성·인쇄하고 이력으로 관리합니다.<br />
              AI가 학생 BIP·관찰 기록을 바탕으로 초안도 생성해줍니다.
            </p>
          </div>
          <button className="btn btn-ok" onClick={() => setLetterOpen(true)} style={{ flexShrink: 0 }}>
            ✉ 통신문 작성
          </button>
        </div>
      </div>

      <FamilyLetterModal open={letterOpen} onClose={() => setLetterOpen(false)} />
      <BIPPromptModal open={aiOpen} onClose={() => setAiOpen(false)}
        onApply={(parsed) => {
          if (parsed.alt) setAlt(parsed.alt);
          if (parsed.fct) setFct(parsed.fct);
          if (parsed.crit) setCrit(parsed.crit);
          if (parsed.prev) setPrev(parsed.prev);
          if (parsed.teach) setTeach(parsed.teach);
          if (parsed.reinf) setReinf(parsed.reinf);
          if (parsed.resp) setResp(parsed.resp);
        }}
      />
    </>
  );
}
