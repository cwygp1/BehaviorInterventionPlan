// 학생 수첩 탭(새 디자인 3단계) — 이유·계획 탭 진행 줄 3칸과 기록 탭 '처음 설정' 상태를 학생 자료로 계산하는 순수 함수.
//   재료는 GET /api/students/{id}/all 응답(StudentContext curStuData) 하나. 새 API 없음.
//   접힘 규칙(0821 결정 '작게 두면 안 하게 된다'): 미설정·기록 0건이면 펼침, 끝났으면 접힘 — 펼침 여부도 여기서 정한다.
//   ⚠ React·DB 없는 순수 함수(node --test, lib/utils/__tests__/notebook.test.js).
import { normalizeDesign, designTitle } from './scedDesigns.js';
import { bipHasContent } from './docs.js';

export const QABF_TOTAL = 25;
// 'X(해당 없음, -2)'도 답한 것으로 센다(Tier3Page 6단계 집계와 같음).
export const qabfAnswered = (qabf) => (Array.isArray(qabf) ? qabf : []).filter((v) => v >= 0 || v === -2).length;

/**
 * 이유·계획 탭 진행 줄 — 관찰 → 이유 찾기 → 계획 세우기.
 *   관찰: ABC + 행동 수치 기록 1건 이상이면 끝 / 이유: QABF 25문항 다 답하면 끝 / 계획: BIP(대체·예방·교수·강화·반응 중 하나) 있으면 끝.
 *   now = 처음으로 안 끝난 칸(다 끝났으면 'done').
 */
export function planProgress(data) {
  const d = data || {};
  const obsN = (d.abc || []).length + (d.mon || []).length;
  const qabfN = qabfAnswered(d.qabf);
  const qabfDone = qabfN >= QABF_TOTAL;
  const planDone = bipHasContent(d.bip);
  const now = obsN === 0 ? 'obs' : !qabfDone ? 'why' : !planDone ? 'plan' : 'done';
  const order = ['obs', 'why', 'plan'];
  const state = (k, done) => (done ? 'done' : k === now ? 'now' : 'later');
  const steps = [
    { key: 'obs', n: 1, label: '관찰', state: state('obs', obsN > 0), text: obsN > 0 ? `${obsN}건 기록함` : '지금 할 차례' },
    { key: 'why', n: 2, label: '이유 찾기', state: state('why', qabfDone), text: qabfDone ? '25문항 다 답함' : qabfN > 0 ? `${qabfN}/25 답함` : (now === 'why' ? '지금 할 차례' : '관찰한 뒤에') },
    { key: 'plan', n: 3, label: '계획 세우기', state: state('plan', planDone), text: planDone ? '중재 계획 있음' : (now === 'plan' ? '지금 할 차례' : '이유를 찾은 뒤에') },
  ];
  // 'later'인데 이미 시작한 칸은 그대로 later(진행 글자만 보임). 순서 검사용.
  return { obsN, qabfN, qabfDone, planDone, now, steps, order };
}

/**
 * 기록 탭 '처음 설정' — 표적행동 정의 · 관찰 기간 · 기록 설계 · 점검표 교시.
 *   끝 판정: 정의 있음 + 관찰 기간 1개 이상 + (매일 점검표 소그룹이면) 교시가 정해짐. 설계는 기본값(AB)도 설정으로 친다.
 * @param {object} data curStuData
 * @param {{inGroup?: boolean}} [opt]  이 학생이 매일 점검표 소그룹에 있나
 */
export function recordSetup(data, { inGroup = false } = {}) {
  const d = data || {};
  const bip = d.bip || {};
  const opdef = String(bip.opdef || '').trim();
  const periods = d.periods || [];
  const active = periods.find((p) => !p.end_date) || null;
  const design = normalizeDesign(bip.design);
  const lastCico = (d.cico || [])[0] || null;
  const cicoPeriods = lastCico && Array.isArray(lastCico.periods) ? lastCico.periods.length : 0;
  const items = [
    { key: 'opdef', label: '표적행동 정의', done: !!opdef, text: opdef ? (opdef.length > 40 ? opdef.slice(0, 40) + '…' : opdef) : '아직 없음' },
    { key: 'period', label: '관찰 기간', done: periods.length > 0, text: periods.length ? (active ? `${active.start_date}부터 진행 중` : `${periods.length}개 기록`) : '아직 없음' },
    { key: 'design', label: '기록 설계', done: true, text: bip.design ? designTitle(design) : `${designTitle(design)} — 기본값` },
    {
      key: 'cico', label: '점검표 교시', done: !inGroup || cicoPeriods > 0,
      text: !inGroup ? '매일 점검표 소그룹 아님' : cicoPeriods > 0 ? `${cicoPeriods}교시` : '아직 정하지 않음',
    },
  ];
  const done = items.every((it) => it.done);
  const summary = items.map((it) => `${it.label} ${it.done && it.key !== 'design' && it.key !== 'cico' ? '✓' : ''}${it.key === 'design' || it.key === 'cico' ? it.text : ''}`.trim()).join(' · ');
  return { items, done, open: !done, summary };
}

/** 오늘(KST 날짜) 이 학생이 남긴 관찰·수치 기록 수, 최근 기록 몇 줄(날짜 내림차순). */
export function recentRecords(data, today, limit = 5) {
  const d = data || {};
  const rows = [
    ...(d.abc || []).map((r) => ({ kind: 'abc', id: 'a' + r.id, date: r.date || String(r.created_at || '').slice(0, 10), at: r.created_at || '', text: [r.time, r.b].filter(Boolean).join(' · ') || '행동 관찰' })),
    ...(d.mon || []).map((r) => ({ kind: 'mon', id: 'm' + r.id, date: r.date || '', at: r.created_at || '', text: `${r.beh || '행동'} · 빈도 ${r.freq ?? '-'}회${r.phase ? ` · ${r.phase === 'A' ? '기초선' : '중재'}` : ''}` })),
  ];
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.at || '').localeCompare(a.at || ''));
  const todayN = rows.filter((r) => r.date === today).length;
  return { todayN, total: rows.length, rows: rows.slice(0, limit) };
}
