import { useState } from 'react';
import ProgramSessionPanel from './ProgramSessionPanel';
import DttPanel from './DttPanel';
import ScalePanel from './ScalePanel';
import { RECORD_FRAMES, isReadyKind } from '../../lib/teachMethods';

// 0915(mds/32): 교수 회기 기록 탭 — 기록 형태 고르기.
// 0916(mds/34 §15): 형태 목록·이름·설명은 lib/teachMethods.js 한 곳에서 읽는다.
//   아직 화면이 없는 형태(5점 척도·차시·단계 사다리)도 이름만 '준비 중'으로 보여 준다.
export default function TeachingRecordPanel({ onNavigate }) {
  // IEP 과제분석의 '회기 기록' 버튼으로 들어오면(kb_session_goal) 과제분석 형태로 연다.
  const [kind, setKind] = useState(() => {
    try {
      const k = sessionStorage.getItem('kb_session_goal') ? 'chain' : (sessionStorage.getItem('kb_session_kind') || 'chain');
      return isReadyKind(k) ? k : 'chain';
    } catch (_) { return 'chain'; }
  });
  const pick = (k) => { setKind(k); try { sessionStorage.setItem('kb_session_kind', k); } catch (_) { /* 무시 */ } };
  return (
    <>
      <div className="card" data-help="mon-frame" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.86rem' }}>기록 형태</strong>
          {RECORD_FRAMES.map((f) => (f.status === 'ready' ? (
            <button key={f.kind} type="button" className={'qchip' + (kind === f.kind ? ' on' : '')}
              aria-pressed={kind === f.kind} onClick={() => pick(f.kind)} title={f.what}>
              {f.icon} {f.label}
            </button>
          ) : (
            <span key={f.kind} className="qchip" aria-disabled="true" style={{ opacity: 0.45, cursor: 'default' }}
              title={`${f.what} — 다음에 추가할 기록 형태`}>
              {f.icon} {f.label} (준비 중)
            </span>
          )))}
        </div>
      </div>
      {kind === 'dtt' && <DttPanel />}
      {kind === 'scale' && <ScalePanel />}
      {kind !== 'dtt' && kind !== 'scale' && <ProgramSessionPanel onNavigate={onNavigate} />}
    </>
  );
}
