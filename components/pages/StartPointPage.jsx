import { useEffect, useMemo, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup, makeAppender } from '../ui/QChip';
import { fetchStartpoint, saveStartpoint } from '../../lib/api/students';
import { qabfScores, QABF_SHORT_LABELS } from '../../lib/qabf';

// 입력 5블록 / 산출물 3블록 빠른입력 칩
const GUARDIAN_CHIPS = ['등하교 어려움', '가정 내 의사소통', '수면·식사 패턴', '형제관계', '가정 선호 활동', '가정 내 문제행동 양상', '보호자 요구사항'];
const OBSERVE_CHIPS = ['수업 참여도', '또래 상호작용', '지시 따르기', '활동 전환(전이)', '주의집중 시간', '감각 반응', '자조기술 수준'];
const STRENGTH_CHIPS = ['시각자료 이해 우수', '규칙적 루틴 선호', '특정 주제 몰입', '모방 능력', '음악·리듬 반응', '기기 조작 능숙', '친사회적 시도'];
const ECO_CHIPS = ['가정 맥락', '교실 물리 환경', '지역사회 참여', '통학 환경', '또래 관계망', '지원 인력(보조)', '접근성·이동'];
const NEED_CHIPS = ['의사소통 지원', '자립생활 지원', '생활적응 지원', '여가활동 지원', '신체활동 지원', '안전·위기 지원', '사회성 지원'];
const FUNC_CHIPS = ['요청하기', '거부·중단 표현', '도움 요청', '선택하기', '차례 지키기', '감정 표현', '자기조절'];
const PERF_CHIPS = ['독립 수행', '부분 도움', '전적 도움', '언어 촉진', '시각 촉진', '신체 촉진', '단계별(과제분석)'];

const EMPTY = { guardian: '', observation: '', fba: '', strengths: '', eco: '', supportNeeds: '', functions: '', perfLevel: '' };

// 모델이 살짝 깨진 JSON을 내도 1차 실패 시 보정 후 재파싱.
function extractJSON(text) {
  if (!text) return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let body = text.slice(s, e + 1);
  try { return JSON.parse(body); } catch (_) {}
  try {
    body = body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    return JSON.parse(body);
  } catch (_) { return null; }
}

export default function StartPointPage() {
  const { curStu, curStuId, curStuData } = useStudents();
  const { callDetailed, status: llmStatus } = useLLM();
  const toast = useToast();

  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: typeof v === 'function' ? v(cur[k]) : v }));

  // FBA 자동 요약(QABF 추정 주요 기능) — 저장된 fba가 비어 있을 때만 채운다.
  const fbaAuto = useMemo(() => {
    const resp = curStuData?.qabf;
    if (!resp || !resp.some((v) => v >= 0)) return '';
    const { func, sev } = qabfScores(resp);
    const idx = sev.indexOf(Math.max(...sev));
    if (sev[idx] <= 0) return '';
    const ranked = sev.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v)
      .filter((x) => x.v > 0).slice(0, 2).map((x) => `${QABF_SHORT_LABELS[x.i]}(심각도 ${x.v}/15)`);
    return `QABF 추정 주요 기능: ${ranked.join(', ')}`;
  }, [curStuData?.qabf]);

  // 최근 ABC 관찰 요약 — 저장된 observation이 비어 있을 때 참고용으로 채운다.
  const abcAuto = useMemo(() => {
    const list = curStuData?.abc || [];
    if (!list.length) return '';
    return `최근 ABC 관찰 ${list.length}건 기록됨 (관찰 페이지 참조)`;
  }, [curStuData?.abc]);

  // 저장된 데이터 로드 + 빈 칸 자동 연동.
  useEffect(() => {
    if (!curStuId) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetchStartpoint(curStuId);
        const saved = r?.data?.data || {};
        if (!alive) return;
        const merged = { ...EMPTY, ...saved };
        if (!merged.fba && fbaAuto) merged.fba = fbaAuto;
        if (!merged.observation && abcAuto) merged.observation = abcAuto;
        if (!merged.strengths && curStu?.note) merged.strengths = curStu.note;
        setF(merged);
      } catch (_e) {
        setF((cur) => ({ ...cur, fba: cur.fba || fbaAuto, observation: cur.observation || abcAuto }));
      }
    })();
    return () => { alive = false; };
  }, [curStuId, fbaAuto, abcAuto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      await saveStartpoint(curStuId, f);
      toast('출발점(모듈1) 저장 완료');
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function syncFromData() {
    setF((cur) => ({
      ...cur,
      fba: fbaAuto || cur.fba,
      observation: abcAuto ? (cur.observation ? cur.observation : abcAuto) : cur.observation,
      strengths: cur.strengths || curStu?.note || '',
    }));
    toast('관찰·FBA·학생정보를 연동했어요.');
  }

  async function onAIDerive() {
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (!f.guardian && !f.observation && !f.fba && !f.strengths && !f.eco) {
      toast('입력 블록(면담·관찰·FBA·강점·환경)을 먼저 채워주세요.');
      return;
    }
    setAiBusy(true);
    try {
      const prompt =
        '너는 특수교육 IEPBS(생활중심 IEP + PBS) 전문가다. 아래 "학습자 분석(모듈1 출발점)" 입력을 바탕으로, ' +
        '행동문제를 "문제"가 아니라 "지원 요구의 신호"로 해석해 IEP의 출발점이 될 산출물 3가지를 도출하라.\n' +
        '삶·생활맥락·참여 관점에서 생활중심으로 작성한다.\n\n' +
        `[학생] ${curStu.code} / 학교급 ${curStu.level || '-'} / 장애영역 ${curStu.disability || '-'}\n` +
        `[보호자 면담] ${f.guardian || '-'}\n` +
        `[교사 관찰] ${f.observation || '-'}\n` +
        `[기능평가 FBA] ${f.fba || '-'}\n` +
        `[학생 강점] ${f.strengths || '-'}\n` +
        `[생태학적 환경] ${f.eco || '-'}\n\n` +
        '아래 JSON만 출력하라(설명 금지). 각 값은 "- "로 시작하는 항목 2~4개를 줄바꿈으로 묶은 문자열:\n' +
        '{\n' +
        '  "supportNeeds": "생활지원 요구(일상생활에서 무엇이 어렵고 무엇을 지원해야 하는가)",\n' +
        '  "functions": "기능의 목록화(가르치거나 강화할 기능적 기술 — 대체기술 포함)",\n' +
        '  "perfLevel": "수행 가능 수준(현재 독립/촉진 수준과 가능한 수행 범위)"\n' +
        '}';
      const r = await callDetailed(prompt, { temperature: 0.5 });
      const parsed = extractJSON(r.content) || extractJSON(r.reasoning || '');
      if (!parsed) { toast('AI 응답을 해석하지 못했어요. 다시 시도해 주세요.'); return; }
      setF((cur) => ({
        ...cur,
        supportNeeds: parsed.supportNeeds || cur.supportNeeds,
        functions: parsed.functions || cur.functions,
        perfLevel: parsed.perfLevel || cur.perfLevel,
      }));
      toast('AI가 생활지원 요구·기능·수행 수준을 도출했어요.');
    } catch (e) {
      toast('AI 도출 실패: ' + e.message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <StuHero />

      {/* 핵심 질문 배너 */}
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>🧭 모듈1 · 출발점 (학습자 분석)</div>
        <p style={{ fontSize: '.92rem', color: '#274690', lineHeight: 1.6, margin: 0 }}>
          핵심 질문 — <strong>"이 학생은 지금 삶에서 무엇이 어려운가?"</strong><br />
          행동문제를 <strong>'문제'가 아니라 '지원 요구의 신호'</strong>로 해석합니다. 아래 5가지를 모아
          생활지원 요구·기능·수행 수준을 도출하고, 이것이 IEP 목표(모듈2)의 출발점이 됩니다.
        </p>
      </div>

      {/* 입력 5블록 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📥 학습자 분석 입력</div>
          <button className="btn btn-ghost btn-sm" onClick={syncFromData}>🔄 관찰·FBA 자동 연동</button>
        </div>

        <div className="form-group">
          <label className="form-label">👪 보호자 면담</label>
          <EditableChipGroup storageKey="sp_guardian" defaults={GUARDIAN_CHIPS} onPick={makeAppender(f.guardian, set('guardian'), false)} />
          <textarea className="form-textarea" rows={2} value={f.guardian} onChange={(e) => set('guardian')(e.target.value)} placeholder="가정 맥락에서의 어려움·강점·요구" />
        </div>
        <div className="form-group">
          <label className="form-label">🔍 교사 관찰</label>
          <EditableChipGroup storageKey="sp_observe" defaults={OBSERVE_CHIPS} onPick={makeAppender(f.observation, set('observation'), false)} />
          <textarea className="form-textarea" rows={2} value={f.observation} onChange={(e) => set('observation')(e.target.value)} placeholder="수업·일과 장면에서 관찰된 사실 (ABC 관찰 페이지 연동 가능)" />
        </div>
        <div className="form-group">
          <label className="form-label">📊 기능평가 (FBA)</label>
          <textarea className="form-textarea" rows={2} value={f.fba} onChange={(e) => set('fba')(e.target.value)} placeholder="QABF 추정 기능 — '자동 연동' 버튼으로 채울 수 있어요" />
        </div>
        <div className="form-group">
          <label className="form-label">🌟 학생 강점</label>
          <EditableChipGroup storageKey="sp_strength" defaults={STRENGTH_CHIPS} onPick={makeAppender(f.strengths, set('strengths'), false)} />
          <textarea className="form-textarea" rows={2} value={f.strengths} onChange={(e) => set('strengths')(e.target.value)} placeholder="강점·선호·잘하는 것" />
        </div>
        <div className="form-group">
          <label className="form-label">🌐 생태학적 환경</label>
          <EditableChipGroup storageKey="sp_eco" defaults={ECO_CHIPS} onPick={makeAppender(f.eco, set('eco'), false)} />
          <textarea className="form-textarea" rows={2} value={f.eco} onChange={(e) => set('eco')(e.target.value)} placeholder="가정·학교·지역사회 맥락" />
        </div>
      </div>

      {/* 산출물 3블록 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>📤 산출물 (출발점 결과)</div>
            <div className="card-subtitle">생활지원 요구 · 기능의 목록화 · 수행 가능 수준 — IEP 목표의 출발점</div>
          </div>
          <button className="btn btn-pri btn-sm" onClick={onAIDerive} disabled={aiBusy}>
            {aiBusy ? '⏳ 도출 중…' : '✨ AI로 산출물 도출'}
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">🎯 생활지원 요구</label>
          <EditableChipGroup storageKey="sp_need" defaults={NEED_CHIPS} onPick={makeAppender(f.supportNeeds, set('supportNeeds'), false)} />
          <textarea className="form-textarea" rows={3} value={f.supportNeeds} onChange={(e) => set('supportNeeds')(e.target.value)} placeholder="일상생활에서 무엇을 지원해야 하는가" />
        </div>
        <div className="form-group">
          <label className="form-label">🧩 기능의 목록화</label>
          <EditableChipGroup storageKey="sp_func" defaults={FUNC_CHIPS} onPick={makeAppender(f.functions, set('functions'), false)} />
          <textarea className="form-textarea" rows={3} value={f.functions} onChange={(e) => set('functions')(e.target.value)} placeholder="가르치거나 강화할 기능적 기술(대체기술 포함)" />
        </div>
        <div className="form-group">
          <label className="form-label">📈 수행 가능 수준</label>
          <EditableChipGroup storageKey="sp_perf" defaults={PERF_CHIPS} onPick={makeAppender(f.perfLevel, set('perfLevel'), false)} />
          <textarea className="form-textarea" rows={3} value={f.perfLevel} onChange={(e) => set('perfLevel')(e.target.value)} placeholder="현재 독립/촉진 수준과 가능한 수행 범위" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 출발점 저장</button>
        </div>
        <p style={{ fontSize: '.8rem', color: 'var(--muted, #888)', marginTop: 10 }}>
          다음 단계 → 이 산출물(생활지원 요구)이 <strong>모듈2(IEP 목표 생성)</strong>의 출발점으로 연결될 예정입니다.
        </p>
      </div>
    </>
  );
}
