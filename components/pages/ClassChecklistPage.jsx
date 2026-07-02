import { useEffect, useMemo, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchClassChecklist, saveClassChecklist } from '../../lib/api/students';
import PromptResultBlock from '../modals/PromptResultBlock';
import AIActionBar from '../ui/AIActionBar';
import {
  CWPBS_ITEMS, CWPBS_SCALE, SOLVE_ITEMS, SOLVE_SCALE, SOLVE_SECTIONS,
  CORE_ELEMENTS, emptyClassChecklist,
} from '../../lib/classChecklist';

const thC = { border: '1px solid #cbd5e1', padding: '6px 8px', background: '#f1f5f9', fontWeight: 700, fontSize: '.78rem', textAlign: 'center' };
const tdQ = { border: '1px solid #e2e8f0', padding: '8px 10px', fontSize: '.86rem', lineHeight: 1.55 };
const tdR = { border: '1px solid #e2e8f0', padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle' };

// 응답표 한 개(문항 배열 + 척도)를 렌더링하는 공용 표.
function ChecklistTable({ items, scale, values, onSet, idPrefix, startNo = 1 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thC, width: 34 }}>번호</th>
            <th style={{ ...thC, textAlign: 'left' }}>질문 내용</th>
            {scale.map((s, i) => (
              <th key={i} style={{ ...thC, width: 64 }}>{i}<div style={{ fontWeight: 500, fontSize: '.66rem', color: '#64748b' }}>{s}</div></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((q, idx) => (
            <tr key={idx} style={{ background: values[idx] >= 0 ? '#fff' : '#fffdf5' }}>
              <td style={{ ...tdR, fontSize: '.82rem', color: '#64748b' }}>{startNo + idx}</td>
              <td style={tdQ}>{q}</td>
              {scale.map((_, v) => (
                <td
                  key={v}
                  style={{ ...tdR, cursor: 'pointer' }}
                  onClick={() => onSet(idx, v)}
                  title={scale[v]}
                >
                  <input
                    type="radio"
                    name={`${idPrefix}-${idx}`}
                    checked={values[idx] === v}
                    onChange={() => onSet(idx, v)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ClassChecklistPage() {
  const toast = useToast();
  const { curYear, curSemester, curClassId, curClass } = useStudents();
  const { call, status: llmStatus } = useLLM();

  const [r, setR] = useState(emptyClassChecklist());
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOut, setAiOut] = useState('');
  const [refOpen, setRefOpen] = useState(false);

  useEffect(() => {
    if (!curClassId) return;
    let cancelled = false;
    fetchClassChecklist(curClassId, curSemester).then((d) => {
      if (cancelled) return;
      const saved = d?.data?.responses || {};
      const empty = emptyClassChecklist();
      setR({
        cwpbs: Array.isArray(saved.cwpbs) ? [...saved.cwpbs, ...empty.cwpbs].slice(0, CWPBS_ITEMS.length) : empty.cwpbs,
        solve: Array.isArray(saved.solve) ? [...saved.solve, ...empty.solve].slice(0, SOLVE_ITEMS.length) : empty.solve,
      });
      setAiOut('');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [curClassId, curSemester]);

  const setAns = (key) => (idx, v) => setR((cur) => {
    const next = cur[key].slice(); next[idx] = v; return { ...cur, [key]: next };
  });

  // 합계·진행률
  const stats = useMemo(() => {
    const sum = (arr) => arr.reduce((a, v) => a + (v >= 0 ? v : 0), 0);
    const answered = (arr) => arr.filter((v) => v >= 0).length;
    const cwpbsSections = SOLVE_SECTIONS; // solve 전용 — cwpbs는 단일 합계.
    const solveSec = cwpbsSections.map((s) => ({
      name: s.name,
      score: sum(r.solve.slice(s.from, s.to + 1)),
      max: (s.to - s.from + 1) * 4,
    }));
    return {
      cwpbs: { score: sum(r.cwpbs), max: CWPBS_ITEMS.length * 3, done: answered(r.cwpbs), total: CWPBS_ITEMS.length },
      solve: { score: sum(r.solve), max: SOLVE_ITEMS.length * 4, done: answered(r.solve), total: SOLVE_ITEMS.length, sections: solveSec },
    };
  }, [r]);

  async function onSave() {
    if (!curClassId) { toast('먼저 학급을 선택해주세요.'); return; }
    setBusy(true);
    try {
      await saveClassChecklist({ class_id: curClassId, semester: curSemester, responses: r });
      toast('학급관리 체크리스트 저장 완료');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  function buildPrompt() {
    const low = (items, arr, max) => items.map((q, i) => ({ q, v: arr[i] }))
      .filter((x) => x.v >= 0 && x.v <= Math.floor(max / 2) - 0)
      .slice(0, 8).map((x) => `- (${x.v}점) ${x.q}`).join('\n') || '(없음)';
    return `당신은 학급 차원 긍정적행동지원(CWPBS) 컨설턴트입니다. 교사의 학급관리 자가진단 결과를 해석하고 실천 전략을 제안하세요.

## 학급 (비식별)
- ${curYear}학년도 ${curSemester}학기 · ${curClass?.name || '-'}

## 1) 학급관리실행 검사지 (0~3점 × 10문항)
- 총점: ${stats.cwpbs.score} / ${stats.cwpbs.max} (응답 ${stats.cwpbs.done}/${stats.cwpbs.total})
- 낮은 문항(0~1점):
${low(CWPBS_ITEMS, r.cwpbs, 3)}

## 2) 행동문제해결력 척도 (0~4점 × 30문항)
- 총점: ${stats.solve.score} / ${stats.solve.max} (응답 ${stats.solve.done}/${stats.solve.total})
- 영역별: ${stats.solve.sections.map((s) => `${s.name} ${s.score}/${s.max}`).join(', ')}
- 낮은 문항(0~2점):
${low(SOLVE_ITEMS, r.solve, 4)}

## 요청
1) 강점 영역과 우선 개선 영역 요약
2) 낮은 문항별로 한국 특수학급 현장에서 바로 실천할 수 있는 전략 1~2가지 (학급 중재 핵심요소: 환경·일과·기대·감독·기회·인정·촉진/사전교정·오류교정·자료체계와 연결)
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
        <div className="card-title">✅ 학급관리 체크리스트</div>
        <p style={{ color: '#64748b' }}>먼저 상단에서 학급을 선택해주세요. 체크리스트는 <strong>반·학기 단위</strong>로 저장됩니다.</p>
      </div>
    );
  }

  const pct = (s) => (s.max > 0 ? Math.round((s.score / s.max) * 100) : 0);

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>✅ 학급관리 체크리스트 (Tier 1 자가진단)</div>
        <p style={{ fontSize: '.9rem', color: '#274690', margin: 0, lineHeight: 1.6 }}>
          교사의 <strong>학급관리 실행(CWPBS)</strong>과 <strong>학급 내 행동문제해결력</strong>을 스스로 점검하는 도구입니다.
          현재 <strong>{curYear}학년도 {curSemester}학기 · {curClass?.name || '학급'}</strong> 기준으로 저장됩니다.
          <span style={{ color: '#64748b' }}> (출처: Simonsen et al., 2015 / OSEP Center on PBIS)</span>
        </p>
      </div>

      {/* 요약 배지 + 상단 저장 */}
      <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700 }}>① 학급관리실행 검사지</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pri)' }}>{stats.cwpbs.score} <span style={{ fontSize: '.9rem', color: 'var(--muted)' }}>/ {stats.cwpbs.max}점 ({pct(stats.cwpbs)}%)</span></div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>응답 {stats.cwpbs.done}/{stats.cwpbs.total}문항</div>
        </div>
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700 }}>② 행동문제해결력 척도</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pri)' }}>{stats.solve.score} <span style={{ fontSize: '.9rem', color: 'var(--muted)' }}>/ {stats.solve.max}점 ({pct(stats.solve)}%)</span></div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
            {stats.solve.sections.map((s) => `${s.name} ${s.score}/${s.max}`).join(' · ')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-pri btn-sm" onClick={onSave} disabled={busy}>{busy ? '저장 중…' : '💾 저장'}</button>
        </div>
      </div>

      {/* 부록2 — CWPBS self-assessment */}
      <div className="card">
        <div className="card-title">① 학급관리실행 검사지 (CWPBS self-assessment)</div>
        <div className="card-subtitle">
          학생의 참여나 성취를 최대화하는 교수활동·예방적 행동관리로 구성된 교실관리전략의 실행 정도를 점검합니다.
          총 10문항 · 약 5분 소요 · 0(실행하지 않는다) ~ 3(항상 실행한다).
        </div>
        <div style={{ marginTop: 12 }}>
          <ChecklistTable idPrefix="cwpbs" items={CWPBS_ITEMS} scale={CWPBS_SCALE} values={r.cwpbs} onSet={setAns('cwpbs')} />
        </div>
      </div>

      {/* 부록3 — 행동문제해결력 척도 */}
      <div className="card">
        <div className="card-title">② 행동문제해결력 척도</div>
        <div className="card-subtitle">
          학급에서 발생하는 복잡하고 예측할 수 없는 행동문제에 효과적으로 대응하고 최선의 해결책을 이끌어내는
          역량을 점검합니다. 총 30문항 · 약 15분 소요 · 0(전혀 그렇지 않다) ~ 4(매우 그렇다).
        </div>
        <div style={{ marginTop: 12 }}>
          <ChecklistTable idPrefix="solve" items={SOLVE_ITEMS} scale={SOLVE_SCALE} values={r.solve} onSet={setAns('solve')} />
        </div>
      </div>

      {/* 부록1 — 참고표 */}
      <div className="card">
        <button
          onClick={() => setRefOpen((o) => !o)}
          style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span className="card-title" style={{ marginBottom: 0 }}>📖 참고 — 학급 중재 및 지원의 핵심요소</span>
          <span style={{ color: 'var(--muted)' }}>{refOpen ? '▲' : '▼'}</span>
        </button>
        {refOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
            {CORE_ELEMENTS.map((g) => (
              <div key={g.group} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: '.86rem', marginBottom: 8, color: 'var(--pri)' }}>{g.group}</div>
                {g.items.map((it) => (
                  <div key={it.t} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '.8rem' }}>{it.t}</div>
                    <div style={{ fontSize: '.76rem', color: 'var(--sub)', lineHeight: 1.5 }}>{it.d}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 저장 + AI 해석 */}
      <div className="card">
        <div className="card-title">💾 저장 · ✨ AI 해석</div>
        <div className="card-subtitle">체크 결과를 저장하고, AI로 강점·개선 영역과 실행 전략을 받아보세요. (학급 정보만 사용 · 비식별)</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>{busy ? '저장 중…' : '💾 체크리스트 저장'}</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <AIActionBar prompt={buildPrompt()} onCallAI={runAI} busy={aiBusy} callLabel="✨ AI 해석 받기" />
          {(aiOut || aiBusy) && <PromptResultBlock prompt={buildPrompt()} output={aiOut} busy={aiBusy} />}
        </div>
      </div>
    </>
  );
}
