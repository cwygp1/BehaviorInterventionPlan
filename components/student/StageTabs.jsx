// 단계 탭 (mds/47 ① · §2-2) — "구간 목록(라벨+A/B)"을 받아 그리는 공용 조각.
//   AB·ABAB는 phaseRuns 기반 탭(scedDesigns.stageTabsFor), ②기준변경은 criterionRuns, ④중다기초선은 층별 phaseRuns를 넣는다.
//   누를 수 있는 탭: 지금 구간(current)과 다음 구간(next). 지난 구간(done)·먼 구간(future)은 잠긴다.
//   수정 중(lockedIndex)일 때는 그 기록이 속한 구간만 강조하고 나머지는 모두 잠근다.
const COLOR = { A: 'var(--err)', B: 'var(--pri)' };

export default function StageTabs({ tabs = [], selected = 0, onPick, lockedIndex = null, onAddStage, addLabel = '+ 단계' }) {
  return (
    <div role="tablist" aria-label="관찰 단계" style={{ display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap', marginTop: 10 }} data-tour="mon-stage-tabs">
      {tabs.map((t, i) => {
        const locked = lockedIndex != null ? i !== lockedIndex : (t.state === 'done' || t.state === 'future');
        const on = i === selected;
        const color = COLOR[t.phase] || 'var(--pri)';
        return (
          <button
            key={t.index ?? i}
            type="button"
            role="tab"
            aria-selected={on}
            aria-disabled={locked}
            disabled={locked}
            onClick={() => !locked && onPick?.(i)}
            title={locked ? (lockedIndex != null ? '수정 중에는 단계를 바꿀 수 없어요' : t.state === 'done' ? '지난 구간이에요 — 과거 날짜 기록은 날짜만 그때로 고르면 그 구간에 들어가요' : '그 전 단계를 먼저 지나야 해요') : (t.state === 'next' ? '누르면 이 단계로 넘어가요' : '지금 단계')}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              minWidth: 110, padding: '8px 12px', borderRadius: 10, textAlign: 'left', cursor: locked ? 'not-allowed' : 'pointer',
              border: '1px solid ' + (on ? color : 'var(--border)'),
              background: on ? color : t.state === 'done' ? 'var(--surface2)' : '#fff',
              color: on ? '#fff' : locked ? 'var(--muted)' : color,
              opacity: locked && !on ? 0.6 : 1,
              fontWeight: 700, fontSize: '.84rem', transition: '.15s',
            }}
          >
            <span style={{ fontSize: '.68rem', opacity: 0.85, fontWeight: 600 }}>{i + 1}단계 · {t.short}{t.state === 'current' ? ' · 지금' : t.state === 'next' ? ' · 다음' : t.state === 'done' ? ' · 지남' : ''}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
      {onAddStage && lockedIndex == null && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAddStage} title="철회·재개를 한 번 더 — ABABAB" style={{ alignSelf: 'center' }}>{addLabel}</button>
      )}
    </div>
  );
}
