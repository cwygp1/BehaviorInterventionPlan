import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveBIP } from '../../lib/api/students';
import { DESIGNS, normalizeDesign, designTitle } from '../../lib/scedDesigns';
import CriterionSettingsModal from '../modals/CriterionSettingsModal';
import ConditionSettingsModal from '../modals/ConditionSettingsModal';
import MblSettingsModal from '../modals/MblSettingsModal';

// 단일대상설계 고르기 (mds/47 ① · §2-1) — 평소엔 "설계: AB (바꾸기)" 한 줄, 바꾸기를 눌러야 선택지가 펼쳐진다.
//   매일 누르는 단계 탭 옆에 같은 모양 칩을 두면 잘못 눌러 학생 설정이 바뀌므로(검토 §11-2) 접어 둔다.
//   적용을 눌러야 BIP에 저장되고, 기록이 있는 학생은 확인 한 번. 서버가 설계가 바뀔 때 design_since를 찍는다.
//   기준변경·교대중재·중다기초선은 ②~④에서 열린다(지금은 '준비 중').
export default function DesignPicker({ compact = false }) {
  const { curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const saved = normalizeDesign(curStuData?.bip?.design);
  const since = curStuData?.bip?.design_since || null;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [ccOpen, setCcOpen] = useState(false); // 기준변경 설정 모달(②) — 고를 때 바로, 저장 뒤엔 ⚙로
  const [atdOpen, setAtdOpen] = useState(false); // 교대중재 조건 설정 모달(③)
  const [mblOpen, setMblOpen] = useState(false); // 중다기초선 설정 모달(④)
  const usedTiers = [...new Set((curStuData?.mon || []).map((r) => String(r.tier || '').trim()).filter(Boolean))];
  const usedConditions = [...new Set((curStuData?.mon || []).map((r) => String(r.condition || '').trim()).filter(Boolean))];
  const recCount = (curStuData?.mon || []).length;
  const designCfg = (curStuData?.bip?.design_cfg && typeof curStuData.bip.design_cfg === 'object') ? curStuData.bip.design_cfg : {};
  const behaviors = [...new Set((curStuData?.mon || []).map((r) => (r.beh || '').trim()).filter(Boolean))];

  function openPicker() { setPick(saved); setOpen(true); }

  // 실제 저장 — design(바뀔 때만)과 설계별 설정을 함께. 서버가 설계가 바뀌면 design_since를 찍는다.
  async function persist(nextDesign, cfgPatch) {
    setBusy(true);
    try {
      const body = {};
      if (nextDesign && nextDesign !== saved) body.design = nextDesign;
      if (cfgPatch) body.design_cfg = { ...designCfg, ...cfgPatch };
      const res = await saveBIP(curStuId, body);
      const row = res?.bip || res?.data || {};
      updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), design: row.design || nextDesign || saved, design_since: row.design_since ?? (cur.bip || {}).design_since ?? null, design_cfg: row.design_cfg ?? body.design_cfg ?? (cur.bip || {}).design_cfg ?? {} } }));
      const changed = nextDesign && nextDesign !== saved;
      toast(changed ? `설계: ${designTitle(nextDesign)}(으)로 저장했어요${recCount > 0 ? ' — 결과 평가에서 "현재 설계" 기간으로 새 구간만 볼 수 있어요' : ''}` : '설정을 저장했어요');
      setOpen(false); setCcOpen(false); setAtdOpen(false); setMblOpen(false);
    } catch (e) {
      toast('설계 저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!curStuId || pick === saved) { setOpen(false); return; }
    if (recCount > 0 && !window.confirm(`기록 ${recCount}건은 그대로예요. 그래프 모양과 입력 칸만 바뀌어요.\n설계를 ${designTitle(pick)}(으)로 바꿀까요?`)) return;
    // 설정이 필요한 설계(기준변경)는 설정 모달을 먼저 — 취소하면 이전 설계 그대로(저장 안 함).
    if (DESIGNS.find((d) => d.code === pick)?.needsSetup) { if (pick === 'ATD') setAtdOpen(true); else if (pick === 'MBL') setMblOpen(true); else setCcOpen(true); return; }
    await persist(pick, null);
  }

  return (
    <div data-tour="mon-design" style={{ fontSize: '.84rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--sub)' }}>설계:</span>
        <strong>{designTitle(saved)}</strong>
        {since && !compact && <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>· {since}부터</span>}
        {!open && <button type="button" className="btn btn-ghost btn-sm" onClick={openPicker} style={{ padding: '2px 10px' }}>바꾸기 ▾</button>}
        {!open && saved === 'CC' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPick('CC'); setCcOpen(true); }} style={{ padding: '2px 10px' }} title="기준 지표·방향·달성 판정">⚙ 설정</button>}
        {!open && saved === 'ATD' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPick('ATD'); setAtdOpen(true); }} style={{ padding: '2px 10px' }} title="비교할 조건·무중재·기초선">⚙ 조건 설정</button>}
        {!open && saved === 'MBL' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPick('MBL'); setMblOpen(true); }} style={{ padding: '2px 10px' }} title="무엇 간인지·층 이름">⚙ 층 설정</button>}
        <span style={{ color: 'var(--muted)', fontSize: '.76rem' }} title={designTitle(saved) + ' — ' + (DESIGNS.find((d) => d.code === saved)?.desc || '')}>ⓘ {DESIGNS.find((d) => d.code === saved)?.desc}</span>
      </div>
      {open && (
        <div role="radiogroup" aria-label="단일대상설계 고르기" style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DESIGNS.map((d) => {
            const on = pick === d.code;
            return (
              <label key={d.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: d.ready ? 'pointer' : 'not-allowed', opacity: d.ready ? 1 : 0.55 }}>
                <input type="radio" name="sced-design" value={d.code} checked={on} disabled={!d.ready} onChange={() => setPick(d.code)} style={{ marginTop: 3 }} />
                <span>
                  <strong>{d.label}</strong> <span style={{ color: 'var(--sub)' }}>({d.paren})</span>
                  {!d.ready && <span style={{ marginLeft: 6, fontSize: '.68rem', padding: '1px 6px', borderRadius: 99, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>준비 중</span>}
                  <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{d.desc}</div>
                </span>
              </label>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>취소</button>
            <button type="button" className="btn btn-pri btn-sm" onClick={apply} disabled={busy || pick === saved}>{busy ? '저장 중…' : (DESIGNS.find((d) => d.code === pick)?.needsSetup && pick !== saved ? '다음: 설정 →' : '적용')}</button>
          </div>
        </div>
      )}
      <MblSettingsModal
        open={mblOpen}
        onClose={() => setMblOpen(false)}
        initial={designCfg.MBL}
        behaviors={behaviors}
        usedTiers={usedTiers}
        onSave={(mbl) => persist(pick === 'MBL' ? 'MBL' : saved, { MBL: mbl })}
      />
      <ConditionSettingsModal
        open={atdOpen}
        onClose={() => setAtdOpen(false)}
        initial={designCfg.ATD}
        usedNames={usedConditions}
        onSave={(atd) => persist(pick === 'ATD' ? 'ATD' : saved, { ATD: atd })}
      />
      <CriterionSettingsModal
        open={ccOpen}
        onClose={() => setCcOpen(false)}
        initial={designCfg.CC}
        behaviors={behaviors}
        onSave={(cc) => persist(pick === 'CC' ? 'CC' : saved, { CC: cc })}
      />
    </div>
  );
}
