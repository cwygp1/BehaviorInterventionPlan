import { useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';

// Tier 2 소그룹 관리 — 반·학기 안에서 몇몇 학생을 골라 소그룹을 만들고,
// 그 구성원 중 일부를 Tier 3(개별 중재)로 표시한다. (Tier 3 ⊂ Tier 2 ⊂ 반)
//
// 진입 흐름:
//   1) 소그룹 목록(선택 모드 off) — 그룹 생성/선택이 첫 화면.
//   2) 그룹 선택 → 구성원 관리(추가/제거/Tier3) + 학생 선택.
//
// props:
//   selectedGroupId  — 현재 선택된 그룹 id (null이면 목록 화면)
//   onSelectGroup(id|null) — 그룹 선택/해제 콜백
export default function Tier2GroupPanel({ selectedGroupId, onSelectGroup }) {
  const {
    curYear, curSemester, curClassId, curClass, students,
    years, yearClasses, selectYear, selectSemester, selectClass,
    tier2Groups, addTier2Group, removeTier2Group,
    addTier2Member, removeTier2Member, setTier2Tier3, copyTier2GroupsFrom,
    curStuId, selectStudent,
  } = useStudents();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const otherSem = curSemester === 1 ? 2 : 1;

  async function onCopyFromOther() {
    setBusy(true);
    try {
      const n = await copyTier2GroupsFrom(otherSem);
      toast(n > 0 ? `${otherSem}학기 소그룹 ${n}개를 복사했어요.` : `${otherSem}학기에 복사할 소그룹이 없습니다.`);
    } catch (e) { toast('복사 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  const studentById = useMemo(() => {
    const m = {};
    students.forEach((s) => { m[s.id] = s; });
    return m;
  }, [students]);

  if (!curClassId) return null;

  const selectedGroup = tier2Groups.find((g) => g.id === selectedGroupId) || null;

  async function onCreate() {
    const nm = newName.trim();
    if (!nm) { toast('소그룹 이름을 입력하세요.'); return; }
    setBusy(true);
    try {
      const g = await addTier2Group(nm);
      setNewName('');
      toast('소그룹 생성됨');
      if (g?.id) onSelectGroup?.(g.id); // 생성 후 바로 그 그룹으로 진입
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function onDeleteGroup(g) {
    if (!window.confirm(`소그룹 "${g.name}"을(를) 삭제할까요? 구성원 연결도 함께 사라집니다.`)) return;
    try {
      await removeTier2Group(g.id);
      if (selectedGroupId === g.id) onSelectGroup?.(null);
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  async function onAddMember(groupId, studentId) {
    try { await addTier2Member(groupId, studentId); }
    catch (e) { toast('추가 실패: ' + e.message); }
  }
  async function onRemoveMember(groupId, studentId) {
    try { await removeTier2Member(groupId, studentId); }
    catch (e) { toast('제거 실패: ' + e.message); }
  }
  async function onToggleTier3(groupId, studentId, next) {
    try { await setTier2Tier3(groupId, studentId, next); }
    catch (e) { toast('변경 실패: ' + e.message); }
  }

  const ScopeBadges = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span className="badge badge-pri">{curYear}학년도</span>
      <span className="badge badge-pri">{curSemester}학기</span>
      <span className="badge badge-pri">{curClass?.name || '—'}</span>
    </div>
  );

  // 설정 대상(년·학기·반)을 이 화면에서 직접 고를 수 있는 선택기.
  const selStyle = { padding: '6px 10px', fontSize: '.86rem', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' };
  const ScopeSelector = (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
      padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--pri)' }}>📍 설정 대상</span>
      <select style={selStyle} value={curYear} onChange={(e) => selectYear(e.target.value)} title="학년도">
        {years.map((y) => <option key={y} value={y}>{y}학년도</option>)}
      </select>
      <select style={selStyle} value={curSemester} onChange={(e) => selectSemester(e.target.value)} title="학기">
        <option value={1}>1학기</option>
        <option value={2}>2학기</option>
      </select>
      <select style={selStyle} value={curClassId || ''} onChange={(e) => selectClass(e.target.value || null)} title="학급">
        {yearClasses.length === 0 && <option value="">학급 없음</option>}
        {yearClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>이 조합 전용으로 소그룹이 저장됩니다.</span>
    </div>
  );

  // ===== 1) 목록 화면 =====
  if (!selectedGroup) {
    return (
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>👥 Tier 2 소그룹</div>

        {/* 설정 대상 선택 (년·학기·반) */}
        {ScopeSelector}

        <div className="card-subtitle" style={{ marginTop: 10 }}>
          반 학생 중 집중 지원이 필요한 <strong>몇몇 학생을 골라 소그룹</strong>을 만드세요.
          소그룹을 선택하면 구성원 관리와 CICO/DPR 기록으로 진행합니다.
        </div>

        {/* 새 소그룹 생성 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            className="form-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCreate(); } }}
            placeholder="새 소그룹 이름 (예: 자리이탈 집중지원조)"
          />
          <button className="btn btn-pri btn-sm" onClick={onCreate} disabled={busy}>+ 소그룹</button>
        </div>

        {/* 학기 전환 — 다른 학기 소그룹을 그대로 가져오기 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10,
          padding: '8px 12px', background: 'var(--pri-soft)', border: '1px dashed var(--pri-l)', borderRadius: 8,
        }}>
          <span style={{ fontSize: '.8rem', color: 'var(--sub)' }}>
            🔄 <strong>새 학기 준비</strong> — {otherSem}학기에 만든 소그룹(이름·구성원)을 {curSemester}학기로 복사할 수 있어요.
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={onCopyFromOther} disabled={busy}>
            📋 {otherSem}학기에서 복사
          </button>
        </div>

        {/* 소그룹 목록(선택) */}
        {tier2Groups.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 14 }}>
            <span className="emoji">🫧</span>아직 소그룹이 없습니다. 위에서 첫 소그룹을 만들어 보세요.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
            {tier2Groups.map((g) => {
              const n = (g.members || []).length;
              const t3 = (g.members || []).filter((m) => m.tier3).length;
              return (
                <div
                  key={g.id}
                  onClick={() => onSelectGroup?.(g.id)}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer',
                    background: 'var(--surface2)', transition: '.15s', position: 'relative',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteGroup(g); }}
                    title="소그룹 삭제"
                    style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}
                  >×</button>
                  <div style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: 8 }}>🏷 {g.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-pri">{n}명</span>
                    {t3 > 0 && <span className="badge" style={{ background: '#ffe3ea', color: '#c43653' }}>🎯 Tier3 {t3}</span>}
                  </div>
                  <div style={{ marginTop: 10, fontSize: '.8rem', color: 'var(--pri)', fontWeight: 600 }}>관리하기 ›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ===== 2) 그룹 상세(구성원 관리) =====
  const memberIds = new Set((selectedGroup.members || []).map((m) => m.student_id));
  const available = students.filter((s) => !memberIds.has(s.id));

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onSelectGroup?.(null)}>← 소그룹 목록</button>
          <div className="card-title" style={{ marginBottom: 0 }}>🏷 {selectedGroup.name}</div>
          <span className="badge badge-pri">{(selectedGroup.members || []).length}명</span>
        </div>
        {ScopeBadges}
      </div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>
        구성원을 추가/제거하고, 더 강한 지원이 필요한 학생은 <strong>🎯 Tier 3</strong>로 표시하세요.
        구성원 이름을 누르면 아래에서 해당 학생의 CICO/DPR 기록을 진행합니다.
      </div>

      {/* 구성원 */}
      {(selectedGroup.members || []).length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {(selectedGroup.members || []).map((m) => {
            const selected = curStuId === m.student_id;
            const stu = studentById[m.student_id];
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                background: selected ? 'var(--pri-soft)' : '#fff',
                border: '1px solid ' + (selected ? 'var(--pri-l)' : 'var(--border)'),
              }}>
                <button
                  onClick={() => selectStudent(m.student_id)}
                  title="이 학생 선택 (아래 CICO 기록 대상)"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontSize: '.92rem', color: 'var(--pri)', padding: 0 }}
                >
                  {m.code}{stu?.level ? <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {stu.level}</span> : null}
                </button>
                {selected && <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--pri)' }}>● 선택됨</span>}
                <div style={{ flex: 1 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.78rem', cursor: 'pointer', color: m.tier3 ? '#c43653' : 'var(--muted)', fontWeight: m.tier3 ? 700 : 500 }}>
                  <input type="checkbox" checked={!!m.tier3} onChange={(e) => onToggleTier3(selectedGroup.id, m.student_id, e.target.checked)} />
                  🎯 Tier 3
                </label>
                <button
                  onClick={() => onRemoveMember(selectedGroup.id, m.student_id)}
                  title="소그룹에서 제거"
                  style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}
                >×</button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: 12 }}>
          <span className="emoji">➕</span>아직 구성원이 없습니다. 아래에서 반 학생을 추가하세요.
        </div>
      )}

      {/* 학생 추가 */}
      {available.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginBottom: 4 }}>+ 반 학생 추가</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {available.map((s) => (
              <button key={s.id} className="qchip" style={{ fontSize: '.78rem' }} onClick={() => onAddMember(selectedGroup.id, s.id)}>
                + {s.code}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 10 }}>
          이 반의 모든 학생이 소그룹에 포함되어 있습니다.
        </div>
      )}
    </div>
  );
}
