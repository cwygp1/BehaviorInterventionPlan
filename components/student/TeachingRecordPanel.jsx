import { useState } from 'react';
import ProgramSessionPanel from './ProgramSessionPanel';
import DttPanel from './DttPanel';

// 0915(mds/32): 교수 회기 기록 탭 — 기록 형태 고르기. 과제분석(행동연쇄)·DTT(개별시행), 행동형성·용암은 다음 후보.
const KINDS = [
  { k: 'chain', label: '🧩 과제분석 (행동연쇄)', d: 'IEP 과제분석 단계마다 한 칸' },
  { k: 'dtt', label: '🎯 DTT (개별시행)', d: '학습 항목마다 기회 n번' },
];

export default function TeachingRecordPanel({ onNavigate }) {
  // IEP 과제분석의 '회기 기록' 버튼으로 들어오면(kb_session_goal) 과제분석 형태로 연다.
  const [kind, setKind] = useState(() => {
    try { return sessionStorage.getItem('kb_session_goal') ? 'chain' : (sessionStorage.getItem('kb_session_kind') || 'chain'); } catch (_) { return 'chain'; }
  });
  const pick = (k) => { setKind(k); try { sessionStorage.setItem('kb_session_kind', k); } catch (_) { /* 무시 */ } };
  return (
    <>
      <div className="card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.86rem' }}>기록 형태</strong>
          {KINDS.map((x) => (
            <button key={x.k} type="button" className={'qchip' + (kind === x.k ? ' on' : '')} aria-pressed={kind === x.k} onClick={() => pick(x.k)} title={x.d}>{x.label}</button>
          ))}
          <span className="qchip" aria-disabled="true" style={{ opacity: 0.45, cursor: 'default' }} title="다음에 추가할 기록 형태">행동형성·용암 (준비 중)</span>
        </div>
      </div>
      {kind === 'dtt' ? <DttPanel /> : <ProgramSessionPanel onNavigate={onNavigate} />}
    </>
  );
}
