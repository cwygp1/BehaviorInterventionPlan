// 새 디자인(/new) 주소 ↔ 옛 화면 id 변환 — 단일 출처 (mds/54 §3-2, 1단계).
//
//   옛 화면 id(lib/tiers.js PAGE_META 32개)는 화면 안 onNavigate('monitor')·길잡이·FirstRun·
//   NextStepBanner·StepNav가 그대로 부른다. 새 셸은 이 파일의 toNew로 새 주소를 만들고,
//   GuideProvider activePage·PageFrame·PickStudentModal forPage에는 toOld로 되돌린 옛 id를 넘긴다.
//
//   새 주소(해시만 씀, Next 경로 추가 없음)
//     #today · #today/calendar
//     #students
//     #student/{sid}/{record|plan|iep|chart|docs|profile}?sub={옛 id}
//     #class/{status|promise|survey|check|cico}?sub={옛 id}
//     #docs · #docs/{generator|builder|support|videos}
//     #help · #help/{board|ai|admin}
//     #crisis
//     #menu            전체 메뉴(옛 메뉴) — 32화면 목록
//     #page/{옛 id}    옛 화면을 그대로 한 장(홈 PortalHome, 학생 없이 여는 절차 안내 등)
//     #go/{옛 id}      '옛 id로 가 주세요' — 학생이 정해진 뒤 실제 주소로 바뀐다(북마크·길잡이용)
//   옛 해시(#iep 등)가 그대로 들어와도 #go와 같이 처리한다(기존 디자인 북마크 보존).
//
// ⚠ 이 파일은 React를 쓰지 않는다(node --test로 32개 전수 검사, lib/utils/__tests__/routes.test.js).
import { PAGE_META } from './tiers.js';

export const OLD_IDS = Object.keys(PAGE_META);
// 없어진 화면 id의 후계(pages/index.js LEGACY_PAGES와 같은 규칙).
export const LEGACY_OLD = { qa: 'chatExpert' };

// ── 메뉴 5개 ──
export const MENUS = [
  { key: 'today', label: '오늘', icon: '☀️', hash: '#today' },
  { key: 'students', label: '학생', icon: '🧑‍🎓', hash: '#students' },
  { key: 'class', label: '우리 반', icon: '🏫', hash: '#class' },
  { key: 'docs', label: '문서·자료', icon: '📄', hash: '#docs' },
  { key: 'help', label: '도움', icon: '🧭', hash: '#help' },
];

// ── 학생 수첩 탭 6개 — subs는 탭 안 하위 화면(옛 화면 통째, 1단계). 첫 번째가 아니라 def가 기본값.
export const STUDENT_TABS = [
  { key: 'record', label: '기록', subs: ['observe', 'monitor'], def: 'observe' },
  { key: 'plan', label: '이유·계획', subs: ['qabf', 'bip', 'contract', 'tier3'], def: 'qabf' },
  { key: 'iep', label: '개별화교육(IEP)', subs: ['priorIep', 'startpoint', 'iep', 'iepReport'], def: 'iep' },
  { key: 'chart', label: '그래프·평가', subs: ['eval'], def: 'eval' },
  { key: 'docs', label: '문서', subs: [], def: '' },
  { key: 'profile', label: '프로필', subs: [], def: '' },
];

// ── 우리 반 탭 ──
export const CLASS_TABS = [
  { key: 'status', label: '우리 반 현황', subs: ['dash1', 'dash2', 'dash3', 'dashIep'], def: 'dash1' },
  { key: 'promise', label: '약속·보상판', subs: ['classpbs'], def: 'classpbs' },
  { key: 'cico', label: '매일 점검표', subs: ['tier2'], def: 'tier2' },
  { key: 'survey', label: '처음 조사', subs: ['pbssurvey', 'schoolrules'], def: 'pbssurvey' },
  { key: 'check', label: '교사 자가점검', subs: ['classcheck', 'classcheck2'], def: 'classcheck' },
];

// ── 문서·자료 / 도움 하위 ──
export const DOCS_SUBS = { generator: 'generator', builder: 'builder', support: 'support', videos: 'videos' };
export const HELP_SUBS = { board: 'qaBoard', ai: 'chatExpert', admin: 'admin' };

// 탭 안 하위 화면 이름(짧게) — 옛 이름은 PAGE_META 단일 출처에서.
export const SUB_LABELS = {
  observe: '행동 관찰 (ABC)', monitor: '행동 데이터',
  qabf: '이유 찾기 (QABF)', bip: '중재 계획 (BIP)', contract: '행동 계약서', tier3: '절차 안내 (8단계)',
  priorIep: '① 작년 IEP (선택)', startpoint: '② 출발점 분석', iep: '③ 목표 만들기', iepReport: '④ 계획서 다듬기·출력',
  eval: '결과 평가',
  dash1: '학급 전체 (T1)', dash2: '표적 학생 (T2)', dash3: '한 학생 집중 (T3)', dashIep: 'IEP',
  classpbs: '약속·보상판', tier2: '매일 점검표 (CICO)',
  pbssurvey: '① 실태 설문', schoolrules: '② 시간·장소 조사',
  classcheck: '① 교사 실행', classcheck2: '② 보편적 지원',
};

// 옛 id → 새 자리(계산용 표). 학생 탭은 sid가 있어야 주소가 된다.
const STUDENT_PLACE = {};
STUDENT_TABS.forEach((t) => t.subs.forEach((id) => { STUDENT_PLACE[id] = t.key; }));
const CLASS_PLACE = {};
CLASS_TABS.forEach((t) => t.subs.forEach((id) => { CLASS_PLACE[id] = t.key; }));
const DOCS_PLACE = Object.fromEntries(Object.entries(DOCS_SUBS).map(([k, v]) => [v, k]));
const HELP_PLACE = Object.fromEntries(Object.entries(HELP_SUBS).map(([k, v]) => [v, k]));

/** 이 옛 화면은 학생 수첩 안에 있는가(주소에 학생 id가 필요). */
export function isStudentPage(oldId) {
  return !!STUDENT_PLACE[oldId];
}

/** 이 옛 화면은 학생을 꼭 골라야 열리는가(PAGE_META requiresStudent). */
export function requiresStudent(oldId) {
  return !!(PAGE_META[oldId] && PAGE_META[oldId].requiresStudent);
}

function normOld(id) {
  const s = String(id || '').replace(/^#\/?/, '');
  if (LEGACY_OLD[s]) return LEGACY_OLD[s];
  return PAGE_META[s] ? s : '';
}

function withSub(base, sub, def) {
  return sub && sub !== def ? `${base}?sub=${sub}` : base;
}

/**
 * 옛 화면 id → 새 주소(#…). 학생 수첩 화면인데 sid가 없으면:
 *   · 학생이 꼭 필요한 화면 → null (부르는 쪽이 학생 고르기 창을 연다)
 *   · 아니면(절차 안내 tier3) → #page/{id} (옛 화면 한 장)
 * 모르는 id → null.
 * @param {string} oldId
 * @param {{sid?: number|string|null}} [opt]
 */
export function toNew(oldId, opt = {}) {
  const id = normOld(oldId);
  if (!id) return null;
  const sid = opt.sid != null && opt.sid !== '' ? Number(opt.sid) : null;
  if (id === 'home') return '#today';
  if (id === 'calendar') return '#today/calendar';
  if (id === 'students') return '#students';
  if (id === 'crisis') return '#crisis';
  if (STUDENT_PLACE[id]) {
    if (!sid) return requiresStudent(id) ? null : `#page/${id}`;
    const tab = STUDENT_TABS.find((t) => t.key === STUDENT_PLACE[id]);
    return withSub(`#student/${sid}/${tab.key}`, id, tab.def);
  }
  if (CLASS_PLACE[id]) {
    const tab = CLASS_TABS.find((t) => t.key === CLASS_PLACE[id]);
    return withSub(`#class/${tab.key}`, id, tab.def);
  }
  if (DOCS_PLACE[id]) return `#docs/${DOCS_PLACE[id]}`;
  if (HELP_PLACE[id]) return `#help/${HELP_PLACE[id]}`;
  return `#page/${id}`;
}

function splitQuery(s) {
  const q = s.indexOf('?');
  if (q < 0) return [s, {}];
  const params = {};
  s.slice(q + 1).split('&').forEach((kv) => {
    if (!kv) return;
    const i = kv.indexOf('=');
    const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
    const v = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1));
    if (k) params[k] = v;
  });
  return [s.slice(0, q), params];
}

/**
 * 주소 해시 → 경로 객체.
 *   { kind: 'today'|'calendar'|'students'|'student'|'class'|'docs'|'help'|'crisis'|'menu'|'page'|'go', ... }
 * 모르는 주소는 오늘.
 */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, params] = splitQuery(raw);
  const seg = path.split('/').filter(Boolean);
  const head = seg[0] || '';
  switch (head) {
    case '':
    case 'today':
      return seg[1] === 'calendar' ? { kind: 'calendar' } : { kind: 'today' };
    case 'students':
      return { kind: 'students' };
    case 'student': {
      const sid = parseInt(seg[1], 10);
      if (!Number.isFinite(sid) || sid <= 0) return { kind: 'students' };
      const tab = STUDENT_TABS.find((t) => t.key === seg[2]) || STUDENT_TABS[0];
      const sub = tab.subs.includes(params.sub) ? params.sub : tab.def;
      return { kind: 'student', sid, tab: tab.key, sub };
    }
    case 'class': {
      const tab = CLASS_TABS.find((t) => t.key === seg[1]) || CLASS_TABS[0];
      const sub = tab.subs.includes(params.sub) ? params.sub : tab.def;
      return { kind: 'class', tab: tab.key, sub };
    }
    case 'docs':
      return { kind: 'docs', sub: DOCS_SUBS[seg[1]] ? seg[1] : '' };
    case 'help':
      return { kind: 'help', sub: HELP_SUBS[seg[1]] ? seg[1] : '' };
    case 'crisis':
      return { kind: 'crisis' };
    case 'menu':
      return { kind: 'menu' };
    case 'page': {
      const id = normOld(seg[1]);
      return id ? { kind: 'page', old: id } : { kind: 'menu' };
    }
    case 'go': {
      const id = normOld(seg[1]);
      return id ? { kind: 'go', old: id } : { kind: 'today' };
    }
    default: {
      // 옛 해시(#iep, #dash3 …) — 학생이 정해진 뒤 새 자리로.
      const id = normOld(head);
      return id ? { kind: 'go', old: id } : { kind: 'today' };
    }
  }
}

/** 경로 객체 → 주소 해시. parseHash의 역. */
export function formatRoute(r) {
  if (!r) return '#today';
  switch (r.kind) {
    case 'today': return '#today';
    case 'calendar': return '#today/calendar';
    case 'students': return '#students';
    case 'student': {
      const tab = STUDENT_TABS.find((t) => t.key === r.tab) || STUDENT_TABS[0];
      return withSub(`#student/${r.sid}/${tab.key}`, tab.subs.includes(r.sub) ? r.sub : '', tab.def);
    }
    case 'class': {
      const tab = CLASS_TABS.find((t) => t.key === r.tab) || CLASS_TABS[0];
      return withSub(`#class/${tab.key}`, tab.subs.includes(r.sub) ? r.sub : '', tab.def);
    }
    case 'docs': return r.sub ? `#docs/${r.sub}` : '#docs';
    case 'help': return r.sub ? `#help/${r.sub}` : '#help';
    case 'crisis': return '#crisis';
    case 'menu': return '#menu';
    case 'page': return `#page/${r.old}`;
    case 'go': return `#go/${r.old}`;
    default: return '#today';
  }
}

/**
 * 새 주소(또는 경로 객체) → 옛 화면 id. 옛 화면이 아닌 모음 화면(문서·도움 첫 화면, 학생 문서·프로필 탭,
 * 전체 메뉴)은 ''. 오늘은 'home'(홈 '시작하기' 목록·길잡이 홈 판정을 잇는다).
 */
export function toOld(hashOrRoute) {
  const r = typeof hashOrRoute === 'string' ? parseHash(hashOrRoute) : hashOrRoute;
  if (!r) return '';
  switch (r.kind) {
    case 'today': return 'home';
    case 'calendar': return 'calendar';
    case 'students': return 'students';
    case 'student': return r.sub || '';
    case 'class': return r.sub || '';
    case 'docs': return r.sub ? DOCS_SUBS[r.sub] : '';
    case 'help': return r.sub ? HELP_SUBS[r.sub] : '';
    case 'crisis': return 'crisis';
    case 'page': return r.old;
    case 'go': return r.old;
    default: return '';
  }
}

/** 이 경로가 어느 메뉴(5개)에 속하나 — 메뉴 불 켜기용. */
export function menuOf(r) {
  if (!r) return 'today';
  switch (r.kind) {
    case 'today': case 'calendar': case 'crisis': return 'today';
    case 'students': case 'student': return 'students';
    case 'class': return 'class';
    case 'docs': return 'docs';
    case 'help': case 'menu': case 'page': return 'help';
    default: return 'today';
  }
}

/** 같은 탭·하위 화면에서 학생만 바꾼 주소. */
export function withStudent(r, sid) {
  if (r && r.kind === 'student') return formatRoute({ ...r, sid });
  return formatRoute({ kind: 'student', sid, tab: 'record', sub: 'observe' });
}
