import { useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { fetchPbsSurvey, savePbsSurvey } from '../../lib/api/students';
import PromptResultBlock from '../modals/PromptResultBlock';
import useFormLoad, { FormLoading } from '../../lib/hooks/useFormLoad';
import {
  PBS_BEHAVIORS, PBS_INTENSITY, PBS_INTERVENTIONS, PBS_AWARENESS, PBS_EFFECT_AREAS,
  PBS_DIFFICULTIES, PBS_PLACES, PBS_TIMES, PBS_EXPECTED, emptyPbsSurvey,
} from '../../lib/pbsSurvey';

const rankInput = { width: 54, textAlign: 'center' };
const qTitle = { fontWeight: 700, color: '#1f3a8a', marginBottom: 8, fontSize: '.98rem' };
const qHint = { fontSize: '.82rem', color: '#64748b', marginTop: -4, marginBottom: 10, lineHeight: 1.55 };

// 숫자 전용 입력: 숫자 외 문자는 입력 즉시 제거, max 초과 시 max로 보정.
function NumInput({ value, onChange, max, style, className, placeholder, title }) {
  return (
    <input
      className={className}
      style={style}
      inputMode="numeric"
      placeholder={placeholder}
      title={title}
      value={value}
      onChange={(e) => {
        let v = e.target.value.replace(/[^0-9]/g, '');
        if (v !== '' && max != null && Number(v) > max) v = String(max);
        onChange(v);
      }}
    />
  );
}
// 학생 수 등 숫자: − / + 버튼 스테퍼(직접 입력도 가능). 1에서 −를 누르면 빈칸(해당 없음).
function Stepper({ value, onChange, max = 99, placeholder }) {
  const n = value === '' || value == null ? 0 : Number(value);
  const btn = { width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', lineHeight: 1, padding: 0 };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button type="button" style={btn} title="1 감소(1에서 누르면 지움)" onClick={() => onChange(n <= 1 ? '' : String(Math.min(n, max) - 1))}>−</button>
      <NumInput style={{ ...rankInput, width: 44 }} className="form-input" max={max} placeholder={placeholder} value={value} onChange={onChange} />
      <button type="button" style={btn} title="1 증가" onClick={() => onChange(String(Math.min(n + 1, max)))}>＋</button>
    </div>
  );
}

// 탭 순서 = 순위. 선택된 항목을 다시 탭하면 해제되고 뒤 순위가 앞으로 당겨짐.
// list: 순위 문자열 배열('' = 미선택). 반환: 새 배열, 가득 찼으면 null.
function toggleRank(list, idx, max) {
  const next = list.slice();
  if (next[idx]) {
    const removed = Number(next[idx]);
    next[idx] = '';
    for (let j = 0; j < next.length; j++) {
      if (next[j] && Number(next[j]) > removed) next[j] = String(Number(next[j]) - 1);
    }
  } else {
    const used = next.filter(Boolean).length;
    if (used >= max) return null;
    next[idx] = String(used + 1);
  }
  return next;
}

// 순위별 색상: 1위(빨강) → 2위(주황) → 3위(초록) → 4위(파랑) → 5위(보라). 서로 뚜렷이 구분되는 색으로.
const RANK_COLORS = {
  1: { badge: '#dc2626', bg: '#fef2f2', border: '#dc2626', text: '#b91c1c' },
  2: { badge: '#ea580c', bg: '#fff7ed', border: '#ea580c', text: '#c2410c' },
  3: { badge: '#16a34a', bg: '#f0fdf4', border: '#16a34a', text: '#15803d' },
  4: { badge: '#2563eb', bg: '#eff6ff', border: '#2563eb', text: '#1d4ed8' },
  5: { badge: '#7c3aed', bg: '#f5f3ff', border: '#7c3aed', text: '#6d28d9' },
};
const rankColor = (rank) => RANK_COLORS[Number(rank)] || RANK_COLORS[5];

// 클릭형 순위 칩: 탭하면 순위 배지가 붙고, 다시 탭하면 해제. 순위별로 색이 다름.
function RankChip({ label, rank, onClick, style }) {
  const on = !!rank;
  const c = on ? rankColor(rank) : null;
  return (
    <button type="button" onClick={onClick} title="탭한 순서대로 순위가 매겨집니다. 다시 탭하면 해제됩니다."
      style={{
        padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '.85rem', textAlign: 'left',
        display: 'inline-flex', alignItems: 'center', gap: 6, userSelect: 'none',
        border: `1.5px solid ${on ? c.border : '#cbd5e1'}`, background: on ? c.bg : '#fff',
        color: on ? c.text : '#334155', fontWeight: on ? 700 : 400, ...style,
      }}>
      {on && <span style={{ background: c.badge, color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: '.72rem', fontWeight: 700, flexShrink: 0 }}>{rank}위</span>}
      {label}
    </button>
  );
}

// 마우스 오버 시 즉시 뜨는 커스텀 툴팁(브라우저 기본 title은 느리고 눈에 안 띔).
function InfoTip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span style={{
          position: 'absolute', left: 0, top: '100%', marginTop: 6, zIndex: 50,
          background: '#1e293b', color: '#f1f5f9', padding: '8px 12px', borderRadius: 8,
          fontSize: '.78rem', lineHeight: 1.55, width: 280, boxShadow: '0 4px 14px rgba(0,0,0,.22)',
          pointerEvents: 'none', whiteSpace: 'normal',
        }}>{text}</span>
      )}
    </span>
  );
}

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

  // 저장값 로드 전에는 설문 UI를 띄우지 않는다 — 로드 중 입력한 응답 유실 방지.
  const { loaded, applyLoaded } = useFormLoad([curClassId, curSemester]);

  useEffect(() => {
    if (!curClassId) return;
    let cancelled = false;
    fetchPbsSurvey(curClassId, curSemester).then((d) => {
      if (cancelled) return;
      applyLoaded(() => {
        setR(d?.data?.responses ? { ...emptyPbsSurvey(), ...d.data.responses } : emptyPbsSurvey());
      });
    }).catch(() => { if (!cancelled) applyLoaded(); });
    return () => { cancelled = true; };
  }, [curClassId, curSemester, applyLoaded]);

  // 불변 갱신 헬퍼.
  const patch = (partial) => setR((cur) => ({ ...cur, ...partial }));
  const patchArr = (key, idx, value) => setR((cur) => {
    const next = cur[key].slice(); next[idx] = value; return { ...cur, [key]: next };
  });

  // 배열형 순위 문항(q3·q8·q9·q10·q11) 탭 처리.
  const tapRank = (key, idx, max) => {
    const next = toggleRank(r[key], idx, max);
    if (!next) { toast(`최대 ${max}개까지만 선택할 수 있어요. 다른 항목을 먼저 해제하세요.`); return; }
    patch({ [key]: next });
  };

  // Q2 문제행동 순위 탭 처리(행동별 rank 필드).
  const tapQ2Rank = (bkey) => {
    const keys = PBS_BEHAVIORS.map((b) => b.key);
    const next = toggleRank(keys.map((k) => r.q2[k].rank), keys.indexOf(bkey), 5);
    if (!next) { toast('순위는 최대 5개까지만 매길 수 있어요. 다른 행동을 먼저 해제하세요.'); return; }
    const q2 = { ...r.q2 };
    keys.forEach((k, i) => { q2[k] = { ...q2[k], rank: next[i] }; });
    patch({ q2 });
  };

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
      const out = await call(prompt, { tier: 'fast' });
      setAiOut(out || '응답이 비어 있습니다.');
    } catch (e) { toast('AI 요약 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  if (!curClassId) {
    return <div className="card"><div className="card-title">📋 PBS 기초 설문조사</div>
      <p style={{ color: '#64748b' }}>먼저 상단에서 학급을 선택해주세요. 설문은 <strong>반·학기 단위</strong>로 저장됩니다.</p></div>;
  }

  if (!loaded) return <FormLoading label="설문 응답을 불러오는 중…" />;

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }} data-tour="ps-intro">
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
            <Stepper value={r.q1.count} onChange={(v) => patch({ q1: { ...r.q1, count: v } })} max={99} placeholder="명" /></div>
        </div>
      </div>

      {/* Q2 */}
      <div className="card" data-tour="ps-q2">
        <div style={qTitle}>2. 문제행동별 학생 수 + 순위(1~5)</div>
        <p style={qHint}>각 행동을 보이는 <strong>학생 수(명)</strong>를 − / + 로 조절하고, 순위 칸을 <strong>심각한 행동부터 순서대로 탭</strong>하면 1~5위가 자동으로 매겨집니다. 다시 탭하면 해제됩니다.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr><th style={thC}>문제행동</th><th style={thC}>정의</th><th style={{ ...thC, width: 120 }}>학생수</th><th style={{ ...thC, width: 70 }}>순위</th></tr></thead>
            <tbody>
              {PBS_BEHAVIORS.map((b) => (
                <tr key={b.key}>
                  <td style={{ ...tdC, fontWeight: 600, whiteSpace: 'nowrap' }}>{b.label}</td>
                  <td style={{ ...tdC, color: '#64748b', fontSize: '.78rem' }}>{b.def}</td>
                  <td style={{ ...tdC, whiteSpace: 'nowrap' }}><Stepper value={r.q2[b.key].n} onChange={(v) => patch({ q2: { ...r.q2, [b.key]: { ...r.q2[b.key], n: v } } })} max={99} placeholder="명" /></td>
                  <td style={{ ...tdC, textAlign: 'center' }}>
                    <button type="button" onClick={() => tapQ2Rank(b.key)} title="심각한 행동부터 순서대로 탭하면 1~5위가 매겨집니다. 다시 탭하면 해제."
                      style={{
                        width: 48, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: '.8rem',
                        border: `1.5px solid ${r.q2[b.key].rank ? rankColor(r.q2[b.key].rank).border : '#cbd5e1'}`,
                        background: r.q2[b.key].rank ? rankColor(r.q2[b.key].rank).badge : '#fff',
                        color: r.q2[b.key].rank ? '#fff' : '#94a3b8', fontWeight: 700,
                      }}>
                      {r.q2[b.key].rank ? `${r.q2[b.key].rank}위` : '＋'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">기타 문제행동(자유 기술)</label>
          <textarea className="form-textarea" rows={2} placeholder="위 목록에 없는 문제행동이 있으면 구체적으로 적어주세요. (예: 급식 시간에 음식을 뱉음)" value={r.q2etc} onChange={(e) => patch({ q2etc: e.target.value })} /></div>
      </div>

      {/* Q3 */}
      <div className="card" data-tour="ps-q3">
        <div style={qTitle}>3. 문제행동 강도(순위)</div>
        <p style={qHint}>우리 반 문제행동에 <strong>가장 가까운 강도부터 순서대로 탭</strong>하면 1~4위가 자동으로 매겨집니다. 다시 탭하면 해제됩니다.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          {PBS_INTENSITY.map((t, i) => (
            <RankChip key={i} label={t} rank={r.q3[i]} onClick={() => tapRank('q3', i, 4)} />
          ))}
        </div>
      </div>

      {/* Q4 */}
      <div className="card">
        <div style={qTitle}>4. 사용 중재방법(사용여부 + 효과 1~5)</div>
        <p style={qHint}>실제 사용해 본 중재에 <strong>체크</strong>하고, 효과 정도를 <strong>1(효과 없음)~5(매우 효과적)</strong> 중 선택하세요. 중재 이름에 <strong>마우스를 올리면 설명</strong>이 표시됩니다.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr><th style={thC}>중재 내용</th><th style={{ ...thC, width: 60 }}>사용</th><th style={{ ...thC, width: 180 }}>효과(1 없음 ~ 5 매우)</th></tr></thead>
            <tbody>
              {PBS_INTERVENTIONS.map((m, i) => (
                <tr key={i}>
                  <td style={{ ...tdC, cursor: 'help' }}>
                    <InfoTip text={m.desc}>
                      <span style={{ borderBottom: '1px dotted #94a3b8' }}>{m.label}</span>
                      <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: '.72rem' }}>ⓘ</span>
                    </InfoTip>
                  </td>
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
        <p style={qHint}>해당하는 어려움에 <strong>체크</strong>하고, 그 어려움을 해결하는 데 필요한 지원을 오른쪽 칸에 적으세요.</p>
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
        <p style={qHint}><strong>자주 발생하는 장소부터 순서대로 탭</strong>하면 1~5위가 자동으로 매겨집니다. 다시 탭하면 해제됩니다. (최대 5곳)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PBS_PLACES.map((p, i) => (
            <RankChip key={i} label={p} rank={r.q8[i]} onClick={() => tapRank('q8', i, 5)} />
          ))}
        </div>
      </div>

      {/* Q9 */}
      <div className="card">
        <div style={qTitle}>9. 문제행동이 자주 발생하는 시간대(순위 1~5)</div>
        <p style={qHint}><strong>자주 발생하는 시간대부터 순서대로 탭</strong>하면 1~5위가 자동으로 매겨집니다. 다시 탭하면 해제됩니다. (최대 5개)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PBS_TIMES.map((t, i) => (
            <RankChip key={i} label={t} rank={r.q9[i]} onClick={() => tapRank('q9', i, 5)} />
          ))}
        </div>
      </div>

      {/* Q10 */}
      <div className="card" data-tour="ps-q10">
        <div style={qTitle}>10. 학교 규칙(기대행동) 후보 — 꼭 필요한 5가지 순위</div>
        <p style={qHint}>16개 표현 중 <strong>꼭 필요한 것부터 순서대로 탭</strong>하면 1~5위가 자동으로 매겨집니다. 다시 탭하면 해제됩니다. (최대 5개)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PBS_EXPECTED.map((e, i) => (
            <RankChip key={i} label={e} rank={r.q10[i]} onClick={() => tapRank('q10', i, 5)} />
          ))}
        </div>
        <input className="form-input" style={{ marginTop: 8 }} placeholder="기타 더 좋은 표현(자유 기재)" value={r.q10custom} onChange={(e) => patch({ q10custom: e.target.value })} />
      </div>

      {/* Q11 */}
      <div className="card">
        <div style={qTitle}>11. 생활규칙 적용이 필요한 장소(순위 1~3)</div>
        <p style={qHint}>생활규칙(기대행동)을 <strong>우선 적용할 장소부터 순서대로 탭</strong>하면 1~3위가 자동으로 매겨집니다. 다시 탭하면 해제됩니다. (최대 3곳)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PBS_PLACES.map((p, i) => (
            <RankChip key={i} label={p} rank={r.q11[i]} onClick={() => tapRank('q11', i, 3)} />
          ))}
        </div>
      </div>

      {/* Q12 */}
      <div className="card" data-tour="ps-q12">
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
      <div className="card" data-tour="ps-save">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-ok" onClick={onAISummary} disabled={aiBusy}>{aiBusy ? '⏳ 분석 중…' : '✨ AI 실행계획 요약'}</button>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 설문 저장</button>
        </div>
        {(aiOut || aiBusy) && <div style={{ marginTop: 12 }}><PromptResultBlock output={aiOut} busy={aiBusy} /></div>}
      </div>
    </>
  );
}
