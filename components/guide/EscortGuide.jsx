import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuide } from './GuideContext';
import { useStudents } from '../../contexts/StudentContext';
import { ESCORTS, getEscort } from '../../lib/escorts';
import {
  anchorSelector, applies, doneKind, escortAnchor, escortCursor, idsDoneBySignal, isStateStep,
} from '../../lib/escortEngine';
import { ESCORT_EVENT } from '../../lib/escortSignal';
import { PAGE_META, PAGE_SECTION, SECTIONS } from '../../lib/tiers';
import { revealAnchor } from './reveal';

// 🧭 길잡이(에스코트) — 선생님이 고른 일 하나를 실제 화면 위에서 한 단계씩 데려다 준다 (1001 사용자 결정).
//
// 투어(SpotlightTour)와 다른 점:
//   · 클릭을 막지 않는다 — 테두리·흐림은 pointer-events:none, 선생님은 짚은 곳을 직접 누른다.
//   · '다음' 단추가 없다 — 짚은 곳을 누르거나·화면에 도착하거나·저장하면 저절로 넘어간다(lib/escortEngine.js).
//     막히면 '이미 했어요'·'건너뛰기'·'바로 가기'로 넘긴다.
//   · 다른 화면으로 가도 이어지고, 새로고침해도 이어진다(GuideContext의 sessionStorage).
//   · 오른쪽 아래 패널에 점검표를 두고, 짚을 곳에는 테두리와 짧은 꼬리표를 단다.
// 흐림은 선생님이 글자를 쓰는 동안(입력칸 포커스)과 창(모달) 안에서는 끈다 — 쓰고 있는 곳이 어두워지지 않게.
// 화면이 늦게 그려지는 곳(IEP 경로 B, 창 열림 등)이 많아 400ms마다 다시 판정한다(그리는 비용은 작다).

const TICK_MS = 400;
const DONE_MARK = '__finished';
const PAD = 6;
const INTERACTIVE = 'button,a,input,select,textarea,label,[role="button"],[role="tab"],[role="option"]';
const isEditable = (el) => !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

function find(key) {
  if (!key || typeof document === 'undefined') return null;
  try { return document.querySelector(anchorSelector(key)); } catch (_) { return null; }
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
}

// 화면에 보이는 부분만 테두리로 — 화면 밖이면 null.
function clip(r, vw, vh) {
  if (!r || r.width <= 0 || r.height <= 0) return null;
  const top = Math.max(4, r.top - PAD);
  const left = Math.max(4, r.left - PAD);
  const bottom = Math.min(vh - 4, r.bottom + PAD);
  const right = Math.min(vw - 4, r.right + PAD);
  if (bottom - top < 12 || right - left < 12) return null;
  return { top, left, width: right - left, height: bottom - top };
}

function scrollToEl(el) {
  try {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top >= 60 && r.bottom <= vh - 20) return; // 이미 보임
    el.scrollIntoView({ block: r.height > vh * 0.7 ? 'start' : 'center', behavior: 'smooth' });
  } catch (_) { /* noop */ }
}

export default function EscortGuide() {
  const {
    escort, stopEscort, startEscort, markEscortDone, setEscortMin,
    activePage, onNavigate, actions, tourKey, glossary, menuOpen, setMenuOpen,
  } = useGuide();
  const { curClass, students, studentsLoaded, curStuId } = useStudents();
  const [, setTick] = useState(0);
  const [flash, setFlash] = useState(false);
  const scrolledFor = useRef('');
  const dockRef = useRef(null);
  const firstVisitDone = useRef(false);

  const def = escort ? getEscort(escort.id) : null;

  // ── 지금 단계 계산(렌더마다 — 400ms 틱이 화면 변화를 따라잡는다) ──
  const ctx = {
    activePage,
    hasClass: !!curClass,
    studentCount: (students || []).length,
    curStuId,
    has: (k) => !!find(k),
  };
  const steps = def ? def.steps : [];
  const cursor = def ? escortCursor(steps, escort.doneIds, ctx) : 0;
  // 한 번 끝난 길은 끝난 채로 — 새로고침으로 학생 선택이 풀려도 처음으로 돌아가지 않는다.
  const finished = !!def && (cursor >= steps.length || escort.doneIds.includes(DONE_MARK));
  const step = def && !finished ? steps[cursor] : null;
  const anchorKey = step ? escortAnchor(step, activePage, PAGE_SECTION, ctx.has) : null;
  const target = anchorKey ? find(anchorKey) : null;

  // 이벤트 핸들러가 최신 값을 보게(리스너는 길마다 한 번만 단다).
  const live = useRef({});
  live.current = { def, cursor, step, anchorKey };

  // 최초 방문 1회 — 예전 홈 자동 투어 자리(mds/44 S2 흡수). 학생이 없으면 '처음 시작하기' 길을 바로 띄우고,
  // 있으면 길잡이 메뉴를 열어 고르게 한다. 기존 투어를 본 기기(kb_tour_done:home)는 건너뛴다.
  useEffect(() => {
    if (!studentsLoaded || firstVisitDone.current) return undefined;
    let seen = '1';
    try { seen = localStorage.getItem('kb_tour_done:home') || ''; } catch (_) { seen = '1'; }
    if (seen || escort) { firstVisitDone.current = true; return undefined; }
    const empty = !(students || []).length;
    // '봤음'은 실제로 띄울 때 적는다 — 개발 모드의 두 번 마운트(정리 함수가 타이머를 지움)에도 한 번은 뜨게.
    const t = setTimeout(() => {
      firstVisitDone.current = true;
      try { localStorage.setItem('kb_tour_done:home', '1'); } catch (_) { /* 사생활 모드 */ }
      if (empty) startEscort('start'); else setMenuOpen(true);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentsLoaded]);

  // 틱 — 화면이 늦게 바뀌는 곳(창 열림·경로 전환)과 스크롤 위치를 따라간다.
  useEffect(() => {
    if (!escort) return undefined;
    const bump = () => setTick((n) => (n + 1) % 1e6);
    const id = setInterval(bump, TICK_MS);
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true); // .main/.content 스크롤도 capture로
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
    };
  }, [escort]);

  useEffect(() => {
    if (escort && def && cursor >= steps.length && !escort.doneIds.includes(DONE_MARK)) markEscortDone(DONE_MARK);
  }, [escort, def, cursor, steps.length, markEscortDone]);

  // 화면이 바뀌면 틱을 기다리지 않고 바로 다시 판정 — 새 화면의 앵커는 그려진 뒤에야 찾을 수 있다.
  useEffect(() => {
    if (!escort) return undefined;
    const t = setTimeout(() => setTick((n) => (n + 1) % 1e6), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  // 실제 행동 감지 — 짚은 곳 누르기·쓰기, 저장 신호.
  useEffect(() => {
    if (!escort) return undefined;
    const hostOf = () => {
      const { step: s, anchorKey: k } = live.current;
      if (!s || !k) return null;
      const kind = doneKind(s);
      if (kind !== 'click' && kind !== 'input') return null;
      const host = find(k);
      return host ? { s, kind, host } : null;
    };
    const onClick = (e) => {
      const h = hostOf();
      const t = e.target;
      if (!h || !(t instanceof Element) || !h.host.contains(t)) return;
      const hit = t.closest(INTERACTIVE);
      if (h.kind === 'click' && (h.host.matches(INTERACTIVE) || (hit && h.host.contains(hit)))) markEscortDone(h.s.id);
      // 쓰기 단계에서 칩(단추)으로 고르는 것도 '썼다'로 친다 — 입력칸을 누르기만 한 것은 아니다.
      if (h.kind === 'input') {
        const btn = t.closest('button,[role="button"],[role="option"]');
        if (btn && h.host.contains(btn)) markEscortDone(h.s.id);
      }
    };
    const onInput = (e) => {
      const h = hostOf();
      if (h && h.kind === 'input' && e.target instanceof Element && h.host.contains(e.target)) markEscortDone(h.s.id);
    };
    const onSignal = (e) => {
      const { def: d, cursor: c } = live.current;
      if (!d) return;
      markEscortDone(idsDoneBySignal(d.steps, c, e.detail && e.detail.kind));
    };
    window.addEventListener('click', onClick, true);
    window.addEventListener('input', onInput, true);
    window.addEventListener('change', onInput, true);
    window.addEventListener(ESCORT_EVENT, onSignal);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('input', onInput, true);
      window.removeEventListener('change', onInput, true);
      window.removeEventListener(ESCORT_EVENT, onSignal);
    };
  }, [escort, markEscortDone]);

  // 단계가 바뀌면 짚을 곳을 펼치고 화면 안으로 — 글자를 쓰는 중이면 화면을 움직이지 않는다.
  const stepKey = escort && step ? `${escort.id}:${step.id}:${anchorKey}` : '';
  const found = !!target;
  useEffect(() => {
    if (!stepKey || !found || scrolledFor.current === stepKey) return;
    scrolledFor.current = stepKey;
    const el = find(live.current.anchorKey);
    if (!el) return undefined;
    revealAnchor(el);
    // 화면을 옮긴 직후엔 Layout이 스크롤을 맨 위로 되감고(즉시+80ms), 데이터가 늦게 그려지며 자리가 밀린다.
    // 그래서 조금 기다렸다 스크롤하고, 한 번 더 확인한다(1001 실화면: IEP '만드는 순서' 카드가 화면 아래에 남아 있었다).
    const go = () => {
      const cur = find(live.current.anchorKey);
      if (cur && !isEditable(document.activeElement)) scrollToEl(cur);
    };
    const t1 = setTimeout(go, 350);
    const t2 = setTimeout(go, 1300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [stepKey, found]);

  const showWhere = useCallback(() => {
    const el = find(live.current.anchorKey);
    if (!el) return;
    revealAnchor(el);
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* noop */ }
    setFlash(true);
    setTimeout(() => setFlash(false), 1400);
  }, []);

  if (!escort || !def) return null;
  if (tourKey || glossary.open) return null; // 투어·용어 사전이 떠 있는 동안은 쉰다
  // 길잡이 메뉴가 열려 있으면 패널을 숨긴다 — 메뉴는 상단바(z-index 10) 안이라 패널보다 위로 올릴 수 없다.
  // 메뉴 맨 위 '지금 ○○ 따라 하는 중'이 이어서 보기·그만을 대신한다.
  if (menuOpen) return null;

  // ── 짚을 곳 테두리 ──
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const modalOpen = typeof document !== 'undefined' && !!document.querySelector('.modal-bg');
  const inModal = !!(target && target.closest('.modal-bg'));
  const typing = typeof document !== 'undefined' && isEditable(document.activeElement);
  const hole = target && !menuOpen && (!modalOpen || inModal) ? clip(rectOf(target), vw, vh) : null;
  const dim = !!hole && !typing && !inModal;
  const tagTop = hole ? (hole.top > 40 ? hole.top - 30 : hole.top + hole.height + 6) : 0;
  const tagLeft = hole ? Math.max(8, Math.min(hole.left, vw - 220)) : 0;

  // ── 패널 ──
  const visible = steps.map((s, i) => ({ s, i })).filter(({ s }) => applies(s, ctx)); // 경로에 안 맞는 단계는 숨김
  const pos = Math.max(1, visible.findIndex(({ i }) => i === cursor) + 1);
  const listCur = finished ? steps.length : cursor; // 끝난 길은 점검표를 모두 ✓로
  const page = step && step.done && step.done.page;
  const go = step ? (step.go || (page ? { page, label: `${PAGE_META[page]?.label || '그 화면'} 열기` } : null)) : null;
  const runGo = () => {
    if (!go) return;
    if (go.action) actions[go.action]?.();
    else if (go.page) onNavigate(go.page);
  };
  const event = step && !isStateStep(step);
  const modalHint = step && modalOpen && !inModal;
  // 홈에서 '화면 가기'면 영역 카드를 짚는다 — 안내 문구(왼쪽 메뉴)와 어긋나지 않게 한 줄 덧붙인다.
  const homeCard = anchorKey && anchorKey.startsWith('pcard-') ? SECTIONS[anchorKey.slice(6)] : null;
  // 다른 영역이면 상단 영역 단추를 짚는다 — 안내 문구(왼쪽 메뉴)보다 먼저 할 일을 한 줄로.
  const chipSec = anchorKey && anchorKey.startsWith('tb-chip-') ? anchorKey.slice(8) : null;
  const chipLabel = chipSec ? (chipSec === 'iep' ? 'IEP' : 'T' + (SECTIONS[chipSec]?.tier || '')) : '';
  // 패널이 짚은 곳을 가리면 위쪽으로 옮긴다(오른쪽 아래 → 오른쪽 위).
  let dockTop = false;
  if (hole && dockRef.current && !escort.min) {
    const d = dockRef.current.getBoundingClientRect();
    const overlap = !(hole.left + hole.width < d.left || hole.left > d.right || hole.top + hole.height < vh - d.height - 16 || hole.top > vh);
    const topSlot = { top: 64, bottom: 64 + d.height };
    const overlapTop = !(hole.left + hole.width < d.left || hole.left > d.right || hole.top + hole.height < topSlot.top || hole.top > topSlot.bottom);
    dockTop = overlap && !overlapTop;
  }

  return (
    <>
      {hole && (
        <>
          <div
            className={'esc-ring' + (dim ? ' dim' : '') + (flash ? ' flash' : '')}
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            aria-hidden="true"
          />
          <div className="esc-tag" style={{ top: tagTop, left: tagLeft }} aria-hidden="true">👆 {step.title}</div>
        </>
      )}

      <div ref={dockRef} className={'esc-dock' + (escort.min ? ' min' : '') + (dockTop ? ' top' : '')} role="region" aria-label="길잡이" aria-live="polite">
        {escort.min ? (
          <button type="button" className="esc-pill" onClick={() => setEscortMin(false)} title="길잡이 펼치기">
            🧭 {finished ? '다 했어요 🎉' : `${pos}/${visible.length} · ${step.title}`} <span aria-hidden="true">▴</span>
          </button>
        ) : (
          <>
            <div className="esc-head">
              <span className="esc-title">🧭 {def.icon} {def.title}</span>
              <span className="esc-count">{finished ? '완료' : `${pos} / ${visible.length}`}</span>
              <button type="button" className="esc-x" onClick={() => setEscortMin(true)} aria-label="길잡이 접기" title="접기">▾</button>
              <button type="button" className="esc-x" onClick={stopEscort} aria-label="길잡이 그만하기" title="그만하기">✕</button>
            </div>
            <ol className="esc-list">
              {visible.map(({ s, i }) => (
                <li key={s.id} className={i < listCur ? 'done' : i === listCur ? 'now' : ''}>
                  <span className="esc-mark" aria-hidden="true">{i < listCur ? '✓' : i === listCur ? '▶' : '○'}</span>
                  {s.title}
                  {s.optional && i >= listCur && <span className="esc-opt">(골라도 되고 넘어가도 돼요)</span>}
                </li>
              ))}
            </ol>

            {finished ? (
              <div className="esc-now">
                <div className="esc-say">🎉 {def.finish}</div>
                <div className="esc-acts">
                  {(def.next || []).filter((id) => ESCORTS[id]).map((id, i) => (
                    <button key={id} type="button" className={'btn btn-sm ' + (i === 0 ? 'btn-pri' : 'btn-ghost')} onClick={() => startEscort(id)}>
                      {ESCORTS[id].icon} {ESCORTS[id].title}
                    </button>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { stopEscort(); setMenuOpen(true); }}>다른 일 고르기</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={stopEscort}>닫기</button>
                </div>
              </div>
            ) : (
              <div className="esc-now">
                <div className="esc-say">{step.say}</div>
                {homeCard && !modalHint && <div className="esc-sub">홈에서는 먼저 {homeCard.icon} {homeCard.title} 카드를 눌러요.</div>}
                {chipSec && !modalHint && <div className="esc-sub">지금은 다른 영역이에요. 위쪽 ‘{chipLabel}’ 단추를 먼저 눌러요.</div>}
                {modalHint && <div className="esc-sub">창이 열려 있어요 — 창 안에서 마치고 닫으면 이어서 짚어 드릴게요.</div>}
                {!modalHint && !target && !go && <div className="esc-sub">이 화면에서는 짚을 곳이 보이지 않아요. 화면을 조금 내려 보거나 ‘이미 했어요’를 눌러 주세요.</div>}
                <div className="esc-acts">
                  {go && !modalHint && <button type="button" className="btn btn-pri btn-sm" onClick={runGo}>{go.label} →</button>}
                  {target && !modalHint && <button type="button" className="btn btn-ghost btn-sm" onClick={showWhere}>📍 어디요?</button>}
                  {event && !step.optional && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => markEscortDone(step.id)}>이미 했어요</button>
                  )}
                  {step.optional && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => markEscortDone(step.id)}>건너뛰기</button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
