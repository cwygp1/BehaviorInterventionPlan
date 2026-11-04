// 학생·학급 목록 불러오기 상태 → 화면이 무엇을 그릴지(1103, mds/58 #2·#5·#6·#11). 순수 함수 — 단위 테스트 대상.
//   StudentContext는 실패해도 받아 둔 목록을 비우지 않고 studentsLoaded도 올리지 않는다(옛 홈·첫 실행이 '0명'으로 읽지 않게).
//   그래서 화면은 아래 규칙으로 '불러오는 중' / '못 불러옴(다시 시도)' / '학생 없음' / 목록을 고른다.

/**
 * @returns {'loading'|'error'|'empty'|'stale'|'ok'}
 *   loading: 아직 받는 중 · error: 못 받았고 보여 줄 목록도 없음 · empty: 정말 학생이 없음
 *   stale: 예전에 받은 목록은 있으나 다시 받기가 실패함(목록 + 안내) · ok: 정상
 */
export function listLoadView({ studentsLoaded, studentsError, classesError, count }) {
  const err = !!(studentsError || classesError);
  if (!studentsLoaded) return studentsError ? 'error' : 'loading';
  // 학급 목록을 못 받으면 지금 학급이 없어 학생이 0명으로 보인다 — '처음이시네요'가 아니라 오류.
  if (!count) return err ? 'error' : 'empty';
  return err ? 'stale' : 'ok';
}

/** 안내문 앞부분 — 무엇을 못 받았는가. 둘 다 없으면 ''. */
export function listErrorWhat(studentsError, classesError) {
  if (studentsError && classesError) return '학급과 학생 목록';
  if (classesError) return '학급 목록';
  if (studentsError) return '학생 목록';
  return '';
}

/**
 * 같은 일을 겹쳐 부르면 진행 중인 Promise를 함께 기다리게 하는 막이.
 *   샘플 넣기처럼 두 곳(FirstRun 자동 넣기·홈 '샘플로 체험')이 거의 동시에 부르면 POST가 두 번 가던 문제(mds/58 #11).
 *   끝나면(성공·실패 모두) 비워서 다음 호출은 새로 돈다.
 */
export function shareInflight() {
  let cur = null;
  return function run(fn) {
    if (cur) return cur;
    const p = (async () => fn())();
    cur = p;
    const done = () => { if (cur === p) cur = null; };
    p.then(done, done);
    return p;
  };
}
