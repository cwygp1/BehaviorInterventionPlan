import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { useStudents } from '../../contexts/StudentContext';
import MarkdownView from '../ui/MarkdownView';
import {
  GEN_TOOLS,
  GEN_SYSTEM,
  buildStudentContext,
  renderPrompt,
  buildRefinePrompt,
  cleanText,
  parseLines,
} from '../../lib/generators';
import { buildFullStudentContext } from '../../lib/tierContext';
import AacMakerTool from '../generator/AacMakerTool';

// AI를 쓰지 않는 유틸 도구(별도 UI) — 갤러리에 함께 노출된다.
const UTIL_TOOLS = [
  {
    id: 'aac',
    icon: '🖼',
    title: 'AAC 의사소통 카드',
    desc: '이미지에 단어를 매칭해 인쇄용 AAC 그림카드(A4 배열)를 만듭니다. 크기·테두리·글자 위치 선택 후 인쇄하거나 PDF로 저장하세요.',
  },
];

const HISTORY_KEY = 'seai.gen.history';
const REFINE_CHIPS = ['더 쉽게', '더 짧게', '더 자세히', '개수 늘려', '더 따뜻하게'];

// 도구의 기본 폼 값(필드 default)으로 초기화.
function initValues(tool) {
  const v = {};
  (tool.fields || []).forEach((f) => {
    if (f.type === 'multiselect') v[f.key] = Array.isArray(f.default) ? [...f.default] : [];
    else if (f.default != null) v[f.key] = f.default;
    else if (f.type === 'select') v[f.key] = (f.options && f.options[0]) || '';
    else v[f.key] = '';
  });
  return v;
}

export default function GeneratorPage() {
  const toast = useToast();
  const { call, status: llmStatus } = useLLM();
  const { curStu, curStuId, curStuData, students, selectStudent, tier2Groups, curSemester } = useStudents();

  const [toolId, setToolId] = useState(null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { text, list, prompt }
  const [showPrompt, setShowPrompt] = useState(false);
  const [resEdit, setResEdit] = useState(false); // 텍스트 결과 편집 모드
  const [history, setHistory] = useState([]);

  const tool = useMemo(() => GEN_TOOLS.find((t) => t.id === toolId) || null, [toolId]);

  // 학생 컨텍스트(자동 주입) — 도구가 표시하기로 한 키만 노출.
  const ctx = useMemo(() => buildStudentContext(curStu, curStuData), [curStu, curStuData]);
  const shownCtx = useMemo(() => {
    if (!tool) return [];
    return (tool.contextKeys || []).filter((k) => ctx[k]).map((k) => [k, ctx[k]]);
  }, [tool, ctx]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw).slice(0, 20));
    } catch (_) {}
  }, []);

  function openTool(t) {
    setToolId(t.id);
    setValues(initValues(t));
    setResult(null);
    setShowPrompt(false);
  }
  function backToGallery() {
    setToolId(null);
    setResult(null);
  }

  function setField(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }
  // 예시 채우기 — 기본값으로 초기화한 뒤 샘플 값을 덮어쓴다(미지정 필드는 default 유지).
  function applySample(sample) {
    if (!tool || !sample) return;
    setValues({ ...initValues(tool), ...(sample.values || {}) });
    setResult(null);
  }
  function toggleMulti(key, opt) {
    setValues((prev) => {
      const cur = Array.isArray(prev[key]) ? prev[key] : [];
      return { ...prev, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });
  }

  function saveHistory(entry) {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 20);
      try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }

  async function runPrompt(prompt) {
    // 도구별 tier 지정(예: 평어·통신문·풀어쓰기는 'fast'). 미지정이면 resolveModel이 품질 모델로 폴백.
    const out = await call(prompt, { system: tool.system || GEN_SYSTEM, tier: tool.tier });
    const text = String(out || '');
    const packed = { text, list: tool.output === 'list' ? parseLines(text) : null, prompt };
    setResult(packed);
    saveHistory({ tool: tool.id, title: tool.title, at: Date.now(), preview: text.slice(0, 80) });
    return packed;
  }

  async function onGenerate() {
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (tool.requiresStudent && !curStu) { toast('이 도구는 학생을 먼저 선택해야 합니다.'); return; }
    // 최소 입력 체크: 첫 textarea/text 필드 중 하나라도 비어 있으면 경고(완화).
    const firstText = (tool.fields || []).find((f) => f.type === 'textarea' || f.type === 'text');
    if (firstText && !String(values[firstText.key] || '').trim() && tool.id !== 'custom') {
      // 평어는 성취기준/수행 둘 중 하나면 OK
    }
    setBusy(true); setResult(null);
    try {
      const rendered = renderPrompt(tool, values, ctx);
      const prompt = await enrichWithTierContext(rendered);
      await runPrompt(prompt);
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  // 학생이 선택된 경우, 렌더된 프롬프트에 이 학생의 다층 지원·출발점 맥락을 덧붙인다.
  async function enrichWithTierContext(renderedPrompt) {
    if (!curStu) return renderedPrompt;
    try {
      const { text: tierText } = await buildFullStudentContext({ student: curStu, studentId: curStuId, data: curStuData, tier2Groups, semester: curSemester });
      if (!tierText || !tierText.trim()) return renderedPrompt;
      return renderedPrompt + '\n\n[참고 — 이 학생의 다층 지원·출발점 맥락]\n' + tierText;
    } catch (_) {
      return renderedPrompt;
    }
  }

  async function onRefine(instruction) {
    if (!result?.text) return;
    setBusy(true);
    try {
      const prompt = buildRefinePrompt(result.text, instruction);
      const out = await call(prompt, { system: tool.system || GEN_SYSTEM, tier: 'fast' });
      const text = String(out || '');
      setResult({ text, list: tool.output === 'list' ? parseLines(text) : null, prompt });
    } catch (e) { toast('수정 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function copy(text, msg = '복사했어요.') {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (_) { toast('복사가 막혔어요. 직접 선택해 복사하세요.'); }
  }

  // AI 결과는 교사가 직접 수정 가능 — 텍스트/리스트 모두 편집 후 복사·사용.
  function setResultText(val) { setResult((prev) => (prev ? { ...prev, text: val } : prev)); }
  function setResultLine(i, val) { setResult((prev) => (prev && prev.list ? { ...prev, list: prev.list.map((x, idx) => (idx === i ? val : x)) } : prev)); }
  function removeResultLine(i) { setResult((prev) => (prev && prev.list ? { ...prev, list: prev.list.filter((_, idx) => idx !== i) } : prev)); }
  function addResultLine() { setResult((prev) => (prev ? { ...prev, list: [...(prev.list || []), ''] } : prev)); }

  // ---- 유틸 도구 (AI 미사용, 별도 UI) --------------------------------------
  if (toolId === 'aac') {
    return <AacMakerTool onBack={backToGallery} />;
  }

  // ---- 갤러리 -------------------------------------------------------------
  if (!tool) {
    return (
      <>
        <div className="card" style={{ background: 'linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%)', borderColor: '#a5b4fc' }}>
          <div className="card-title" style={{ marginBottom: 4 }}>🤖 AI 생성기</div>
          <p style={{ fontSize: '.9rem', color: '#3730a3', margin: 0, lineHeight: 1.6 }}>
            도구를 고르고 칸을 채우면 텍스트를 자동 생성합니다. <strong>학생을 선택하면</strong> 그 학생의
            QABF·ABC·기능수준이 <strong>자동 반영</strong>돼요. 생성물은 초안이며 최종 검토는 선생님 몫입니다.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
          {GEN_TOOLS.map((t) => {
            const fast = t.tier === 'fast';
            return (
            <button key={t.id} className="card" onClick={() => openTool(t)}
              style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #e5e7eb', transition: 'box-shadow .15s', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{t.icon}</div>
                <span
                  title={fast ? '빠른 응답 — 짧은 정형 텍스트에 적합 (빠름 모델)' : '상대적으로 느림 — 추론이 많은 작업 (품질 모델)'}
                  style={{
                    flexShrink: 0, fontSize: '.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    background: fast ? '#dcfce7' : '#fef3c7', color: fast ? '#166534' : '#92400e',
                    border: '1px solid ' + (fast ? '#bbf7d0' : '#fde68a'), whiteSpace: 'nowrap',
                  }}
                >
                  {fast ? '⚡ 빠름' : '🐢 느림'}
                </span>
              </div>
              <div className="card-title" style={{ margin: '8px 0 4px' }}>{t.title}</div>
              <div style={{ fontSize: '.82rem', color: '#64748b', lineHeight: 1.5 }}>{t.desc}</div>
              {t.requiresStudent && <span className="badge badge-info" style={{ marginTop: 8, display: 'inline-block' }}>학생 필요</span>}
            </button>
            );
          })}
          {UTIL_TOOLS.map((t) => (
            <button key={t.id} className="card" onClick={() => setToolId(t.id)}
              style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #e5e7eb', transition: 'box-shadow .15s', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>{t.icon}</div>
                <span
                  title="AI를 사용하지 않는 인쇄 도구 — 이미지는 서버로 전송되지 않습니다"
                  style={{
                    flexShrink: 0, fontSize: '.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    background: '#e0f2fe', color: '#075985', border: '1px solid #bae6fd', whiteSpace: 'nowrap',
                  }}
                >
                  🖨 인쇄 도구
                </span>
              </div>
              <div className="card-title" style={{ margin: '8px 0 4px' }}>{t.title}</div>
              <div style={{ fontSize: '.82rem', color: '#64748b', lineHeight: 1.5 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">최근 생성</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {history.slice(0, 8).map((h, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '.83rem' }}>
                  <span style={{ color: '#6366f1', flexShrink: 0 }}>{h.title}</span>
                  <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.preview}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }

  // ---- 도구 실행 ----------------------------------------------------------
  const needStudentBlock = tool.requiresStudent && !curStu;

  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={backToGallery}>← 도구 목록</button>
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>{tool.icon} {tool.title}</div>
          <div style={{ fontSize: '.82rem', color: '#64748b' }}>{tool.desc}</div>
        </div>
      </div>

      {/* 학생 컨텍스트 */}
      {tool.requiresStudent && (
        <div className="card" style={{ background: '#f8fafc' }}>
          {needStudentBlock ? (
            <div>
              <div className="card-title" style={{ marginBottom: 6 }}>학생 선택 필요</div>
              {students && students.length > 0 ? (
                <select className="form-input" defaultValue="" onChange={(e) => e.target.value && selectStudent(Number(e.target.value))}>
                  <option value="" disabled>학생을 선택하세요</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.code || s.student_code}</option>)}
                </select>
              ) : (
                <p style={{ fontSize: '.85rem', color: '#64748b', margin: 0 }}>현재 학급에 학생이 없습니다. 상단에서 학급/학생을 추가하세요.</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-pri">학생 {curStu.code || curStu.student_code}</span>
              {shownCtx.length === 0
                ? <span style={{ fontSize: '.8rem', color: '#94a3b8' }}>자동 반영할 기록이 아직 없어요(QABF·ABC 입력 시 반영).</span>
                : shownCtx.map(([k, v]) => (
                    <span key={k} className="chip" title={v} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {k}: {v}
                    </span>
                  ))}
            </div>
          )}
        </div>
      )}

      {/* 입력 폼 */}
      <div className="card">
        <div className="card-title">입력</div>
        {tool.samples && tool.samples.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: '.78rem', color: '#94a3b8', flexShrink: 0 }}>예시 채우기:</span>
            {tool.samples.map((s, i) => (
              <button type="button" key={i} className="chip" style={{ cursor: 'pointer' }}
                onClick={() => applySample(s)} title="입력 칸을 예시 값으로 채웁니다">
                {s.label || `예시 ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        {(tool.fields || []).map((f) => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{f.label}</label>
            {f.type === 'textarea' && (
              <textarea className="form-textarea" rows={f.rows || 3} value={values[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)} placeholder={f.placeholder || ''} />
            )}
            {f.type === 'text' && (
              <input className="form-input" value={values[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)} placeholder={f.placeholder || ''} />
            )}
            {f.type === 'number' && (
              <input type="number" className="form-input" min={f.min} max={f.max} value={values[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)} />
            )}
            {f.type === 'select' && (
              <select className="form-input" value={values[f.key] || ''} onChange={(e) => setField(f.key, e.target.value)}>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.type === 'multiselect' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(f.options || []).map((o) => {
                  const on = Array.isArray(values[f.key]) && values[f.key].includes(o);
                  return (
                    <button type="button" key={o} className={'chip' + (on ? ' checked' : '')} onClick={() => toggleMulti(f.key, o)}
                      style={{ cursor: 'pointer', borderColor: on ? '#6366f1' : '#e5e7eb', background: on ? '#eef2ff' : '#fff', color: on ? '#3730a3' : '#475569' }}>
                      {on ? '✓ ' : ''}{o}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPrompt((s) => !s)}>
            {showPrompt ? '프롬프트 숨기기' : '🔍 프롬프트 미리보기'}
          </button>
          <button className="btn btn-pri" onClick={onGenerate} disabled={busy || needStudentBlock}>
            {busy ? '⏳ 생성 중…' : '✨ 생성하기'}
          </button>
        </div>

        {showPrompt && (
          <pre style={{ marginTop: 10, padding: 10, background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: '.78rem', whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>
            {renderPrompt(tool, values, ctx)}
            {curStu ? '\n\n[참고 — 이 학생의 다층 지원·출발점 맥락이 생성 시 자동으로 덧붙습니다]' : ''}
          </pre>
        )}
      </div>

      {/* 결과 */}
      {result && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>결과{result.list ? ` (${result.list.length})` : ''} <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8' }}>· 직접 수정 가능</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!result.list && (
                <button className="btn btn-ghost btn-sm" onClick={() => setResEdit((e) => !e)}>{resEdit ? '👁 미리보기' : '✎ 편집'}</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => copy(result.list ? result.list.join('\n') : result.text, '전체 복사했어요.')}>📋 전체 복사</button>
              <button className="btn btn-ghost btn-sm" onClick={() => copy(cleanText(result.list ? result.list.join('\n') : result.text), 'HWP 안전 텍스트로 복사했어요.')} title="보이지 않는 유니코드·스마트 문장부호를 정리해 복사">🧹 정리 복사</button>
            </div>
          </div>

          {result.list ? (
            <>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                {result.list.map((l, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <input className="form-input" value={l} onChange={(e) => setResultLine(i, e.target.value)} style={{ flex: 1, fontSize: '.9rem' }} />
                    <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => copy(l)}>복사</button>
                    <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => removeResultLine(i)} title="삭제" aria-label="줄 삭제">✕</button>
                  </li>
                ))}
              </ul>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addResultLine}>+ 줄 추가</button>
            </>
          ) : resEdit ? (
            <textarea className="form-textarea" value={result.text} onChange={(e) => setResultText(e.target.value)} style={{ marginTop: 8, minHeight: 220, lineHeight: 1.6 }} />
          ) : (
            <div style={{ marginTop: 8 }}><MarkdownView>{result.text}</MarkdownView></div>
          )}

          {/* 다듬기 */}
          <div style={{ marginTop: 12, borderTop: '1px dashed #e5e7eb', paddingTop: 10 }}>
            <div style={{ fontSize: '.78rem', color: '#94a3b8', marginBottom: 6 }}>다듬기 (다시 생성)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {REFINE_CHIPS.map((c) => (
                <button key={c} className="chip" style={{ cursor: 'pointer' }} disabled={busy} onClick={() => onRefine(c)}>{c}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: '.76rem', color: '#94a3b8', textAlign: 'center', margin: '4px 0 0' }}>
        생성물은 AI 초안입니다. IEP·BIP·평어는 반드시 교사가 검토·수정 후 사용하세요. 성취기준 코드는 NCIC에서 대조하세요.
      </p>
    </>
  );
}
