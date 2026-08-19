import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchIEP, saveIEPGoal, deleteIEPGoal } from '../../lib/api/students';
import { extractFromFile } from '../../lib/utils/extractText';
import ExternalAIModal from '../ui/ExternalAIModal';
import NextStepBanner, { useSavedFlag } from '../ui/NextStepBanner';

const gradeFromLevel = (lv) => (lv?.includes('고') ? 12 : lv?.includes('중') ? 9 : 6);

export default function PriorIepPage({ onNavigate }) {
  const { curStu, curStuId } = useStudents();
  const toast = useToast();
  const { callDetailed, callVisionDetailed, status: llmStatus } = useLLM();
  const aiOn = llmStatus !== 'off';

  const curYear = new Date().getFullYear();
  const [year, setYear] = useState(curYear - 1);
  const [semester, setSemester] = useState(1);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);

  // 업로드 파싱
  const [impText, setImpText] = useState('');
  const [impImages, setImpImages] = useState([]);
  const [impMsg, setImpMsg] = useState('');
  const [impBusy, setImpBusy] = useState(false);
  const [extOpen, setExtOpen] = useState(false); // 🌐 외부AI 파싱 모달

  // 수동 입력 / 수정 폼
  const [editingId, setEditingId] = useState(null);
  const [editingMonthly, setEditingMonthly] = useState([]);
  const [fSubject, setFSubject] = useState('');
  const [fArea, setFArea] = useState('');
  const [fGoal, setFGoal] = useState('');
  const [fPlop, setFPlop] = useState('');
  const [fEval, setFEval] = useState('');
  const [busy, setBusy] = useState(false);
  // 0819 피드백: 저장 성공 후 "다음 단계(출발점 분석)로 이동" 배너 — 폼·파싱 입력을 다시 수정하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([fSubject, fArea, fGoal, fPlop, fEval, impText, impImages.length]);

  function reload() {
    if (!curStuId) { setGoals([]); return; }
    setLoading(true);
    fetchIEP(curStuId).then((d) => setGoals(d.goals || [])).catch(() => toast('불러오기 실패')).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [curStuId]);

  if (!curStu) return (<><StuHero /><NoStudentHint /></>);

  const yearGoals = goals.filter((g) => g.school_year === year);

  function resetForm() { setEditingId(null); setEditingMonthly([]); setFSubject(''); setFArea(''); setFGoal(''); setFPlop(''); setFEval(''); }
  function loadForm(g) {
    setEditingId(g.id); setEditingMonthly(Array.isArray(g.monthly) ? g.monthly : []);
    setFSubject(g.subject || ''); setFArea(g.area || ''); setFGoal(g.semester_goal || ''); setFPlop(g.plop || ''); setFEval(g.semestral_eval || '');
    setSemester(g.semester || 1); setYear(g.school_year || year);
  }
  async function saveForm() {
    if (!fSubject.trim() && !fGoal.trim()) { toast('교과 또는 학기목표를 입력하세요.'); return; }
    setBusy(true);
    try {
      const body = {
        id: editingId || undefined, school_year: year, subject: fSubject, grade_code: gradeFromLevel(curStu.level),
        area: fArea, standard_code: '', standard_text: '', semester: Number(semester),
        semester_goal: fGoal, plop: fPlop, crit_type: 'rate', crit_start: 30, crit_end: 80,
        monthly: editingMonthly, semestral_eval: fEval,
      };
      await saveIEPGoal(curStuId, body);
      toast(editingId ? '수정 완료' : '추가 완료');
      markSaved();
      resetForm(); reload();
    } catch (e) { toast('저장 실패: ' + e.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    try { await deleteIEPGoal(curStuId, id); setGoals((p) => p.filter((g) => g.id !== id)); toast('삭제했습니다.'); }
    catch (e) { toast('삭제 실패: ' + e.message); }
  }

  async function onImportFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImpMsg('파일 읽는 중…');
    try {
      const res = await extractFromFile(f, (m) => setImpMsg(m));
      if (res.text != null) { setImpText((p) => (p ? p + '\n' : '') + res.text); toast('텍스트 추출 완료'); }
      else if (res.images?.length) { setImpImages((p) => [...p, ...res.images]); toast(`이미지 ${res.images.length}장 첨부`); }
    } catch (err) { toast('추출 실패: ' + err.message); }
    finally { setImpMsg(''); e.target.value = ''; }
  }
  const PARSE_INSTR =
    '교과(영역)별로 학기·학기목표·현행수준·평가를 추출하고, 월별 계획이 있으면 함께 추출하라. 식별정보 제거. 반드시 JSON 배열만 출력:\n' +
    '[{"subject":"국어","area":"읽기","semester":1,"semester_goal":"...","plop":"...","semestral_eval":"...","monthly":[{"month":3,"goal":"...","content":"...","methods":["..."],"eval":"..."}]}]';

  // 파싱된 목표 배열을 저장 — 로컬 AI·🌐 외부AI 공용. 저장 개수 반환.
  async function saveParsedGoals(arr) {
    const gc = gradeFromLevel(curStu.level);
    let n = 0;
    for (const g of arr) {
      const monthly = Array.isArray(g.monthly) ? g.monthly.map((x) => ({ month: x.month, goal: String(x.goal || ''), content: String(x.content || ''), methods: Array.isArray(x.methods) ? x.methods.map(String) : [], eval: String(x.eval || '') })) : [];
      await saveIEPGoal(curStuId, {
        school_year: year, subject: g.subject || '', grade_code: gc, area: g.area || '',
        standard_code: '', standard_text: '', semester: (g.semester === 1 || g.semester === 2) ? g.semester : Number(semester),
        semester_goal: g.semester_goal || '', plop: g.plop || '', crit_type: 'rate', crit_start: 30, crit_end: 80,
        monthly, semestral_eval: g.semestral_eval || '',
      });
      n += 1;
    }
    return n;
  }

  async function parseImport() {
    if (!aiOn) { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (!impText.trim() && !impImages.length) { toast('파일을 올리거나 내용을 붙여넣어 주세요.'); return; }
    setImpBusy(true);
    try {
      let r;
      if (impImages.length) r = await callVisionDetailed('/no_think\n다음 이미지는 학생의 전년도 IEP 문서다. 글자를 읽어(OCR) ' + PARSE_INSTR, impImages, { temperature: 0.3, tier: 'fast' });
      else r = await callDetailed('/no_think\n다음은 학생의 전년도 IEP 문서 텍스트다. ' + PARSE_INSTR + '\n\n[문서]\n' + impText.slice(0, 12000), { temperature: 0.3, tier: 'fast' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const m = (out || '').match(/\[[\s\S]*\]/);
      if (!m) { toast(r.finish_reason === 'length' ? 'AI 응답이 잘렸어요. max_tokens를 늘려보세요.' : '목표 목록을 찾지 못했어요.'); return; }
      const arr = JSON.parse(m[0]);
      if (!Array.isArray(arr) || !arr.length) { toast('파싱된 목표가 없습니다.'); return; }
      const n = await saveParsedGoals(arr);
      setImpText(''); setImpImages([]);
      toast(`${year}학년도 IEP에서 ${n}개 목표를 불러왔어요.`);
      markSaved();
      reload();
    } catch (e) { toast('파싱 실패: ' + e.message + (impImages.length ? ' (이미지 분석은 비전 모델 필요)' : '')); }
    finally { setImpBusy(false); }
  }

  return (
    <>
      <StuHero />

      <div className="card" data-tour="pi-year">
        <div className="card-title">🗓 전년도 IEP 관리</div>
        <div className="card-subtitle">과거 학년도의 IEP를 업로드 파싱하거나 직접 입력·수정합니다. 올해 IEP 목표 생성 시 이 자료를 근거로 활용합니다.</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">학년도</label>
            <input type="number" className="form-input" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">학기</label>
            <select className="form-select" value={semester} onChange={(e) => setSemester(Number(e.target.value))}><option value={1}>1학기</option><option value={2}>2학기</option></select>
          </div>
        </div>
      </div>

      {/* 업로드 파싱 */}
      <div className="card" data-tour="pi-upload">
        <div className="card-title">📥 파일 업로드 → AI 파싱</div>
        <div className="card-subtitle">.pdf · .docx · 이미지 · .txt 지원. 스캔본/이미지는 AI 비전이 읽습니다.{!aiOn && ' (AI 연결 필요)'} 위에서 고른 {year}학년도로 저장됩니다.</div>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group"><label className="form-label">파일</label><input type="file" accept=".txt,.pdf,.docx,image/*" onChange={onImportFile} disabled={!!impMsg || !aiOn} /></div>
          <div className="form-group"><label className="form-label">또는 내용 붙여넣기</label><textarea className="form-textarea" rows={3} value={impText} onChange={(e) => setImpText(e.target.value)} disabled={!aiOn} /></div>
        </div>
        {impMsg && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 12.5 }}><span style={spinner} /> {impMsg}</div>}
        {impImages.length > 0 && <div style={{ fontSize: 12.5, color: '#15a36e', fontWeight: 600 }}>🖼 이미지 {impImages.length}장 첨부됨 <button className="btn btn-ghost btn-sm" onClick={() => setImpImages([])}>비우기</button></div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-pri" onClick={parseImport} disabled={impBusy || !!impMsg || !aiOn}>{impBusy ? 'AI 파싱 중…' : `✨ ${year}학년도로 파싱해 추가`}</button>
          {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
          <button className="btn btn-ghost" onClick={() => { if (!impText.trim()) { toast('외부AI 파싱은 텍스트만 지원해요. 문서 내용을 붙여넣어 주세요.'); return; } setExtOpen(true); }}
            title="프롬프트를 복사해 클로드·ChatGPT 등에서 실행 후 응답(JSON 배열)을 붙여넣기">🌐 외부AI 파싱</button> */}
        </div>

        {/* 🌐 외부AI — 전년도 IEP 텍스트 파싱 */}
        <ExternalAIModal
          open={extOpen}
          onClose={() => setExtOpen(false)}
          title="🌐 외부 AI — 전년도 IEP 파싱"
          buildPrompt={async () => ('다음은 학생의 전년도 IEP 문서 텍스트다. ' + PARSE_INSTR + '\n\n[문서]\n' + impText.slice(0, 12000))}
          placeholder='[{"subject":"국어", ...}] 형태의 JSON 배열을 붙여넣으세요.'
          onApply={(raw) => {
            const m = (raw || '').match(/\[[\s\S]*\]/);
            if (!m) { toast('붙여넣은 내용에서 JSON 배열을 찾지 못했어요.'); return false; }
            let arr;
            try { arr = JSON.parse(m[0]); } catch (e) { toast('JSON 파싱 실패: ' + e.message); return false; }
            if (!Array.isArray(arr) || !arr.length) { toast('파싱된 목표가 없습니다.'); return false; }
            saveParsedGoals(arr).then((n) => {
              setImpText(''); setImpImages([]);
              toast(`${year}학년도 IEP에서 ${n}개 목표를 불러왔어요.`);
              markSaved();
              reload();
            }).catch((e) => toast('저장 실패: ' + e.message));
            return true;
          }}
        />
      </div>

      {/* 수동 입력 / 수정 */}
      <div className="card" data-tour="pi-manual">
        <div className="card-title">✍ 직접 입력 / 수정 {editingId && <span className="badge badge-purple">수정 중</span>}</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">교과</label><input className="form-input" value={fSubject} onChange={(e) => setFSubject(e.target.value)} placeholder="예: 국어" /></div>
          <div className="form-group"><label className="form-label">영역</label><input className="form-input" value={fArea} onChange={(e) => setFArea(e.target.value)} placeholder="예: 읽기" /></div>
        </div>
        <div className="form-group"><label className="form-label">학기목표</label><textarea className="form-textarea" rows={2} value={fGoal} onChange={(e) => setFGoal(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">현행수준</label><textarea className="form-textarea" rows={2} value={fPlop} onChange={(e) => setFPlop(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">평가</label><textarea className="form-textarea" rows={2} value={fEval} onChange={(e) => setFEval(e.target.value)} /></div>
        {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
          {editingId && <button className="btn btn-ghost" onClick={resetForm}>새 입력</button>}
          <button className="btn btn-pri" onClick={saveForm} disabled={busy}>{busy ? '저장 중…' : editingId ? '수정 저장' : `${year}학년도 ${semester}학기로 추가`}</button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('startpoint')}>🧭 출발점 분석 →</button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ 전년도 IEP 저장 완료"
          hint="올해 IEP를 만들려면 오른쪽 버튼(출발점 분석)부터 시작해요"
        />
      </div>

      {/* 목록 */}
      <div className="card" data-tour="pi-list">
        <div className="card-title">📋 {year}학년도 IEP 목록 ({yearGoals.length})</div>
        {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 2px', color: '#6b7280' }}><span style={spinner} /> 불러오는 중…</div>}
        {!loading && yearGoals.length === 0 && <div className="empty-state">{year}학년도에 저장된 IEP가 없습니다. 위에서 업로드 파싱하거나 직접 입력하세요.</div>}
        {!loading && yearGoals.map((g) => (
          <div key={g.id} style={{ border: '1px solid ' + (editingId === g.id ? '#7c4dff' : '#e3e6eb'), background: editingId === g.id ? '#f5f0ff' : '#fff', borderRadius: 9, padding: '10px 12px', marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ fontSize: 12, color: '#3b6ef5', fontWeight: 700 }}>{g.subject}{g.area ? ' · ' + g.area : ''} · {g.semester}학기</div>
                <div style={{ fontSize: 13, marginTop: 3 }}>{g.semester_goal}</div>
                {g.plop && <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3 }}>현행: {g.plop}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <button className="btn btn-pri btn-sm" onClick={() => loadForm(g)}>✏ 수정</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(g.id)}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const spinner = { display: 'inline-block', width: 18, height: 18, border: '3px solid rgba(79,107,237,.25)', borderTopColor: '#4f6bed', borderRadius: '50%', animation: 'spin .8s linear infinite' };
