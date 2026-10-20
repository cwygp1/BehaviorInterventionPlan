// 학교급 단일 출처 — 1020(피드백 3차 ④, mds/49).
// 교사 어법에서 '중등'은 중·고 통칭, '고등'은 대학으로 읽혀 오해가 있었고 전공과가 없었다.
// 저장 키(students.level: '초등'|'중등'|'고등'|'전공'|'')는 그대로 두고(마이그레이션 없음),
// 화면·프롬프트·인쇄는 모두 여기의 라벨(초등학교/중학교/고등학교/전공과)을 거친다.
// level을 분기하는 코드는 includes('초') 같은 즉석 판정 대신 반드시 이 함수들을 쓸 것 — '전공'이 조용히
// 기본값으로 떨어지던 문제(학년 1~3·IEP 학년군 없음·초등 교시)를 막는다.

export const LEVEL_KEYS = ['초등', '중등', '고등', '전공'];
export const LEVEL_LABEL = { '': '미지정', 초등: '초등학교', 중등: '중학교', 고등: '고등학교', 전공: '전공과' };
// select 보기: 미지정 + 4개. 기존에 학교급이 빈 학생을 열었을 때 '초등'으로 덮어쓰지 않게 한다.
export const LEVEL_OPTIONS = [{ key: '', label: LEVEL_LABEL[''] }, ...LEVEL_KEYS.map((k) => ({ key: k, label: LEVEL_LABEL[k] }))];

/** 라벨·옛 표기('초등학교'·'중학교' 등)를 저장 키로. 모르는 값은 그대로. */
export function normalizeLevel(level) {
  const s = String(level || '').trim();
  if (!s) return '';
  if (LEVEL_KEYS.includes(s)) return s;
  if (/^전공/.test(s)) return '전공';
  if (/^초/.test(s)) return '초등';
  if (/^중/.test(s)) return '중등';
  if (/^고/.test(s)) return '고등';
  return s;
}

/** 화면·프롬프트·인쇄용 이름. 빈 값은 ''(호출처가 '미입력' 등을 붙인다). */
export function levelLabel(level) {
  const k = normalizeLevel(level);
  if (!k) return '';
  return LEVEL_LABEL[k] || k;
}

/** "중학교 3학년" / "전공과 1학년" / "고등학교" / ''. */
export function levelGradeLabel(level, grade) {
  const l = levelLabel(level);
  const g = String(grade || '').replace(/[^0-9]/g, '');
  return [l, g ? `${g}학년` : ''].filter(Boolean).join(' ');
}

/** 학년 select 보기. 초등 1~6, 중·고 1~3, 전공 1~2, 미지정은 없음. */
export function gradesFor(level) {
  const k = normalizeLevel(level);
  if (k === '초등') return ['1', '2', '3', '4', '5', '6'];
  if (k === '중등' || k === '고등') return ['1', '2', '3'];
  if (k === '전공') return ['1', '2'];
  return [];
}

/** 중·고·전공(8교시·하교 15:30 쪽). */
export function isSecondary(level) {
  return ['중등', '고등', '전공'].includes(normalizeLevel(level));
}

/**
 * IEP 성취기준 학년군 코드(2·4·6=초등 1~2·3~4·5~6, 9=중, 12=고). 전공과는 고등(12) — 갑 결정 1020:
 * GRADE 맵에 12 초과 코드가 없고 주문서 카탈로그도 고등 선택 교과를 전공 성격으로 둔다.
 * 초등은 세부 학년이 있어야 하나로 좁혀진다(없으면 null → 호출처가 초등 전체로).
 */
export function gradeCodeFor(level, grade) {
  const k = normalizeLevel(level);
  const g = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10);
  if (k === '중등') return 9;
  if (k === '고등' || k === '전공') return 12;
  if (k === '초등' && g >= 1 && g <= 6) return g <= 2 ? 2 : g <= 4 ? 4 : 6;
  return null;
}

/** IepPage allowedGradeCodes: 허용 학년군 목록(0=일상생활 공통 항상 포함). 학교급 미상 → null(제한 없음). */
export function allowedGradeCodesFor(level, grade) {
  const k = normalizeLevel(level);
  const one = gradeCodeFor(level, grade);
  if (one != null) return [0, one];
  if (k === '초등') return [0, 2, 4, 6];
  return null;
}

/** IEP 학년군 필터 기본값('9'·'12'·''). 초등은 목록 전체가 기본이라 ''. */
export function gradePresetFor(level) {
  const c = gradeCodeFor(level, '');
  return c === 9 || c === 12 ? String(c) : '';
}

/** 이전 IEP 저장용 학년군(종전: 고 12·중 9·그 외 6). 전공은 12. */
export function priorIepGradeCode(level) {
  const c = gradeCodeFor(level, '');
  return c ?? 6;
}

/** 수업자료 주문서 학년군 칩. 전공과는 카탈로그에 칩이 없어 고등학교로. 모르면 null. */
export function builderGradeChip(level, grade) {
  const k = normalizeLevel(level);
  const g = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10);
  if (k === '초등' && g >= 1) return g <= 2 ? '1~2학년' : g <= 4 ? '3~4학년' : '5~6학년';
  if (k === '중등') return '중학교';
  if (k === '고등' || k === '전공') return '고등학교';
  return null;
}
