import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../lib/api/client';

// 질문 게시판 — 사람 관리자가 답변하는 Q&A (mds/28 Part B).
// AI 즉답 페이지('PBS Q&A 전문가')와 별개. 목록/작성/상세를 한 화면에서 전환한다.
// 권한 표시는 UX일 뿐, 실제 검사는 /api/qa-board/* 서버가 담당.

const CATEGORIES = ['Tier1', 'Tier2', 'Tier3', 'IEP', '위기대응', '기타'];

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function StatusBadge({ status }) {
  const open = status === 'open';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: '.68rem', fontWeight: 700,
      background: open ? 'var(--warn)' : 'var(--ok)', color: '#fff', whiteSpace: 'nowrap',
    }}>
      {open ? '🕓 답변대기' : '✅ 답변완료'}
    </span>
  );
}

const metaStyle = { fontSize: '.75rem', color: 'var(--muted)' };

export default function QABoardPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const isAdmin = me?.role === 'admin';

  // view: {mode:'list'} | {mode:'write', edit?:question} | {mode:'view', id}
  const [view, setView] = useState({ mode: 'list' });

  // ---- 목록 ----
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  // 관리자는 접수함처럼 쓰도록 기본 필터를 '답변대기'로.
  const [statusF, setStatusF] = useState(() => (isAdmin ? 'open' : ''));
  const [catF, setCatF] = useState('');
  const [mineF, setMineF] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusF) qs.set('status', statusF);
      if (catF) qs.set('category', catF);
      if (mineF) qs.set('mine', '1');
      const data = await api('/api/qa-board?' + qs.toString());
      setItems(data.questions || []);
    } catch (e) {
      toast('목록을 불러오지 못했습니다: ' + (e.message || ''));
    } finally {
      setListLoading(false);
    }
  }, [statusF, catF, mineF, toast]);

  useEffect(() => {
    if (view.mode === 'list') loadList();
  }, [view.mode, loadList]);

  // ---- 상세 ----
  const [detail, setDetail] = useState(null); // { question, answers }
  const [detailLoading, setDetailLoading] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);

  const openDetail = useCallback(async (id) => {
    setView({ mode: 'view', id });
    setDetail(null);
    setAnswerText('');
    setDetailLoading(true);
    try {
      const data = await api('/api/qa-board/' + id);
      setDetail(data);
    } catch (e) {
      toast('질문을 불러오지 못했습니다: ' + (e.message || ''));
      setView({ mode: 'list' });
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  async function submitAnswer() {
    const b = answerText.trim();
    if (!b) { toast('답변 내용을 입력해주세요.'); return; }
    setAnswerBusy(true);
    try {
      const data = await api(`/api/qa-board/${view.id}/answers`, 'POST', { body: b });
      setDetail((prev) => prev && ({
        question: { ...prev.question, status: 'answered' },
        answers: [...prev.answers, data.answer],
      }));
      setAnswerText('');
      toast('답변이 등록되었습니다.');
    } catch (e) {
      toast('답변 등록 실패: ' + (e.message || ''));
    } finally {
      setAnswerBusy(false);
    }
  }

  async function removeQuestion(q) {
    if (!window.confirm(`'${q.title}' 질문을 삭제할까요?\n달린 답변도 함께 삭제됩니다.`)) return;
    try {
      await api('/api/qa-board/' + q.id, 'DELETE');
      toast('질문을 삭제했습니다.');
      setView({ mode: 'list' });
    } catch (e) {
      toast('삭제 실패: ' + (e.message || ''));
    }
  }

  // ---- 작성/수정 ----
  const [form, setForm] = useState({ title: '', body: '', category: '', is_private: false });
  const [formBusy, setFormBusy] = useState(false);

  function startWrite(edit) {
    setForm(edit
      ? { title: edit.title, body: edit.body || '', category: edit.category || '', is_private: !!edit.is_private }
      : { title: '', body: '', category: '', is_private: false });
    setView({ mode: 'write', edit: edit || null });
  }

  async function submitForm() {
    if (!form.title.trim()) { toast('제목을 입력해주세요.'); return; }
    setFormBusy(true);
    try {
      if (view.edit) {
        await api('/api/qa-board/' + view.edit.id, 'PATCH', form);
        toast('질문을 수정했습니다.');
        openDetail(view.edit.id);
      } else {
        const data = await api('/api/qa-board', 'POST', form);
        toast('질문이 등록되었습니다. 관리자가 확인 후 답변을 남깁니다.');
        openDetail(data.question.id);
      }
    } catch (e) {
      toast('저장 실패: ' + (e.message || ''));
    } finally {
      setFormBusy(false);
    }
  }

  // ─────────────────────────── 작성/수정 화면 ───────────────────────────
  if (view.mode === 'write') {
    return (
      <div className="card">
        <div className="card-title">{view.edit ? '✏️ 질문 수정' : '✍️ 새 질문'}</div>
        <div className="card-subtitle">관리자가 확인 후 답변을 남깁니다. 답변이 달리기 전까지 수정할 수 있어요.</div>

        <div style={{
          background: 'var(--pri-soft)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 14px', fontSize: '.78rem', lineHeight: 1.6, margin: '10px 0 14px',
        }}>
          🔒 <b>개인정보 보호</b> — 학생 실명·생년월일 등 식별 가능한 정보는 쓰지 마세요.
          학생은 <b>‘학생A’</b>처럼 비식별로 표기해주세요.
        </div>

        <div className="form-group">
          <label className="form-label">제목</label>
          <input
            className="form-input" maxLength={200} value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="예: CICO 시작 전에 학부모 동의가 꼭 필요한가요?"
          />
        </div>
        <div className="form-group">
          <label className="form-label">분류</label>
          <select
            className="form-select" style={{ maxWidth: 220 }} value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">분류 선택 (선택)</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">내용</label>
          <textarea
            className="form-textarea" rows={8} maxLength={20000} value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="상황, 이미 시도해 본 것, 궁금한 점을 적어주세요."
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', marginBottom: 16, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={form.is_private}
            onChange={(e) => setForm((f) => ({ ...f, is_private: e.target.checked }))}
          />
          🔒 비공개 질문 <span style={{ color: 'var(--muted)' }}>— 나와 관리자만 볼 수 있어요</span>
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-pri" disabled={formBusy} onClick={submitForm}>
            {formBusy ? '저장 중…' : view.edit ? '수정 저장' : '질문 등록'}
          </button>
          <button
            className="btn btn-ghost" disabled={formBusy}
            onClick={() => (view.edit ? openDetail(view.edit.id) : setView({ mode: 'list' }))}
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────── 상세 화면 ───────────────────────────
  if (view.mode === 'view') {
    const q = detail?.question;
    const answers = detail?.answers || [];
    const isOwner = q && me && q.user_id === me.id;
    return (
      <>
        <div className="card">
          <button className="btn btn-sm btn-ghost" onClick={() => setView({ mode: 'list' })}>← 목록으로</button>

          {detailLoading && <div style={{ padding: 20, color: 'var(--muted)' }}>불러오는 중…</div>}

          {q && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <StatusBadge status={q.status} />
                {q.category && <span style={{ ...metaStyle, fontWeight: 700 }}>[{q.category}]</span>}
                {q.is_private && <span style={metaStyle}>🔒 비공개</span>}
              </div>
              <h3 style={{ margin: '8px 0 4px', fontSize: '1.05rem' }}>{q.title}</h3>
              <div style={metaStyle}>
                {q.author_name || '(탈퇴한 사용자)'} · {fmtDate(q.created_at)}
              </div>
              {q.body && (
                <div style={{ marginTop: 12, fontSize: '.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {q.body}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {isOwner && q.status === 'open' && (
                  <button className="btn btn-sm btn-ghost" onClick={() => startWrite(q)}>✏️ 수정</button>
                )}
                {(isOwner || isAdmin) && (
                  <button className="btn btn-sm btn-err" onClick={() => removeQuestion(q)}>삭제</button>
                )}
              </div>
            </>
          )}
        </div>

        {q && (
          <div className="card">
            <div className="card-title">💬 답변 {answers.length > 0 ? answers.length : ''}</div>
            {answers.length === 0 && (
              <div style={{ ...metaStyle, padding: '6px 0 2px' }}>
                아직 답변이 없습니다. 관리자가 확인 후 답변을 남깁니다.
              </div>
            )}
            {answers.map((a) => (
              <div key={a.id} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700 }}>
                  🛡️ {a.author_name || '관리자'} <span style={{ ...metaStyle, fontWeight: 400 }}>· {fmtDate(a.created_at)}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: '.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {a.body}
                </div>
              </div>
            ))}

            {isAdmin && (
              <div style={{ borderTop: answers.length ? '1px solid var(--border)' : 'none', paddingTop: 12, marginTop: 4 }}>
                <div className="form-group">
                  <label className="form-label">{answers.length ? '추가 답변' : '답변 작성 (관리자)'}</label>
                  <textarea
                    className="form-textarea" rows={5} maxLength={20000} value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="선생님이 현장에서 바로 적용할 수 있게 구체적으로 답변해주세요."
                  />
                </div>
                <button className="btn btn-pri" disabled={answerBusy} onClick={submitAnswer}>
                  {answerBusy ? '등록 중…' : '답변 등록'}
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // ─────────────────────────── 목록 화면 ───────────────────────────
  const openCount = items.filter((i) => i.status === 'open').length;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="card-title">❓ 질문 게시판</div>
          <div className="card-subtitle">
            PBS·IEP·위기대응에 대해 질문을 남기면 <b>관리자가 직접 답변</b>합니다.
            {isAdmin && openCount > 0 && <b style={{ color: 'var(--warn)' }}> · 답변대기 {openCount}건</b>}
          </div>
        </div>
        <button className="btn btn-pri" onClick={() => startWrite(null)}>✍️ 질문하기</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px', flexWrap: 'wrap' }}>
        {[['', '전체'], ['open', '🕓 답변대기'], ['answered', '✅ 답변완료']].map(([v, label]) => (
          <button
            key={v || 'all'}
            className={'btn btn-sm ' + (statusF === v ? 'btn-pri' : 'btn-ghost')}
            onClick={() => setStatusF(v)}
          >
            {label}
          </button>
        ))}
        <select className="form-select" style={{ width: 'auto', padding: '6px 10px', fontSize: '.8rem' }} value={catF} onChange={(e) => setCatF(e.target.value)}>
          <option value="">전체 분류</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={mineF} onChange={(e) => setMineF(e.target.checked)} />
          내 질문만
        </label>
      </div>

      {listLoading && <div style={{ padding: 20, color: 'var(--muted)' }}>불러오는 중…</div>}
      {!listLoading && items.length === 0 && (
        <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '.85rem' }}>
          {statusF || catF || mineF ? '조건에 맞는 질문이 없습니다.' : '첫 질문을 남겨보세요!'}
        </div>
      )}
      {!listLoading && items.map((q) => (
        <button
          key={q.id}
          onClick={() => openDetail(q.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
            borderTop: '1px solid var(--border)', padding: '12px 4px', cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={q.status} />
            {q.category && <span style={{ ...metaStyle, fontWeight: 700 }}>[{q.category}]</span>}
            <span style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text)' }}>
              {q.is_private && '🔒 '}{q.title}
            </span>
          </div>
          <div style={{ ...metaStyle, marginTop: 4 }}>
            {q.author_name || '(탈퇴한 사용자)'} · {fmtDate(q.created_at)}
            {q.answer_count > 0 && <> · 💬 답변 {q.answer_count}</>}
          </div>
        </button>
      ))}
    </div>
  );
}
