import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDemoRunner } from '../../demo/runner.js';
import {
  buildDemoScript, collectAnchors, schoolDaysBefore, DEMO_STEP_TYPES, DEMO_FREQ, DEMO_PHASE_SWITCH, DEMO_STANDARD,
} from '../../demo/script.js';

// ▶ 3분 체험하기(mds/46) — 재생 엔진·대본 검사.

const tick = () => new Promise((r) => setImmediate(r));
const until = async (fn, n = 2000) => { for (let i = 0; i < n; i += 1) { if (fn()) return true; await tick(); } return false; };

function fakeChapters() {
  return [
    { id: 'a', title: 'A', steps: [{ t: 'x', n: 1 }, { t: 'x', n: 2 }] },
    { id: 'b', title: 'B', steps: [{ t: 'x', n: 3, ms: 400 }, { t: 'x', n: 4, ms: 400 }] },
  ];
}

test('재생 엔진: 단계를 순서대로 모두 실행하고 done', async () => {
  const seen = [];
  const r = createDemoRunner({ chapters: fakeChapters(), exec: async (s, ctx) => { seen.push(s.n); await ctx.wait(s.ms || 0); }, sleep: tick });
  r.start();
  assert.ok(await until(() => r.state().status === 'done'));
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

test('재생 엔진: 멈춘 동안은 다음 단계로 가지 않고, 이어 보기로 계속', async () => {
  const seen = [];
  let release;
  const hold = new Promise((res) => { release = res; });
  const r = createDemoRunner({
    chapters: fakeChapters(),
    exec: async (s, ctx) => { seen.push(s.n); if (s.n === 1) await hold; await ctx.wait(10); },
    sleep: tick,
  });
  r.start();
  await until(() => seen.length === 1);
  r.pause();
  release();
  for (let i = 0; i < 200; i += 1) await tick();
  assert.deepEqual(seen, [1], '멈춘 동안 2단계가 시작되면 안 됨');
  assert.equal(r.state().status, 'paused');
  r.resume();
  assert.ok(await until(() => r.state().status === 'done'));
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

test('재생 엔진: 그만(stop)은 즉시 끝나고 이후 단계를 실행하지 않음', async () => {
  const seen = [];
  const r = createDemoRunner({ chapters: fakeChapters(), exec: async (s, ctx) => { seen.push(s.n); await ctx.wait(1000); }, sleep: tick });
  r.start();
  await until(() => seen.length === 1);
  r.stop();
  for (let i = 0; i < 300; i += 1) await tick();
  assert.equal(r.state().status, 'stopped');
  assert.deepEqual(seen, [1]);
});

test('재생 엔진: 다음 장 = 남은 단계를 기다림 없이 실행(건너뛰지 않음)', async () => {
  const seen = [];
  let waited = 0;
  const r = createDemoRunner({
    chapters: fakeChapters(),
    exec: async (s, ctx) => { seen.push(s.n); const t0 = waited; await ctx.wait(100000); waited = t0 + 1; },
    sleep: async (ms) => { waited += ms; await tick(); },
  });
  r.start();
  await until(() => seen.length === 1);
  r.nextChapter();
  assert.ok(await until(() => r.state().chapter === 1));
  assert.deepEqual(seen.slice(0, 2), [1, 2], '1장의 남은 단계도 실행됨');
  assert.equal(r.state().fast, false, '다음 장에 들어가면 빨리 감기 해제');
  r.stop();
});

test('재생 엔진: 오류면 error 상태 → 다시 시도는 그 단계부터', async () => {
  const seen = [];
  let fail = true;
  const r = createDemoRunner({
    chapters: fakeChapters(),
    exec: async (s) => { seen.push(s.n); if (s.n === 2 && fail) { fail = false; throw new Error('못 찾음'); } },
    sleep: tick,
  });
  r.start();
  assert.ok(await until(() => r.state().status === 'error'));
  assert.equal(r.state().error, '못 찾음');
  r.retry();
  assert.ok(await until(() => r.state().status === 'done'));
  assert.deepEqual(seen, [1, 2, 2, 3, 4]);
});

test('재생 엔진: 2배속이면 기다림이 절반', async () => {
  const total = { 1: 0, 2: 0 };
  for (const sp of [1, 2]) {
    let slept = 0;
    const r = createDemoRunner({
      chapters: [{ id: 'a', title: 'A', steps: [{ t: 'x' }] }],
      exec: async (_s, ctx) => { await ctx.wait(1000); },
      sleep: async (ms) => { slept += ms; await tick(); },
    });
    r.setSpeed(sp);
    r.start();
    await until(() => r.state().status === 'done');
    total[sp] = slept;
  }
  assert.equal(total[1], 1000);
  assert.equal(total[2], 500);
});

test('대본: 6장, 단계 종류가 모두 알려진 것', () => {
  const ch = buildDemoScript({ today: new Date(2026, 9, 1) });
  assert.equal(ch.length, 6);
  ch.forEach((c) => c.steps.forEach((s) => assert.ok(DEMO_STEP_TYPES.includes(s.t), `${c.id}: ${s.t}`)));
});

test('대본: 쓰인 앵커가 모두 소스(data-demo·data-help·data-tour)에 있다', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  });
  walk(path.join(root, 'components'));
  const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const missing = collectAnchors(buildDemoScript()).filter((k) => !new RegExp(`data-(demo|help|tour)="${k}"`).test(src));
  assert.deepEqual(missing, [], '대본이 가리키는데 화면에 없는 앵커');
});

test('대본: 행동 데이터는 기초선 5일 + 중재 5일, 중재 평균이 더 낮다', () => {
  const a = DEMO_FREQ.slice(0, DEMO_PHASE_SWITCH);
  const b = DEMO_FREQ.slice(DEMO_PHASE_SWITCH);
  assert.equal(a.length, 5);
  assert.equal(b.length, 5);
  const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
  assert.ok(mean(b) < mean(a));
  const steps = buildDemoScript({ today: new Date(2026, 9, 1) }).find((c) => c.id === 'monitor').steps;
  assert.equal(steps.filter((s) => s.t === 'click' && s.el === 'mon-save').length, DEMO_FREQ.length);
  assert.equal(steps.filter((s) => s.contains === 'B · 중재').length, 1);
});

test('대본: 성취기준 코드가 성취기준 데이터에 있다', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const d = JSON.parse(fs.readFileSync(path.join(root, 'public/data/achievement-standards.json'), 'utf8'));
  const row = d.rows.find((r) => r[3] === DEMO_STANDARD);
  assert.ok(row, DEMO_STANDARD);
  assert.equal(row[0], '국어');
  assert.equal(String(row[1]), '2');
});

test('지난 평일: 오늘 제외, 주말 제외, 오래된 날부터', () => {
  const days = schoolDaysBefore(new Date(2026, 9, 5), 10); // 2026-10-05(월)
  assert.equal(days.length, 10);
  assert.equal(days[days.length - 1], '2026-10-02'); // 금
  assert.ok(!days.includes('2026-10-05'));
  days.forEach((s) => { const w = new Date(s + 'T00:00:00').getDay(); assert.ok(w !== 0 && w !== 6, s); });
  assert.deepEqual([...days].sort(), days);
});
