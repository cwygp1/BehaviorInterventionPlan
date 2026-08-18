import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import { useGuide } from './GuideContext';
import { GROUP_ORDER, GLOSSARY, searchGlossary } from '../../lib/glossary';

// 용어 사전 모달 — 전문용어를 쉬운 말로 (mds/23 기능③).
// Topbar ❓ 메뉴 또는 투어의 "쉬운 말 풀이" 버튼에서 열린다.
// glossary.term 이 있으면 그 항목을 펼친 채로 연다.

export default function GlossaryModal() {
  const { glossary, closeGlossary } = useGuide();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const openedRef = useRef(null);

  useEffect(() => {
    if (glossary.open) {
      setQ('');
      setOpenId(glossary.term || null);
      openedRef.current = null;
    }
  }, [glossary.open, glossary.term]);

  // 처음 지정된 용어로 스크롤 (한 번만)
  useEffect(() => {
    if (!glossary.open || !openId || openedRef.current === openId) return;
    openedRef.current = openId;
    const t = setTimeout(() => {
      const el = document.getElementById('gl-' + openId);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, [glossary.open, openId]);

  const list = useMemo(() => searchGlossary(q), [q]);
  const grouped = useMemo(() => {
    const m = new Map(GROUP_ORDER.map((g) => [g, []]));
    list.forEach((item) => {
      if (!m.has(item.group)) m.set(item.group, []);
      m.get(item.group).push(item);
    });
    return [...m.entries()].filter(([, items]) => items.length > 0);
  }, [list]);

  if (!glossary.open) return null;

  return (
    <Modal open onClose={closeGlossary} maxWidth={640}>
      <h3>📖 용어 사전 — 쉬운 말 풀이</h3>
      {glossary.fromTour ? (
        /* 투어 도중 열린 경우 — 닫으면 보던 안내가 같은 자리에서 이어진다는 걸 알려준다 */
        <div className="gl-resume">
          <span>👣 화면 안내는 잠시 멈춰 있어요. 다 읽으면 안내로 돌아가요.</span>
          <button className="btn btn-pri btn-sm" onClick={closeGlossary}>← 안내로 돌아가기</button>
        </div>
      ) : (
        <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '4px 0 12px', lineHeight: 1.6 }}>
          처음 보는 용어가 있으면 여기서 찾아보세요. 전부 몰라도 괜찮아요 — 필요할 때 하나씩 알면 충분해요.
        </p>
      )}
      <input
        className="form-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 궁금한 용어 검색 (예: ABC, 강화, 기초선)"
        aria-label="용어 검색"
        autoFocus
      />
      <div className="gl-list">
        {grouped.length === 0 && (
          <div className="empty-state" style={{ marginTop: 14 }}>
            <span className="emoji">🔍</span>"{q}"에 맞는 용어를 못 찾았어요. 다른 말로 검색해보세요.
          </div>
        )}
        {grouped.map(([group, items]) => (
          <div key={group} className="gl-group">
            <div className="gl-group-name">{group}</div>
            {items.map((g) => {
              const on = openId === g.id;
              return (
                <div key={g.id} id={'gl-' + g.id} className={'gl-item' + (on ? ' on' : '')}>
                  <button
                    className="gl-head"
                    onClick={() => setOpenId(on ? null : g.id)}
                    aria-expanded={on}
                  >
                    <span className="gl-term">{g.term}</span>
                    <span className="gl-arrow" aria-hidden="true">{on ? '▾' : '▸'}</span>
                  </button>
                  <div className="gl-short">{g.short}</div>
                  {on && <div className="gl-more">{g.more}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
          전체 {GLOSSARY.length}개 · 더 배우고 싶다면 사이드바의 <strong>PBS 영상 강의</strong>를 열어보세요.
        </span>
        {glossary.fromTour && (
          <button className="btn btn-pri btn-sm" onClick={closeGlossary}>← 안내로 돌아가기</button>
        )}
      </div>
    </Modal>
  );
}
