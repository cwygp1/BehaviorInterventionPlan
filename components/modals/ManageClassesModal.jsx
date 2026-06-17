import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';

// 학급(년도+반) 관리 — 학년도별로 학급을 추가/이름변경/삭제한다.
// 계층: 선생님 → 년도 → 학급 → 학생.
export default function ManageClassesModal({ open, onClose }) {
  const {
    classes, years, curYear, selectYear, yearClasses,
    addClass, renameClass, removeClass, selectClass,
  } = useStudents();
  const toast = useToast();

  const [newName, setNewName] = useState('');
  const [newYear, setNewYear] = useState(curYear);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setNewYear(curYear); }, [open, curYear]);

  async function onCreate() {
    const nm = newName.trim();
    if (!nm) { toast('학급 이름을 입력해주세요. (예: 1반)'); return; }
    setBusy(true);
    try {
      const created = await addClass(Number(newYear), nm);
      toast(`${newYear}년 ${nm} 학급 추가됨`);
      setNewName('');
      selectYear(Number(newYear));
      if (created?.id) selectClass(created.id);
    } catch (e) {
      toast('학급 추가 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(id) {
    const nm = editName.trim();
    if (!nm) { toast('학급 이름을 입력해주세요.'); return; }
    setBusy(true);
    try {
      await renameClass(id, nm);
      toast('학급 이름 변경됨');
      setEditingId(null);
    } catch (e) {
      toast('변경 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(c) {
    const n = c.student_count || 0;
    const warn = n > 0
      ? `'${c.name}' 학급을 삭제하면 소속 학생 ${n}명과 그 모든 기록(관찰·BIP·IEP 등)이 함께 삭제됩니다. 계속할까요?`
      : `'${c.name}' 학급을 삭제할까요?`;
    if (!window.confirm(warn)) return;
    setBusy(true);
    try {
      await removeClass(c.id);
      toast('학급 삭제됨');
    } catch (e) {
      toast('삭제 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  // 년도 옵션: 기존 년도 + 인접 년도 몇 개를 제공.
  const yearOptions = (() => {
    const set = new Set(years);
    for (let y = curYear - 1; y <= curYear + 1; y++) set.add(y);
    return Array.from(set).sort((a, b) => b - a);
  })();

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h3>⚙ 학급 관리</h3>
      <p style={{ fontSize: '.85rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        학년도별로 학급(반)을 만들고, 학생은 각 학급에 등록됩니다. (선생님 → 년도 → 학급 → 학생)
      </p>

      {/* 년도 선택 */}
      <div className="form-group">
        <label className="form-label">학년도</label>
        <select className="form-select" value={curYear} onChange={(e) => selectYear(Number(e.target.value))}>
          {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      {/* 현재 년도의 학급 목록 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 4, margin: '8px 0 14px', maxHeight: 240, overflowY: 'auto' }}>
        {yearClasses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted)', fontSize: '.88rem' }}>
            {curYear}년에 등록된 학급이 없습니다. 아래에서 추가해 주세요.
          </div>
        ) : (
          yearClasses.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              {editingId === c.id ? (
                <>
                  <input className="form-input" style={{ flex: 1 }} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <button className="btn btn-pri" disabled={busy} onClick={() => onRename(c.id)}>저장</button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => setEditingId(null)}>취소</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, fontWeight: 600 }}>{c.name}</div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>학생 {c.student_count ?? 0}명</span>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => { setEditingId(c.id); setEditName(c.name); }}>이름변경</button>
                  <button className="btn btn-ghost" disabled={busy} style={{ color: '#c0392b' }} onClick={() => onDelete(c)}>삭제</button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* 새 학급 추가 */}
      <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>➕ 새 학급 추가</div>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ maxWidth: 130 }}>
            <label className="form-label">학년도</label>
            <select className="form-select" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">학급 이름</label>
            <input className="form-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 1반, 2반, 햇살반" onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }} />
          </div>
          <button className="btn btn-pri" disabled={busy} onClick={onCreate} style={{ marginBottom: 12 }}>추가</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
