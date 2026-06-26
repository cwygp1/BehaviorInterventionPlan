import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { buildPyeongPrompt, parsePyeongLines, PYEONG_LEVELS } from '../../lib/pyeong';

export default function PyeongPage() {
  const toast = useToast();
  const { call, status: llmStatus } = useLLM();

  const [standard, setStandard] = useState('');
  const [performance, setPerformance] = useState('');
  const [level, setLevel] = useState('');
  const [count, setCount] = useState(15);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);

  async function onGenerate() {
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (!standard.trim() && !performance.trim()) { toast('성취기준 또는 수행평가 설명을 입력하세요.'); return; }
    setBusy(true); setLines([]);
    try {
      const prompt = buildPyeongPrompt({ standard, performance, level, count: +count });
      const out = await call(prompt);
      const parsed = parsePyeongLines(out);
      if (!parsed.length) { toast('평어를 추출하지 못했어요. 다시 시도해 주세요.'); }
      setLines(parsed);
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function copyAll() {
    try { await navigator.clipboard.writeText(lines.map((l) => '- ' + l).join('\n')); toast('전체 복사했어요.'); }
    catch (_) { toast('복사가 막혔어요. 직접 선택해 복사하세요.'); }
  }
  async function copyOne(l) {
    try { await navigator.clipboard.writeText(l); toast('복사했어요.'); } catch (_) {}
  }

  function loadExample() {
    setStandard('[6음01-06] 바른 자세와 호흡으로 노래 부르거나 바른 자세와 주법으로 악기를 연주한다.');
    setPerformance('태, 황, 무, 임, 중의 운지법 익혀 연습하기');
  }

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)', borderColor: '#fdba74' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>✍ 평어 생성기 (교과 세부능력·특기사항)</div>
        <p style={{ fontSize: '.9rem', color: '#9a3412', margin: 0, lineHeight: 1.6 }}>
          성취기준 + 수행평가 설명을 입력하면 생기부에 바로 쓸 수 있는 <strong>교과 평어 문장</strong>을 여러 개 생성합니다(명사형 종결).
        </p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>입력</div>
          <button className="btn btn-ghost btn-sm" onClick={loadExample}>예시 채우기</button>
        </div>
        <div className="form-group">
          <label className="form-label">성취기준</label>
          <textarea className="form-textarea" rows={2} value={standard} onChange={(e) => setStandard(e.target.value)} placeholder="예: [6음01-06] 바른 자세와 호흡으로 노래 부르거나 …" />
        </div>
        <div className="form-group">
          <label className="form-label">수행평가 설명 (학생 수행/활동 요약)</label>
          <textarea className="form-textarea" rows={3} value={performance} onChange={(e) => setPerformance(e.target.value)} placeholder="예: 태·황·무·임·중의 운지법 익혀 연습하기" />
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">성취 수준</label>
            <select className="form-input" value={level} onChange={(e) => setLevel(e.target.value)}>
              {PYEONG_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">생성 개수</label>
            <input type="number" className="form-input" min={3} max={30} value={count} onChange={(e) => setCount(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-pri" onClick={onGenerate} disabled={busy}>{busy ? '⏳ 생성 중…' : '✨ 평어 생성'}</button>
        </div>
      </div>

      {lines.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>결과 ({lines.length})</div>
            <button className="btn btn-ghost btn-sm" onClick={copyAll}>📋 전체 복사</button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {lines.map((l, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ flex: 1, fontSize: '.9rem', lineHeight: 1.6 }}>{l}</span>
                <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => copyOne(l)}>복사</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
