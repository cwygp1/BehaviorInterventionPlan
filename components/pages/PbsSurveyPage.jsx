import { useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchPbsSurvey, savePbsSurvey } from '../../lib/api/students';
import PromptResultBlock from '../modals/PromptResultBlock';
import {
  PBS_BEHAVIORS, PBS_INTENSITY, PBS_INTERVENTIONS, PBS_AWARENESS, PBS_EFFECT_AREAS,
  PBS_DIFFICULTIES, PBS_PLACES, PBS_TIMES, PBS_EXPECTED, emptyPbsSurvey,
} from '../../lib/pbsSurvey';

const rankInput = { width: 54, textAlign: 'center' };
const qTitle = { fontWeight: 700, color: '#1f3a8a', marginBottom: 8, fontSize: '.98rem' };
const tdC = { border: '1px solid #e2e8f0', padding: '6px 8px', verticalAlign: 'middle' };
const thC = { border: '1px solid #cbd5e1', padding: '6px 8px', background: '#f1f5f9', fontWeight: 700, fontSize: '.82rem' };

export default function PbsSurveyPage() {
  const toast = useToast();
  const { curClassId, curClass, curSemester } = useStudents();
  const { call, status: llmStatus } = useLLM();

  const [r, setR] = useState(emptyPbsSurvey());
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOut, setAiOut] = useState('');

  useEffect(() => {
    if (!curClassId) return;
    let cancelled = false;
    fetchPbsSurvey(curClassId, curSemester).then((d) => {
      if (cancelled) return;
      setR(d?.data?.responses ? { ...emptyPbsSurvey(), ...d.data.responses } : emptyPbsSurvey());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [curClassId, curSemester]);

  // 불변 갱신 헬퍼.
  const patch = (partial) => setR((cur) => ({ ...cur, ...partial }));
  const patchArr = (key, idx, value) => setR((cur) => {
    const next = cur[key].slice(); next[idx] = value; return { ...cur, [key]: next };
  });

  async function onSave() {
    if (!curClassId) { toast('먼저 학급을 선택해주세요.'); return; }
    setBusy(true);
    try {
      await savePbsSurvey({ class_id: curClassId, semester: curSemester, responses: r });
      toast('PBS 기초 설문 저장 완료');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function onAISummary() {
    if (llmStatus === 'off') { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
    setAiBusy(true); setAiOut('');
    try {
      const topBeh = PBS_BEHAVIORS.filter((b) => r.q2[b.key]?.rank || r.q2[b.key]?.n)
        .map((b) => `${b.label}(학생 ${r.q2[b.key].n || '-'}명, 순위 ${r.q2[b.key].rank || '-'})`).join(', ') || '미입력';
      const places = PBS_PLACES.map((p, i) => r.q8[i] ? `${p}(${r.q8[i]})` : null).filter(Boolean).join(', ') || '미입력';
      const times = PBS_TIMES.map((t, i) => r.q9[i] ? `${t}(${r.q9[i]})` : null).filter(Boolean).join(', ') || '미입력';
      const expected = PBS_EXPECTED.map((e, i) => r.q10[i] ? `${e}(${r.q10[i]})` : null).filter(Boolean).join(', ') || '미입력';
      const diffs = PBS_DIFFICULTIES.filter((_, i) => r.q7[i]?.has).map((d, i) => d).join(', ') || '미입력';
      const prompt =
        '너는 학교 차원 긍정적행동지원(SW-PBS) 전문가다. 아래 "기초 설문 결과"를 바탕으로 Tier 1 실행 계획을 제안하라.\n\n' +
        `[자주 발생 문제행동(순위)] ${topBeh}\n` +
        `[빈발 장소(순위)] ${places}\n` +
        `[빈발 시간대(순위)] ${times}\n` +
        `[교사가 어려움을 느끼는 점] ${diffs}\n` +
        `[선택된 기대행동 후보(순위)] ${expected}\n\n` +
        '다음을 한국어로 간결히 작성:\n' +
        '1) 우선 개입할 문제행동·장소·시간대 요약\n' +
        '2) 학교 규칙(기대행동) 3가지 제안과 근거\n' +
        '3) 기대행동 × 핵심 장소 매트릭스(각 칸에 관찰가능한 규칙 1~2개)\n' +
        '4) 교사 지원 요구에 대한 실행 제안';
      const out = await call(prompt);
      setAiOut(out || '응답이 비어 있습니다.');
    } catch (e) { toast('AI 요약 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  if (!curClassId) {
    return <div className="card"><div className="card-title">📋 PBS 기초 설문조사</div>
      <p style={{ color: '#64748b' }}>먼저 상단에서 학급을 선택해주세요. 설문은 <strong>반·학기 단위</strong>로 저장됩니다.</p></div>;
  }

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>📋 PBS 실행을 위한 기초 설문조사</div>
        <p style={{ fontSize: '.9rem', color: '#274690', margin: 0, lineHeight: 1.6 }}>
          학생 문제행동 실태 파악 및 학교 규칙(기대행동) 수립을 위한 Tier 1 기초조사입니다.
          현재 <strong>{curClass?.name || '학급'} · {curSemester}학기</strong> 기준으로 저장됩니다.
        </p>
      </div>

      {/* Q1 */}
      <div className="card">
        <div style={qTitle}>1. 담당 학급 정보</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">학년</label>
            <input className="form-input" value={r.q1.grade} onChange={(e) => patch({ q1: { ...r.q1, grade: e.target.value } })} placeholder="예: 초3" /></div>
          <div className="form-group"><label className="form-label">담임 여부</label>
            <select className="form-input" value={r.q1.homeroom} onChange={(e) => patch({ q1: { ...r.q1, homeroom: e.target.value } })}>
              <option value="담임">담임</option><option value="비담임">비담임</option></select></div>
          <div className="form-group"><label className="form-label">학생 인원</label>
            <input className="form-input" value={r.q1.count} onChange={(e) => patch({ q1: { ...r.q1, count: e.target.value } })} placeholder="명" /></div>
        </div>
      </div>

      {/* Q2 */}
      <div className="card">
        <div style={qTitle}>2. 문제행동별 학생 수 + 순위(1~5)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr><th style={thC}>문제행동</th><th style={thC}>정의</th><th style={{ ...thC, width: 70 }}>학생수</th><th style={{ ...thC, width: 60 }}>순위</th></tr></thead>
            <tbody>
              {PBS_BEHAVIORS.map((b) => (
                <tr key={b.key}>
                  <td style={{ ...tdC, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</td>
                  <td style={{ ...tdC, color: '#64748b', fontSize: '.78rem' }}>{b.def}</td>
                  <td style={tdC}><input style={{ ...rankInput, width: '100%' }} value={r.q2[b.key].n} onChange={(e) => patch({ q2: { ...r.q2, [b.key]: { ...r.q2[b.key], n: e.target.value } } })} /></td>
                  <td style={tdC}><input style={{ ...rankInput, width: '100%' }} value={r.q2[b.key].rank} onChange={(e) => patch({ q2: { ...r.q2, [b.key]: { ...r.q2[b.key], rank: e.target.value } } })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">기타 문제행동(자유 기술)</label>
          <textarea className="form-textarea" rows={2} value={r.q2etc} onChange={(e) => patch({ q2etc: e.target.value })} /></div>
      </div>

      {/* Q3 */}
      <div className="card">
        <div style={qTitle}>3. 문제행동 강도(순위)</div>
        {PBS_INTENSITY.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <input style={rankInput} value={r.q3[i]} onChange={(e) => patchArr('q3', i, e.target.value)} />
            <span style={{ fontSize: '.88rem' }}>{i + 1}. {t}</span>
          </div>
        ))}
      </div>

      {/* Q4 */}
      <div className="card">
        <div style={qTitle}>4. 사용 중재방법(사용여부 + 효과 1~5)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr><th style={thC}>중재 내용</th><th style={{ ...thC, width: 60 }}>사용</th><th style={{ ...thC, width: 180 }}>효과(1 없음 ~ 5 매우)</th></tr></thead>
            <tbody>
              {PBS_INTERVENTIONS.map((m, i) => (
                <tr key={i}>
                  <td style={tdC}>{m}</td>
                  <td style={{ ...tdC, textAlign: 'center' }}><input type="checkbox" checked={r.q4[i].used} onChange={(e) => patchArr('q4', i, { ...r.q4[i], used: e.target.checked })} /></td>
                  <td style={{ ...tdC, textAlign: 'center' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} style={{ marginRight: 6, fontSize: '.8rem' }}>
                        <input type="radio" name={`q4_${i}`} checked={r.q4[i].effect === n} onChange={() => patchArr('q4', i, { ...r.q4[i], effect: n })} /> {n}
                      </label>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">기타 중재(직접 기술)</label>
          <input className="form-input" value={r.q4etc.label} onChange={(e) => patch({ q4etc: { ...r.q4etc, label: e.target.value } })} /></div>
      </div>

      {/* Q5 */}
      <div className="card">
        <div style={qTitle}>5. 긍정적 행동지원에 대해 들어보신 적이 있습니까?</div>
        {PBS_AWARENESS.map((t, i) => (
          <label key={i} style={{ display: 'block', marginBottom: 6, fontSize: '.88rem' }}>
            <input type="radio" name="q5" checked={r.q5 === i + 1} onChange={() => patch({ q5: i + 1 })} /> {t}
          </label>
        ))}
      </div>

      {/* Q6 */}
      <div className="card">
        <div style={qTitle}>6. 본교 PBS가 효과가 있을 것이라고 생각하십니까?</div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ marginRight: 16 }}><input type="radio" name="q6" checked={r.q6.effective === 1} onChange={() => patch({ q6: { ...r.q6, effective: 1 } })} /> 효과가 있다</label>
          <label><input type="radio" name="q6" checked={r.q6.effective === 2} onChange={() => patch({ q6: { ...r.q6, effective: 2 } })} /> 효과가 없다</label>
        </div>
        {r.q6.effective === 1 && (
          <div style={{ paddingLeft: 8, borderLeft: '3px solid #c7d7f5' }}>
            <div style={{ fontSize: '.85rem', color: '#475569', marginBottom: 6 }}>6-1. 어느 부분에서 효과가 있을지(복수 선택)</div>
            {PBS_EFFECT_AREAS.map((a, i) => (
              <label key={i} style={{ display: 'block', marginBottom: 5, fontSize: '.86rem' }}>
                <input type="checkbox" checked={r.q6.areas.includes(i)} onChange={(e) => {
                  const areas = e.target.checked ? [...r.q6.areas, i] : r.q6.areas.filter((x) => x !== i);
                  patch({ q6: { ...r.q6, areas } });
                }} /> {a}
              </label>
            ))}
            <input className="form-input" style={{ marginTop: 6 }} placeholder="기타 의견" value={r.q6.etc} onChange={(e) => patch({ q6: { ...r.q6, etc: e.target.value } })} />
          </div>
        )}
      </div>

      {/* Q7 */}
      <div className="card">
        <div style={qTitle}>7. 지도에서 특히 어려운 점 + 지원 요구</div>
        {PBS_DIFFICULTIES.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input type="checkbox" checked={r.q7[i].has} onChange={(e) => patchArr('q7', i, { ...r.q7[i], has: e.target.checked })} />
            <span style={{ fontSize: '.85rem', width: 280, flexShrink: 0 }}>{i + 1}. {d}</span>
            <input className="form-input" style={{ flex: 1 }} placeholder="필요한 지원" value={r.q7[i].need} onChange={(e) => patchArr('q7', i, { ...r.q7[i], need: e.target.value })} />
          </div>
        ))}
      </div>

      {/* Q8 */}
      <div className="card">
        <div style={qTitle}>8. 문제행동이 자주 발생하는 장소(순위 1~5)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {PBS_PLACES.map((p, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.8rem', marginBottom: 3 }}>{p}</div>
              <input style={rankInput} value={r.q8[i]} onChange={(e) => patchArr('q8', i, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Q9 */}
      <div className="card">
        <div style={qTitle}>9. 문제행동이 자주 발생하는 시간대(순위 1~5)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {PBS_TIMES.map((t, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.8rem', marginBottom: 3 }}>{t}</div>
              <input style={rankInput} value={r.q9[i]} onChange={(e) => patchArr('q9', i, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Q10 */}
      <div className="card">
        <div style={qTitle}>10. 학교 규칙(기대행동) 후보 — 꼭 필요한 5가지 순위</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {PBS_EXPECTED.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input style={{ ...rankInput, width: 44 }} value={r.q10[i]} onChange={(ev) => patchArr('q10', i, ev.target.value)} />
              <span style={{ fontSize: '.86rem' }}>{e}</span>
            </div>
          ))}
        </div>
        <input className="form-input" style={{ marginTop: 8 }} placeholder="기타 더 좋은 표현(자유 기재)" value={r.q10custom} onChange={(e) => patch({ q10custom: e.target.value })} />
      </div>

      {/* Q11 */}
      <div className="card">
        <div style={qTitle}>11. 생활규칙 적용이 필요한 장소(순위 1~3)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {PBS_PLACES.map((p, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.8rem', marginBottom: 3 }}>{p}</div>
              <input style={rankInput} value={r.q11[i]} onChange={(e) => patchArr('q11', i, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Q12 */}
      <div className="card">
        <div style={qTitle}>12. 기대행동 × 장소 매트릭스(생활규칙)</div>
        <p style={{ fontSize: '.82rem', color: '#64748b', marginTop: -2, marginBottom: 10 }}>10번 1~3위를 기대행동에, 11번 1~3위를 장소에 적고 각 칸에 규칙을 작성하세요.</p>
        {r.q12.map((row, ri) => (
          <div key={ri} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <input className="form-input" style={{ marginBottom: 8, fontWeight: 600 }} placeholder={`기대행동 ${ri + 1}`} value={row.behavior}
              onChange={(e) => setR((cur) => { const q12 = cur.q12.map((x) => ({ ...x })); q12[ri] = { ...q12[ri], behavior: e.target.value }; return { ...cur, q12 }; })} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {row.places.map((pl, pi) => (
                <div key={pi}>
                  <input className="form-input" style={{ marginBottom: 4, fontSize: '.82rem' }} placeholder={`장소 ${pi + 1}`} value={pl.place}
                    onChange={(e) => setR((cur) => { const q12 = cur.q12.map((x) => ({ ...x, places: x.places.map((y) => ({ ...y })) })); q12[ri].places[pi].place = e.target.value; return { ...cur, q12 }; })} />
                  <textarea className="form-textarea" rows={3} placeholder="규칙" value={pl.rules}
                    onChange={(e) => setR((cur) => { const q12 = cur.q12.map((x) => ({ ...x, places: x.places.map((y) => ({ ...y })) })); q12[ri].places[pi].rules = e.target.value; return { ...cur, q12 }; })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 저장 + AI */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-ok" onClick={onAISummary} disabled={aiBusy}>{aiBusy ? '⏳ 분석 중…' : '✨ AI 실행계획 요약'}</button>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 설문 저장</button>
        </div>
        {(aiOut || aiBusy) && <div style={{ marginTop: 12 }}><PromptResultBlock output={aiOut} busy={aiBusy} /></div>}
      </div>
    </>
  );
}
