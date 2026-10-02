import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { atdConfig, ATD_COLORS, ATD_MARKERS, ATD_MARKER_GLYPH } from '../../lib/utils/scedChart';

// 교대중재설계 설정 (mds/47 §2-3) — 비교할 조건(교수법) 2~4개 이름, 무중재(통제) 조건, 처음 기초선 구간.
//   저장은 부모(DesignPicker)가 bip design_cfg.ATD로 한다. 취소하면 아무것도 바꾸지 않는다.
//   이름을 바꾸면 이미 그 이름으로 저장된 기록은 그래프에서 '조건 없음'(회색)으로 보이므로 안내 한 줄.
const PRESETS = ['일반 교수', '시각 지원', '모델링', '또래 교수', '촉진 후 용암', '토큰 강화'];

export default function ConditionSettingsModal({ open, onClose, onSave, initial, usedNames = [] }) {
  const base = atdConfig({ ATD: initial });
  const [names, setNames] = useState(['', '']);
  const [control, setControl] = useState(false);
  const [baseline, setBaseline] = useState(true);
  useEffect(() => {
    if (!open) return;
    const b = atdConfig({ ATD: initial });
    const n = b.conditions.map((c) => c.name);
    while (n.length < 2) n.push('');
    setNames(n); setControl(b.control); setBaseline(b.baseline);
  }, [open, initial]);

  const setName = (i, v) => setNames((arr) => arr.map((x, k) => (k === i ? v.slice(0, 50) : x)));
  const add = () => setNames((arr) => (arr.length < 4 ? [...arr, ''] : arr));
  const remove = (i) => {
    const nm = names[i];
    if (nm && usedNames.includes(nm)) { window.alert(`"${nm}" 조건으로 저장된 기록이 있어 지울 수 없어요. 기록을 먼저 다른 조건으로 바꿔 주세요.`); return; }
    setNames((arr) => (arr.length > 2 ? arr.filter((_, k) => k !== i) : arr));
  };
  const clean = names.map((x) => x.trim()).filter(Boolean);
  const dup = new Set(clean).size !== clean.length;
  const renamed = base.conditions.map((c) => c.name).filter((old) => usedNames.includes(old) && !clean.includes(old));
  const ok = clean.length >= 2 && !dup;

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <h3>⚙ 교대중재설계 설정</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        교수법 2~4개를 회기마다 번갈아 쓰면서 어느 쪽이 더 효과 있는지 비교하는 설계예요. 기록할 때 "오늘 쓴 조건"을 고르면 돼요.
      </p>

      <div className="form-group">
        <label className="form-label">비교할 조건 (2~4개)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {names.map((n, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, textAlign: 'center', color: ATD_COLORS[i % ATD_COLORS.length], fontSize: '1rem' }}>{ATD_MARKER_GLYPH[ATD_MARKERS[i % ATD_MARKERS.length]]}</span>
              <input className="form-input" value={n} onChange={(e) => setName(i, e.target.value)} placeholder={`조건 ${i + 1} 이름 (예: ${PRESETS[i] || '교수법'})`} style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i)} disabled={names.length <= 2} title="지우기">✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>자주 쓰는 이름:</span>
          {PRESETS.map((p) => (
            <span key={p} className="qchip" role="button" tabIndex={0} onClick={() => { const i = names.findIndex((x) => !x.trim()); if (i >= 0) setName(i, p); else if (names.length < 4) setNames((arr) => [...arr, p]); }}>{p}</span>
          ))}
          {names.length < 4 && <button type="button" className="btn btn-ghost btn-sm" onClick={add}>+ 조건 추가</button>}
        </div>
        {dup && <div style={{ fontSize: '.76rem', color: 'var(--err)', marginTop: 4 }}>조건 이름이 겹쳐요.</div>}
        {renamed.length > 0 && <div style={{ fontSize: '.76rem', color: '#92400e', marginTop: 4 }}>"{renamed.join(', ')}" 이름으로 저장된 기록이 있어요. 이름을 바꾸면 그 기록은 그래프에서 '조건 없음'(회색)으로 보여요. 기록 목록에서 조건을 다시 붙일 수 있어요.</div>}
      </div>

      <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.86rem' }}>
          <input type="checkbox" checked={control} onChange={(e) => setControl(e.target.checked)} /> 무중재(통제) 조건도 둔다 <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>— 아무 전략도 안 쓴 회기와 비교(회색 ○)</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.86rem' }}>
          <input type="checkbox" checked={baseline} onChange={(e) => setBaseline(e.target.checked)} /> 처음에 기초선(A) 구간을 둔다 <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>— 중재 전 수준을 먼저 모은 뒤 조건 비교 시작</span>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="button" className="btn btn-pri" disabled={!ok} onClick={() => onSave({ conditions: clean.map((name, i) => ({ name, color: ATD_COLORS[i % ATD_COLORS.length], marker: ATD_MARKERS[i % ATD_MARKERS.length] })), control, baseline })}>저장</button>
      </div>
    </Modal>
  );
}
