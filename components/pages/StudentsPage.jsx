import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useUIActions } from '../../contexts/UIActionsContext';
import EditStudentModal from '../modals/EditStudentModal';

// 학생 관리 — 현재 선택된 학년도·학급의 학생을 목록으로 보고
// 추가 / 프로필 수정 / 삭제하는 순수 관리 페이지.
// (작업할 학생 '선택'은 여기서 하지 않는다 — 상단 학생 셀렉트와
//  각 대시보드 명부에서 학생을 누르면 선택+이동이 한 번에 된다.)
export default function StudentsPage() {
  const {
    students, allStudents, curClass, curYear,
    removeStudent, studentTier,
  } = useStudents();
  const toast = useToast();
  const { openAddStudent, openManageClasses } = useUIActions();

  const [editTarget, setEditTarget] = useState(null); // 수정할 학생
  const [busyId, setBusyId] = useState(null);         // 삭제 진행 중인 학생 id

  async function onDelete(s) {
    const code = s.code || s.student_code;
    const warn =
      `'${code}' 학생을 삭제할까요?\n\n` +
      `삭제하면 이 학생의 모든 기록이 함께 삭제되며 되돌릴 수 없습니다.\n` +
      `(관찰/ABC · 기능평가 · BIP · 행동 데이터 · IEP 목표 · 출발점 분석 · CICO · 위기기록 등)`;
    if (!window.confirm(warn)) return;
    // 실수 방지 이중 확인 — 모든 기록이 영구 삭제되므로.
    if (!window.confirm(`정말 '${code}' 학생을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setBusyId(s.id);
    try {
      await removeStudent(s.id);
      toast(`'${code}' 학생이 삭제되었습니다.`);
    } catch (e) {
      toast('삭제 실패: ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  const tierBadge = (sid) => {
    const t = studentTier(sid);
    if (t === 3) return <span className="badge" style={{ background: '#fdecea', color: '#c0392b' }}>Tier 3</span>;
    if (t === 2) return <span className="badge" style={{ background: '#fef5e7', color: '#b9770e' }}>Tier 2</span>;
    return <span className="badge" style={{ background: 'var(--surface2, #f6f7f9)', color: 'var(--muted)' }}>Tier 1</span>;
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="card-title" style={{ marginBottom: 2 }}>🧑‍🎓 학생 관리</div>
            <div className="card-subtitle" style={{ marginBottom: 0 }}>
              {curYear}년 {curClass ? `· ${curClass.name}` : ''} — 학생 {students.length}명
              {allStudents.length !== students.length ? ` (전체 ${allStudents.length}명)` : ''}
              {' '}· 다른 학급의 학생은 상단에서 학년도/학급을 바꾸면 볼 수 있어요.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={openManageClasses}>⚙ 학급 관리</button>
          <button className="btn btn-pri" onClick={openAddStudent}>➕ 학생 추가</button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 14, overflow: 'hidden' }}>
          {students.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)', fontSize: '.9rem' }}>
              이 학급에 등록된 학생이 없습니다. 위의 '학생 추가' 버튼으로 등록해 주세요.
            </div>
          ) : (
            students.map((s) => {
              const code = s.code || s.student_code;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--pri, #4f46e5)', color: '#fff', fontWeight: 700, fontSize: 14,
                    }}
                  >
                    {(code || '?').charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {code}
                      {tierBadge(s.id)}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {[s.level ? `${s.level}${s.grade ? ` ${s.grade}학년` : ''}` : '', s.disability].filter(Boolean).join(' · ') || '프로필 미입력'}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" disabled={busyId != null} onClick={() => setEditTarget(s)}>
                    ✏ 수정
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#c0392b' }}
                    disabled={busyId != null}
                    onClick={() => onDelete(s)}
                  >
                    {busyId === s.id ? '삭제 중…' : '🗑 삭제'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 10, marginBottom: 0 }}>
          ⚠ 학생을 삭제하면 관찰·기능평가·BIP·행동 데이터·IEP 등 모든 기록이 함께 영구 삭제됩니다.
        </p>
      </div>

      <EditStudentModal open={!!editTarget} onClose={() => setEditTarget(null)} student={editTarget} />
    </div>
  );
}
