import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiPost, apiPut } from '../../lib/api/client';
import { AI_EDIT_PASSWORD } from '../../lib/api/llm';

// ────────────────────────────────────────────────────────────────────────────
// AI 사용량 · 비용 대시보드 (AISettingsModal 안, 잠금 해제 시 표시)
//
//  1) 선택 기간의 실측 사용량(요청·토큰·활성 사용자, 사용자별 표)
//  2) 예상 가정값(1인 1일 요청 수, 요청당 입·출력 토큰) — 실측으로 자동 시드, 편집 가능
//  3) 사용자 규모별(1/5/30/100명) 월간 예상 토큰
//  4) 모델별 클라우드 전환 예상 비용(USD + KRW) — 사용자 수 × 기간(30/60/90/365일)
//  5) 단가·환율 편집(전체 교체, 관리 비밀번호)
//
//  ※ 현재 실제 API 비용은 로컬 LM Studio라 0원. 여기 비용은 모두 "클라우드로
//     전환하면 얼마?"의 추정치다. 토큰 수는 로컬 모델 토크나이저 기준이라
//     실제 클라우드 토크나이저와 다소 차이가 날 수 있다.
// ────────────────────────────────────────────────────────────────────────────

const PERIOD_OPTS = [7, 14, 30, 60, 90];
const SCALE_OPTS = [1, 5, 30, 100];
const WINDOW_OPTS = [30, 60, 90, 365];

const round2 = (n) => Math.round(n * 100) / 100;
const fmtInt = (n) => Math.round(n || 0).toLocaleString('ko-KR');
const fmtUSD = (n) => {
  const v = n || 0;
  if (v === 0) return '$0';
  const digits = v >= 1 ? 2 : 4;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const fmtKRW = (n) => '₩' + Math.round(n || 0).toLocaleString('ko-KR');

const th = { textAlign: 'left', padding: '6px 8px', color: 'var(--sub)', fontWeight: 700, borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const tdR = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const card = { background: 'var(--surface-2, var(--pri-soft))', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', margin: '0 0 14px' };
const secTitle = { fontWeight: 800, fontSize: '.92rem', margin: '18px 0 8px', color: 'var(--ink)' };

export default function UsageDashboard() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  // 예상 가정값(실측으로 시드, 편집 가능)
  const [assume, setAssume] = useState({ reqPerUserDay: 5, inTokPerReq: 2000, outTokPerReq: 1200 });

  // 비용 시뮬레이션 선택
  const [scaleUsers, setScaleUsers] = useState(30);
  const [windowDays, setWindowDays] = useState(30);

  // 단가·환율 편집
  const [editRows, setEditRows] = useState([]);
  const [editFx, setEditFx] = useState(1380);
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError('');
    try {
      const r = await apiPost('/api/usage/stats', { password: AI_EDIT_PASSWORD, days: d });
      setData(r);
      // 실측으로 가정값 시드
      const t = r.total || {};
      const inPerReq = t.requests > 0 ? t.prompt_tokens / t.requests : 0;
      const outPerReq = t.requests > 0 ? t.completion_tokens / t.requests : 0;
      const reqPerUserDay = t.active_users > 0 && r.days > 0 ? t.requests / t.active_users / r.days : 0;
      setAssume({
        reqPerUserDay: reqPerUserDay > 0 ? round2(reqPerUserDay) : 5,
        inTokPerReq: inPerReq > 0 ? Math.round(inPerReq) : 2000,
        outTokPerReq: outPerReq > 0 ? Math.round(outPerReq) : 1200,
      });
      // 단가 편집기 시드
      setEditRows((r.pricing || []).map((p) => ({ ...p })));
      setEditFx(r.fx || 1380);
    } catch (e) {
      setError(e?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(30); }, [load]);

  function changeDays(d) {
    setDays(d);
    load(d);
  }

  function reseedAssume() {
    if (!data) return;
    const t = data.total || {};
    const inPerReq = t.requests > 0 ? t.prompt_tokens / t.requests : 0;
    const outPerReq = t.requests > 0 ? t.completion_tokens / t.requests : 0;
    const reqPerUserDay = t.active_users > 0 && data.days > 0 ? t.requests / t.active_users / data.days : 0;
    setAssume({
      reqPerUserDay: reqPerUserDay > 0 ? round2(reqPerUserDay) : 5,
      inTokPerReq: inPerReq > 0 ? Math.round(inPerReq) : 2000,
      outTokPerReq: outPerReq > 0 ? Math.round(outPerReq) : 1200,
    });
  }

  const project = useCallback(
    (n, wDays) => {
      const reqs = (assume.reqPerUserDay || 0) * n * wDays;
      const inTok = reqs * (assume.inTokPerReq || 0);
      const outTok = reqs * (assume.outTokPerReq || 0);
      return { reqs, inTok, outTok };
    },
    [assume]
  );

  const fx = data?.fx || editFx || 1380;
  const pricing = data?.pricing || [];

  // 선택된 (사용자 수 × 기간)에 대한 모델별 비용
  const costRows = useMemo(() => {
    const { inTok, outTok } = project(scaleUsers, windowDays);
    return pricing
      .map((p) => {
        const usd = (inTok / 1e6) * p.input_per_mtok + (outTok / 1e6) * p.output_per_mtok;
        return { ...p, usd, krw: usd * fx };
      })
      .sort((a, b) => a.usd - b.usd);
  }, [pricing, project, scaleUsers, windowDays, fx]);

  const maxCost = costRows.length ? costRows[costRows.length - 1].usd : 0;

  async function savePricing() {
    setSaving(true);
    setSaveMsg('');
    try {
      await apiPut('/api/usage/pricing', {
        password: AI_EDIT_PASSWORD,
        rows: editRows.map((r, i) => ({
          provider: r.provider,
          model: r.model,
          input_per_mtok: r.input_per_mtok,
          output_per_mtok: r.output_per_mtok,
          note: r.note || '',
          sort_order: (i + 1) * 10,
        })),
        fx: editFx,
      });
      setSaveMsg('✅ 저장됨');
      await load(days);
    } catch (e) {
      setSaveMsg('❌ ' + (e?.message || '저장 실패'));
    } finally {
      setSaving(false);
    }
  }

  function updateRow(i, key, val) {
    setEditRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  }
  function removeRow(i) {
    setEditRows((rows) => rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setEditRows((rows) => [...rows, { provider: '', model: '', input_per_mtok: 0, output_per_mtok: 0, note: '' }]);
  }

  const t = data?.total;
  const hasData = t && t.requests > 0;
  const measuredInPerReq = hasData ? Math.round(t.prompt_tokens / t.requests) : 0;
  const measuredOutPerReq = hasData ? Math.round(t.completion_tokens / t.requests) : 0;

  const numInput = { width: 90, textAlign: 'right' };

  return (
    <div style={{ fontSize: '.86rem' }}>
      {/* 기간 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ color: 'var(--sub)', fontWeight: 700 }}>기간</span>
        {PERIOD_OPTS.map((d) => (
          <button
            key={d}
            className={'btn btn-sm ' + (days === d ? 'btn-pri' : 'btn-ghost')}
            onClick={() => changeDays(d)}
          >
            최근 {d}일
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => load(days)} style={{ marginLeft: 'auto' }}>
          ↻ 새로고침
        </button>
      </div>

      {loading && <div className="form-hint">불러오는 중…</div>}
      {error && <div style={{ color: 'var(--err)', margin: '8px 0' }}>❌ {error}</div>}

      {data && (
        <>
          {/* 1) 실측 요약 */}
          <div style={secTitle}>📈 실측 사용량 (최근 {data.days}일)</div>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: hasData ? 10 : 0 }}>
              <Metric label="요청 수" value={fmtInt(t.requests)} />
              <Metric label="활성 사용자" value={fmtInt(t.active_users) + '명'} />
              <Metric label="총 토큰" value={fmtInt(t.total_tokens)} />
              <Metric label="입력 토큰" value={fmtInt(t.prompt_tokens)} />
              <Metric label="출력 토큰" value={fmtInt(t.completion_tokens)} />
              <Metric
                label="요청당 평균 토큰"
                value={hasData ? `${fmtInt(measuredInPerReq)} / ${fmtInt(measuredOutPerReq)}` : '—'}
                sub="입력/출력"
              />
            </div>
            {!hasData && (
              <div className="form-hint" style={{ margin: 0 }}>
                아직 이 기간의 사용 기록이 없어요. 아래 <b>예상 가정값</b>을 조정해 시뮬레이션만 볼 수 있습니다.
                (AI 생성 기능을 쓰기 시작하면 실측값이 쌓입니다.)
              </div>
            )}
          </div>

          {/* 사용자별 표 */}
          {hasData && data.perUser?.length > 0 && (
            <>
              <div style={secTitle}>👤 사용자별 사용량 (최근 {data.days}일)</div>
              <div style={{ ...card, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                  <thead>
                    <tr>
                      <th style={th}>사용자</th>
                      <th style={{ ...th, textAlign: 'right' }}>요청</th>
                      <th style={{ ...th, textAlign: 'right' }}>입력</th>
                      <th style={{ ...th, textAlign: 'right' }}>출력</th>
                      <th style={{ ...th, textAlign: 'right' }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perUser.slice(0, 30).map((u, i) => (
                      <tr key={i}>
                        <td style={td} title={u.email}>{u.name || u.email || '(미상)'}</td>
                        <td style={tdR}>{fmtInt(u.requests)}</td>
                        <td style={tdR}>{fmtInt(u.prompt_tokens)}</td>
                        <td style={tdR}>{fmtInt(u.completion_tokens)}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{fmtInt(u.total_tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 2) 예상 가정값 */}
          <div style={secTitle}>⚙ 예상 가정값 <span style={{ fontWeight: 500, color: 'var(--muted)' }}>(실측으로 자동 채움 · 수정 가능)</span></div>
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <AssumeField label="1인 1일 요청 수" value={assume.reqPerUserDay}
                onChange={(v) => setAssume((a) => ({ ...a, reqPerUserDay: v }))} step="0.5" />
              <AssumeField label="요청당 입력 토큰" value={assume.inTokPerReq}
                onChange={(v) => setAssume((a) => ({ ...a, inTokPerReq: v }))} step="100" />
              <AssumeField label="요청당 출력 토큰" value={assume.outTokPerReq}
                onChange={(v) => setAssume((a) => ({ ...a, outTokPerReq: v }))} step="100" />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={reseedAssume} style={{ marginTop: 10 }}>
              실측값으로 초기화
            </button>
          </div>

          {/* 3) 사용자 규모별 월간 예상 토큰 */}
          <div style={secTitle}>👥 사용자 규모별 월간(30일) 예상 토큰</div>
          <div style={{ ...card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>사용자 수</th>
                  <th style={{ ...th, textAlign: 'right' }}>월 요청</th>
                  <th style={{ ...th, textAlign: 'right' }}>월 입력 토큰</th>
                  <th style={{ ...th, textAlign: 'right' }}>월 출력 토큰</th>
                  <th style={{ ...th, textAlign: 'right' }}>월 합계 토큰</th>
                </tr>
              </thead>
              <tbody>
                {SCALE_OPTS.map((n) => {
                  const p = project(n, 30);
                  return (
                    <tr key={n}>
                      <td style={{ ...td, fontWeight: 700 }}>{n}명</td>
                      <td style={tdR}>{fmtInt(p.reqs)}</td>
                      <td style={tdR}>{fmtInt(p.inTok)}</td>
                      <td style={tdR}>{fmtInt(p.outTok)}</td>
                      <td style={{ ...tdR, fontWeight: 700 }}>{fmtInt(p.inTok + p.outTok)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 4) 모델별 클라우드 전환 예상 비용 */}
          <div style={secTitle}>💵 모델별 클라우드 전환 예상 비용</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <label style={{ color: 'var(--sub)' }}>
              사용자{' '}
              <select className="form-input" style={{ width: 'auto', display: 'inline-block' }}
                value={scaleUsers} onChange={(e) => setScaleUsers(Number(e.target.value))}>
                {SCALE_OPTS.map((n) => <option key={n} value={n}>{n}명</option>)}
              </select>
            </label>
            <label style={{ color: 'var(--sub)' }}>
              기간{' '}
              <select className="form-input" style={{ width: 'auto', display: 'inline-block' }}
                value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
                {WINDOW_OPTS.map((d) => <option key={d} value={d}>{d}일{d === 365 ? '(1년)' : ''}</option>)}
              </select>
            </label>
            <span className="form-hint" style={{ margin: 0 }}>
              환율 1 USD = {fmtInt(fx)}원
            </span>
          </div>
          <div style={{ ...card, overflowX: 'auto' }}>
            <div className="form-hint" style={{ margin: '0 0 8px' }}>
              {scaleUsers}명 × {windowDays}일 = 입력 {fmtInt(project(scaleUsers, windowDays).inTok)} · 출력 {fmtInt(project(scaleUsers, windowDays).outTok)} 토큰 기준
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr>
                  <th style={th}>제공자 / 모델</th>
                  <th style={{ ...th, textAlign: 'right' }}>입력 $/1M</th>
                  <th style={{ ...th, textAlign: 'right' }}>출력 $/1M</th>
                  <th style={{ ...th, textAlign: 'right' }}>예상(USD)</th>
                  <th style={{ ...th, textAlign: 'right' }}>예상(KRW)</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map((p, i) => (
                  <tr key={i}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{p.model}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '.76rem' }}>
                        {p.provider}{p.note ? ' · ' + p.note : ''}
                      </div>
                      <div style={{ height: 4, marginTop: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: (maxCost > 0 ? (p.usd / maxCost) * 100 : 0) + '%', background: 'var(--pri)', borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={tdR}>{p.input_per_mtok}</td>
                    <td style={tdR}>{p.output_per_mtok}</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{fmtUSD(p.usd)}</td>
                    <td style={tdR}>{fmtKRW(p.krw)}</td>
                  </tr>
                ))}
                {costRows.length === 0 && (
                  <tr><td style={td} colSpan={5}>등록된 단가가 없습니다. 아래에서 추가하세요.</td></tr>
                )}
              </tbody>
            </table>
            <div className="form-hint" style={{ margin: '8px 0 0' }}>
              ※ 실제 API 비용은 로컬 LM Studio라 <b>현재 0원</b>입니다. 위 값은 “클라우드로 바꾸면 얼마?”의 추정치이며,
              토큰 수는 로컬 모델 기준이라 실제 클라우드와 차이가 날 수 있습니다.
            </div>
          </div>

          {/* 5) 단가·환율 편집 */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '.9rem', color: 'var(--pri-d)' }}>
              ✏ 단가 · 환율 편집
            </summary>
            <div style={{ ...card, overflowX: 'auto', marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color: 'var(--sub)', fontWeight: 700 }}>환율 (1 USD =</span>
                <input className="form-input" type="number" min="1" step="10" style={{ width: 110 }}
                  value={editFx} onChange={(e) => setEditFx(Number(e.target.value))} />
                <span style={{ color: 'var(--sub)', fontWeight: 700 }}>원)</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th style={th}>제공자</th>
                    <th style={th}>모델</th>
                    <th style={{ ...th, textAlign: 'right' }}>입력$/1M</th>
                    <th style={{ ...th, textAlign: 'right' }}>출력$/1M</th>
                    <th style={th}>비고</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((r, i) => (
                    <tr key={i}>
                      <td style={td}><input className="form-input" style={{ width: 90 }} value={r.provider} onChange={(e) => updateRow(i, 'provider', e.target.value)} /></td>
                      <td style={td}><input className="form-input" style={{ width: 150 }} value={r.model} onChange={(e) => updateRow(i, 'model', e.target.value)} /></td>
                      <td style={tdR}><input className="form-input" type="number" step="0.01" min="0" style={numInput} value={r.input_per_mtok} onChange={(e) => updateRow(i, 'input_per_mtok', Number(e.target.value))} /></td>
                      <td style={tdR}><input className="form-input" type="number" step="0.01" min="0" style={numInput} value={r.output_per_mtok} onChange={(e) => updateRow(i, 'output_per_mtok', Number(e.target.value))} /></td>
                      <td style={td}><input className="form-input" style={{ width: 110 }} value={r.note || ''} onChange={(e) => updateRow(i, 'note', e.target.value)} /></td>
                      <td style={td}><button className="btn btn-ghost btn-sm" style={{ color: 'var(--err)' }} onClick={() => removeRow(i)}>삭제</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={addRow}>+ 행 추가</button>
                <button className="btn btn-pri btn-sm" onClick={savePricing} disabled={saving}>
                  {saving ? '저장 중…' : '💾 단가·환율 저장'}
                </button>
                {saveMsg && <span style={{ fontSize: '.82rem' }}>{saveMsg}</span>}
              </div>
              <div className="form-hint" style={{ marginTop: 8 }}>
                단가는 시간이 지나면 바뀝니다. 각 제공자 공식 가격 페이지를 확인해 최신값으로 갱신하세요. (USD / 100만 토큰 기준)
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div>
      <div style={{ color: 'var(--sub)', fontSize: '.76rem' }}>{label}{sub ? ` (${sub})` : ''}</div>
      <div style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

function AssumeField({ label, value, onChange, step }) {
  return (
    <div>
      <div style={{ color: 'var(--sub)', fontSize: '.76rem', marginBottom: 4 }}>{label}</div>
      <input
        className="form-input"
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
