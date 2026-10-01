// 체험 시연 재생 엔진(mds/46 §2-3) — 화면(DOM)을 모르는 순수 로직. 테스트: lib/utils/__tests__/demo.test.js
//
// 대본(chapters)을 한 단계씩 실행하고, 멈춤·이어 보기·2배속·'다음 장'(빨리 감기)·그만을 다룬다.
// 실제 화면 조작은 exec(step, ctx)가 맡는다(lib/demo/exec.js). exec 안의 모든 기다림은 ctx.wait를 써야
// 멈춤·그만·빨리 감기가 즉시 먹힌다.
//
// '다음 장'은 건너뛰기가 아니라 빨리 감기다 — 앞 장에서 만드는 학생·기록이 뒤 장의 재료라서,
// 남은 단계를 기다림 없이 끝까지 실행해 화면 상태를 맞춘 뒤 다음 장으로 간다.

export class DemoStopped extends Error {
  constructor() { super('stopped'); this.name = 'DemoStopped'; }
}

const TICK_MS = 50;

/**
 * @param {object} o
 * @param {Array<{id:string,title:string,steps:object[]}>} o.chapters
 * @param {(step:object, ctx:object) => Promise<void>} o.exec
 * @param {(state:object) => void} [o.onChange]
 * @param {(ms:number) => Promise<void>} [o.sleep]  테스트에서 가짜 시계를 넣을 때
 */
export function createDemoRunner({ chapters, exec, onChange, sleep }) {
  const nap = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const st = {
    status: 'idle', // idle | playing | paused | done | stopped | error
    chapter: 0,
    step: 0,
    speed: 1,
    fast: false, // '다음 장' 빨리 감기 중
    error: null,
  };
  let running = false;

  const snapshot = () => ({ ...st, total: chapters.length, title: chapters[st.chapter]?.title || '' });
  const emit = () => { try { onChange && onChange(snapshot()); } catch (_e) { /* 화면 갱신 실패는 재생과 무관 */ } };
  const set = (patch) => { Object.assign(st, patch); emit(); };

  // 멈춤 중이면 풀릴 때까지 기다리고, 그만이면 DemoStopped를 던진다.
  async function gate() {
    for (;;) {
      if (st.status === 'stopped') throw new DemoStopped();
      if (st.status !== 'paused') return;
      await nap(TICK_MS);
    }
  }

  // 배속·멈춤·빨리 감기를 반영한 기다림. 멈춘 동안은 시간이 흐르지 않는다.
  async function wait(ms) {
    let left = Math.max(0, Number(ms) || 0);
    while (left > 0) {
      await gate();
      if (st.fast) return;
      const d = Math.min(TICK_MS, left);
      await nap(d);
      left -= d * st.speed;
    }
    await gate();
  }

  // 화면이 바뀌기를 기다리는 짧은 실제 시간(빨리 감기·배속과 무관). 멈춤·그만은 반영한다.
  async function poll(ms = 100) {
    await gate();
    await nap(ms);
    await gate();
  }

  const ctx = {
    wait,
    poll,
    gate,
    isFast: () => st.fast,
    speed: () => st.speed,
  };

  async function loop() {
    if (running) return;
    running = true;
    try {
      while (st.chapter < chapters.length) {
        const steps = chapters[st.chapter].steps || [];
        while (st.step < steps.length) {
          await gate();
          await exec(steps[st.step], ctx);
          st.step += 1;
          emit();
        }
        st.chapter += 1;
        st.step = 0;
        st.fast = false;
        emit();
      }
      set({ status: 'done', fast: false });
    } catch (e) {
      if (e instanceof DemoStopped) return; // 그만 — 상태는 stop()이 이미 바꿈
      set({ status: 'error', error: (e && e.message) || String(e), fast: false });
    } finally {
      running = false;
    }
  }

  return {
    state: snapshot,
    /** 처음(또는 지정한 장)부터 재생 */
    start(fromChapter = 0) {
      if (running) return;
      set({ status: 'playing', chapter: Math.max(0, Math.min(fromChapter, chapters.length)), step: 0, fast: false, error: null });
      loop();
    },
    pause() { if (st.status === 'playing') set({ status: 'paused' }); },
    resume() { if (st.status === 'paused') set({ status: 'playing' }); },
    toggle() { if (st.status === 'playing') this.pause(); else if (st.status === 'paused') this.resume(); },
    setSpeed(n) { set({ speed: n >= 2 ? 2 : 1 }); },
    /** 지금 장의 남은 단계를 기다림 없이 끝내고 다음 장으로 */
    nextChapter() {
      if (st.status === 'paused') st.status = 'playing';
      if (st.status === 'playing') set({ fast: true });
    },
    /** 오류로 멈춘 단계부터 다시 */
    retry() {
      if (st.status !== 'error' || running) return;
      set({ status: 'playing', error: null });
      loop();
    },
    // 끝난 뒤에도 '직접 해 보기'로 끝 화면을 닫을 수 있게 언제나 stopped로.
    stop() { set({ status: 'stopped', fast: false }); },
    isRunning: () => running,
  };
}
