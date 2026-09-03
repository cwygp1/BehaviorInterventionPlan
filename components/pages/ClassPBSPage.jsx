import { useEffect, useMemo, useState } from 'react';
import { fetchClassPBS, saveClassPBS, fetchClassChecklist, fetchPbsSurvey } from '../../lib/api/students';
import useFormLoad, { FormLoading } from '../../lib/hooks/useFormLoad';
import { useAutoSaveBody } from '../../lib/hooks/useAutoSave';
import { CWPBS_ITEMS, SOLVE_ITEMS } from '../../lib/classChecklist';
import { surveySummary } from '../../lib/pbsSurvey';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';
import ResourceDownloads from '../ui/ResourceDownloads';

// Tier 1 예시 문서 (public/docs/tier1/) — 다운로드해 학급 상황에 맞게 수정 사용.
const TIER1_DOCS = [
  { name: '(예시) 기대행동 매트릭스', desc: '기대행동 × 장소별 규칙 매트릭스 예시', links: [{ label: 'PDF', href: '/docs/tier1/기대행동_매트릭스.pdf' }] },
  { name: '(예시) 월별 기대행동', desc: '월별 기대행동 운영 계획 예시', links: [{ label: 'PDF', href: '/docs/tier1/월별_기대행동.pdf' }] },
  { name: '(예시) PBS 충실도 체크 (Tier 1)', desc: '학급 차원 PBS 실행 충실도 점검표 예시', links: [{ label: 'PDF', href: '/docs/tier1/PBS충실도체크_Tier1.pdf' }] },
  // 0825 동료 제공: 학급 구조화(공간·시간·절차 지원) 실제 사례 모음.
  { name: '(예시) 공간적·시간적·절차적 지원', desc: '학급 구조화를 위한 공간·시간·절차 지원 사례 예시', links: [{ label: 'PDF', href: '/docs/tier1/공간적_시간적_절차적_지원.pdf' }] },
];

const REWARD_ICONS = ['🎁', '🍿', '🎬', '🍕', '🎮', '🎨', '⚽', '📚', '🎵', '🌟'];

// 순위 배지 색 — 설문(PbsSurveyPage)의 순위 색과 같은 정체성을 쓴다.
const RANK_COLORS = ['#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed'];

export default function ClassPBSPage({ onNavigate }) {
  const toast = useToast();
  const { call, status } = useLLM();
  const { curYear, curSemester, curClassId, curClass } = useStudents();
  const [goal, setGoal] = useState('모두가 행복한 교실');
  const [target, setTarget] = useState(100);
  const [current, setCurrent] = useState(0);
  const [rewards, setRewards] = useState([
    { name: '단체 영화 시간', points: 50, icon: '🎬' },
    { name: '점심 먼저 가기', points: 30, icon: '🍕' },
  ]);
  const [busy, setBusy] = useState(false);
  // 저장값을 불러오기 전에는 입력 UI를 띄우지 않는다 — 로드 전에 누른 포인트가
  // fetch 응답에 덮어써져 사라지던 문제(예: 화면엔 0인데 실제 저장값은 16) 방지.
  const { loaded, applyLoaded } = useFormLoad([curClassId, curSemester]);

  // AI coaching
  const [question, setQuestion] = useState('우리 반은 30명인데 4:1 긍정 비율을 어떻게 실천할 수 있을까요?');
  const [coachOutput, setCoachOutput] = useState('');
  const [coachBusy, setCoachBusy] = useState(false);
  // 학급관리 체크리스트 결과 — 코칭 프롬프트에 진단 근거로 주입 (best-effort).
  const [checklist, setChecklist] = useState(null);
  // 0828 현장 요청: PBS 기초 설문의 기대행동·응답을 여기서도 보고 계획에 반영한다.
  // 원본은 pbs_base_survey 한 곳뿐 — 여기서는 읽기만 하고 따로 저장하지 않는다.
  const [survey, setSurvey] = useState(null);

  // Load the PBS state for the currently selected 반 + 학기. Each (반, 학기)
  // keeps its own goal/points/rewards; defaults are restored when there is no
  // saved state yet so a fresh class/semester starts clean.
  useEffect(() => {
    if (!curClassId) return;
    let cancelled = false;
    fetchClassPBS(curClassId, curSemester).then((d) => {
      if (cancelled) return;
      applyLoaded(() => {
        if (d?.data) {
          setGoal(d.data.goal || '모두가 행복한 교실');
          setTarget(d.data.target_points || 100);
          setCurrent(d.data.current_points || 0);
          setRewards(d.data.rewards && d.data.rewards.length ? d.data.rewards : []);
        } else {
          setGoal('모두가 행복한 교실');
          setTarget(100);
          setCurrent(0);
          setRewards([]);
        }
      });
    }).catch(() => { if (!cancelled) applyLoaded(); });
    fetchClassChecklist(curClassId, curSemester).then((d) => {
      if (!cancelled) setChecklist(d?.data?.responses || null);
    }).catch(() => {});
    fetchPbsSurvey(curClassId, curSemester).then((d) => {
      if (!cancelled) setSurvey(d?.data?.responses || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [curClassId, curSemester, applyLoaded]);

  // 설문 원본에서 그때그때 파생 — 이 화면은 기대행동을 저장하지 않는다.
  const sv = useMemo(() => surveySummary(survey), [survey]);

  // 체크리스트 진단 요약(총점 + 낮은 문항) — 없으면 ''.
  function checklistBlock() {
    if (!checklist) return '';
    const sum = (arr) => (arr || []).reduce((a, v) => a + (v >= 0 ? v : 0), 0);
    const lowItems = (items, arr, th) => items
      .map((q, i) => ({ q, v: (arr || [])[i] }))
      .filter((x) => x.v >= 0 && x.v <= th)
      .slice(0, 5)
      .map((x) => `  - (${x.v}점) ${x.q}`).join('\n');
    const cw = checklist.cwpbs || [];
    const sv = checklist.solve || [];
    if (!cw.some((v) => v >= 0) && !sv.some((v) => v >= 0)) return '';
    const parts = ['\n## 학급관리 체크리스트 자가진단 (참고 근거)'];
    if (cw.some((v) => v >= 0)) {
      parts.push(`- 학급관리실행(CWPBS): ${sum(cw)}/${CWPBS_ITEMS.length * 3}점`);
      const low = lowItems(CWPBS_ITEMS, cw, 1);
      if (low) parts.push(`- 실행이 낮은 항목:\n${low}`);
    }
    if (sv.some((v) => v >= 0)) parts.push(`- 행동문제해결력: ${sum(sv)}/${SOLVE_ITEMS.length * 4}점`);
    parts.push('※ 위 진단에서 낮게 나온 항목을 우선 보완하는 방향으로 코칭하세요.');
    return parts.join('\n');
  }

  // PBS 기초 설문 요약 — 코칭 프롬프트에 학급 실태·기대행동 근거로 주입. 없으면 ''.
  function surveyBlock() {
    if (!sv.has) return '';
    const parts = ['\n## PBS 기초 설문조사 결과 (Tier 1 실태 — 참고 근거)'];
    if (sv.expected.length) parts.push(`- 기대행동(학교 규칙) 후보: ${sv.expected.map((e) => e.custom ? `${e.label}(기타)` : `${e.label}(${e.rank}위)`).join(', ')}`);
    if (sv.behaviors) parts.push(`- 자주 발생하는 문제행동: ${sv.behaviors}`);
    if (sv.places) parts.push(`- 빈발 장소: ${sv.places}`);
    if (sv.times) parts.push(`- 빈발 시간대: ${sv.times}`);
    if (sv.rulePlaces) parts.push(`- 생활규칙 우선 적용 장소: ${sv.rulePlaces}`);
    if (sv.difficulties) parts.push(`- 교사가 어려움을 느끼는 점: ${sv.difficulties}`);
    if (sv.matrix.length) {
      parts.push('- 기대행동 × 장소 매트릭스(설문 12번):');
      sv.matrix.forEach((row) => {
        const cells = row.places.map((p) => `${p.place || '장소 미기재'}: ${p.rules || '규칙 미기재'}`).join(' / ');
        parts.push(`  - ${row.behavior || '기대행동 미기재'} → ${cells || '내용 없음'}`);
      });
    }
    parts.push('※ 위 설문 결과와 학급 목표·보상 운영이 어긋나지 않게, 기대행동을 그대로 살려 제안하세요.');
    return parts.join('\n');
  }

  // 설문에서 뽑은 기대행동을 학급 목표 문구로 넣는다 — 사본을 만드는 게 아니라
  // 교사가 명시적으로 누를 때만 학급 목표(class_pbs_state.goal) 칸을 채운다.
  function applyExpectedToGoal() {
    const labels = sv.expected.slice(0, 3).map((e) => e.label);
    if (!labels.length) { toast('설문 10번에서 기대행동을 먼저 골라주세요.'); return; }
    const text = labels.join(' · ');
    if (goal && goal.trim() && goal.trim() !== text
      && !window.confirm(`현재 학급 목표를 다음으로 바꿀까요?\n\n"${text}"`)) return;
    setGoal(text);
    toast('기대행동을 학급 목표에 넣었어요. 문구는 자유롭게 다듬으세요.');
  }

  // 자동 저장(0824) — 로드 시점 값을 기준으로, 달라지면 입력이 멎은 뒤 저장.
  const { dirty: pbsDirty } = useAutoSaveBody({
    enabled: loaded && !!curClassId,
    body: { goal, target_points: +target, current_points: +current, rewards },
    save: saveCore,
  });

  async function saveCore() {
    await saveClassPBS({
      class_id: curClassId, semester: curSemester,
      goal, target_points: +target, current_points: +current, rewards,
    });
  }

  async function onSave() {
    if (!curClassId) { toast('먼저 학급을 선택해주세요.'); return; }
    setBusy(true);
    try {
      await saveCore();
      toast('학급 PBS 상태 저장 완료');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  function addReward() {
    const usedIcons = rewards.map((r) => r.icon).filter(Boolean);
    const nextIcon = REWARD_ICONS.find((i) => !usedIcons.includes(i)) || '🎁';
    setRewards((r) => [...r, { name: '', points: 10, icon: nextIcon }]);
  }
  function updReward(i, k, v) {
    setRewards((r) => r.map((x, idx) => idx === i ? { ...x, [k]: k === 'points' ? +v : v } : x));
  }
  function delReward(i) {
    setRewards((r) => r.filter((_, idx) => idx !== i));
  }
  function addPoints(n) {
    setCurrent((c) => Math.min(target, c + n));
  }

  function buildCoachPrompt() {
    return `당신은 2024 서울시교육청 PBS 가이드북 기반 학급 운영 코치입니다.

## 우리 학급 현황
- 학급 목표: ${goal}
- 누적 포인트: ${current} / ${target}
- 보상 항목: ${rewards.map(r => `${r.name}(${r.points}p)`).join(', ') || '(없음)'}
${surveyBlock()}
${checklistBlock()}

## 교사 질문
${question}

## 답변 요구
- 가이드북 기반 학급 차원의 PBS(Tier 1) 전략
- 4:1 긍정 비율을 유지하기 위한 구체적 실천 방법
- 학급 목표 달성까지 단계적 접근법 (현재 ${current}p → ${target}p)
- 한국 학교 현장에서 즉시 적용 가능한 행동 3가지`;
  }

  async function runCoach() {
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setCoachBusy(true); setCoachOutput('');
    try {
      const reply = await call(buildCoachPrompt(), { tier: 'fast' });
      setCoachOutput(reply);
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setCoachBusy(false); }
  }

  const pct = target > 0 ? Math.round((current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const pctClamped = Math.min(100, pct);

  // Find the next achievable reward
  const sortedRewards = [...rewards].filter((r) => r.name && r.points > 0).sort((a, b) => a.points - b.points);
  const nextReward = sortedRewards.find((r) => r.points > current);

  if (!curClassId) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🏫</div>
        Tier 1 PBS는 <strong>학년도 · 학기 · 반</strong>별로 설정합니다.<br />
        상단에서 학급을 먼저 선택(또는 ⚙로 추가)해주세요.
      </div>
    );
  }

  if (!loaded) return <FormLoading label="학급 PBS 설정을 불러오는 중…" />;

  return (
    <>
      {/* Scope banner — Tier 1은 학년도·학기·반 단위 */}
      <div data-tour="cp-scope" style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 14px', marginBottom: 12, borderRadius: 8,
        background: 'var(--pri-soft)', border: '1px solid var(--pri-l)', fontSize: '.84rem',
      }}>
        <span style={{ fontWeight: 700, color: 'var(--pri)' }}>📍 적용 범위</span>
        <span className="badge badge-pri">{curYear}학년도</span>
        <span className="badge badge-pri">{curSemester}학기</span>
        <span className="badge badge-pri">{curClass?.name || '—'}</span>
        <span style={{ color: 'var(--muted)' }}>이 학급·학기 전용 PBS 설정입니다.</span>
      </div>

      {/* Hero card with progress */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #4f6bed 0%, #6979f0 100%)',
        color: '#fff',
        border: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, fontSize: '8rem', opacity: 0.1 }}>🏆</div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '.78rem', opacity: 0.9, letterSpacing: 3, marginBottom: 4 }}>CLASS-WIDE PBS · TIER 1</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 18 }}>🏆 우리반 강화 시스템</h2>

          <input
            type="text"
            data-tour="cp-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="학급 공동 목표 (예: 모두가 행복한 교실)"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)',
              background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: '1rem', fontWeight: 600,
              marginBottom: 18, outline: 'none',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{current}</span>
              <span style={{ fontSize: '1.1rem', opacity: 0.7 }}> / {target} p</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, opacity: 0.95 }}>{pct}%</div>
          </div>

          <div style={{ background: 'rgba(255,255,255,.2)', height: 18, borderRadius: 9, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              background: 'linear-gradient(90deg, #fff, #e8eefb)',
              width: `${pctClamped}%`, height: '100%', transition: 'width .4s ease',
              boxShadow: '0 0 12px rgba(255,255,255,.5)',
            }} />
          </div>

          {nextReward ? (
            <p style={{ fontSize: '.85rem', opacity: 0.95, marginTop: 12 }}>
              🎯 다음 목표: <strong>{nextReward.icon || '🎁'} {nextReward.name}</strong> ({nextReward.points}p) — {nextReward.points - current}p 남음
            </p>
          ) : remaining === 0 && target > 0 ? (
            <p style={{ fontSize: '.95rem', fontWeight: 700, marginTop: 12 }}>🎉 학급 목표 달성! 보상 시간을 가지세요.</p>
          ) : (
            <p style={{ fontSize: '.85rem', opacity: 0.9, marginTop: 12 }}>{remaining}p 더 모으면 목표 달성!</p>
          )}

          {/* Point control buttons */}
          <div data-tour="cp-points" style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            {[1, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => addPoints(n)}
                style={{
                  background: 'rgba(255,255,255,.25)', border: '1px solid rgba(255,255,255,.4)',
                  color: '#fff', padding: '8px 18px', borderRadius: 99, fontWeight: 700,
                  cursor: 'pointer', fontSize: '.9rem', transition: '.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.4)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.25)')}
              >+{n} 포인트</button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setCurrent(0)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.4)', color: '#fff', padding: '8px 14px', borderRadius: 99, cursor: 'pointer', fontSize: '.82rem' }}
            >↺ 리셋</button>
          </div>
        </div>
      </div>

      {/* 기대행동(학교 규칙) — PBS 기초 설문조사에서 그대로 읽어온다(원본은 설문 화면).
          0828 현장 요청: 설문 하단에 쓴 기대행동을 학급 차원 PBS에서도 보고 계획에 반영. */}
      <div className="card" data-tour="cp-expected">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📋 우리 반 기대행동 (학교 규칙)</div>
          <span className="badge badge-pri" style={{ fontSize: '.72rem' }}>PBS 기초 설문조사에서 불러옴</span>
          <div style={{ flex: 1 }} />
          {onNavigate && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('pbssurvey')}>
              {sv.has ? '✏ 설문에서 수정' : '📝 설문 작성하러 가기'}
            </button>
          )}
        </div>
        <div className="card-subtitle" style={{ marginTop: 6 }}>
          기대행동은 <strong>PBS 기초 설문조사(10·12번)</strong>에 저장된 내용을 그대로 보여줍니다. 고칠 내용은 설문 화면에서 수정하면 여기에도 바로 반영됩니다.
        </div>

        {sv.expected.length > 0 ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {sv.expected.map((e, i) => {
                const c = e.custom ? '#64748b' : RANK_COLORS[(e.rank - 1) % RANK_COLORS.length];
                return (
                  <span key={`${e.label}-${i}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    borderRadius: 999, border: `1.5px solid ${c}`, color: c, fontWeight: 700, fontSize: '.88rem',
                  }}>
                    <span style={{ background: c, color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: '.72rem' }}>
                      {e.custom ? '기타' : `${e.rank}위`}
                    </span>
                    {e.label}
                  </span>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-ok btn-sm" onClick={applyExpectedToGoal} title="상위 3개 기대행동을 학급 목표 문구로 넣습니다(문구는 이후 자유롭게 수정 가능)">
                ⬆ 학급 목표 문구로 넣기
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 14, padding: '18px 16px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: '.9rem' }}>
            아직 설문에 기대행동이 없어요. [PBS 기초 설문조사] 10번에서 기대행동 후보 5가지를 골라주세요.
          </div>
        )}

        {sv.matrix.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--sub)', marginBottom: 8 }}>기대행동 × 장소 생활규칙 (설문 12번)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.84rem' }}>
                <thead><tr>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', background: '#f1f5f9', fontWeight: 700, width: 150 }}>기대행동</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', background: '#f1f5f9', fontWeight: 700 }}>장소별 규칙</th>
                </tr></thead>
                <tbody>
                  {sv.matrix.map((row, ri) => (
                    <tr key={ri}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px', fontWeight: 600, verticalAlign: 'top' }}>
                        {row.behavior || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(미기재)</span>}
                      </td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '6px 8px' }}>
                        {row.places.length ? row.places.map((p, pi) => (
                          <div key={pi} style={{ marginBottom: 4, lineHeight: 1.5 }}>
                            <strong>{p.place || '장소 미기재'}</strong>
                            <span style={{ color: 'var(--sub)' }}> — {p.rules || '규칙 미기재'}</span>
                          </div>
                        )) : <span style={{ color: 'var(--muted)' }}>(미기재)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(sv.places || sv.times || sv.behaviors) && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: '.83rem', color: 'var(--sub)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>설문에서 파악된 우리 반 실태 (AI 코칭에도 함께 전달됩니다)</div>
            {sv.behaviors && <div>· 자주 발생하는 문제행동: {sv.behaviors}</div>}
            {sv.places && <div>· 빈발 장소: {sv.places}</div>}
            {sv.times && <div>· 빈발 시간대: {sv.times}</div>}
            {sv.rulePlaces && <div>· 생활규칙 우선 적용 장소: {sv.rulePlaces}</div>}
          </div>
        )}
      </div>

      {/* Goal config card */}
      <div className="card" data-tour="cp-target">
        <div className="card-title">⚙ 목표 포인트 설정</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">목표 포인트</label>
            <input type="number" className="form-input" value={target} onChange={(e) => setTarget(e.target.value)} min="1" />
          </div>
          <div className="form-group">
            <label className="form-label">현재 누적 포인트 (수동 조정)</label>
            <input type="number" className="form-input" value={current} onChange={(e) => setCurrent(Math.max(0, +e.target.value))} min="0" />
          </div>
        </div>
      </div>

      {/* Rewards card */}
      <div className="card" data-tour="cp-rewards">
        <div className="card-title">🎁 보상 항목</div>
        <div className="card-subtitle">목표 달성 시 학급에 제공할 보상을 등록하세요. 작은 보상부터 큰 보상까지 단계별로 구성하면 좋습니다.</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {rewards.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--muted)', background: 'var(--surface2)', borderRadius: 8, border: '1px dashed var(--border)' }}>
              아직 보상 항목이 없습니다. 아래 "+ 보상 추가" 버튼으로 시작하세요.
            </div>
          )}
          {rewards.map((r, i) => {
            const achieved = r.points > 0 && current >= r.points;
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: achieved ? 'linear-gradient(90deg, #e7f7ee, #f0fbf4)' : 'var(--surface2)',
                  border: '1px solid ' + (achieved ? '#9be0b9' : 'var(--border)'),
                  borderRadius: 10,
                  transition: '.15s',
                }}
              >
                <select
                  value={r.icon || '🎁'}
                  onChange={(e) => updReward(i, 'icon', e.target.value)}
                  style={{ fontSize: '1.5rem', border: 'none', background: 'transparent', cursor: 'pointer', width: 44, textAlign: 'center', padding: 0 }}
                  title="아이콘 선택"
                >
                  {REWARD_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>

                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => updReward(i, 'name', e.target.value)}
                  placeholder="보상 이름 (예: 단체 영화 시간)"
                  style={{
                    flex: 1, border: '1px solid var(--border)', borderRadius: 6,
                    padding: '8px 12px', background: '#fff', fontSize: '.92rem', outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px' }}>
                  <input
                    type="number"
                    value={r.points}
                    onChange={(e) => updReward(i, 'points', e.target.value)}
                    min="1"
                    style={{ width: 64, border: 'none', textAlign: 'right', outline: 'none', fontSize: '.92rem', fontWeight: 600 }}
                  />
                  <span style={{ color: 'var(--muted)', fontSize: '.82rem', fontWeight: 600 }}>p</span>
                </div>

                {achieved && (
                  <span style={{ fontSize: '.74rem', fontWeight: 700, color: '#0a7d4e', background: '#fff', padding: '4px 10px', borderRadius: 99, border: '1px solid #9be0b9', whiteSpace: 'nowrap' }}>
                    ✓ 달성
                  </span>
                )}

                <button
                  onClick={() => delReward(i)}
                  title="삭제"
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: 'none', background: 'transparent', color: 'var(--err)',
                    cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: '.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,71,111,.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >×</button>
              </div>
            );
          })}
        </div>

        <button className="btn btn-ghost btn-sm" onClick={addReward} style={{ marginTop: 12 }}>+ 보상 추가</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button
            className={'btn ' + (pbsDirty ? 'btn-pri' : 'btn-ghost')}
            onClick={onSave}
            disabled={busy || !pbsDirty}
            title={pbsDirty ? '지금 바로 저장' : '변경 내용이 모두 자동 저장되었습니다'}
          >
            {pbsDirty ? '💾 학급 PBS 저장' : '✓ 저장됨'}
          </button>
        </div>
      </div>

      <div data-tour="cp-docs">
        <ResourceDownloads
          title="📎 Tier 1 자료실 (예시 문서)"
          subtitle="기대행동 매트릭스·월별 기대행동·충실도 체크·공간/시간/절차 지원 예시를 내려받아 활용하세요."
          files={TIER1_DOCS}
        />
      </div>

      <div className="card" style={{ background: '#e8eefb', borderColor: '#c4d3f1' }} data-tour="cp-ratio">
        <div className="card-title">💡 4:1 긍정 비율 — 핵심 원칙</div>
        <p style={{ fontSize: '.92rem', lineHeight: 1.7, color: 'var(--sub)', marginTop: 6 }}>
          바람직한 행동에 대한 피드백 vs 재지도 비율을 <strong>4:1 이상</strong>으로 유지합니다.
          학생 한 명이 재지도를 받았다면, 그 학생의 바람직한 행동을 4번 이상 인식·강화해야 합니다.
        </p>
      </div>

      <div className="card" data-tour="cp-coach">
        <div className="card-title">💡 AI 학급 운영 코칭</div>
        <div className="form-group">
          <label className="form-label">교사 질문</label>
          <textarea className="form-textarea" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>
        <AIActionBar prompt={buildCoachPrompt()} onCallAI={runCoach} busy={coachBusy} callLabel="🤖 AI 코칭 받기" />
        {(coachOutput || coachBusy) && <PromptResultBlock prompt={buildCoachPrompt()} output={coachOutput} busy={coachBusy} />}
      </div>
    </>
  );
}
