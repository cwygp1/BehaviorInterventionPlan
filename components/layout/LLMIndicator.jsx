import { useLLM } from '../../contexts/LLMContext';

const LABELS = { on: 'AI 연결됨', off: 'AI 미설정', err: 'AI 끊김' };

export default function LLMIndicator({ onClick }) {
  const { status } = useLLM();
  return (
    <button
      type="button"
      className={'llm-indicator ' + status}
      onClick={onClick}
      title="AI(LM Studio) 연결 설정"
    >
      <span className="dot" />
      <span>{LABELS[status] || LABELS.off}</span>
    </button>
  );
}
