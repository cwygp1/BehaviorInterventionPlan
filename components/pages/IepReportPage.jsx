import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchIEP, saveIEPGoal } from '../../lib/api/students';
import { downloadNiceIepDocx } from '../../lib/utils/niceIepDocx';
import { findHanja } from '../../lib/utils/aiText';
import ExternalAIModal from '../ui/ExternalAIModal';

const GRADE = { 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };

// 모델이 살짝 깨진 JSON(스마트 따옴표, 후행 콤마 등)을 내도 1차 실패 시 보정 후 재시도.
function parseLooseJSON(raw) {
  try { return JSON.parse(raw); } catch (_) { /* 보정 시도 */ }
  let s = String(raw)
    .replace(/[“”]/g, '"')   // 스마트 큰따옴표
    .replace(/[‘’]/g, "'")   // 스마트 작은따옴표
    .replace(/,\s*([}\]])/g, '$1');     // 후행 콤마 제거
  return JSON.parse(s);
}

export default function IepReportPage() {
  const { curStu, curStuId, curStuData, ensureStudentData } = useStudents();
  const { user } = useAuth();
  const toast = useToast();
  const { callDetailed, status: llmStatus } = useLLM();
  const aiOn = llmStatus !== 'off';

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const curYear = new Date().getFullYear();
  const [yearF, setYearF] = useState(curYear);
  const [sem, setSem] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [synthId, setSynthId] = useState(null);
  const [planId, setPlanId] = useState(null); // 평가계획 채우기 진행 중인 목표 id
  const [extPlanGoal, setExtPlanGoal] = useState(null); // 🌐 외부AI로 평가계획 채우기 대상 목표
  const teacher = user?.name || '';

  // 수동 프롬프트 모달 (AI 미연결)
  const [manualGoalId, setManualGoalId] = useState(null);
  const [promptText, setPromptText] = useState('');
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    if (!curStuId) { setGoals([]); return; }
    setLoading(true);
    fetchIEP(curStuId).then((d) => setGoals(d.goals || [])).catch(() => toast('IEP 목표를 불러오지 못했습니다.')).finally(() => setLoading(false));
  }, [curStuId, toast]);

  if (!curStu) return (<><StuHero /><NoStudentHint /></>);

  const years = [...new Set([curYear, ...goals.map((g) => g.school_year).filter(Boolean)])].sort((a, b) => b - a);
  const list = goals.filter((g) => (!yearF || g.school_year === yearF) && (!sem || String(g.semester) === sem));

  function updateGoal(id, patch) { setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g))); }
  function updateMonth(id, idx, key, val) {
    setGoals((prev) => prev.map((g) => {
      if (g.id !== id) return g;
      const monthly = (g.monthly || []).map((m, i) => (i === idx
        ? { ...m, [key]: key === 'methods' ? val.split(/\r?\n/).map((s) => s.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean) : val }
        : m));
      return { ...g, monthly };
    }));
  }

  async function saveGoal(g) {
    setSavingId(g.id);
    try {
      await saveIEPGoal(curStuId, {
        id: g.id, school_year: g.school_year, subject: g.subject, grade_code: g.grade_code, area: g.area,
        standard_code: g.standard_code, standard_text: g.standard_text, semester: g.semester,
        semester_goal: g.semester_goal, plop: g.plop, crit_type: g.crit_type, crit_start: g.crit_start, crit_end: g.crit_end,
        support_tier: g.support_tier, eval_foci: g.eval_foci || [], task_steps: g.task_steps || [],
        chain_type: g.chain_type, prompt_system: g.prompt_system,
        monthly: g.monthly || [], semestral_eval: g.semestral_eval,
      });
      toast('저장 완료');
    } catch (e) { toast('저장 실패: ' + e.message); } finally { setSavingId(null); }
  }

  async function buildSynthPrompt(g) {
    const data = curStuData || (await ensureStudentData(curStuId)) || {};
    const note = curStu.note ? `비식별 요약: ${curStu.note}\n` : '';
    const mon = (g.monthly || []).map((m) => `${m.month}월) 목표:${(m.goal || '').replace(/\n/g, ' ')} / 내용:${(m.content || '').replace(/\n/g, ' ')} / 평가:${(m.eval || '').replace(/\n/g, ' ')}`).join('\n');
    return (
      `너는 특수교육 IEP 전문가다. 아래 한 영역의 월별 계획을 종합하여 학기 단위의 현행수준·학기목표·평가를 작성하라.\n\n` +
      `[학생] ${curStu.code} · ${curStu.level || ''} · ${curStu.disability || ''}\n${note}` +
      `[영역] ${g.subject}${g.area ? ' · ' + g.area : ''} (${g.semester}학기)\n` +
      `[월별 계획]\n${mon || '(없음)'}\n\n` +
      `요구사항:\n- 현행수준(plop): 학생 자료에 근거해 구체적으로.\n- 학기목표(semester_goal): 월별을 종합한 학기 도달점을 "- "로 시작하는 2~4개 항목으로 다양하게.\n- 평가(semestral_eval): [중요] 이 학기는 아직 끝나지 않았다. 결과를 이미 이룬 것처럼 완료형("~향상되었으며", "~달성함", "~검증됨")으로 쓰면 허위 기록이 된다. 학기말에 "무엇을 어떤 기준으로 평가할지"의 평가 계획·기준 어투("~도달 여부를 확인함", "~를 기준으로 평가함", "~변화를 서술 평가함")로만 쓸 것. "- "로 시작하는 2~4개 항목.\n- 실명/식별정보 금지.\n\n` +
      `반드시 JSON만 출력: {"plop":"- ...\\n- ...","semester_goal":"- ...\\n- ...","semestral_eval":"- ...\\n- ..."}`
    );
  }
  function applySynth(id, j) {
    updateGoal(id, {
      plop: j.plop != null ? String(j.plop) : undefined,
      semester_goal: j.semester_goal != null ? String(j.semester_goal) : undefined,
      semestral_eval: (j.semestral_eval != null) ? String(j.semestral_eval) : undefined,
    });
  }
  async function aiSynth(g) {
    // 외부AI 폴백 비활성(0719 요청): AI 미연결 시 연결 안내만.
    if (!aiOn) { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setSynthId(g.id);
    try {
      const prompt = await buildSynthPrompt(g);
      const r = await callDetailed('/no_think\n' + prompt, { temperature: 0.4 });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const m = (out || '').match(/\{[\s\S]*\}/);
      if (!m) { toast(r.finish_reason === 'length' ? '응답이 잘렸어요. AI max_tokens를 늘려보세요.' : 'AI 응답 해석 실패'); return; }
      const j = parseLooseJSON(m[0]);
      applySynth(g.id, j);
      // P11: 치환표 밖 한자 혼입 경고.
      const hanja = findHanja(JSON.stringify(j));
      if (hanja.length) toast(`⚠ 생성문에 한자 혼입 ${hanja.length}곳(${hanja.slice(0, 3).join(', ')}…)이 있어요 — 확인·수정해 주세요.`);
      toast('월별을 종합해 학기 현행수준·목표·평가(기준)를 작성했어요. (확인 후 저장)', 'success');
    } catch (e) { toast('AI 종합 실패: ' + e.message); } finally { setSynthId(null); }
  }

  // 평가계획 프롬프트 — 로컬 AI 호출·🌐 외부AI 복사 공용. (빈 구간이 없으면 null)
  function buildEvalPlanPrompt(g) {
    const targets = (g.monthly || []).filter((m) => !(m.eval_plan || '').trim());
    if (!targets.length) return null;
    const rows = targets.map((m) => `${m.month}월) 교육목표: ${(m.goal || '').replace(/\n/g, ' ')} / 교육내용: ${(m.content || '').replace(/\n/g, ' ')}`).join('\n');
    return (
      '아래는 특수교육 IEP 한 목표의 구간별 교육목표·교육내용이다. 각 구간의 "평가계획"을 작성하라.\n' +
      '- 구간마다 "~는가?"로 끝나는 질문형 항목 2~3개.\n' +
      '- 서로 다른 측면을 다각적으로: (a) 수행·도달, (b) 참여 태도, (c) 지속성(시간·횟수), (d) 독립·모방 수준, (e) 일반화(다른 상황·자료·사람) 중 2~3개 측면을 골라 한 측면당 1개 질문. 같은 측면 반복 금지.\n' +
      '- 질문에는 그 구간의 교육목표·교육내용에 나온 실제 활동·재료를 담아 구체적으로 쓸 것.\n' +
      '- 영어 단어·어려운 한자어 없이 쉬운 우리말로, 맞춤법·문장 오류 없이.\n\n' +
      `[영역] ${g.subject}${g.area ? ' · ' + g.area : ''} (${g.semester}학기)\n[구간]\n${rows}\n\n` +
      '반드시 JSON만 출력: {"plans":[{"month":"3","eval_plan":"- ...는가?\\n- ...는가?"}]}'
    );
  }
  // 평가계획 JSON을 목표에 병합 — 이미 값이 있는 구간은 덮어쓰지 않는다. 채운 개수 반환.
  function applyEvalPlanJson(goalId, j) {
    const plans = Array.isArray(j?.plans) ? j.plans : [];
    const byMonth = {};
    plans.forEach((p) => { if (p && p.month != null && String(p.eval_plan || '').trim()) byMonth[String(p.month)] = String(p.eval_plan).trim(); });
    if (!Object.keys(byMonth).length) return 0;
    setGoals((prev) => prev.map((x) => {
      if (x.id !== goalId) return x;
      const monthly = (x.monthly || []).map((mm) => ((mm.eval_plan || '').trim() ? mm : { ...mm, eval_plan: byMonth[String(mm.month)] || mm.eval_plan || '' }));
      return { ...x, monthly };
    }));
    return Object.keys(byMonth).length;
  }

  // 평가계획(eval_plan)이 비어 있는 구간만 골라 AI로 채운다.
  // 평가계획 기능 이전에 저장된 목표를 위해 — 기존 목표·내용·평가는 건드리지 않는다.
  async function aiFillEvalPlans(g) {
    if (!aiOn) { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    const prompt = buildEvalPlanPrompt(g);
    if (!prompt) { toast('모든 구간에 평가계획이 이미 있어요.'); return; }
    setPlanId(g.id);
    try {
      const r = await callDetailed('/no_think\n' + prompt, { temperature: 0.4 });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const m = (out || '').match(/\{[\s\S]*\}/);
      if (!m) { toast(r.finish_reason === 'length' ? '응답이 잘렸어요. AI max_tokens를 늘려보세요.' : 'AI 응답 해석 실패'); return; }
      const n = applyEvalPlanJson(g.id, parseLooseJSON(m[0]));
      if (!n) { toast('평가계획을 받지 못했어요.'); return; }
      toast(`빈 평가계획 ${n}개 구간을 채웠어요. 확인 후 저장하세요.`, 'success');
    } catch (e) { toast('평가계획 생성 실패: ' + e.message); }
    finally { setPlanId(null); }
  }

  async function openManual(g) {
    setManualGoalId(g.id); setPasteText(''); setPromptText('프롬프트 생성 중…');
    try { setPromptText(await buildSynthPrompt(g)); } catch (e) { setPromptText('생성 실패: ' + e.message); }
  }
  async function copyPrompt() { try { await navigator.clipboard.writeText(promptText); toast('복사했어요.'); } catch (_) { toast('직접 선택해 복사하세요.'); } }
  function applyManual() {
    const m = (pasteText || '').match(/\{[\s\S]*\}/);
    if (!m) { toast('붙여넣은 내용에서 JSON을 찾지 못했어요.'); return; }
    try { applySynth(manualGoalId, parseLooseJSON(m[0])); toast('적용했어요. 확인 후 저장하세요.', 'success'); setManualGoalId(null); }
    catch (e) { toast('JSON 파싱 실패: ' + e.message); }
  }

  function onWord() {
    if (!list.length) { toast('출력할 목표가 없습니다.'); return; }
    downloadNiceIepDocx({
      student: { code: curStu.code, level: curStu.level },
      teacherName: teacher, year: yearF || curYear, semester: sem, goals: list,
    })
      .then(() => toast('나이스 양식 Word 파일을 내려받았어요 — 브라우저 다운로드 폴더를 확인하세요.', 'success'))
      .catch((e) => toast('Word 생성 실패: ' + e.message));
  }

  return (
    <>
      <StuHero />

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>📄 IEP 계획서 (편집 · 출력)</div>
            <div className="card-subtitle">영역별로 월별 계획을 직접 수정하고, "✨ AI 종합"으로 학기 현행수준·목표·평가를 채운 뒤 저장·출력합니다.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-input" style={{ width: 'auto' }} value={yearF} onChange={(e) => setYearF(Number(e.target.value))}>
              <option value={0}>전체 학년도</option>
              {years.map((y) => <option key={y} value={y}>{y}학년도</option>)}
            </select>
            <select className="form-input" style={{ width: 'auto' }} value={sem} onChange={(e) => setSem(e.target.value)}>
              <option value="">전체 학기</option><option value="1">1학기</option><option value="2">2학기</option>
            </select>
            <button className="btn btn-ok" onClick={onWord}>📄 나이스 양식 Word(.docx)</button>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13 }}>
          <tbody>
            <tr><td style={hl}>성명</td><td style={td}>{curStu.code}</td><td style={hl}>학년·반</td><td style={td}>{curStu.level}</td><td style={hl}>담임</td><td style={td}>{teacher}</td></tr>
            <tr><td style={hl}>장애유형</td><td style={td}>{curStu.disability}</td><td style={hl}>학교</td><td style={td}>{user?.school || ''}</td><td style={hl}>학년도</td><td style={td}>{yearF || '전체'}</td></tr>
          </tbody>
        </table>
      </div>

      {loading && <div className="card"><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280' }}><span style={spinner} /> 불러오는 중…</div></div>}
      {!loading && list.length === 0 && <div className="card"><div className="empty-state">이 학년도·학기에 저장된 목표가 없습니다. "IEP 목표 생성"에서 만들거나 "전년도 IEP"에서 불러오세요.</div></div>}

      {!loading && list.map((g) => (
        <div className="card" key={g.id}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>📘 {g.subject}{g.area ? ' · ' + g.area : ''} <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>· {g.school_year || '-'}학년도 {g.semester}학기 · {GRADE[g.grade_code] || ''}</span></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => aiFillEvalPlans(g)} disabled={planId === g.id}>{planId === g.id ? '평가계획 생성 중…' : '✨ 평가계획 채우기'}</button>
              {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
              <button className="btn btn-ghost btn-sm" onClick={() => { if (!buildEvalPlanPrompt(g)) { toast('모든 구간에 평가계획이 이미 있어요.'); return; } setExtPlanGoal(g); }} title="외부 AI(클로드 등)로 평가계획 채우기">🌐 외부AI</button> */}
              <button className="btn btn-ghost btn-sm" onClick={() => aiSynth(g)} disabled={synthId === g.id}>{synthId === g.id ? 'AI 종합 중…' : '✨ AI 종합 (월별→학기)'}</button>
              {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
              <button className="btn btn-ghost btn-sm" onClick={() => openManual(g)} title="외부 AI(클로드 등)로 학기 종합">🌐 외부AI 종합</button> */}
              <button className="btn btn-pri btn-sm" onClick={() => saveGoal(g)} disabled={savingId === g.id}>{savingId === g.id ? '저장 중…' : '💾 저장'}</button>
            </div>
          </div>

          {/* ── 학기별 섹션 (현행수준·학기목표·학기평가) ── */}
          <div style={secBox}>
            <div style={secHead}>
              <span style={secTitle}>🗓 학기별 개별화교육계획/평가</span>
              <span style={{ ...secTag, background: '#4f6bed' }}>학기 단위</span>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">현행수준</label><textarea className="form-textarea" rows={3} value={g.plop || ''} onChange={(e) => updateGoal(g.id, { plop: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">학기목표 (여러 줄 "-")</label><textarea className="form-textarea" rows={3} value={g.semester_goal || ''} onChange={(e) => updateGoal(g.id, { semester_goal: e.target.value })} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">학기 평가 (여러 줄 "-")</label>
              <div style={{ fontSize: '.74rem', color: '#92400e', margin: '0 0 4px' }}>📌 학기말 작성 칸 — 학기 중에는 평가 "기준·계획"만 적고, 실제 결과는 학기말에 기록하세요.</div>
              <textarea className="form-textarea" rows={3} value={g.semestral_eval || ''} onChange={(e) => updateGoal(g.id, { semestral_eval: e.target.value })} />
            </div>
          </div>

          {/* ── 월별 섹션 (월별 표) ── */}
          <div style={secBox}>
            <div style={secHead}>
              <span style={secTitle}>📅 월별 개별화교육계획/평가</span>
              <span style={{ ...secTag, background: '#0d9488' }}>월 단위</span>
              <span style={{ fontSize: '.74rem', color: '#6b7280' }}>· 모든 칸 직접 수정</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
            <table style={tbl}>
              <thead><tr><th style={{ ...th, width: 48 }}>월</th><th style={th}>교육목표</th><th style={th}>교육내용</th><th style={{ ...th, width: 150 }}>교육방법</th><th style={{ ...th, width: '18%' }}>평가계획</th><th style={{ ...th, width: '22%' }}>평가</th></tr></thead>
              <tbody>
                {(g.monthly || []).map((m, i) => (
                  <tr key={i}>
                    <td style={tc}>{m.month}월</td>
                    <td style={tdc}><textarea style={cell} value={m.goal || ''} onChange={(e) => updateMonth(g.id, i, 'goal', e.target.value)} /></td>
                    <td style={tdc}><textarea style={cell} value={m.content || ''} onChange={(e) => updateMonth(g.id, i, 'content', e.target.value)} /></td>
                    <td style={tdc}><textarea style={cell} value={(m.methods || []).map((x) => '- ' + x).join('\n')} onChange={(e) => updateMonth(g.id, i, 'methods', e.target.value)} /></td>
                    <td style={tdc}><textarea style={cell} value={m.eval_plan || ''} onChange={(e) => updateMonth(g.id, i, 'eval_plan', e.target.value)} placeholder="- …는가?" /></td>
                    <td style={tdc}><textarea style={cell} value={m.eval || ''} onChange={(e) => updateMonth(g.id, i, 'eval', e.target.value)} /></td>
                  </tr>
                ))}
                {(!g.monthly || g.monthly.length === 0) && <tr><td colSpan={6} style={{ ...tdc, color: '#6b7280', textAlign: 'center' }}>월별 계획이 없습니다. "IEP 목표 생성"에서 월별을 만들면 여기서 수정할 수 있어요.</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      ))}

      {/* 🌐 외부AI — 평가계획 채우기 */}
      <ExternalAIModal
        open={!!extPlanGoal}
        onClose={() => setExtPlanGoal(null)}
        title="🌐 외부 AI — 평가계획 채우기"
        buildPrompt={async () => buildEvalPlanPrompt(extPlanGoal) || ''}
        placeholder='{"plans":[{"month":"3","eval_plan":"- ...는가?"}]} 형태의 JSON을 붙여넣으세요.'
        onApply={(raw) => {
          try {
            const m = (raw || '').match(/\{[\s\S]*\}/);
            if (!m) { toast('붙여넣은 내용에서 JSON을 찾지 못했어요.'); return false; }
            const n = applyEvalPlanJson(extPlanGoal.id, parseLooseJSON(m[0]));
            if (!n) { toast('평가계획을 찾지 못했어요.'); return false; }
            toast(`빈 평가계획 ${n}개 구간을 채웠어요. 확인 후 저장하세요.`, 'success');
            return true;
          } catch (e) { toast('JSON 파싱 실패: ' + e.message); return false; }
        }}
      />

      <Modal open={!!manualGoalId} onClose={() => setManualGoalId(null)} maxWidth={700}>
        <h3>📋 AI 종합 프롬프트 (연결된 AI 없이 사용)</h3>
        <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6 }}>① 프롬프트를 복사해 외부 AI에 붙여넣고 ② 받은 JSON을 아래에 붙여넣어 "적용".</p>
        <div className="form-group"><label className="form-label">① 프롬프트</label><textarea className="form-textarea" rows={8} readOnly value={promptText} onFocus={(e) => e.target.select()} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}><button className="btn btn-ghost" onClick={copyPrompt}>📋 복사</button></div>
        <div className="form-group"><label className="form-label">② AI 응답 붙여넣기</label><textarea className="form-textarea" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder='{"plop":...,"semester_goal":...,"semestral_eval":...}' /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setManualGoalId(null)}>닫기</button>
          <button className="btn btn-pri" onClick={applyManual}>응답 적용</button>
        </div>
      </Modal>
    </>
  );
}

const secBox = { border: '1px solid #e6e8ee', borderRadius: 10, padding: '10px 12px', marginTop: 12, background: '#fafbfd' };
const secHead = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: '1px dashed #d4d8e0', flexWrap: 'wrap' };
const secTitle = { fontWeight: 700, fontSize: '.92rem', color: '#2f5496' };
const secTag = { fontSize: '.72rem', fontWeight: 700, color: '#fff', borderRadius: 99, padding: '2px 8px' };
const hl = { border: '1px solid #e3e6eb', background: '#f3f4f6', fontWeight: 700, padding: '7px 9px', width: 90, whiteSpace: 'nowrap' };
const td = { border: '1px solid #e3e6eb', padding: '7px 9px' };
const tbl = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 4 };
const th = { background: '#2f5496', color: '#fff', border: '1px solid #d9d9d9', padding: '8px 9px', fontSize: 12, textAlign: 'center' };
const tdc = { border: '1px solid #e3e6eb', padding: 4, verticalAlign: 'top' };
const tc = { border: '1px solid #e3e6eb', padding: '7px 9px', textAlign: 'center', verticalAlign: 'top', background: '#f3f6fc', fontWeight: 700, whiteSpace: 'nowrap' };
const cell = { width: '100%', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: 12.5, background: 'transparent', lineHeight: 1.55, minHeight: 64, whiteSpace: 'pre-wrap' };
const spinner = { display: 'inline-block', width: 18, height: 18, border: '3px solid rgba(79,107,237,.25)', borderTopColor: '#4f6bed', borderRadius: '50%', animation: 'spin .8s linear infinite' };
