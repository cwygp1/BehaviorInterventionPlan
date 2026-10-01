import { useEffect, useState } from 'react';

// '글씨 크게' 켜기·끄기 (mds/44 S1) — <html data-font="lg">면 기준 글자 16→18px(globals.css).
// 이 기기에만 기억하고, 첫 화면 깜빡임을 막으려고 pages/_document.js가 같은 키를 읽어 그리기 전에 켠다.
// 사이드바 아래(이름 위)에 둔다 — 상단바 요소는 늘리지 않는다(0824), ❓ 도움말은 다른 작업 중(1001).
export const FONT_KEY = 'kb_font_lg';

export default function FontSizeToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(document.documentElement.getAttribute('data-font') === 'lg'); }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.setAttribute('data-font', 'lg');
    else document.documentElement.removeAttribute('data-font');
    try { if (next) localStorage.setItem(FONT_KEY, '1'); else localStorage.removeItem(FONT_KEY); } catch (_e) { /* 저장 못 해도 이번 화면은 적용 */ }
  };
  return (
    <div className="sb-font">
      <button type="button" className={'sb-font-btn' + (on ? ' on' : '')} onClick={toggle} aria-pressed={on} title="화면 글씨를 한 단계 크게 — 이 컴퓨터에 기억돼요">
        <span aria-hidden="true">🔠</span> 글씨 크게 <span className="sb-font-state">{on ? '켜짐' : '꺼짐'}</span>
      </button>
    </div>
  );
}
