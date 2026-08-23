import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { saveQABF as apiSaveQABF } from '../../lib/api/students';
import QabfFnChart from '../ui/QabfFnChart';
import AIActionBar from '../ui/AIActionBar';
import PromptResultBlock from '../modals/PromptResultBlock';
import { downloadQabfExcel } from '../../lib/utils/exportQabf';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import {
  QABF_QUESTIONS as QUESTIONS,
  QABF_FUNCTION_LABELS as FUNCTION_LABELS,
  QABF_FUNCTION_COLORS as FUNCTION_COLORS,
  QABF_SCALE as SCALE,
  QABF_SCALE_LABELS as SCALE_LABELS,
  QABF_SHORT_LABELS,
  QABF_NA,
  QABF_NA_LABEL,
  QABF_QUESTION_PREFIX,
  QABF_INSTRUCTION,
  QABF_CITATION,
  qabfAnswered,
  qabfScores,
} from '../../lib/qabf';

export default function QabfPage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const toast = useToast();
  const { call, callVisionDetailed, status: llmStatus } = useLLM();
  const [responses, setResponses] = useState(new Array(25).fill(-1));
  const [busy, setBusy] = useState(false);
  // 0819 피드백: 저장 성공 후 "다음 단계(중재계획)로 이동" 배너 — 응답을 다시 수정하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([responses]);
  // 0719: 기존 QABF 자료 불러오기 (사진 AI 판독 / 응답 붙여넣기)
  const [impBusy, setImpBusy] = useState(false);
  const [impPaste, setImpPaste] = useState('');

  // AI 기능 해석
  const [aiOutput, setAiOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // 작성 중 응답 자동 임시저장(학생별, 브라우저 세션). 저장 전에 페이지를 떠나도 복원된다.
  const qabfDraftKey = curStuId ? `qabfDraft:${curStuId}` : null;

  useEffect(() => {
    if (!curStuId) return;
    // 1) 임시저장(draft)이 있으면 우선 복원
    try {
      const raw = qabfDraftKey && sessionStorage.getItem(qabfDraftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d) && d.length === 25) { setResponses(d); return; }
      }
    } catch (_) { /* ignore */ }
    // 2) 없으면 서버 저장값
    if (curStuData?.qabf && Array.isArray(curStuData.qabf)) {
      setResponses(curStuData.qabf.length === 25 ? curStuData.qabf : new Array(25).fill(-1));
    } else {
      setResponses(new Array(25).fill(-1));
    }
  }, [curStuId, curStuData?.qabf, qabfDraftKey]);

  // 서버 저장값과 다른 미저장 응답만 draft로 보관 (저장/초기 상태면 draft 제거).
  useEffect(() => {
    if (!qabfDraftKey) return;
    try {
      const saved = (curStuData?.qabf && curStuData.qabf.length === 25) ? curStuData.qabf : new Array(25).fill(-1);
      const allEmpty = responses.every((v) => v === -1);
      const sameAsSaved = JSON.stringify(responses) === JSON.stringify(saved);
      if (allEmpty || sameAsSaved) sessionStorage.removeItem(qabfDraftKey);
      else sessionStorage.setItem(qabfDraftKey, JSON.stringify(responses));
    } catch (_) { /* ignore */ }
  }, [responses, qabfDraftKey, curStuData?.qabf]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  // 저장된 QABF가 도착하기 전에는 문항·붙여넣기 UI를 띄우지 않는다.
  // (로드 중 '적용'을 누르면 뒤늦게 온 서버 응답이 덮어써 아무 일도 안 일어난 것처럼 보였음)
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="QABF 응답을 불러오는 중…" /></>;

  // Calculate per-function totals (심각도 = 점수 합계)
  const totals = { attention: 0, escape: 0, sensory: 0, physical: 0, tangible: 0 };
  responses.forEach((v, i) => {
    if (v >= 0) totals[QUESTIONS[i].f] += v;
  });
  const maxTotal = Math.max(...Object.values(totals));
  const topFns = maxTotal > 0 ? Object.keys(totals).filter((f) => totals[f] === maxTotal) : [];

  function setVal(i, v) {
    setResponses((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      await apiSaveQABF(curStuId, responses);
      updateStudentData(curStuId, (cur) => ({ ...cur, qabf: responses }));
      try { if (qabfDraftKey) sessionStorage.removeItem(qabfDraftKey); } catch (_) { /* ignore */ }
      toast('QABF 저장 완료', 'success');
      markSaved(); hintNextStep('bip'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const completed = responses.filter(qabfAnswered).length; // X(해당 없음)도 응답으로 집계
  // 목표행동 — BIP의 표적행동 조작적 정의를 그대로 인용(문서 지시문: 한 가지 목표행동을 구체적으로).
  const targetBeh = String(curStuData?.bip?.opdef || '').trim();

  // ── 0719: 기존 QABF 자료 불러오기 ─────────────────────────────
  // (a) 25개 응답 붙여넣기 — "0 1 2 3 X ..." / 쉼표·줄바꿈 구분 모두 허용. AI 불필요.
  function applyPastedResponses() {
    const toks = String(impPaste || '').toUpperCase().match(/[0-3X]/g) || [];
    if (toks.length < 25) { toast(`응답을 25개 찾지 못했어요(현재 ${toks.length}개). 0~3 또는 X를 25개 붙여넣어 주세요.`); return; }
    const arr = toks.slice(0, 25).map((t) => (t === 'X' ? QABF_NA : parseInt(t, 10)));
    setResponses(arr);
    setImpPaste('');
    toast('25개 응답을 적용했어요. 확인 후 저장하세요.', 'success');
  }
  // (b) 작성된 QABF 사진(이미지) → AI 비전 판독.
  async function onImportImage(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    if (llmStatus !== 'on') { toast('사진 판독은 AI 연결이 필요해요. 아래 "응답 붙여넣기"는 AI 없이 사용할 수 있어요.'); return; }
    setImpBusy(true);
    try {
      const images = await Promise.all(files.map((f) => new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(rd.result);
        rd.onerror = reject;
        rd.readAsDataURL(f);
      })));
      const prompt =
        '/no_think\n다음 이미지는 작성 완료된 QABF(행동기능설문지) 25문항 응답지다. 각 문항(1~25번)에 표시된 응답을 읽어라.\n' +
        '- 응답 값: 0(전혀 없음), 1(드물게 나타남), 2(때때로 나타남), 3(자주 나타남), "X"(해당 없음). 알아볼 수 없거나 빈 문항은 -1.\n' +
        '반드시 JSON만 출력: {"responses":[25개 값 배열, 예: 0,1,"X",3,...]}';
      const r = await callVisionDetailed(prompt, images, { temperature: 0.1, tier: 'fast', label: 'QABF 사진 판독' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('응답 JSON을 찾지 못했어요.');
      const j = JSON.parse(m[0].replace(/```(?:json)?/gi, '').replace(/,\s*([}\]])/g, '$1'));
      const raw = Array.isArray(j.responses) ? j.responses : [];
      if (raw.length < 20) throw new Error('문항을 충분히 읽지 못했어요. 더 선명한 사진으로 시도해 주세요.');
      const arr = new Array(25).fill(-1).map((_, i) => {
        const v = raw[i];
        if (v === 'X' || v === 'x') return QABF_NA;
        const n = parseInt(v, 10);
        return n >= 0 && n <= 3 ? n : -1;
      });
      setResponses(arr);
      toast(`사진에서 ${arr.filter(qabfAnswered).length}개 응답을 읽었어요. 문항별로 확인 후 저장하세요.`, 'success');
    } catch (err) {
      toast('사진 판독 실패: ' + err.message);
    } finally {
      setImpBusy(false);
    }
  }

  // QABF 기능/심각도 프로필을 비식별 텍스트로 정리해 AI 해석 프롬프트를 만든다.
  // (학생 이름 등 PII는 절대 포함하지 않고, 학생 코드만 사용한다.)
  function buildInterpretPrompt() {
    const { func, sev } = qabfScores(responses);
    const profile = QABF_SHORT_LABELS
      .map((label, i) => `- ${label}: 기능 ${func[i]}/5, 심각도 ${sev[i]}/15`)
      .join('\n');
    return `당신은 QABF(행동기능설문지)를 해석하는 PBS(긍정적 행동지원) 컨설턴트입니다.

## 대상 (비식별)
- 학생 코드: ${curStu?.code || '미상'}
- QABF 진행: ${completed}/25 문항 응답

## QABF 기능 프로필 (5개 기능)
기능 = 0점 초과 응답 문항 수(0~5), 심각도 = 점수 합(0~15)
${profile}

## 해석 요구
- 위 프로필을 근거로 가장 가능성이 높은 행동의 기능(관심/회피/감각·자동/신체적/강화물 획득)을 1~2개 제시하고 그 근거를 설명
- 기능별 점수가 시사하는 바를 교사가 이해하기 쉽게 풀이
- 해당 기능에 부합하는 PBS 기반 중재 방향 2~3가지 (예방·교수·강화·후속결과 차원)
- 한국어로, 특수교사가 현장에서 바로 참고할 수 있게 작성`;
  }

  async function runInterpret() {
    if (llmStatus !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    if (completed === 0) { toast('먼저 QABF 문항에 응답해주세요.'); return; }
    setAiBusy(true); setAiOutput('');
    try {
      const reply = await call(buildInterpretPrompt(), { tier: 'quality', label: 'QABF 기능 해석' });
      setAiOutput(reply);
    } catch (e) {
      toast('AI 호출 실패: ' + e.message, 'error');
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <StuHero />
      <div className="card" data-tour="qb-intro">
        <div className="card-title">📊 QABF 척도 (Questions About Behavioral Function · 행동기능설문지)</div>
        <div className="card-subtitle">
          공식 QABF 25문항 — <strong>0 전혀 없음 ~ 3 자주 나타남</strong> 4점 척도 + <strong>X 해당 없음</strong>(관찰 기회가 없던 문항)으로 행동의 기능을 정량화합니다. 진행: <strong>{completed}/25</strong>
          <span style={{ color: 'var(--muted)' }}> · {QABF_CITATION}</span>
        </div>
        {/* 2026-08 최신화: 문서 지시문 반영 — 목표행동을 먼저 구체적으로 정하도록 안내 */}
        <div style={{ fontSize: '.8rem', color: 'var(--sub)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginTop: 10, lineHeight: 1.6 }}>
          {QABF_INSTRUCTION}
          {targetBeh && <div style={{ marginTop: 6, color: 'var(--pri-d)', fontWeight: 700 }}>🎯 목표행동: {targetBeh}</div>}
          {!targetBeh && <div style={{ marginTop: 6, color: '#b45309' }}>💡 관찰(ABC) 기록의 행동(B)을 참고해 <strong>한 가지 행동</strong>을 마음에 정하고 평정하세요. 이후 중재계획(BIP)에서 “표적행동 조작적 정의”를 적으면 여기에 자동 표시됩니다.</div>}
        </div>
        <div className="qabf-results" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
          {Object.keys(totals).map((f) => {
            const isTop = topFns.includes(f);
            return (
              <div key={f} style={{ background: isTop ? FUNCTION_COLORS[f] + '1a' : 'var(--surface2)', padding: 10, borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${FUNCTION_COLORS[f]}`, outline: isTop ? `2px solid ${FUNCTION_COLORS[f]}` : 'none' }}>
                <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{FUNCTION_LABELS[f]}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: FUNCTION_COLORS[f] }}>{totals[f]}</div>
                <div style={{ fontSize: '.66rem', color: 'var(--muted)' }}>/15</div>
              </div>
            );
          })}
        </div>
        {topFns.length > 0 && (
          <div style={{ marginTop: 10, fontSize: '.82rem' }}>
            추정 주요 기능: {topFns.map((f) => <strong key={f} style={{ color: FUNCTION_COLORS[f], marginRight: 8 }}>{FUNCTION_LABELS[f]}</strong>)}
            <span style={{ color: 'var(--muted)' }}>(점수가 가장 높은 기능)</span>
          </div>
        )}
      </div>

      {/* 0719 피드백: 가지고 있는 QABF 자료 업로드 */}
      <div className="card" data-tour="qb-import">
        <div className="card-title">📎 기존 QABF 자료 불러오기</div>
        <div className="card-subtitle">이미 작성해 둔 QABF가 있으면 다시 입력할 필요 없이 불러올 수 있어요. 불러온 뒤 아래 체크리스트에서 확인·수정하고 저장하세요.</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">📷 작성지 사진 업로드 (AI 판독{llmStatus !== 'on' ? ' · AI 연결 필요' : ''})</label>
            <input type="file" accept="image/*" multiple onChange={onImportImage} disabled={impBusy} />
            {impBusy && <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>⏳ 사진에서 응답을 읽는 중…</div>}
          </div>
          <div className="form-group">
            <label className="form-label">⌨ 응답 붙여넣기 (AI 불필요) — 1~25번 순서로 0~3 또는 X</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" value={impPaste} onChange={(e) => setImpPaste(e.target.value)}
                placeholder="예: 0 1 2 3 X 0 1 … (쉼표·띄어쓰기·줄바꿈 무관)" />
              <button className="btn btn-pri btn-sm" onClick={applyPastedResponses} style={{ flexShrink: 0 }}>적용</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" data-tour="qb-ai">
        <div className="card-title">✨ AI 기능 해석</div>
        <div className="card-subtitle">현재 입력된 QABF 기능·심각도 프로필을 바탕으로 추정 기능과 PBS 중재 방향을 제안합니다. (학생 코드만 사용 · 비식별)</div>
        <AIActionBar prompt={buildInterpretPrompt()} onCallAI={runInterpret} busy={aiBusy} callLabel="✨ AI 기능 해석" />
        {(aiOutput || aiBusy) && <PromptResultBlock prompt={buildInterpretPrompt()} output={aiOutput} busy={aiBusy} onChange={setAiOutput} />}
      </div>

      <div className="card" data-tour="qb-chart">
        <div className="card-title">📈 QABF 기능·심각도 그래프</div>
        <div className="card-subtitle">공식 QABF 양식의 그래프 — 5개 기능별 <strong>기능(0~5, 응답 문항 수)</strong>과 <strong>심각도(0~15, 점수 합)</strong>를 함께 보여줍니다.</div>
        <QabfFnChart responses={responses} />
      </div>

      <div className="card" data-tour="qb-list">
        <div className="card-title">✅ 25문항 체크리스트</div>
        {QUESTIONS.map((item, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '.92rem', flex: 1 }}>
                <strong style={{ color: FUNCTION_COLORS[item.f] }}>{i + 1}.</strong> <span style={{ color: 'var(--muted)' }}>{QABF_QUESTION_PREFIX}</span> {item.q}
              </span>
              <span style={{ fontSize: '.74rem', color: FUNCTION_COLORS[item.f], fontWeight: 600, marginLeft: 8, whiteSpace: 'nowrap' }}>
                {FUNCTION_LABELS[item.f]}
              </span>
            </div>
            <div className="qchip-area">
              {SCALE.map((v) => (
                <span
                  key={v}
                  className={'qchip' + (responses[i] === v ? ' on' : '')}
                  role="button" tabIndex={0} aria-pressed={responses[i] === v}
                  onClick={() => setVal(i, v)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVal(i, v); } }}
                >
                  {v} · {SCALE_LABELS[v]}
                </span>
              ))}
              {/* 0719: X 해당없음(관찰 기회 없음) — 점수 계산에서 제외 */}
              <span
                className={'qchip' + (responses[i] === QABF_NA ? ' on' : '')}
                role="button" tabIndex={0} aria-pressed={responses[i] === QABF_NA}
                title="이 상황을 관찰할 기회가 없었던 문항 — 점수 계산에서 제외됩니다"
                onClick={() => setVal(i, QABF_NA)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVal(i, QABF_NA); } }}
              >
                {QABF_NA_LABEL}
              </span>
            </div>
          </div>
        ))}
        {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => downloadQabfExcel(responses, curStu)}>⬇ 엑셀 다운로드</button>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>
            💾 QABF 저장
          </button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('bip')}>📝 중재계획(BIP) →</button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ QABF 저장 완료"
          hint="평가된 행동 기능을 바탕으로 오른쪽 버튼(중재계획)에서 계획을 세워보세요"
        />
      </div>
    </>
  );
}
