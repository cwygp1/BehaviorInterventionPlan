import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { METRICS, CC_DEFAULT_CFG, ccConfig } from '../../lib/utils/scedChart';

// 기준변경설계 설정 (mds/47 §2-5) — 기준 지표 · 방향 · 달성 판정(연속 회기·근접 폭) · 표적행동(행동이 여럿일 때).
//   저장은 부모(DesignPicker)가 bip design_cfg.CC로 한다. 취소하면 아무것도 바꾸지 않는다.
const METRIC_OPTS = [['freq', '빈도(회)'], ['dur', '지속 시간(분)'], ['rate', '시간당 발생률'], ['alt_freq', '대체행동 빈도'], ['dbr', '일일 행동 평정(DBR)']];

export default function CriterionSettingsModal({ open, onClose, onSave, initial, behaviors = [] }) {
  const [cfg, setCfg] = useState(ccConfig({ CC: initial }));
  useEffect(() => { if (open) setCfg(ccConfig({ CC: initial })); }, [open, initial]);
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const onMetric = (m) => setCfg((c) => ({ ...c, metric: m, direction: METRICS[m]?.higherIsBetter ? 'up' : 'down' }));
  const dirWord = cfg.direction === 'up' ? '늘리기' : '줄이기';
  const c0 = 10; const band = Math.round(c0 * cfg.nearPct) / 100;
  const example = cfg.direction === 'up' ? `${c0} ~ ${c0 + band}` : `${c0 - band} ~ ${c0}`;

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h3>⚙ 기준변경설계 설정</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        목표 기준을 단계마다 조금씩 바꿔 가며 행동이 따라오는지 보는 설계예요. 기록할 때마다 "현재 기준값"을 적고, 기준을 바꾸면 새 구간이 돼요.
      </p>

      <div className="form-group">
        <label className="form-label">기준으로 삼는 지표</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {METRIC_OPTS.map(([k, l]) => (
            <span key={k} className={'qchip' + (cfg.metric === k ? ' on' : '')} role="button" tabIndex={0} onClick={() => onMetric(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMetric(k); } }}>{l}</span>
          ))}
        </div>
        <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 4 }}>그래프의 기준선·달성 표시는 이 지표를 볼 때만 그려져요.</div>
      </div>

      <div className="form-group">
        <label className="form-label">기준 방향</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className={'qchip' + (cfg.direction === 'down' ? ' on' : '')} role="button" tabIndex={0} onClick={() => set('direction', 'down')}>줄이기 (문제행동)</span>
          <span className={'qchip' + (cfg.direction === 'up' ? ' on' : '')} role="button" tabIndex={0} onClick={() => set('direction', 'up')}>늘리기 (대체행동·평정)</span>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">달성 판정 — 연속 회기</label>
          <input type="number" className="form-input" min="1" max="10" value={cfg.hitRuns} onChange={(e) => set('hitRuns', Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <div className="form-group">
          <label className="form-label">기준 근처 폭 (%)</label>
          <input type="number" className="form-input" min="0" max="100" step="5" value={cfg.nearPct} onChange={(e) => set('nearPct', Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
        </div>
      </div>
      <div style={{ fontSize: '.78rem', color: 'var(--sub)', background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.6 }}>
        예) 기준 {c0}({dirWord})이면 마지막 <strong>{cfg.hitRuns}회기</strong>가 모두 <strong>{example}</strong> 안이면 <strong>✓ 달성</strong>, 모두 그 밖으로 훨씬 {cfg.direction === 'up' ? '넘어가면' : '내려가면'} <strong>△ 과잉 달성</strong>(기준이 행동을 이끈 증거가 아님), 섞이면 <strong>✕ 미달성</strong>이에요.
      </div>

      {behaviors.length > 1 && (
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">표적행동 (행동이 여럿일 때 기준선을 그릴 행동)</label>
          <select className="form-input" value={cfg.behavior || behaviors[0]} onChange={(e) => set('behavior', e.target.value)}>
            {behaviors.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="button" className="btn btn-pri" onClick={() => onSave({ ...CC_DEFAULT_CFG, ...cfg, behavior: cfg.behavior || (behaviors.length > 1 ? behaviors[0] : '') })}>저장</button>
      </div>
    </Modal>
  );
}
