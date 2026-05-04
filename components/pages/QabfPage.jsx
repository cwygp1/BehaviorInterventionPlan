import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveQABF as apiSaveQABF } from '../../lib/api/students';

const QUESTIONS = [
  // 25 items grouped by 5 functions (Attention, Escape, Tangible, Sensory, Non-social)
  // Categories cycle every 5 items.
  { f: 'attention', q: '교사·또래의 관심을 끌기 위해 한다' },
  { f: 'escape',    q: '어려운 과제를 회피하려고 한다' },
  { f: 'tangible',  q: '원하는 물건/활동을 얻으려고 한다' },
  { f: 'sensory',   q: '특정 감각 자극을 즐기는 듯 보인다' },
  { f: 'nonsocial', q: '주변에 아무도 없을 때도 발생한다' },

  { f: 'attention', q: '꾸짖음·반응을 받으면 강도가 높아진다' },
  { f: 'escape',    q: '특정 활동·요구가 시작될 때 발생' },
  { f: 'tangible',  q: '거부 직후 빈도가 증가한다' },
  { f: 'sensory',   q: '같은 행동을 반복적으로 한다' },
  { f: 'nonsocial', q: '관심을 주거나 끄거나 차이가 없다' },

  { f: 'attention', q: '눈을 마주치며 교사를 본다' },
  { f: 'escape',    q: '쉬운 활동에는 발생하지 않는다' },
  { f: 'tangible',  q: '장난감 등을 가리키며 발생' },
  { f: 'sensory',   q: '몸을 흔들거나 자기 자극이 동반' },
  { f: 'nonsocial', q: '소음·조명 등 환경 자극과 무관' },

  { f: 'attention', q: '집단 활동 중 더 자주 발생' },
  { f: 'escape',    q: '도주 행동이 함께 발생한다' },
  { f: 'tangible',  q: '원하는 것 받으면 즉시 멈춘다' },
  { f: 'sensory',   q: '반복 자극을 멈출 수 없어 보인다' },
  { f: 'nonsocial', q: '특정 신체 부위 자극과 관련' },

  { f: 'attention', q: '주변 또래가 보고 있을 때 더 자주' },
  { f: 'escape',    q: '학습 시간에 집중적으로 발생' },
  { f: 'tangible',  q: '원하는 활동을 빼앗기면 시작' },
  { f: 'sensory',   q: '눈/귀/입에 자극을 주는 형태' },
  { f: 'nonsocial', q: '신체적 통증·불편을 동반한다' },
];

const FUNCTION_LABELS = {
  attention: '관심 (Attention)',
  escape: '회피 (Escape)',
  tangible: '획득 (Tangible)',
  sensory: '감각/자동 (Sensory)',
  nonsocial: '비사회적 (Non-social)',
};
const FUNCTION_COLORS = {
  attention: '#4f6bed',
  escape: '#ef476f',
  tangible: '#f59f00',
  sensory: '#12b886',
  nonsocial: '#1098ad',
};

const SCALE = [0, 1, 2, 3];
const SCALE_LABELS = { 0: '전혀', 1: '가끔', 2: '자주', 3: '매우' };

export default function QabfPage() {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [responses, setResponses] = useState(new Array(25).fill(-1));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (curStuData?.qabf && Array.isArray(curStuData.qabf)) {
      setResponses(curStuData.qabf.length === 25 ? curStuData.qabf : new Array(25).fill(-1));
    } else {
      setResponses(new Array(25).fill(-1));
    }
  }, [curStuId, curStuData?.qabf]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  // Calculate per-function totals
  const totals = { attention: 0, escape: 0, tangible: 0, sensory: 0, nonsocial: 0 };
  responses.forEach((v, i) => {
    if (v >= 0) totals[QUESTIONS[i].f] += v;
  });

  function setVal(i, v) {
    setResponses((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      await apiSaveQABF(curStuId, responses);
      updateStudentData(curStuId, (cur) => ({ ...cur, qabf: responses }));
      toast('QABF 저장 완료');
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
          25문항 4점 척도로 행동의 기능을 정량화합니다. 진행: <strong>{completed}/25</strong>
        </div>
        <div className="qabf-results" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
          {Object.keys(totals).map((f) => (
            <div key={f} style={{ background: 'var(--surface2)', padding: 10, borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${FUNCTION_COLORS[f]}` }}>
              <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{FUNCTION_LABELS[f]}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: FUNCTION_COLORS[f] }}>{totals[f]}</div>
              <div style={{ fontSize: '.66rem', color: 'var(--muted)' }}>/15</div>
            </div>
          ))}
        </div>
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
                <span key={v} className={'qchip' + (responses[i] === v ? ' on' : '')} onClick={() => setVal(i, v)}>
                  {v} · {SCALE_LABELS[v]}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>
            💾 QABF 저장
          </button>
        </div>
      </div>
    </>
  );
}
