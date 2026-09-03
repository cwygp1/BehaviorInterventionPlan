import { useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchSchoolRules, saveSchoolRules } from '../../lib/api/students';
import useFormLoad, { FormLoading } from '../../lib/hooks/useFormLoad';
import { useAutoSaveBody } from '../../lib/hooks/useAutoSave';
import {
  SERIOUS_DEF_SOURCE, SERIOUS_DEF_LINES, MINOR_DEF, MINOR_BEHAVIORS,
  TIME_HINT, PLACE_HINT, ACTIVITIES, CHANGE_HINT_LINES,
  emptySchoolRules, emptySeriousRow, emptyChangeRow, normalizeSchoolRules,
} from '../../lib/schoolRulesSurvey';

// 학교 규칙 수립을 위한 조사서 (Tier 1) — 반·학기 단위 저장.
// 문항·안내문은 lib/schoolRulesSurvey.js의 원문을 그대로 쓴다(임의 수정 금지).
const qTitle = { fontWeight: 700, color: '#1f3a8a', marginBottom: 8, fontSize: '.98rem' };
const qHint = { fontSize: '.82rem', color: '#64748b', marginTop: -4, marginBottom: 10, lineHeight: 1.55 };
const tdC = { border: '1px solid #e2e8f0', padding: '6px 8px', verticalAlign: 'middle' };
const thC = { border: '1px solid #cbd5e1', padding: '6px 8px', background: '#f1f5f9', fontWeight: 700, fontSize: '.82rem' };
const noteBox = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '10px 12px', fontSize: '.82rem', color: '#475569', lineHeight: 1.6, marginBottom: 12,
};

// 1~6 발생 가능성 — 낮음(1)에서 높음(6)으로 갈수록 붉어진다.
const LEVEL_COLORS = ['#94a3b8', '#38bdf8', '#22c55e', '#eab308', '#f97316', '#dc2626'];

export default function SchoolRulesPage() {
  const toast = useToast();
  const { curYear, curSemester, curClassId, curClass } = useStudents();

  const [r, setR] = useState(emptySchoolRules());
  const [busy, setBusy] = useState(false);
  // 저장값 로드 전에는 입력 UI를 띄우지 않는다 — 로드 중 입력한 응답 유실 방지.
  const { loaded, applyLoaded } = useFormLoad([curClassId, curSemester]);

  useEffect(() => {
    if (!curClassId) return;
    let cancelled = false;
    fetchSchoolRules(curClassId, curSemester).then((d) => {
      if (cancelled) return;
      applyLoaded(() => {
        setR(normalizeSchoolRules(d?.data?.responses || null));
      });
    }).catch(() => { if (!cancelled) applyLoaded(); });
    return () => { cancelled = true; };
  }, [curClassId, curSemester, applyLoaded]);

  const patch = (partial) => setR((cur) => ({ ...cur, ...partial }));
  // 배열 안 객체 한 칸만 바꾸는 불변 갱신.
  const patchRow = (key, idx, partial) => setR((cur) => ({
    ...cur,
    [key]: cur[key].map((row, i) => (i === idx ? { ...row, ...partial } : row)),
  }));

  const { dirty } = useAutoSaveBody({
    enabled: loaded && !!curClassId,
    body: r,
    save: () => saveSchoolRules({ class_id: curClassId, semester: curSemester, responses: r }),
  });

  async function onSave() {
    if (!curClassId) { toast('먼저 학급을 선택해주세요.'); return; }
    setBusy(true);
    try {
      await saveSchoolRules({ class_id: curClassId, semester: curSemester, responses: r });
      toast('학교 규칙 조사서 저장 완료');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  if (!curClassId) {
    return (
      <div className="card">
        <div className="card-title">📝 학교 규칙 수립을 위한 조사서</div>
        <p style={{ color: '#64748b' }}>먼저 상단에서 학급을 선택해주세요. 조사서는 <strong>반·학기 단위</strong>로 저장됩니다.</p>
      </div>
    );
  }

  if (!loaded) return <FormLoading label="조사서를 불러오는 중…" />;

  const saveBtn = (label) => (
    <button
      className={'btn ' + (dirty ? 'btn-pri' : 'btn-ghost')}
      onClick={onSave}
      disabled={busy || !dirty}
      title={dirty ? '지금 바로 저장' : '변경 내용이 모두 자동 저장되었습니다'}
    >
      {busy ? '저장 중…' : (dirty ? label : '✓ 저장됨')}
    </button>
  );

  return (
    <>
      <div className="card" style={{ background: 'linear-gradient(135deg,#eef4ff 0%,#e6eeff 100%)', borderColor: '#b9cdf0' }} data-tour="sr-intro">
        <div className="card-title" style={{ marginBottom: 4 }}>📝 학교 규칙 수립을 위한 조사서</div>
        <p style={{ fontSize: '.9rem', color: '#274690', margin: 0, lineHeight: 1.6 }}>
          학생 문제행동 실태와 발생 시간·장소를 파악해 <strong>학교(학급) 규칙 수립</strong>의 근거로 삼는 기초조사입니다.
          현재 <strong>{curYear}학년도 {curSemester}학기 · {curClass?.name || '학급'}</strong> 기준으로 저장됩니다.
        </p>
      </div>

      {/* 1. 학생들의 문제행동에 대한 기초 조사 */}
      <div className="card" data-tour="sr-q1">
        <div style={qTitle}>1. 학생들의 문제행동에 대한 기초 조사</div>
        <p style={qHint}>
          · 심각한 문제행동을 보이는 학생 이름, 행동 특성(강도, 빈도, 지속시간 고려)<br />
          · 사소한 문제행동들
        </p>
        <p style={{ fontSize: '.86rem', color: '#334155', marginBottom: 10 }}>
          아래의 정의를 참고로 담당 학생 중 심각한 문제행동을 보이는 학생 이름과 행동 특성을 기입해 주세요.
        </p>

        <div style={noteBox}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>*{SERIOUS_DEF_SOURCE}</div>
          {SERIOUS_DEF_LINES.map((line, i) => (
            <div key={i} style={{ marginBottom: 4 }}>: {line}</div>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr><th style={{ ...thC, width: 160 }}>이름</th><th style={thC}>행동 특성</th></tr></thead>
            <tbody>
              {r.serious.map((row, i) => (
                <tr key={i}>
                  <td style={tdC}>
                    <input className="form-input" value={row.name} placeholder="학생 이름(또는 비식별 코드)"
                      onChange={(e) => patchRow('serious', i, { name: e.target.value })} />
                  </td>
                  <td style={tdC}>
                    <textarea className="form-textarea" rows={2} value={row.trait}
                      placeholder="행동 특성 (강도, 빈도, 지속시간을 고려해 기술)"
                      onChange={(e) => patchRow('serious', i, { trait: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => patch({ serious: [...r.serious, emptySeriousRow()] })}>+ 행 추가</button>

        <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '18px 0 14px' }} />

        <p style={{ fontSize: '.86rem', color: '#334155', marginBottom: 10 }}>
          아래의 행동을 담당 학생들이 보일 경우 관련 행동에 모두 ○표시 해 주시고, 이를 문제행동이라고 생각하시는지에 따라 ○, X 로 표시해 주세요.
        </p>
        <div style={noteBox}>{MINOR_DEF}</div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr>
              <th style={thC}>행동</th>
              <th style={{ ...thC, width: 90 }}>발생 여부</th>
              <th style={{ ...thC, width: 140 }}>문제행동 여부(○ / X)</th>
            </tr></thead>
            <tbody>
              {MINOR_BEHAVIORS.map((b, i) => (
                <tr key={b.label}>
                  <td style={tdC}>
                    {b.custom ? (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>기타<span style={{ color: '#64748b', fontWeight: 400, fontSize: '.78rem' }}> ({b.desc})</span></div>
                        <input className="form-input" value={r.minor[i]?.label || ''} placeholder="행동명을 직접 입력"
                          onChange={(e) => patchRow('minor', i, { label: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 600 }}>{b.label}</span>
                        {b.desc && <span style={{ color: '#64748b', fontSize: '.78rem' }}> ({b.desc})</span>}
                      </>
                    )}
                  </td>
                  <td style={{ ...tdC, textAlign: 'center' }}>
                    <button type="button" title="발생하면 ○"
                      onClick={() => patchRow('minor', i, { occurs: !r.minor[i]?.occurs })}
                      style={{
                        width: 40, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
                        border: `1.5px solid ${r.minor[i]?.occurs ? '#2563eb' : '#cbd5e1'}`,
                        background: r.minor[i]?.occurs ? '#eff6ff' : '#fff',
                        color: r.minor[i]?.occurs ? '#1d4ed8' : '#cbd5e1',
                      }}>○</button>
                  </td>
                  <td style={{ ...tdC, textAlign: 'center' }}>
                    {['○', 'X'].map((mark) => {
                      const on = r.minor[i]?.problem === mark;
                      const c = mark === '○' ? '#16a34a' : '#dc2626';
                      return (
                        <button key={mark} type="button" title={on ? '다시 누르면 해제' : `${mark} 선택`}
                          onClick={() => patchRow('minor', i, { problem: on ? '' : mark })}
                          style={{
                            width: 40, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
                            marginRight: 6, border: `1.5px solid ${on ? c : '#cbd5e1'}`,
                            background: on ? c : '#fff', color: on ? '#fff' : '#94a3b8',
                          }}>{mark}</button>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. 문제행동이 자주 일어나는 시간과 장소 확인 */}
      <div className="card" data-tour="sr-q2">
        <div style={qTitle}>2. 문제행동이 자주 일어나는 시간과 장소 확인</div>
        <p style={qHint}>
          · 시간: {TIME_HINT}<br />
          · 장소: {PLACE_HINT}
        </p>
        <p style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 10 }}>
          각 활동에서 문제행동이 일어날 가능성을 <strong>1(낮음) ~ 6(높음)</strong> 중 고르고, 오른쪽에 순위를 적어주세요.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr>
              <th style={thC}>활동</th>
              <th style={{ ...thC, width: 260 }}>문제행동 발생 가능성<div style={{ fontWeight: 400, fontSize: '.72rem', color: '#64748b' }}>1 = 낮음 / 6 = 높음</div></th>
              <th style={{ ...thC, width: 80 }}>순위</th>
            </tr></thead>
            <tbody>
              {ACTIVITIES.map((a, i) => (
                <tr key={a}>
                  <td style={{ ...tdC, fontWeight: 600 }}>{i + 1}. {a}</td>
                  <td style={{ ...tdC, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {[1, 2, 3, 4, 5, 6].map((n) => {
                      const on = Number(r.activities[i]?.level) === n;
                      const c = LEVEL_COLORS[n - 1];
                      return (
                        <button key={n} type="button" title={on ? '다시 누르면 해제' : `${n}점`}
                          onClick={() => patchRow('activities', i, { level: on ? '' : String(n) })}
                          style={{
                            width: 34, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: '.85rem', fontWeight: 700,
                            marginRight: 4, border: `1.5px solid ${on ? c : '#cbd5e1'}`,
                            background: on ? c : '#fff', color: on ? '#fff' : '#94a3b8',
                          }}>{n}</button>
                      );
                    })}
                  </td>
                  <td style={{ ...tdC, textAlign: 'center' }}>
                    <input className="form-input" style={{ width: 60, textAlign: 'center' }} inputMode="numeric"
                      value={r.activities[i]?.rank || ''} placeholder="위"
                      onChange={(e) => patchRow('activities', i, { rank: e.target.value.replace(/[^0-9]/g, '') })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. 문제행동이 자주 일어나지 않는 시간과 장소 확인 */}
      <div className="card" data-tour="sr-q3">
        <div style={qTitle}>3. 문제행동이 자주 일어나지 않는 시간과 장소 확인 (순위에 따라 1위에서 3위까지)</div>
        <p style={qHint}>관련 요인은 무엇일까? <span style={{ color: '#94a3b8' }}>(예) 교사들의 적극적인 감독</span></p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
            <thead><tr>
              <th style={{ ...thC, width: 70 }}>순위</th>
              <th style={{ ...thC, width: '35%' }}>시간 · 장소</th>
              <th style={thC}>관련 요인</th>
            </tr></thead>
            <tbody>
              {r.calm.map((row, i) => (
                <tr key={i}>
                  <td style={{ ...tdC, textAlign: 'center', fontWeight: 700, color: '#1f3a8a' }}>{i + 1}위</td>
                  <td style={tdC}>
                    <input className="form-input" value={row.place} placeholder="예: 점심시간(식당)"
                      onChange={(e) => patchRow('calm', i, { place: e.target.value })} />
                  </td>
                  <td style={tdC}>
                    <input className="form-input" value={row.factor} placeholder="예: 교사들의 적극적인 감독"
                      onChange={(e) => patchRow('calm', i, { factor: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. 지도할 때 가장 어려운 점 */}
      <div className="card">
        <div style={qTitle}>4. 문제행동을 지도할 때 가장 어려운 점은 무엇인가?</div>
        <p style={qHint}>추후 교사 연수 기초 자료로 활용</p>
        <textarea className="form-textarea" rows={4} value={r.hardest}
          placeholder="자유롭게 기술해 주세요."
          onChange={(e) => patch({ hardest: e.target.value })} />
      </div>

      {/* 5. 어떤 변화가 필요할까? */}
      <div className="card" data-tour="sr-q5">
        <div style={qTitle}>5. 어떤 변화가 필요할까?</div>
        <div className="form-group">
          <label className="form-label">문제행동이 자주 일어나는 시간과 장소는 어떤 공통점이 있을까?</label>
          <textarea className="form-textarea" rows={3} value={r.common}
            onChange={(e) => patch({ common: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">문제행동을 예방하고 감소시키기 위해 필요한 변화는 무엇인가?</label>
          <div style={noteBox}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>* 다음의 측면에서 자유롭게 기술</div>
            {CHANGE_HINT_LINES.map((l) => <div key={l}>- {l}</div>)}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.85rem' }}>
              <thead><tr>
                <th style={thC}>문제행동을 예방하고 감소시키기 위해 필요한 변화</th>
                <th style={{ ...thC, width: 90 }}>우선순위</th>
                <th style={{ ...thC, width: 150 }}>실현 가능성을 고려한 순위</th>
              </tr></thead>
              <tbody>
                {r.changes.map((row, i) => (
                  <tr key={i}>
                    <td style={tdC}>
                      <textarea className="form-textarea" rows={2} value={row.change}
                        onChange={(e) => patchRow('changes', i, { change: e.target.value })} />
                    </td>
                    <td style={{ ...tdC, textAlign: 'center' }}>
                      <input className="form-input" style={{ width: 62, textAlign: 'center' }} inputMode="numeric"
                        value={row.priority} onChange={(e) => patchRow('changes', i, { priority: e.target.value.replace(/[^0-9]/g, '') })} />
                    </td>
                    <td style={{ ...tdC, textAlign: 'center' }}>
                      <input className="form-input" style={{ width: 62, textAlign: 'center' }} inputMode="numeric"
                        value={row.feasible} onChange={(e) => patchRow('changes', i, { feasible: e.target.value.replace(/[^0-9]/g, '') })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
            onClick={() => patch({ changes: [...r.changes, emptyChangeRow()] })}>+ 행 추가</button>
        </div>
      </div>

      <div className="card" data-tour="sr-save">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{saveBtn('💾 조사서 저장')}</div>
      </div>
    </>
  );
}
