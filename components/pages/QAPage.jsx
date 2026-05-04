import { useState } from 'react';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';

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

export default function QAPage() {
  const { call, status } = useLLM();
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);

  function buildPrompt(q) {
    return `당신은 2024 서울시교육청 PBS(긍정적 행동지원) 가이드북 전문가입니다.
다음 교사 질문에 대해 가이드북 내용·근거 기반으로 한국어로 답변해주세요.

## 답변 원칙
- 가이드북의 핵심 개념(예: 4:1 비율, Tier 모델, FBA, FCT, DRA/DRO, Acting-Out Cycle 등)을 정확히 인용
- 한국 학교 현장에서 즉시 적용 가능한 구체 사례 포함
- 답변 마지막에 관련 가이드북 섹션 또는 추가 학습 자료 권고
- 학생 실명·민감정보를 묻는 질문이라면 비식별화 원칙을 안내

## 교사 질문
${q}`;
  }

  // Used by AIActionBar — only fires when LLM is connected.
  async function ask() {
    const text = question.trim();
    if (!text) { toast('질문을 입력해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setBusy(true); setOutput('');
    try {
      const reply = await call(buildPrompt(text));
      setOutput(reply);
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  // Sample-question chip — always populates (works without AI).
  // If LLM is connected, also auto-ask. Otherwise the user can copy via AIActionBar.
  async function selectQuestion(q) {
    setQuestion(q);
    setOutput('');
    if (status !== 'on') {
      toast('질문이 입력되었습니다. 우측 하단에서 프롬프트를 복사하거나 외부 AI에 보내세요.');
      return;
    }
    // Auto-call AI with the picked question (avoid stale state — pass q directly)
    setBusy(true);
    try {
      const reply = await call(buildPrompt(q));
      setOutput(reply);
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">💬 PBS Q&A 전문가</div>
        <div className="card-subtitle">서울시교육청 가이드북 기반 PBS·생활지도·교권 보호·지원 제도에 대해 질문하세요.</div>
        <div className="form-group">
          <label className="form-label">질문</label>
          <textarea className="form-textarea" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="예: 학급에서 4:1 긍정 비율을 지키려면 어떻게 해야 하나요?" />
        </div>
        <AIActionBar
          prompt={question.trim() ? buildPrompt(question.trim()) : ''}
          onCallAI={() => ask()}
          busy={busy}
          callLabel="🤖 질문하기"
          disabled={!question.trim()}
        />

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 700 }}>
            📌 자주 묻는 질문 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· 클릭하면 위 질문창에 채워집니다{status === 'on' ? ' (AI 연결됨 — 자동 호출)' : ''}</span>
          </div>
          <div className="qchip-area">
            {SAMPLE_QUESTIONS.map((q, i) => (
              <span key={i} className="qchip" onClick={() => selectQuestion(q)}>{q}</span>
            ))}
          </div>
        </div>
      </div>

      {(output || busy) && (
        <div className="card">
          <PromptResultBlock prompt={buildPrompt(question)} output={output} busy={busy} />
        </div>
      )}
    </>
  );
}
