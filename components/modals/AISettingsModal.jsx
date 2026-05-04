import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { LLM_DEFAULT_ENDPOINT, llmRequest } from '../../lib/api/llm';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';

export default function AISettingsModal({ open, onClose }) {
  const { config, saveConfig, clearConfig } = useLLM();
  const toast = useToast();
  const [endpoint, setEndpoint] = useState(LLM_DEFAULT_ENDPOINT);
  const [model, setModel] = useState('');
  const [maxTokens, setMaxTokens] = useState(8000);
  const [statusMsg, setStatusMsg] = useState(null); // {type, html}

  useEffect(() => {
    if (open) {
      setEndpoint(config?.endpoint || LLM_DEFAULT_ENDPOINT);
      setModel(config?.model || '');
      setMaxTokens(config?.max_tokens || 8000);
      setStatusMsg(null);
    }
  }, [open, config]);

  async function onTest() {
    if (!endpoint.trim()) {
      setStatusMsg({ type: 'err', html: 'Endpoint URL을 입력해 주세요.' });
      return;
    }
    setStatusMsg({ type: 'info', html: '연결 테스트 중... (모델 로드 중이면 30초~1분 걸릴 수 있음)' });
    try {
      const reply = await llmRequest(
        endpoint.trim(),
        model.trim(),
        [{ role: 'user', content: '한 줄로 "연결 성공"이라고만 답해주세요.' }],
        { timeout: 60000, max_tokens: 200 }
      );
      const trimmed = (reply?.content || '').trim();
      if (trimmed) {
        setStatusMsg({ type: 'ok', html: '✅ 연결 성공! 모델 응답: "' + trimmed.slice(0, 120) + (trimmed.length > 120 ? '…' : '') + '"' });
      } else {
        setStatusMsg({ type: 'ok', html: '✅ 통신은 성공했지만 모델이 빈 응답을 반환했습니다.<br><small>LM Studio에 모델이 <strong>Load</strong> 되어 있는지 확인하세요.</small>' });
      }
    } catch (e) {
      let msg = '❌ 연결 실패: ' + e.message;
      if (e.name === 'AbortError') msg = '❌ 응답 시간 초과 (60초). 더 작은 모델로 바꾸거나, 모델이 완전히 Load 되었는지 확인하세요.';
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        msg = '❌ 서버에 닿지 못했습니다.<br><small>1) LM Studio가 실행 중인가요? &nbsp; 2) Server 탭에서 Start Server를 눌렀나요? &nbsp; 3) Server Settings에서 <strong>CORS</strong>를 ON 했나요?</small>';
      }
      setStatusMsg({ type: 'err', html: msg });
    }
  }

  function onSave() {
    if (!endpoint.trim()) {
      setStatusMsg({ type: 'err', html: 'Endpoint URL을 입력해 주세요.' });
      return;
    }
    const mt = parseInt(maxTokens, 10);
    if (!Number.isFinite(mt) || mt < 256 || mt > 65536) {
      setStatusMsg({ type: 'err', html: '최대 출력 토큰은 256 ~ 65536 사이로 설정해 주세요.' });
      return;
    }
    saveConfig({ endpoint: endpoint.trim(), model: model.trim(), max_tokens: mt });
    toast('AI 연결 설정이 저장되었습니다.');
    onClose();
  }

  function onClear() {
    if (!window.confirm('저장된 AI 연결 설정을 삭제할까요?')) return;
    clearConfig();
    setEndpoint(LLM_DEFAULT_ENDPOINT);
    setModel('');
    setMaxTokens(8000);
    setStatusMsg({ type: 'info', html: '초기화되었습니다.' });
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={540}>
      <h3>🤖 AI(LLM) 연결 설정</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        LM Studio 같은 OpenAI 호환 LLM 서버에 연결합니다. <strong>브라우저에서 직접 호출</strong>하므로,
        LM Studio의 <strong>Server Settings → Cross-Origin Resource Sharing(CORS)</strong>를 ON 해야 합니다.
      </p>
      <div className="form-group">
        <label className="form-label">Endpoint URL</label>
        <input className="form-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        <div className="form-hint">LM Studio 기본값: <code>http://localhost:1234/v1/chat/completions</code></div>
      </div>
      <div className="form-group">
        <label className="form-label">모델명 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(선택)</span></label>
        <input className="form-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="auto" />
      </div>
      <div className="form-group">
        <label className="form-label">최대 출력 토큰 (max_tokens)</label>
        <input className="form-input" type="number" min="256" max="65536" step="1024" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
        <div className="form-hint">
          한 번의 응답에서 생성할 최대 토큰. 너무 작으면 답이 잘립니다. LM Studio Context Length가 65535면 <strong>16000~32000</strong> 추천.
          한국어는 1글자당 약 1~2 토큰 사용.
        </div>
      </div>
      {statusMsg && (
        <div className={'llm-status-msg ' + statusMsg.type} dangerouslySetInnerHTML={{ __html: statusMsg.html }} />
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onTest}>🔌 연결 테스트</button>
          <button className="btn btn-ghost btn-sm" onClick={onClear} style={{ color: 'var(--err)' }}>초기화</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-pri" onClick={onSave}>💾 저장</button>
        </div>
      </div>
    </Modal>
  );
}
