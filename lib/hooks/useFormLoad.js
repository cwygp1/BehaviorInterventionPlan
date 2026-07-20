import { useCallback, useEffect, useRef, useState } from 'react';

// 서버에서 폼 초기값을 불러오는 동안 화면이 기본값(0·빈칸)으로 먼저 그려지는 탓에
// 그 사이 교사가 입력한 값이 fetch 응답에 덮어써져 조용히 사라지던 문제를 막는다.
//
// 사용법:
//   const { loaded, applyLoaded, reload } = useFormLoad([curClassId, curSemester]);
//   useEffect(() => {
//     fetchX(...).then((d) => applyLoaded(() => { setA(d.a); setB(d.b); }));
//   }, [curClassId, curSemester]);
//   if (!loaded) return <FormLoading />;   // ← 로드 전에는 입력 UI 자체를 띄우지 않는다
//
// - loaded      : 최초 로드가 끝났는지. false 동안 입력 UI를 렌더하지 않으면
//                 사용자가 값을 건드릴 수 없으므로 유실 자체가 발생하지 않는다.
// - applyLoaded : 세터들을 감싸 실행하고 loaded=true로 전환. 응답이 늦게 와도
//                 키(deps)가 이미 바뀌었으면 무시해 이전 학급 값이 새 화면에
//                 섞여 들어가지 않는다.
// - reload      : 저장 후 재조회 등으로 다시 로딩 상태로 되돌릴 때.
export default function useFormLoad(deps = []) {
  const key = JSON.stringify(deps);
  const keyRef = useRef(key);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    keyRef.current = key;
    setLoaded(false);
  }, [key]);

  const applyLoaded = useCallback(
    (fn) => {
      // 응답이 도착한 시점의 키가 현재 키와 다르면(학급·학기를 이미 바꿨으면) 버린다.
      if (keyRef.current !== key) return;
      if (typeof fn === 'function') fn();
      setLoaded(true);
    },
    [key]
  );

  const reload = useCallback(() => setLoaded(false), []);

  return { loaded, applyLoaded, reload };
}

// 로드 중 자리표시자 — 입력 UI 대신 잠깐 보여준다.
export function FormLoading({ label = '불러오는 중…' }) {
  return (
    <div
      className="card"
      style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}
      aria-busy="true"
    >
      <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>⏳</div>
      {label}
    </div>
  );
}
