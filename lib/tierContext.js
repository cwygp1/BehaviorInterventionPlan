// 공유 Tier/학생 컨텍스트 빌더 — "이 학생에게 실제 운영 중인 다층 지원"을
// 모든 AI 생성기·문서 출력이 동일하게 주입하도록 한 곳에 모은 모듈.
//
// 설계 배경(2026-06-26 심층분석 P1·P3·P4·P5):
//   기존에는 IepPage.jsx의 buildStudentSummary/buildTierLinkage 만이 Tier1(학급 PBS)·
//   Tier2(소그룹/CICO)·모듈1(출발점)을 프롬프트에 넣었고, printTier3·통합 생성기·
//   BIP/평가/위기/가정통신 생성기는 이 맥락을 받지 못했다. 이 모듈을 단일 출처로 삼아
//   모든 소비자가 같은 Tier 맥락을 쓰게 한다.
//
// 순수 함수(React 의존 없음) + 비동기 로더(api 호출)로 구성한다.
// 개인정보 원칙: 학생코드 외 식별정보는 절대 포함하지 않는다.

import { fetchClassPBS, fetchStartpoint } from './api/students';
import { studentProfileParts, decomposeNote } from './utils/splitNote';

// RAISD 선호/강화물 데이터 → 프롬프트 라인 배열. (BIP 강화·가정통신 등에서 재사용)
// data.raisd = { responses: { <질문키>: {items, intensity, followup}, _meta: {ranking, banned, unlimited} } }
export function raisdLines(data) {
  const resp = data?.raisd?.responses;
  if (!resp) return [];
  const meta = resp._meta || {};
  const lines = [];
  const prefs = Object.entries(resp)
    .filter(([k, v]) => k !== '_meta' && v && v.items)
    .sort((a, b) => (b[1].intensity || 0) - (a[1].intensity || 0))
    .slice(0, 5)
    .map(([, v]) => `${v.items}${v.intensity ? `(강도 ${v.intensity}/5)` : ''}`);
  const ranked = Array.isArray(meta.ranking) ? meta.ranking.filter(Boolean).slice(0, 5) : [];
  if (ranked.length) lines.push(`선호/강화물(RAISD 선호도 순위): ${ranked.join(' > ')}`);
  else if (prefs.length) lines.push(`선호/강화물(RAISD): ${prefs.join(', ')}`);
  if (meta.unlimited) lines.push(`제한 없이 사용 가능한 강화물: ${meta.unlimited}`);
  if (meta.banned) lines.push(`⚠ 사용 금지 강화물: ${meta.banned} — 강화·중재 제안에서 반드시 제외할 것`);
  return lines;
}

// ---------------------------------------------------------------------------
// 1) 학생 누적 데이터 → 비식별 요약(문자열). (IepPage.buildStudentSummary 이식)
//    startpoint 는 모듈1 산출물 객체 { supportNeeds, functions, perfLevel } (camelCase).
// ---------------------------------------------------------------------------
export function buildStudentSummary({ student, data, startpoint } = {}) {
  const stu = student || {};
  const lines = [];
  lines.push(`학생: ${stu.code || '익명'} (익명 ID) · ${stu.level || ''} · ${stu.disability || ''}`);
  // 강점/어려움을 명시적으로 분리해 전달 — AI가 강점 기반(PBS 철학) 접근을 하도록.
  const { strengths, difficulties } = studentProfileParts(stu);
  if (strengths) lines.push(`강점: ${strengths}`);
  if (difficulties) lines.push(`어려움(지원 요구의 신호): ${difficulties}`);
  const dec = stu.note ? decomposeNote(stu.note) : { strengths: '', difficulties: '', extra: '' };
  const structured = !!(stu.strengths || stu.difficulties || dec.strengths || dec.difficulties);
  if (structured && dec.extra) {
    // 라벨 밖의 추가 요약(현행수준 등)만 별도 라인으로 — 강점/어려움과 중복 방지.
    lines.push(`비식별 요약(기타): ${dec.extra.replace(/\n/g, ' / ')}`);
  } else if (!strengths && !difficulties && stu.note) {
    lines.push(`비식별 요약: ${stu.note}`);
  }

  // 선호/강화물(RAISD) — 강화 전략·동기 유발에 직접 활용, 금지 항목은 제외 지시.
  raisdLines(data).forEach((l) => lines.push(l));

  const abc = data?.abc || [];
  if (abc.length) {
    lines.push(`ABC 관찰 ${abc.length}건. 최근 사례:`);
    abc.slice(-3).forEach((r) =>
      lines.push(`  · 선행 "${r.antecedent || r.a || ''}" → 행동 "${r.behavior || r.b || ''}" → 후속 "${r.consequence || r.c || ''}"`)
    );
  }
  const mon = data?.mon || [];
  if (mon.length) lines.push(`행동 데이터 ${mon.length}건 누적(빈도/강도 기록).`);
  const sz = data?.sz || [];
  if (sz.length) lines.push(`심리안정실 이용 ${sz.length}회.`);
  const bip = data?.bip || {};
  if (bip.alt || bip.prev || bip.teach) {
    lines.push(`BIP: 대체행동 "${bip.alt || ''}", 예방 "${bip.prev || ''}", 교수 "${bip.teach || ''}", 강화 "${bip.reinf || ''}".`);
  }
  // 0719: 조작적 정의·행동목표도 컨텍스트에 포함 — IEP·생성기가 행동중재와 결합되도록.
  // ※ 소재 오염 주의(0720): 이 정보는 행동·사회성 내용을 다룰 때만 참고해야 하며,
  //    교과 학습 목표의 소재를 행동중재로 바꾸는 데 쓰이면 안 된다는 단서를 함께 넣는다.
  // 0814 전문가 자문(구병모): 행동목표의 IEP 반영 방식은 '선택의 문제' — 교사가 BIP에서
  //    고른 행선지(bgoal_dest: 'iep' 개별화 목표로 / 'subject' 교과 목표에 녹임)를 따른다.
  //    미선택('')이면 종전대로 보수적으로(행동·사회성 한정) 지시한다.
  if (bip.opdef) lines.push(`표적행동 조작적 정의: "${bip.opdef}". (행동 지원 참고용 — 교과 목표의 소재로 쓰지 말 것)`);
  if (bip.bgoal) {
    const dest = bip.bgoal_dest || '';
    if (dest === 'iep') {
      lines.push(`행동목표(메이거식): "${bip.bgoal}" — 교사가 이 목표를 IEP의 개별화(행동·사회성) 목표로 가져가기로 선택함. 행동·사회성 영역의 학기목표·평가에 그대로 활용하되, 교과 학습 목표의 소재로는 끌어오지 말 것.`);
    } else if (dest === 'subject') {
      lines.push(`행동목표(메이거식): "${bip.bgoal}" — 교사가 이 목표를 교과 목표에 녹이기로 선택함. 교과 학기목표·평가계획을 쓸 때 이 행동 지원 요소(예: 참여 행동, 도움 요청하기)를 교과 활동 맥락 안에 자연스럽게 통합할 것. 단, 교과의 성취기준·소재 자체를 행동중재 내용으로 바꾸지는 말 것.`);
    } else {
      lines.push(`행동목표(메이거식): "${bip.bgoal}" — 행동·사회성 영역을 다룰 때만 참고하고, 교과 학습 목표의 소재로 끌어오지 말 것.`);
    }
  }
  const qabf = data?.qabf || [];
  if (Array.isArray(qabf) && qabf.some((v) => v >= 0)) lines.push('QABF 기능평가 완료(행동 기능 분석 자료 있음).');

  // 모듈1 출발점 산출물 — 이 IEP/지원의 출발점(행동 = 지원요구 신호).
  const sp = startpoint || {};
  if (sp.supportNeeds || sp.functions || sp.perfLevel) {
    lines.push('[모듈1 출발점 — 학습자 분석 산출물]');
    if (sp.supportNeeds) lines.push(`  · 생활지원 요구: ${String(sp.supportNeeds).replace(/\n/g, ' / ')}`);
    if (sp.functions) lines.push(`  · 기능 목록화: ${String(sp.functions).replace(/\n/g, ' / ')}`);
    if (sp.perfLevel) lines.push(`  · 수행 가능 수준: ${String(sp.perfLevel).replace(/\n/g, ' / ')}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2) 실제 운영 중인 다층 지원(Tier 1 학급 PBS · Tier 2 소그룹/CICO) → 문자열.
//    (IepPage.buildTierLinkage 이식) classPBS·tier2Groups·data.cico 를 받는다.
// ---------------------------------------------------------------------------
export function buildTierLinkage({ studentId, data, classPBS, tier2Groups } = {}) {
  const lines = [];

  // Tier 1 — 학급 보편 지원(반·학기 단위 class_pbs_state)
  if (classPBS && (classPBS.goal || (classPBS.rewards || []).length)) {
    const parts = [];
    if (classPBS.goal) parts.push(`학급 공통 목표 "${classPBS.goal}"`);
    if (classPBS.target_points != null) parts.push(`강화 체계 목표 ${classPBS.target_points}점${classPBS.current_points != null ? ` (현재 ${classPBS.current_points}점)` : ''}`);
    const rw = (classPBS.rewards || []).map((r) => (typeof r === 'string' ? r : (r && (r.name || r.label || r.title)) || '')).filter(Boolean);
    if (rw.length) parts.push(`보상: ${rw.join(', ')}`);
    lines.push(`· Tier 1 (학급 보편 지원): ${parts.join(' · ')}. 학급 전체에 적용되는 보편적 환경·강화 지원.`);
  }

  // Tier 2 — 소그룹 표적 지원: 소속 그룹 + CICO(체크인·체크아웃) 운영 내용
  const myGroup = (tier2Groups || []).find((g) => (g.members || []).some((m) => m.student_id === studentId));
  const cico = Array.isArray(data?.cico) ? data.cico : [];
  const latest = cico[0]; // 최신순 정렬되어 있음
  if (myGroup || latest) {
    const parts = [];
    if (myGroup) parts.push(`소속 소그룹 "${myGroup.name}"${myGroup.note ? ` (비고: ${myGroup.note})` : ''}`);
    if (latest) {
      const gs = (latest.goals || []).filter(Boolean);
      if (gs.length) parts.push(`CICO 일일 행동목표 — ${gs.join(' / ')}`);
      const pds = (latest.periods || []).filter(Boolean);
      if (pds.length) parts.push(`일일 행동점검표(DPR) 구조: ${pds.join('·')}`);
      if (latest.check_in_time || latest.check_out_time) parts.push(`체크인 ${latest.check_in_time || '-'} / 체크아웃 ${latest.check_out_time || '-'}`);
      if (latest.total_score != null && latest.max_score) parts.push(`최근 수행 ${latest.total_score}/${latest.max_score}점`);
      parts.push(`최근 점검일 ${latest.date || '-'}`);
    }
    lines.push(`· Tier 2 (소그룹 표적 지원): ${parts.join(' · ')}. 보편적 지원에 더해 운영 중인 표적 집단 중재.`);
  }

  if (!lines.length) return '';
  return `[지원 체계 연동 — 이 학생에게 실제 운영 중인 다층 지원]\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// 3) 비동기 로더 — 호출부가 갖고 있지 않은 조각(classPBS·startpoint)을 대신 불러와
//    요약+연동 텍스트를 한 번에 만든다. 어떤 생성기든 이 함수 하나만 부르면 된다.
//
//    인자:
//      student     : curStu (코드·level·disability·note·class_id)
//      studentId   : curStuId
//      data        : curStuData (abc·mon·bip·qabf·sz·cico 등)
//      tier2Groups : useStudents().tier2Groups
//      startpoint  : 이미 로드했다면 전달(없으면 내부에서 fetch)
//      semester    : 학기(1|2) — Tier1 학급 PBS 조회 스코프
//    반환: { summary, linkage, text }  (text = summary + linkage 결합)
// ---------------------------------------------------------------------------
export async function buildFullStudentContext({ student, studentId, data, tier2Groups, startpoint, semester = 1 } = {}) {
  // 출발점(모듈1) — 전달받지 못했으면 best-effort 로드.
  let sp = startpoint;
  if (sp == null && studentId) {
    try { sp = (await fetchStartpoint(studentId))?.data?.data || null; } catch (_e) { sp = null; }
  }
  // Tier 1 학급 PBS — class_id 있으면 best-effort 로드.
  let classPBS = null;
  if (student?.class_id) {
    try { classPBS = (await fetchClassPBS(student.class_id, semester))?.data || null; } catch (_e) { classPBS = null; }
  }
  const summary = buildStudentSummary({ student, data, startpoint: sp });
  const linkage = buildTierLinkage({ studentId, data, classPBS, tier2Groups });
  const text = linkage ? `${summary}\n\n${linkage}` : summary;
  return { summary, linkage, text };
}

// 사람이 읽는 한 줄짜리 Tier 배지(미리보기·UI 표시용).
export function tierBadge(tierNum) {
  const map = { 1: 'Tier 1 · 학급 보편', 2: 'Tier 2 · 소그룹 표적', 3: 'Tier 3 · 개별 집중' };
  return map[tierNum] || '';
}
