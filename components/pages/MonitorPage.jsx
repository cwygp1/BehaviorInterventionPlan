import { useEffect, useMemo, useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { QChipGroup } from '../ui/QChip';
import { createMonitor, deleteMonitor as apiDelMon, createFidelity } from '../../lib/api/students';
import ObservationPeriodModal from '../modals/ObservationPeriodModal';

const STD_BEHS = ['자리 이탈', '소리 지르기', '자해', '공격 행동', '거부', '회피', '반복 행동', '울기', '물건 던지기', '도주'];

export default function MonitorPage() {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [beh, setBeh] = useState('');
  const [freq, setFreq] = useState(0);
  const [dur, setDur] = useState(0);
  const [intensity, setIntensity] = useState(1);
  const [alt, setAlt] = useState('Y');
  const [lat, setLat] = useState(0);
  const [dbr, setDbr] = useState(5);
  const [phase, setPhase] = useState('B'); // ★ B3: 명시적 전환

  const [fidPrev, setFidPrev] = useState(false);
  const [fidTeach, setFidTeach] = useState(false);
  const [fidReinf, setFidReinf] = useState(false);
  const [fidResp, setFidResp] = useState(false);

  const [busy, setBusy] = useState(false);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);

  const recentBehs = useMemo(() => {
    const cached = curStuData?.mon || [];
    return [...new Set(cached.map((r) => r.beh).filter(Boolean))];
  }, [curStuData]);

  const behOptions = useMemo(() => {
    const recentSet = new Set(recentBehs);
    const recentObjs = recentBehs.map((b) => ({ text: b, recent: true }));
    const stdObjs = STD_BEHS.filter((b) => !recentSet.has(b)).map((b) => ({ text: b, recent: false }));
    return [...recentObjs, ...stdObjs].slice(0, 12);
  }, [recentBehs]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;

  const monRecords = curStuData?.mon || [];

  async function onSaveMon() {
    if (!beh.trim()) { toast('대상 행동을 입력해주세요.'); return; }
    setBusy(true);
    try {
      const body = { date, beh, freq: +freq, dur: +dur, int: +intensity, alt, lat: +lat, dbr: +dbr, phase };
      const res = await createMonitor(curStuId, body);
      updateStudentData(curStuId, (cur) => ({ ...cur, mon: [res.record, ...cur.mon] }));
      toast('데이터 저장 완료');
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteMon(id) {
    try {
      await apiDelMon(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, mon: cur.mon.filter((r) => r.id !== id) }));
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  async function onSaveFid() {
    setBusy(true);
    try {
      const score = [fidPrev, fidTeach, fidReinf, fidResp].filter(Boolean).length;
      const res = await createFidelity(curStuId, { date, score, total: 4 });
      updateStudentData(curStuId, (cur) => ({ ...cur, fid: [res.record, ...cur.fid] }));
      toast(`충실도 ${score}/4 저장`);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <StuHero />

      {/* B3 Phase A/B 명시적 전환 + B4 관찰 기간 */}
      <div className="card" style={{ background: phase === 'A' ? '#fff5f5' : '#f0f7ff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>📍 현재 관찰 단계 (Phase)</div>
            <div className="card-subtitle">단일대상연구의 핵심 — 기초선(A)·중재(B)를 명확히 구분해야 결과 차트가 의미를 가집니다.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setPeriodModalOpen(true)}>📍 새 관찰 기간 시작</button>
        </div>
        <div className="qchip-area" style={{ marginTop: 10 }}>
          <span className={'qchip' + (phase === 'A' ? ' on' : '')} onClick={() => setPhase('A')}>A · 기초선 (Baseline)</span>
          <span className={'qchip' + (phase === 'B' ? ' on' : '')} onClick={() => setPhase('B')}>B · 중재 (Intervention)</span>
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>
          현재 저장될 phase: <strong style={{ color: 'var(--pri)' }}>{phase}</strong> — 기초선이 충분히 모이면 BIP 적용 후 B로 전환하세요.
          {curStuData?.periods?.length > 0 && (() => {
            const active = curStuData.periods.find((p) => !p.end_date);
            if (active) {
              return (
                <span style={{ marginLeft: 6, padding: '2px 8px', background: 'var(--pri-soft)', borderRadius: 4, color: 'var(--pri)', fontSize: '.74rem' }}>
                  현재 기간: {active.tier === 'baseline' ? '기초선' : active.tier} ({active.start_date}~)
                </span>
              );
            }
            return null;
          })()}
        </p>
      </div>
      <ObservationPeriodModal open={periodModalOpen} onClose={() => setPeriodModalOpen(false)} />

      <div className="card">
        <div className="card-title">📝 일일 행동 데이터 기록</div>
        <div className="card-subtitle">CICO (Check-In/Check-Out) — 매일 행동 데이터를 기록합니다.</div>
        <div className="form-group">
          <label className="form-label">기록 날짜</label>
          <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">기록 대상 행동</label>
          <QChipGroup options={behOptions} mode="set" target={beh} onChange={setBeh} />
          <input className="form-input" value={beh} onChange={(e) => setBeh(e.target.value)} />
        </div>
        <div className="mon-grid">
          <div className="mon-field"><label>발생 빈도 (횟수)</label><input type="number" min="0" value={freq} onChange={(e) => setFreq(e.target.value)} /></div>
          <div className="mon-field"><label>지속 시간 (분)</label><input type="number" min="0" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
          <div className="mon-field"><label>강도 (1~5)</label><input type="number" min="1" max="5" value={intensity} onChange={(e) => setIntensity(e.target.value)} /></div>
          <div className="mon-field"><label>대체행동 수행</label><select value={alt} onChange={(e) => setAlt(e.target.value)}><option value="Y">예</option><option value="N">아니오</option></select></div>
          <div className="mon-field"><label>지연시간 (분)</label><input type="number" min="0" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
          <div className="mon-field"><label>DBR (0~10)</label><input type="number" min="0" max="10" value={dbr} onChange={(e) => setDbr(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-pri" onClick={onSaveMon} disabled={busy}>💾 데이터 저장</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📋 BIP 실행 충실도 (오늘)</div>
        <div className="card-subtitle">오늘 BIP를 얼마나 충실하게 실행했는지 체크하세요.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidPrev} onChange={(e) => setFidPrev(e.target.checked)} /> 예방 전략 실행
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidTeach} onChange={(e) => setFidTeach(e.target.checked)} /> 교수 전략 실행
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidReinf} onChange={(e) => setFidReinf(e.target.checked)} /> 강화 제공
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={fidResp} onChange={(e) => setFidResp(e.target.checked)} /> 위기 절차 준수
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-ok btn-sm" onClick={onSaveFid} disabled={busy}>충실도 저장</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">📄 기록 목록 <span className="badge badge-pri">{monRecords.length}건</span></div>
        {monRecords.length === 0 ? (
          <div className="empty-state"><span className="emoji">📄</span>기록된 데이터가 없습니다.</div>
        ) : (
          <ul className="data-list">
            {monRecords.slice().reverse().map((r) => (
              <li key={r.id} className="data-item">
                <button className="data-item-del" onClick={() => onDeleteMon(r.id)} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri">{r.created_at || r.date}</span>
                  <span className="data-item-date">{r.beh || ''} <span style={{ marginLeft: 8, padding: '2px 6px', background: r.phase === 'A' ? '#ffe3e3' : '#dbe8ff', borderRadius: 4, fontSize: '.7rem' }}>Phase {r.phase || 'B'}</span></span>
                </div>
                <div className="data-item-body">
                  빈도:{r.freq}회 | 지속:{r.dur}분 | 강도:{r.int} | 대체행동:{r.alt} | DBR:{r.dbr}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
