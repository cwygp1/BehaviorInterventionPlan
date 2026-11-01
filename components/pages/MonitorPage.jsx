import { useState } from 'react';
import StuHero, { NoStudentHint } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntryDate } from '../../lib/hooks/useEntryDate';
import { useLLM } from '../../contexts/LLMContext';
import AIActionBar from '../ui/AIActionBar';
import PromptResultBlock from '../modals/PromptResultBlock';
import { deleteMonitor as apiDelMon } from '../../lib/api/students';
import { MBL_DIMENSIONS, METRICS } from '../../lib/utils/scedChart';
import { useBehaviorForm, BehaviorFormCards } from '../record/BehaviorForm';
import SessionForm from '../record/SessionForm';

// 단계 탭·입력 폼·실행 충실도는 components/record/BehaviorForm.jsx, 교수 회기 기록은 components/record/SessionForm.jsx로 옮겼다
// (새 디자인 2단계 — 빠른 기록 창과 같은 폼). 이 화면은 탭·AI 추세 분석·기록 목록만 들고 있다.

export default function MonitorPage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const toast = useToast();
  const { call, status: llmStatus } = useLLM();

  // AI 추세 분석
  const [aiOutput, setAiOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const entryDate = useEntryDate('monitor'); // 기록 달력에서 고른 날짜(mds/33)
  // 행동 데이터 입력 폼 — 옮기기 전과 같은 자리(페이지 맨 위 훅)에서 지금 학생으로 부른다.
  const bf = useBehaviorForm({ studentId: curStuId, entryDate });
  const { design, mbl, atd, cc, monRecords, editingId, loadRecord } = bf;

  // 0915(mds/31 · 갑 결정): 탭 2개 — 문제행동 데이터 | 교수 회기 기록. 메뉴는 늘리지 않는다.
  //   0916(mds/34 §15): 기록 형태가 늘어나 탭 이름에서 형태 목록을 뺐다(형태는 탭 안 칩에서 고른다).
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('kb_monitor_tab') || 'behavior'; } catch (_) { return 'behavior'; } });
  const pickTab = (t) => { setTab(t); try { sessionStorage.setItem('kb_monitor_tab', t); } catch (_) { /* 무시 */ } };

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  const tabBar = (
    <div className="tabs" role="tablist" aria-label="행동 데이터 종류" data-help="mon-tabs">
      <button type="button" role="tab" className={'tab' + (tab === 'behavior' ? ' on' : '')} aria-selected={tab === 'behavior'} onClick={() => pickTab('behavior')}>🔴 문제행동 데이터</button>
      <button type="button" role="tab" className={'tab' + (tab === 'sessions' ? ' on' : '')} aria-selected={tab === 'sessions'} onClick={() => pickTab('sessions')}>🧩 교수 회기 기록</button>
    </div>
  );
  if (tab === 'sessions') return <><StuHero />{tabBar}<SessionForm studentId={curStuId} onNavigate={onNavigate} /></>;
  // 서버 데이터 도착 전 입력 UI를 띄우지 않는다 — 로드 중 입력이 덮어써지는 것 방지.
  if (!curStuDataLoaded) return <><StuHero />{tabBar}<FormLoading label="행동 데이터를 불러오는 중…" /></>;

  async function onDeleteMon(id) {
    // 0923: 확인 없이 바로 지워지던 것 — 삭제 전에 한 번 묻는다(되돌릴 수 없음).
    const r = monRecords.find((x) => x.id === id);
    const label = r ? [r.date, r.beh].filter(Boolean).join(' · ') : '';
    if (!window.confirm(`이 행동 데이터 기록${label ? `(${label})` : ''}을 삭제할까요?\n지운 기록은 되돌릴 수 없어요.`)) return;
    try {
      await apiDelMon(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, mon: cur.mon.filter((r) => r.id !== id) }));
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  // A(기초선) vs B(중재) 데이터를 비식별 텍스트로 정리해 추세 분석 프롬프트를 만든다.
  // 학생 이름 등 PII는 절대 포함하지 않고 학생 코드만 사용한다.
  function buildTrendPrompt() {
    const recs = (curStuData?.mon || []);
    const fmt = (r) => `  - ${r.date} [${r.beh || '대상행동'}] 빈도 ${r.freq}회${r.obs_hours ? ` (관찰 ${r.obs_hours}시간 → 시간당 ${(r.freq / r.obs_hours).toFixed(1)}회)` : ''} · 지속 ${r.dur}분 · 강도 ${r.int}/5 · 대체행동수행 ${r.alt}${r.alt_freq ? `(${r.alt_freq}회)` : ''} · 지연 ${r.lat}분 · DBR ${r.dbr}/10${r.criterion != null && r.criterion !== '' ? ` · 기준 ${r.criterion}` : ''}${r.condition ? ` · 조건 ${r.condition}` : ''}${r.tier ? ` · 층 ${r.tier}` : ''}${r.note ? ` · 메모: ${r.note}` : ''}`;
    // 오래된→최근 순으로 정렬해 추세를 읽기 쉽게.
    const ordered = [...recs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const phaseA = ordered.filter((r) => (r.phase || 'B') === 'A');
    const phaseB = ordered.filter((r) => (r.phase || 'B') === 'B');
    const aText = phaseA.length ? phaseA.map(fmt).join('\n') : '  (기초선 데이터 없음)';
    const bText = phaseB.length ? phaseB.map(fmt).join('\n') : '  (중재 데이터 없음)';
    return `당신은 단일대상연구 데이터를 해석하는 PBS(긍정적 행동지원) 컨설턴트입니다.

## 대상 (비식별)
- 학생 코드: ${curStu?.code || '미상'}

## A · 기초선 (중재 전) — ${phaseA.length}건
${aText}

## B · 중재 (전략 적용 후) — ${phaseB.length}건
${bText}

## 분석 요구
- A(기초선) 대비 B(중재) 단계의 추세를 요약 (빈도·지속·강도·대체행동·DBR 변화 중심. 관찰 시간이 있으면 빈도 대신 시간당 발생률로 비교)
- 메모(수면·몸 상태·날씨 같은 배경사건)가 있는 날의 수치 변화를 따로 짚어 중재 효과와 구분${design === 'MBL' ? `\n- 이 학생은 중다기초선설계(${MBL_DIMENSIONS[mbl.dimension]}). 층(${mbl.dimension === 'behavior' ? '행동 이름' : '층 이름'})마다 기초선·중재를 따로 묶어 보고, 중재를 시작한 층만 변하고 아직 중재 안 한 층은 안정적인지(실험통제)로 판단` : ''}${design === 'ATD' ? `\n- 이 학생은 교대중재설계(조건: ${atd.conditions.map((c) => c.name).join(' · ')}${atd.control ? ' · 무중재' : ''}). 중재(B) 기록의 '조건'별로 묶어 조건 간 수준 차이와 분리 정도(겹침)로 어느 조건이 나은지 판단. 조건 간 비교에는 PND 대신 평균 차·Tau-U를 써라` : ''}${design === 'CC' ? `\n- 이 학생은 기준변경설계(기준 지표: ${METRICS[cc.metric]?.label || cc.metric}, ${cc.direction === 'up' ? '늘리기' : '줄이기'}). 구간마다 '기준 N'이 적혀 있으니 기준을 바꿀 때 행동이 따라왔는지(기준 근처에 머물렀는지)로 판단` : ''}
- 문제행동이 개선되고 있는지(감소/유지/악화) 데이터 근거로 판단
- 구체적인 다음 단계 제안 — 현 중재를 (1) 그대로 지속, (2) 조정, (3) 강화/집중 중 무엇이 적절한지와 이유
- 한국어로, 특수교사가 바로 참고할 수 있게 작성`;
  }

  async function runTrend() {
    if (llmStatus !== 'on') { toast('AI가 지금 꺼져 있어요. 직접 쓰기는 그대로 돼요 — 연결은 관리자에게 알려 주세요.'); return; }
    if (!(curStuData?.mon || []).length) { toast('분석할 행동 데이터가 없습니다.'); return; }
    setAiBusy(true); setAiOutput('');
    try {
      const reply = await call(buildTrendPrompt(), { tier: 'quality', label: '행동 추세 분석' });
      setAiOutput(reply);
    } catch (e) {
      toast('AI 호출 실패: ' + e.message, 'error');
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <StuHero />
      {tabBar}

      <BehaviorFormCards f={bf} onNavigate={onNavigate} />

      <div className="card" data-tour="mon-ai">
        <div className="card-title">✨ AI 추세 분석</div>
        <div className="card-subtitle">기초선(A)과 중재(B) 데이터를 비교해 행동 추세와 다음 단계(지속·조정·강화)를 제안합니다. (학생 코드만 사용 · 비식별)</div>
        <AIActionBar prompt={buildTrendPrompt()} onCallAI={runTrend} busy={aiBusy} callLabel="✨ AI 추세 분석" />
        {(aiOutput || aiBusy) && <PromptResultBlock prompt={buildTrendPrompt()} output={aiOutput} busy={aiBusy} onChange={setAiOutput} />}
      </div>

      <div className="card" data-tour="mon-list">
        <div className="card-title">📄 기록 목록 <span className="badge badge-pri">{monRecords.length}건</span></div>
        <div className="card-subtitle">앞의 날짜가 <strong>기록 해당일(관찰일)</strong>입니다. 항목을 누르면 위 입력 폼으로 불러와 바로 수정할 수 있어요.</div>
        {monRecords.length === 0 ? (
          <div className="empty-state"><span className="emoji">📄</span>기록된 데이터가 없습니다.</div>
        ) : (
          <ul className="data-list">
            {monRecords.slice().reverse().map((r) => (
              <li key={r.id} className="data-item" data-help="mon-row" onClick={() => loadRecord(r)} title="누르면 이 기록을 불러와 수정"
                style={{ cursor: 'pointer', outline: editingId === r.id ? '2px solid var(--pri)' : 'none' }}>
                <button className="data-item-del" onClick={(e) => { e.stopPropagation(); onDeleteMon(r.id); }} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri" title="기록 해당일(관찰일)">📅 {r.date}</span>
                  <span className="data-item-date">{r.beh || ''} <span style={{ marginLeft: 8, padding: '2px 6px', background: r.phase === 'A' ? '#ffe3e3' : '#dbe8ff', borderRadius: 4, fontSize: '.7rem' }}>Phase {r.phase || 'B'}</span>{r.criterion != null && r.criterion !== '' && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#ede9fe', color: '#5b21b6', borderRadius: 4, fontSize: '.7rem' }}>기준 {r.criterion}</span>}{r.condition && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#e0f2fe', color: '#075985', borderRadius: 4, fontSize: '.7rem' }}>조건 {r.condition}</span>}{r.tier && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#dcfce7', color: '#166534', borderRadius: 4, fontSize: '.7rem' }}>층 {r.tier}</span>}{design === 'ATD' && r.phase !== 'A' && !r.condition && <span style={{ marginLeft: 4, padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 4, fontSize: '.7rem' }}>조건 없음 — 불러와 조건 붙이기</span>}</span>
                </div>
                <div className="data-item-body">
                  문제행동 — 빈도:{r.freq}회{r.obs_hours ? ` (${r.obs_hours}시간 중)` : ''} | 지속:{r.dur}분 | 강도:{r.int} · 대체행동 — 수행:{r.alt}{r.alt_freq ? ` | 빈도:${r.alt_freq}회` : ''} · DBR:{r.dbr}
                  {r.note && <div style={{ marginTop: 2, color: '#92400e' }}>📝 {r.note}</div>}
                  <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>작성 {r.created_at || '-'}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); loadRecord(r); }}>✏ 불러와 수정</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
