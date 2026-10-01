import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { fetchIEP } from '../../lib/api/students';
import ChartWidget from '../ui/charts/ChartWidget';
import {
  sourcesFor, dimsFor, measuresFor, chartsFor, defaultChart, defaultDim, rangesFor, DEFAULT_RANGE, DEFAULT_SEQ_RANGE,
  CHART_TYPES, STD_BEHS, validateChart, normalizeChart, titleOf, needsGoal,
} from '../../lib/chartCatalog';

// 📈 내 차트 만들기 — 기록 종류 → 가로축 → 세로축 → 모양 (+ 좁히기·제목) → 미리보기 → 추가 (1001, mds/45 §1-1).
// props: open, onClose, dashKey, color, initial(수정 때 기존 cfg), onSave(cfg)
export default function ChartBuilderModal({ open, onClose, dashKey, color, initial, onSave }) {
  const { students, tier2Groups, curSemester } = useStudents();
  const sources = useMemo(() => sourcesFor(dashKey), [dashKey]);
  const [cfg, setCfg] = useState(() => initial || blank(sources[0]?.key));
  const [goals, setGoals] = useState([]);

  useEffect(() => { if (open) setCfg(initial || blank(sources[0]?.key)); }, [open, initial, sources]);

  const dims = dimsFor(cfg.source);
  const dim = dims.find((d) => d.key === cfg.x);
  const measures = measuresFor(cfg.source, cfg.x);
  const charts = chartsFor(cfg.source, cfg.x);
  const ranges = rangesFor(cfg.source, cfg.x);
  const src = sources.find((s) => s.key === cfg.source);
  const filters = src?.filters || [];
  const studentId = cfg.filter?.student ? Number(cfg.filter.student) : null;

  // 회기 기록: 학생을 고르면 그 학생의 이번 학기 IEP 목표를 불러와 목표 선택지로
  useEffect(() => {
    if (!open || cfg.source !== 'session' || !studentId) { setGoals([]); return undefined; }
    let alive = true;
    fetchIEP(studentId).then((d) => {
      if (!alive) return;
      const list = (d.goals || []).filter((g) => Number(g.semester) === Number(curSemester));
      setGoals(list.length ? list : (d.goals || []));
    }).catch(() => { if (alive) setGoals([]); });
    return () => { alive = false; };
  }, [open, cfg.source, studentId, curSemester]);

  const pickSource = (key) => setCfg(blank(key));
  const pickX = (key) => setCfg((c) => {
    const ms = measuresFor(c.source, key);
    const y = ms.some((m) => m.key === c.y) ? c.y : (ms[0]?.key || '');
    const chart = defaultChart(c.source, key);
    const rs = rangesFor(c.source, key);
    const kind = dimsFor(c.source).find((d) => d.key === key)?.kind;
    const range = Object.keys(rs).length ? (rs[c.range] ? c.range : (kind === 'seq' ? DEFAULT_SEQ_RANGE : DEFAULT_RANGE)) : '';
    return { ...c, x: key, y, chart, x2: null, range, alt: c.alt && y === 'freq' && chart !== 'grid' };
  });
  const pickY = (key) => setCfg((c) => ({ ...c, y: key, alt: c.alt && key === 'freq' }));
  const pickChart = (key) => setCfg((c) => ({ ...c, chart: key, x2: key === 'grid' ? 'student' : null, alt: key === 'grid' ? false : c.alt }));
  const setFilter = (k, v) => setCfg((c) => {
    const filter = { ...(c.filter || {}) };
    if (v === '' || v == null) delete filter[k]; else filter[k] = v;
    if (k === 'student') delete filter.goal; // 학생이 바뀌면 목표 다시
    return { ...c, filter };
  });

  const why = validateChart(cfg, dashKey);
  const altOk = cfg.source === 'mon' && cfg.y === 'freq' && cfg.chart !== 'grid';
  const studentCode = studentId ? (students.find((s) => s.id === studentId)?.code || '') : '';
  const groupName = cfg.filter?.group ? (tier2Groups?.find((g) => g.id === Number(cfg.filter.group))?.name || '') : '';
  const autoTitle = titleOf({ ...cfg, title: '' }, { studentCode, groupName });

  function save() {
    if (why) return;
    onSave(normalizeChart(cfg));
  }

  const Chip = ({ on, onClick, children, disabled, help }) => (
    <button type="button" className={'qchip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick} disabled={disabled} data-help={help}>{children}</button>
  );

  return (
    <Modal open={open} onClose={onClose} maxWidth={760}>
      <h3>📈 {initial ? '내 차트 바꾸기' : '내 차트 만들기'}</h3>
      <p className="cb-intro">기록 종류 → 가로축 → 세로축 → 모양 순서로 고르면 아래에 미리 보여요. 대시보드마다 3개까지 둘 수 있어요.</p>

      <div className="cb-step" data-help="cb-source">
        <div className="cb-label">① 무엇을 볼까요</div>
        <div className="qchip-area">
          {sources.map((s) => <Chip key={s.key} on={cfg.source === s.key} onClick={() => pickSource(s.key)}>{s.icon} {s.label}</Chip>)}
        </div>
      </div>

      <div className="cb-step" data-help="cb-x">
        <div className="cb-label">② 가로축 — 무엇으로 나눌까요</div>
        <div className="qchip-area">
          {dims.filter((d) => !(d.showIf === 'groups' && (tier2Groups || []).length < 2)).map((d) => (
            <Chip key={d.key} on={cfg.x === d.key} onClick={() => pickX(d.key)}>{d.label}</Chip>
          ))}
        </div>
        {Object.keys(ranges).length > 0 && (
          <div className="qchip-area cb-sub">
            <span className="cb-sublabel">기간</span>
            {Object.entries(ranges).map(([k, l]) => <Chip key={k} on={String(cfg.range) === k} onClick={() => setCfg((c) => ({ ...c, range: k }))}>{l}</Chip>)}
          </div>
        )}
      </div>

      <div className={'cb-step' + (cfg.x ? '' : ' dim')} data-help="cb-y">
        <div className="cb-label">③ 세로축 — 무엇을 셀까요</div>
        <div className="qchip-area">
          {measures.map((m) => <Chip key={m.key} on={cfg.y === m.key} onClick={() => pickY(m.key)} disabled={!cfg.x}>{m.label}</Chip>)}
        </div>
        {altOk && (
          <label className="cb-toggle">
            <input type="checkbox" checked={!!cfg.alt} onChange={(e) => setCfg((c) => ({ ...c, alt: e.target.checked }))} />
            대체행동 빈도도 함께 보기 (파란 점선)
          </label>
        )}
      </div>

      <div className={'cb-step' + (cfg.y ? '' : ' dim')} data-help="cb-type">
        <div className="cb-label">④ 어떻게 볼까요</div>
        <div className="qchip-area">
          {Object.entries(CHART_TYPES).map(([k, l]) => (
            <Chip key={k} on={cfg.chart === k} onClick={() => pickChart(k)} disabled={!cfg.y || !charts.includes(k)}>{l}{k === 'grid' ? ' (세로는 학생)' : ''}</Chip>
          ))}
        </div>
      </div>

      {filters.length > 0 && (
        <div className="cb-step" data-help="cb-filter">
          <div className="cb-label">좁히기 (선택)</div>
          <div className="cb-filters">
            {filters.includes('student') && (
              <label>학생
                <select className="form-select" value={cfg.filter?.student || ''} onChange={(e) => setFilter('student', e.target.value ? Number(e.target.value) : '')}>
                  <option value="">전체</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </select>
              </label>
            )}
            {filters.includes('group') && (tier2Groups || []).length > 0 && (
              <label>소그룹
                <select className="form-select" value={cfg.filter?.group || ''} onChange={(e) => setFilter('group', e.target.value ? Number(e.target.value) : '')}>
                  <option value="">전체</option>
                  {tier2Groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            )}
            {filters.includes('behavior') && (
              <label>표적행동
                <select className="form-select" value={cfg.filter?.behavior || ''} onChange={(e) => setFilter('behavior', e.target.value)}>
                  <option value="">전체</option>
                  {STD_BEHS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
            )}
            {filters.includes('phase') && (
              <label>Phase
                <select className="form-select" value={cfg.filter?.phase || ''} onChange={(e) => setFilter('phase', e.target.value)}>
                  <option value="">전체</option><option value="A">기초선(A)</option><option value="B">중재(B)</option>
                </select>
              </label>
            )}
            {filters.includes('goal') && (
              <label>목표{needsGoal(cfg) ? ' (필수)' : ''}
                <select className="form-select" value={cfg.filter?.goal || ''} onChange={(e) => setFilter('goal', e.target.value ? Number(e.target.value) : '')} disabled={!studentId}>
                  <option value="">{studentId ? (goals.length ? '목표를 골라요' : '이 학생의 목표가 없어요') : '학생을 먼저 골라요'}</option>
                  {goals.map((g) => <option key={g.id} value={g.id}>{[g.subject, (g.semester_goal || g.standard_text || '').slice(0, 40)].filter(Boolean).join(' · ')}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="cb-step">
        <div className="cb-label">제목 (비우면 자동)</div>
        <input className="form-input" value={cfg.title || ''} placeholder={autoTitle} maxLength={60} onChange={(e) => setCfg((c) => ({ ...c, title: e.target.value }))} />
      </div>

      <div className="cb-preview">
        <div className="cb-label">미리보기</div>
        {why ? <div className="dz-review-empty">{why}</div> : (
          <div className="dw" style={{ '--wc': color }}>
            <div className="dw-head"><span className="dw-title">{cfg.title || autoTitle}</span></div>
            <div className="dw-body"><ChartWidget cfg={normalizeChart(cfg)} dashKey={dashKey} color={color} preview /></div>
          </div>
        )}
      </div>

      <div className="cb-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        <button type="button" className="btn btn-pri" onClick={save} disabled={!!why} title={why || undefined}>{initial ? '✅ 바꾸기' : '➕ 대시보드에 추가'}</button>
      </div>
    </Modal>
  );
}

function blank(sourceKey) {
  if (!sourceKey) return { v: 1, source: '', x: '', y: '', chart: '', range: '', filter: {}, alt: false, x2: null, title: '' };
  const dims = dimsFor(sourceKey);
  const x = defaultDim(sourceKey);
  const ms = measuresFor(sourceKey, x);
  const rs = rangesFor(sourceKey, x);
  const kind = dims.find((d) => d.key === x)?.kind;
  return {
    v: 1, source: sourceKey, x, y: ms[0]?.key || '', chart: defaultChart(sourceKey, x), x2: null, alt: false,
    range: Object.keys(rs).length ? (kind === 'seq' ? DEFAULT_SEQ_RANGE : DEFAULT_RANGE) : '',
    filter: {}, title: '',
  };
}
