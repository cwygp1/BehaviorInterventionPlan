import { useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import RAISDModal from '../modals/RAISDModal';
import PriorityChecklistModal from '../modals/PriorityChecklistModal';
import { normalizePriority, priorityRank, PRIORITY_MAX } from '../../lib/priority';
import { rcTopPreferred } from '../../lib/reinforcerChecklist';

// 0821(동료 피드백): "강화제 평가·표적행동 우선순위가 프로필 하단에 작은 버튼으로 있어 잘 안 하게 된다.
//   크기를 키우고, 체크한 결과가 행동중재계획(BIP)·IEP에 반영되게 해달라."
// → 두 평가를 큰 카드로 올려 진행 상태(완료/미완료·핵심 결과)를 함께 보여준다.
//   관찰·BIP·IEP 어느 화면에서든 같은 카드로 열 수 있다.
export default function AssessmentLauncher({ compact = false }) {
  const { curStu, curStuData } = useStudents();
  const [raisdOpen, setRaisdOpen] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);
  if (!curStu) return null;

  const meta = curStuData?.raisd?.responses?._meta || {};
  const ranked = Array.isArray(meta.ranking) ? meta.ranking.filter(Boolean) : [];
  const rcTop = rcTopPreferred(meta.checklist, 3);
  const reinfDone = ranked.length > 0 || rcTop.length > 0;
  const reinfSummary = ranked.length
    ? `선호 순위: ${ranked.slice(0, 3).join(' > ')}`
    : rcTop.length ? `선호도 상위: ${rcTop.map((t) => t.item).join(', ')}` : '';

  const prio = priorityRank(normalizePriority(curStuData?.priority?.responses));
  const prioDone = prio.length > 0 && prio[0].total > 0;
  const prioSummary = prioDone
    ? `1순위: ${prio[0].name || '(이름 미입력)'} — ${prio[0].total}/${PRIORITY_MAX}점`
    : '';

  const cards = [
    {
      key: 'reinf', icon: '💡', title: '강화제 평가 (선호도 평가)',
      desc: '무엇을 좋아하는지 알아야 강화 전략을 세울 수 있어요. 구조화 면담(RAISD) + 항목별 선호도 체크리스트.',
      done: reinfDone, summary: reinfSummary, color: '#7c4dff', bg: '#f7f3ff',
      onClick: () => setRaisdOpen(true),
    },
    {
      key: 'prio', icon: '📋', title: '표적행동 우선순위',
      desc: '여러 문제행동 중 무엇부터 중재할지 9가지 기준으로 정합니다. 총점이 가장 높은 행동이 1순위.',
      done: prioDone, summary: prioSummary, color: '#f59f00', bg: '#fff8e8',
      onClick: () => setPrioOpen(true),
    },
  ];

  return (
    <>
      <div className="card" data-tour="assess-launcher">
        <div className="card-title">🧪 학생 기초 평가 — 중재계획의 재료</div>
        {!compact && (
          <div className="card-subtitle">
            아래 두 가지를 작성해 두면 <strong>중재계획(BIP) 초안</strong>과 <strong>IEP 교육방법(강화 전략)</strong>에 자동으로 반영됩니다.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              style={{
                textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${c.done ? c.color : 'var(--border)'}`,
                background: c.done ? c.bg : 'var(--surface2)', borderRadius: 12, padding: '14px 16px',
                display: 'flex', gap: 12, alignItems: 'flex-start', width: '100%', font: 'inherit', color: 'inherit',
              }}
            >
              <span style={{ fontSize: '1.9rem', lineHeight: 1 }}>{c.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1rem', color: c.color }}>{c.title}</strong>
                  {c.done
                    ? <span className="badge badge-ok" style={{ background: c.color, color: '#fff' }}>✓ 작성됨</span>
                    : <span className="badge" style={{ background: '#e5e7eb', color: '#6b7280' }}>미작성</span>}
                </span>
                {!compact && <span style={{ display: 'block', fontSize: '.8rem', color: 'var(--sub)', marginTop: 4, lineHeight: 1.5 }}>{c.desc}</span>}
                {c.summary && <span style={{ display: 'block', fontSize: '.8rem', color: c.color, fontWeight: 700, marginTop: 6 }}>{c.summary}</span>}
                <span style={{ display: 'block', fontSize: '.8rem', color: 'var(--pri)', fontWeight: 700, marginTop: 8 }}>
                  {c.done ? '✏ 열어서 수정하기 →' : '▶ 지금 작성하기 →'}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <RAISDModal open={raisdOpen} onClose={() => setRaisdOpen(false)} />
      <PriorityChecklistModal open={prioOpen} onClose={() => setPrioOpen(false)} />
    </>
  );
}
