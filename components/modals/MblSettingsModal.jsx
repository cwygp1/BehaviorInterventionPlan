import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { mblConfig, MBL_DIMENSIONS, MBL_TIER_PRESETS, MBL_COLORS } from '../../lib/utils/scedChart';

// 중다기초선설계 설정 (mds/47 §2-4) — 무엇 간인지(행동/상황/사람) 하나, 상황·사람 간이면 표적행동 1개 + 층 이름 2~4개.
//   사람 간은 비식별 구멍(§12-1): 층 이름을 역할로 적게 기본 칩과 안내를 둔다.
//   저장은 부모(DesignPicker)가 bip design_cfg.MBL로 한다. 취소하면 아무것도 바꾸지 않는다.
const looksLikeName = (s) => /(선생님|쌤|님)$/.test(String(s || '').trim());

export default function MblSettingsModal({ open, onClose, onSave, initial, behaviors = [], usedTiers = [] }) {
  const [dimension, setDimension] = useState('behavior');
  const [behavior, setBehavior] = useState('');
  const [names, setNames] = useState(['', '']);
  useEffect(() => {
    if (!open) return;
    const c = mblConfig({ MBL: initial });
    setDimension(c.dimension); setBehavior(c.behavior);
    const n = c.tiers.map((t) => t.name); while (n.length < 2) n.push('');
    setNames(n);
  }, [open, initial]);

  const presets = MBL_TIER_PRESETS[dimension] || [];
  const setName = (i, v) => setNames((arr) => arr.map((x, k) => (k === i ? v.slice(0, 50) : x)));
  const remove = (i) => {
    const nm = names[i];
    if (nm && usedTiers.includes(nm)) { window.alert(`"${nm}" 층으로 저장된 기록이 있어 지울 수 없어요.`); return; }
    setNames((arr) => (arr.length > 2 ? arr.filter((_, k) => k !== i) : arr));
  };
  const clean = names.map((x) => x.trim()).filter(Boolean);
  const dup = new Set(clean).size !== clean.length;
  const nameWarn = dimension === 'person' && clean.some(looksLikeName);
  const ok = dimension === 'behavior' || (clean.length >= 2 && !dup);

  return (
    <Modal open={open} onClose={onClose} maxWidth={580}>
      <h3>⚙ 중다기초선설계 설정</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        층(행동·상황·사람)마다 중재 시작 시점을 다르게 두고, 중재를 시작한 층만 변하는지 보는 설계예요. 한 번에 한 가지 기준으로만 층을 나눠요.
      </p>

      <div className="form-group">
        <label className="form-label">무엇 간인가요?</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(MBL_DIMENSIONS).map(([k, l]) => (
            <span key={k} className={'qchip' + (dimension === k ? ' on' : '')} role="button" tabIndex={0} onClick={() => setDimension(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDimension(k); } }}>{l}</span>
          ))}
        </div>
        <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 4 }}>
          {dimension === 'behavior' ? '행동 간: 기록의 "대상 행동" 이름이 층이 돼요. 행동 2~4개를 각각 적으면서 중재 시작일을 다르게 두세요.' : dimension === 'setting' ? '상황 간: 같은 행동을 장소·수업마다 따로 기록해요.' : '사람 간: 같은 행동을 지도하는 사람마다 따로 기록해요.'}
        </div>
      </div>

      {dimension !== 'behavior' && (
        <>
          {behaviors.length > 1 && (
            <div className="form-group">
              <label className="form-label">표적행동 (행동이 여럿일 때 패널을 그릴 행동 1개)</label>
              <select className="form-input" value={behavior || behaviors[0]} onChange={(e) => setBehavior(e.target.value)}>
                {behaviors.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">층 이름 (2~4개)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {names.map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: MBL_COLORS[i % MBL_COLORS.length], flexShrink: 0 }} />
                  <input className="form-input" value={n} onChange={(e) => setName(i, e.target.value)} placeholder={`층 ${i + 1} (예: ${presets[i] || ''})`} style={{ flex: 1 }} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} disabled={names.length <= 2} title="지우기">✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{dimension === 'person' ? '역할 칩:' : '자주 쓰는 이름:'}</span>
              {presets.map((p) => (
                <span key={p} className="qchip" role="button" tabIndex={0} onClick={() => { const i = names.findIndex((x) => !x.trim()); if (i >= 0) setName(i, p); else if (names.length < 4) setNames((arr) => [...arr, p]); }}>{p}</span>
              ))}
              {names.length < 4 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNames((arr) => [...arr, ''])}>+ 층 추가</button>}
            </div>
            {dimension === 'person' && (
              <div style={{ fontSize: '.76rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', marginTop: 8 }}>
                🔒 <strong>이름 대신 역할로 적어 주세요.</strong> 층 이름은 그래프·AI 분석·보고서에 그대로 들어가요. (예: 담임 · 보조인력 · 통합학급 교사)
                {nameWarn && <div style={{ marginTop: 4, color: 'var(--err)' }}>"선생님·님"으로 끝나는 이름이 있어요. 실명이 아닌지 확인해 주세요.</div>}
              </div>
            )}
            {dup && <div style={{ fontSize: '.76rem', color: 'var(--err)', marginTop: 4 }}>층 이름이 겹쳐요.</div>}
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="button" className="btn btn-pri" disabled={!ok} onClick={() => onSave({ dimension, behavior: dimension === 'behavior' ? '' : (behavior || (behaviors.length > 1 ? behaviors[0] : '')), tiers: dimension === 'behavior' ? [] : clean.map((name, i) => ({ name, color: MBL_COLORS[i % MBL_COLORS.length] })) })}>저장</button>
      </div>
    </Modal>
  );
}
