import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveQABF as apiSaveQABF } from '../../lib/api/students';
import QabfFnChart from '../ui/QabfFnChart';
import { downloadQabfExcel } from '../../lib/utils/exportQabf';
import {
  QABF_QUESTIONS as QUESTIONS,
  QABF_FUNCTION_LABELS as FUNCTION_LABELS,
  QABF_FUNCTION_COLORS as FUNCTION_COLORS,
  QABF_SCALE as SCALE,
  QABF_SCALE_LABELS as SCALE_LABELS,
} from '../../lib/qabf';

export default function QabfPage() {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [responses, setResponses] = useState(new Array(25).fill(-1));
  const [busy, setBusy] = useState(false);

  // 작성 중 응답 자동 임시저장(학생별, 브라우저 세션). 저장 전에 페이지를 떠나도 복원된다.
  const qabfDraftKey = curStuId ? `qabfDraft:${curStuId}` : null;

  useEffect(() => {
    if (!curStuId) return;
    // 1) 임시저장(draft)이 있으면 우선 복원
    try {
      const raw = qabfDraftKey && sessionStorage.getItem(qabfDraftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d) && d.length === 25) { setResponses(d); return; }
      }
    } catch (_) { /* ignore */ }
    // 2) 없으면 서버 저장값
    if (curStuData?.qabf && Array.isArray(curStuData.qabf)) {
      setResponses(curStuData.qabf.length === 25 ? curStuData.qabf : new Array(25).fill(-1));
    } else {
      setResponses(new Array(25).fill(-1));
    }
  }, [curStuId, curStuData?.qabf, qabfDraftKey]);

  // 서버 저장값과 다른 미저장 응답만 draft로 보관 (저장/초기 상태면 draft 제거).
  useEffect(() => {
    if (!qabfDraftKey) return;
    try {
      const saved = (curStuData?.qabf && curStuData.qabf.length === 25) ? curStuData.qabf : new Array(25).fill(-1);
      const allEmpty = responses.every((v) => v < 0);
      const sameAsSaved = JSON.stringify(responses) === JSON.stringify(saved);
      if (allEmpty || sameAsSaved) sessionStorage.removeItem(qabfDraftKey);
      else sessionStorage.setItem(qabfDraftKey, JSON.stringify(responses));
    } catch (_) { /* ignore */ }
  }, [responses, qabfDraftKey, curStuData?.qabf]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  // Calculate per-function totals (심각도 = 점수 합계)
  const totals = { attention: 0, escape: 0, sensory: 0, physical: 0, tangible: 0 };
  responses.forEach((v, i) => {
    if (v >= 0) totals[QUESTIONS[i].f] += v;
  });
  const maxTotal = Math.max(...Object.values(totals));
  const topFns = maxTotal > 0 ? Object.keys(totals).filter((f) => totals[f] === maxTotal) : [];

  function setVal(i, v) {
    setResponses((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      await apiSaveQABF(curStuId, responses);
      updateStudentData(curStuId, (cur) => ({ ...cur, qabf: responses }));
      try { if (qabfDraftKey) sessionStorage.removeItem(qabfDraftKey); } catch (_) { /* ignore */ }
      toast('QABF 저장 완료', 'success');
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const completed = responses.filter((v) => v >= 0).length;

  return (
    <>
      <StuHero />
      <div className="card">
        <div className="card-title">📊 QABF 척도 (Questions About Behavioral Function)</div>
        <div className="card-subtitle">
          공식 QABF 25문항 · 4점 척도(0 해당없음 ~ 3 자주)로 행동의 기능을 정량화합니다. 진행: <strong>{completed}/25</strong>
        </div>
        <div className="qabf-results" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
          {Object.keys(totals).map((f) => {
            const isTop = topFns.includes(f);
            return (
              <div key={f} style={{ background: isTop ? FUNCTION_COLORS[f] + '1a' : 'var(--surface2)', padding: 10, borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${FUNCTION_COLORS[f]}`, outline: isTop ? `2px solid ${FUNCTION_COLORS[f]}` : 'none' }}>
                <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{FUNCTION_LABELS[f]}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: FUNCTION_COLORS[f] }}>{totals[f]}</div>
                <div style={{ fontSize: '.66rem', color: 'var(--muted)' }}>/15</div>
              </div>
            );
          })}
        </div>
        {topFns.length > 0 && (
          <div style={{ marginTop: 10, fontSize: '.82rem' }}>
            추정 주요 기능: {topFns.map((f) => <strong key={f} style={{ color: FUNCTION_COLORS[f], marginRight: 8 }}>{FUNCTION_LABELS[f]}</strong>)}
            <span style={{ color: 'var(--muted)' }}>(점수가 가장 높은 기능)</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">📈 QABF 기능·심각도 그래프</div>
        <div className="card-subtitle">공식 QABF 양식의 그래프 — 5개 기능별 <strong>기능(0~5, 응답 문항 수)</strong>과 <strong>심각도(0~15, 점수 합)</strong>를 함께 보여줍니다.</div>
        <QabfFnChart responses={responses} />
      </div>

      <div className="card">
        <div className="card-title">✅ 25문항 체크리스트</div>
        {QUESTIONS.map((item, i) => (
          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '.92rem', flex: 1 }}>
                <strong style={{ color: FUNCTION_COLORS[item.f] }}>{i + 1}.</strong> {item.q}
              </span>
              <span style={{ fontSize: '.74rem', color: FUNCTION_COLORS[item.f], fontWeight: 600, marginLeft: 8, whiteSpace: 'nowrap' }}>
                {FUNCTION_LABELS[item.f]}
              </span>
            </div>
            <div className="qchip-area">
              {SCALE.map((v) => (
                <span
                  key={v}
                  className={'qchip' + (responses[i] === v ? ' on' : '')}
                  role="button" tabIndex={0} aria-pressed={responses[i] === v}
                  onClick={() => setVal(i, v)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVal(i, v); } }}
                >
                  {v} · {SCALE_LABELS[v]}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => downloadQabfExcel(responses, curStu)}>⬇ 엑셀 다운로드</button>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>
            💾 QABF 저장
          </button>
        </div>
      </div>
    </>
  );
}
