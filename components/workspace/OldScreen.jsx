import PageFrame from '../onboarding/PageFrame';
import LegacyPageRouter from '../layout/LegacyPageRouter';
import { SUB_LABELS } from '../../lib/routes';
import { pageLabel } from '../../lib/tiers';

// 옛 화면 한 장을 새 셸에 끼운다(mds/54 §3-3 규칙 1·2) — <PageFrame 탭당 하나> + 옛 화면 그대로(+ StepNav는 LegacyPageRouter가 붙임).
//   화면 파일은 고치지 않는다. onNavigate는 옛 id 32개를 받는 새 셸 navigate.
export function OldScreen({ page, onNavigate }) {
  if (!page) return null;
  return (
    <>
      <PageFrame key={'pf-' + page} page={page} onNavigate={onNavigate} />
      <LegacyPageRouter activePage={page} onNavigate={onNavigate} />
    </>
  );
}

// 탭 안 하위 화면 고르기(알약 칩). 옛 화면 id마다 data-tour="nav-{id}" — 길잡이가 옛 사이드바 메뉴 대신 이 칩을 짚는다.
//   done: { [옛 id]: true } 이면 ✓ (Tier 3 흐름은 기록 기준, StepNav tier3DoneMap과 같은 판정).
//   lead: { label, tour } 이면 맨 앞에 '하위 화면 없음(sub '')' 칩 하나를 더 둔다(4단계 IEP 탭 '목표 카드').
export function SubTabs({ subs, cur, onPick, done, hint, label, lead }) {
  if (!subs || subs.length < 2) return null;
  return (
    <div className="kb-subtabs" role="group" aria-label={label || '하위 화면'}>
      {lead && (
        <button type="button" className="kb-chip" aria-pressed={!cur} onClick={() => onPick('')} data-tour={lead.tour}>{lead.label}</button>
      )}
      {subs.map((id) => (
        <button
          key={id}
          type="button"
          className={'kb-chip' + (hint === id && cur !== id ? ' kb-hinting' : '')}
          aria-pressed={cur === id}
          onClick={() => onPick(id)}
          data-tour={'nav-' + id}
          title={pageLabel(id)}
        >
          {SUB_LABELS[id] || pageLabel(id)}
          {done && done[id] && cur !== id ? <span className="kb-done" aria-label="기록 있음">✓</span> : null}
        </button>
      ))}
    </div>
  );
}
