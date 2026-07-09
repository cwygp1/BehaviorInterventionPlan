import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { splitNote, composeNote, decomposeNote } from '../../lib/utils/splitNote';

const LEVELS = ['초등', '중등', '고등'];
const DISABILITIES = ['지적장애', '자폐스펙트럼(ASD)', '지체장애', '청각장애', '시각장애', '정서행동장애', '학습장애', 'ADHD', '발달지연', '중복중증'];

// student prop을 주면 그 학생을, 없으면 현재 선택된 학생(curStu)을 수정한다.
export default function EditStudentModal({ open, onClose, student }) {
  const { curStu, editStudent, classes } = useStudents();
  const target = student || curStu;
  const toast = useToast();
  const [level, setLevel] = useState('');
  const [dis, setDis] = useState('');
  const [strengths, setStrengths] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [extra, setExtra] = useState('');
  const [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(false);

  // 비식별 요약(AI 전송용) — 강점/어려움/추가 요약에서 항상 자동 재구성 (어긋남 방지).
  const note = composeNote(strengths, difficulties, extra);

  useEffect(() => {
    if (open && target) {
      setLevel(target.level || LEVELS[0]);
      setDis(target.disability || DISABILITIES[0]);
      // note를 [강점]/[어려움]/기타로 되돌려 각 칸에 채운다. 분리 컬럼이 있으면 우선.
      const dec = decomposeNote(target.note || '');
      setStrengths(target.strengths || dec.strengths || '');
      setDifficulties(target.difficulties || dec.difficulties || '');
      setExtra(dec.extra || '');
      setClassId(target.class_id || '');
    }
  }, [open, target]);

  // 기존 학생: 추가 요약(구버전 note)에 강/약점이 섞여 있으면 규칙 기반으로 분리.
  function autoSplit() {
    if (!extra.trim()) { toast('분리할 추가 요약이 없어요.'); return; }
    const r = splitNote(extra);
    setStrengths((cur) => [cur, r.strengths].filter(Boolean).join(', '));
    setDifficulties((cur) => [cur, r.difficulties].filter(Boolean).join(', '));
    setExtra('');
    toast('요약을 강점/어려움으로 분리했어요. 내용을 확인·수정해주세요.');
  }

  async function onSubmit() {
    if (!target) return;
    setBusy(true);
    try {
      await editStudent({ id: target.id, level, disability: dis, note, strengths, difficulties, class_id: classId ? Number(classId) : undefined });
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
      <h3>✏ 프로필 수정{target ? ` — ${target.code || target.student_code}` : ''}</h3>
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
        <label className="form-label">소속 학급</label>
        <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {(classes || []).map((c) => (
            <option key={c.id} value={c.id}>{c.school_year}년 · {c.name}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <label className="form-label" style={{ marginBottom: 0 }}>🌟 강점 / ⚠ 어려움</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={autoSplit} title="추가 요약을 강점/어려움으로 자동 분리">🪄 요약에서 자동 분리</button>
        </div>
        <textarea className="form-textarea" rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="강점 (출발점 분석 '학생 강점'으로 연동)" style={{ marginTop: 6 }} />
        <textarea className="form-textarea" rows={2} value={difficulties} onChange={(e) => setDifficulties(e.target.value)} placeholder="어려움 (출발점 분석 '행동특성(교사관찰)'로 연동)" style={{ marginTop: 6 }} />
      </div>
      <div className="form-group">
        <label className="form-label">추가 요약 / 현행수준 (선택)</label>
        <textarea className="form-textarea" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="강점/어려움 외 참고사항 (이름·민감정보 금지)" />
        <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 6, background: 'var(--surface2, #f6f7f9)', borderRadius: 8, padding: '7px 10px', whiteSpace: 'pre-wrap' }}>
          <strong>비식별 요약 (AI 전송용 · 자동 구성)</strong>{'\n'}{note || '(없음)'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSubmit} disabled={busy}>저장</button>
      </div>
    </Modal>
  );
}
