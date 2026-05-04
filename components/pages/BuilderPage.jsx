import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';

const CATEGORIES = [
  { title: '학생 프로파일', cat: '장애', items: ['지적장애', '자폐(ASD)', '지체장애', '정서행동', 'ADHD', '청각장애', '시각장애', '학습장애', '발달지연', '중복중증'] },
  { title: '기능 수준', cat: '수준', items: ['입문', '기초', '중급', '기능적', '심화'] },
  { title: '결과물 형태 ⭐ 필수', cat: '결과물', items: ['학습게임 HTML', '그림퀴즈 HTML', 'AAC보드 HTML', '사회적이야기', '시각일과표', '감정조절도구 HTML', '토큰경제 HTML', '매칭게임 HTML', '수개념 HTML', '수업지도안', '수정활동지', 'IEP목표초안', '행동지원계획', '가정연계통신문', 'PECS카드', '시각규칙판'] },
  { title: '교육과정', cat: '교육과정', items: ['기본', '공통', '특수학교'] },
  { title: '수업 수정 / 설계', cat: '수정', items: ['UDL', '난이도 낮춤', '시각 지원 추가', '단계별 분해', '협력교수'] },
  { title: 'IEP 목표 / 평가', cat: 'IEP', items: ['장기목표', '단기목표', '평가 도구', '루브릭'] },
  { title: 'EBP 교수법', cat: 'EBP', items: ['DTT', '비디오모델링', '사회적 이야기', '과제분석', '자기관리', 'PMI'] },
  { title: '접근성', cat: '접근성', items: ['큰 글씨', '음성 지원', '색맹 친화', '제스처', 'AAC'] },
];

export default function BuilderPage() {
  const { callDetailed, status } = useLLM();
  const toast = useToast();
  const [selected, setSelected] = useState({}); // { cat: Set(items) }
  const [topic, setTopic] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiMeta, setAiMeta] = useState(null);

  function toggle(cat, item) {
    setSelected((prev) => {
      const set = new Set(prev[cat] || []);
      if (set.has(item)) set.delete(item); else set.add(item);
      return { ...prev, [cat]: set };
    });
  }

  function buildPrompt() {
    let p = '당신은 특수교육 전문가이자 맞춤형 수업자료 제작 AI입니다.\n아래 조건에 맞는 수업 자료를 제작해 주세요.\n\n';
    Object.entries(selected).forEach(([cat, set]) => {
      if (!set || set.size === 0) return;
      p += `## ${cat}\n${[...set].join(', ')}\n\n`;
    });
    if (topic.trim()) p += `## 수업 주제 / 학습 내용\n${topic.trim()}\n`;
    p += '\n학생의 기능 수준에 맞게 어휘 수준, 문장 길이, 시각 지원 정도를 조절해 주세요. 결과물에 HTML이 포함되어 있으면 단일 파일 HTML로 제작해주세요.';
    return p;
  }

  function generate() {
    setOutput(buildPrompt());
  }

  async function runAI() {
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setBusy(true); setAiResult(''); setAiMeta(null);
    try {
      // No explicit max_tokens — let user's LLM settings preference apply
      // (default 8000, configurable up to 65536). Builder produces complex
      // long-form structured output (HTML, tables, IEP, social stories).
      const r = await callDetailed(buildPrompt());
      setAiResult(r.content);
      setAiMeta({ finish_reason: r.finish_reason, usage: r.usage });
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">🤖 AI 어시스턴트 — 칩을 눌러 조건을 설정하세요</div>
        <div className="card-subtitle">선택한 칩을 바탕으로 외부 AI(ChatGPT/Claude/Gemini) 또는 LM Studio에 보낼 프롬프트를 자동 조립합니다.</div>
        {CATEGORIES.map((c) => (
          <div key={c.cat} style={{ marginTop: 14 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>{c.title}</div>
            <div className="qchip-area">
              {c.items.map((i) => {
                const on = (selected[c.cat] || new Set()).has(i);
                return <span key={i} className={'qchip' + (on ? ' on' : '')} onClick={() => toggle(c.cat, i)}>{i}</span>;
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">📝 수업 내용 입력</div>
        <textarea className="form-textarea" rows={4} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: 1~5까지 수 세기&#10;핵심 어휘: 하나~다섯&#10;현재 수준: 3까지 손가락으로 세기 가능&#10;학생 관심사: 공룡" />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={generate}>📋 프롬프트 미리보기</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <AIActionBar prompt={buildPrompt()} onCallAI={runAI} busy={busy} callLabel="🤖 AI에 직접 호출" />
        </div>
        {output && (
          <textarea className="form-textarea" rows={8} value={output} readOnly style={{ marginTop: 10, background: 'var(--surface2)', fontFamily: 'monospace' }} />
        )}
        {(aiResult || busy) && <PromptResultBlock prompt={buildPrompt()} output={aiResult} busy={busy} meta={aiMeta} />}
      </div>
    </>
  );
}
