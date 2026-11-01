// 새 디자인 '오늘' 표 — 학생마다 '오늘 할 일 한 가지'를 고르는 단일 함수(mds/52 §4-2, mds/54 §5 '없음' 줄).
//   재료는 두 가지뿐: GET /api/dashboard(반·학기 집계, lib/dashReviews.js·nextStep.js가 쓰는 것과 같은 응답)
//                    GET /api/calendar?from=오늘&to=오늘(오늘 기록 종류).  summary.js는 학급 필터가 없어 쓰지 않는다.
//   규칙 순서: 새 학생(기록이 하나도 없음) > IEP 목표 0개 > 오늘 관찰(행동 기록) 없음 > 매일 점검표 남음 > 이달 평가 남음 > 기초 평가 남음 > 끝.
//     · '기초 평가 남음'(3단계): 초기면담·강화제·우선순위 중 안 한 것이 있으면. 재료는 세 번째 응답
//       GET /api/students/assess-status(lib/assessStatus.js 판정) — 못 받았으면(assess 없음) 이 규칙은 건너뛴다.
//       아무 기록도 없는 학생은 여전히 '새 학생' 한 줄(평가를 먼저 몰아세우지 않는다).
//     · 한 학생에게 할 일이 둘 이상이면 첫째를 보이고 나머지는 more(개수)로 — 화면이 '외 n건'으로 묶는다.
//   ⚠ React·DB 없는 순수 함수(node --test, lib/utils/__tests__/todo.test.js).

/** 할 일 종류 → 상태 칩 낱말·색 이름·줄 끝 단추(프로토타입 TASK와 같은 낱말). mode는 빠른 기록 창 모드(없으면 화면 이동). */
export const TASKS = {
  fresh: { chip: '새 학생', tone: 'green', btn: '', mode: null },
  goal: { chip: '아직 없음', tone: 'rose', btn: '목표 쓰기', mode: null },
  obs: { chip: '오늘 꼭', tone: 'rose', btn: '기록하기', mode: 'obs' },
  chk: { chip: '오늘 남음', tone: 'blue', btn: '점검표 쓰기', mode: 'chk' },
  eval: { chip: '이달 안에', tone: 'amber', btn: '평가 쓰기', mode: null },
  assess: { chip: '아직 안 함', tone: 'amber', btn: '기초 평가 하기', mode: null },
  done: { chip: '끝', tone: 'green', btn: '고쳐 쓰기', mode: 'obs' },
};

/** 빠른 기록 창 모드 4개(이달 평가는 4단계). */
export const QUICK_MODES = [
  { key: 'obs', label: '관찰' },
  { key: 'num', label: '수치' },
  { key: 'chk', label: '점검표' },
  { key: 'ses', label: '회기' },
];
export const MODE_LABEL = Object.fromEntries(QUICK_MODES.map((m) => [m.key, m.label]));

// '오늘 행동을 기록했다'로 치는 기록 종류(관찰·행동 수치·회기).
const OBS_KINDS = ['abc', 'mon', 'session'];
// '오늘 기록 d/N'에 치는 종류(달력 KINDS 중 학생이 그날 남긴 기록 전부, 가정 통신 제외).
const ANY_KINDS = ['abc', 'mon', 'session', 'cico', 'sz', 'fid'];

function todayKinds(cal) {
  const out = {};
  if (!cal || !Array.isArray(cal.events)) return out;
  const today = cal.today;
  cal.events.forEach((e) => {
    if (today && e.date !== today) return;
    const sid = String(e.studentId);
    (out[sid] = out[sid] || new Set()).add(e.kind);
  });
  return out;
}

function groupMembers(dash) {
  const set = new Set();
  ((dash && dash.t2 && dash.t2.groups) || []).forEach((g) => (g.members || []).forEach((m) => set.add(String(m.student_id))));
  return set;
}

const has = (set, kinds) => !!set && kinds.some((k) => set.has(k));

/**
 * 학생 한 명의 할 일 목록(순서대로, 첫째가 오늘 할 일).
 * @returns {Array<{task:string, msg:string, mode?:string}>}
 */
export function todoListFor({ sid, d = {}, kinds, inGroup = false, cicoToday = false, hasCico = false, assess = null }) {
  const obsToday = has(kinds, OBS_KINDS);
  const anyRecord = (d.abc || 0) + (d.mon || 0) + (d.sz || 0) + (d.iepGoals || 0) > 0
    || !!d.startpointDone || !!d.qabfDone || !!d.bipFilled || hasCico || inGroup || (kinds && kinds.size > 0);
  if (!anyRecord) return [{ task: 'fresh', msg: '아직 기록이 없어요 — 무엇부터 해 볼까요?' }];
  const list = [];
  if (!(d.iepGoals > 0)) list.push({ task: 'goal', msg: '학기목표가 아직 없어요' });
  if (!obsToday) {
    // 행동 수치를 주로 쌓아 온 학생은 수치 모드로 연다(관찰이 더 많거나 같으면 관찰).
    const num = (d.mon || 0) > (d.abc || 0);
    list.push({ task: 'obs', mode: num ? 'num' : 'obs', msg: num ? '행동 수치 — 오늘 아직 없어요' : '행동 관찰 — 오늘 아직 없어요' });
  }
  if (inGroup && !cicoToday && !has(kinds, ['cico'])) {
    list.push({ task: 'chk', mode: 'chk', msg: obsToday ? '오늘 기록은 했고, 매일 점검표가 남았어요' : '매일 점검표가 남았어요' });
  }
  if ((d.iepMonthEvalMissing || 0) > 0) list.push({ task: 'eval', msg: `이번 달 평가가 ${d.iepMonthEvalMissing}개 남았어요` });
  if (assess && Array.isArray(assess.missing) && assess.missing.length > 0) {
    list.push({ task: 'assess', msg: `기초 평가 ${assess.missing.length}가지가 남았어요 (${assess.missing.join('·')})` });
  }
  return list;
  // (sid는 호출부 편의용 — 규칙에는 쓰지 않는다)
}

/** 주 단추가 하는 일 — 빠른 기록 창 열기 또는 학생 수첩 화면으로. */
export function actionFor(task, sid, mode) {
  if (task === 'goal') return { type: 'go', hash: `#student/${sid}/iep` };
  if (task === 'eval') return { type: 'go', hash: `#student/${sid}/iep?sub=iepReport` };
  if (task === 'assess') return { type: 'go', hash: `#student/${sid}/profile` };
  if (task === 'fresh') return { type: 'choose' };
  return { type: 'quick', mode: mode || TASKS[task].mode || 'obs' };
}

/**
 * 오늘 표 전체.
 * @param {object} p
 * @param {Array<{id:number, code:string, is_sample?:boolean}>} p.students  지금 학급 학생(StudentContext.students 순서 그대로)
 * @param {object|null} p.dash  /api/dashboard 응답
 * @param {object|null} p.cal   /api/calendar?from=오늘&to=오늘 응답
 * @param {object|null} [p.assess] /api/students/assess-status 응답의 status({[sid]:{missing…}}) — 없으면 기초 평가 규칙 건너뜀
 * @returns {{rows: Array, total:number, recorded:number, doneCount:number}}
 */
export function computeTodos({ students, dash, cal, assess = null }) {
  const kindsBy = todayKinds(cal);
  const members = groupMembers(dash);
  const cico = (dash && dash.t2 && dash.t2.cico) || {};
  const stu = (dash && dash.stu) || {};
  const rows = (students || []).map((s) => {
    const sid = String(s.id);
    const kinds = kindsBy[sid] || new Set();
    const list = todoListFor({
      sid, d: stu[s.id] || stu[sid] || {}, kinds,
      inGroup: members.has(sid), cicoToday: !!(cico[s.id] || cico[sid] || {}).today, hasCico: !!(cico[s.id] || cico[sid]),
      assess: assess ? (assess[s.id] || assess[sid] || null) : null,
    });
    const first = list[0];
    const task = first ? first.task : 'done';
    const t = TASKS[task];
    // '끝' 줄의 '고쳐 쓰기'는 오늘 남긴 기록 종류의 모드로 연다.
    const doneMode = kinds.has('mon') && !kinds.has('abc') ? 'num' : kinds.has('session') && !kinds.has('abc') && !kinds.has('mon') ? 'ses' : kinds.has('cico') && !has(kinds, OBS_KINDS) ? 'chk' : 'obs';
    const mode = first ? (first.mode || t.mode) : doneMode;
    return {
      id: s.id,
      code: s.code,
      isSample: !!s.is_sample,
      task,
      msg: first ? first.msg : '오늘 할 일 끝 · 저장했어요',
      chip: t.chip,
      tone: t.tone,
      btn: t.btn,
      mode,
      more: list.length > 1 ? list.length - 1 : 0,
      rest: list.slice(1).map((x) => x.task),
      recordedToday: has(kinds, ANY_KINDS),
      inGroup: members.has(sid),
      action: actionFor(task, s.id, mode),
    };
  });
  return {
    rows,
    total: rows.length,
    recorded: rows.filter((r) => r.recordedToday).length,
    doneCount: rows.filter((r) => r.task === 'done').length,
  };
}

/** 빠른 기록 창으로 할 수 있는 할 일인가(관찰·점검표). 목표·평가·새 학생은 수첩에서. */
export const isQuickTask = (task) => task === 'obs' || task === 'chk';

/**
 * '다음 학생 ▶' — 지금 학생 다음부터 한 바퀴 돌며 빠른 기록으로 할 일이 남은 학생.
 * @param {Array} rows computeTodos().rows
 * @param {number|string} curId 지금 학생
 * @param {Set<number|string>} [doneIds] 이 창에서 방금 저장해 끝난 학생(아직 표가 새로 고쳐지기 전)
 * @returns {object|null} 그 줄
 */
export function nextQuickRow(rows, curId, doneIds) {
  const n = (rows || []).length;
  if (!n) return null;
  const at = rows.findIndex((r) => String(r.id) === String(curId));
  for (let k = 1; k <= n; k += 1) {
    const r = rows[(at + k + n) % n];
    if (String(r.id) === String(curId)) continue;
    if (doneIds && (doneIds.has(r.id) || doneIds.has(String(r.id)))) continue;
    if (isQuickTask(r.task)) return r;
  }
  return null;
}
