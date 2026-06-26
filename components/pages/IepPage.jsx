import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchIEP, saveIEPGoal, deleteIEPGoal, fetchStartpoint } from '../../lib/api/students';
import { buildPyeongPrompt, parsePyeongLines, PYEONG_LEVELS } from '../../lib/pyeong';
import { downloadIepWord, downloadIepFormWord, downloadTaskSheet } from '../../lib/utils/printIep';

const GRADE = { 0: '일상생활(공통)', 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };
const GORDER = [2, 4, 6, 9, 12];

// 「일상생활 활동」 영역 계층 구조: 대영역(5) → 중영역(하위 영역)
// 출처: 개별화교육계획 가이드북 / 일상생활 활동 영역 구분
const DAILY_SUBJECT = '일상생활 활동';
const DAILY_AREA_GROUPS = {
  '의사소통': ['의사소통의 기초', '보완대체의사소통의 탐색과 선택', '의사소통의 활용'],
  '자립생활': ['신변 자립', '자기 관리', '안전한 생활', '자기 결정과 상호 작용'],
  '생활 적응': ['감각 지각과 활용', '의사소통 방법의 선택과 적용', '수용과 표현', '대인 관계 형성과 규범 실천', '공동체 및 지역사회 참여', '신체 긴장도 조절', '신체 동작 기초 기술', '의사소통 기초 기술'],
  '여가활동': ['개인 여가활동', '공동체 여가활동', '지역사회 여가활동'],
  '신체활동': ['신체 인지와 움직임', '신체 조절과 이동', '생활 속 체력 증진'],
};
const DAILY_BIG_AREAS = Object.keys(DAILY_AREA_GROUPS);
// 중영역(하위 영역) → 대영역 역매핑
const DAILY_MID_TO_BIG = Object.entries(DAILY_AREA_GROUPS).reduce((acc, [big, mids]) => {
  mids.forEach((m) => { acc[m] = big; });
  return acc;
}, {});

// 월별 점증 시 지원 수준 표현(서술 보조용). 평가초점을 나누는 기준이 아님.
const SUP = ['교사의 도움을 받아 ', '부분적으로 ', '교사 감독 하에 스스로 ', '스스로 ', '다양한 상황에서 스스로 '];
const CONTENT_SUFFIX = ['탐색·모방 활동', '구조화된 연습 활동', '실제 상황 적용 연습', '모의·실제 상황 일반화 활동'];

function methodsForType(disability) {
  const d = disability || '';
  if (d.includes('자폐')) return ['시각적 지원', '구조화 교수', '사회적 이야기', '과제분석'];
  if (d.includes('주의') || d.toUpperCase().includes('ADHD')) return ['짧은 활동', '즉각 강화', '자기점검', '시각적 일정'];
  if (d.includes('지적')) return ['직접교수', '모델링', '과제분석', '반복연습', '즉각 강화'];
  return ['모델링', '직접교수', '과제분석', '즉각 강화'];
}
// 과제 분석 — 교수 순서(연쇄)·촉진 체계 라벨 및 서술 도우미.
const CHAIN_LABEL = { forward: '전진형', backward: '후진형', total: '전체과제 제시형' };
const PROMPT_LABEL = { mtl: '최대-최소촉진', slp: '최소촉진체계', td: '시간지연', sim: '동시촉진' };
// 과제 분석 시 교육방법 기본값에 결합 EBP(증거기반실제)를 더한다.
function methodsForTask(disability, promptSystem) {
  const add = ['과제분석', '비디오 모델링', '그림 촉진'];
  if (promptSystem === 'td') add.push('시간지연');
  if (promptSystem === 'slp') add.push('최소촉진체계');
  if (promptSystem === 'sim') add.push('동시촉진');
  return [...new Set([...methodsForType(disability), ...add])];
}
// 교수 순서(연쇄)에 따라 "이번 달 독립 수행 단계" 서술.
function chainDesc(chainType, totalSteps, indep) {
  if (indep <= 0) return `전 단계 교사 촉진(${CHAIN_LABEL[chainType] || '전진형'}: 한 단계씩 독립화 시작)`;
  if (chainType === 'backward') {
    const from = Math.max(1, totalSteps - indep + 1);
    return `마지막 ${indep}단계(${from}~${totalSteps}단계)를 독립 수행, 앞 단계는 교사 촉진`;
  }
  if (chainType === 'total') return `매 회기 전체 ${totalSteps}단계를 순서대로 수행하며 독립 수행 단계를 ${indep}개로 확대`;
  return `1~${indep}단계를 독립 수행, 이후 단계는 교사 촉진`;
}
// 촉진 체계에 따라 "이번 달 촉진 방식" 서술. i/n로 점증.
function promptDesc(promptSystem, i, n, supFn) {
  const frac = n > 1 ? i / (n - 1) : 1;
  if (promptSystem === 'slp') return `최소촉진체계 — 독립 시도 후 못 하면 약한 촉진(언어→시범→신체) 순으로 제공`;
  if (promptSystem === 'td') { const sec = [0, 2, 3, 4, 5][Math.min(4, Math.round(frac * 4))]; return `시간지연 — 촉진 전 ${sec}초 대기로 독립 반응 기회 확대`; }
  if (promptSystem === 'sim') return `동시촉진 — 교수 회기엔 촉진과 동시 수행, 매일 점검(probe)으로 독립 수준 평가`;
  return `최대-최소촉진 — ${supFn(i).trim()} 수준에서 촉진을 점차 줄여 독립으로`;
}
const monthsOf = (sem) => (String(sem) === '2' ? [9, 10, 11, 12, 1] : [3, 4, 5, 6, 7]);
const baseOf = (goal) => goal.replace(/^스스로\s*/, '').replace(/\s*\.?$/, '');

// 받침 유무로 을/를 조사 선택
function josaEulReul(word) {
  const w = (word || '').trim();
  if (!w) return '을';
  const last = w[w.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '을(를)';
  return (code - 0xAC00) % 28 === 0 ? '를' : '을';
}
// 동사를 평서형(~한다)으로 변환
function verbToDeclarative(verb) {
  const v = (verb || '').trim();
  if (!v) return '수행한다';
  if (v.endsWith('하기')) return v.slice(0, -2) + '한다';
  if (v.endsWith('기')) return v.slice(0, -1) + '다';
  if (v.endsWith('다')) return v;
  return v + '한다';
}
// 성취기준 분석/해석 결과(동사·행위지향·서술자)로 평가초점 목록 생성.
// 지원 수준이 아니라 "서술자(대상/내용) + 같은 의미의 여러 동사"의 스펙트럼을 펼쳐 평가초점을 만든다.
// verbAlts: 대표 동사와 "같은 의미"로 쓸 수 있는 측정 가능한 동사 목록(예: 시도하기 → 말 걸기, 대답하기 …).
//           주어지면 평가초점마다 동사를 번갈아 사용해 같은 의미를 다양한 행동으로 표현한다.
function buildEvalFoci(verb, intent, descriptor, fallbackText, verbAlts) {
  const raw = (descriptor || '').trim() || (fallbackText || '').replace(/\s*\.?$/, '');
  const items = raw.split(/[,/·、|\n]+| 및 | 와 | 과 /).map((s) => s.trim()).filter(Boolean);
  const objs = items.length ? items : [raw];
  // 동의어 동사 목록: verbAlts 우선, 없으면 동사 칸에 쉼표·줄바꿈으로 직접 적은 여러 동사도 허용.
  const verbs = (Array.isArray(verbAlts) && verbAlts.length
    ? verbAlts
    : String(verb || '').split(/[,/·、|\n]+/))
    .map((v) => v.trim()).filter(Boolean);
  const vlist = verbs.length ? verbs : [verb];
  const lead = intent ? intent.trim() + ' ' : '';
  // 서술자·동사 중 많은 쪽 길이에 맞춰 펼치되, 동사를 번갈아 써서 같은 의미를 다양하게 표현.
  const n = Math.max(objs.length, vlist.length);
  const list = [];
  for (let i = 0; i < n; i++) {
    const it = objs[i % objs.length];
    const decl = verbToDeclarative(vlist[i % vlist.length]);
    list.push(`${lead}${it}${josaEulReul(it)} ${decl}.`);
  }
  return [...new Set(list)];
}

// LLM이 종종 살짝 깨진 JSON을 내놓는다(예: "eval":": " 처럼 콜론·따옴표 중복, 후행 콤마).
// 1차 파싱 실패 시 흔한 오류를 보정해 한 번 더 시도한다.
function parseLooseJSON(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('JSON({…})을 찾지 못했어요.');
  const text = m[0];
  try {
    return JSON.parse(text);
  } catch (e1) {
    const repaired = text
      .replace(/```(?:json)?/gi, '')
      .replace(/:\s*"\s*:\s*"/g, ': "')          // "key":": "  →  "key": "
      .replace(/”|“/g, '"').replace(/’|‘/g, "'")  // 스마트 따옴표 정규화
      .replace(/,\s*([}\]])/g, '$1');             // 후행 콤마 제거
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      throw e1; // 원본 오류 메시지를 노출
    }
  }
}

export default function IepPage() {
  const { curStu, curStuId, curStuData, ensureStudentData, curYear, curSemester, studentTier, tier2Groups } = useStudents();
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
      const j = parseLooseJSON(m[0]);
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
  const [fBigArea, setFBigArea] = useState(''); // 일상생활 활동 대영역
  const [fArea, setFArea] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [sel, setSel] = useState(null);

  const [verb, setVerb] = useState('');
  const [verbAlts, setVerbAlts] = useState([]); // 대표 동사와 같은 의미의 측정 가능한 동사 목록
  const [intent, setIntent] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [evalFoci, setEvalFoci] = useState([]); // 평가초점 목록(성취기준 분석→해석→개발)

  const [goal, setGoal] = useState('');
  const [plop, setPlop] = useState('');
  // 기본 학년도·학기는 상단 전역 선택값을 따른다(반·학기 일관성).
  const [schoolYear, setSchoolYear] = useState(curYear || new Date().getFullYear());
  const [sem, setSem] = useState(String(curSemester || 1));
  const [critType, setCritType] = useState('rate');
  const [supportTier, setSupportTier] = useState(''); // 모듈4: 지원 수준(Tier 1/2/3)
  const [startpoint, setStartpoint] = useState(null); // 모듈1 출발점 산출물(연동용)
  const [pyeongLines, setPyeongLines] = useState([]); // 교과 평어 생성 결과
  const [pyeongLevel, setPyeongLevel] = useState('');
  const [pyeongBusy, setPyeongBusy] = useState(false);
  const [cStart, setCStart] = useState(30);
  const [cEnd, setCEnd] = useState(80);
  const [taskSteps, setTaskSteps] = useState([]); // 과제 분석(critType='task')용 순차 단계 목록
  const [taskBusy, setTaskBusy] = useState(false); // 단계 자동 분석 진행 상태
  const [chainType, setChainType] = useState('forward'); // 교수 순서(연쇄): forward/backward/total
  const [promptSystem, setPromptSystem] = useState('mtl'); // 촉진 체계: mtl/slp/td/sim
  const [monthly, setMonthly] = useState([]);
  const [semEval, setSemEval] = useState('');

  const [savedGoals, setSavedGoals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [aiDecBusy, setAiDecBusy] = useState(false);
  const [verbBusy, setVerbBusy] = useState(false); // 같은 의미 동사 펼치기 진행 상태
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

  // 모듈1 출발점 산출물 로드 (모듈2 목표 생성의 출발점으로 연동).
  useEffect(() => {
    if (!curStuId) { setStartpoint(null); return; }
    fetchStartpoint(curStuId).then((r) => setStartpoint(r?.data?.data || null)).catch(() => setStartpoint(null));
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
  const isDaily = fSubject === DAILY_SUBJECT;
  // 일상생활 활동: 데이터에 실제 존재하는 대영역만 노출
  const bigAreas = useMemo(() => {
    if (!isDaily) return [];
    const present = new Set(rows.filter((r) => r.subject === DAILY_SUBJECT).map((r) => DAILY_MID_TO_BIG[r.area]).filter(Boolean));
    return DAILY_BIG_AREAS.filter((b) => present.has(b));
  }, [rows, isDaily]);
  const areas = useMemo(() => {
    const pool = rows.filter((r) => (!fSubject || r.subject === fSubject) && (!fGrade || r.gradeCode === +fGrade));
    let list = [...new Set(pool.map((r) => r.area).filter(Boolean))];
    // 일상생활 활동이고 대영역이 선택된 경우, 중영역만 그 그룹으로 좁힘
    if (isDaily && fBigArea) list = list.filter((a) => DAILY_MID_TO_BIG[a] === fBigArea);
    return list;
  }, [rows, fSubject, fGrade, isDaily, fBigArea]);
  const candidates = useMemo(() => {
    const q = fSearch.trim();
    return rows.filter((r) =>
      (!fSubject || r.subject === fSubject) &&
      (!fGrade || r.gradeCode === +fGrade) &&
      (!isDaily || !fBigArea || DAILY_MID_TO_BIG[r.area] === fBigArea) &&
      (!fArea || r.area === fArea) &&
      (!q || r.text.includes(q) || r.code.includes(q))
    );
  }, [rows, fSubject, fGrade, isDaily, fBigArea, fArea, fSearch]);

  function pickStandard(r) {
    setSel(r);
    setVerb(r.verb || ''); setIntent(r.intent || ''); setDescriptor(r.descriptor || '');
    setEvalFoci(buildEvalFoci(r.verb || '', r.intent || '', r.descriptor || '', r.text));
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
    setEvalFoci(Array.isArray(g.eval_foci) ? g.eval_foci : []);
    setGoal(g.semester_goal || ''); setPlop(g.plop || '');
    setSchoolYear(g.school_year || new Date().getFullYear());
    setSem(String(g.semester || 1)); setCritType(g.crit_type || 'rate');
    setSupportTier(g.support_tier || '');
    setCStart(g.crit_start ?? 30); setCEnd(g.crit_end ?? 80);
    setTaskSteps(Array.isArray(g.task_steps) ? g.task_steps : []);
    setChainType(g.chain_type || 'forward'); setPromptSystem(g.prompt_system || 'mtl');
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
    setVerb(''); setIntent(''); setDescriptor(''); setEvalFoci([]); setSupportTier(''); setTaskSteps([]);
    setChainType('forward'); setPromptSystem('mtl');
  }

  // 전년도 목표 하나를 "기준"으로 삼아 올해 목표 작성을 시작.
  function startFromPrior(g) {
    const s = { subject: g.subject, gradeCode: g.grade_code, area: g.area, code: g.standard_code || 'PRIOR', text: g.semester_goal || g.standard_text || '', verb: '', intent: '', descriptor: '' };
    setSel(s); setVerb(''); setIntent(''); setDescriptor(''); setEvalFoci([]); setTaskSteps([]);
    setChainType('forward'); setPromptSystem('mtl');
    setGoal(g.semester_goal || ('스스로 ' + (s.text || '').replace(/\s*\.?$/, '') + '.'));
    if (g.plop) setPlop(g.plop);
    setEditingId(null); setMonthly([]); setSemEval('');
    toast(`${g.school_year} ${g.subject} 목표를 기준으로 불러왔어요. "✨ AI 생성"으로 올해 목표를 만드세요.`);
    setTimeout(() => { const el = typeof document !== 'undefined' && document.getElementById('iep-editor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }

  // 평가초점 목록 편집
  function genFociNow() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    setEvalFoci(buildEvalFoci(verb, intent, descriptor, sel.text, verbAlts));
    toast('성취기준 분석·해석을 바탕으로 평가초점을 생성했어요.');
  }
  function addFocus() { setEvalFoci((prev) => [...prev, '']); }
  function editFocus(i, val) { setEvalFoci((prev) => prev.map((f, idx) => (idx === i ? val : f))); }
  function removeFocus(i) { setEvalFoci((prev) => prev.filter((_, idx) => idx !== i)); }

  // 과제 분석(critType='task') 단계 목록 편집 + 자동 분해
  function addStep() { setTaskSteps((prev) => [...prev, '']); }
  function editStep(i, val) { setTaskSteps((prev) => prev.map((s, idx) => (idx === i ? val : s))); }
  function removeStep(i) { setTaskSteps((prev) => prev.filter((_, idx) => idx !== i)); }
  // 단계 수에 맞춰 목표 독립 단계를 동기화(목표=전체 단계, 시작은 범위 내로 클램프).
  function syncTaskTargets(count) {
    if (!count) return;
    setCEnd(count);
    setCStart((p) => Math.min(Number(p) || 0, count));
  }
  // AI 없이도 쓸 수 있는 기본 단계 골격(교사가 편집해 완성).
  function ruleStepsNow() {
    const base = baseOf(goal) || (sel?.text || '').replace(/\s*\.?$/, '') || '과제';
    const arr = [
      '준비물·상황 확인하기',
      `${base} 시범 관찰하기`,
      `${base} 첫 단계 따라 하기`,
      `${base} 중간 단계 수행하기`,
      `${base} 전체 순서대로 수행하기`,
      '수행 결과 정리·점검하기',
    ];
    setTaskSteps(arr);
    syncTaskTargets(arr.length);
    toast('기본 단계 골격을 만들었어요. 학생 과제에 맞게 편집하세요.');
  }
  // 학기목표·성취기준을 순차 단계(과제분석)로 분해 — LLM 사용, 실패 시 기본 골격.
  async function aiStepsNow() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (!aiOn) { ruleStepsNow(); return; }
    setTaskBusy(true);
    try {
      const prompt =
        '다음 특수교육 학기목표(또는 성취기준)를 학생이 순서대로 수행할 "과제분석 단계"로 분해하라.\n' +
        '각 단계는 관찰 가능한 하나의 행동으로, 4~8개. 군더더기 없이 행동만 적는다.\n' +
        `학기목표: ${goal || sel.text}\n` +
        (sel?.text ? `성취기준: ${sel.text}\n` : '') +
        '아래 JSON만 출력: {"steps":["손 씻기","자리에 앉기"]}';
      const j = await llmJSON('과제분석 단계 분해', prompt, { tier: 'fast', temperature: 0.3 });
      const steps = Array.isArray(j.steps) ? j.steps.map((s) => String(s).trim()).filter(Boolean) : [];
      if (!steps.length) throw new Error('단계를 추출하지 못했어요.');
      setTaskSteps(steps);
      syncTaskTargets(steps.length);
      toast(`과제를 ${steps.length}개 단계로 분해했어요. 필요하면 편집하세요.`);
    } catch (e) {
      toast('단계 분해 실패: ' + e.message + ' — 기본 골격으로 대체합니다.');
      ruleStepsNow();
    } finally {
      setTaskBusy(false);
    }
  }

  function generate() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    const ms = monthsOf(sem), n = ms.length;
    const base = baseOf(goal);
    const s = +cStart, e = +cEnd;
    const isQual = critType === 'qual';
    const isTask = critType === 'task';
    const methods = isTask ? methodsForTask(curStu?.disability, promptSystem) : methodsForType(curStu?.disability);
    const foci = (evalFoci || []).map((f) => f.trim()).filter(Boolean);
    const steps = (taskSteps || []).map((t) => t.trim()).filter(Boolean);
    const totalSteps = steps.length || Math.max(+e || 0, 4); // 단계 미입력 시 목표 단계 수로 대체
    const stepChain = steps.length ? steps.map((t, k) => `${k + 1}) ${t}`).join(' → ') : '단계 목록 참조';
    const stepCount = (i) => Math.max(0, Math.min(totalSteps, Math.round(s + (e - s) * (i / (n - 1)))));
    const crit = (i) => {
      const v = Math.round(s + (e - s) * (i / (n - 1)));
      if (isTask) return `${totalSteps}단계 중 ${stepCount(i)}단계 독립 수행`;
      return critType === 'rate' ? `독립 수행 ${v}%` : `10회 중 ${Math.max(1, Math.round(v / 10))}회 성공`;
    };
    const support = (i) => SUP[Math.min(SUP.length - 1, Math.round((i / (n - 1)) * (SUP.length - 1)))];
    const stem = (verb || sel.verb || '').replace(/하기$|기$/, '');
    const obj = (descriptor || base).trim();
    const phase = (i) => CONTENT_SUFFIX[Math.min(CONTENT_SUFFIX.length - 1, Math.floor(i / (n / CONTENT_SUFFIX.length)))];
    // 평가초점을 월에 고르게 배분(질적 평가 서술의 기준점)
    const fociFor = (i) => (foci.length ? foci.filter((_, k) => k % n === i || (foci.length <= n && k === i)) : []);
    const list = ms.map((m, i) => {
      const goal = [
        `- ${support(i)}${base}.`,
        isQual ? null : `- ${crit(i)} 수준으로 수행하기.`,
        intent ? `- ${intent} 태도를 유지하며 활동에 참여하기.` : null,
      ].filter(Boolean).join('\n');
      const content = (isTask
        ? [
            `- 과제분석 ${totalSteps}단계를 순서대로 지도(${CHAIN_LABEL[chainType]}): ${stepChain}`,
            `- 이번 달 중점(${phase(i)}): ${chainDesc(chainType, totalSteps, stepCount(i))}`,
            `- 촉진: ${promptDesc(promptSystem, i, n, support)}`,
            i === n - 1 ? `- 유지·일반화: 다양한 장소·사람·자료로 ${stem ? stem + '하기 ' : ''}반복하고, 그림 촉진·비디오 모델링으로 자기주도 수행 지원` : null,
          ].filter(Boolean)
        : [
            `- ${sel.area ? sel.area + ' ' : ''}${obj} ${phase(i)}`,
            `- 교사 시범 후 ${stem ? stem + '하기를 ' : ''}단계별(과제분석)로 따라 하기`,
            `- ${i < n - 1 ? '구조화된 학습 자료로' : '실제·모의 상황에서'} ${stem ? stem + '하기 ' : ''}반복·적용하기`,
          ]).join('\n');
      const fThis = fociFor(i);
      const evalText = isQual
        ? [
            fThis.length ? `- 평가초점: ${fThis.join(' / ')}` : (foci.length ? `- 평가초점: ${foci.join(' / ')}` : `- 평가초점을 중심으로 수행 양상을 질적으로 기록`),
            `- 수업 맥락(교사 중재·학생 반응·또래/환경 상호작용)을 포함해 학습 과정과 결과를 서술 평가`,
            `- 초기 ${i === 0 ? '촉진 필요' : '부분 수행'} → 반복 후 ${i < n - 1 ? '독립성 증가' : '대부분 독립 수행'} 등 변곡점을 내러티브로 기록`,
          ].join('\n')
        : isTask
        ? [
            `- ${totalSteps}단계 중 ${stepCount(i)}단계 독립 수행을 단계별 체크리스트로 확인 (${CHAIN_LABEL[chainType]})`,
            `- 촉진 수준 변화 기록(${PROMPT_LABEL[promptSystem]}): ${promptDesc(promptSystem, i, n, support)}`,
            steps.length ? `- 미습득 단계 분석 후 과제분석 세분화·추가 지도(다음 지도 단계: ${steps[Math.min(steps.length - 1, stepCount(i))] || steps[steps.length - 1]})` : `- 미습득 단계 분석 후 추가 지도 계획 반영`,
          ].join('\n')
        : [
            `- ${crit(i)} 기준 도달 여부 확인`,
            foci.length ? `- 평가초점(${fThis.length ? fThis.join(' / ') : foci[0]}) 중심의 질적 수행 기록 병행` : `- 수행 과정과 지원 수준의 변화를 서술 기록`,
          ].join('\n');
      return { month: m, goal, content, methods: [...methods], eval: evalText };
    });
    setMonthly(list);
    setSemEval(isQual
      ? `평가초점을 중심으로 한 학기 학습 과정과 결과를 내러티브(서술형)로 종합 평가 — 수치·등급이 아니라 학생의 성장·변화 양상과 변곡점을 질적으로 기술.`
      : isTask
      ? `학기말 ${totalSteps}단계 중 ${Math.max(0, Math.min(totalSteps, e))}단계 독립 수행 도달 여부와 함께, 단계별 촉진 수준의 감소 양상과 미습득 단계의 변화를 과제분석 체크리스트 기준으로 종합 평가. 유지·일반화(다양한 상황 적용)와 자기주도(그림 촉진·비디오 모델링) 수행 정도도 함께 기술.`
      : `학기말 ${e}${critType === 'rate' ? '%' : '회'} 기준 도달 여부와 함께, 평가초점 중심의 학습 과정 변화·일반화 정도를 질적으로 서술 평가.`);
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

  // 같은 의미 동사 목록(vs)을 받아, 각 동사를 쓰는 자연스러운 평가초점 1문장씩 생성해 배열로 반환.
  // 동사를 한 문장씩 분리해 시키므로(작은 로컬 모델도) 동사가 실제로 다양해진다.
  async function requestFociFromVerbs(vs, useIntent, useDesc) {
    const prompt =
      '아래 성취기준의 "평가초점"을 작성합니다. 주어진 동사 목록의 각 동사마다, 그 동사를 사용하는 자연스러운 평가초점 문장을 정확히 1개씩 만드세요.\n' +
      '- 출력 foci의 개수 = 동사 목록의 개수, 순서도 동일.\n' +
      '- 각 문장은 해당 동사를 평서형(~한다)으로 끝내고, 대상에 맞는 조사·목적어를 자연스럽게 붙일 것(억지 조합 금지).\n' +
      '- 같은 의미를 서로 다른 구체 행동으로 표현. "지원 수준(도움받아/부분/독립)"으로 나누지 말 것.\n' +
      (useIntent ? `- 행위지향 "${useIntent}"의 취지를 자연스럽게 반영(모든 문장에 억지로 넣지는 말 것).\n` : '') +
      `성취기준: [${sel.code}] ${sel.text}\n` +
      `서술자(대상): ${useDesc || sel.text}\n` +
      `동사 목록: ${vs.join(', ')}\n` +
      '반드시 JSON 객체 하나만 출력. 예: {"foci":["생활 주변의 물체를 형태에 따라 나눈다.","생활 주변의 물체를 종류에 따라 구분한다.","비슷한 물체끼리 묶는다.","기준에 맞는 물체를 가려낸다."]}';
    const j = await llmJSON('평가초점 생성', prompt, { tier: 'fast', temperature: 0.45 });
    return Array.isArray(j.foci) ? j.foci.map(String).map((s) => s.trim()).filter(Boolean) : [];
  }

  // 동사 칸의 대표 동사를 "같은 의미의 측정 가능한 동사" 목록으로 펼친다(좁은 단일 과제 → 로컬 모델도 안정적).
  async function aiExpandVerbs() {
    const base = (verb || (sel && sel.verb) || '').trim();
    if (!base) { toast('먼저 측정 가능한 동사를 입력하거나 ✨ AI 분석을 실행하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setVerbBusy(true);
    try {
      const prompt =
        '특수교육 평가초점 작성을 돕습니다. 아래 "대표 동사"와 같은 의미·같은 성취 의도로 바꿔 쓸 수 있는 측정 가능한 동사(구체 행동 표현)를 6~8개 제시하세요.\n' +
        '- 모두 명사형(~하기/~기). 대표 동사 자신도 포함. 서로 다른 구체 행동이되 의미는 동일.\n' +
        '예: "분류하기" → {"verbs":["분류하기","나누기","구분하기","묶기","가려내기","골라내기","모으기"]}\n' +
        '예: "시도하기" → {"verbs":["시도하기","말 걸기","대답하기","표현하기","반응하기"]}\n' +
        '반드시 JSON 객체 하나만 출력.\n\n' +
        `대표 동사: ${base}` + (sel ? `\n맥락(성취기준): [${sel.code}] ${sel.text}` : '');
      const j = await llmJSON('동사 펼치기', prompt, { tier: 'fast', temperature: 0.4 });
      let alts = Array.isArray(j.verbs) ? j.verbs.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (base && !alts.includes(base)) alts = [base, ...alts];
      alts = [...new Set(alts)];
      if (!alts.length) { toast('같은 의미 동사를 받지 못했어요.'); return; }
      setVerbAlts(alts);
      // 성취기준이 선택돼 있으면 곧바로 동사별 평가초점까지 자연스럽게 생성.
      if (sel) {
        try { const foci = await requestFociFromVerbs(alts, intent, descriptor); if (foci.length) setEvalFoci(foci); } catch (_) {}
      }
      toast(`같은 의미 동사 ${alts.length}개로 펼쳤어요.`);
    } catch (e) {
      toast('동사 펼치기 실패: ' + e.message);
    } finally {
      setVerbBusy(false);
    }
  }

  async function aiDecompose() {
    if (!sel) return;
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setAiDecBusy(true);
    try {
      // 1단계: 성취기준 분석 — 대표 동사 + "같은 의미 동사" 목록 + 행위지향 + 서술자만 추출(평가초점 문장은 다음 단계에서).
      const aPrompt =
        '다음 2022 개정 특수교육 기본교육과정 성취기준을 분석하세요. 평가초점 문장은 만들지 말고 "요소"만 추출합니다.\n' +
        '- verb: 측정 가능한 대표 동사. 명사형(예: 분류하기, 탐색하기).\n' +
        '- verbs: 위 verb와 "같은 의미·같은 성취 의도"로 바꿔 쓸 수 있는 측정 가능한 동사 6~8개. 모두 명사형(~하기/~기), 대표 동사 자신도 포함. 서로 다른 구체 행동이되 의미는 동일.\n' +
        '   예: "분류하기" → ["분류하기","나누기","구분하기","묶기","가려내기","골라내기"]\n' +
        '   예: "시도하기" → ["시도하기","말 걸기","대답하기","표현하기","반응하기"]\n' +
        '- intent: 행위지향(가치·태도, 부사). 없으면 "".\n' +
        '- descriptor: 서술자(핵심 대상·내용).\n' +
        '반드시 JSON 객체 하나만 출력. 예: {"verb":"분류하기","verbs":["분류하기","나누기","구분하기","묶기","가려내기"],"intent":"형태나 종류에 따라","descriptor":"생활 주변의 물체"}\n\n' +
        `성취기준: [${sel.code}] ${sel.text}`;
      const a = await llmJSON('AI 분석', aPrompt, { tier: 'fast', temperature: 0.2 });
      const aVerb = a.verb != null ? String(a.verb).trim() : verb;
      let alts = Array.isArray(a.verbs) ? a.verbs.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (aVerb && !alts.includes(aVerb)) alts = [aVerb, ...alts];
      alts = [...new Set(alts)];
      const aIntent = a.intent != null ? String(a.intent) : intent;
      const aDesc = a.descriptor != null ? String(a.descriptor) : descriptor;
      if (a.verb != null) setVerb(aVerb);
      setVerbAlts(alts);
      if (a.intent != null) setIntent(aIntent);
      if (a.descriptor != null) setDescriptor(aDesc);

      // 2단계: 같은 의미 동사마다 자연스러운 평가초점 1문장 — 동사가 실제로 다양해지도록 분리 호출.
      let foci = [];
      if (alts.length >= 2) {
        try { foci = await requestFociFromVerbs(alts, aIntent, aDesc); } catch (_) {}
      }
      if (foci.length) setEvalFoci(foci);
      else setEvalFoci(buildEvalFoci(aVerb, aIntent, aDesc, sel.text, alts));
      toast(`성취기준을 분석하고 같은 의미 동사 ${alts.length}개로 평가초점을 펼쳤어요.`);
    } catch (e) {
      toast('AI 분석 실패: ' + e.message);
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
    // 모듈1 출발점 산출물 — 이 IEP 목표의 출발점(행동=지원요구 신호).
    const sp = startpoint || {};
    if (sp.supportNeeds || sp.functions || sp.perfLevel) {
      lines.push('[모듈1 출발점 — 학습자 분석 산출물]');
      if (sp.supportNeeds) lines.push(`  · 생활지원 요구: ${String(sp.supportNeeds).replace(/\n/g, ' / ')}`);
      if (sp.functions) lines.push(`  · 기능 목록화: ${String(sp.functions).replace(/\n/g, ' / ')}`);
      if (sp.perfLevel) lines.push(`  · 수행 가능 수준: ${String(sp.perfLevel).replace(/\n/g, ' / ')}`);
    }
    return lines.join('\n');
  }

  // 생성 프롬프트 문자열을 만든다(AI 호출/수동 복사 공용).
  async function buildGenPrompt() {
    const data = curStuData || (await ensureStudentData(curStuId)) || {};
    const ms = monthsOf(sem);
    const isQual = critType === 'qual';
    const isTask = critType === 'task';
    const u = isTask ? '단계' : (critType === 'rate' ? '%' : '회');
    const summary = buildStudentSummary(data);
    const fociBlock = (evalFoci || []).filter((f) => f.trim()).length
      ? `[평가초점] (성취기준 분석→해석으로 개발, 평가의 기준점)\n${evalFoci.filter((f) => f.trim()).map((f) => '· ' + f.trim()).join('\n')}\n`
      : '';
    const stepsArr = (taskSteps || []).map((t) => t.trim()).filter(Boolean);
    const stepsBlock = isTask
      ? (stepsArr.length
          ? `[과제 단계] (과제분석 — 학생이 순서대로 수행할 단계)\n${stepsArr.map((t, k) => `${k + 1}) ${t}`).join('\n')}\n`
          : `[과제 단계] 아직 미입력 — 학기목표를 4~8개의 순차 단계로 분해해 task_steps로 제안할 것.\n`)
      : '';
    const priorGoals2 = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear);
    const priorBlock = priorGoals2.length
      ? '\n[전년도 IEP 참고]\n' + priorGoals2.slice(0, 12).map((g) => `· (${g.school_year} ${g.semester}학기) ${g.subject}${g.area ? '·' + g.area : ''}: 목표 "${g.semester_goal}" / 평가 "${g.semestral_eval || '-'}"`).join('\n') + '\n'
      : '';
    const critLine = isQual
      ? `[평가 방식] 질적 평가 — 수치·등급이 아니라 위 평가초점을 중심으로 학습 과정과 결과를 내러티브(서술형)로 평가.\n`
      : isTask
      ? `[평가 방식] 과제 분석 — 전체 ${stepsArr.length || cEnd}단계. 교수 순서: ${CHAIN_LABEL[chainType]}, 촉진 체계: ${PROMPT_LABEL[promptSystem]}. (a) 독립 수행 단계 수를 ${cStart}→${cEnd}단계로 ${CHAIN_LABEL[chainType]} 방식으로 매월 점증, (b) 각 단계 촉진을 ${PROMPT_LABEL[promptSystem]}로 점차 약화. 단계별 체크리스트로 평가. 비디오 모델링·시간지연·그림 촉진 등 결합 EBP를 교육방법에 포함.\n`
      : `[평가 기준] ${critType === 'rate' ? '독립 수행 비율' : '기회 중 성공 횟수'} 기준을 ${cStart}${u}에서 ${cEnd}${u}로 매월 점증(양적). 평가초점 중심의 질적 서술을 병행.\n`;
    const tierLine = supportTier
      ? `[지원 수준] ${supportTier} — 이 학생에게 필요한 지원 강도. 교육방법·촉진 수준을 이 Tier에 맞춰 명시할 것.\n`
      : '';
    return (
      `너는 특수교육 IEP 작성 전문가다. 아래 "학생 자료"와 "전년도 IEP"를 실제로 반영해, 선택한 성취기준에 대한 개별화교육계획을 작성하라.\n\n` +
      `[학생 자료]\n${summary}\n${priorBlock}\n` +
      `[성취기준] [${sel.code}] ${sel.text} (교과 ${sel.subject}${sel.area ? ' · ' + sel.area : ''})\n` +
      fociBlock + stepsBlock +
      `[학기목표(참고)] ${goal}\n` +
      `[대상 월] ${ms.join(', ')} (총 ${ms.length}개월)\n` +
      critLine + tierLine + `\n` +
      `요구사항:\n` +
      `1) 현행수준(plop)은 위 학생 자료(ABC·행동데이터·BIP·안정실 등)를 근거로 구체적으로 서술.\n` +
      `2) 월별로 지원 수준을 점차 줄이며(도움받아→부분→독립→적용) 목표를 점증시킬 것.\n` +
      `3) 교육목표·교육내용·교육방법·평가는 각 줄을 "- "로 시작하는 항목으로 2~3개씩 상세히.\n` +
      `4) 평가(eval)는 ${isQual ? '평가초점을 중심으로, 수업 맥락·학생 반응·성장 변곡점을 담은 내러티브(서술형)로만 작성(수치 금지).' : isTask ? '전체 N단계 중 독립 수행 단계 수와 단계별 촉진 수준(전신→부분→시범→독립)의 변화를 함께 기록하는 과제분석 체크리스트형 서술로 작성.' : '양적 기준 도달 여부와 함께 평가초점 중심의 질적 서술을 함께 포함.'}\n` +
      `5) 학생 실명/식별정보는 절대 쓰지 말 것(익명 ID만).\n` +
      `6) 학기목표(semester_goal)도 성취기준과 학생 자료를 반영해 한 문장으로 작성.\n\n` +
      `반드시 아래 JSON만 출력(설명 금지):\n` +
      `{"semester_goal":"...","plop":"...",${isTask ? '"task_steps":["1단계 행동","2단계 행동"],' : ''}"monthly":[{"month":${ms[0]},"goal":"- ...\\n- ...","content":"- ...\\n- ...","methods":["...","..."],"eval":"- ...\\n- ..."}],"semestral_eval":"..."}`
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
    if (Array.isArray(j.task_steps) && j.task_steps.length) setTaskSteps(j.task_steps.map((s) => String(s).trim()).filter(Boolean));
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

  // 교과 평어(세부능력·특기사항) 생성 — 선택 성취기준 + 목표/현행수준/평가초점 반영.
  async function aiPyeong() {
    if (!sel) { toast('성취기준을 먼저 선택하세요.'); return; }
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setPyeongBusy(true); setPyeongLines([]);
    try {
      const perfParts = [];
      if (goal) perfParts.push('학기목표: ' + goal);
      if ((evalFoci || []).filter((f) => f.trim()).length) perfParts.push('평가초점: ' + evalFoci.filter((f) => f.trim()).join(' / '));
      if (plop) perfParts.push('현행수준: ' + plop);
      const prompt = buildPyeongPrompt({
        standard: `[${sel.code}] ${sel.text}`,
        performance: perfParts.join('\n') || '수업 활동 및 수행 전반',
        level: pyeongLevel,
        count: 12,
        context: curStu?.note || '',
      });
      const r = await callDetailed(prompt, { temperature: 0.6 });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const parsed = parsePyeongLines(out);
      if (!parsed.length) { toast('평어를 추출하지 못했어요. 다시 시도해 주세요.'); }
      setPyeongLines(parsed);
    } catch (e) { toast('평어 생성 실패: ' + e.message); }
    finally { setPyeongBusy(false); }
  }
  async function copyPyeongAll() {
    try { await navigator.clipboard.writeText(pyeongLines.map((l) => '- ' + l).join('\n')); toast('평어 전체 복사했어요.'); }
    catch (_) { toast('복사가 막혔어요. 직접 선택해 복사하세요.'); }
  }
  // 생성된 평어는 교사가 직접 수정 가능.
  function editPyeong(i, val) { setPyeongLines((prev) => prev.map((x, idx) => (idx === i ? val : x))); }
  function removePyeong(i) { setPyeongLines((prev) => prev.filter((_, idx) => idx !== i)); }

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
    try { applyGen(parseLooseJSON(pasteText)); toast('응답을 파싱해 적용했어요.'); setManualOpen(false); }
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
        support_tier: supportTier,
        eval_foci: (evalFoci || []).map((f) => f.trim()).filter(Boolean),
        task_steps: (taskSteps || []).map((t) => t.trim()).filter(Boolean),
        chain_type: chainType, prompt_system: promptSystem,
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

  // 평가초점 연수자료 양식(생활지원/교과 중심)대로 Word 내보내기
  function exportFormWord(goals) {
    if (!goals.length) { toast('저장된 IEP 목표가 없습니다. 먼저 저장하세요.'); return; }
    downloadIepFormWord({
      student: { code: curStu.code, level: curStu.level, disability: curStu.disability },
      teacherName: user?.name || '',
      school: user?.school || '',
      goals,
    });
  }

  // 과제분석 단계별 평가 기록지(데이터 수집 체크리스트) 인쇄용 Word 출력.
  function downloadTaskSheetNow() {
    const steps = (taskSteps || []).map((t) => t.trim()).filter(Boolean);
    if (!steps.length) { toast('단계를 먼저 만들어 주세요.'); return; }
    downloadTaskSheet({
      student: { code: curStu.code, level: curStu.level, disability: curStu.disability },
      teacherName: user?.name || '',
      school: user?.school || '',
      goalText: goal,
      steps, chainType, promptSystem,
    });
  }

  if (!curStu) return (<><StuHero /><NoStudentHint /></>);

  const priorGoals = savedGoals.filter((g) => g.school_year && g.school_year < schoolYear);

  const curTier = curStuId ? studentTier(curStuId) : 1;
  const curTierGroups = (tier2Groups || []).filter((g) => (g.members || []).some((m) => m.student_id === curStuId));
  const TIER_BADGE = { 1: { t: 'Tier 1 (학급 보편)', c: '#4f6bed' }, 2: { t: 'Tier 2 (소그룹)', c: '#e8590c' }, 3: { t: 'Tier 3 (개별)', c: '#c43653' } };

  return (
    <>
      <StuHero />

      {/* Tier 구성 참고 — IEP는 Tier 1·2·3 데이터를 조합해 목표를 세운다 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 14px', marginBottom: 4, borderRadius: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '.84rem',
      }}>
        <strong style={{ color: 'var(--pri)' }}>🧩 Tier 구성</strong>
        <span style={{
          padding: '2px 10px', borderRadius: 99, color: '#fff', fontWeight: 700, fontSize: '.76rem',
          background: TIER_BADGE[curTier].c,
        }}>{TIER_BADGE[curTier].t}</span>
        {curTierGroups.length > 0 && (
          <span style={{ color: 'var(--muted)' }}>소속 소그룹: {curTierGroups.map((g) => g.name).join(', ')}</span>
        )}
        <span style={{ color: 'var(--muted)' }}>· IEP 목표는 Tier 1(학급)·Tier 2(소그룹)·Tier 3(개별) 자료를 조합해 작성합니다.</span>
      </div>

      {/* 저장된 목표 — 수정 진입점(맨 위) */}
      {(goalsLoading || savedGoals.length > 0) && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🗂 저장된 IEP 목표 ({savedGoals.length}) <span style={{ fontWeight: 400, fontSize: 12, color: '#6b7280' }}>— 수정하려면 [✏ 수정], 새로 만들려면 아래에서 성취기준 선택</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-ok btn-sm" onClick={() => exportFormWord(savedGoals)} disabled={goalsLoading}>📄 양식 Word (생활지원/교과 중심)</button>
              <button className="btn btn-ghost btn-sm" onClick={() => exportWord(savedGoals)} disabled={goalsLoading}>📄 표 Word (월별 점증)</button>
            </div>
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
                  <button className="btn btn-ghost btn-sm" onClick={() => exportFormWord([g])}>양식 Word</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportWord([g])}>표 Word</button>
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
            <select className="form-input" value={fSubject} onChange={(e) => { setFSubject(e.target.value); setFGrade(''); setFBigArea(''); setFArea(''); }}>
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
          {isDaily && (
            <div className="form-group">
              <label className="form-label">대영역</label>
              <select className="form-input" value={fBigArea} onChange={(e) => { setFBigArea(e.target.value); setFArea(''); }}>
                <option value="">전체 대영역</option>
                {bigAreas.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{isDaily ? '중영역(하위 영역)' : '영역'}</label>
            <select className="form-input" value={fArea} onChange={(e) => setFArea(e.target.value)}>
              <option value="">{isDaily ? '전체 중영역' : '전체 영역'}</option>
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
              <div style={{ fontSize: 11, color: '#3b6ef5', fontWeight: 700 }}>[{r.code}] {GRADE[r.gradeCode]}{r.subject === DAILY_SUBJECT && DAILY_MID_TO_BIG[r.area] ? ' · ' + DAILY_MID_TO_BIG[r.area] + ' › ' + r.area : (r.area ? ' · ' + r.area : '')}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{r.text}</div>
            </div>
          ))}
          {!candidates.length && <div className="empty-state">조건에 맞는 성취기준이 없어요.</div>}
        </div>
      </div>

      {/* ② 평가초점 개발 (성취기준 분석 → 해석 → 평가초점) */}
      {sel && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 0 }}>🔍 ② 평가초점 개발 (성취기준 분석 → 해석 → 평가초점)</div>
              <div className="card-subtitle">선택: [{sel.code}] {sel.text}</div>
            </div>
            {aiOn && <button className="btn btn-ghost btn-sm" onClick={aiDecompose} disabled={aiDecBusy}>{aiDecBusy ? 'AI 분석 중…' : '✨ AI 분석'}</button>}
          </div>
          <div className="card-subtitle" style={{ marginTop: 2 }}>
            평가초점은 <strong>지원 수준으로 나누는 것이 아니라</strong>, 성취기준을 동사·행위지향·서술자로 분석하고 서술자(대상·내용)의 스펙트럼을 확장해 개발합니다.
          </div>
          <details style={{ margin: '6px 0 12px', background: 'var(--pri-soft)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.86rem', color: 'var(--pri-d)' }}>❓ 평가초점이 무엇인가요? (예시 보기)</summary>
            <div style={{ marginTop: 8, fontSize: '.84rem', color: 'var(--sub)', lineHeight: 1.7 }}>
              평가초점은 한 성취기준 안에서 학생이 <strong>“무엇을(서술자) 어떻게(동사)”</strong> 수행하는지를 여러 갈래로 펼쳐 둔, 질적 평가의 기준점이에요.
              ‘도움받아 / 독립’ 같은 지원 수준으로 나누는 것이 아닙니다.
              <div style={{ marginTop: 8, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>예) 성취기준: “자신을 소개한다”</div>
                <div style={{ marginTop: 4 }}>→ 평가초점 목록</div>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  <li>나의 신상(이름·나이)을 말한다</li>
                  <li>나의 선호(좋아하는 것)를 표현한다</li>
                  <li>나의 몸·기분 상태를 나타낸다</li>
                </ul>
              </div>
              팁: 아래 <strong>서술자</strong> 칸에 대상(예: 나의 신상, 나의 선호…)을 쉼표로 나열하면 초점이 자동으로 여러 개 만들어져요.
            </div>
          </details>
          <div className="form-row">
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <label className="form-label" style={{ margin: 0 }}>측정 가능한 동사 (과정·기능) — 쉼표로 같은 의미의 여러 동사 입력 가능</label>
                {aiOn && <button className="btn btn-ghost btn-sm" onClick={aiExpandVerbs} disabled={verbBusy} title="대표 동사를 같은 의미의 여러 동사로 펼칩니다">{verbBusy ? '펼치는 중…' : '✨ 같은 의미 동사 펼치기'}</button>}
              </div>
              <input className="form-input" style={{ marginTop: 6 }} value={verb} onChange={(e) => setVerb(e.target.value)} placeholder="예: 분류하기" />
              {verbAlts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>같은 의미 동사:</span>
                  {verbAlts.map((v, i) => (
                    <span key={i} style={{ fontSize: 12, background: 'var(--surface2)', color: 'var(--sub)', borderRadius: 6, padding: '1px 6px' }}>{v}</span>
                  ))}
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px' }} onClick={() => setVerbAlts([])} title="같은 의미 동사 비우기">✕</button>
                </div>
              )}
            </div>
            <div className="form-group"><label className="form-label">행위의 지향 (가치·태도)</label><input className="form-input" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="예: 다양한 방법으로 (없으면 비움)" /></div>
          </div>
          <div className="form-group"><label className="form-label">서술자 (지식·이해·대상) — 쉼표·줄바꿈으로 여러 대상 나열 시 평가초점이 여러 개 생성됩니다</label><textarea className="form-textarea" value={descriptor} onChange={(e) => setDescriptor(e.target.value)} placeholder="예: 나의 신상, 나의 몸, 나의 선호, 나의 흥미" /></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <label className="form-label" style={{ margin: 0 }}>평가초점 목록 — 사전에 수립해 질적 평가의 기준점으로 사용</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={genFociNow}>↻ 분석·해석으로 생성</button>
              <button className="btn btn-ghost btn-sm" onClick={addFocus}>+ 평가초점 추가</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {evalFoci.length === 0 && <div className="empty-state" style={{ padding: 12 }}>아직 평가초점이 없습니다. "↻ 분석·해석으로 생성" 또는 "+ 평가초점 추가"를 눌러 만드세요.</div>}
            {evalFoci.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color: '#6b7280', textAlign: 'center' }}>{i + 1}</div>
                <input className="form-input" value={f} onChange={(e) => editFocus(i, e.target.value)} placeholder="예: 다양한 방법으로 나의 신상을 탐색한다." />
                <button className="btn btn-ghost btn-sm" onClick={() => removeFocus(i)} title="삭제">✕</button>
              </div>
            ))}
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
          {startpoint && (startpoint.supportNeeds || startpoint.functions || startpoint.perfLevel) && (
            <div style={{ background: '#eef4ff', border: '1px solid #b9cdf0', borderRadius: 8, padding: '10px 12px', margin: '4px 0 12px', fontSize: 12.5, color: '#274690', lineHeight: 1.6 }}>
              <strong>🧭 모듈1 출발점 연동</strong> — 이 산출물이 목표의 출발점입니다(AI 생성에 자동 반영).
              {startpoint.supportNeeds && <div>· 생활지원 요구: {String(startpoint.supportNeeds).replace(/\n/g, ' / ')}</div>}
              {startpoint.functions && <div>· 기능 목록화: {String(startpoint.functions).replace(/\n/g, ' / ')}</div>}
              {startpoint.perfLevel && <div>· 수행 가능 수준: {String(startpoint.perfLevel).replace(/\n/g, ' / ')}</div>}
            </div>
          )}
          <div className="form-group"><label className="form-label">학기목표 (수정 가능)</label><textarea className="form-textarea" value={goal} onChange={(e) => setGoal(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">현행수준 (학생 비식별 요약에서 연동 · 수정 가능)</label><textarea className="form-textarea" value={plop} onChange={(e) => setPlop(e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">학년도</label>
              <input type="number" className="form-input" value={schoolYear} onChange={(e) => setSchoolYear(Number(e.target.value))} /></div>
            <div className="form-group"><label className="form-label">학기</label>
              <select className="form-input" value={sem} onChange={(e) => setSem(e.target.value)}><option value="1">1학기 (3~7월)</option><option value="2">2학기 (9~12월)</option></select></div>
            <div className="form-group"><label className="form-label">평가 방식</label>
              <select className="form-input" value={critType} onChange={(e) => {
                const v = e.target.value;
                if (v === 'task' && critType !== 'task') { const cnt = (taskSteps || []).filter((t) => t.trim()).length; setCStart(0); setCEnd(cnt || 5); }
                else if (v !== 'task' && critType === 'task') { setCStart(30); setCEnd(80); }
                setCritType(v);
              }}>
                <option value="rate">양적 · 독립 수행 비율(%)</option>
                <option value="freq">양적 · 기회 중 성공 횟수(10회 중)</option>
                <option value="qual">질적 · 평가초점 기반 서술(내러티브)</option>
                <option value="task">과제 분석 · 단계별 점증(과제 분해)</option>
              </select></div>
            <div className="form-group"><label className="form-label">지원 수준 (모듈4)</label>
              <select className="form-input" value={supportTier} onChange={(e) => setSupportTier(e.target.value)}>
                <option value="">미지정</option>
                <option value="Tier 1 (보편적 지원)">Tier 1 · 보편적 지원</option>
                <option value="Tier 2 (소그룹 지원)">Tier 2 · 소그룹 지원</option>
                <option value="Tier 3 (개별 집중 지원)">Tier 3 · 개별 집중 지원</option>
              </select></div>
            {critType !== 'qual' ? (
              <>
                <div className="form-group"><label className="form-label">{critType === 'task' ? '시작 독립 단계' : '시작 수준'}</label><input type="number" className="form-input" value={cStart} onChange={(e) => setCStart(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{critType === 'task' ? '목표 독립 단계' : '학기말 목표'}</label><input type="number" className="form-input" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></div>
              </>
            ) : (
              <div className="form-group" style={{ flex: '2 1 280px' }}><label className="form-label">질적 평가 안내</label>
                <div className="form-input" style={{ background: 'var(--surface2)', color: 'var(--sub)', fontSize: '.82rem', display: 'flex', alignItems: 'center' }}>수치 기준 없이 ②의 평가초점을 중심으로 학습 과정·결과를 서술 평가합니다.</div>
              </div>
            )}
          </div>
          {critType === 'task' && (
            <div style={{ marginTop: 10, padding: 12, border: '1px solid #c7b9f0', borderRadius: 8, background: '#f7f4ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#5b3fb0' }}>🧩 과제 분석 — 단계 목록 (순차 분해)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={aiStepsNow} disabled={taskBusy}>{taskBusy ? '분석 중…' : (aiOn ? '↻ 단계 자동 분석(AI)' : '↻ 기본 단계 골격')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={addStep}>+ 단계 추가</button>
                  <button className="btn btn-ghost btn-sm" onClick={downloadTaskSheetNow} title="단계×회기 기록지 Word">📋 기록지</button>
                </div>
              </div>
              <div style={{ fontSize: '.8rem', color: '#5b3fb0', opacity: 0.85, marginTop: 4 }}>
                복잡한 행동·기술을 학생이 순서대로 수행할 단계로 나눕니다(예: 손 씻기 → 자리 앉기 → …). 전체 {taskSteps.filter((t) => t.trim()).length || '–'}단계 · 독립 수행 단계가 매월 늘고, 단계별 촉진은 점차 약화됩니다.
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="form-group"><label className="form-label">교수 순서(연쇄)</label>
                  <select className="form-input" value={chainType} onChange={(e) => setChainType(e.target.value)}>
                    <option value="forward">전진형 — 1단계부터 독립 확대</option>
                    <option value="backward">후진형 — 마지막 단계부터 역순</option>
                    <option value="total">전체과제 제시형 — 매회 전체 수행</option>
                  </select></div>
                <div className="form-group"><label className="form-label">촉진 체계</label>
                  <select className="form-input" value={promptSystem} onChange={(e) => setPromptSystem(e.target.value)}>
                    <option value="mtl">최대-최소촉진 (전신→부분→시범→독립)</option>
                    <option value="slp">최소촉진체계 (독립 시도→단계적 촉진)</option>
                    <option value="td">시간지연 (촉진 전 대기 점증)</option>
                    <option value="sim">동시촉진 (촉진 동시 후 점검)</option>
                  </select></div>
              </div>
              {(() => {
                const f = taskSteps.filter((t) => t.trim()).length;
                if (!f) return null;
                if (f < 4) return <div style={{ fontSize: '.78rem', color: '#9a3412', marginTop: 6 }}>⚠ 단계가 적어요(권장 4~8). 학습자 수준이 낮거나 과제가 어려우면 더 세분화하세요.</div>;
                if (f > 10) return <div style={{ fontSize: '.78rem', color: '#9a3412', marginTop: 6 }}>⚠ 단계가 많아요({f}단계). 학습자 수준이 높으면 일부 단계를 통합해 보세요.</div>;
                return <div style={{ fontSize: '.78rem', color: '#15803d', marginTop: 6 }}>✓ 적정 세밀도({f}단계). 가르치다 막히면 해당 단계를 더 잘게 나누세요.</div>;
              })()}
              {(() => {
                const f = taskSteps.filter((t) => t.trim()).length;
                const cs = Number(cStart) || 0, ce = Number(cEnd) || 0;
                const msgs = [];
                if (f && ce > f) msgs.push(`목표 독립 단계(${ce})가 전체 단계(${f})보다 큽니다.`);
                if (cs > ce) msgs.push(`시작(${cs})이 목표(${ce})보다 큽니다.`);
                if (!msgs.length) return null;
                return (
                  <div style={{ fontSize: '.78rem', color: '#b91c1c', marginTop: 4 }}>⚠ {msgs.join(' ')}{' '}
                    <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px' }} onClick={() => { const t = f || ce; setCEnd(t); setCStart(Math.min(cs, t)); }}>전체 단계에 맞춤</button>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {taskSteps.length === 0 && <div className="empty-state" style={{ padding: 12 }}>아직 단계가 없습니다. "단계 자동 분석" 또는 "+ 단계 추가"로 만드세요.</div>}
                {taskSteps.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: '#6b7280', textAlign: 'center' }}>{i + 1}</div>
                    <input className="form-input" value={t} onChange={(e) => editStep(i, e.target.value)} placeholder="예: 수저를 바르게 잡는다." />
                    <button className="btn btn-ghost btn-sm" onClick={() => removeStep(i)} title="삭제" aria-label="단계 삭제">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-pri" onClick={generate}>규칙 초안 (빠름, AI 없음)</button>
            {aiOn
              ? <button className="btn btn-ok" onClick={aiGenerateFromData} disabled={aiGenBusy}>{aiGenBusy ? 'AI 생성 중…' : '✨ AI 생성 (학생 데이터 반영)'}</button>
              : <button className="btn btn-ok" onClick={openManualPrompt}>📋 AI 프롬프트 생성 (복사 → 외부 AI → 붙여넣기)</button>}
          </div>
          <div className="card-subtitle" style={{ marginTop: 8 }}>교육방법 기본값은 학생 장애유형({curStu.disability || '미지정'})에 맞춰 채워집니다: {methodsForType(curStu.disability).join(', ')}</div>

          {/* 교과 평어(세부능력·특기사항) 생성 */}
          <div style={{ marginTop: 14, padding: 12, border: '1px solid #fdba74', borderRadius: 8, background: '#fff7ed' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 700, color: '#9a3412' }}>✍ 교과 평어 생성 (세부능력·특기사항)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="form-input" style={{ width: 'auto', padding: '4px 8px' }} value={pyeongLevel} onChange={(e) => setPyeongLevel(e.target.value)}>
                  {PYEONG_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <button className="btn btn-sm" style={{ background: '#ea580c', color: '#fff' }} onClick={aiPyeong} disabled={pyeongBusy}>
                  {pyeongBusy ? '⏳ 생성 중…' : '평어 생성'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: '.8rem', color: '#9a3412', opacity: 0.8, marginTop: 4 }}>선택한 성취기준 + 학기목표·평가초점·현행수준을 반영해 명사형 평어 문장을 생성합니다.</div>
            {pyeongLines.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={copyPyeongAll}>📋 전체 복사</button>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
                  {pyeongLines.map((l, i) => (
                    <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #fde4cc' }}>
                      <input className="form-input" value={l} onChange={(e) => editPyeong(i, e.target.value)} style={{ flex: 1, fontSize: '.86rem', padding: '4px 8px' }} />
                      <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '2px 8px' }} onClick={() => removePyeong(i)} title="삭제" aria-label="평어 삭제">✕</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

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
