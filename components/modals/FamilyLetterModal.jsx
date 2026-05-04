import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import { printFamilyLetter } from '../../lib/utils/printFamilyLetter';
import { createLetter, deleteLetter } from '../../lib/api/students';
import PromptResultBlock from './PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';

const CATEGORIES = [
  { key: '진행 보고', icon: '📋', tone: '#4f6bed', bg: '#e9edff' },
  { key: '행동 변화', icon: '📈', tone: '#12b886', bg: '#e7f7ee' },
  { key: '강화 결과', icon: '⭐', tone: '#f59f00', bg: '#fff7e6' },
  { key: '가정 협력 요청', icon: '🤝', tone: '#9c36b5', bg: '#f3e7fb' },
  { key: '약속/계약', icon: '✍', tone: '#1098ad', bg: '#e3f5f8' },
  { key: '위기 안내', icon: '⚠', tone: '#ef476f', bg: '#fde7e8' },
  { key: '감사 인사', icon: '💚', tone: '#0d7d4e', bg: '#e7f7ee' },
];

// ──────────────────────────────────────────────────────────────────
// Templates auto-fill from the student's BIP / monitoring / ABC / SZ data.
// Each template returns a filled-in string based on (data, name).
// If a data field is missing it falls back to a placeholder so the teacher
// can edit before sending.
// ──────────────────────────────────────────────────────────────────
function bullets(items, fallback) {
  const real = items.filter(Boolean);
  if (real.length === 0) return fallback;
  return real.map((s) => '- ' + s).join('\n');
}

function buildPositiveChanges(data) {
  const lines = [];
  // 1) Behavior frequency trend (sort by date, compare first vs last)
  const sortedMon = [...(data?.mon || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (sortedMon.length >= 2) {
    const first = sortedMon[0];
    const last = sortedMon[sortedMon.length - 1];
    const delta = (last.freq || 0) - (first.freq || 0);
    if (delta < 0) {
      lines.push(`"${last.beh || first.beh || '문제 행동'}" 발생 빈도가 ${Math.abs(delta)}회 감소 (${first.freq}회 → ${last.freq}회)`);
    }
  }
  // 2) Alternative behavior being taught
  if (data?.bip?.alt) {
    lines.push(`대체 행동 "${data.bip.alt}" 학습 진행 중`);
  }
  // 3) Recent fidelity high score
  const recentFid = (data?.fid || []).slice(0, 5);
  if (recentFid.length) {
    const avg = Math.round((recentFid.reduce((s, r) => s + (r.score || 0) / (r.total || 4), 0) / recentFid.length) * 100);
    if (avg >= 50) {
      lines.push(`BIP 실행 충실도 평균 ${avg}% 유지 중`);
    }
  }
  return lines;
}

function buildNeedsArea(data) {
  const lines = [];
  const recentAbc = (data?.abc || []).slice(0, 2);
  recentAbc.forEach((r) => {
    if (r.b) {
      const ctx = r.a ? ` (${r.a.slice(0, 30)}${r.a.length > 30 ? '…' : ''} 시)` : '';
      lines.push(`${r.b.slice(0, 50)}${ctx}`);
    }
  });
  // Recent high-frequency behavior
  const sortedMon = [...(data?.mon || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (sortedMon[0] && (sortedMon[0].freq || 0) >= 5) {
    lines.push(`"${sortedMon[0].beh}" 빈도 ${sortedMon[0].freq}회 (지속 관찰 필요)`);
  }
  return lines;
}

const TEMPLATES = {
  '진행 보고': (data, name) => {
    const positives = buildPositiveChanges(data);
    const needs = buildNeedsArea(data);
    return `평소 ${name}에게 보내주시는 관심과 사랑에 깊이 감사드립니다.

이번 주 ${name}의 학교생활 중 다음과 같은 변화를 관찰했습니다:

[관찰된 긍정적 변화]
${bullets(positives, '- (관찰된 긍정적 변화를 입력해 주세요)')}

[보완이 필요한 영역]
${bullets(needs, '- (보완이 필요한 영역을 입력해 주세요)')}

이러한 변화는 학교와 가정의 일관된 지원이 만들어낸 결과라고 생각합니다.

학생의 변화를 함께 응원하고 격려하며, 궁금한 점이 있으시면 언제든 학교로 연락해 주세요.

감사합니다.`;
  },

  '행동 변화': (data, name) => {
    const recentAbc = (data?.abc || [])[0];
    const oldBehavior = recentAbc?.b ? recentAbc.b : '(이전에 관찰되던 패턴)';
    const positives = buildPositiveChanges(data);
    const altBeh = data?.bip?.alt || '(대체 행동을 BIP에서 작성해 주세요)';
    return `평소 ${name}의 성장을 위해 노력해 주시는 부모님께 감사드립니다.

학교에서 ${name}이/가 다음과 같은 행동 변화를 보이고 있습니다:

[기존 행동]
- ${oldBehavior}

[현재 변화]
${bullets(positives, '- (긍정적 변화를 입력해 주세요)')}

[학생이 새로 익힌 대체 행동]
- ${altBeh}

이 변화가 가정에서도 일관되게 유지되도록 함께 협력해 주시면 좋겠습니다.

감사합니다.`;
  },

  '가정 협력 요청': (data, name) => {
    const fct = data?.bip?.fct;
    const reinf = data?.bip?.reinf;
    const prev = data?.bip?.prev;
    const items = [];
    if (fct) items.push(`학교에서 사용 중인 의사소통 카드 "${fct}"를 가정에서도 동일하게 사용해 주세요`);
    if (reinf) {
      const firstLine = reinf.split('\n')[0];
      items.push(`학교 강화 방식과 일관되게 가정에서도 즉시 칭찬·격려해 주세요 (참고: ${firstLine.slice(0, 40)}${firstLine.length > 40 ? '…' : ''})`);
    }
    if (prev) {
      const firstLine = prev.split('\n')[0];
      items.push(`예방 전략과 같은 맥락으로 가정 환경을 조성해 주세요 (참고: ${firstLine.slice(0, 40)}${firstLine.length > 40 ? '…' : ''})`);
    }
    items.push('일정한 일과·수면 시간을 유지해 주세요');
    return `평소 ${name}에게 보내주시는 관심에 감사드립니다.

${name}의 행동지원계획(BIP)을 진행하는 과정에서 가정의 협력이 매우 중요합니다.

[가정에서 협력해 주실 부분]
${bullets(items.slice(0, 4), '- (협력 요청 사항을 입력해 주세요)')}

${name}의 변화를 함께 만들어가는 일에 부모님의 도움이 큰 힘이 됩니다.

감사합니다.`;
  },

  '강화 결과': (data, name) => {
    const altBeh = data?.bip?.alt || '(BIP에 대체 행동 작성 필요)';
    const crit = data?.bip?.crit || '(성공 기준 입력 필요)';
    const reinf = data?.bip?.reinf ? data.bip.reinf.split('\n')[0] : '(받은 강화/보상)';
    // Calculate "achievement rate" from recent monitoring
    const recent = (data?.mon || []).slice(0, 7);
    const altSuccess = recent.filter((r) => r.alt === 'Y').length;
    const total = recent.length;
    const rate = total ? Math.round((altSuccess / total) * 100) : null;
    const achievementLine = rate != null
      ? `최근 ${total}회 기록 중 대체 행동 수행 ${altSuccess}회 (${rate}%)`
      : '(달성 횟수 / 비율을 입력해 주세요)';
    return `${name}의 학교생활을 응원해 주시는 부모님께 감사드립니다.

이번 ${name}의 노력에 대해 다음과 같은 결과를 알려드립니다:

[목표 행동]
- ${altBeh}

[성공 기준]
- ${crit}

[성취 결과]
- ${achievementLine}

[받은 강화/보상]
- ${reinf}

${name}의 노력이 가정에서도 인정받을 수 있도록 함께 격려해 주시면 좋겠습니다.

감사합니다.`;
  },

  '위기 안내': (data, name) => {
    const sz = (data?.sz || [])[0];
    const time = sz ? `${sz.in_t || ''}~${sz.out_t || ''}` : '';
    const reason = sz?.reason || '(사유)';
    const strategy = sz?.strategy || '(진정 절차)';
    const date = sz?.date || new Date().toISOString().slice(0, 10);
    const returned = sz?.ret === 'Y' ? '학습 복귀 성공' : '안정 단계';
    return `평소 ${name}의 안전을 위해 함께해 주시는 부모님께 감사드립니다.

${date} ${name}이/가 학교에서 다음과 같은 위기 상황을 경험했음을 알려드립니다.

[발생 상황]
- 사유: ${reason}
- 시간: ${time || '(시간 입력 필요)'}
- 장소: 심리안정실(Safety Zone)

[학교의 대응]
- 사용한 진정 전략: ${strategy}
- 현재 상태: ${returned}

가정에서도 비슷한 상황이 있을 수 있으니 부드럽게 살펴봐 주시고, 추가 정보가 필요하시면 학교로 연락해 주세요.

감사합니다.`;
  },

  '약속/계약': (data, name) => {
    const altBeh = data?.bip?.alt || '(BIP에서 대체 행동 작성 필요)';
    const crit = data?.bip?.crit || '(성공 기준 입력 필요)';
    const reinf = data?.bip?.reinf ? data.bip.reinf.split('\n')[0] : '(보상/강화)';
    return `${name}과(와) 함께 만든 행동 계약서를 가정에 안내드립니다.

[학생의 약속]
- ${altBeh}

[성공 기준]
- ${crit}

[교사의 약속]
- ${reinf}

가정에서도 같은 약속을 응원하고 격려해 주시면 ${name}의 변화에 큰 도움이 됩니다.

감사합니다.`;
  },

  '감사 인사': (_data, name) => `평소 ${name}의 학교생활을 위해 보내주시는 관심과 협력에 진심으로 감사드립니다.

이번 학기/주간을 잘 마무리할 수 있었던 것은 가정과 학교의 협력 덕분입니다.

앞으로도 ${name}의 성장을 함께 응원해 주시기 바랍니다.

감사합니다.`,
};

export default function FamilyLetterModal({ open, onClose }) {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const { user } = useAuth();
  const { call, status } = useLLM();
  const toast = useToast();
  const [category, setCategory] = useState('진행 보고');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiOut, setAiOut] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const letters = curStuData?.letters || [];

  useEffect(() => {
    if (open) {
      setCategory('진행 보고');
      setSubject('');
      setBody(TEMPLATES['진행 보고'](curStuData, curStu?.code || '학생'));
      setAiOut('');
      setShowHistory(false);
    }
  }, [open, curStu, curStuData]);

  function pickCategory(cat) {
    setCategory(cat);
    if (TEMPLATES[cat]) {
      setBody(TEMPLATES[cat](curStuData, curStu?.code || '학생'));
    }
    if (!subject) setSubject(`[${cat}] ${curStu?.code || '학생'}에 대한 안내`);
  }

  function buildPrompt() {
    const bipSummary = curStuData?.bip ? `대체행동: ${curStuData.bip.alt || ''}, 성공기준: ${curStuData.bip.crit || ''}` : '(BIP 미작성)';
    const recentMon = (curStuData?.mon || []).slice(0, 5).map((r) => `${r.date} ${r.beh}(빈도 ${r.freq})`).join('; ');
    return `당신은 특수교육 교사입니다. 학부모에게 보낼 가정 연계 통신문 본문을 한국어로 작성해주세요.

## 학생 (비식별)
- ID: ${curStu?.code}
- 학교급: ${curStu?.level}
- 비식별 요약: ${curStu?.note || '(없음)'}
- BIP 요지: ${bipSummary}
- 최근 행동 모니터링: ${recentMon || '(없음)'}

## 통신문 카테고리
${category}

## 작성 요구
- 따뜻하고 존중하는 어조 (학부모 안심·협력 요청)
- 5단락 이내로 다음 구성:
  1) 인사 및 감사 표현
  2) 학교에서 진행 중인 행동 중재 노력
  3) 학생의 변화/성과
  4) 가정에서 협력해 주실 부분
  5) 마무리 인사
- 학생 실명·민감정보 금지 (익명 ID로만)
- 800자 이내`;
  }

  async function runAI() {
    if (!curStu) { toast('학생을 먼저 선택해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setAiBusy(true); setAiOut('');
    try {
      const reply = await call(buildPrompt(), { max_tokens: 4000 });
      setAiOut(reply);
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }
  function applyAI() {
    if (!aiOut.trim()) return;
    setBody(aiOut);
    toast('본문에 적용했습니다.');
  }

  async function saveAndPrint() {
    if (!curStuId) return;
    if (!body.trim()) { toast('본문을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const res = await createLetter(curStuId, { category, subject, body });
      updateStudentData(curStuId, (cur) => ({ ...cur, letters: [res.record, ...(cur.letters || [])] }));
      toast('이력에 저장하고 인쇄 창을 엽니다.');
      printFamilyLetter({
        studentId: curStu?.code,
        teacherName: user?.name,
        school: user?.school,
        body, subject, category,
      });
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  function quickPrint() {
    if (!body.trim()) { toast('본문을 입력해주세요.'); return; }
    printFamilyLetter({
      studentId: curStu?.code,
      teacherName: user?.name,
      school: user?.school,
      body, subject, category,
    });
  }

  function loadFromHistory(letter) {
    setCategory(letter.category || '진행 보고');
    setSubject(letter.subject || '');
    setBody(letter.body || '');
    setShowHistory(false);
    toast('이력에서 불러왔습니다. 수정 후 다시 인쇄할 수 있어요.');
  }

  async function onDeleteLetter(id) {
    if (!window.confirm('이 통신문 이력을 삭제할까요?')) return;
    try {
      await deleteLetter(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, letters: (cur.letters || []).filter((l) => l.id !== id) }));
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  const catObj = CATEGORIES.find((c) => c.key === category) || CATEGORIES[0];

  return (
    <Modal open={open} onClose={onClose} maxWidth={780}>
      <h3 style={{ paddingRight: 36 }}>✉ 가정 연계 통신문</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '4px 0 10px' }}>
        학부모와의 협력을 위한 통신문을 작성하고 인쇄·저장할 수 있습니다. 작성한 통신문은 자동으로 이력에 저장됩니다.
      </p>
      {letters.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowHistory((v) => !v)}
          >
            📜 이력 {letters.length}건 {showHistory ? '▲ 숨기기' : '▼ 보기'}
          </button>
        </div>
      )}

      {/* 이력 영역 */}
      {showHistory && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>📜 보낸 통신문 이력 (클릭해서 불러오기)</div>
          {letters.length === 0 ? (
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center', padding: 14 }}>아직 보낸 통신문이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {letters.map((l) => {
                const c = CATEGORIES.find((x) => x.key === l.category) || CATEGORIES[0];
                return (
                  <div
                    key={l.id}
                    style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                    onClick={() => loadFromHistory(l)}
                  >
                    <span style={{ background: c.bg, color: c.tone, padding: '4px 10px', borderRadius: 99, fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {c.icon} {l.category || '기타'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.86rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.subject || '(제목 없음)'}
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                        {l.sent_date} · {(l.body || '').slice(0, 40)}…
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteLetter(l.id); }}
                      title="삭제"
                      aria-label="삭제"
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: 'none',
                        background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
                        fontSize: '1.1rem', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0, padding: 0, lineHeight: 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,71,111,.1)'; e.currentTarget.style.color = 'var(--err)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 카테고리 칩 */}
      <div className="form-group">
        <label className="form-label">📂 통신문 카테고리</label>
        <div className="qchip-area">
          {CATEGORIES.map((c) => {
            const on = category === c.key;
            return (
              <span
                key={c.key}
                className="qchip"
                onClick={() => pickCategory(c.key)}
                style={on ? { background: c.tone, color: '#fff', borderColor: c.tone } : { color: c.tone, borderColor: c.bg, background: c.bg }}
              >
                {c.icon} {c.key}
              </span>
            );
          })}
        </div>
      </div>

      {/* 제목 */}
      <div className="form-group">
        <label className="form-label">제목</label>
        <input className="form-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={`예: [${category}] ${curStu?.code || '학생'}에 대한 안내`} />
      </div>

      {/* AI 초안 영역 */}
      <div style={{ background: 'var(--pri-soft)', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid var(--pri-l)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--pri)' }}>🤖 AI 초안 도우미</span>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>학생 BIP·관찰 기록을 바탕으로 본문을 자동 생성합니다</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <AIActionBar prompt={buildPrompt()} onCallAI={runAI} busy={aiBusy} callLabel="🤖 AI 초안 생성" disabled={!curStu} align="flex-start" />
          {aiOut && <button className="btn btn-ok btn-sm" onClick={applyAI}>✅ 본문에 적용</button>}
        </div>
        {(aiOut || aiBusy) && <PromptResultBlock prompt={buildPrompt()} output={aiOut} busy={aiBusy} />}
      </div>

      {/* 본문 */}
      <div className="form-group">
        <label className="form-label">통신문 본문 <span style={{ color: 'var(--muted)', fontSize: '.74rem', fontWeight: 500 }}>· 카테고리 칩 선택 시 자동으로 템플릿이 채워집니다</span></label>
        <textarea
          className="form-textarea"
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ borderLeft: `4px solid ${catObj.tone}` }}
        />
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={quickPrint} title="이력에 저장 없이 인쇄만">🖨 임시 인쇄</button>
          <button className="btn btn-ok" onClick={saveAndPrint} disabled={busy}>
            {busy ? '저장 중...' : '💾 저장 + 인쇄'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
