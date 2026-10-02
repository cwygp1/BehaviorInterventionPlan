import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveBIP } from '../../lib/api/students';
import { DESIGNS, normalizeDesign, designTitle } from '../../lib/scedDesigns';

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
  const recCount = (curStuData?.mon || []).length;

  function openPicker() { setPick(saved); setOpen(true); }

  async function apply() {
    if (!curStuId || pick === saved) { setOpen(false); return; }
    if (recCount > 0 && !window.confirm(`기록 ${recCount}건은 그대로예요. 그래프 모양과 입력 칸만 바뀌어요.\n설계를 ${designTitle(pick)}(으)로 바꿀까요?`)) return;
    setBusy(true);
    try {
      const res = await saveBIP(curStuId, { design: pick });
      const row = res?.bip || res?.data || {};
      updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), design: row.design || pick, design_since: row.design_since ?? (cur.bip || {}).design_since ?? null, design_cfg: row.design_cfg ?? (cur.bip || {}).design_cfg ?? {} } }));
      toast(`설계: ${designTitle(pick)}(으)로 저장했어요${recCount > 0 ? ' — 결과 평가에서 "현재 설계" 기간으로 새 구간만 볼 수 있어요' : ''}`);
      setOpen(false);
    } catch (e) {
      toast('설계 저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-tour="mon-design" style={{ fontSize: '.84rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--sub)' }}>설계:</span>
        <strong>{designTitle(saved)}</strong>
        {since && !compact && <span style={{ color: 'var(--muted)', fontSize: '.76rem' }}>· {since}부터</span>}
        {!open && <button type="button" className="btn btn-ghost btn-sm" onClick={openPicker} style={{ padding: '2px 10px' }}>바꾸기 ▾</button>}
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
            <button type="button" className="btn btn-pri btn-sm" onClick={apply} disabled={busy || pick === saved}>{busy ? '저장 중…' : '적용'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
