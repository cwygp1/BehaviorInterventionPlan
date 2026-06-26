import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { AI_EDIT_PASSWORD, LLM_DEFAULT_ENDPOINT, llmRequest } from '../../lib/api/llm';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';

const STATUS_LABEL = { on: '✅ 연결됨', off: '⚪ 미설정', err: '❌ 끊김', loading: '⏳ 확인 중' };

export default function AISettingsModal({ open, onClose }) {
  const { config, status, saveConfig, clearConfig, aiLog, clearLog } = useLLM();
  const toast = useToast();
  const [endpoint, setEndpoint] = useState(LLM_DEFAULT_ENDPOINT);
  const [model, setModel] = useState('');
  const [modelFast, setModelFast] = useState('');
  const [maxTokens, setMaxTokens] = useState(8000);
  const [statusMsg, setStatusMsg] = useState(null); // {type, html}
  const [advanced, setAdvanced] = useState(false); // 고급 설정 펼침

  // 수정 잠금: 기본은 보기 전용. 비밀번호 입력 후에만 편집/저장 가능.
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');

  useEffect(() => {
    if (open) {
      setEndpoint(config?.endpoint || LLM_DEFAULT_ENDPOINT);
      setModel(config?.model || '');
      setModelFast(config?.model_fast || '');
      setMaxTokens(config?.max_tokens || 8000);
      setStatusMsg(null);
      setAdvanced(!!(config?.model || config?.model_fast) || (config?.max_tokens && config.max_tokens !== 8000));
      // 모달을 열 때마다 잠금 상태로 초기화.
      setUnlocked(false);
      setPwInput('');
      setPwErr('');
    }
  }, [open, config]);

  function tryUnlock() {
    if (pwInput === AI_EDIT_PASSWORD) {
      setUnlocked(true);
      setPwErr('');
      setPwInput('');
      setAdvanced(true);
    } else {
      setPwErr('비밀번호가 올바르지 않습니다.');
    }
  }

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
      setStatusMsg({ type: 'err', html: 'LLM 서버 주소가 설정되어 있지 않습니다.' });
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
      await saveConfig(
        { endpoint: endpoint.trim(), model: model.trim(), model_fast: modelFast.trim(), max_tokens: mt },
        AI_EDIT_PASSWORD
      );
      toast('공용 AI 연결 설정이 저장되었습니다. (모든 선생님에게 적용)');
      onClose();
    } catch (e) {
      setStatusMsg({ type: 'err', html: '❌ 저장 실패: ' + (e?.message || '알 수 없는 오류') });
    }
  }

  async function onClear() {
    if (!window.confirm('공용 AI 연결 설정을 초기화할까요? 모든 선생님에게 적용됩니다.')) return;
    try {
      await clearConfig(AI_EDIT_PASSWORD);
      setEndpoint(LLM_DEFAULT_ENDPOINT);
      setModel('');
      setModelFast('');
      setMaxTokens(8000);
      setStatusMsg({ type: 'info', html: '초기화되었습니다.' });
    } catch (e) {
      setStatusMsg({ type: 'err', html: '❌ 초기화 실패: ' + (e?.message || '알 수 없는 오류') });
    }
  }

  const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '.88rem' };
  const keyStyle = { color: 'var(--sub)', flex: '0 0 auto' };
  const valStyle = { color: 'var(--ink)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' };

  return (
    <Modal open={open} onClose={onClose} maxWidth={540}>
      <h3>🤖 AI 어시스턴트 연결 <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--pri-d)', background: 'var(--pri-soft)', borderRadius: 'var(--r-sm)', padding: '2px 8px', marginLeft: 6, verticalAlign: 'middle' }}>전체 공용</span></h3>
      <p style={{ fontSize: '.86rem', color: 'var(--sub)', margin: '6px 0 12px', lineHeight: 1.6 }}>
        이 연결 설정은 <strong>모든 선생님에게 동일하게 적용</strong>되는 공용 설정입니다.
        평소에는 보기 전용이며, 수정하려면 관리 비밀번호가 필요합니다.
      </p>

      {!unlocked ? (
        /* ---------- 보기 전용 view ---------- */
        <>
          <div style={{ background: 'var(--surface-2, var(--pri-soft))', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', margin: '0 0 14px' }}>
            <div style={rowStyle}><span style={keyStyle}>상태</span><span style={valStyle}>{STATUS_LABEL[status] || STATUS_LABEL.off}</span></div>
            <div style={rowStyle}><span style={keyStyle}>서버 주소</span><span style={valStyle}>{config?.endpoint || '— (미설정)'}</span></div>
            <div style={rowStyle}><span style={keyStyle}>품질 모델</span><span style={valStyle}>{config?.model || '자동(auto)'}</span></div>
            <div style={rowStyle}><span style={keyStyle}>빠른 모델</span><span style={valStyle}>{config?.model_fast || '품질 모델과 동일'}</span></div>
            <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={keyStyle}>최대 출력 토큰</span><span style={valStyle}>{config?.max_tokens || 8000}</span></div>
          </div>

          {statusMsg && (
            <div className={'llm-status-msg ' + statusMsg.type} dangerouslySetInnerHTML={{ __html: statusMsg.html }} />
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
            <label className="form-label">🔒 수정하려면 관리 비밀번호를 입력하세요</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="form-input"
                type="password"
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') tryUnlock(); }}
                placeholder="관리 비밀번호"
                style={{ flex: 1 }}
              />
              <button className="btn btn-pri btn-sm" onClick={tryUnlock}>잠금 해제</button>
            </div>
            {pwErr && <div className="form-hint" style={{ color: 'var(--err)' }}>{pwErr}</div>}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={onTest}>🔌 연결 테스트</button>
            <button className="btn btn-ghost" onClick={onClose}>닫기</button>
          </div>
        </>
      ) : (
        /* ---------- 편집 모드(잠금 해제됨) ---------- */
        <>
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
        </>
      )}

      {/* AI 통신 로그 — 모든 화면(목표 생성 등)의 AI 요청·응답이 여기에 모인다. */}
      <details style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          🧪 AI 통신 로그 ({aiLog.length})
        </summary>
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
          {aiLog.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearLog}>로그 지우기</button>
          )}
        </div>
        {aiLog.length === 0 && (
          <div className="form-hint" style={{ margin: 0 }}>
            AI 버튼을 누르면 요청·응답 상태(성공/실패·finish_reason·길이)와 응답 원문이 여기에 기록됩니다.
          </div>
        )}
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {aiLog.map((e, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '6px 0', fontSize: 12.5 }}>
              <span style={{ color: 'var(--sub)' }}>{e.t}</span>{' '}
              <span style={{ fontWeight: 700, color: e.status === 'ok' ? '#15a36e' : e.status === 'error' ? '#c0392b' : '#3b6ef5' }}>
                [{e.status === 'ok' ? '성공' : e.status === 'error' ? '실패' : '요청'}]</span>{' '}
              <b>{e.label}</b> — {e.detail}
              {e.raw && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer', color: '#3b6ef5' }}>응답 원문 보기</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2, #f7f8fa)', padding: 8, borderRadius: 6, maxHeight: 260, overflow: 'auto', fontSize: 11.5, marginTop: 4 }}>{e.raw}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </details>
    </Modal>
  );
}
