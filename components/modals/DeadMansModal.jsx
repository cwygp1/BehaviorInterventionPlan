import { useState } from 'react';
import Modal from '../ui/Modal';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import PromptResultBlock from './PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';

const DEFAULT_PROMPT = (input) => `다음 모호한 행동 서술을 Dead Man's Test를 통과하는 관찰 가능·측정 가능 행동 정의로 변환해주세요.

원칙:
- "죽은 사람도 할 수 있는 것"은 행동이 아닙니다 (예: "방해하지 않는다" → 부적절).
- 능동형, 구체적, 빈도/시간/강도로 측정 가능한 형태로 변환합니다.
- 출력은 다음 두 줄로:
  1) 변환된 정의: <한 문장>
  2) 측정 단위: <빈도/지속시간/강도/지연시간 중 무엇을 어떻게 셀지>

원본 서술: "${input}"`;

export default function DeadMansModal({ open, onClose }) {
  const { call, status } = useLLM();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);

  async function runAI() {
    if (!input.trim()) { toast('변환할 행동 서술을 입력해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요. (우상단 AI 버튼)'); return; }
    setBusy(true); setOutput('');
    try {
      const reply = await call(DEFAULT_PROMPT(input.trim()), { max_tokens: 600 });
      setOutput(reply);
    } catch (e) {
      toast('AI 호출 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={620}>
      <h3>🪄 조작적 정의 도우미 (Dead Man's Test)</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        모호한 행동 서술을 입력하면 AI가 측정 가능한 정의로 변환합니다.
      </p>
      <div className="form-group">
        <label className="form-label">원본 서술</label>
        <input
          className="form-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 수업을 방해한다"
        />
      </div>
      <AIActionBar
        prompt={input.trim() ? DEFAULT_PROMPT(input.trim()) : ''}
        onCallAI={runAI}
        busy={busy}
        callLabel="🤖 AI 변환"
        disabled={!input.trim()}
      />
      {(output || busy) && (
        <PromptResultBlock
          prompt={DEFAULT_PROMPT(input.trim())}
          output={output}
          busy={busy}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
