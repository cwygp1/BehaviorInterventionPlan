import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { stuColor } from '../../lib/utils/colors';

export default function PickStudentModal({ open, onClose, onPicked, onAddNew }) {
  const { students } = useStudents();
  return (
    <Modal open={open} onClose={onClose}>
      <h3>👤 학생을 먼저 선택해 주세요</h3>
      <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        행동 중재 기능은 특정 학생에 대한 기록·평가입니다. 작업할 학생을 선택하거나 새로 추가해 주세요.
      </p>
      {students.length === 0 ? (
        <div style={{ display: 'none', textAlign: 'center', padding: 18, color: 'var(--muted)', fontSize: '.88rem', border: '1px dashed var(--border)', borderRadius: 10, marginBottom: 14 }}>
          아직 등록된 학생이 없어요.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
          {students.map((s) => {
            const c = stuColor(s.code);
            return (
              <li
                key={s.id}
                className="pick-stu-item"
                onClick={() => { onPicked(s.id); onClose(); }}
              >
                <div className="ava" style={{ background: `linear-gradient(135deg,${c},${c}cc)` }}>
                  {(s.code || '?').charAt(0)}
                </div>
                <div>
                  <div className="name">{s.code}</div>
                  <div className="meta">{s.level || ''}{s.disability ? ' · ' + s.disability : ''}</div>
                </div>
                <div className="arrow">›</div>
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onAddNew}>➕ 새 학생 추가</button>
      </div>
    </Modal>
  );
}
