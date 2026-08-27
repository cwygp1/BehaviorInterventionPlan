import { useCallback, useEffect, useRef, useState } from 'react';
import { useLLM } from '../../contexts/LLMContext';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../lib/api/client';
import { LLM_SYSTEM_PROMPT } from '../../lib/api/llm';
import { SITE_GUIDE_BRIEF, SITE_GUIDE_FULL } from '../../lib/siteGuide';
import MarkdownView from '../ui/MarkdownView';
import { EditableChipGroup } from '../ui/QChip';

// AI 전문가 실시간 채팅 (mds/28 P2) — 멀티턴 대화 + 토큰 스트리밍 표시.
// LLM 호출은 기존 구조대로 브라우저→LM Studio 직접(스트리밍), 완성된 턴만 서버에 저장.
// 구 'PBS Q&A 전문가'(단발 QAPage)를 흡수·대체함 — 자주 묻는 질문 칩과 storageKey를 그대로 승계.

const SAMPLE_QUESTIONS = [
  '학급에서 4:1 긍정 비율을 지키려면 어떻게 해야 하나요?',
  '자해행동 학생에게 어떤 FCT를 가르칠 수 있나요?',
  '교권 침해 발생 시 어디에 지원을 요청할 수 있나요?',
  'DRA와 DRO의 차이는 무엇인가요?',
  '학부모와 BIP를 어떻게 공유해야 효과적인가요?',
  '심리안정실 운영 시 주의할 점은?',
  'CICO 시작 시 학교 차원에서 준비해야 할 것은?',
  'Acting-Out Cycle 7단계 중 가속 단계에서 가장 중요한 대응은?',
];

const MODES = {
  pbs: {
    icon: '💚', label: 'PBS 전문가', hint: '행동지원 · 학급운영',
    sys: '당신은 2024 서울시교육청 PBS(긍정적 행동지원) 가이드북 전문가입니다. 4:1 긍정 비율, Tier 모델, FBA, FCT, DRA/DRO, Acting-Out Cycle 등 핵심 개념을 정확히 인용하고, 한국 학교 현장에서 즉시 적용 가능한 사례를 들어 상담합니다.',
  },
  iep: {
    icon: '📋', label: 'IEP 전문가', hint: '개별화교육계획 · 성취기준',
    sys: '당신은 IEP(개별화교육계획) 수립 전문가입니다. 2022 개정 기본교육과정 성취기준, 현행수준(PLOP), 조건-행동-기준 행동목표, 월별 점증 계획, 평가 기준 설정을 돕습니다.',
  },
  crisis: {
    icon: '🚨', label: '위기대응', hint: 'Acting-Out Cycle · 안전',
    sys: '당신은 위기행동 대응 전문가입니다. Acting-Out Cycle 7단계 중 현재 어느 단계인지 파악하고 단계별 대응을 안내합니다. 학생과 교사의 신체적 안전 확보를 항상 최우선으로 두고, 심각한 위기 상황이면 학교 관리자·전문기관 연계를 권합니다.',
  },
  free: {
    icon: '🎓', label: '특수교육 일반', hint: '그 밖의 모든 질문',
    sys: '당신은 특수교육 전반(교육과정, 통합교육, 보조공학, 학부모 협력, 지원 제도)에 두루 밝은 전문가입니다.',
  },
  guide: {
    icon: '🧭', label: '사이트 사용법', hint: '꼬박꼬박 메뉴·기능 안내',
    sys: SITE_GUIDE_FULL,
  },
};

const CHAT_COMMON = `
지금은 선생님과의 실시간 채팅 상담입니다.
- 이전 대화 맥락을 유지하되, 새 주제가 나오면 자연스럽게 전환합니다.
- 핵심부터 간결하게 답하고, 더 깊은 설명이 가능하면 마지막에 짧게 제안합니다.
- 확실하지 않은 내용은 추측하지 말고 한계를 밝힙니다.`;

function systemFor(mode, studentBrief) {
  const m = MODES[mode] || MODES.pbs;
  // 사이트 사용법 질문은 어느 모드에서든 나올 수 있어 요약 안내를 공통 주입한다.
  // guide 모드는 상세판(SITE_GUIDE_FULL)이 이미 페르소나라 요약본을 중복 주입하지 않는다.
  const siteInfo = mode === 'guide' ? '' : `\n${SITE_GUIDE_BRIEF}`;
  // 학생 맞춤 상담(P3): 선택된 학생의 비식별 요약을 덧붙인다.
  const stu = studentBrief ? `\n\n${studentBrief}` : '';
  return `${m.sys}\n${LLM_SYSTEM_PROMPT}\n${CHAT_COMMON}${siteInfo}${stu}`;
}

// 컨텍스트 슬라이딩 윈도우 — 로컬 모델의 컨텍스트 한계 대응(mds/28 C-6).
const CONTEXT_WINDOW = 16;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

const noteStyle = { fontSize: '.72rem', color: 'var(--muted)' };

export default function ChatExpertPage() {
  const { status, callChat } = useLLM();
  const { students, curStuId } = useStudents();
  const toast = useToast();

  const [threads, setThreads] = useState([]);
  const [curId, setCurId] = useState(null);       // null = 새 대화(스레드 미생성)
  const [mode, setMode] = useState('pbs');
  const [messages, setMessages] = useState([]);   // {role, content}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState(null); // null=대기 아님, ''=첫 토큰 대기
  const streamRef = useRef('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // 학생 맞춤 상담(P3) — 이 대화에 연결된 학생과 비식별 요약.
  // 새 대화에서는 토글로 켜고, 저장된 대화를 열면 스레드의 student_id를 따른다.
  const [consultStudent, setConsultStudent] = useState(null); // { id, code } | null
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const fetchBrief = useCallback(async (studentId) => {
    setBriefLoading(true);
    try {
      const d = await api(`/api/students/${studentId}/ai-brief`);
      setBrief(d.brief);
      return true;
    } catch (_e) {
      setBrief(null);
      toast('학생 정보를 불러오지 못했습니다 — 일반 상담으로 진행합니다.');
      return false;
    } finally {
      setBriefLoading(false);
    }
  }, [toast]);

  async function toggleConsult() {
    if (consultStudent) {
      setConsultStudent(null);
      setBrief(null);
      return;
    }
    const stu = students.find((x) => x.id === curStuId);
    if (!stu) return;
    setConsultStudent({ id: stu.id, code: stu.code });
    const ok = await fetchBrief(stu.id);
    if (!ok) setConsultStudent(null);
  }

  const loadThreads = useCallback(async () => {
    try {
      const d = await api('/api/chat-threads');
      setThreads(d.threads || []);
    } catch (_e) { /* 목록 실패는 치명적이지 않음 */ }
  }, []);
  useEffect(() => { loadThreads(); }, [loadThreads]);

  // 새 메시지·스트리밍 갱신 시 항상 맨 아래로.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText]);

  async function openThread(id) {
    if (sending) { toast('생성 중에는 대화를 전환할 수 없어요. 먼저 중단해주세요.'); return; }
    try {
      const d = await api('/api/chat-threads/' + id);
      setCurId(id);
      setMode(d.thread.mode || 'pbs');
      setMessages((d.messages || []).map((m) => ({ role: m.role, content: m.content })));
      setStreamText(null);
      // 학생 맞춤 스레드면 그 학생의 요약을 다시 불러온다(최신 데이터 반영).
      if (d.thread.student_id) {
        setConsultStudent({ id: d.thread.student_id, code: d.thread.student_code || '학생' });
        fetchBrief(d.thread.student_id);
      } else {
        setConsultStudent(null);
        setBrief(null);
      }
    } catch (e) {
      toast('대화를 불러오지 못했습니다: ' + (e.message || ''));
    }
  }

  function newThread() {
    if (sending) { toast('생성 중에는 대화를 전환할 수 없어요. 먼저 중단해주세요.'); return; }
    setCurId(null);
    setMessages([]);
    setStreamText(null);
    setConsultStudent(null);
    setBrief(null);
  }

  async function removeThread(t, e) {
    e.stopPropagation();
    if (!window.confirm(`'${t.title || '(제목 없음)'}' 대화를 삭제할까요?`)) return;
    try {
      await api('/api/chat-threads/' + t.id, 'DELETE');
      if (curId === t.id) newThread();
      loadThreads();
    } catch (err) {
      toast('삭제 실패: ' + (err.message || ''));
    }
  }

  // 턴 저장 — 실패해도 대화는 계속(기록만 못 남음).
  async function saveTurn(threadId, role, content) {
    try {
      await api(`/api/chat-threads/${threadId}/messages`, 'POST', { role, content });
    } catch (_e) {
      toast('대화 기록 저장에 실패했어요. 대화는 계속할 수 있습니다.');
    }
  }

  async function send(raw) {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    if (status !== 'on') {
      toast('AI 연결을 먼저 설정해주세요 (우측 상단 AI 버튼).');
      return;
    }
    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setSending(true);
    streamRef.current = '';
    setStreamText('');

    let id = curId;
    try {
      if (!id) {
        const d = await api('/api/chat-threads', 'POST', { mode, student_id: consultStudent?.id });
        id = d.thread.id;
        setCurId(id);
      }
      await saveTurn(id, 'user', text);

      const llmMessages = [
        { role: 'system', content: systemFor(mode, consultStudent ? brief : null) },
        ...history.slice(-CONTEXT_WINDOW).map((m) => ({ role: m.role, content: m.content })),
      ];
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const r = await callChat(llmMessages, {
        tier: 'fast',
        label: 'AI 전문가 채팅',
        signal: ctrl.signal,
        onDelta: (t) => { streamRef.current = t; setStreamText(t); },
      });
      const answer = (r?.content || r?.reasoning || '').trim() || '(빈 응답)';
      setMessages((m) => [...m, { role: 'assistant', content: answer }]);
      setStreamText(null);
      await saveTurn(id, 'assistant', answer);
      loadThreads(); // 제목·정렬 갱신
    } catch (e) {
      const partial = (streamRef.current || '').trim();
      if (e?.name === 'AbortError') {
        if (partial) {
          const kept = partial + '\n\n*(여기서 생성을 중단했어요)*';
          setMessages((m) => [...m, { role: 'assistant', content: kept }]);
          if (id) await saveTurn(id, 'assistant', kept);
          toast('생성을 중단했어요. 여기까지 받은 답변을 남겼습니다.');
        } else {
          toast('생성을 중단했어요.');
        }
      } else {
        toast('AI 호출 실패: ' + (e?.message || '알 수 없는 오류'));
      }
      setStreamText(null);
      loadThreads();
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function onKeyDown(e) {
    // 한글 IME 조합 중 Enter는 무시(이중 전송 방지).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  const curMode = MODES[mode] || MODES.pbs;
  const isEmpty = !curId && messages.length === 0;

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
      {/* ── 좌: 대화 목록 ── */}
      <div className="card" style={{ width: 250, flexShrink: 0, alignSelf: 'flex-start' }}>
        <button className="btn btn-pri btn-block" onClick={newThread}>+ 새 대화</button>
        <div style={{ marginTop: 12 }}>
          {threads.length === 0 && <div style={{ ...noteStyle, padding: '8px 2px' }}>아직 대화가 없어요.</div>}
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => openThread(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') openThread(t.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px', borderRadius: 8,
                cursor: 'pointer', background: curId === t.id ? 'var(--pri-soft)' : 'transparent',
              }}
            >
              <span aria-hidden="true">{(MODES[t.mode] || MODES.pbs).icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '.8rem', fontWeight: curId === t.id ? 700 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {t.student_code ? `🎯${t.student_code} · ` : ''}{t.title || '(제목 없음)'}
                </div>
                <div style={noteStyle}>{fmtDate(t.updated_at)} · {t.msg_count}개</div>
              </div>
              <button
                onClick={(e) => removeThread(t, e)}
                title="대화 삭제"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.8rem' }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── 우: 대화창 ── */}
      <div className="card" style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="card-title" style={{ margin: 0 }}>🗨️ AI 전문가 채팅</div>
          <span style={{ ...noteStyle, fontWeight: 700 }}>{curMode.icon} {curMode.label}</span>
          {consultStudent && (
            <span style={{
              fontSize: '.7rem', fontWeight: 700, color: '#fff', background: 'var(--acc)',
              borderRadius: 999, padding: '2px 9px',
            }} title="이 대화는 선택한 학생의 비식별 데이터(프로필·BIP·최근 행동 데이터)를 참고해 답합니다">
              🎯 {consultStudent.code} 맞춤{briefLoading ? ' (정보 불러오는 중…)' : ''}
            </span>
          )}
          {messages.length > CONTEXT_WINDOW && (
            <span style={noteStyle}>· 대화가 길어져 오래된 내용은 AI가 기억하지 못할 수 있어요</span>
          )}
        </div>

        {status !== 'on' && (
          <div style={{
            background: 'var(--err-l)', color: 'var(--err)', borderRadius: 8,
            padding: '8px 12px', fontSize: '.78rem', marginTop: 10,
          }}>
            AI가 연결되어 있지 않아요. 우측 상단 <b>AI 버튼</b>에서 연결을 설정하면 채팅을 시작할 수 있습니다.
          </div>
        )}

        {/* 메시지 영역 */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', margin: '12px 0 8px', minHeight: 320, maxHeight: '58vh',
            display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4,
          }}
        >
          {isEmpty && (
            <div>
              <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 6 }}>전문가 모드 선택</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {Object.entries(MODES).map(([k, m]) => (
                  <button
                    key={k}
                    className={'btn btn-sm ' + (mode === k ? 'btn-pri' : 'btn-ghost')}
                    onClick={() => setMode(k)}
                    title={m.hint}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 6 }}>🎯 학생 맞춤 상담 <span style={{ ...noteStyle, fontWeight: 500 }}>(선택)</span></div>
              <div style={{ marginBottom: 14 }}>
                {curStuId ? (
                  <button
                    className={'btn btn-sm ' + (consultStudent ? 'btn-pri' : 'btn-ghost')}
                    onClick={toggleConsult}
                    disabled={briefLoading}
                    title="이 학생의 비식별 데이터(프로필·BIP·최근 행동 데이터)를 참고해 맞춤 답변합니다"
                  >
                    {briefLoading
                      ? '학생 정보 불러오는 중…'
                      : `🎯 '${students.find((x) => x.id === curStuId)?.code || ''}' 맞춤 상담${consultStudent ? ' 켜짐 ✓' : ''}`}
                  </button>
                ) : (
                  <span style={noteStyle}>상단바에서 학생을 선택하면 그 학생 맞춤 상담을 켤 수 있어요.</span>
                )}
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>
                📌 자주 묻는 질문 <span style={{ fontWeight: 500 }}>· 클릭하면 바로 물어봅니다</span>
              </div>
              <EditableChipGroup
                storageKey="qa_questions"
                defaults={SAMPLE_QUESTIONS}
                onPick={(q) => {
                  if (status === 'on') send(q);
                  else { setInput(q); toast('질문이 입력되었어요. AI 연결 후 전송할 수 있습니다.'); }
                }}
              />
            </div>
          )}

          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} style={{
                alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--pri)', color: '#fff',
                borderRadius: '14px 14px 4px 14px', padding: '9px 13px', fontSize: '.88rem',
                lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.content}
              </div>
            ) : (
              <div key={i} style={{
                alignSelf: 'flex-start', maxWidth: '92%', border: '1px solid var(--border)',
                borderRadius: '14px 14px 14px 4px', padding: '9px 13px', fontSize: '.88rem',
              }}>
                <MarkdownView>{m.content}</MarkdownView>
              </div>
            )
          ))}

          {/* 스트리밍 중 말풍선 */}
          {streamText !== null && (
            <div style={{
              alignSelf: 'flex-start', maxWidth: '92%', border: '1px solid var(--border)',
              borderRadius: '14px 14px 14px 4px', padding: '9px 13px', fontSize: '.88rem',
            }}>
              {streamText
                ? <MarkdownView>{streamText + ' ▍'}</MarkdownView>
                : <span style={noteStyle}>답변 생성 중…</span>}
            </div>
          )}
        </div>

        <div style={{ ...noteStyle, marginBottom: 6 }}>
          🔒 학생 실명·식별정보는 쓰지 마세요('학생A'처럼 비식별 표기) · AI 답변은 참고용입니다 — 진단·법적 판단은 전문가와 상의하세요.
        </div>

        {/* 입력줄 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            className="form-textarea"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={status === 'on' ? '질문을 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)' : 'AI 연결 후 채팅할 수 있어요'}
            style={{ flex: 1, resize: 'none' }}
          />
          {sending ? (
            <button className="btn btn-err" onClick={stop} title="생성 중단">⏹ 중단</button>
          ) : (
            <button className="btn btn-pri" onClick={() => send()} disabled={!input.trim() || status !== 'on' || briefLoading}>
              전송
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
