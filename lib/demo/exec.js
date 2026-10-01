// 체험 시연 — 대본 한 단계를 실제 화면에서 실행한다(mds/46 §2-3). 브라우저 전용.
//
// ui(재생기 화면)가 주는 것: caption(text) · ring(el) · cursorTo(el) · clickFx() · navigate(page) · activePage()
// 입력은 React 제어 입력이라 값 설정자(native setter) + input/change 이벤트로 넣는다 — 그래야 onChange가 돈다.
// 화면 요소를 못 찾으면 친절한 문장으로 Error를 던진다 → 재생기가 '다시 시도 / 직접 해 보기'를 보여 준다.

const DEFAULT_TIMEOUT = 8000;
const POLL_MS = 100;
const FOLD_OPEN_EVENT = 'kkobak-fold-open'; // components/ui/FoldCard.jsx와 같은 이름

export const anchorSel = (key) => (/^[#[.]/.test(key) ? key : `[data-demo="${key}"],[data-help="${key}"],[data-tour="${key}"]`);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (!el.getClientRects().length) return false;
  const cs = window.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function anchorEls(key) {
  try { return [...document.querySelectorAll(anchorSel(key))]; } catch (_e) { return []; }
}

// 접힌 곳(FoldCard·<details>) 안이면 펼쳐 달라고 요청한다 — 투어와 같은 방식.
function revealAll(key) {
  anchorEls(key).forEach((el) => {
    const fold = el.closest('[data-fold-id]');
    if (fold) window.dispatchEvent(new CustomEvent(FOLD_OPEN_EVENT, { detail: { id: fold.getAttribute('data-fold-id') } }));
    let p = el.parentElement;
    while (p) { if (p.tagName === 'DETAILS' && !p.open) p.open = true; p = p.parentElement; }
  });
}

const CONTROL_SEL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select';
const isControl = (el) => !!el && el.matches && el.matches(CONTROL_SEL);
function controlIn(el) {
  if (!el) return null;
  if (isControl(el)) return el;
  return [...el.querySelectorAll(CONTROL_SEL)].find((c) => !c.closest('.qchip') && isVisible(c)) || null;
}

function findByLabel(label, within) {
  const roots = within ? anchorEls(within).filter(isVisible) : [document.body];
  for (const root of roots) {
    const labels = [...root.querySelectorAll('label, .form-label')].filter(isVisible);
    for (const l of labels) {
      if (!norm(l.textContent).startsWith(label)) continue;
      if (l.htmlFor) { const t = document.getElementById(l.htmlFor); if (t) return t; }
      const inner = controlIn(l);
      if (inner && inner !== l) return inner;
      const group = l.closest('.form-group, .mon-field, .auth-field') || l.parentElement;
      const ctl = controlIn(group);
      if (ctl) return ctl;
    }
  }
  return null;
}

/** 단계가 가리키는 화면 요소(없으면 null). */
export function findTarget(step) {
  if (step.label) return findByLabel(step.label, step.within);
  let els = anchorEls(step.el).filter(isVisible);
  if (step.match) els = els.flatMap((e) => (e.matches(step.match) ? [e] : [...e.querySelectorAll(step.match)])).filter(isVisible);
  if (step.contains) els = els.filter((e) => norm(e.textContent).includes(step.contains));
  return els[0] || null;
}

const countOf = (key) => anchorEls(key).length;

export function setNativeValue(el, value) {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function describe(step) {
  if (step.label) return `'${step.label}' 칸`;
  if (step.contains) return `'${step.contains}'`;
  return `'${step.el || step.page}'`;
}

const autoMs = (text) => Math.max(1600, String(text || '').length * 70);

export function createDemoExec(ui) {
  async function waitFor(fn, ctx, timeout = DEFAULT_TIMEOUT) {
    for (let t = 0; t <= timeout; t += POLL_MS) {
      const v = fn();
      if (v) return v;
      await ctx.poll(POLL_MS);
    }
    return null;
  }

  async function need(step, ctx, timeout) {
    if (step.el) revealAll(step.el);
    const el = await waitFor(() => findTarget(step), ctx, timeout);
    if (!el) throw new Error(`화면에서 ${describe(step)}을(를) 찾지 못했어요.`);
    return el;
  }

  // 보이는 자리 = 위쪽 상단바 아래 ~ 아래쪽 재생 바 위. 그 안에 없으면 스크롤해 가운데쯤으로.
  function inSafeZone(el) {
    const r = el.getBoundingClientRect();
    const top = 72;
    const bottom = window.innerHeight - (ui.bottomInset ? ui.bottomInset() : 200);
    if (r.height > bottom - top) return r.top >= top - 4 && r.top <= top + 40; // 큰 카드는 윗부분이 보이면 됨
    return r.top >= top && r.bottom <= bottom;
  }
  function snapIntoView(el) {
    const r = el.getBoundingClientRect();
    const top = 72;
    const bottom = window.innerHeight - (ui.bottomInset ? ui.bottomInset() : 200);
    const target = r.height > bottom - top ? top + 8 : top + (bottom - top - r.height) / 2;
    // 가장 가까운 스크롤 상자를 찾아 그만큼 민다(없으면 창).
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = window.getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) { p.scrollTop += r.top - target; return; }
      p = p.parentElement;
    }
    window.scrollBy(0, r.top - target);
  }

  async function bring(el, ctx) {
    if (!inSafeZone(el)) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: document.hidden || ctx.isFast() ? 'auto' : 'smooth' }); } catch (_e) { /* 오래된 브라우저 */ }
      await ctx.wait(450);
      // 부드러운 스크롤이 덜 갔거나(숨은 창 등) 재생 바에 가리면 바로 맞춘다.
      if (!inSafeZone(el)) snapIntoView(el);
    }
    ui.ring(el);
    await ctx.wait(250);
    ui.cursorTo(el);
    await ctx.wait(520);
  }

  async function lead(step, ctx) {
    if (!step.text) return;
    ui.caption(step.text);
    await ctx.wait(Math.max(900, String(step.text).length * 45));
  }

  const run = {
    async say(step, ctx) {
      ui.caption(step.text);
      ui.ring(null);
      await ctx.wait(step.ms || autoMs(step.text));
    },

    async point(step, ctx) {
      if (step.el) revealAll(step.el);
      const el = await waitFor(() => findTarget(step), ctx, step.optional ? 2500 : DEFAULT_TIMEOUT);
      if (!el) {
        if (step.optional) return;
        throw new Error(`화면에서 ${describe(step)}을(를) 찾지 못했어요.`);
      }
      if (step.text) ui.caption(step.text);
      await bring(el, ctx);
      await ctx.wait(step.ms || (step.text ? autoMs(step.text) : 1200));
    },

    async go(step, ctx) {
      if (ui.activePage() !== step.page) {
        const nav = findTarget({ el: 'nav-' + step.page });
        if (nav) {
          await bring(nav, ctx);
          ui.clickFx();
          nav.click();
        }
        // 메뉴가 안 보이는 화면(다른 영역)이거나 메뉴 클릭이 막히면 직접 이동한다.
        const moved = await waitFor(() => ui.activePage() === step.page, ctx, nav ? 1500 : 0);
        if (!moved) ui.navigate(step.page);
        const arrived = await waitFor(() => ui.activePage() === step.page, ctx, 5000);
        if (!arrived) throw new Error(`'${step.page}' 화면으로 가지 못했어요.`);
      }
      ui.ring(null);
      if (step.ready) await need({ el: step.ready }, ctx, 12000);
      await ctx.wait(500);
    },

    async click(step, ctx) {
      const el = await (step.optional
        ? waitFor(() => findTarget(step), ctx, 2500)
        : need(step, ctx));
      if (!el) return;
      await lead(step, ctx);
      await bring(el, ctx);
      // 막힌 단추면 풀릴 때까지(저장 중 등) 잠시 기다린다.
      await waitFor(() => !el.disabled, ctx, 6000);
      const before = step.expectMore ? countOf(step.expectMore) : 0;
      ui.clickFx();
      el.click();
      if (step.expectMore) {
        const ok = await waitFor(() => countOf(step.expectMore) > before, ctx, 15000);
        if (!ok) throw new Error('저장이 끝나지 않았어요. 인터넷 연결을 확인해 주세요.');
      }
      await ctx.wait(step.ms != null ? step.ms : 700);
    },

    async type(step, ctx) {
      const host = await need(step, ctx);
      const el = controlIn(host);
      if (!el) throw new Error(`${describe(step)}에 글자를 넣을 칸이 없어요.`);
      await lead(step, ctx);
      await bring(el, ctx);
      try { el.focus({ preventScroll: true }); } catch (_e) { /* noop */ }
      const v = String(step.value);
      if (ctx.isFast()) {
        setNativeValue(el, v);
      } else {
        for (let i = 1; i <= v.length; i += 1) {
          setNativeValue(el, v.slice(0, i));
          await ctx.wait(90);
        }
      }
      await ctx.wait(350);
    },

    async fill(step, ctx) {
      const host = await need(step, ctx);
      const el = controlIn(host);
      if (!el) throw new Error(`${describe(step)}에 값을 넣을 칸이 없어요.`);
      if (step.text) { await lead(step, ctx); await bring(el, ctx); } else { ui.ring(el); }
      setNativeValue(el, String(step.value));
      await ctx.wait(step.text ? 500 : 160);
    },

    async select(step, ctx) {
      const host = await need(step, ctx);
      const el = controlIn(host);
      if (!el || el.tagName !== 'SELECT') throw new Error(`${describe(step)} 고르기 칸이 없어요.`);
      await lead(step, ctx);
      await bring(el, ctx);
      const want = String(step.value);
      const opts = [...el.options];
      const opt = opts.find((o) => o.value === want) || opts.find((o) => norm(o.textContent).includes(want));
      if (!opt) throw new Error(`${describe(step)}에 '${want}' 항목이 없어요.`);
      setNativeValue(el, opt.value);
      await ctx.wait(650);
    },

    async wait(step, ctx) {
      if (step.el) revealAll(step.el);
      const el = await waitFor(() => findTarget(step), ctx, step.timeout || DEFAULT_TIMEOUT);
      if (!el && !step.optional) throw new Error(`화면에서 ${describe(step)}을(를) 찾지 못했어요.`);
    },

    async waitGone(step, ctx) {
      const gone = await waitFor(() => !findTarget(step), ctx, step.timeout || 12000);
      if (!gone) throw new Error(`${describe(step)}이(가) 닫히지 않았어요.`);
      ui.ring(null);
      await ctx.wait(400);
    },
  };

  return async function exec(step, ctx) {
    const fn = run[step.t];
    if (!fn) throw new Error('알 수 없는 시연 단계: ' + step.t);
    await fn(step, ctx);
  };
}
