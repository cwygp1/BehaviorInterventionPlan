import { useState } from 'react';
import { DESIGN_TYPES, linkageText } from '../../lib/dailyLifeGuide';

// 2025 일상생활 활동 수업 도움 자료의 설계 카드(예시)를 IEP 지도서 활동 카드 안에 보여 준다 — 0921 현장 요청.
//   한 장 = 활동 주제 · 설계 형태(A~D) · 교육과정 및 생태학적 연계 내용 · 활동 설계 및 자료 제작의 주안점.
//   주안점은 길어서 접어 두고, '교육내용에 넣기'는 활동 주제 한 줄만 넣는다(주안점은 읽고 교육방법에 녹여 쓰는 참고 글).
const BADGE = {
  A: { bg: '#e0ecff', fg: '#1d4ed8' },
  B: { bg: '#efe4ff', fg: '#6d28d9' },
  C: { bg: '#dcf5e6', fg: '#15803d' },
  D: { bg: '#ffedd5', fg: '#c2410c' },
};

function ExampleCard({ ex, onAddContent }) {
  const [open, setOpen] = useState(false);
  const d = DESIGN_TYPES[ex.design] || { short: ex.design, label: ex.designLabel };
  const badge = BADGE[ex.design] || { bg: '#eee', fg: '#444' };
  const link = linkageText(ex, 400);
  return (
    <div data-help="iep-dl-example" style={{ background: '#fffdf5', border: '1px solid #f1e3b3', borderRadius: 8, padding: '6px 10px', fontSize: '.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span title={d.label} style={{ background: badge.bg, color: badge.fg, borderRadius: 999, padding: '1px 8px', fontSize: '.7rem', fontWeight: 800 }}>
          {ex.design} {d.short}
        </span>
        <strong>{ex.topic}</strong>
        {ex.midNo && <span style={{ color: 'var(--muted)', fontSize: '.74rem' }}>· 지도서 중활동 {ex.midNo} {ex.midTitle}</span>}
        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '1px 8px', fontSize: '.7rem', marginLeft: 'auto' }}
          onClick={() => onAddContent && onAddContent(ex.topic)}>
          + 교육내용에 넣기
        </button>
      </div>
      {link && <div style={{ color: 'var(--sub)', marginTop: 3 }}><span style={{ fontWeight: 700 }}>연계</span> {link}</div>}
      {ex.focus?.length > 0 && (
        <div style={{ marginTop: 3 }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 6px', fontSize: '.72rem' }} onClick={() => setOpen((o) => !o)}>
            {open ? '▾ 주안점 접기' : '▸ 주안점 보기'}
          </button>
          {open && (
            <ul style={{ margin: '4px 0 0 18px', padding: 0, color: 'var(--sub)', lineHeight: 1.5 }}>
              {ex.focus.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function DailyLifeExampleCards({ list, onAddContent }) {
  if (!list?.length) return null;
  return (
    <div style={{ margin: '6px 0 4px', paddingLeft: 8, borderLeft: '3px solid #f1d27a' }}>
      <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
        🧩 2025 수업 도움 자료 예시 {list.length}건 <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— 이 단원의 활동을 실제 수업으로 설계한 카드</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((ex) => <ExampleCard key={ex.no} ex={ex} onAddContent={onAddContent} />)}
      </div>
    </div>
  );
}
