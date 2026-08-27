import { useEffect, useMemo, useState } from 'react';
import StuHero from '../student/StuHero';
import Tier2GroupPanel from '../student/Tier2GroupPanel';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { saveCICO, deleteCICO } from '../../lib/api/students';
import { useAutoSaveBody } from '../../lib/hooks/useAutoSave';
import { printDPRCard } from '../../lib/utils/printDPR';
import { EditableChipGroup } from '../ui/QChip';
import AIActionBar from '../ui/AIActionBar';
import PromptResultBlock from '../modals/PromptResultBlock';

// 행동 계약서는 Tier 2 독립 메뉴(ContractPage)로 분리 (0827 동료 피드백).

const PRESETS = {
  '초등 (7교시 + 종례)': ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '종례'],
  '중등 (8교시 + 종례)': ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시', '8교시', '종례'],
  '오전 4교시': ['1교시', '2교시', '3교시', '4교시'],
  '오후 4교시': ['5교시', '6교시', '7교시', '종례'],
};

const SCORES = [3, 2, 1, 0];
const SCORE_COLORS = { 3: '#0a7d4e', 2: '#12b886', 1: '#f59f00', 0: '#ef476f' };
const SCORE_LABELS = { 3: '매우 잘함', 2: '잘함', 1: '노력 필요', 0: '못함' };

const COMMON_GOALS = [
  '자리에 앉아 과제 수행', '교사 지시 1회 따르기', '또래에게 친절한 말 사용',
  '시각 일과표 확인', '쉬어 카드 사용', '도와주세요 카드 사용',
  '활동 전환 시 따라가기', '4:1 긍정 행동',
];

function defaultPeriods(level) {
  return (level === '중등' || level === '고등')
    ? PRESETS['중등 (8교시 + 종례)']
    : PRESETS['초등 (7교시 + 종례)'];
}

// Normalize legacy score values (number) into { score, comment } shape.
function readPeriodData(scores, periodName) {
  const v = scores?.[periodName];
  if (v == null) return { score: null, comment: '' };
  if (typeof v === 'object') return { score: v.score ?? null, comment: v.comment || '' };
  return { score: Number(v), comment: '' };
}

export default function Tier2Page({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData, curClassId, tier2Groups } = useStudents();
  const toast = useToast();
  const { call, status: llmStatus } = useLLM();

  // AI 진전 요약 (선택된 학생의 최근 CICO 기준)
  const [aiOutput, setAiOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [goalsInput, setGoalsInput] = useState('');
  const [goals, setGoals] = useState([]);
  const [periodList, setPeriodList] = useState([]);
  const [scores, setScores] = useState({}); // { periodName: { score, comment } }
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedHist, setExpandedHist] = useState(null);
  const [groupId, setGroupId] = useState(null); // 현재 선택된 Tier 2 소그룹

  // 년/학기/반을 바꾸거나 그룹이 삭제되면 선택을 해제(목록 화면으로 복귀).
  useEffect(() => {
    if (groupId && !tier2Groups.some((g) => g.id === groupId)) setGroupId(null);
  }, [tier2Groups, groupId]);

  // 학생을 바꾸면 이전 학생의 AI 요약이 남지 않도록 초기화.
  useEffect(() => { setAiOutput(''); setAiBusy(false); }, [curStuId]);

  const cicoRecords = curStuData?.cico || [];
  const todayRecord = cicoRecords.find((r) => r.date === date);
  // 자동 저장 무장 시점 + 폼 재초기화 트리거(삭제 등) — resetTick을 올리면 기준값 재무장.
  const [cicoLoaded, setCicoLoaded] = useState(false);
  const [resetTick, setResetTick] = useState(0);

  // Load existing record OR initialize defaults for new entries.
  // ⚠ 자동 저장 도입(0824): 저장 때마다 캐시가 갱신되는데, 그때마다 이 로더가
  //   재실행되면 저장 요청 중 입력한 값이 되돌아간다 → 날짜·학생·데이터 도착
  //   시에만 실행 (deps에서 todayRecord/cicoRecords.length 제외).
  useEffect(() => {
    setCicoLoaded(false);
    if (!curStuId || !curStuDataLoaded) return;
    const recs = curStuData?.cico || [];
    const today = recs.find((r) => r.date === date);
    if (today) {
      setGoals(today.goals || []);
      setPeriodList(
        today.periods?.length
          ? today.periods
          : Object.keys(today.scores || {}) // legacy fallback
              .filter((k) => k !== '_periods')
      );
      setScores(today.scores || {});
      setCheckIn(today.check_in_time || '');
      setCheckOut(today.check_out_time || '');
      setComment(today.comment || '');
    } else {
      // For a new entry, copy structure from the most recent record (so the
      // teacher doesn't have to re-define periods every day) — fall back to
      // level-based defaults.
      const last = recs[0];
      const lastPeriods = last?.periods?.length ? last.periods : null;
      setGoals([]);
      setPeriodList(lastPeriods || defaultPeriods(curStu?.level));
      setScores({});
      setCheckIn(''); setCheckOut(''); setComment('');
    }
    setCicoLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, curStuId, curStuDataLoaded, resetTick]);

  // 자동 저장(0824) — 오늘 기록이 로드 시점과 달라지면 입력이 멎은 뒤 upsert 저장.
  const { dirty: cicoDirty } = useAutoSaveBody({
    enabled: !!curStuId && cicoLoaded,
    resetKey: `${curStuId}:${date}:${resetTick}`,
    body: { date, goals, periods: periodList, scores: buildCleanScores(), check_in_time: checkIn, check_out_time: checkOut, comment },
    save: saveCore,
  });

  if (!curClassId) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🏫</div>
        Tier 2 소그룹은 <strong>반·학기</strong> 단위로 구성합니다.<br />
        상단에서 학급을 먼저 선택해주세요.
      </div>
    );
  }

  function addGoal(text) {
    const t = text.trim();
    if (!t) return;
    if (goals.includes(t)) { toast('이미 추가된 목표입니다.'); return; }
    setGoals((g) => [...g, t]);
    setGoalsInput('');
  }
  function removeGoal(i) { setGoals((g) => g.filter((_, idx) => idx !== i)); }

  function setScore(period, val) {
    setScores((prev) => {
      const cur = readPeriodData(prev, period);
      const next = { ...prev };
      next[period] = { score: cur.score === val ? null : val, comment: cur.comment };
      return next;
    });
  }
  function setPeriodComment(period, text) {
    setScores((prev) => {
      const cur = readPeriodData(prev, period);
      return { ...prev, [period]: { score: cur.score, comment: text } };
    });
  }

  function addPeriod() {
    setPeriodList((p) => [...p, `${p.length + 1}교시`]);
  }
  function renamePeriod(i, newName) {
    const oldName = periodList[i];
    if (!newName.trim() || oldName === newName) return;
    setPeriodList((p) => p.map((x, idx) => idx === i ? newName : x));
    if (scores[oldName] != null) {
      setScores((s) => {
        const next = { ...s };
        next[newName] = next[oldName];
        delete next[oldName];
        return next;
      });
    }
  }
  function removePeriod(i) {
    const name = periodList[i];
    setPeriodList((p) => p.filter((_, idx) => idx !== i));
    setScores((s) => {
      const next = { ...s }; delete next[name]; return next;
    });
  }
  function applyPreset(presetName) {
    const list = PRESETS[presetName];
    if (!list) return;
    if (Object.keys(scores).length > 0 && !window.confirm('기존 입력된 점수가 새 교시 구성에 맞지 않으면 사라질 수 있습니다. 계속할까요?')) return;
    setPeriodList(list);
    // Keep scores only for periods that still exist
    setScores((s) => Object.fromEntries(Object.entries(s).filter(([k]) => list.includes(k))));
  }

  // Compute totals (using only filled periods)
  const filledScores = periodList.map((p) => readPeriodData(scores, p)).filter((d) => d.score != null);
  const total = filledScores.reduce((a, d) => a + (Number(d.score) || 0), 0);
  const max = filledScores.length * 3;
  const pct = max ? Math.round((total / max) * 100) : 0;

  // Clean scores: only include periods that have at least a score or comment.
  // (함수 선언 호이스팅으로 위 useAutoSaveBody의 body에서도 참조 가능)
  function buildCleanScores() {
    const cleanScores = {};
    periodList.forEach((p) => {
      const d = readPeriodData(scores, p);
      if (d.score != null || (d.comment && d.comment.trim())) {
        cleanScores[p] = { score: d.score, comment: d.comment || '' };
      }
    });
    return cleanScores;
  }

  async function saveCore() {
    const res = await saveCICO(curStuId, {
      date, goals, periods: periodList, scores: buildCleanScores(),
      check_in_time: checkIn, check_out_time: checkOut, comment,
    });
    updateStudentData(curStuId, (cur) => {
      const others = (cur.cico || []).filter((r) => r.date !== date);
      return { ...cur, cico: [res.record, ...others].sort((a, b) => (b.date || '').localeCompare(a.date || '')) };
    });
  }

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      await saveCore();
      toast(`CICO 저장됨 — ${total}/${max}점 (${pct}%)`);
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function onDelete(id) {
    if (!window.confirm('이 CICO 기록을 삭제할까요?')) return;
    try {
      const rec = (curStuData?.cico || []).find((r) => r.id === id);
      await deleteCICO(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, cico: (cur.cico || []).filter((r) => r.id !== id) }));
      // 오늘(현재 날짜) 기록을 지웠으면 폼을 재초기화 — 그대로 두면 자동 저장이
      // 남아 있는 폼 값으로 방금 지운 기록을 다시 만들어 버린다.
      if (rec && rec.date === date) setResetTick((t) => t + 1);
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  function onPrintDPR() {
    printDPRCard({ studentId: curStu.code, date, periods: periodList, goals, level: curStu.level });
  }

  // 최근 CICO 기록을 비식별 텍스트로 정리해 소그룹/학생 진전 요약 프롬프트를 만든다.
  // 학생 이름 등 PII는 절대 포함하지 않고 학생 코드만 사용한다.
  function buildProgressPrompt() {
    const recent = cicoRecords.slice(0, 10); // 최근 10일 (cicoRecords는 최신순)
    const ordered = [...recent].sort((a, b) => (a.date || '').localeCompare(b.date || '')); // 오래된→최근
    const lines = ordered.map((r) => {
      const pct = r.max_score ? Math.round((r.total_score / r.max_score) * 100) : 0;
      return `  - ${r.date}: ${r.total_score}/${r.max_score}점 (${pct}%)${r.comment ? ` · 코멘트: ${r.comment}` : ''}`;
    }).join('\n');
    const goalsText = (cicoRecords[0]?.goals || goals || []);
    return `당신은 Tier 2(소그룹) CICO/DPR 진전을 점검하는 PBS(긍정적 행동지원) 컨설턴트입니다.

## 대상 (비식별)
- 학생 코드: ${curStu?.code || '미상'}
- 목표 행동: ${goalsText.length ? goalsText.join(', ') : '(미설정)'}

## 최근 CICO 기록 (최근 ${ordered.length}일, 오래된→최근)
${lines || '  (기록 없음)'}

## 요약 요구
- 최근 며칠간의 CICO 진전을 간결하게 요약 (점수 추세·목표 달성 정도)
- CICO 일반 기준(75% 이상=효과 있음, 50% 미만=Tier 3 개별 중재 고려)에 비추어 현재 수준 평가
- 이 학생이 Tier 3(개별 중재) 검토가 필요한지 여부를 명확히 표시(필요/관찰 지속/효과 양호)
- 한국어로, 특수교사가 바로 참고할 수 있게 작성`;
  }

  async function runProgress() {
    if (llmStatus !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    if (!cicoRecords.length) { toast('요약할 CICO 기록이 없습니다.'); return; }
    setAiBusy(true); setAiOutput('');
    try {
      const reply = await call(buildProgressPrompt(), { tier: 'fast', label: 'Tier2 진전 요약' });
      setAiOutput(reply);
    } catch (e) {
      toast('AI 호출 실패: ' + e.message, 'error');
    } finally {
      setAiBusy(false);
    }
  }

  // 최근 7"건" — 달력상 7일이 아니라 최근 기록 7개의 평균이다.
  // (라벨도 '최근 N회 평균'으로 맞췄다. 예전엔 두 달 전 기록만 있어도 "최근 7일"로 보였음)
  const last7 = cicoRecords.slice(0, 7);
  const last7Avg = last7.length
    ? Math.round(last7.reduce((s, r) => s + (r.max_score ? r.total_score / r.max_score : 0), 0) / last7.length * 100)
    : null;

  return (
    <>
      {/* 1) 첫 화면 = 소그룹 관리. 그룹 선택 후 구성원 → CICO로 진행. */}
      <div data-tour="t2-group">
        <Tier2GroupPanel selectedGroupId={groupId} onSelectGroup={setGroupId} />
      </div>

      {!groupId ? null : !curStu ? (
        <div className="card">
          <div className="empty-state">
            <span className="emoji">👆</span>
            소그룹 구성원 이름을 누르면 해당 학생의 CICO / DPR 일일 기록을 시작합니다.
          </div>
        </div>
      ) : (
      <>
      {/* Hero (선택된 학생의 CICO 요약) */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #f59f00 0%, #e8590c 100%)',
        color: '#fff', border: 'none', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, fontSize: '8rem', opacity: 0.1 }}>👥</div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '.78rem', opacity: 0.9, letterSpacing: 3, marginBottom: 4 }}>3-TIER MODEL · TIER 2</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 6 }}>👥 CICO / DPR 일일 기록</h2>
          <p style={{ fontSize: '.86rem', lineHeight: 1.6, opacity: 0.95 }}>
            등교 시 목표 확인 → 교시별 점수·코멘트 기록 → 하교 시 함께 검토. 학생별 시간표를 자유롭게 구성할 수 있습니다.
          </p>
          {last7Avg != null && (
            <div style={{ marginTop: 12, display: 'inline-block', background: 'rgba(255,255,255,.2)', padding: '6px 14px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>
              📊 최근 {last7.length}회 평균: {last7Avg}%
            </div>
          )}
        </div>
      </div>

      <StuHero />

      {/* 일일 입력 폼 */}
      <div className="card" data-tour="t2-daily">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>📋 오늘의 CICO 기록</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onPrintDPR}>🖨 빈 DPR 카드 인쇄</button>
            {todayRecord && (
              <span style={{ fontSize: '.74rem', color: '#0a7d4e', background: '#e7f7ee', padding: '5px 12px', borderRadius: 99, fontWeight: 700 }}>
                ✓ 저장됨 ({todayRecord.total_score}/{todayRecord.max_score})
              </span>
            )}
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 12 }}>
          <div className="form-group"><label className="form-label">날짜</label><input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">🌅 입실(Check-In)</label><input type="time" className="form-input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">🌇 퇴실(Check-Out)</label><input type="time" className="form-input" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
        </div>

        {/* 오늘의 목표 */}
        <div className="form-group">
          <label className="form-label" data-tour="t2-goals">🎯 오늘의 목표 행동 <span style={{ color: 'var(--muted)', fontSize: '.74rem', fontWeight: 500 }}>(1~3개 권장)</span></label>
          <EditableChipGroup storageKey="tier2_goals" defaults={COMMON_GOALS} onPick={(g) => addGoal(g)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={goalsInput}
              onChange={(e) => setGoalsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGoal(goalsInput); } }}
              placeholder="목표 직접 입력 후 Enter"
            />
            <button className="btn btn-ghost btn-sm" onClick={() => addGoal(goalsInput)}>추가</button>
          </div>
          {goals.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {goals.map((g, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0f3ff', borderRadius: 6, border: '1px solid var(--pri-l)' }}>
                  <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--pri)', background: '#fff', padding: '2px 8px', borderRadius: 99 }}>목표 {i + 1}</span>
                  <span style={{ flex: 1, fontSize: '.92rem' }}>{g}</span>
                  <button onClick={() => removeGoal(i)} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 교시 구성 + 점수 + 코멘트 */}
        <div className="form-group" data-tour="t2-periods">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>📊 교시별 점수 + 코멘트</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>프리셋:</span>
              {Object.keys(PRESETS).map((name) => (
                <button key={name} className="qchip" style={{ fontSize: '.72rem' }} onClick={() => applyPreset(name)}>{name}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {periodList.map((p, i) => {
              const data = readPeriodData(scores, p);
              const filled = data.score != null;
              return (
                <div key={i} style={{
                  background: filled ? '#f6f8ff' : 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 8, padding: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => renamePeriod(i, e.target.value)}
                      placeholder="예: 1교시 수학"
                      style={{
                        width: 160, padding: '5px 10px', fontSize: '.86rem', fontWeight: 700,
                        border: '1px solid var(--border)', borderRadius: 6, background: '#fff',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                      {SCORES.map((v) => {
                        const on = data.score === v;
                        return (
                          <button
                            key={v}
                            onClick={() => setScore(p, v)}
                            style={{
                              flex: 1, padding: '6px 4px', borderRadius: 6, cursor: 'pointer', fontSize: '.78rem', fontWeight: 700,
                              border: '1px solid ' + (on ? SCORE_COLORS[v] : 'var(--border)'),
                              background: on ? SCORE_COLORS[v] : '#fff',
                              color: on ? '#fff' : SCORE_COLORS[v],
                              transition: '.15s',
                            }}
                          >
                            {v}점
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => removePeriod(i)}
                      title="이 교시 삭제"
                      style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: 0, flexShrink: 0 }}
                    >×</button>
                  </div>
                  <input
                    type="text"
                    value={data.comment}
                    onChange={(e) => setPeriodComment(p, e.target.value)}
                    placeholder={`💬 ${p} 코멘트 (선택) — 예: 자리이탈 2회, 도와주세요 카드 사용함`}
                    style={{ width: '100%', padding: '6px 10px', fontSize: '.82rem', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
                  />
                </div>
              );
            })}
          </div>

          <button className="btn btn-ghost btn-sm" onClick={addPeriod} style={{ marginTop: 10 }}>+ 교시 추가</button>

          <div style={{ marginTop: 12, padding: 14, background: 'var(--pri-soft)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>오늘 합계 </span>
              <strong style={{ fontSize: '1.4rem', color: 'var(--pri)' }}>{total}</strong>
              <span style={{ color: 'var(--muted)' }}> / {max || periodList.length * 3}</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: pct >= 75 ? '#0a7d4e' : pct >= 50 ? '#f59f00' : '#ef476f' }}>{pct}%</div>
          </div>
        </div>

        {/* 종합 코멘트 */}
        <div className="form-group">
          <label className="form-label" data-tour="t2-comment">💬 하교 종합 코멘트 <span style={{ color: 'var(--muted)', fontSize: '.74rem', fontWeight: 500 }}>(가정에 전달)</span></label>
          <textarea className="form-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="예: 오늘 자리이탈 횟수가 줄었어요. 가정에서도 칭찬해 주세요." />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button
            className={'btn ' + (cicoDirty ? 'btn-pri' : 'btn-ghost')}
            onClick={onSave}
            disabled={busy || !cicoDirty}
            title={cicoDirty ? '지금 바로 저장' : '변경 내용이 모두 자동 저장되었습니다'}
          >
            {busy ? '저장 중...' : (cicoDirty ? '💾 CICO 저장' : '✓ 저장됨')}
          </button>
        </div>
      </div>

      {/* 이력 */}
      <div className="card" data-tour="t2-history">
        <div className="card-title">📜 CICO 이력 <span className="badge badge-pri">{cicoRecords.length}일</span></div>
        {cicoRecords.length === 0 ? (
          <div className="empty-state"><span className="emoji">📅</span>아직 기록된 CICO가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cicoRecords.slice(0, 14).map((r) => {
              const recPct = r.max_score ? Math.round((r.total_score / r.max_score) * 100) : 0;
              const color = recPct >= 75 ? '#0a7d4e' : recPct >= 50 ? '#f59f00' : '#ef476f';
              const expanded = expandedHist === r.id;
              const periodsToShow = r.periods?.length ? r.periods : Object.keys(r.scores || {}).filter((k) => k !== '_periods');
              return (
                <div key={r.id} style={{
                  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <button className="data-item-del" onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}>×</button>
                  <div
                    onClick={() => setExpandedHist(expanded ? null : r.id)}
                    style={{ padding: '10px 14px', paddingRight: 40, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                  >
                    <span className="badge badge-pri">{r.date}</span>
                    <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{r.check_in_time || '—'} ~ {r.check_out_time || '—'}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{periodsToShow.length}교시</span>
                    <span style={{ fontSize: '.92rem', fontWeight: 700, color }}>{r.total_score}/{r.max_score} · {recPct}%</span>
                    <span style={{ color: 'var(--muted)', fontSize: '.92rem' }}>{expanded ? '▲' : '▼'}</span>
                  </div>
                  {expanded && (
                    <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      {r.goals?.length > 0 && (
                        <div style={{ paddingTop: 10, fontSize: '.85rem' }}>
                          <strong style={{ color: 'var(--pri)' }}>🎯 목표</strong>
                          <ul style={{ paddingLeft: 22, marginTop: 4, color: 'var(--sub)' }}>
                            {r.goals.map((g, i) => <li key={i}>{g}</li>)}
                          </ul>
                        </div>
                      )}
                      <div style={{ paddingTop: 10 }}>
                        <strong style={{ color: 'var(--pri)', fontSize: '.85rem' }}>📊 교시별 상세</strong>
                        <table style={{ width: '100%', marginTop: 6, fontSize: '.84rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#fff' }}>
                              <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--border)', width: '40%' }}>교시</th>
                              <th style={{ textAlign: 'center', padding: 6, borderBottom: '1px solid var(--border)', width: '15%' }}>점수</th>
                              <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--border)' }}>코멘트</th>
                            </tr>
                          </thead>
                          <tbody>
                            {periodsToShow.map((p) => {
                              const d = readPeriodData(r.scores, p);
                              return (
                                <tr key={p}>
                                  <td style={{ padding: 6, fontWeight: 600 }}>{p}</td>
                                  <td style={{ padding: 6, textAlign: 'center' }}>
                                    {d.score != null ? (
                                      <span style={{ display: 'inline-block', minWidth: 28, padding: '2px 8px', background: SCORE_COLORS[d.score] || '#888', color: '#fff', borderRadius: 99, fontWeight: 700, fontSize: '.78rem' }}>
                                        {d.score}
                                      </span>
                                    ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: 6, color: 'var(--sub)' }}>{d.comment || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {r.comment && (
                        <div style={{ paddingTop: 10, fontSize: '.85rem' }}>
                          <strong style={{ color: 'var(--pri)' }}>💬 종합</strong>
                          <p style={{ marginTop: 4, color: 'var(--sub)', whiteSpace: 'pre-wrap' }}>{r.comment}</p>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDate(r.date)}>📝 이 날로 이동/편집</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {cicoRecords.length > 14 && (
          <div style={{ textAlign: 'center', padding: 8, fontSize: '.82rem', color: 'var(--muted)' }}>
            (최근 14일만 표시. 총 {cicoRecords.length}건)
          </div>
        )}
      </div>

      {/* AI 진전 요약 (선택된 학생) */}
      <div className="card" data-tour="t2-ai">
        <div className="card-title">✨ AI 진전 요약</div>
        <div className="card-subtitle">선택된 학생({curStu.code})의 최근 CICO 기록을 요약하고 Tier 3 개별 중재 검토가 필요한지 표시합니다. (학생 코드만 사용 · 비식별)</div>
        <AIActionBar prompt={buildProgressPrompt()} onCallAI={runProgress} busy={aiBusy} callLabel="✨ AI 진전 요약" />
        {(aiOutput || aiBusy) && <PromptResultBlock prompt={buildProgressPrompt()} output={aiOutput} busy={aiBusy} onChange={setAiOutput} />}
      </div>

      </>
      )}

      {/* 안내 */}
      <details>
        <summary style={{ cursor: 'pointer', padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontWeight: 700, fontSize: '.92rem' }}>
          📖 CICO / DPR 사용 가이드 (펼치기)
        </summary>
        <div className="card" style={{ marginTop: 0, borderRadius: '0 0 8px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#e7f7ee', padding: 14, borderRadius: 8, border: '1px solid #9be0b9' }}>
              <strong style={{ color: '#0a7d4e' }}>🌅 Check-In (등교)</strong>
              <ul style={{ paddingLeft: 18, fontSize: '.85rem', lineHeight: 1.7, marginTop: 6, color: '#0a7d4e' }}>
                <li>교사와 인사·짧은 대화 (1~2분)</li>
                <li>오늘의 목표 행동 확인</li>
                <li>DPR 카드 제공</li>
              </ul>
            </div>
            <div style={{ background: '#fff7e6', padding: 14, borderRadius: 8, border: '1px solid #f3c47b' }}>
              <strong style={{ color: '#a76200' }}>🌇 Check-Out (하교)</strong>
              <ul style={{ paddingLeft: 18, fontSize: '.85rem', lineHeight: 1.7, marginTop: 6, color: '#a76200' }}>
                <li>오늘 점수 함께 검토</li>
                <li>긍정적 피드백 + 작은 보상</li>
                <li>가정에 DPR 카드 전달</li>
              </ul>
            </div>
          </div>
          <p style={{ fontSize: '.86rem', color: 'var(--sub)', marginTop: 12, lineHeight: 1.7 }}>
            <strong>📊 점수 기준</strong> — 3 매우 잘함 · 2 잘함 · 1 노력 필요 · 0 못함<br />
            <strong>📈 진행 평가</strong> — 2~4주 시행 후 75% 이상이면 효과 있음. 50% 미만이면 <strong>Tier 3 개별 중재</strong>로 확대.
          </p>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('monitor')}>📈 행동 데이터로 이동</button>
            <button className="btn btn-pri btn-sm" onClick={() => onNavigate?.('tier3')}>🎯 Tier 3 개요</button>
          </div>
        </div>
      </details>
    </>
  );
}
