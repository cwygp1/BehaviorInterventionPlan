import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchIEP, saveIEPGoal, deleteIEPGoal } from '../../lib/api/students';
import { downloadIepWord } from '../../lib/utils/printIep';

const GRADE = { 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };
const GORDER = [2, 4, 6, 9, 12];

// 지원 수준 사다리(기능분석·ZPD). 월별 분해에도 재사용.
const LEVELS = [
  { n: '①', role: '관심·주의', pre: null },
  { n: '②', role: '모방·도움받아', pre: '교사의 시범을 보고 도움을 받아 ' },
  { n: '③', role: '부분 수행', pre: '부분적으로 ' },
  { n: '④', role: '독립 수행', pre: '스스로 ' },
  { n: '⑤', role: '상황 적용', pre: '다양한 상황에서 스스로 ' },
  { n: '⑥', role: '일반화·유지', pre: '여러 상황에서 꾸준히 ' },
];
const SUP = ['교사의 도움을 받아 ', '부분적으로 ', '교사 감독 하에 스스로 ', '스스로 ', '다양한 상황에서 스스로 '];
const CONTENT_SUFFIX = ['탐색·모방 활동', '구조화된 연습 활동', '실제 상황 적용 연습', '모의·실제 상황 일반화 활동'];

function methodsForType(disability) {
  const d = disability || '';
  if (d.includes('자폐')) return ['시각적 지원', '구조화 교수', '사회적 이야기', '과제분석'];
  if (d.includes('주의') || d.toUpperCase().includes('ADHD')) return ['짧은 활동', '즉각 강화', '자기점검', '시각적 일정'];
  if (d.includes('지적')) return ['직접교수', '모델링', '과제분석', '반복연습', '즉각 강화'];
  return ['모델링', '직접교수', '과제분석', '즉각 강화'];
}
const monthsOf = (sem) => (String(sem) === '2' ? [9, 10, 11, 12, 1] : [3, 4, 5, 6, 7]);
const baseOf = (goal) => goal.replace(/^스스로\s*/, '').replace(/\s*\.?$/, '');
const levelFocus = (text, i) => {
  const base = text.replace(/\s*\.?$/, '');
  if (i === 0) return base + '에 관심을 보이고 주의를 기울인다.';
  return LEVELS[i].pre + base + '.';
};

export default function IepPage() {
  const { curStu, curStuId, curStuData, ensureStudentData } = useStudents();
  const { user } = useAuth();
  const toast = useToast();
  const { callDetailed, config, status: llmStatus } = useLLM();
  const aiOn = llmStatus !== 'off';
  const [aiLog, setAiLog] = useState([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [pasteText, setPasteText] = useState('');

  function logAI(status, label, detail, raw) {
    setAiLog((prev) => [{ t: new Date().toLocaleTimeString(), status, label, detail, raw: raw ? String(raw).slice(0, 6000) : '' }, ...prev].slice(0, 40));
  }

  // reasoning 모델(Qwen3 등) 대응 + 통신 로그 기록.
  async function llmJSON(label, prompt, opts) {
    const effTok = opts?.max_tokens ?? config?.max_tokens ?? 8000;
    logAI('start', label, `요청 전송 (max_tokens=${effTok}${opts?.max_tokens ? '' : ' · AI 설정값 적용'})`);
    let r;
    try {
      r = await callDetailed('/no_think\n' + prompt, opts);
    } catch (e) {
      logAI('error', label, '호출/네트워크 오류: ' + e.message);
      throw e;
    }
    const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
    const meta = `finish=${r.finish_reason} · content ${(r.content || '').length}자 · reasoning ${(r.reasoning || '').length}자`;
    const m = (out || '').match(/\{[\s\S]*\}/);
    if (!m) {
      logAI('error', label, 'JSON 없음 · ' + meta, out);
      throw new Error(r.finish_reason === 'length' ? 'AI 응답이 토큰 한도로 잘렸어요. AI 설정에서 max_tokens를 늘려보세요.' : 'AI 응답에서 JSON을 찾지 못했어요.');
    }
    try {
      const j = JSON.parse(m[0]);
      logAI('ok', label, '성공 · ' + meta, m[0]);
      return j;
    } catch (e) {
      logAI('error', label, 'JSON 파싱 실패 · ' + meta, m[0]);
      throw new Error('JSON 파싱 실패: ' + e.message);
    }
  }

  const [rows, setRows] = useState([]); // achievement standards
  const [fSubject, setFSubject] = useState('');
  const [fGrade, setFGrade] = useState('');
  const [fArea, setFArea] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [sel, setSel] = useState(null);

  const [verb, setVerb] = useState('');
  const [intent, setIntent] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [ladder, setLadder] = useState({}); // idx -> 'ok'|'no'

  const [goal, setGoal] = useState('');
  const [plop, setPlop] = useState('');
  const [schoolYear, setSchoolYear] = useState(new Date().getFullYear());
  const [sem, setSem] = useState('1');
  const [critType, setCritType] = useState('rate');
  const [cStart, setCStart] = useState(30);
  const [cEnd, setCEnd] = useState(80);
  const [monthly, setMonthly] = useState([]);
  const [semEval, setSemEval] = useState('');

  const [savedGoals, setSavedGoals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [aiDecBusy, setAiDecBusy] = useState(false);
  const [aiGenBusy, setAiGenBusy] = useState(false);
  const [editingId, setEditingId] = useState(null); // 수정 중인 저장 목표 id
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [colW, setColW] = useState([56, 240, 240, 160, 300]); // 월별 표 열 너비(px)

  // Load achievement standards (public/data) once.
  useEffect(() => {
    fetch('/data/achievement-standards.json')
      .then((r) => r.json())
      .then((d) => setRows((d.rows || []).map((a) => ({ subject: a[0], gradeCode: a[1], area: a[2], code: a[3], text: a[4], verb: a[5], intent: a[6], descriptor: a[7] }))))
      .catch(() => toast('성취기준 데이터를 불러오지 못했습니다.'));
  }, [toast]);

  // Load saved IEP goals when the selected student changes.
  useEffect(() => {
    if (!curStuId) { setSavedGoals([]); return; }
    setGoalsLoading(true);
    fetchIEP(curStuId).then((d) => setSavedGoals(d.goals || [])).catch(() => {}).finally(() => setGoalsLoading(false));
  }, [curStuId]);

  // Default 현행수준 from the student's note when a student is chosen.
  useEffect(() => {
    setPlop(curStu?.note || '교사의 신체적·언어적 촉진이 있을 때 부분적으로 수행하며, 독립 수행은 어려움.');
  }, [curStuId, curStu?.note]);

  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subject))], [rows]);
  const grades = useMemo(() => {
    const pool = rows.filter((r) => !fSubject || r.subject === fSubject);
    return GORDER.filter((g) => pool.some((r) => r.gradeCode === g));
  }, [rows, fSubject]);
  const areas = useMemo(() => {
    const pool = rows.filter((r) => (!fSubject || r.subject === fSubject) && (!fGrade || r.gradeCode === +fGrade));
    return [...new Set(pool.map((r) => r.area).filter(Boolean))];
  }, [rows, fSubject, fGrade]);
  const candidates = useMemo(() => {
    const q = fSearch.trim();
    return rows.filter((r) =>
      (!fSubject || r.subject === fSubject) &&
      (!fGrade || r.gradeCode === +fGrade) &&
      (!fArea || r.area === fArea) &&
      (!q || r.text.includes(q) || r.code.includes(q))
    );
  }, [rows, fSubject, fGrade, fArea, fSearch]);

  function pickStandard(r) {
    setSel(r);
    setVerb(r.verb || ''); setIntent(r.intent || ''); setDescriptor(r.descriptor || '');
    setLadder({});
    setGoal('스스로 ' + r.text.replace(/\s*\.?$/, '') + '.');
    setMonthly([]); setSemEval('');
    setEditingId(null);
  }

  // 저장된 목표를 편집기로 불러오기 (수정 모드).
  function loadGoal(g) {
    const std = rows.find((r) => r.code === g.standard_code) ||
      { subject: g.subject, gradeCode: g.grade_code, area: g.area, code: g.standard_code, text: g.standard_text, verb: '', intent: '', descriptor: '' };
    setSel(std);
    setVerb(std.verb || ''); setIntent(std.intent || ''); setDescriptor(std.descriptor || '');
    setLadder({});
    setGoal(g.semester_goal || ''); setPlop(g.plop || '');
    setSchoolYear(g.school_year || new Date().getFullYear());
    setSem(String(g.semester || 1)); setCritType(g.crit_type || 'rate');
    setCStart(g.crit_start ?? 30); setCEnd(g.crit_end ?? 80);
    setMonthly(Array.isArray(g.monthly) ? g.monthly : []);
    setSemEval(g.semestral_eval || '');
    setEditingId(g.id);
    toast('불러왔어요. 수정 후 저장하면 이 목표가 갱신됩니다.');
    setTimeout(() => {
      const el = typeof document !== 'undefined' && document.getElementById('iep-editor');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function newGoal() {
    setSel(null); setEditingId(null); setMonthly([]); setSemEval(''); setGoal('');
    setVerb(''); setIntent(''); setDescriptor(''); setLadder({});
  }

  // 전년도 목표 하나를 "기준"으로 삼아 올해 목표 작성을 시작.
  function startFromPrior(g) {
    const s = { subject: g.subject, gradeCode: g.grade_code, area: g.area, code: g.standard_code || 'PRIOR', text: g.semester_goal || g.standard_text || '', verb: '', intent: '', descriptor: '' };
    setSel(s); setVerb(''); setIntent(''); setDescriptor(''); setLadder({});
    setGoal(g.semester_goal || ('스스로 ' + (s.text || '').replace(/\s*\.?$/, '') + '.'));
    if (g.plop) setPlop(g.plop);
    setEditingId(null); setMonthly([]); setSemEval('');
    toast(`${g.school_year} ${g.subject} 목표를 기준으로 불러왔어요. "✨ AI 생성"으로 올해 목표를 만드세요.`);
    setTimeout(() => { const el = typeof document !== 'undefined' && document.getElementById('iep-editor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }

  const targets = useMemo(() => {
    let lastOk = -1, anyNo = false;
    LEVELS.forEach((_, i) => { if (ladder[i] === 'ok') lastOk = i; if (ladder[i] === 'no') anyNo = true; });
    if (lastOk >= 0 && lastOk < LEVELS.length - 1) return [...new Set([lastOk + 1, Math.min(lastOk + 2, LEVELS.length - 1)])];
    if (lastOk === LEVELS.length - 1) return [LEVELS.length - 1];
    if (anyNo) return [1, 2];
    return [];
  }, [ladder]);

  function toggleLadder(i, v) {
    setLadder((prev) => ({ ...prev, [i]: prev[i] === v ? undefined : v }));
  }
  function useTargetAsGoal() {
    if (!sel) return;
    const i = targets[0];
    if (i == null) { toast('사다리에서 가능/어려움을 먼저 체크하세요.'); return; }
    setGoal(levelFocus(sel.text, i));
    toast('추천 목표를 학기목표로 가져왔어요.');
  }

  function generate() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    const ms = monthsOf(sem), n = ms.length;
    const base = baseOf(goal);
    const s = +cStart, e = +cEnd;
    const methods = methodsForType(curStu?.disability);
    const crit = (i) => {
      const v = Math.round(s + (e - s) * (i / (n - 1)));
      return critType === 'rate' ? `독립 수행 ${v}%` : `10회 중 ${Math.max(1, Math.round(v / 10))}회 성공`;
    };
    const support = (i) => SUP[Math.min(SUP.length - 1, Math.round((i / (n - 1)) * (SUP.length - 1)))];
    const stem = (verb || sel.verb || '').replace(/하기$|기$/, '');
    const obj = (descriptor || base).trim();
    const phase = (i) => CONTENT_SUFFIX[Math.min(CONTENT_SUFFIX.length - 1, Math.floor(i / (n / CONTENT_SUFFIX.length)))];
    const list = ms.map((m, i) => {
      const goal = [
        `- ${support(i)}${base}.`,
        `- ${crit(i)} 수준으로 수행하기.`,
        intent ? `- ${intent} 태도를 유지하며 활동에 참여하기.` : null,
      ].filter(Boolean).join('\n');
      const content = [
        `- ${sel.area ? sel.area + ' ' : ''}${obj} ${phase(i)}`,
        `- 교사 시범 후 ${stem ? stem + '하기를 ' : ''}단계별(과제분석)로 따라 하기`,
        `- ${i < n - 1 ? '구조화된 학습 자료로' : '실제·모의 상황에서'} ${stem ? stem + '하기 ' : ''}반복·적용하기`,
      ].join('\n');
      const evalText = [
        `- ${crit(i)} 기준 도달 여부 확인`,
        `- 수행 과정과 지원 수준의 변화를 서술 기록 (예: 초기 ${i === 0 ? '촉진 필요' : '부분 수행'} → 반복 후 ${i < n - 1 ? '독립성 증가' : '대부분 독립 수행'})`,
      ].join('\n');
      return { month: m, goal, content, methods: [...methods], eval: evalText };
    });
    setMonthly(list);
    setSemEval(`학기말 ${e}${critType === 'rate' ? '%' : '회'} 기준 도달 여부와 함께 학습 과정의 변화·일반화 정도를 서술 평가.`);
  }

  function editMonth(i, key, val) {
    setMonthly((prev) => prev.map((row, idx) => (idx === i
      ? { ...row, [key]: key === 'methods' ? val.split(/\r?\n/).map((x) => x.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean) : val }
      : row)));
  }

  // 열 너비: localStorage에서 복원
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('iep_colw'));
      if (Array.isArray(s) && s.length === 5) setColW(s);
    } catch (_) {}
  }, []);
  // 헤더 경계 드래그: idx 열과 오른쪽 이웃(idx+1) 열이 폭을 주고받아 전체 폭은 고정 유지.
  function startResize(idx, e) {
    e.preventDefault();
    const startX = e.clientX;
    const a = colW[idx];
    const b = colW[idx + 1];
    const move = (ev) => {
      let d = ev.clientX - startX;
      d = Math.max(d, 48 - a);
      d = Math.min(d, b - 48);
      setColW((prev) => {
        const n = [...prev];
        n[idx] = a + d;
        n[idx + 1] = b - d;
        return n;
      });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setColW((prev) => { try { localStorage.setItem('iep_colw', JSON.stringify(prev)); } catch (_) {} return prev; });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  function resetColW() {
    const d = [56, 240, 240, 160, 300];
    setColW(d);
    try { localStorage.setItem('iep_colw', JSON.stringify(d)); } catch (_) {}
  }

  async function aiDecompose() {
    if (!sel) return;
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setAiDecBusy(true);
    try {
      const prompt =
        '다음 2022 개정 특수교육 기본교육과정 성취기준을 "평가초점 개발" 방법론에 따라 세 요소로 분해하세요.\n' +
        '- verb: 측정 가능한 동사(과정·기능). 명사형(예: 탐색하기, 비교하기)으로.\n' +
        '- intent: 행위의 지향(가치·태도). 부사/태도 표현. 없으면 빈 문자열.\n' +
        '- descriptor: 서술자(지식·이해·대상). 무엇에 대한 것인지 핵심 대상/내용.\n' +
        '반드시 JSON 객체 하나만 출력하세요. 예: {"verb":"탐색하기","intent":"다양하게","descriptor":"나"}\n\n' +
        `성취기준: [${sel.code}] ${sel.text}`;
      const j = await llmJSON('AI 분해', prompt, { temperature: 0.2 });
      if (j.verb != null) setVerb(String(j.verb));
      if (j.intent != null) setIntent(String(j.intent));
      if (j.descriptor != null) setDescriptor(String(j.descriptor));
      toast('AI가 성취기준을 분해했어요.');
    } catch (e) {
      toast('AI 분해 실패: ' + e.message);
    } finally {
      setAiDecBusy(false);
    }
  }

  // 학생의 누적 데이터를 비식별 요약으로 묶는다 (AI 프롬프트용).
  function buildStudentSummary(data) {
    const lines = [];
    lines.push(`학생: ${curStu.code} (익명 ID) · ${curStu.level || ''} · ${curStu.disability || ''}`);
    if (curStu.note) lines.push(`비식별 요약: ${curStu.note}`);
    const abc = data?.abc || [];
    if (abc.length) {
      lines.push(`ABC 관찰 ${abc.length}건. 최근 사례:`);
      abc.slice(-3).forEach((r) => lines.push(`  · 선행 "${r.antecedent || ''}" → 행동 "${r.behavior || ''}" → 후속 "${r.consequence || ''}"`));
    }
    const mon = data?.mon || [];
    if (mon.length) lines.push(`행동 데이터 ${mon.length}건 누적(빈도/강도 기록).`);
    const sz = data?.sz || [];
    if (sz.length) lines.push(`심리안정실 이용 ${sz.length}회.`);
    const bip = data?.bip || {};
    if (bip.alt || bip.prev || bip.teach) {
      lines.push(`BIP: 대체행동 "${bip.alt || ''}", 예방 "${bip.prev || ''}", 교수 "${bip.teach || ''}", 강화 "${bip.reinf || ''}".`);
    }
    const qabf = data?.qabf || [];
    if (Array.isArray(qabf) && qabf.some((v) => v >= 0)) lines.push('QABF 기능평가 완료(행동 기능 분석 자료 있음).');
    return lines.join('\n');
  }

  // 생성 프롬프트 문자열을 만든다(AI 호출/수동 복사 공용).
  async function buildGenPrompt() {
    const data = curStuData || (await ensureStudentData(curStuId)) || {};
    const ms = monthsOf(sem);
    const u = critType === 'rate' ? '%' : '회';
    const summary = buildStudentSummary(data);
    const priorGoals2 = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear);
    const priorBlock = priorGoals2.length
      ? '\n[전년도 IEP 참고]\n' + priorGoals2.slice(0, 12).map((g) => `· (${g.school_year} ${g.semester}학기) ${g.subject}${g.area ? '·' + g.area : ''}: 목표 "${g.semester_goal}" / 평가 "${g.semestral_eval || '-'}"`).join('\n') + '\n'
      : '';
    return (
      `너는 특수교육 IEP 작성 전문가다. 아래 "학생 자료"와 "전년도 IEP"를 실제로 반영해, 선택한 성취기준에 대한 개별화교육계획을 작성하라.\n\n` +
      `[학생 자료]\n${summary}\n${priorBlock}\n` +
      `[성취기준] [${sel.code}] ${sel.text} (교과 ${sel.subject}${sel.area ? ' · ' + sel.area : ''})\n` +
      `[학기목표(참고)] ${goal}\n` +
      `[대상 월] ${ms.join(', ')} (총 ${ms.length}개월)\n` +
      `[평가 기준] ${critType === 'rate' ? '독립 수행 비율' : '기회 중 성공 횟수'} 기준을 ${cStart}${u}에서 ${cEnd}${u}로 매월 점증.\n\n` +
      `요구사항:\n` +
      `1) 현행수준(plop)은 위 학생 자료(ABC·행동데이터·BIP·안정실 등)를 근거로 구체적으로 서술.\n` +
      `2) 월별로 지원 수준을 점차 줄이며(도움받아→부분→독립→적용) 목표를 점증시킬 것.\n` +
      `3) 교육목표·교육내용·교육방법·평가는 각 줄을 "- "로 시작하는 항목으로 2~3개씩 상세히.\n` +
      `4) 평가에는 해당 학생 자료에 비추어 기대되는 변화를 서술형으로 포함.\n` +
      `5) 학생 실명/식별정보는 절대 쓰지 말 것(익명 ID만).\n` +
      `6) 학기목표(semester_goal)도 성취기준과 학생 자료를 반영해 측정 가능한 한 문장으로 작성.\n\n` +
      `반드시 아래 JSON만 출력(설명 금지):\n` +
      `{"semester_goal":"...","plop":"...","monthly":[{"month":${ms[0]},"goal":"- ...\\n- ...","content":"- ...\\n- ...","methods":["...","..."],"eval":"- ...\\n- ..."}],"semestral_eval":"..."}`
    );
  }

  // 파싱된 JSON을 화면에 적용(AI 응답/수동 붙여넣기 공용).
  function applyGen(j) {
    const ms = monthsOf(sem);
    if (j.semester_goal || j.semesterGoal) setGoal(String(j.semester_goal || j.semesterGoal));
    if (j.plop) setPlop(String(j.plop));
    if (Array.isArray(j.monthly) && j.monthly.length) {
      setMonthly(j.monthly.map((x, i) => ({
        month: x.month || ms[i] || ms[ms.length - 1],
        goal: String(x.goal || ''),
        content: String(x.content || ''),
        methods: Array.isArray(x.methods) ? x.methods.map(String) : String(x.methods || '').split(/\n|,/).map((s) => s.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean),
        eval: String(x.eval || x.evaluation || ''),
      })));
    }
    if (j.semestral_eval || j.semestralEval) setSemEval(String(j.semestral_eval || j.semestralEval));
  }

  async function aiGenerateFromData() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setAiGenBusy(true);
    try {
      const prompt = await buildGenPrompt();
      const j = await llmJSON('학생 데이터 반영 생성', prompt, { temperature: 0.4 });
      applyGen(j);
      toast('학생 데이터를 반영해 생성했어요.');
    } catch (e) {
      toast('AI 생성 실패: ' + e.message);
    } finally {
      setAiGenBusy(false);
    }
  }

  // AI 미연결: 프롬프트를 만들어 복사 → 외부 AI 응답을 붙여넣어 파싱.
  async function openManualPrompt() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    setManualOpen(true); setPasteText(''); setPromptText('프롬프트 생성 중…');
    try { setPromptText(await buildGenPrompt()); } catch (e) { setPromptText('프롬프트 생성 실패: ' + e.message); }
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(promptText); toast('프롬프트를 복사했어요.'); }
    catch (_) { toast('자동 복사가 막혔어요. 텍스트를 직접 선택해 복사하세요.'); }
  }
  function applyPasted() {
    const m = (pasteText || '').match(/\{[\s\S]*\}/);
    if (!m) { toast('붙여넣은 내용에서 JSON({…})을 찾지 못했어요.'); return; }
    try { applyGen(JSON.parse(m[0])); toast('응답을 파싱해 적용했어요.'); setManualOpen(false); }
    catch (e) { toast('JSON 파싱 실패: ' + e.message); }
  }


  async function save() {
    if (!curStuId || !sel) { toast('학생과 성취기준을 선택하세요.'); return; }
    if (!monthly.length) { toast('월별 목표를 먼저 생성하세요.'); return; }
    setBusy(true);
    try {
      const body = {
        school_year: schoolYear,
        subject: sel.subject, grade_code: sel.gradeCode, area: sel.area,
        standard_code: sel.code, standard_text: sel.text,
        semester: +sem, semester_goal: goal, plop,
        crit_type: critType, crit_start: +cStart, crit_end: +cEnd,
        monthly, semestral_eval: semEval,
      };
      if (editingId) body.id = editingId;
      const r = await saveIEPGoal(curStuId, body);
      toast(editingId ? 'IEP 목표 수정 완료' : 'IEP 목표 저장 완료');
      if (r?.goal?.id) setEditingId(r.goal.id);
      const d = await fetchIEP(curStuId);
      setSavedGoals(d.goals || []);
      return r;
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeGoal(id) {
    try {
      await deleteIEPGoal(curStuId, id);
      setSavedGoals((prev) => prev.filter((g) => g.id !== id));
      toast('삭제했습니다.');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  function exportWord(goals) {
    if (!goals.length) { toast('저장된 IEP 목표가 없습니다. 먼저 저장하세요.'); return; }
    downloadIepWord({
      student: { code: curStu.code, level: curStu.level, disability: curStu.disability },
      teacherName: user?.name || '',
      school: user?.school || '',
      goals,
    });
  }

  if (!curStu) return (<><StuHero /><NoStudentHint /></>);

  const priorGoals = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear);

  return (
    <>
      <StuHero />

      {/* 저장된 목표 — 수정 진입점(맨 위) */}
      {(goalsLoading || savedGoals.length > 0) && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🗂 저장된 IEP 목표 ({savedGoals.length}) <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>— 수정하려면 [✏ 수정], 새로 만들려면 아래에서 성취기준 선택</span></div>
            <button className="btn btn-ok btn-sm" onClick={() => exportWord(savedGoals)} disabled={goalsLoading}>📄 전체 Word 다운로드</button>
          </div>
          {goalsLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 2px', color: '#6b7280' }}>
              <span style={spinner} /> 저장된 목표를 불러오는 중…
            </div>
          )}
          {!goalsLoading && savedGoals.map((g) => (
            <div key={g.id} style={{ border: '1px solid ' + (editingId === g.id ? '#7c4dff' : '#e3e6eb'), background: editingId === g.id ? '#f5f0ff' : '#fff', borderRadius: 9, padding: '10px 12px', marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220, flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#3b6ef5', fontWeight: 700 }}>[{g.standard_code}] {g.subject}{g.area ? ' · ' + g.area : ''} · {GRADE[g.grade_code]} · {g.semester}학기</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>{g.semester_goal}</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3 }}>월별 {Array.isArray(g.monthly) ? g.monthly.length : 0}개월 · 수정 {g.updated_at}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <button className="btn btn-pri btn-sm" onClick={() => loadGoal(g)}>{editingId === g.id ? '수정 중' : '✏ 수정'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportWord([g])}>이 목표만 Word</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeGoal(g.id)}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 전년도 IEP 기준으로 시작 */}
      {priorGoals.length > 0 && (
        <div className="card" style={{ borderColor: '#d8c9ff' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>🔁 전년도 IEP 기준으로 생성 ({priorGoals.length})</div>
          <div className="card-subtitle">전년도 목표를 기준으로 불러온 뒤 "✨ AI 생성"을 누르면, 그 목표·평가를 이어받아 올해 목표를 만듭니다.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 8 }}>
            {priorGoals.slice(0, 12).map((g) => (
              <div key={g.id} style={{ border: '1px solid #e3e6eb', borderRadius: 9, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11.5, color: '#7c4dff', fontWeight: 700 }}>{g.school_year}학년도 {g.semester}학기 · {g.subject}{g.area ? ' · ' + g.area : ''}</div>
                <div style={{ fontSize: 13 }}>{g.semester_goal}</div>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => startFromPrior(g)}>이 목표 기준으로 →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ① 성취기준 선택 */}
      <div className="card">
        <div className="card-title">📋 ① 성취기준 선택</div>
        <div className="card-subtitle">2022 개정 기본교육과정 성취기준 {rows.length || ''}개에서 교과·학년군·영역으로 좁혀 선택합니다.</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">교과</label>
            <select className="form-input" value={fSubject} onChange={(e) => { setFSubject(e.target.value); setFGrade(''); setFArea(''); }}>
              <option value="">전체 교과</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">학년군</label>
            <select className="form-input" value={fGrade} onChange={(e) => { setFGrade(e.target.value); setFArea(''); }}>
              <option value="">전체 학년군</option>
              {grades.map((g) => <option key={g} value={g}>{GRADE[g]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">영역</label>
            <select className="form-input" value={fArea} onChange={(e) => setFArea(e.target.value)}>
              <option value="">전체 영역</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">검색어</label>
            <input className="form-input" value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="예: 화폐, 덧셈, 높임말" />
          </div>
        </div>
        <div className="form-label" style={{ marginTop: 4 }}>후보 {candidates.length}개{candidates.length > 200 ? ' (상위 200개 표시)' : ''}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8, maxHeight: 280, overflow: 'auto' }}>
          {candidates.slice(0, 200).map((r) => (
            <div key={r.code} onClick={() => pickStandard(r)}
              style={{ border: '1px solid ' + (sel?.code === r.code ? '#3b6ef5' : '#e3e6eb'), background: sel?.code === r.code ? '#eaf0ff' : '#fff', borderRadius: 9, padding: '8px 11px', cursor: 'pointer' }}>
              <div style={{ fontSize: 11, color: '#3b6ef5', fontWeight: 700 }}>[{r.code}] {GRADE[r.gradeCode]}{r.area ? ' · ' + r.area : ''}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{r.text}</div>
            </div>
          ))}
          {!candidates.length && <div className="empty-state">조건에 맞는 성취기준이 없어요.</div>}
        </div>
      </div>

      {/* ② 평가초점 분해 + ZPD */}
      {sel && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 0 }}>🔍 ② 평가초점 개발 (분해 → 지원 수준 · ZPD)</div>
              <div className="card-subtitle">선택: [{sel.code}] {sel.text}</div>
            </div>
            {aiOn && <button className="btn btn-ghost btn-sm" onClick={aiDecompose} disabled={aiDecBusy}>{aiDecBusy ? 'AI 분해 중…' : '✨ AI 분해'}</button>}
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">측정 가능한 동사 (과정·기능)</label><input className="form-input" value={verb} onChange={(e) => setVerb(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">행위의 지향 (가치·태도)</label><input className="form-input" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="(없으면 비움)" /></div>
          </div>
          <div className="form-group"><label className="form-label">서술자 (지식·이해·대상)</label><textarea className="form-textarea" value={descriptor} onChange={(e) => setDescriptor(e.target.value)} /></div>

          <label className="form-label" style={{ marginTop: 6 }}>지원 수준별 평가초점 — 각 단계에서 학생의 가능/어려움을 체크하면 학기목표 구간을 추천합니다.</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LEVELS.map((lv, i) => {
              const st = ladder[i];
              const isTarget = targets.includes(i);
              const bg = st === 'ok' ? '#e6f6ef' : st === 'no' ? '#fdf1e3' : isTarget ? '#f0eaff' : '#fff';
              const bd = isTarget ? '#7c4dff' : st === 'ok' ? '#bfe6d4' : st === 'no' ? '#f3dab4' : '#e3e6eb';
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', border: '1px solid ' + bd, borderRadius: 9, padding: '8px 11px', background: bg }}>
                  <div style={{ fontWeight: 700, color: '#6b7280' }}>{lv.n}</div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{lv.role}{isTarget ? ' · 학기목표 후보' : ''}</span><br />{levelFocus(sel.text, i)}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className={'btn btn-sm ' + (st === 'ok' ? 'btn-ok' : 'btn-ghost')} onClick={() => toggleLadder(i, 'ok')}>가능</button>
                    <button className={'btn btn-sm ' + (st === 'no' ? 'btn-pri' : 'btn-ghost')} onClick={() => toggleLadder(i, 'no')}>어려움</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-pri" onClick={useTargetAsGoal}>↓ 추천 목표를 학기목표로</button>
          </div>
        </div>
      )}

      {/* ③ 목표 생성 */}
      {sel && (
        <div className="card" id="iep-editor">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🎯 ③ 목표 생성 (학기목표 → 월별 점증)
              {editingId && <span className="badge badge-purple" style={{ marginLeft: 8 }}>수정 중</span>}
            </div>
            {editingId && <button className="btn btn-ghost btn-sm" onClick={newGoal}>+ 새 목표 작성</button>}
          </div>
          <div className="form-group"><label className="form-label">학기목표 (수정 가능)</label><textarea className="form-textarea" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">현행수준 (학생 비식별 요약에서 연동 · 수정 가능)</label><textarea className="form-textarea" value={plop} onChange={(e) => setPlop(e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">학년도</label>
              <input type="number" className="form-input" value={schoolYear} onChange={(e) => setSchoolYear(Number(e.target.value))} /></div>
            <div className="form-group"><label className="form-label">학기</label>
              <select className="form-input" value={sem} onChange={(e) => setSem(e.target.value)}><option value="1">1학기 (3~7월)</option><option value="2">2학기 (9~12월)</option></select></div>
            <div className="form-group"><label className="form-label">평가 방식</label>
              <select className="form-input" value={critType} onChange={(e) => setCritType(e.target.value)}><option value="rate">독립 수행 비율(%)</option><option value="freq">기회 중 성공 횟수(10회 중)</option></select></div>
            <div className="form-group"><label className="form-label">시작 수준</label><input type="number" className="form-input" value={cStart} onChange={(e) => setCStart(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">학기말 목표</label><input type="number" className="form-input" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-pri" onClick={generate}>규칙 초안 (빠름, AI 없음)</button>
            {aiOn
              ? <button className="btn btn-ok" onClick={aiGenerateFromData} disabled={aiGenBusy}>{aiGenBusy ? 'AI 생성 중…' : '✨ AI 생성 (학생 데이터 반영)'}</button>
              : <button className="btn btn-ok" onClick={openManualPrompt}>📋 AI 프롬프트 생성 (복사 → 외부 AI → 붙여넣기)</button>}
          </div>
          <div className="card-subtitle" style={{ marginTop: 8 }}>교육방법 기본값은 학생 장애유형({curStu.disability || '미지정'})에 맞춰 채워집니다: {methodsForType(curStu.disability).join(', ')}</div>

          {monthly.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div className="form-label" style={{ margin: 0 }}>월별 개별화교육계획/평가 (모든 칸 수정 가능 · 헤더 경계를 끌어 열 너비 조절)</div>
                <button className="btn btn-ghost btn-sm" onClick={resetColW}>열 너비 초기화</button>
              </div>
              <div>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' }}>
                  <colgroup>{(() => { const t = colW.reduce((a, b) => a + b, 0); return colW.map((w, i) => <col key={i} style={{ width: (w / t * 100) + '%' }} />); })()}</colgroup>
                  <thead><tr>
                    {['월', '교육목표', '교육내용', '교육방법', '평가(서술형)'].map((h, i) => (
                      <th key={i} style={{ ...thS(), position: 'relative', whiteSpace: 'nowrap' }}>{h}
                        {i < 4 && <span onMouseDown={(e) => startResize(i, e)} title="드래그하여 너비 조절"
                          style={{ position: 'absolute', top: 0, right: -3, width: 8, height: '100%', cursor: 'col-resize', userSelect: 'none' }} />}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {monthly.map((m, i) => (
                      <tr key={i}>
                        <td style={{ ...tdS, fontWeight: 700, textAlign: 'center', background: '#f3f6fc', color: '#3b6ef5' }}>{m.month}월</td>
                        <td style={tdS}><textarea style={cellInput} value={m.goal} onChange={(e) => editMonth(i, 'goal', e.target.value)} /></td>
                        <td style={tdS}><textarea style={cellInput} value={m.content} onChange={(e) => editMonth(i, 'content', e.target.value)} /></td>
                        <td style={tdS}><textarea style={cellInput} value={(m.methods || []).map((x) => '- ' + x).join('\n')} onChange={(e) => editMonth(i, 'methods', e.target.value)} /></td>
                        <td style={tdS}><textarea style={cellInput} value={m.eval} onChange={(e) => editMonth(i, 'eval', e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}><label className="form-label">학기말 종합 평가 (서술형)</label><textarea className="form-textarea" value={semEval} onChange={(e) => setSemEval(e.target.value)} /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-pri" onClick={save} disabled={busy}>{editingId ? '💾 수정 저장' : '💾 IEP 목표 저장'}</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* AI 통신 로그 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>🧪 AI 통신 로그 ({aiLog.length})</div>
          {aiLog.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setAiLog([])}>로그 지우기</button>}
        </div>
        {aiLog.length === 0 && <div className="card-subtitle">AI 버튼을 누르면 요청·응답 상태(성공/실패·finish_reason·길이)와 응답 원문이 여기에 기록됩니다.</div>}
        {aiLog.map((e, i) => (
          <div key={i} style={{ borderTop: '1px solid #eee', padding: '6px 0', fontSize: 12.5 }}>
            <span style={{ color: '#6b7280' }}>{e.t}</span>{' '}
            <span style={{ fontWeight: 700, color: e.status === 'ok' ? '#15a36e' : e.status === 'error' ? '#c0392b' : '#3b6ef5' }}>
              [{e.status === 'ok' ? '성공' : e.status === 'error' ? '실패' : '요청'}]</span>{' '}
            <b>{e.label}</b> — {e.detail}
            {e.raw && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: 'pointer', color: '#3b6ef5' }}>응답 원문 보기</summary>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 8, borderRadius: 6, maxHeight: 260, overflow: 'auto', fontSize: 11.5, marginTop: 4 }}>{e.raw}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} maxWidth={700}>
        <h3>📋 AI 프롬프트 (연결된 AI 없이 사용)</h3>
        <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, marginTop: 4 }}>
          ① 아래 프롬프트를 복사해 ChatGPT·Claude 등 외부 AI에 붙여넣으세요. ② AI가 준 <b>JSON 응답</b>을 아래 칸에 붙여넣고 "응답 적용"을 누르면 화면에 채워집니다.
        </p>
        <div className="form-group">
          <label className="form-label">① 프롬프트 (복사해서 외부 AI에 붙여넣기)</label>
          <textarea className="form-textarea" rows={8} readOnly value={promptText} onFocus={(e) => e.target.select()} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-ghost" onClick={copyPrompt}>📋 프롬프트 복사</button>
        </div>
        <div className="form-group">
          <label className="form-label">② AI 응답 붙여넣기 (JSON)</label>
          <textarea className="form-textarea" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'AI가 준 응답을 그대로 붙여넣으세요. {"semester_goal":...,"monthly":[...]} 형태의 JSON을 자동으로 찾아 적용합니다.'} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setManualOpen(false)}>닫기</button>
          <button className="btn btn-pri" onClick={applyPasted}>응답 적용</button>
        </div>
      </Modal>
    </>
  );
}

const thS = (w) => ({ background: '#2f5496', color: '#fff', border: '1px solid #d9d9d9', padding: '8px 9px', fontSize: 12, ...(w ? { width: w } : {}) });
const tdS = { border: '1px solid #e3e6eb', padding: 6, verticalAlign: 'top', wordBreak: 'break-word', overflow: 'hidden' };
const cellInput = { width: '100%', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: 12.5, background: 'transparent', lineHeight: 1.55, minHeight: 70, whiteSpace: 'pre-wrap' };
const spinner = { display: 'inline-block', width: 18, height: 18, border: '3px solid rgba(79,107,237,.25)', borderTopColor: '#4f6bed', borderRadius: '50%', animation: 'spin .8s linear infinite' };
