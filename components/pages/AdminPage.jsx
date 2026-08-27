import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../lib/api/client';

// 관리자 페이지 — 가입자 목록 + 관리자 승격/해제.
// 진입: 사이드바 하단 이름 클릭(관리자에게만 활성화).
// 이 컴포넌트의 권한 분기는 표시용 UX일 뿐이고, 실제 보호는
// /api/admin/* 의 requireRole(['admin']) 서버 검사가 담당한다.

const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border)', fontSize: '.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function AdminPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null); // 역할 변경 요청 중인 행

  const isAdmin = me?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      try {
        const data = await api('/api/admin/users');
        if (alive) setUsers(data.users || []);
      } catch (e) {
        if (alive) setError(e.message || '목록을 불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) =>
      (u.name || '').toLowerCase().includes(t) ||
      (u.email || '').toLowerCase().includes(t) ||
      (u.school || '').toLowerCase().includes(t)
    );
  }, [users, q]);

  const adminCount = users.filter((u) => u.role === 'admin').length;

  async function changeRole(u, nextRole) {
    const label = nextRole === 'admin'
      ? `'${u.name}' (${u.email}) 님을 관리자로 승격할까요?\n관리자는 가입자 관리와 Q&A 답변 권한을 갖게 됩니다.`
      : `'${u.name}' (${u.email}) 님의 관리자 권한을 해제할까요?`;
    if (!window.confirm(label)) return;
    setBusyId(u.id);
    try {
      const data = await api(`/api/admin/users/${u.id}`, 'PATCH', { role: nextRole });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...data.user } : x)));
      toast(nextRole === 'admin' ? `${u.name} 님을 관리자로 승격했습니다.` : `${u.name} 님의 관리자 권한을 해제했습니다.`);
    } catch (e) {
      toast('변경 실패: ' + (e.message || '알 수 없는 오류'));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <div className="card-title">🛡️ 관리자 페이지</div>
        <div className="card-subtitle">관리자 계정만 볼 수 있는 화면입니다.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">🛡️ 가입자 관리</div>
      <div className="card-subtitle">
        가입한 선생님 목록을 확인하고 관리자를 지정합니다. 관리자는 가입자 관리와 질문 게시판 답변 권한을 갖습니다.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ maxWidth: 260 }}
          placeholder="이름·이메일·학교 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
          전체 <b>{users.length}</b>명 · 관리자 <b>{adminCount}</b>명
        </div>
      </div>

      {loading && <div style={{ padding: 20, color: 'var(--muted)' }}>불러오는 중…</div>}
      {error && <div style={{ padding: 20, color: 'var(--err)' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead>
              <tr>
                <th style={th}>이름</th>
                <th style={th}>이메일</th>
                <th style={th}>학교</th>
                <th style={th}>가입일</th>
                <th style={th}>역할</th>
                <th style={{ ...th, textAlign: 'right' }}>동작</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const self = u.id === me?.id;
                const isRowAdmin = u.role === 'admin';
                return (
                  <tr key={u.id}>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {u.name}
                      {isRowAdmin && <span title="관리자" style={{ marginLeft: 6 }}>🛡️</span>}
                      {self && <span style={{ marginLeft: 6, fontSize: '.7rem', color: 'var(--muted)', fontWeight: 500 }}>(본인)</span>}
                    </td>
                    <td style={td}>{u.email}</td>
                    <td style={td}>{u.school || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {isRowAdmin
                        ? <span style={{ color: 'var(--acc)', fontWeight: 700 }}>관리자</span>
                        : <span style={{ color: 'var(--muted)' }}>일반</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {self ? (
                        <span style={{ fontSize: '.75rem', color: 'var(--muted)' }} title="자기 자신의 권한은 해제할 수 없습니다 (관리자 0명 방지)">변경 불가</span>
                      ) : (
                        <button
                          className={'btn btn-sm ' + (isRowAdmin ? 'btn-ghost' : 'btn-pri')}
                          disabled={busyId === u.id}
                          onClick={() => changeRole(u, isRowAdmin ? 'user' : 'admin')}
                        >
                          {busyId === u.id ? '변경 중…' : isRowAdmin ? '관리자 해제' : '관리자로 승격'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td style={{ ...td, color: 'var(--muted)' }} colSpan={6}>검색 결과가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
        · 자기 자신의 관리자 권한은 해제할 수 없습니다 — 관리자가 0명이 되어 아무도 이 화면에 못 들어오는 사고를 막기 위해서예요.<br />
        · 이 화면은 계정 정보만 다룹니다. 각 선생님의 학생 데이터·작업 내용은 조회하지 않습니다.
      </div>
    </div>
  );
}
