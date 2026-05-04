import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { savePriority } from '../../lib/api/students';

const QUESTIONS = [
  '본인의 안전을 위협하는 정도',
  '타인의 안전을 위협하는 정도',
  '학습 참여를 방해하는 정도',
  '또래 관계에 부정적 영향을 주는 정도',
  '발생 빈도(자주 일어나는가)',
  '지속 시간(오래 지속되는가)',
  '강도(심한가)',
  '환경 변화(다른 학생들에게 미치는 영향)',
  '교사/학부모 우려 정도',
];

const SCALE = [
  { v: 0, label: '0 · 전혀 아님' },
  { v: 1, label: '1 · 약간' },
  { v: 2, label: '2 · 보통' },
  { v: 3, label: '3 · 많이' },
  { v: 4, label: '4 · 매우 그렇다' },
];

export default function PriorityChecklistModal({ open, onClose }) {
  const { curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [responses, setResponses] = useState(new Array(QUESTIONS.length).fill(0));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && curStuData?.priority?.responses) {
      const arr = curStuData.priority.responses;
      setResponses(Array.isArray(arr) ? arr.concat(new Array(Math.max(0, QUESTIONS.length - arr.length)).fill(0)).slice(0, QUESTIONS.length) : new Array(QUESTIONS.length).fill(0));
    } else if (open) {
      setResponses(new Array(QUESTIONS.length).fill(0));
    }
  }, [open, curStuData]);

  function setVal(i, v) {
    setResponses((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  const total = responses.reduce((a, b) => a + b, 0);
  const max = QUESTIONS.length * 4;
  const pct = Math.round((total / max) * 100);

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const data = await savePriority(curStuId, { responses });
      updateStudentData(curStuId, (cur) => ({ ...cur, priority: data.data }));
      toast(`저장 완료 — 총점 ${total}/${max}`);
      onClose();
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={640}>
      <h3>📋 문제행동 우선순위 체크리스트</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        총점이 높을수록 중재 우선순위가 높습니다. 4점 척도(0~4) × 9문항 = 0~36점.
      </p>
      {QUESTIONS.map((q, i) => (
        <div key={i} className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">{i + 1}. {q}</label>
          <div className="qchip-area">
            {SCALE.map((s) => (
              <span key={s.v} className={'qchip' + (responses[i] === s.v ? ' on' : '')} onClick={() => setVal(i, s.v)}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div style={{ background: 'var(--pri-soft)', padding: 14, borderRadius: 8, textAlign: 'center', marginTop: 14 }}>
        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>총점</div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--pri)' }}>{total} / {max}</div>
        <div style={{ fontSize: '.85rem', color: 'var(--sub)', marginTop: 4 }}>
          {pct >= 75 ? '🔴 매우 높음 (즉각 중재 필요)' : pct >= 50 ? '🟠 높음 (집중 중재 권장)' : pct >= 25 ? '🟡 보통 (관찰 강화)' : '🟢 낮음 (예방 중심)'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 저장</button>
      </div>
    </Modal>
  );
}
