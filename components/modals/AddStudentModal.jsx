import { useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';

const LEVELS = ['초등', '중등', '고등'];
const DISABILITIES = ['지적장애', '자폐스펙트럼(ASD)', '지체장애', '청각장애', '시각장애', '정서행동장애', '학습장애', 'ADHD', '발달지연', '중복중증'];

export default function AddStudentModal({ open, onClose, onCreated }) {
  const { addStudent, selectStudent } = useStudents();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [level, setLevel] = useState(LEVELS[0]);
  const [dis, setDis] = useState(DISABILITIES[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const c = code.trim();
    if (!c) { toast('익명 ID를 입력해주세요.'); return; }
    setBusy(true);
    try {
      const created = await addStudent({ student_code: c, level, disability: dis, note });
      toast(c + ' 추가 완료');
      setCode(''); setNote('');
      if (created?.id) await selectStudent(created.id);
      onCreated?.(created);
      onClose();
    } catch (e) {
      toast('학생 추가 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3>➕ 새 학생 추가</h3>
      <div className="form-group">
        <label className="form-label">익명 ID (실명 금지)</label>
        <input className="form-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: A학생, 학생1" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">학교급</label>
          <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">주요 장애 영역</label>
          <select className="form-select" value={dis} onChange={(e) => setDis(e.target.value)}>
            {DISABILITIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">비식별 요약 (이 내용만 AI에 전송)</label>
        <textarea className="form-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="주의: 이름, 학년, 실명, 민감정보를 넣지 마세요.&#10;예: 초등 3학년 수준, 지적장애, 수 개념 기초 단계" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSubmit} disabled={busy}>추가</button>
      </div>
    </Modal>
  );
}
