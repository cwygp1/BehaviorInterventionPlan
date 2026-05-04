import { useState } from 'react';
import StuHero from '../student/StuHero';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { QChipGroup, makeAppender } from '../ui/QChip';
import CrisisPromptModal from '../modals/CrisisPromptModal';
import { createSZ, deleteSZ as apiDelSz } from '../../lib/api/students';

const STAGES = [
  { n: 1, name: '안정', en: 'Calm', color: '#12b886', detail: '예방 전략을 유지하며 바람직한 행동을 적극 칭찬·강화합니다. 4:1 긍정 비율을 유지하고, 학급 규칙을 시각적으로 안내합니다. 안정 상태를 최대한 오래 유지하는 것이 핵심입니다.' },
  { n: 2, name: '전조', en: 'Trigger', color: '#84cc16', detail: '자극 요소를 빠르게 제거하고, 관심을 다른 활동으로 전환합니다. 학생의 표정·몸짓·목소리 변화 등 초기 징후를 감지하는 것이 핵심입니다. "뭐가 필요해?" 등 선택권 제공이 효과적입니다.' },
  { n: 3, name: '흥분', en: 'Agitation', color: '#f59f00', detail: '공감적 경청: "힘들었구나" 등 감정을 인정합니다. 개인 공간을 제공하고, 2가지 이내 선택권을 부여합니다. 이 단계에서 적절히 대응하면 고조를 예방할 수 있습니다.' },
  { n: 4, name: '가속', en: 'Acceleration', color: '#f97316', detail: '지시를 최소화하고, 안전 거리를 확보합니다. 설득·훈계는 역효과를 냅니다. 주변 위험물을 제거하고, 다른 학생들에게도 주의를 기울입니다. 위기행동관리팀에 사전 알림을 보냅니다.' },
  { n: 5, name: '고조/위기', en: 'Peak', color: '#ef476f', detail: '안전 확보가 최우선입니다. 주변 학생을 즉시 대피시키고, 위기행동관리팀에 연락합니다. 매뉴얼에 따른 위기관리를 실행하며, 신체적 개입은 최후의 수단으로만 사용합니다. 모든 과정을 기록합니다.' },
  { n: 6, name: '탈고조', en: 'De-escalation', color: '#f97316', detail: '간섭을 최소화하고, 독립적 공간(심리안정실)을 제공합니다. 새로운 자극·질문을 삼가고, 학생이 스스로 진정할 시간을 줍니다. 아직 불안정하므로 재자극에 주의합니다.' },
  { n: 7, name: '회복', en: 'Recovery', color: '#12b886', detail: '쉬운 과제로 학습 복귀를 유도합니다. 사후 협의를 통해 "무엇이 힘들었는지" 함께 이야기하고, 다음을 위한 전략을 조정합니다. 심리안정실 이용 기록을 작성하고, 필요 시 보호자에게 안내합니다.' },
];

const PHYS_PRINCIPLES = [
  { t: '안전 최우선', d: '학생과 주변인의 안전 확보가 목적' },
  { t: '최후의 수단', d: '비신체적 중재가 효과 없을 때만' },
  { t: '최소한의 힘', d: '필요 범위 내 최소, 압박 금지' },
  { t: '일시적 사용', d: '상황 안정 시 즉시 해제' },
  { t: '기록 및 보고', d: '개입 후 반드시 기록·보호자 통보' },
];

const SZ_STRATEGY = ['호흡법', '그라운딩 5-4-3-2-1', '음악 듣기', '빛 차단', '무게감 담요', '스퀴즈볼', '타이머 시각화', '그림책 읽기', '점진적 이완', '산책'];

export default function CrisisPage() {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [openStage, setOpenStage] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);

  // SZ form state
  const [szDate, setSzDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [szReason, setSzReason] = useState('불안');
  const [szIn, setSzIn] = useState('');
  const [szOut, setSzOut] = useState('');
  const [szStrategy, setSzStrategy] = useState('');
  const [szIntv, setSzIntv] = useState('보통');
  const [szReturn, setSzReturn] = useState('Y');
  const [busy, setBusy] = useState(false);

  async function onSaveSZ() {
    if (!curStuId) { toast('학생을 먼저 선택해주세요.'); return; }
    setBusy(true);
    try {
      const body = { date: szDate, reason: szReason, in_t: szIn, out_t: szOut, strategy: szStrategy, intv: szIntv, ret: szReturn };
      const res = await createSZ(curStuId, body);
      updateStudentData(curStuId, (cur) => ({ ...cur, sz: [res.record, ...cur.sz] }));
      toast('심리안정실 기록 저장 완료');
      setSzIn(''); setSzOut(''); setSzStrategy('');
    } catch (e) { toast('저장 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  async function onDeleteSZ(id) {
    try {
      await apiDelSz(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, sz: cur.sz.filter((r) => r.id !== id) }));
      toast('삭제됨');
    } catch (e) { toast('삭제 실패: ' + e.message); }
  }

  const szRecords = curStuData?.sz || [];

  return (
    <>
      {curStu && <StuHero />}
      <div style={{ marginBottom: 14 }}>
        <button className="btn btn-pri" onClick={() => setAiOpen(true)}>🚨 위기 시나리오 AI 프롬프트</button>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: 8 }}>학생 상황 묘사 → 7단계 대응 시나리오 자동 생성</span>
      </div>

      <div className="card">
        <div className="card-title">🚨 위기행동 7단계 대처 (Acting-Out Cycle)</div>
        <div className="card-subtitle">각 단계를 클릭하면 상세 대응 전략이 표시됩니다. Colvin & Sugai (1989)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {STAGES.map((s) => (
            <div key={s.n} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenStage(openStage === s.n ? null : s.n)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{s.n}</div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: s.color }}>{s.name}</strong>
                  <span style={{ marginLeft: 6, color: 'var(--muted)', fontSize: '.78rem' }}>{s.en}</span>
                </div>
                <span style={{ color: 'var(--muted)' }}>{openStage === s.n ? '▲' : '▼'}</span>
              </button>
              {openStage === s.n && (
                <div style={{ padding: '12px 16px', background: 'var(--surface2)', fontSize: '.88rem', lineHeight: 1.7 }}>{s.detail}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* C2 신체적 개입 5대 원칙 */}
      <div className="card" style={{ background: '#fff7e6', borderColor: '#fde7b8' }}>
        <div className="card-title" style={{ color: '#b45309' }}>⚠ 신체적 개입 5대 원칙 (가이드북 부록)</div>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
          {PHYS_PRINCIPLES.map((p, i) => (
            <li key={i} style={{ padding: '8px 0', borderBottom: i < 4 ? '1px solid #fde7b8' : 'none', display: 'flex', gap: 12 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#f59f00', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.78rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              <div><strong style={{ color: '#92400e' }}>{p.t}</strong><div style={{ fontSize: '.85rem', color: '#92400e' }}>{p.d}</div></div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-title">💚 5-4-3-2-1 그라운딩</div>
        <div className="card-subtitle">감각 기반 정서 안정화 기법 — 학생과 함께 진행하세요.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 14 }}>
          {[
            { e: '👀', n: 5, t: '시각', d: '눈에 보이는 것 5가지' },
            { e: '🖐', n: 4, t: '촉각', d: '몸에 느껴지는 4가지' },
            { e: '👂', n: 3, t: '청각', d: '들리는 소리 3가지' },
            { e: '👃', n: 2, t: '후각', d: '냄새 2가지' },
            { e: '👅', n: 1, t: '미각', d: '맛 또는 좋은 점 1가지' },
          ].map((s) => (
            <div key={s.n} style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem' }}>{s.e}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--pri)' }}>{s.n}</div>
              <div style={{ fontSize: '.78rem', fontWeight: 700 }}>{s.t}</div>
              <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">💚 심리안정실(Safety Zone) 이용 기록</div>
        {!curStu ? (
          <div className="empty-state"><span className="emoji">👤</span>학생을 선택하면 기록을 남길 수 있습니다.</div>
        ) : (
          <>
            <div className="form-row">
              <div className="form-group"><label className="form-label">이용 사유</label>
                <select className="form-select" value={szReason} onChange={(e) => setSzReason(e.target.value)}>
                  <option>불안</option><option>분노</option><option>위기전조</option><option>피로/과민</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">이용 날짜</label>
                <input type="date" className="form-input" value={szDate} onChange={(e) => setSzDate(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">입실 시각</label><input type="time" className="form-input" value={szIn} onChange={(e) => setSzIn(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">퇴실 시각</label><input type="time" className="form-input" value={szOut} onChange={(e) => setSzOut(e.target.value)} /></div>
            </div>
            <div className="form-group">
              <label className="form-label">사용한 진정 전략</label>
              <QChipGroup options={SZ_STRATEGY} onPick={makeAppender(szStrategy, setSzStrategy, true)} />
              <input className="form-input" value={szStrategy} onChange={(e) => setSzStrategy(e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">교사 개입 정도</label>
                <select className="form-select" value={szIntv} onChange={(e) => setSzIntv(e.target.value)}>
                  <option>최소</option><option>보통</option><option>적극적</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">학습 복귀</label>
                <select className="form-select" value={szReturn} onChange={(e) => setSzReturn(e.target.value)}>
                  <option value="Y">예</option><option value="N">아니오</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-pri" onClick={onSaveSZ} disabled={busy}>💾 기록 저장</button>
            </div>
          </>
        )}
      </div>

      {curStu && (
        <div className="card">
          <div className="card-title">📜 누적 심리안정실 기록 <span className="badge badge-pri">{szRecords.length}회</span></div>
          {szRecords.length === 0 ? (
            <div className="empty-state"><span className="emoji">💚</span>저장된 기록이 없습니다.</div>
          ) : (
            <ul className="data-list">
              {szRecords.slice().reverse().map((r) => (
                <li key={r.id} className="data-item">
                  <button className="data-item-del" onClick={() => onDeleteSZ(r.id)} title="삭제" aria-label="삭제">×</button>
                  <div className="data-item-head">
                    <span className="badge badge-warn">{r.reason}</span>
                    <span className="data-item-date">{r.date} {r.in_t}~{r.out_t}</span>
                  </div>
                  <div className="data-item-body">전략: {r.strategy || '-'} | 개입: {r.intv} | 복귀: {r.ret === 'Y' ? '성공' : '미복귀'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CrisisPromptModal open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}
