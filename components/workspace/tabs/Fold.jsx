import { useEffect } from 'react';
import { FOLD_OPEN_EVENT } from '../../ui/FoldCard';

// 학생 수첩 접힌 줄(새 디자인 3단계). 프로토타입 'details.fold2' 모양: 한 줄(56px) + 오른쪽 '펼치기 ▸ / 접기 ▾'.
//   기존 FoldCard와 달리 **접히면 안의 화면을 내린다**(보이는 것만 마운트, mds/54 §3-3 규칙 4) — 옛 화면 통째(QABF·BIP·8단계)를
//   넣기 때문. 그래서 열기·닫기는 부모가 정한다(open/onToggle) — 미설정·기록 0건이면 펼침, 끝났으면 접힘(0821).
//   길잡이·투어가 FOLD_OPEN_EVENT(detail.id)로 펼쳐 달라고 하면 onToggle(true).
export default function Fold({ id, title, summary, open, onToggle, tone, anchor, children }) {
  useEffect(() => {
    const h = (e) => { if (e?.detail?.id === id && !open) onToggle(true); };
    window.addEventListener(FOLD_OPEN_EVENT, h);
    return () => window.removeEventListener(FOLD_OPEN_EVENT, h);
  }, [id, open, onToggle]);
  return (
    <section className={'kb-fold2' + (open ? ' kb-open' : '')} data-fold-id={id} data-tour={anchor}>
      <button type="button" className="kb-fold2-h" aria-expanded={open} aria-controls={id + '-in'} onClick={() => onToggle(!open)}>
        <span className="kb-fold2-t">{title}</span>
        {summary ? <span className={'kb-status kb-tone-' + (tone || 'blue')}>{summary}</span> : null}
        <span className="kb-go">{open ? '접기 ▾' : '펼치기 ▸'}</span>
      </button>
      {open && <div className="kb-fold2-in" id={id + '-in'}>{children}</div>}
    </section>
  );
}
