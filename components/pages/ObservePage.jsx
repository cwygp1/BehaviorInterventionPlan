import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { QChipGroup, makeAppender } from '../ui/QChip';
import Modal from '../ui/Modal';
import EditStudentModal from '../modals/EditStudentModal';
import RAISDModal from '../modals/RAISDModal';
import PriorityChecklistModal from '../modals/PriorityChecklistModal';
import DeadMansModal from '../modals/DeadMansModal';
import { createABC as apiCreateABC, deleteABC as apiDeleteABC } from '../../lib/api/students';

const ABC_TIMES = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '쉬는 시간', '점심', '등교', '하교'];
const ABC_PLACES = ['교실', '복도', '운동장', '급식실', '특별실', '통합학급', '화장실', '보건실'];
const A_CHIPS = ['지시 받음', '활동 전환 시', '휴식 끝날 때', '또래와 갈등', '감각 자극(소음/조명)', '낯선 환경', '대기 시간', '평가/시험 시작', '좋아하는 활동 종료', '요구 거절됨'];
const B_CHIPS = ['자리 이탈', '소리 지르기', '물건 던지기', '거부', '회피', '공격 행동', '자해', '반복 행동', '울기', '도주', '무반응', '자기 자극'];
const C_CHIPS = ['교사 개입', '활동 중단', '또래 분리', '심리안정실 이용', '강화 제공', '계획적 무시', '대체행동 촉진', '위기관리팀 호출', '보호자 통보', '학생 진정'];

export default function ObservePage() {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeVal, setTimeVal] = useState('');
  const [placeVal, setPlaceVal] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const [busy, setBusy] = useState(false);

  const [exOpen, setExOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [raisdOpen, setRaisdOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [deadOpen, setDeadOpen] = useState(false);

  // Sync time+place into the abcTime field display
  const timeText = [timeVal, placeVal].filter(Boolean).join(' / ');

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  const abc = curStuData?.abc || [];

  async function onSave() {
    if (!a.trim() || !b.trim() || !c.trim()) { toast('A, B, C를 모두 입력해주세요.'); return; }
    setBusy(true);
    try {
      const body = { date, time: timeText, a, b, c };
      const res = await apiCreateABC(curStuId, body);
      const newRec = res.record;
      updateStudentData(curStuId, (cur) => ({ ...cur, abc: [newRec, ...cur.abc] }));
      setA(''); setB(''); setC(''); setTimeVal(''); setPlaceVal('');
      toast('ABC 기록 저장 완료');
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    try {
      await apiDeleteABC(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, abc: cur.abc.filter((r) => r.id !== id) }));
      toast('삭제됨');
    } catch (e) {
      toast('삭제 실패: ' + e.message);
    }
  }

  return (
    <>
      <StuHero />

      <div className="card">
        <div className="card-title">👤 학생 프로필</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.88rem', color: 'var(--sub)' }}>
          <span><strong>ID:</strong> {curStu.code}</span>
          <span><strong>학교급:</strong> {curStu.level}</span>
          <span><strong>장애:</strong> {curStu.disability}</span>
        </div>
        <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 8 }}>{curStu.note || '(비식별 요약 없음)'}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>프로필 수정</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setRaisdOpen(true)}>💡 선호/강화물 (RAISD)</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPriorityOpen(true)}>📋 문제행동 우선순위</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeadOpen(true)}>🪄 조작적 정의 도우미</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📋 ABC 행동 관찰 기록 작성</div>
        <div className="card-subtitle">선행사건(A) → 행동(B) → 결과(C)를 관찰 가능한 사실로 기록하세요.{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setExOpen(true)}>작성 예시 보기</button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">날짜</label>
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">시간 / 장소</label>
            <input className="form-input" value={timeText} readOnly placeholder="시간/장소 칩에서 선택" />
            <QChipGroup label="시간" options={ABC_TIMES} mode="set" target={timeVal} onChange={setTimeVal} />
            <QChipGroup label="장소" options={ABC_PLACES} mode="set" target={placeVal} onChange={setPlaceVal} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">A (선행사건, Antecedent)</label>
          <QChipGroup options={A_CHIPS} onPick={makeAppender(a, setA, false)} />
          <textarea className="form-textarea" value={a} onChange={(e) => setA(e.target.value)} placeholder="행동 직전에 어떤 상황이 있었나요?" />
        </div>
        <div className="form-group">
          <label className="form-label">B (행동, Behavior)</label>
          <QChipGroup options={B_CHIPS} onPick={makeAppender(b, setB, false)} />
          <textarea className="form-textarea" value={b} onChange={(e) => setB(e.target.value)} placeholder="학생이 정확히 어떤 행동을 했나요?" />
        </div>
        <div className="form-group">
          <label className="form-label">C (결과, Consequence)</label>
          <QChipGroup options={C_CHIPS} onPick={makeAppender(c, setC, false)} />
          <textarea className="form-textarea" value={c} onChange={(e) => setC(e.target.value)} placeholder="행동 직후 어떤 결과가 발생했나요?" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 ABC 기록 저장</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📄 누적 ABC 기록 <span className="badge badge-pri">{abc.length}건</span></div>
        {abc.length === 0 ? (
          <div className="empty-state"><span className="emoji">📄</span>저장된 기록이 없습니다.</div>
        ) : (
          <ul className="data-list">
            {abc.slice().reverse().map((r) => (
              <li key={r.id} className="data-item">
                <button className="data-item-del" onClick={() => onDelete(r.id)} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri">{r.created_at || r.date}</span>
                  <span className="data-item-date">{r.time || ''}</span>
                </div>
                <div className="data-item-body">
                  <strong>A:</strong> {r.a}<br />
                  <strong>B:</strong> {r.b}<br />
                  <strong>C:</strong> {r.c}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={exOpen} onClose={() => setExOpen(false)} maxWidth={680}>
        <h3>📋 ABC 작성 예시</h3>
        <p style={{ fontSize: '.85rem', color: 'var(--sub)', marginTop: 6 }}>출처: 국립특수교육원</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: '.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>구분</th>
              <th style={{ padding: 8, textAlign: 'left', color: 'var(--err)' }}>❌ 나쁜 예시</th>
              <th style={{ padding: 8, textAlign: 'left', color: 'var(--ok)' }}>✅ 좋은 예시</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: 8, fontWeight: 700 }}>A</td><td style={{ padding: 8 }}>기분이 안 좋아 보일 때</td><td style={{ padding: 8 }}>수학 익힘책 15쪽을 풀라고 지시했을 때</td></tr>
            <tr><td style={{ padding: 8, fontWeight: 700 }}>B</td><td style={{ padding: 8 }}>반항적으로 행동했다</td><td style={{ padding: 8 }}>"싫어!"라고 소리치며 책을 바닥에 던졌다</td></tr>
            <tr><td style={{ padding: 8, fontWeight: 700 }}>C</td><td style={{ padding: 8 }}>혼냈다</td><td style={{ padding: 8 }}>교사가 다가가 "책을 주우세요"라고 지시했으나 거부함</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: '.85rem', color: 'var(--sub)', marginTop: 10 }}>
          <strong>Dead Man's Test:</strong> "죽은 사람도 할 수 있으면 행동이 아니다"<br />
          ❌ "수업을 방해하지 않는다" → ✅ "수업 시간에 자리에 앉아 과제를 수행한다"
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-pri" onClick={() => setExOpen(false)}>확인</button>
        </div>
      </Modal>

      <EditStudentModal open={editOpen} onClose={() => setEditOpen(false)} />
      <RAISDModal open={raisdOpen} onClose={() => setRaisdOpen(false)} />
      <PriorityChecklistModal open={priorityOpen} onClose={() => setPriorityOpen(false)} />
      <DeadMansModal open={deadOpen} onClose={() => setDeadOpen(false)} />
    </>
  );
}
