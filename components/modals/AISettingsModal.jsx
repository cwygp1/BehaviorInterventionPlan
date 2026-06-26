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
  const [modelFast, setModelFast] = useState('');
  const [maxTokens, setMaxTokens] = useState(8000);
  const [statusMsg, setStatusMsg] = useState(null); // {type, html}
  const [advanced, setAdvanced] = useState(false); // 고급 설정 펼침

  useEffect(() => {
    if (open) {
      setEndpoint(config?.endpoint || LLM_DEFAULT_ENDPOINT);
      setModel(config?.model || '');
      setModelFast(config?.model_fast || '');
      setMaxTokens(config?.max_tokens || 8000);
      setStatusMsg(null);
      // 모델명/토큰을 이미 바꿔둔 사용자는 고급 설정을 펼쳐서 보여준다.
      setAdvanced(!!(config?.model || config?.model_fast) || (config?.max_tokens && config.max_tokens !== 8000));
    }
  }, [open, config]);

  // 모델 하나를 핑한다. 서버 자체에 닿지 못하는 오류(AbortError/네트워크)는
  // 위로 던져서 공통 안내문을 보여주고, 모델 단위 오류(미로드 등)는 줄 단위로 표기.
  async function pingOne(label, m) {
    try {
      const reply = await llmRequest(
        endpoint.trim(),
        (m || '').trim(),
        [{ role: 'user', content: '한 줄로 "연결 성공"이라고만 답해주세요.' }],
        { timeout: 60000, max_tokens: 200 }
      );
      const trimmed = (reply?.content || '').trim();
      return `${label}: ` + (trimmed
        ? '✅ "' + trimmed.slice(0, 60) + (trimmed.length > 60 ? '…' : '') + '"'
        : '⚠️ 빈 응답 (LM Studio에서 모델 Load 확인)');
    } catch (e) {
      if (e.name === 'AbortError' || /Failed to fetch|NetworkError/i.test(e.message || '')) throw e;
      return `${label}: ❌ ${e.message}`;
    }
  }

  async function onTest() {
    if (!endpoint.trim()) {
      setStatusMsg({ type: 'err', html: 'LLM 서버 주소를 입력해 주세요.' });
      return;
    }
    setStatusMsg({ type: 'info', html: '연결 테스트 중... (모델 로드 중이면 30초~1분 걸릴 수 있음)' });
    try {
      const lines = [];
      lines.push(await pingOne('품질 모델', model));
      if (modelFast.trim()) lines.push(await pingOne('빠른 모델', modelFast));
      const anyOk = lines.some((l) => l.includes('✅'));
      setStatusMsg({ type: anyOk ? 'ok' : 'err', html: lines.join('<br>') });
    } catch (e) {
      let msg = '❌ 연결 실패: ' + e.message;
      if (e.name === 'AbortError') msg = '❌ 응답 시간 초과 (60초). 더 작은 모델로 바꾸거나, 모델이 완전히 Load 되었는지 확인하세요.';
      if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
        msg = '❌ AI 서버에 연결할 수 없어요. 아래를 확인해 주세요.<br><small>'
          + '① LM Studio 앱이 <strong>켜져</strong> 있나요?<br>'
          + '② 왼쪽 <strong>Developer(개발자)</strong> 탭에서 <strong>Start Server</strong>(서버 시작)를 눌렀나요?<br>'
          + '③ 같은 화면의 설정에서 <strong>CORS(브라우저 연결 허용)</strong>를 켰나요?<br>'
          + '④ 주소가 맞나요? 기본값: <code>http://localhost:1234/v1/chat/completions</code></small>';
      }
      setStatusMsg({ type: 'err', html: msg });
    }
  }

  async function onSave() {
    if (!endpoint.trim()) {
      setStatusMsg({ type: 'err', html: 'LLM 서버 주소를 입력해 주세요.' });
      return;
    }
    const mt = parseInt(maxTokens, 10);
    if (!Number.isFinite(mt) || mt < 256 || mt > 65536) {
      setStatusMsg({ type: 'err', html: '최대 출력 토큰은 256 ~ 65536 사이로 설정해 주세요.' });
      return;
    }
    setStatusMsg({ type: 'info', html: '저장 중...' });
    try {
      await saveConfig({ endpoint: endpoint.trim(), model: model.trim(), model_fast: modelFast.trim(), max_tokens: mt });
      toast('AI 연결 설정이 저장되었습니다.');
      onClose();
    } catch (e) {
      setStatusMsg({ type: 'err', html: '❌ 저장 실패: ' + (e?.message || '알 수 없는 오류') });
    }
  }

  async function onClear() {
    if (!window.confirm('저장된 AI 연결 설정을 삭제할까요?')) return;
    try {
      await clearConfig();
    } catch (_) {
      // best-effort — clearConfig swallows server errors but local state is cleared
    }
    setEndpoint(LLM_DEFAULT_ENDPOINT);
    setModel('');
    setModelFast('');
    setMaxTokens(8000);
    setStatusMsg({ type: 'info', html: '초기화되었습니다.' });
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={540}>
      <h3>🤖 AI 어시스턴트 연결</h3>
      <p style={{ fontSize: '.86rem', color: 'var(--sub)', margin: '6px 0 12px', lineHeight: 1.6 }}>
        내 컴퓨터의 <strong>LM Studio</strong>(무료 AI 프로그램)에 연결하면, BIP·IEP 초안 등을 AI가 자동으로 만들어 줍니다.
        AI 연결 없이도 앱의 기본 기능은 모두 사용할 수 있어요.
      </p>
      <details style={{ margin: '0 0 14px', background: 'var(--pri-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.86rem', color: 'var(--pri-d)' }}>🔰 처음이신가요? 연결 방법 보기</summary>
        <ol style={{ margin: '10px 0 0 18px', fontSize: '.84rem', color: 'var(--sub)', lineHeight: 1.7 }}>
          <li><strong>LM Studio</strong> 앱을 설치하고 실행해요. (lmstudio.ai 에서 무료 다운로드)</li>
          <li>원하는 모델을 다운로드한 뒤 불러옵니다(Load).</li>
          <li>왼쪽 <strong>Developer(개발자)</strong> 탭에서 <strong>Start Server</strong>(서버 시작)를 누릅니다.</li>
          <li>같은 화면 설정에서 <strong>CORS(브라우저 연결 허용)</strong>를 켭니다.</li>
          <li>아래 주소를 그대로 두고 <strong>연결 테스트</strong>를 눌러 확인해요.</li>
        </ol>
      </details>
      <div className="form-group">
        <label className="form-label">LLM 서버 주소 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(Endpoint URL)</span></label>
        <input className="form-input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        <div className="form-hint">LM Studio 기본값: <code>http://localhost:1234/v1/chat/completions</code> (보통 그대로 두면 됩니다)</div>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setAdvanced((v) => !v)}
        style={{ marginBottom: advanced ? 12 : 0 }}
      >
        ⚙ 고급 설정 {advanced ? '▴' : '▾'}
      </button>

      {advanced && (
        <>
          <div className="form-group">
            <label className="form-label">품질 모델 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(기본 — 긴 문서·정식 산출물)</span></label>
            <input className="form-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="예: qwen3.6-35b-a3b" />
            <div className="form-hint">BIP·IEP·위기대응·가정통신문 등 정식 문서에 사용. 비워두면 자동(auto).</div>
          </div>
          <div className="form-group">
            <label className="form-label">빠른 모델 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(짧은·상호작용·이미지)</span></label>
            <input className="form-input" value={modelFast} onChange={(e) => setModelFast(e.target.value)} placeholder="예: qwen3.5-9b" />
            <div className="form-hint">평어·질문답변·텍스트 분리·문서 OCR 등 빠른 작업에 사용. 비워두면 품질 모델을 사용. <br />※ 두 모델을 LM Studio에 모두 Load 해두고, 모델명은 LM Studio에 표시되는 식별자와 일치시키세요.</div>
          </div>
          <div className="form-group">
            <label className="form-label">한 번에 만들 최대 글자량 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(max_tokens)</span></label>
            <input className="form-input" type="number" min="256" max="65536" step="1024" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
            <div className="form-hint">
              너무 작으면 답이 중간에 잘립니다. 보통 <strong>16000~32000</strong>을 권장해요. (값이 클수록 답이 길어질 수 있고 속도는 느려질 수 있어요.)
            </div>
          </div>
        </>
      )}
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
