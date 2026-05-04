import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';

const LEVELS = ['초등', '중등', '고등'];
const DISABILITIES = ['지적장애', '자폐스펙트럼(ASD)', '지체장애', '청각장애', '시각장애', '정서행동장애', '학습장애', 'ADHD', '발달지연', '중복중증'];

export default function EditStudentModal({ open, onClose }) {
  const { curStu, editStudent } = useStudents();
  const toast = useToast();
  const [level, setLevel] = useState('');
  const [dis, setDis] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && curStu) {
      setLevel(curStu.level || LEVELS[0]);
      setDis(curStu.disability || DISABILITIES[0]);
      setNote(curStu.note || '');
    }
  }, [open, curStu]);

  async function onSubmit() {
    if (!curStu) return;
    setBusy(true);
    try {
      await editStudent({ id: curStu.id, level, disability: dis, note });
      toast('프로필 수정 완료');
      onClose();
    } catch (e) {
      toast('수정 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h3>✏ 프로필 수정</h3>
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
        <label className="form-label">비식별 요약</label>
        <textarea className="form-textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSubmit} disabled={busy}>저장</button>
      </div>
    </Modal>
  );
}
