import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { useStudents } from '../../contexts/StudentContext';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';
import { splitDisability } from '../../lib/disability';
import {
  CATEGORIES, NEW_CHIPS, TOPIC_TEMPLATES, PRESETS, STUDENT_EXAMPLES, PURPOSE_RECIPES,
  AI_TIPS, AI_WARNINGS, COMPETENCIES, COMPETENCY_NOTE, CURRICULUM_ROLLOUT, ROLLOUT_NOTE,
  FIELD_TIPS, SOURCE_NOTE, chipName,
} from '../../lib/builderCatalog';
import { buildBuilderPrompt } from '../../lib/builderPrompt';

// ──────────────────────────────────────────────────────────────────────
// 수업자료 주문서 — 칩을 골라 AI 요청문을 조립한다.
// 칩·추천·가이드 데이터는 lib/builderCatalog.js, 요청문 조립은 lib/builderPrompt.js에 있다.
// (김주현 「특수교육 Prompt Studio」 V2 이식(0504) → V3 대조 반영(0919, mds/36))
// ──────────────────────────────────────────────────────────────────────

// Auto-fill student profile from currently selected student
// 중복장애("지적장애·자폐성장애" 결합값) 지원 — 각 유형을 칩에 매칭해 배열로 반환.
// 칩 이름이 저장값을 포함하거나 그 반대여도 매칭('두 가지 이상의 중복장애' ↔ '🤝 중복장애').
function findDisabilityChips(disability) {
  const items = CATEGORIES[0].groups[0].items; // 장애 chips
  const chips = splitDisability(disability)
    .map((d) => items.find((it) => {
      const name = chipName(it);
      return name.includes(d) || d.includes(name);
    }) || null)
    .filter(Boolean);
  return [...new Set(chips)];
}

// 학교급(level: 초등·중등·고등) + 세부 학년(grade)이 있으면 그것으로, 없으면 비식별 요약에서 추정.
function inferGradeChip(student) {
  const level = student?.level || '';
  const grade = parseInt(student?.grade, 10);
  if (level === '초등' && grade >= 1) {
    if (grade <= 2) return '1~2학년';
    if (grade <= 4) return '3~4학년';
    return '5~6학년';
  }
  if (level === '중등') return '중학교';
  if (level === '고등') return '고등학교';
  if (level === '유치원') return '🧡 유치원';
  const note = student?.note || '';
  if (/유치|유아/.test(note)) return '🧡 유치원';
  const m = note.match(/(?:초|초등)\s*(\d+)\s*학년/);
  if (m) {
    const g = parseInt(m[1], 10);
    if (g <= 2) return '1~2학년';
    if (g <= 4) return '3~4학년';
    if (g <= 6) return '5~6학년';
  }
  if (/중\s*(\d+)|중학/.test(note)) return '중학교';
  if (/고\s*(\d+)|고등|고교/.test(note)) return '고등학교';
  return null; // 초등인데 학년이 없으면 사용자 선택에 맡김
}

// 요청문에 넣을 학생 맥락 — 코드(익명)와 비식별 요약·강점·어려움만.
function studentContext(stu) {
  if (!stu) return null;
  const parts = [];
  if (stu.note) parts.push(String(stu.note).trim());
  if (stu.strengths) parts.push(`강점·관심사: ${String(stu.strengths).trim()}`);
  if (stu.difficulties) parts.push(`어려움: ${String(stu.difficulties).trim()}`);
  return { code: stu.code, note: parts.join(' / ') };
}

function NewBadge({ on }) {
  return <sup style={{ fontSize: '.55rem', fontWeight: 800, color: on ? '#ffe3e3' : '#ef476f', marginLeft: 3, letterSpacing: '.02em' }}>NEW</sup>;
}

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────
export default function BuilderPage() {
  const { callDetailed, status } = useLLM();
  const { curStu } = useStudents();
  const toast = useToast();
  const [tab, setTab] = useState('builder'); // 'builder' | 'presets' | 'guide'
  const [selected, setSelected] = useState({}); // { cat: Set(item) }
  const [topic, setTopic] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState(null);
  // Track which chips were auto-set by student selection (so user knows which
  // came from student vs. their own choice).
  const [autoSet, setAutoSet] = useState({ 장애: null, 학년군: null, 학급환경: null });
  const lastStuIdRef = useRef(null);

  // Sync student profile chips whenever the selected student changes.
  // Replaces the previous student's auto-selected chips (장애/학년군/학급환경)
  // but keeps any chip the user manually changed in other categories.
  useEffect(() => {
    if (!curStu) {
      lastStuIdRef.current = null;
      setAutoSet({ 장애: null, 학년군: null, 학급환경: null });
      return;
    }
    if (lastStuIdRef.current === curStu.id) return;
    lastStuIdRef.current = curStu.id;

    const disChips = findDisabilityChips(curStu.disability); // 중복장애면 칩 2개
    const gradeChip = inferGradeChip(curStu);
    const envChip = '🏠 특수학급'; // default for special-ed platform

    setSelected((prev) => {
      const next = { ...prev };
      // Replace 장애 with this student's value
      if (disChips.length) next['장애'] = new Set(disChips);
      else delete next['장애'];
      // Replace 학년군 if we can infer (otherwise keep user's choice)
      if (gradeChip) next['학년군'] = new Set([gradeChip]);
      // Default 학급환경 only if user hasn't picked anything
      if (!prev['학급환경'] || prev['학급환경'].size === 0) {
        next['학급환경'] = new Set([envChip]);
      }
      return next;
    });
    setAutoSet({ 장애: disChips.length ? disChips : null, 학년군: gradeChip, 학급환경: envChip });
  }, [curStu]);

  function toggle(cat, item) {
    setSelected((prev) => {
      const set = new Set(prev[cat] || []);
      if (set.has(item)) set.delete(item); else set.add(item);
      // For "결과물" (single-select), clear others first
      if (cat === '결과물' && !prev[cat]?.has?.(item)) {
        // Allow only one selection
        return { ...prev, [cat]: new Set([item]) };
      }
      return { ...prev, [cat]: set };
    });
  }

  function isSelected(cat, item) {
    return selected[cat]?.has(item) || false;
  }

  function appendTopic(text) {
    setTopic((cur) => cur ? cur + '\n' + text : text);
  }

  function reset() {
    if (Object.keys(selected).length === 0 && !topic) return;
    if (!window.confirm('모두 지우고 새로 시작할까요?')) return;
    setSelected({});
    setTopic('');
    setAiResult('');
    setAiMeta(null);
  }

  function buildPrompt() {
    const sels = {};
    Object.entries(selected).forEach(([cat, set]) => {
      if (set instanceof Set && set.size) sels[cat] = [...set];
    });
    if (!Object.keys(sels).length && !topic.trim()) return '';
    return buildBuilderPrompt({ sels, topic, student: studentContext(curStu) });
  }

  async function runAI() {
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    const p = buildPrompt();
    if (!p) { toast('칩을 선택하거나 수업 내용을 입력해주세요.'); return; }
    setAiBusy(true); setAiResult(''); setAiMeta(null);
    try {
      const r = await callDetailed(p);
      setAiResult(r.content);
      setAiMeta({ finish_reason: r.finish_reason, usage: r.usage });
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  function applyPreset(preset) {
    const next = {};
    Object.entries(preset.presets || {}).forEach(([cat, items]) => {
      next[cat] = new Set(items);
    });
    setSelected(next);
    setTopic(preset.topic || '');
    setTab('builder');
    toast(`"${preset.title}" 적용됨 — 검토 후 사용하세요.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const selectedCount = Object.values(selected).reduce((s, set) => s + (set instanceof Set ? set.size : 0), 0);
  const requiredOk = selected['결과물'] && selected['결과물'].size > 0;

  return (
    <>
      {/* Tab nav */}
      <div className="card" style={{ padding: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { id: 'builder', label: '🛠 프롬프트 빌더', desc: '칩으로 조립' },
            { id: 'presets', label: `⭐ 추천 ${PRESETS.length}선`, desc: '완성형 프롬프트' },
            { id: 'guide', label: '📖 가이드', desc: 'Quick Start · 핵심역량 · 학생 예시 · 팁' },
          ].map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, minWidth: 140, padding: '10px 14px', borderRadius: 8,
                  border: '1px solid ' + (on ? 'var(--pri)' : 'var(--border)'),
                  background: on ? 'var(--pri)' : '#fff',
                  color: on ? '#fff' : 'var(--text)',
                  cursor: 'pointer', fontWeight: on ? 700 : 500,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: '.15s',
                }}
              >
                <span>{t.label}</span>
                <span style={{ fontSize: '.72rem', opacity: 0.8 }}>{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'builder' && (
        <BuilderTab
          curStu={curStu}
          autoSet={autoSet}
          selected={selected}
          isSelected={isSelected}
          toggle={toggle}
          topic={topic}
          setTopic={setTopic}
          appendTopic={appendTopic}
          reset={reset}
          selectedCount={selectedCount}
          requiredOk={requiredOk}
          buildPrompt={buildPrompt}
          runAI={runAI}
          aiBusy={aiBusy}
          aiResult={aiResult}
          aiMeta={aiMeta}
        />
      )}

      {tab === 'presets' && <PresetsTab onApply={applyPreset} />}

      {tab === 'guide' && <GuideTab onApplyExample={applyPreset} />}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Builder tab
// ──────────────────────────────────────────────────────────────────────
function BuilderTab({ curStu, autoSet, selected, isSelected, toggle, topic, setTopic, appendTopic, reset, selectedCount, requiredOk, buildPrompt, runAI, aiBusy, aiResult, aiMeta }) {
  const promptText = useMemo(() => buildPrompt(), [selected, topic, buildPrompt]);
  const [showPreview, setShowPreview] = useState(false);

  // Quick visibility: which auto-selected chips are still active
  // (장애는 중복장애 지원으로 배열일 수 있음 → 값 단위로 펼쳐 확인)
  const autoActive = autoSet
    ? Object.entries(autoSet).flatMap(([cat, val]) =>
        (Array.isArray(val) ? val : [val])
          .filter((v) => v && selected[cat]?.has(v))
          .map((v) => [cat, v]))
    : [];

  function onTopicKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runAI();
    }
  }

  return (
    <>
      {/* Student auto-fill notice */}
      {curStu && autoActive.length > 0 && (
        <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.84rem', color: 'var(--pri)', fontWeight: 700 }}>
              📌 학생 정보로 자동 선택됨 · <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4 }}>{curStu.code}</code>
            </span>
            <span style={{ fontSize: '.78rem', color: 'var(--sub)' }}>
              {autoActive.map(([, val]) => chipName(val)).join(' · ')}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '.74rem', color: 'var(--muted)' }}>
              자유롭게 변경 가능
            </span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="card" style={{ background: requiredOk ? '#e7f7ee' : '#fff7e6', borderColor: requiredOk ? '#9be0b9' : '#f3c47b' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: '.9rem' }}>
            {requiredOk
              ? <span style={{ color: '#0a7d4e', fontWeight: 700 }}>✅ 필수 항목 OK · 선택 {selectedCount}개</span>
              : <span style={{ color: '#a76200', fontWeight: 700 }}>⚠ 1번 결과물 형태(★ 필수)를 선택하세요 · 선택 {selectedCount}개</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>1번만 골라도 만들 수 있어요. 수업 자료는 2번·3번을 채우면 훨씬 맞춤형이 됩니다.</span>
            <button className="btn btn-ghost btn-sm" onClick={reset}>🔄 초기화</button>
          </div>
        </div>
      </div>

      {/* Categories */}
      {CATEGORIES.map((cat) => (
        <div key={cat.id} className="card">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>{cat.title}</div>
            {cat.required && (
              <span style={{ fontSize: '.74rem', color: cat.required.includes('필수') ? '#ef476f' : 'var(--muted)', fontWeight: 600 }}>
                {cat.required}
              </span>
            )}
          </div>
          {cat.groups.map((g, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>{g.sub}</div>
              <div className="qchip-area">
                {g.items.map((it) => {
                  const on = isSelected(g.cat, it);
                  return (
                    <span
                      key={it}
                      className={'qchip' + (on ? ' on' : '')}
                      onClick={() => toggle(g.cat, it)}
                    >{it}{NEW_CHIPS.has(it) && <NewBadge on={on} />}</span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* 2-B 수업 주제 — 입력 보조 */}
      <div className="card">
        <div className="card-title">📝 2-B 수업 주제 & 학습 내용 <span style={{ fontSize: '.74rem', color: '#ef476f', fontWeight: 600 }}>★★ 핵심 — 자세할수록 맞춤형!</span></div>
        <div className="card-subtitle">아래 칩을 클릭하면 입력창에 기본 틀이 자동 추가됩니다. 직접 입력도 가능합니다.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--warn-l)', border: '1px solid #fde7b8', borderRadius: 8, fontSize: '.8rem', color: '#92400e', margin: '8px 0 4px' }}>
          <span>🔒</span>
          <span><b>개인정보 보호:</b> 학생 이름·생년월일·학번을 적지 마세요. 학생은 코드{curStu?.code ? `(${curStu.code})` : ''}로만 요청문에 들어갑니다.</span>
        </div>
        <div className="qchip-area" style={{ marginTop: 10 }}>
          {TOPIC_TEMPLATES.map((t) => (
            <span key={t.label} className="qchip" onClick={() => appendTopic(t.text)}>{t.label}</span>
          ))}
        </div>
        <textarea
          className="form-textarea"
          rows={6}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={onTopicKey}
          placeholder="예: 손씻기 6단계&#10;핵심 어휘: 비누·물·거품·헹구기·말리기&#10;현재 수준: 1~3단계는 가능, 4~6단계는 신체 촉진 필요&#10;학생 관심사: 공룡 (공룡 그림으로 동기 유발)"
        />
        <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>Ctrl+Enter(Mac은 ⌘+Enter)로 바로 AI 호출</div>
      </div>

      {/* 프롬프트 미리보기 + AI 호출 */}
      <div className="card">
        <div className="card-title">🚀 프롬프트 생성 & AI 호출</div>
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? '▲ 미리보기 숨기기' : '▼ 프롬프트 미리보기'}
          </button>
        </div>
        {showPreview && promptText && (
          <pre style={{ background: 'var(--surface2)', padding: 14, borderRadius: 8, fontSize: '.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', lineHeight: 1.65, maxHeight: 360, overflow: 'auto', marginBottom: 12 }}>
            {promptText}
          </pre>
        )}
        <AIActionBar
          prompt={promptText}
          onCallAI={runAI}
          busy={aiBusy}
          callLabel="🤖 AI에 직접 호출"
          disabled={!promptText}
        />
        {(aiResult || aiBusy) && <PromptResultBlock prompt={promptText} output={aiResult} busy={aiBusy} meta={aiMeta} />}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Presets tab — 추천 프롬프트
// ──────────────────────────────────────────────────────────────────────
const PRESET_FILTERS = [
  { v: 'all', l: '전체' }, { v: '웹 앱', l: '🖥 웹 앱' }, { v: '문서', l: '📄 문서' }, { v: '시각', l: '🖼 시각 지원' }, { v: 'pe', l: '🏃 특수체육' },
];

function PresetsTab({ onApply }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? PRESETS
    : filter === 'pe' ? PRESETS.filter((p) => p.pe)
      : PRESETS.filter((p) => p.tag === filter);

  return (
    <>
      <div className="card" style={{
        background: 'linear-gradient(135deg, #4f6bed 0%, #9c36b5 100%)',
        color: '#fff', border: 'none',
      }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 6 }}>⭐ 특수교육 Best Prompts {PRESETS.length}선</h2>
        <p style={{ fontSize: '.9rem', opacity: 0.95 }}>현장 특수교사가 자주 쓰는 완성형 프롬프트. 카드 클릭 시 빌더에 자동 적용됩니다. 특수체육 5종·기능적 수학·TEACCH·전환평가는 0919에 새로 들어왔어요.</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {PRESET_FILTERS.map((f) => (
            <span key={f.v} className={'qchip' + (filter === f.v ? ' on' : '')} onClick={() => setFilter(f.v)}>{f.l}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => onApply(p)}
              style={{
                padding: '14px 16px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
                transition: '.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pri)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '1.4rem' }}>{p.icon}</span>
                <span style={{ background: 'var(--pri-soft)', color: 'var(--pri)', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>#{p.id}</span>
                <span style={{ background: 'var(--surface2)', color: 'var(--sub)', fontSize: '.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>{p.tag}</span>
                {p.id > 20 && <span style={{ background: '#fde7e7', color: '#c92a2a', fontSize: '.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 99 }}>NEW</span>}
              </div>
              <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6, lineHeight: 1.4 }}>{p.title}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                칩 {Object.values(p.presets).reduce((s, arr) => s + arr.length, 0)}개 + 주제 자동 입력
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Guide tab — Quick Start, 6대 핵심역량, 입력 칸 활용법, 학생 예시, 목적별 추천, AI 팁, 주의사항
// ──────────────────────────────────────────────────────────────────────
function GuideTab({ onApplyExample }) {
  return (
    <>
      <div className="card" style={{
        background: 'linear-gradient(135deg, #12b886 0%, #0d7d4e 100%)',
        color: '#fff', border: 'none',
      }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 6 }}>📖 완전 활용 가이드</h2>
        <p style={{ fontSize: '.9rem', opacity: 0.95 }}>처음 쓰시는 분도, 바쁜 선생님도 5분이면 수업 자료 완성 · 2022 개정 특수교육 6대 핵심역량 반영</p>
      </div>

      {/* Quick Start */}
      <div className="card">
        <div className="card-title">🚀 Quick Start — 3단계</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {[
            { n: 1, t: '결과물 형태 선택 (1번)', d: '무엇을 만들 건지 먼저 정해요. 웹 게임? 수업 지도안? 활동지? AAC 보드? 이것만 선택해도 생성 가능!' },
            { n: 2, t: '학생 정보 + 수업 내용 입력', d: '학생을 고르면 0번은 자동으로 채워져요. 2-A 교육과정·핵심역량, 2-B 수업 내용을 채우세요. 주제만 간단히 적어도 OK. 예: "손씻기 6단계"' },
            { n: 3, t: '생성 & 붙여넣기', d: '"AI에 직접 호출" 버튼(또는 Ctrl+Enter)을 누르거나, 프롬프트를 복사해서 ChatGPT/Claude/Gemini에 붙여넣기' },
          ].map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, borderLeft: '4px solid var(--pri)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--pri)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{s.n}</div>
              <div>
                <strong style={{ color: 'var(--pri)' }}>{s.t}</strong>
                <p style={{ fontSize: '.86rem', color: 'var(--sub)', marginTop: 4, lineHeight: 1.6 }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6대 핵심역량 */}
      <div className="card">
        <div className="card-title">🇰🇷 2022 개정 특수교육 6대 핵심역량 <NewBadge /></div>
        <div className="card-subtitle">교과계획서·IEP 작성 시 반영해야 하는 역량입니다. 2-A에서 고르면 요청문에 들어갑니다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
          {COMPETENCIES.map((c) => (
            <div key={c.name} style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{c.icon} {c.name}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--sub)', marginTop: 2 }}>{c.desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '.8rem', color: 'var(--sub)', marginTop: 10, lineHeight: 1.6 }}>💡 {COMPETENCY_NOTE}</p>
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--pri-soft)', borderRadius: 8, fontSize: '.82rem' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📅 2022 개정 특수교육 교육과정 연차 적용 (교육부 고시 제2022-34호)</div>
          <ul style={{ paddingLeft: 18, lineHeight: 1.7, color: 'var(--sub)' }}>
            {CURRICULUM_ROLLOUT.map((r) => (
              <li key={r.when} style={{ fontWeight: r.current ? 700 : 400, color: r.current ? 'var(--text)' : undefined }}>
                {r.when} — {r.who}{r.current ? ' (현재)' : ''}
              </li>
            ))}
          </ul>
          <div style={{ color: 'var(--muted)', marginTop: 4 }}>{ROLLOUT_NOTE}</div>
        </div>
      </div>

      {/* 각 입력 칸 활용법 */}
      <div className="card">
        <div className="card-title">📋 각 입력 칸 활용법</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {FIELD_TIPS.map((t) => (
            <div key={t.n} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ minWidth: 34, height: 34, padding: '0 6px', borderRadius: 8, background: 'var(--pri)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.8rem', flexShrink: 0 }}>{t.n}</div>
              <div>
                <strong style={{ fontSize: '.88rem' }}>{t.title}</strong>
                <p style={{ fontSize: '.82rem', color: 'var(--sub)', marginTop: 2, lineHeight: 1.6 }}>{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 학생 유형별 예시 */}
      <div className="card">
        <div className="card-title">👨‍🎓 학생 유형별 예시 {STUDENT_EXAMPLES.length}가지</div>
        <div className="card-subtitle">카드 클릭 시 빌더에 해당 예시가 자동 적용됩니다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
          {STUDENT_EXAMPLES.map((ex, i) => (
            <div
              key={i}
              onClick={() => onApplyExample(ex.preset)}
              style={{
                padding: 14, background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, cursor: 'pointer', transition: '.15s',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--pri)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ fontSize: '2rem', flexShrink: 0 }}>{ex.icon}</div>
              <div>
                <div style={{ fontSize: '.92rem', fontWeight: 700 }}>{ex.title}</div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>클릭하여 적용</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 목적별 추천 조합 */}
      <div className="card">
        <div className="card-title">🎯 목적별 추천 조합</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginTop: 12 }}>
          {PURPOSE_RECIPES.map((r, i) => (
            <div key={i} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '1.3rem' }}>{r.icon}</span>
                <strong style={{ fontSize: '.92rem' }}>{r.title}</strong>
              </div>
              <ol style={{ paddingLeft: 20, fontSize: '.82rem', color: 'var(--sub)', lineHeight: 1.7 }}>
                {r.steps.map((s, si) => <li key={si}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* AI 활용 팁 */}
      <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)' }}>
        <div className="card-title">💡 AI 200% 활용 팁</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {AI_TIPS.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 10, background: '#fff', borderRadius: 8 }}>
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{t.icon}</span>
              <div>
                <strong style={{ color: 'var(--pri)', fontSize: '.88rem' }}>{t.title}</strong>
                <p style={{ fontSize: '.82rem', color: 'var(--sub)', marginTop: 2, lineHeight: 1.6 }}>{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 주의사항 */}
      <div className="card" style={{ background: 'var(--warn-l)', borderColor: '#fde7b8' }}>
        <div className="card-title" style={{ color: '#b45309' }}>⚠ 반드시 알아두세요</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {AI_WARNINGS.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 10, background: '#fff', borderRadius: 8 }}>
              <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{w.icon}</span>
              <div>
                <strong style={{ color: '#b45309', fontSize: '.88rem' }}>{w.title}</strong>
                <p style={{ fontSize: '.82rem', color: '#92400e', marginTop: 2, lineHeight: 1.6 }}>{w.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: '.74rem', color: 'var(--muted)', lineHeight: 1.6, padding: '4px 6px' }}>{SOURCE_NOTE}</p>
    </>
  );
}
