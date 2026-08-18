import { useState } from 'react';
import { useGuide } from './GuideContext';

// Topbar의 ❓ 도움 버튼 — 어느 화면에서든 (1) 그 화면 사용법 안내(투어)와
// (2) 용어 사전을 연다 (mds/23 기능③).

export default function HelpMenu() {
  const { startTour, openGlossary } = useGuide();
  const [open, setOpen] = useState(false);

  return (
    <div className="help-menu" data-tour="help-btn">
      <button
        className="help-btn"
        onClick={() => setOpen((o) => !o)}
        title="도움말 — 화면 안내 · 용어 사전"
        aria-label="도움말 열기"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ❓
      </button>
      {open && (
        <>
          <div className="help-backdrop" onClick={() => setOpen(false)} />
          <div className="help-drop" role="menu" aria-label="도움말 메뉴">
            <button role="menuitem" onClick={() => { setOpen(false); startTour(); }}>
              👣 이 화면 사용법 안내
            </button>
            <button role="menuitem" onClick={() => { setOpen(false); openGlossary(); }}>
              📖 용어 사전 — 쉬운 말 풀이
            </button>
          </div>
        </>
      )}
    </div>
  );
}
