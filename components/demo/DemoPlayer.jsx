import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGuide } from '../guide/GuideContext';
import { createDemoRunner } from '../../lib/demo/runner';
import { buildDemoScript } from '../../lib/demo/script';
import { createDemoExec } from '../../lib/demo/exec';

// ▶ 3분 체험하기 재생기(mds/46 §2) — 체험 계정(user.is_demo)일 때만 pages/index.js가 Layout 안에 띄운다.
//   · 자막 + 짚은 곳 테두리 + 움직이는 커서로 동영상처럼 보여 주고, 실제로 학생·기록을 만든다.
//   · 재생 중 화면을 누르면 멈춘다(투명 막). 멈춘 동안은 화면을 직접 만질 수 있다.
//   · ✋ 내가 해볼게요 → 재생을 끝내고 그 자리에서 직접 써 본다(만든 데이터는 그대로).
//   · 처음부터 다시 보기 → 새 체험 계정으로 다시 시작(같은 학생 코드가 겹치지 않게).
//   · 재생 중엔 자동 화면 투어가 끼어들지 않게 끈다(❓ 도움말 기능 자체는 그대로).

const AUTOPLAY_KEY = 'kb_demo_autoplay';
const CHAPTER_KEY = 'kb_demo_chapter'; // 1009(mds/48 #15): 새로고침 뒤 'N장부터 이어 보기'
// 1009(mds/48 #4·#13): 체험 중 브라우저에 남은 안내 표시 — 가입(새 계정)으로 넘어갈 때 지운다(새 계정에 체크리스트·소개 줄·길잡이가 그대로 안 보이는 문제).
const ONBOARDING_KEYS_PREFIX = ['kb_tour_done:', 'kb_intro_hide:'];
const ONBOARDING_KEYS = ['kb_start_list_off', 'kb_intro_off', 'kb_portal_hint_seen'];
function clearOnboardingMarks() {
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k && (ONBOARDING_KEYS.includes(k) || ONBOARDING_KEYS_PREFIX.some((p) => k.startsWith(p)))) drop.push(k); }
    drop.forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem('kb_escort');
    sessionStorage.removeItem(CHAPTER_KEY);
  } catch (_e) { /* 사생활 모드 */ }
}
// 홈 투어 '봤음' 표시(GuideContext와 같은 키) — 시연을 본 뒤 직접 해 볼 때 9단계 투어가 또 뜨지 않게.
// 우리가 세운 표시인지 기억해 두었다가, 가입으로 넘어가면 지워 진짜 첫 방문 안내가 나오게 한다.
const TOUR_DONE_KEY = 'kb_tour_done:home';
const TOUR_MARK_KEY = 'kb_demo_marked_tour';

function markTourSeen() {
  try {
    if (localStorage.getItem(TOUR_DONE_KEY)) return;
    localStorage.setItem(TOUR_DONE_KEY, '1');
    sessionStorage.setItem(TOUR_MARK_KEY, '1');
  } catch (_e) { /* 사생활 모드 */ }
}
function unmarkTourSeen() {
  try {
    if (sessionStorage.getItem(TOUR_MARK_KEY) !== '1') return;
    localStorage.removeItem(TOUR_DONE_KEY);
    sessionStorage.removeItem(TOUR_MARK_KEY);
  } catch (_e) { /* 사생활 모드 */ }
}

function rectOf(el) {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export default function DemoPlayer({ activePage, onNavigate }) {
  const { startDemo, logout } = useAuth();
  const guide = useGuide();
  const [st, setSt] = useState({ status: 'idle', chapter: 0, total: 0, speed: 1, title: '' });
  const [caption, setCaption] = useState('');
  const [ringEl, setRingEl] = useState(null);
  const [ring, setRing] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [clickKey, setClickKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const pauseBtnRef = useRef(null); // 1009(#22): 재생 바가 뜨면 ⏸로 초점
  const endFirstRef = useRef(null); // 1009(#24): 끝 화면이 뜨면 첫 단추로 초점
  const [resumeAt, setResumeAt] = useState(() => { try { return Number(sessionStorage.getItem(CHAPTER_KEY) || 0) || 0; } catch (_e) { return 0; } });
  // 자동 재생을 기다리는 동안엔 아래 '체험 계정' 칩을 띄우지 않는다(깜빡임 방지).
  const [autoPending, setAutoPending] = useState(() => {
    try { return typeof window !== 'undefined' && sessionStorage.getItem(AUTOPLAY_KEY) === '1'; } catch (_e) { return false; }
  });

  const pageRef = useRef(activePage);
  pageRef.current = activePage;
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  const chapters = useMemo(() => buildDemoScript(), []);

  const ui = useMemo(() => ({
    caption: (t) => setCaption(t || ''),
    ring: (el) => setRingEl(el || null),
    cursorTo: (el) => {
      const r = rectOf(el);
      if (r) setCursor({ x: r.x + Math.min(r.w * 0.5, 60), y: r.y + Math.min(r.h * 0.5, 24) });
    },
    clickFx: () => setClickKey((k) => k + 1),
    navigate: (page) => navRef.current && navRef.current(page),
    activePage: () => pageRef.current,
    // 재생 바가 가리는 아래쪽 높이 — 짚을 곳을 그 위로 스크롤한다.
    bottomInset: () => {
      const bar = document.querySelector('.demo-bar');
      return bar ? window.innerHeight - bar.getBoundingClientRect().top + 16 : 200;
    },
  }), []);

  const runnerRef = useRef(null);
  if (!runnerRef.current) {
    runnerRef.current = createDemoRunner({ chapters, exec: createDemoExec(ui), onChange: (s) => {
      setSt(s);
      // 진행 장을 적어 둔다(#15) — 끝나면 지운다.
      try { if (s.status === 'done') sessionStorage.removeItem(CHAPTER_KEY); else if (s.status === 'playing' || s.status === 'paused') sessionStorage.setItem(CHAPTER_KEY, String(s.chapter)); } catch (_e) { /* noop */ }
      if (s.status === 'playing' || s.status === 'paused') setResumeAt(s.chapter);
    } });
  }
  const runner = runnerRef.current;

  const playing = st.status === 'playing';
  const paused = st.status === 'paused';
  const active = playing || paused || st.status === 'error';

  useEffect(() => { setMounted(true); }, []);

  // 처음 들어왔을 때 자동 재생(로그인 창 '체험하기' 또는 '처음부터 다시 보기'가 표시를 남김).
  //   ⚠ 표시는 실제로 시작할 때 지운다 — 개발 모드는 효과를 두 번 돌려서(마운트→정리→마운트),
  //     읽자마자 지우면 두 번째 실행이 표시를 못 보고 재생이 시작되지 않았다(1001 실화면).
  useEffect(() => {
    let auto = false;
    try { auto = sessionStorage.getItem(AUTOPLAY_KEY) === '1'; } catch (_e) { auto = false; }
    if (!auto) { setAutoPending(false); return undefined; }
    const t = setTimeout(() => {
      try { sessionStorage.removeItem(AUTOPLAY_KEY); } catch (_e) { /* noop */ }
      setAutoPending(false);
      runner.start(0);
    }, 600);
    return () => clearTimeout(t);
  }, [runner]);

  // 떠날 때(로그아웃 등) 재생을 멈춘다.
  useEffect(() => () => runner.stop(), [runner]);

  // body 표시 — 알림(토스트)을 재생 바 위로 올리는 등 CSS가 쓴다.
  useEffect(() => {
    document.body.classList.add('demo-on');
    return () => document.body.classList.remove('demo-on');
  }, []);
  useEffect(() => {
    document.body.classList.toggle('demo-active', active);
    return () => document.body.classList.remove('demo-active');
  }, [active]);

  // 재생 중엔 자동 투어·길잡이가 끼어들지 않게(첫 방문 자동 시작 등).
  //   1009(mds/48 #29): 홈 투어 '봤음' 표시를 재생 시작 때 바로 적어 둔다 — 시작 1~2초 안에 멈추면 길잡이 '처음 시작하기'가 겹쳐 뜨던 문제.
  //   우리가 적은 표시는 가입으로 넘어갈 때 되돌린다(unmarkTourSeen).
  useEffect(() => {
    if (!playing) return;
    markTourSeen();
    if (guide.tourKey) guide.stopTour();
    if (guide.escort && typeof guide.stopEscort === 'function') guide.stopEscort();
  }, [playing, guide]);

  // 1009(mds/48 #22): 키보드 — 재생 중 Space/Esc = 멈춤, 멈춘 상태 Esc = 직접 해 보기, Space = 이어 보기. 입력 칸에 초점이 있을 땐 건드리지 않는다.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !playing) return;
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (playing) runner.pause(); else if (paused) runner.resume(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (playing) runner.pause(); else handOffRef.current(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, playing, paused, runner]);
  // 재생 바가 처음 뜰 때 ⏸ 단추로 초점(마우스 없이도 멈출 수 있게).
  useEffect(() => { if (active && pauseBtnRef.current) { try { pauseBtnRef.current.focus({ preventScroll: true }); } catch (_e) { /* noop */ } } }, [active]);
  // 끝 화면: 첫 단추로 초점 + Esc = 직접 해 보기 + Tab 가두기(#24).
  useEffect(() => {
    if (st.status !== 'done') return undefined;
    try { endFirstRef.current && endFirstRef.current.focus(); } catch (_e) { /* noop */ }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); handOffRef.current(); return; }
      if (e.key !== 'Tab') return;
      const box = document.querySelector('.demo-end');
      if (!box) return;
      const f = [...box.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [st.status]);

  // 짚은 곳 테두리 — 화면이 움직여도 따라가게 계속 잰다.
  useEffect(() => {
    if (!ringEl) { setRing(null); return undefined; }
    const tick = () => setRing(rectOf(ringEl));
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [ringEl]);

  // 재생이 끝나거나 멈추면 테두리·커서를 정리한다.
  useEffect(() => {
    if (st.status === 'done' || st.status === 'stopped' || st.status === 'idle') { setRingEl(null); setCursor(null); }
  }, [st.status]);

  const handOff = useCallback(() => {
    markTourSeen();
    runner.stop();
    setCaption('');
    setRingEl(null);
    setCursor(null);
    try { sessionStorage.removeItem(CHAPTER_KEY); } catch (_e) { /* noop */ }
  }, [runner]);
  const handOffRef = useRef(handOff);
  handOffRef.current = handOff;

  // 1009(mds/48 #15·#4): 같은 체험 계정에서 이어 보기(새 계정을 만들지 않아 IP 한도를 안 먹음). 앞 장이 만든 학생·기록은 그대로.
  const resume = useCallback(() => {
    const from = Math.max(0, Math.min(resumeAt, chapters.length - 1));
    runner.start(from);
  }, [runner, resumeAt, chapters.length]);

  const restart = useCallback(async () => {
    if (!window.confirm('새 체험 교실로 처음부터 다시 볼까요?\n(지금 체험 기록은 바로 지워져요. 같은 교실에서 이어 보려면 "이어 보기"를 쓰세요.)')) return;
    setRestarting(true);
    runner.stop();
    try {
      await startDemo();
      try { window.history.replaceState(null, '', '#home'); } catch (_e) { /* noop */ }
      window.location.reload();
    } catch (e) {
      setRestarting(false);
      window.alert('체험을 다시 시작하지 못했어요: ' + e.message);
    }
  }, [runner, startDemo]);

  const signup = useCallback(async () => {
    // 1009(mds/48 #4): 체험 기록은 새 계정으로 옮겨지지 않는다 — 넘어가기 전에 한 번 확인.
    if (!window.confirm('체험에서 만든 학생·기록은 새 계정으로 옮겨지지 않아요(체험 교실은 지워져요).\n가입 화면으로 갈까요?')) return;
    runner.stop();
    unmarkTourSeen();
    clearOnboardingMarks(); // 체크리스트 접기·소개 줄 숨김·길잡이 진행이 새 계정으로 새지 않게(#13·#11)
    if (guide.escort && typeof guide.stopEscort === 'function') guide.stopEscort();
    try { sessionStorage.setItem('kb_auth_tab', 'signup'); } catch (_e) { /* noop */ }
    await logout();
  }, [runner, logout, guide]);

  if (!mounted) return null;

  const chapterNo = Math.min(st.chapter + 1, chapters.length);
  const body = (
    <>
      {playing && (
        <div
          className="demo-shield"
          onClick={() => { runner.pause(); }}
          title="누르면 멈춰요"
          aria-hidden="true"
        />
      )}
      {active && ring && (
        <div className="demo-ring" style={{ left: ring.x - 6, top: ring.y - 6, width: ring.w + 12, height: ring.h + 12 }} aria-hidden="true" />
      )}
      {active && cursor && (
        <div className="demo-cursor" style={{ left: cursor.x, top: cursor.y }} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.3L16 20l-3 1.4-3.7-7.3L4 18.6z" fill="#1f2a44" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          <span key={clickKey} className={clickKey ? 'demo-click' : ''} />
        </div>
      )}

      {active && (
        <div className="demo-bar" role="region" aria-label="체험 시연">
          <div className="demo-head">
            <span className="demo-badge">🎬 체험 시연</span>
            <span className="demo-prog" role="img" aria-label={`${chapters.length}장 중 ${chapterNo}장`}>
              {chapters.map((c, i) => (
                <span key={c.id} className={'demo-dot' + (i < st.chapter ? ' done' : i === st.chapter ? ' on' : '')} title={c.title} />
              ))}
            </span>
            <span className="demo-chap">{chapterNo}/{chapters.length} · {chapters[Math.min(st.chapter, chapters.length - 1)].title}</span>
          </div>
          <div className="demo-cap" aria-live="polite" aria-atomic="true">
            {st.status === 'error'
              ? <>⚠ 화면이 예상과 달라 시연을 멈췄어요. <span className="demo-err">{st.error}</span></>
              : paused ? <>⏸ 멈췄어요. 화면을 직접 살펴봐도 돼요. ▶를 누르면 이어서 봐요.</>
                : (caption || '…')}
          </div>
          <div className="demo-ctl">
            {st.status === 'error' ? (
              <>
                <button type="button" ref={pauseBtnRef} className="demo-b pri" onClick={() => runner.retry()} title="멈춘 단계부터(저장 단계는 다시 누르지 않고 결과만 기다려요)">↻ 다시 시도</button>
                <button type="button" className="demo-b" onClick={() => runner.retryChapter()} title="화면을 옮겼거나 뒤로 갔다면 이 장을 처음부터">↻ 이 장 처음부터</button>
                <button type="button" className="demo-b" onClick={handOff}>✋ 직접 해 볼게요</button>
                <button type="button" className="demo-b" onClick={restart} disabled={restarting}>↺ 새 교실로 처음부터</button>
              </>
            ) : (
              <>
                <button type="button" ref={pauseBtnRef} className="demo-b pri" onClick={() => runner.toggle()} title="Space 또는 Esc로도 멈춰요">{playing ? '⏸ 멈추기' : '▶ 이어 보기'}</button>
                <button type="button" className="demo-b" onClick={() => runner.setSpeed(st.speed >= 2 ? 1 : 2)} aria-label={`재생 속도 ${st.speed >= 2 ? 2 : 1}배속 — 누르면 ${st.speed >= 2 ? 1 : 2}배속`}>{st.speed >= 2 ? '2배속' : '1배속'}</button>
                <button type="button" className="demo-b" onClick={() => runner.nextChapter()} disabled={st.fast} title="이 장을 빠르게 끝내고 다음 장으로">⏭ 다음 장</button>
                <button type="button" className="demo-b ok" onClick={handOff} title="시연을 끝내고 지금 화면에서 직접 써 봐요">✋ 내가 해볼게요</button>
              </>
            )}
          </div>
        </div>
      )}

      {st.status === 'done' && (
        <div className="demo-end-bg">
          <div className="demo-end" role="dialog" aria-modal="true" aria-label="체험 시연 끝">
            <div className="demo-end-ico">🎉</div>
            <h3>한 바퀴 다 봤어요</h3>
            <p>학생 등록 → 행동 기록 → IEP 목표 → 행동 데이터 → 결과 그래프까지, 방금 만든 기록이 그대로 남아 있어요. 이제 직접 눌러 보세요.</p>
            <p className="demo-end-sub">지금 보신 학생·기록은 <strong>체험용</strong>이라 가입 계정에는 들어가지 않아요(체험 교실은 24시간 뒤 지워져요). 오른쪽 위 🧭 길잡이를 누르면 화면마다 할 일을 다시 안내받을 수 있어요.</p>
            <div className="demo-end-btns">
              <button type="button" ref={endFirstRef} className="demo-b ok big" onClick={handOff}>✋ 직접 해 보기</button>
              <button type="button" className="demo-b pri big" onClick={signup}>📝 내 계정 만들기</button>
              <button type="button" className="demo-b big" onClick={restart} disabled={restarting}>↺ 새 교실로 처음부터 다시 보기</button>
            </div>
          </div>
        </div>
      )}

      {!active && !autoPending && st.status !== 'done' && (
        <div className="demo-chip" role="region" aria-label="체험 계정">
          <span>🎬 체험 교실 · 기록은 가입 계정으로 안 옮겨져요</span>
          <button type="button" className="demo-b sm" onClick={resume} title="같은 교실에서 지금 화면 그대로 재생해요">{resumeAt > 0 ? `▶ ${resumeAt + 1}장부터 이어 보기` : '▶ 시연 보기'}</button>
          <button type="button" className="demo-b sm" onClick={restart} disabled={restarting} title="새 체험 교실을 만들어 처음부터">↺ 새 교실</button>
          <button type="button" className="demo-b sm pri" onClick={signup}>📝 가입하기</button>
        </div>
      )}
    </>
  );
  return createPortal(body, document.body);
}
