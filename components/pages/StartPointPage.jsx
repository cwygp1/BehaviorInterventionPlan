import { useEffect, useMemo, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup, makeAppender } from '../ui/QChip';
import ExternalAIModal from '../ui/ExternalAIModal';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import { fetchStartpoint, saveStartpoint } from '../../lib/api/students';
import { qabfScores, QABF_SHORT_LABELS } from '../../lib/qabf';
import { studentProfileParts, sanitizeStrengths, RISK_RE } from '../../lib/utils/splitNote';

// 입력 5블록 / 산출물 3블록 빠른입력 칩
const GUARDIAN_CHIPS = ['자립생활 향상 희망', '의사소통 향상 희망', '친구 관계 개선 희망', '가정 내 일상 자립 희망', '여가활동 참여 희망', '건강·안전 관리 요청', '진로·직업 준비 희망'];
const OBSERVE_CHIPS = ['수업 참여도', '또래 상호작용', '지시 따르기', '활동 전환(전이)', '주의집중 시간', '감각 반응', '자조기술 수준'];
// 행동특성 칩 → 설명 문장 템플릿(피드백: 칩만 들어가면 특성이 설명되지 않음).
// 삽입 후 교사가 학생에 맞게 수치·내용을 고쳐 쓴다.
const OBSERVE_TMPL = {
  '수업 참여도': '수업 참여도: 좋아하는 활동에는 참여하나, 그 외 활동은 교사 촉진이 있어야 참여함',
  '또래 상호작용': '또래 상호작용: 또래에게 먼저 다가가기 어려워하며, 교사 중재가 있으면 짧게 상호작용함',
  '지시 따르기': '지시 따르기: 한 단계 지시는 수행하나, 두 단계 이상 연속 지시는 어려움',
  '활동 전환(전이)': '활동 전환(전이): 활동을 마치고 다음 활동으로 넘어갈 때 거부·지연이 나타남',
  '주의집중 시간': '주의집중 시간: 약 5분 내외로 짧고, 주변 소리·움직임에 쉽게 흐트러짐',
  '감각 반응': '감각 반응: 특정 소리·촉감에 민감하게 반응하며 회피 행동이 나타남',
  '자조기술 수준': '자조기술 수준: 식사·용변·옷 입고 벗기 중 일부에 부분 도움이 필요함',
};
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

export default function StartPointPage({ onNavigate }) {
  const { curStu, curStuId, curStuData } = useStudents();
  const { callDetailed, status: llmStatus } = useLLM();
  const toast = useToast();

  const [f, setF] = useState(EMPTY);
  // 0819 피드백: 저장 성공 후 "다음 단계(IEP 목표 생성)로 이동" 배너 — 다시 수정하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([f]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [extOpen, setExtOpen] = useState(false); // 🌐 외부AI 연동 모달
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

  // 학생 프로필의 강점/어려움 — 분리 저장된 값이 없으면(기존 학생) note를 규칙으로 분리.
  // P2: studentProfileParts가 강점 칸의 위험 정보("자해 위험", "안정실 이용 이력")를
  // 어려움 쪽으로 재분류해 주므로, 강점 자동 연동에 위험 정보가 섞이지 않는다.
  const profile = useMemo(() => studentProfileParts(curStu),
    [curStu?.strengths, curStu?.difficulties, curStu?.note]);

  // 어려움(약점)은 '행동특성(교사관찰)' 블록으로 연동.
  const obsAuto = useMemo(() => {
    return [profile.difficulties, abcAuto].filter(Boolean).join('\n');
  }, [profile.difficulties, abcAuto]);

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
        if (!merged.observation && obsAuto) merged.observation = obsAuto;
        if (!merged.strengths && profile.strengths) merged.strengths = profile.strengths;
        setF(merged);
      } catch (_e) {
        setF((cur) => ({ ...cur, fba: cur.fba || fbaAuto, observation: cur.observation || obsAuto }));
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
      markSaved(); hintNextStep('iep'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
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
      observation: cur.observation || obsAuto,
      strengths: cur.strengths || profile.strengths,
    }));
    toast('관찰·FBA·학생정보(강점/어려움)를 연동했어요.');
  }

  // 산출물 도출 프롬프트 — 로컬 AI 호출·🌐 외부AI 복사 공용.
  function buildDerivePrompt() {
    return (
      '너는 특수교육 IEPBS(생활중심 IEP + PBS) 전문가다. 아래 "학습자 분석(모듈1 출발점)" 입력을 바탕으로, ' +
      '행동문제를 "문제"가 아니라 "지원 요구의 신호"로 해석해 IEP의 출발점이 될 산출물 3가지를 도출하라.\n' +
      '삶·생활맥락·참여 관점에서 생활중심으로 작성한다.\n\n' +
      `[학생] ${curStu.code} / 학교급 ${curStu.level || '-'} / 장애영역 ${curStu.disability || '-'}\n` +
      `[가족 또는 학생의 희망사항] ${f.guardian || '-'}\n` +
      `[행동특성(교사관찰)] ${f.observation || '-'}\n` +
      `[기능평가 FBA] ${f.fba || '-'}\n` +
      `[학생 강점] ${f.strengths || '-'}\n` +
      `[생태학적환경 및 기타사항] ${f.eco || '-'}\n\n` +
      '아래 JSON만 출력하라(설명 금지). 각 값은 "- "로 시작하는 항목 2~4개를 줄바꿈으로 묶은 문자열:\n' +
      '{\n' +
      '  "supportNeeds": "생활지원 요구(일상생활에서 무엇이 어렵고 무엇을 지원해야 하는가)",\n' +
      '  "functions": "기능의 목록화(가르치거나 강화할 기능적 기술 — 대체기술 포함)",\n' +
      '  "perfLevel": "수행 가능 수준(현재 독립/촉진 수준과 가능한 수행 범위)"\n' +
      '}'
    );
  }
  // 산출물 JSON 적용 — 로컬·외부AI 공용.
  function applyDerived(parsed) {
    setF((cur) => ({
      ...cur,
      supportNeeds: parsed.supportNeeds || cur.supportNeeds,
      functions: parsed.functions || cur.functions,
      perfLevel: parsed.perfLevel || cur.perfLevel,
    }));
  }
  const hasDeriveInput = () => !!(f.guardian || f.observation || f.fba || f.strengths || f.eco);

  async function onAIDerive() {
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    if (!hasDeriveInput()) {
      toast('입력 블록(희망사항·행동특성·FBA·강점·환경)을 먼저 채워주세요.');
      return;
    }
    setAiBusy(true);
    try {
      const r = await callDetailed(buildDerivePrompt(), { temperature: 0.5 });
      const parsed = extractJSON(r.content) || extractJSON(r.reasoning || '');
      if (!parsed) { toast('AI 응답을 해석하지 못했어요. 다시 시도해 주세요.'); return; }
      applyDerived(parsed);
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
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }} data-tour="sp-intro">
        <div className="card-title" style={{ marginBottom: 4 }}>🧭 모듈1 · 출발점 (학습자 분석)</div>
        <p style={{ fontSize: '.92rem', color: '#274690', lineHeight: 1.6, margin: 0 }}>
          핵심 질문 — <strong>"이 학생은 지금 삶에서 무엇이 어려운가?"</strong><br />
          행동문제를 <strong>'문제'가 아니라 '지원 요구의 신호'</strong>로 해석합니다. 아래 5가지를 모아
          생활지원 요구·기능·수행 수준을 도출하고, 이것이 IEP 목표(모듈2)의 출발점이 됩니다.
        </p>
      </div>

      {/* 입력 5블록 */}
      <div className="card" data-tour="sp-input">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📥 학습자 분석 입력</div>
          <button className="btn btn-ghost btn-sm" onClick={syncFromData} data-tour="sp-sync">🔄 프로필(강점/어려움)·관찰·FBA 자동 연동</button>
        </div>

        {/* 기존 학생 안내 — 강/약점 분리 저장 전이면 규칙 분리로 연동됨을 알린다. */}
        {curStu && !curStu.strengths && !curStu.difficulties && curStu.note && (
          <div style={{ fontSize: '.8rem', color: '#92400e', background: '#fff7e6', border: '1px solid #fde7b8', borderRadius: 8, padding: '7px 11px', marginTop: 8 }}>
            💡 이 학생은 강점/어려움이 아직 분리 저장되지 않아 비식별 요약을 <strong>규칙으로 자동 분리</strong>해 연동합니다.
            정확하게 나누려면 <strong>학생 프로필 수정 → 🪄 요약에서 자동 분리</strong> 후 내용을 확인·저장해주세요.
          </div>
        )}

        <div className="form-group">
          <label className="form-label">👪 가족 또는 학생의 희망사항</label>
          <EditableChipGroup storageKey="sp_guardian" defaults={GUARDIAN_CHIPS} onPick={makeAppender(f.guardian, set('guardian'), false)} />
          <textarea className="form-textarea" rows={2} value={f.guardian} onChange={(e) => set('guardian')(e.target.value)} placeholder="보호자 면담·학생 의사에서 파악한 희망사항과 요구" />
        </div>
        <div className="form-group">
          <label className="form-label">🔍 행동특성(교사관찰)</label>
          <EditableChipGroup storageKey="sp_observe" defaults={OBSERVE_CHIPS} onPick={(t) => makeAppender(f.observation, set('observation'), false)(OBSERVE_TMPL[t] || t)} />
          <div style={{ fontSize: '.76rem', color: 'var(--muted)', margin: '2px 0 4px' }}>칩을 누르면 특성 설명 문장이 들어가요 — 이 학생에 맞게 수치·내용을 고쳐 쓰세요.</div>
          <textarea className="form-textarea" rows={2} value={f.observation} onChange={(e) => set('observation')(e.target.value)} placeholder="학생의 어려움·행동특성, 수업·일과 장면에서 관찰된 사실 (프로필 '어려움'·ABC 관찰 연동)" />
        </div>
        <div className="form-group">
          <label className="form-label">📊 기능평가 (FBA)</label>
          <textarea className="form-textarea" rows={2} value={f.fba} onChange={(e) => set('fba')(e.target.value)} placeholder="QABF 추정 기능 — '자동 연동' 버튼으로 채울 수 있어요" />
        </div>
        <div className="form-group">
          <label className="form-label">🌟 학생 강점</label>
          <EditableChipGroup storageKey="sp_strength" defaults={STRENGTH_CHIPS} onPick={makeAppender(f.strengths, set('strengths'), false)} />
          <textarea className="form-textarea" rows={2} value={f.strengths} onChange={(e) => set('strengths')(e.target.value)} placeholder="강점·선호·잘하는 것" />
          {/* P2: 강점 칸에 위험·이력 정보가 들어 있으면 경고 + 원클릭 이동.
              그대로 두면 "안정실 이용 이력 등에 강점을 보이나…" 같은 문장이 IEP 현행수준까지 전파된다. */}
          {RISK_RE.test(f.strengths || '') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '.8rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 11px', marginTop: 6 }}>
              <span>⚠ 강점 칸에 위험·이력 정보(자해·안정실 등)가 섞여 있어요 — 이대로 두면 IEP 현행수준에 "강점"으로 인용됩니다.</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                onClick={() => {
                  const { strengths, moved, dropped } = sanitizeStrengths(f.strengths);
                  setF((cur) => ({
                    ...cur,
                    strengths,
                    observation: [cur.observation, moved].filter(Boolean).join('\n'),
                  }));
                  toast(`위험·이력 정보를 행동특성(교사관찰)으로 옮겼어요${dropped ? ` (중립 정보 "${dropped}"는 제외)` : ''}.`);
                }}>
                🚚 행동특성 칸으로 옮기기
              </button>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">🌐 생태학적환경 및 기타사항</label>
          <EditableChipGroup storageKey="sp_eco" defaults={ECO_CHIPS} onPick={makeAppender(f.eco, set('eco'), false)} />
          <textarea className="form-textarea" rows={2} value={f.eco} onChange={(e) => set('eco')(e.target.value)} placeholder="가정·학교·지역사회 맥락 및 기타 참고사항" />
        </div>
      </div>

      {/* 산출물 3블록 */}
      <div className="card" data-tour="sp-output">
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>📤 산출물 (출발점 결과)</div>
          <div className="card-subtitle">생활지원 요구 · 기능의 목록화 · 수행 가능 수준 — IEP 목표의 출발점 (버튼은 아래 ①→②→③ 순서로 누르세요)</div>
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

        {/* 🌐 외부AI — 산출물 도출 */}
        <ExternalAIModal
          open={extOpen}
          onClose={() => setExtOpen(false)}
          title="🌐 외부 AI — 출발점 산출물 도출"
          buildPrompt={async () => buildDerivePrompt()}
          placeholder='{"supportNeeds":"- ...","functions":"- ...","perfLevel":"- ..."} 형태의 JSON을 붙여넣으세요.'
          onApply={(raw) => {
            const parsed = extractJSON(raw);
            if (!parsed) { toast('붙여넣은 내용에서 JSON을 찾지 못했어요.'); return false; }
            applyDerived(parsed);
            toast('외부 AI 산출물을 적용했어요. 확인 후 저장하세요.');
            return true;
          }}
        />

        {/* 0819 피드백: 도출→저장→다음 단계 버튼이 흩어져 있어 "어디 누르지?" 하게 됨 →
            한 줄 흐름(①→②→③)으로 모은다. ③은 저장 전엔 옅게, 저장 후엔 강조. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-pri" onClick={onAIDerive} disabled={aiBusy}>
            {aiBusy ? '⏳ 도출 중…' : '① ✨ AI로 산출물 도출'}
          </button>
          {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
          <button className="btn btn-ghost btn-sm" onClick={() => { if (!hasDeriveInput()) { toast('입력 블록을 먼저 채워주세요.'); return; } setExtOpen(true); }} title="외부 AI(클로드 등)로 산출물 도출">🌐 외부AI</button> */}
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>② 💾 출발점 저장</button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button
            className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')}
            onClick={() => onNavigate?.('iep')}
            title={savedOk ? undefined : '저장을 마친 뒤 이동하는 것을 추천해요'}
          >
            ③ 📋 IEP 목표 생성 →
          </button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ 출발점 저장 완료"
          hint="이 산출물이 IEP 목표(모듈2)의 출발점이 됩니다 — ③ 버튼으로 바로 이어가세요"
        />
      </div>
    </>
  );
}
