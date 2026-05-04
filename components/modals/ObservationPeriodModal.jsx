import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { createPeriod, fetchPeriods } from '../../lib/api/students';

const TIERS = [
  { v: 'baseline', label: '기초선 (Baseline)', icon: '📍', color: '#ef476f', bg: '#fde7e8', desc: '중재 시작 전 행동의 자연스러운 발생 빈도를 측정' },
  { v: 'tier1', label: 'Tier 1 — 보편적 지원', icon: '🏫', color: '#0a7d4e', bg: '#e7f7ee', desc: '학급 차원 PBS 적용 (전체 학생 대상)' },
  { v: 'tier2', label: 'Tier 2 — 소그룹 지원', icon: '👥', color: '#a76200', bg: '#fff7e6', desc: 'CICO·DPR 같은 표준 중재 (10~15% 학생)' },
  { v: 'tier3', label: 'Tier 3 — 개별 맞춤형', icon: '🎯', color: '#9c36b5', bg: '#f3e7fb', desc: 'BIP 기반 개별화 중재 (1~5% 학생)' },
];

export default function ObservationPeriodModal({ open, onClose }) {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [tier, setTier] = useState('baseline');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const periods = curStuData?.periods || [];
  const activePeriod = periods.find((p) => !p.end_date);

  useEffect(() => {
    if (open) {
      setTier('baseline');
      setStartDate(new Date().toISOString().slice(0, 10));
      setNote('');
    }
  }, [open]);

  async function onStart() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const res = await createPeriod(curStuId, { tier, start_date: startDate, note });
      // Reload all periods (server auto-closes the previously open one)
      const reloaded = await fetchPeriods(curStuId);
      updateStudentData(curStuId, (cur) => ({ ...cur, periods: reloaded.records }));
      const tierLabel = TIERS.find((t) => t.v === tier)?.label || tier;
      toast(`${tierLabel} 시작됨 (${startDate})`);
      onClose();
    } catch (e) { toast('시작 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={600}>
      <h3>📍 새 관찰 기간 시작</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        새 Tier를 시작하면 현재 진행 중인 관찰 기간은 자동으로 어제 날짜로 종료됩니다.
        결과 평가 차트의 Phase 전환선이 이 시점을 기준으로 그려집니다.
      </p>

      {activePeriod && (
        <div style={{ background: '#fff7e6', border: '1px solid #f3c47b', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: '.78rem', color: '#a76200', fontWeight: 700, marginBottom: 4 }}>⚠ 현재 진행 중인 관찰 기간</div>
          <div style={{ fontSize: '.88rem' }}>
            {TIERS.find((t) => t.v === activePeriod.tier)?.label || activePeriod.tier}
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>· {activePeriod.start_date} 시작</span>
          </div>
          <div style={{ fontSize: '.78rem', color: '#92400e', marginTop: 6 }}>
            새 기간을 시작하면 위 기간이 {(() => { const d = new Date(startDate); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })()}로 종료됩니다.
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">📊 Tier 선택</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TIERS.map((t) => {
            const on = tier === t.v;
            return (
              <div
                key={t.v}
                onClick={() => setTier(t.v)}
                style={{
                  display: 'flex', gap: 12, padding: '10px 14px', cursor: 'pointer',
                  background: on ? t.bg : 'var(--surface2)',
                  border: '1px solid ' + (on ? t.color : 'var(--border)'),
                  borderRadius: 8, transition: '.15s',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: on ? t.color : '#fff', color: on ? '#fff' : t.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', flexShrink: 0,
                }}>{t.icon}</div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: on ? t.color : 'var(--text)' }}>{t.label}</strong>
                  <div style={{ fontSize: '.78rem', color: 'var(--sub)', marginTop: 2, lineHeight: 1.5 }}>{t.desc}</div>
                </div>
                {on && <span style={{ color: t.color, fontSize: '1.1rem', alignSelf: 'center' }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">시작 날짜</label>
          <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">노트 (선택)</label>
        <textarea className="form-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: BIP 1차 시안 적용 시작. 충실도 80% 목표." />
      </div>

      {/* 이력 */}
      {periods.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>📜 관찰 기간 이력 ({periods.length}건)</div>
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {periods.map((p) => {
              const t = TIERS.find((x) => x.v === p.tier);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <span style={{ background: t?.bg || '#eee', color: t?.color || '#888', padding: '3px 8px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {t?.icon} {t?.label || p.tier}
                  </span>
                  <span style={{ fontSize: '.82rem', color: 'var(--sub)' }}>
                    {p.start_date} ~ {p.end_date || '진행 중'}
                  </span>
                  {p.note && <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>· {p.note.slice(0, 30)}{p.note.length > 30 ? '…' : ''}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onStart} disabled={busy}>
          {busy ? '시작 중...' : '🚀 새 기간 시작'}
        </button>
      </div>
    </Modal>
  );
}
