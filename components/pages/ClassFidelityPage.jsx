import { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchClassChecklist, saveClassChecklist } from '../../lib/api/students';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';
import useFormLoad, { FormLoading } from '../../lib/hooks/useFormLoad';
import { useAutoSaveBody } from '../../lib/hooks/useAutoSave';
import { FIDELITY_AREAS, FIDELITY_SCALE, emptyFidelity } from '../../lib/classChecklist';

// 학급관리 실행충실도 2 — 보편적 지원 실행충실도 점검지 (0825 동료 제공 자료).
// 영역별로 0·1·2점 기준문을 읽고 현재 수준을 고른다. 반·학기 단위 저장 —
// 실행충실도 1(classcheck)과 같은 행(class_mgmt_checklist)을 fidelity 키로 나눠 쓴다.
export default function ClassFidelityPage() {
  const toast = useToast();
  const { curYear, curSemester, curClassId, curClass } = useStudents();
  const { call, status: llmStatus } = useLLM();

  const [vals, setVals] = useState(emptyFidelity());
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOut, setAiOut] = useState('');
  // 저장값 로드 전에는 체크 UI를 띄우지 않는다 — 로드 중 찍은 응답 유실 방지.
  const { loaded, applyLoaded } = useFormLoad([curClassId, curSemester]);

  useEffect(() => {
    if (!curClassId) return;
    let cancelled = false;
    fetchClassChecklist(curClassId, curSemester).then((d) => {
      if (cancelled) return;
      applyLoaded(() => {
        const saved = d?.data?.responses?.fidelity;
        setVals(Array.isArray(saved) ? [...saved, ...emptyFidelity()].slice(0, FIDELITY_AREAS.length) : emptyFidelity());
      });
    }).catch(() => { if (!cancelled) applyLoaded(); });
    return () => { cancelled = true; };
  }, [curClassId, curSemester, applyLoaded]);

  const stats = useMemo(() => ({
    score: vals.reduce((a, v) => a + (v >= 0 ? v : 0), 0),
    max: FIDELITY_AREAS.length * 2,
    done: vals.filter((v) => v >= 0).length,
    total: FIDELITY_AREAS.length,
  }), [vals]);

  // 자동 저장 — fidelity 키만 보낸다(서버가 키 단위 병합이라 실행충실도 1을 지우지 않음).
  const { dirty } = useAutoSaveBody({
    enabled: loaded && !!curClassId,
    body: vals,
    save: () => saveClassChecklist({ class_id: curClassId, semester: curSemester, responses: { fidelity: vals } }),
  });

  async function onSave() {
    if (!curClassId) { toast('먼저 학급을 선택해주세요.'); return; }
    setBusy(true);
    try {
      await saveClassChecklist({ class_id: curClassId, semester: curSemester, responses: { fidelity: vals } });
      toast('학급관리 실행충실도 2 저장 완료');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  // 실행충실도 1과 같은 패턴의 AI 해석 (0825 동료 피드백) — 낮은 영역 중심 실천 전략.
  function buildPrompt() {
    const lines = FIDELITY_AREAS.map((a, i) => {
      const v = vals[i];
      return `- ${a.name}: ${v >= 0 ? `${v}점 (${FIDELITY_SCALE[v]})` : '미응답'}`;
    }).join('\n');
    return `당신은 학급 차원 긍정적행동지원(CWPBS) 컨설턴트입니다. 교사의 보편적 지원 실행충실도 점검 결과를 해석하고 실천 전략을 제안하세요.

## 학급 (비식별)
- ${curYear}학년도 ${curSemester}학기 · ${curClass?.name || '-'}

## 보편적 지원 실행충실도 점검지 (0~2점 × ${FIDELITY_AREAS.length}영역)
- 총점: ${stats.score} / ${stats.max} (응답 ${stats.done}/${stats.total}영역)
${lines}

## 요청
1) 잘 실행되는 영역(2점)과 우선 보완 영역(0~1점) 요약
2) 0~1점 영역별로 한국 특수학급 현장에서 바로 실천할 수 있는 개선 전략 1~2가지 (기대행동 수립·교수·게시, 강화제, 학급 구조화(공간·시간·절차 지원), 행동 특정적 칭찬과 연결)
3) 다음 4주 실행 계획 (주 단위)
간결한 한국어로 작성.`;
  }

  async function runAI() {
    if (llmStatus !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setAiBusy(true); setAiOut('');
    try {
      const out = await call(buildPrompt(), { tier: 'fast' });
      setAiOut(out || '응답이 비어 있습니다.');
    } catch (e) { toast('AI 해석 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  if (!curClassId) {
    return (
      <div className="card">
        <div className="card-title">📋 학급관리 실행충실도 2</div>
        <p style={{ color: '#64748b' }}>먼저 상단에서 학급을 선택해주세요. 점검지는 <strong>반·학기 단위</strong>로 저장됩니다.</p>
      </div>
    );
  }

  if (!loaded) return <FormLoading label="점검지를 불러오는 중…" />;

  const pick = (idx, v) => setVals((cur) => cur.map((x, i) => (i === idx ? (x === v ? -1 : v) : x))); // 같은 값 재클릭 = 해제
  const pct = stats.max > 0 ? Math.round((stats.score / stats.max) * 100) : 0;

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>📋 학급관리 실행충실도 2 — 보편적 지원 실행충실도 점검지</div>
        <p style={{ fontSize: '.9rem', color: '#274690', margin: 0, lineHeight: 1.6 }}>
          학급 차원 긍정적 행동지원(Tier 1)의 핵심 요소가 <strong>얼마나 충실하게 실행되고 있는지</strong> 영역별 기준문으로 점검합니다.
          현재 <strong>{curYear}학년도 {curSemester}학기 · {curClass?.name || '학급'}</strong> 기준으로 저장됩니다.
          <br />
          <span style={{ color: '#64748b', fontSize: '.85em' }}>
            {FIDELITY_SCALE.map((s, i) => `${i}점 ${s}`).join(' · ')} — 각 영역에서 지금 우리 반에 해당하는 문장을 고르세요.
          </span>
        </p>
      </div>

      {/* 요약 + 상단 저장 */}
      <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700 }}>실행충실도 총점</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pri)' }}>{stats.score} <span style={{ fontSize: '.9rem', color: 'var(--muted)' }}>/ {stats.max}점 ({pct}%)</span></div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>응답 {stats.done}/{stats.total}영역</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className={'btn btn-sm ' + (dirty ? 'btn-pri' : 'btn-ghost')} onClick={onSave} disabled={busy || !dirty}>{busy ? '저장 중…' : (dirty ? '💾 저장' : '✓ 저장됨')}</button>
        </div>
      </div>

      {FIDELITY_AREAS.map((area, idx) => (
        <div className="card" key={area.name}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>{idx + 1}. {area.name}</div>
            {vals[idx] >= 0
              ? <span className="badge badge-pri">{vals[idx]}점 — {FIDELITY_SCALE[vals[idx]]}</span>
              : <span className="badge" style={{ background: '#fffdf5', color: '#8a6100', border: '1px solid #f2dfad' }}>미응답</span>}
          </div>
          {[2, 1, 0].map((score) => {
            const on = vals[idx] === score;
            return (
              <button
                key={score}
                type="button"
                onClick={() => pick(idx, score)}
                title={on ? '다시 누르면 선택 해제' : `${score}점으로 선택`}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left',
                  font: 'inherit', color: 'inherit', cursor: 'pointer', marginBottom: 6, padding: '10px 12px',
                  borderRadius: 10, border: `1.5px solid ${on ? 'var(--pri)' : 'var(--border)'}`,
                  background: on ? 'var(--pri-soft)' : 'var(--surface2)',
                }}
              >
                <span style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.85rem',
                  background: on ? 'var(--pri)' : '#fff', color: on ? '#fff' : 'var(--sub)',
                  border: on ? 'none' : '1px solid var(--border)',
                }}>{score}</span>
                <span style={{ flex: 1, fontSize: '.87rem', lineHeight: 1.55 }}>
                  {area.levels[score]}
                  {area.details?.[score] && (
                    <span style={{ display: 'block', marginTop: 6 }}>
                      {area.details[score].map((d) => (
                        <span key={d} style={{ display: 'block', fontSize: '.8rem', color: 'var(--sub)', lineHeight: 1.5, marginBottom: 2 }}>– {d}</span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      {/* 저장 + AI 해석 — 실행충실도 1과 같은 패턴 (0825 동료 피드백) */}
      <div className="card">
        <div className="card-title">💾 저장 · ✨ AI 해석</div>
        <div className="card-subtitle">점검 결과를 저장하고, AI로 잘 되는 영역·보완 영역과 실행 전략을 받아보세요. (학급 정보만 사용 · 비식별)</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className={'btn ' + (dirty ? 'btn-pri' : 'btn-ghost')}
            onClick={onSave}
            disabled={busy || !dirty}
            title={dirty ? '지금 바로 저장' : '변경 내용이 모두 자동 저장되었습니다'}
          >
            {busy ? '저장 중…' : (dirty ? '💾 점검지 저장' : '✓ 저장됨')}
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <AIActionBar prompt={buildPrompt()} onCallAI={runAI} busy={aiBusy} callLabel="✨ AI 해석 받기" />
          {(aiOut || aiBusy) && <PromptResultBlock prompt={buildPrompt()} output={aiOut} busy={aiBusy} />}
        </div>
      </div>

      <div className="card" style={{ fontSize: '.74rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        출처: 최미진 (2023). 학급차원의 긍정적 행동지원 관련 전문성 개발 프로그램이 교사의 효능감과 학급관리실행에 미치는 영향.
        이화여자대학교 박사학위 논문. 수정. · 참고: Jolstead et al. (2017), Nelson et al. (2018)
      </div>
    </>
  );
}
