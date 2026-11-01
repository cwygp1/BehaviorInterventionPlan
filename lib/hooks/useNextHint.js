import { useEffect, useState } from 'react';

// 저장 직후 '다음 단계' 반짝임(kkobak-next-hint, 0819) 받기 — 기존 Sidebar.jsx:103-119와 같은 규칙.
//   화면이 hintNextStep(옛 id)로 쏜 이벤트의 옛 id를 10초 동안 돌려준다. 새 셸은 메뉴·탭·하위 칩에 불을 켠다.
export function useNextHint() {
  const [hint, setHint] = useState('');
  useEffect(() => {
    let timer;
    const onHint = (e) => {
      const page = e?.detail?.page;
      if (!page) return;
      setHint(page);
      clearTimeout(timer);
      timer = setTimeout(() => setHint(''), 10000);
    };
    window.addEventListener('kkobak-next-hint', onHint);
    return () => { clearTimeout(timer); window.removeEventListener('kkobak-next-hint', onHint); };
  }, []);
  return [hint, setHint];
}
