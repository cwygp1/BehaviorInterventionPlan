import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { EditableChipGroup, makeAppender } from '../ui/QChip';
import ResourceDownloads from '../ui/ResourceDownloads';
import { printBehaviorContract } from '../../lib/utils/printContract';
import { downloadContractDocx } from '../../lib/utils/contractDocx';

// ✍ 행동 계약서 — Tier 2 독립 메뉴 (0827 동료 피드백: CICO 화면 안 카드가 아니라
// CICO·집단강화·행동계약이 나란한 Tier 2 중재로 보이도록 메뉴 분리).
// 0828: LMAC 계약서 양식(Dardig & Heward 계열) 구조로 개편 — 과제(누가/무엇을/언제/얼마나 잘)
// + 보상(누가/무엇을/언제/얼마나) + 서명·날짜 + 과제 기록표(없음/월~금/일주일).
// 학생은 상단 학생 선택(또는 메뉴 클릭 시 선택 창)으로 고른다. 인쇄·다운로드 전용 — 저장하지 않는다.
const REWARD_CHIPS = ['스티커 5개당 작은 선물', '특별 활동 시간', '선택 시간', '또래 칭찬 카드', '보호자 칭찬 통신문', '자리 선택권'];

const RECORD_OPTIONS = [
  { key: 'none', label: '기록표 없음', hint: '계약서만' },
  { key: 'mf', label: '월~금 기록표', hint: '주중 5일' },
  { key: 'week', label: '일주일 기록표', hint: '월~일 7일' },
];

// 첨부 원본 양식 (public/docs/contract/) — 손글씨용 빈 양식·작성 예시.
const CONTRACT_DOCS = [
  { name: '(예시) 행동 계약서 — 한글 작성 예시', desc: '실제로 작성된 한글 계약서 예시 (참고용)', links: [{ label: 'PDF', href: '/docs/contract/행동계약서_한글_예시.pdf' }] },
  { name: '(양식) 행동 계약서 — 기록표 없음', desc: '계약서만 있는 기본 양식 (영문 원본)', links: [{ label: 'PDF', href: '/docs/contract/행동계약서_기록표없음_영문.pdf' }] },
  { name: '(양식) 행동 계약서 — 월~금 과제 기록표', desc: '주중(월~금) 과제 기록표 포함 양식 (영문 원본)', links: [{ label: 'PDF', href: '/docs/contract/행동계약서_월금기록표_영문.pdf' }] },
  { name: '(양식) 행동 계약서 — 일주일 과제 기록표', desc: '매일(월~일) 과제 기록표 포함 양식 (영문 원본)', links: [{ label: 'PDF', href: '/docs/contract/행동계약서_일주일기록표_영문.pdf' }] },
];

const panelStyle = (accent, bg) => ({
  border: `1.5px solid ${accent}33`, borderLeft: `4px solid ${accent}`,
  background: bg, borderRadius: 10, padding: '12px 14px', marginTop: 10,
});

// 컴포넌트 밖에 정의 — 렌더마다 새 타입이 되면 입력 중 포커스가 풀린다.
const F = ({ label, value, set, placeholder, flex }) => (
  <div className="form-group" style={flex ? { flex: 1, minWidth: 160 } : undefined}>
    <label className="form-label">{label}</label>
    <input className="form-input" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
  </div>
);

export default function ContractPage() {
  const { curStu, curStuData, curStuDataLoaded } = useStudents();
  const { user } = useAuth();
  const toast = useToast();

  // 과제(Task) — 학생이 하는 것
  const [taskWho, setTaskWho] = useState('');
  const [taskWhat, setTaskWhat] = useState('');
  const [taskWhen, setTaskWhen] = useState('');
  const [taskHowWell, setTaskHowWell] = useState('');
  // 보상(Reward) — 선생님이 주는 것
  const [rwdWho, setRwdWho] = useState('');
  const [rwdWhat, setRwdWhat] = useState('');
  const [rwdWhen, setRwdWhen] = useState('');
  const [rwdHowMuch, setRwdHowMuch] = useState('');
  // 기간 · 기록표
  const [conStart, setConStart] = useState('');
  const [conEnd, setConEnd] = useState('');
  const [recordType, setRecordType] = useState('mf');
  const [weeks, setWeeks] = useState(4);

  // 학생을 바꾸면 '누가' 칸은 새 학생 코드로 갱신 (다른 칸은 이어서 작성할 수 있게 유지).
  useEffect(() => { setTaskWho(curStu?.code || ''); }, [curStu?.code]);
  useEffect(() => { setRwdWho((p) => p || user?.name || ''); }, [user?.name]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="학생 자료를 불러오는 중…" /></>;

  // 중재계획(BIP)을 이미 작성한 학생이면 대체행동·성공 기준을 약속 칸에 채워준다.
  function fillFromBip() {
    const bip = curStuData?.bip || {};
    const alt = String(bip.alt || '').trim();
    const crit = String(bip.crit || '').trim();
    if (!alt && !crit) { toast('가져올 내용이 없어요 — 중재계획(BIP)의 대체 행동·성공 기준을 먼저 작성하면 자동으로 채울 수 있어요.'); return; }
    if (alt) setTaskWhat(alt);
    if (crit) setTaskHowWell(crit);
    toast('중재계획(BIP) 내용으로 채웠습니다.');
  }

  function payload() {
    return {
      studentId: curStu.code,
      teacherName: user?.name || '',
      task: { who: taskWho, what: taskWhat, when: taskWhen, howWell: taskHowWell },
      reward: { who: rwdWho, what: rwdWhat, when: rwdWhen, howMuch: rwdHowMuch },
      d1: conStart, d2: conEnd, recordType, weeks,
    };
  }

  function onPrint() {
    if (!taskWhat.trim()) toast('약속(무엇을)이 비어 있어요 — 빈 계약서 양식으로 출력해 손으로 적을 수도 있어요.');
    printBehaviorContract(payload());
  }

  async function onDocx() {
    if (!taskWhat.trim()) toast('약속(무엇을)이 비어 있어요 — 빈 양식 문서로 내려받아 직접 적을 수도 있어요.');
    try {
      await downloadContractDocx(payload());
      toast('Word(.docx) 문서로 내려받았습니다.');
    } catch (e) {
      console.error(e);
      toast('문서 생성에 실패했어요. 다시 시도해주세요.');
    }
  }

  return (
    <>
      <StuHero />

      <div className="card" style={{ background: '#fff8e8', borderColor: '#f2dfad', fontSize: '.84rem', lineHeight: 1.6 }}>
        ✍ <strong>행동 계약</strong>은 CICO·집단강화와 함께 Tier 2 수준의 대표 중재예요. 학생과 함께
        <strong> 과제(목표 행동)와 보상</strong>을 <strong>누가·무엇을·언제·얼마나</strong>로 구체적으로 약속하고
        서명한 뒤, 계약서에 붙은 <strong>과제 기록표</strong>(또는 CICO/DPR)로 매일 점검하면 됩니다.
      </div>

      <div className="card" data-tour="ct-form">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>✍ 행동 계약서 작성</div>
            <div className="card-subtitle">서명란·과제 기록표가 있는 계약서로 인쇄하거나 Word 문서로 내려받아요. 빈칸으로 출력하면 손글씨 양식이 됩니다.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={fillFromBip} title="중재계획(BIP)의 대체 행동·성공 기준으로 채우기">📋 중재계획(BIP)에서 가져오기</button>
        </div>

        {/* 과제 (Task) */}
        <div style={panelStyle('#2a3568', '#f6f8ff')}>
          <div style={{ fontWeight: 800, fontSize: '.88rem', color: '#2a3568', marginBottom: 6 }}>
            과제 (Task) <span style={{ fontWeight: 600, fontSize: '.74rem', color: 'var(--muted)' }}>— 학생이 지킬 약속</span>
          </div>
          <div className="form-row">
            <F label="누가" value={taskWho} set={setTaskWho} placeholder="학생 이름 (또는 코드)" flex />
            <F label="언제" value={taskWhen} set={setTaskWhen} placeholder="예: 매일 1~4교시 수업 시간에" flex />
          </div>
          <F label="무엇을 (목표 행동)" value={taskWhat} set={setTaskWhat} placeholder="예: 자리에 앉아 과제를 끝까지 하기" />
          <F label="얼마나 잘 (성공 기준)" value={taskHowWell} set={setTaskHowWell} placeholder="예: 하루 4번 중 3번 이상 성공하면 ○" />
        </div>

        {/* 보상 (Reward) */}
        <div style={panelStyle('#b3924a', '#fffaf0')}>
          <div style={{ fontWeight: 800, fontSize: '.88rem', color: '#8a6d2f', marginBottom: 6 }}>
            보상 (Reward) <span style={{ fontWeight: 600, fontSize: '.74rem', color: 'var(--muted)' }}>— 선생님이 지킬 약속</span>
          </div>
          <div className="form-row">
            <F label="누가" value={rwdWho} set={setRwdWho} placeholder="보상을 주는 사람 (예: 담임 선생님)" flex />
            <F label="언제" value={rwdWhen} set={setRwdWhen} placeholder="예: 금요일 마지막 교시에" flex />
          </div>
          <div className="form-group">
            <label className="form-label">무엇을 (보상 내용)</label>
            <EditableChipGroup storageKey="bip_reward" defaults={REWARD_CHIPS} onPick={makeAppender(rwdWhat, setRwdWhat, true)} />
            <input className="form-input" value={rwdWhat} onChange={(e) => setRwdWhat(e.target.value)} placeholder="예: 좋아하는 보드게임 20분" />
          </div>
          <F label="얼마나" value={rwdHowMuch} set={setRwdHowMuch} placeholder="예: 일주일에 ○를 12개 모으면" />
        </div>

        {/* 기간 · 기록표 옵션 */}
        <div className="form-row" style={{ marginTop: 10 }}>
          <div className="form-group"><label className="form-label">계약 시작일</label><input type="date" className="form-input" value={conStart} onChange={(e) => setConStart(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">계약 종료일</label><input type="date" className="form-input" value={conEnd} onChange={(e) => setConEnd(e.target.value)} /></div>
        </div>
        <div className="form-group" style={{ marginTop: 4 }}>
          <label className="form-label">과제 기록표 (계약서 아래에 함께 인쇄)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {RECORD_OPTIONS.map((o) => (
              <button
                key={o.key}
                className={`btn btn-sm ${recordType === o.key ? 'btn-ok' : 'btn-ghost'}`}
                onClick={() => setRecordType(o.key)}
                title={o.hint}
              >{recordType === o.key ? '✓ ' : ''}{o.label}</button>
            ))}
            {recordType !== 'none' && (
              <select className="form-input" style={{ width: 110 }} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}주 분량</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onDocx}>⬇ Word(.docx) 다운로드</button>
          <button className="btn btn-ok" onClick={onPrint}>🖨 계약서 인쇄 / PDF 저장</button>
        </div>
      </div>

      <ResourceDownloads
        title="📎 계약서 원본 양식 (다운로드)"
        subtitle="손으로 작성할 수 있는 빈 양식과 한글 작성 예시입니다. 위 작성 화면은 이 양식의 구조(과제·보상 × 누가/무엇을/언제/얼마나)를 그대로 따라요."
        files={CONTRACT_DOCS}
      />
    </>
  );
}
