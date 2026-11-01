// 새 디자인 '문서·자료' 허브·학생 수첩 문서 탭 — 문서 종류·내보내기 방식 목록과, 출력 함수에 넘길 입력(payload)을
//   만드는 순수 함수 묶음(3단계, mds/54 §7 '3단계', mds/52 §8 '출력 단추 9곳').
//
//   원칙: 출력은 새로 만들지 않는다. 각 payload는 기존 화면이 그 출력 함수(lib/utils/print*·*Docx·neisCopy)를
//   부를 때 넘기는 객체와 **같은 모양·같은 값**이어야 한다(화면 줄 번호를 각 함수 위에 적었다).
//   화면이 그 자리에서 쓰던 계산이 있으면(예: Tier 3 기능 문구) 같은 함수를 import해 쓴다.
//   ⚠ React·DB 없는 순수 함수(node --test, lib/utils/__tests__/docs.test.js) — 출력 함수 자체는 화면 쪽에서 부른다.
import { levelLabel } from './schoolLevel.js';
import { qabfFunctionText } from './qabf.js';

/**
 * 문서 종류 → 내보내기 방식(알약). 있는 출력만 적었다(없는 'Word·인쇄'를 만들지 않음).
 *   kind 'run'  : 허브에서 바로 출력 함수를 부른다
 *   kind 'open' : 쓰는 칸이 화면에만 있어(저장 안 되는 계약서 내용, 통신문 새로 쓰기 등) 그 화면·창을 연다
 *   need        : 이 학생 자료에 이것이 있어야 바로 출력이 의미 있다(없으면 알약 옆에 안내)
 */
export const DOC_KINDS = [
  {
    key: 'iep', title: '개별화교육계획(IEP) 계획서', desc: '학기목표·월별 계획·평가를 나이스 칸에 맞게.',
    formats: [
      { key: 'niceWord', label: '나이스 양식 Word', kind: 'run' },
      { key: 'neisCopy', label: '나이스 복사(글만)', kind: 'run' },
      { key: 'formWord', label: '평가초점 양식 Word', kind: 'run' },
      { key: 'taskSheet', label: '과제분석 기록지 Word', kind: 'run' },
    ],
    from: 'IEP 탭 ④ 계획서 다듬기·출력 / ③ 목표 만들기와 같은 출력',
  },
  {
    key: 'bip', title: '행동중재계획(BIP)', desc: '이유(가설)·대체 행동·예방·교수·강화·반응 절차·역할분담.',
    formats: [{ key: 'print', label: '인쇄 · PDF', kind: 'run' }],
    from: '이유·계획 탭 ‘중재 계획(BIP)’의 🖨 단추와 같은 출력',
  },
  {
    key: 'eval', title: '결과 보고서', desc: '행동 그래프·충실도·위기 기록과 교사 종합 의견을 A4 한 장으로.',
    formats: [{ key: 'report', label: '보고서 만들기 · 인쇄', kind: 'run' }],
    from: '그래프·평가 탭 ‘📊 결과 보고서 생성’과 같은 창',
  },
  {
    key: 'letter', title: '가정 통신문', desc: '학부모께 보내는 안내 — 새로 쓰기, 지난 통신문 다시 인쇄.',
    formats: [{ key: 'write', label: '쓰기 · 인쇄 창 열기', kind: 'open' }, { key: 'reprint', label: '지난 통신문 인쇄', kind: 'run' }],
    from: '중재 계획(BIP) 화면의 ‘가정 통신문’ 창과 같은 창',
  },
  {
    key: 'contract', title: '행동 계약서', desc: '학생과 함께 쓰는 약속(과제·보상·서명·기록표).',
    formats: [
      { key: 'open', label: '내용 쓰기(화면 열기)', kind: 'open' },
      { key: 'blankPrint', label: '빈 양식 인쇄', kind: 'run' },
      { key: 'blankWord', label: '빈 양식 Word', kind: 'run' },
    ],
    from: '계약서 내용은 저장되지 않아요 — 쓰려면 화면을 열고, 손으로 쓸 빈 양식은 여기서 바로',
  },
  {
    key: 'crisis', title: '위기 시나리오', desc: '저장해 둔 위기 대처 7단계 시나리오.',
    formats: [{ key: 'print', label: '인쇄 · PDF', kind: 'run' }, { key: 'open', label: '위기 대처 화면 열기', kind: 'open' }],
    from: '위기 대처 화면 ‘저장된 위기 시나리오’의 🖨 단추와 같은 출력',
  },
  {
    key: 'tier3', title: '한 학생 집중 지원 통합 문서', desc: '8단계 자료(평가·관찰·이유·계획·목표)를 Word 한 벌로.',
    formats: [{ key: 'word', label: 'Word', kind: 'run' }],
    from: '이유·계획 탭 ‘자세한 순서 보기(8단계)’의 Word 단추와 같은 출력',
  },
  {
    key: 'qabf', title: '행동의 이유 질문지(QABF) 결과', desc: '25문항 응답과 기능·심각도 그래프.',
    formats: [{ key: 'excel', label: '엑셀(.xlsx)', kind: 'run' }],
    from: '이유 찾기(QABF) 화면 ‘⬇ 엑셀 다운로드’와 같은 출력',
  },
  {
    key: 'dpr', title: '매일 점검표 카드(DPR)', desc: '교시·목표가 찍힌 하루 점검 카드.',
    formats: [{ key: 'open', label: '점검표 화면 열기', kind: 'open' }],
    from: '교시·목표는 점검표를 쓰는 칸에서 정해져 그 화면의 🖨 단추로 인쇄해요',
  },
  {
    key: 'aac', title: 'AAC 의사소통 카드', desc: '그림에 낱말을 붙인 인쇄용 카드(학생 자료와 따로).',
    formats: [{ key: 'open', label: '카드 만들기 화면 열기', kind: 'open' }],
    from: '문서·자료 › 문서 초안 › AAC 의사소통 카드',
  },
];

export const docKind = (key) => DOC_KINDS.find((d) => d.key === key) || null;

// ── IEP ──
/** IepReportPage.jsx:66 — 학년도·학기 고르기로 거른 목표(학년도 0 = 전체, 학기 '' = 전체). */
export function iepFilter(goals, { year, sem } = {}) {
  return (goals || []).filter((g) => (!year || g.school_year === year) && (!sem || String(g.semester) === String(sem)));
}
/** IepReportPage.jsx:64 — 학년도 고르기 목록(올해 + 목표에 있는 학년도, 큰 것부터). */
export function iepYears(goals, curYear) {
  return [...new Set([curYear, ...(goals || []).map((g) => g.school_year).filter(Boolean)])].sort((a, b) => b - a);
}
/** IepReportPage.jsx:240 onWord — downloadNiceIepDocx 입력. */
export function niceWordPayload({ stu, user, year, sem, goals, curYear }) {
  return {
    student: { code: stu.code, level: stu.level, grade: stu.grade },
    teacherName: (user && user.name) || '', year: year || curYear, semester: sem, goals,
  };
}
/** IepPage.jsx:2327 exportFormWord — downloadIepFormDocx 입력(그 화면은 저장된 목표 전부). */
export function formWordPayload({ stu, user, goals }) {
  return {
    student: { code: stu.code, level: stu.level, grade: stu.grade, disability: stu.disability },
    teacherName: (user && user.name) || '',
    goals,
  };
}
/** 과제분석 단계가 저장된 목표만(IepPage 과제분석 기록지 단추는 단계가 있을 때만 의미). */
export function taskGoals(goals) {
  return (goals || []).filter((g) => (g.task_steps || []).map((t) => String(t || '').trim()).filter(Boolean).length > 0);
}
/** IepPage.jsx:2347 downloadTaskSheetNow — downloadTaskSheetDocx 입력. 그 화면은 편집 중 목표(저장된 값과 같음)의 값을 쓴다. */
export function taskSheetPayload({ stu, user, goal }) {
  const steps = (goal.task_steps || []).map((t) => String(t).trim()).filter(Boolean);
  return {
    student: { code: stu.code, level: stu.level, grade: stu.grade, disability: stu.disability },
    teacherName: (user && user.name) || '',
    goalText: goal.semester_goal || '',
    steps, chainType: goal.chain_type || 'forward', promptSystem: goal.prompt_system || 'mtl',
  };
}

// ── BIP ──
/** BipPage.jsx:113-118 폼이 저장값을 읽는 방식 그대로. */
export function bipFields(bip) {
  const b = bip || {};
  return {
    alt: b.alt || '', fct: b.fct || '', crit: b.crit || '', prev: b.prev || '', teach: b.teach || '',
    reinf: b.reinf || '', resp: b.resp || '', roles: Array.isArray(b.roles) ? b.roles : [],
  };
}
/** BipPage.jsx:221 onPrintBIP의 '내용 먼저' 가드. */
export function bipHasContent(bip) {
  const f = bipFields(bip);
  return !!(f.alt || f.prev || f.teach || f.reinf || f.resp);
}
/** BipPage.jsx:225 printBIP 입력. */
export function bipPrintPayload({ stu, user, bip }) {
  const { alt, fct, crit, prev, teach, reinf, resp, roles } = bipFields(bip);
  return {
    studentId: stu.code, level: stu.level, disability: stu.disability, note: stu.note,
    teacherName: user && user.name, school: user && user.school,
    bip: { alt, fct, crit, prev, teach, reinf, resp, roles },
  };
}

// ── 가정 통신문 ──
/** FamilyLetterModal.jsx:351 quickPrint(loadFromHistory 직후) — printFamilyLetter 입력. */
export function letterPrintPayload({ stu, user, letter }) {
  return {
    studentId: stu && stu.code,
    teacherName: user && user.name,
    school: user && user.school,
    body: letter.body || '', subject: letter.subject || '', category: letter.category || '진행 보고',
  };
}

// ── 행동 계약서 ──
/** ContractPage.jsx:84 payload() — 화면을 열고 아무것도 안 쓴 채 인쇄할 때와 같은 값(기록표 월~금·4주). */
export function contractBlankPayload({ stu, user }) {
  const who = (user && user.name) || '';
  return {
    studentId: stu.code,
    teacherName: who,
    task: { who: stu.code || '', what: '', when: '', howWell: '' },
    reward: { who, what: '', when: '', howMuch: '' },
    d1: '', d2: '', recordType: 'mf', weeks: 4,
  };
}

// ── 위기 시나리오 ──
/** CrisisPage.jsx:125 printSaved — printCrisisScenario 입력. */
export function crisisPrintPayload({ stu, user, record }) {
  return {
    studentId: stu && stu.code, level: levelLabel(stu && stu.level), disability: stu && stu.disability,
    situation: record.situation, output: record.output, teacherName: user && user.name, school: user && user.school, createdAt: record.created_at,
  };
}

// ── Tier 3 통합 문서 ──
/** Tier3Page.jsx:100 onExportTier3 — downloadTier3Doc 입력(linkage는 buildFullStudentContext 결과). */
export function tier3Payload({ stu, user, goals, data, linkage }) {
  return {
    student: { code: stu.code, level: stu.level, grade: stu.grade, disability: stu.disability, note: stu.note },
    teacherName: (user && user.name) || '',
    school: (user && user.school) || '',
    goals,
    bip: (data && data.bip) || {},
    problemBehavior: (data && data.abc && data.abc[0] && data.abc[0].b) || '',
    functionText: qabfFunctionText(data && data.qabf),
    tierLinkage: linkage,
  };
}

// ── 결과 보고서 ──
/** EvalReportModal.jsx:72 onPrint의 student 칸(나머지는 모달이 채움). */
export function evalStudent(stu) {
  return { code: stu.code, level: stu.level, grade: stu.grade, disability: stu.disability, note: stu.note };
}

// ── 학생 자료로 본 '바로 출력할 거리가 있나' — 카드에 점+글자 상태로 ──
export function docReadiness({ data, goals }) {
  const d = data || {};
  const qabfN = (d.qabf || []).filter((v) => v >= 0 || v === -2).length;
  return {
    iep: (goals || []).length,
    bip: bipHasContent(d.bip),
    eval: (d.mon || []).length,
    letter: (d.letters || []).length,
    crisis: (d.crisis || []).length,
    tier3: true,
    qabf: qabfN,
    contract: true,
    dpr: true,
    aac: true,
  };
}

/** QabfPage.jsx:62-63 — 저장된 응답(25개가 아니면 전부 '안 답함'). 허브는 임시 저장(draft)이 아니라 저장값으로 낸다. */
export function qabfSaved(data) {
  const q = data && data.qabf;
  return Array.isArray(q) && q.length === 25 ? q : new Array(25).fill(-1);
}
