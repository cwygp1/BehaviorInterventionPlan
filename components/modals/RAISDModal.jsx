import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveRAISD } from '../../lib/api/students';

const CATEGORIES = [
  { key: 'food', label: '음식 / 음료' },
  { key: 'social', label: '사회적 관심 (칭찬·하이파이브 등)' },
  { key: 'tangible', label: '물건·장난감 (선호 사물)' },
  { key: 'activity', label: '활동 (좋아하는 놀이·과제)' },
  { key: 'sensory', label: '감각 자극 (음악·진동·빛·촉각)' },
  { key: 'escape', label: '회피 가능 상황 (쉼 / 대안 활동)' },
];

export default function RAISDModal({ open, onClose }) {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [responses, setResponses] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && curStuData?.raisd?.responses) {
      setResponses(curStuData.raisd.responses);
    } else if (open) {
      setResponses({});
    }
  }, [open, curStuData]);

  function update(key, field, value) {
    setResponses((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }));
  }

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const data = await saveRAISD(curStuId, { responses });
      updateStudentData(curStuId, (cur) => ({ ...cur, raisd: data.data }));
      toast('선호/강화물 저장 완료');
      onClose();
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={620}>
      <h3>💡 선호/강화물 탐색 (RAISD)</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        Reinforcer Assessment for Individuals with Severe Disabilities. 카테고리별 학생이 선호하는 항목을 기록합니다.
      </p>
      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="form-group">
          <label className="form-label">{cat.label}</label>
          <input
            className="form-input"
            value={responses[cat.key]?.items || ''}
            onChange={(e) => update(cat.key, 'items', e.target.value)}
            placeholder="구체적 선호 항목 (쉼표로 구분)"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: '.78rem' }}>
            <span style={{ color: 'var(--muted)' }}>강도</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={'qchip' + (responses[cat.key]?.intensity === n ? ' on' : '')}
                onClick={() => update(cat.key, 'intensity', n)}
              >{n}</button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 저장</button>
      </div>
    </Modal>
  );
}
