import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import { printEvalReport } from '../../lib/utils/printEvalReport';
import AIActionBar from '../ui/AIActionBar';

export default function EvalReportModal({ open, onClose, chartRefs, effectSize, period }) {
  const { curStu, curStuData } = useStudents();
  const { user } = useAuth();
  const { call, status } = useLLM();
  const toast = useToast();
  const [narrative, setNarrative] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (open) setNarrative('');
  }, [open]);

  function buildAIPrompt() {
    const monA = (curStuData?.mon || []).filter((r) => r.phase === 'A');
    const monB = (curStuData?.mon || []).filter((r) => r.phase !== 'A');
    const avgFreq = (arr) => arr.length ? (arr.reduce((s, r) => s + (r.freq || 0), 0) / arr.length).toFixed(1) : 0;
    const fid = curStuData?.fid || [];
    const fidPct = fid.length ? Math.round(fid.reduce((s, r) => s + (r.score / r.total) * 100, 0) / fid.length) : null;

    return `당신은 특수교육 PBS 컨설턴트입니다. 다음 학생의 결과 평가 보고서에 들어갈 "교사 종합 의견" 섹션을 한국어로 작성해주세요.

## 학생 (비식별)
- ID: ${curStu?.code} · ${curStu?.level} · ${curStu?.disability}
- 비식별 요약: ${curStu?.note || '(없음)'}

## 데이터 요약
- 기초선(A): ${monA.length}건, 평균 빈도 ${avgFreq(monA)}
- 중재(B): ${monB.length}건, 평균 빈도 ${avgFreq(monB)}
- 효과크기: PND ${effectSize?.pnd ?? '-'}%, Tau-U ${effectSize?.tau?.toFixed(2) ?? '-'}
- BIP 충실도 평균: ${fidPct != null ? fidPct + '%' : '미측정'}

## 작성 요구
- 5~7문장 분량 (학기말 IEP 보고용)
- 다음 4가지 시각 분석 지표를 자연스럽게 녹여 작성:
  1) Level 변화 (수준)
  2) Trend (경향성)
  3) Variability (변동성)
  4) Immediacy (즉각성)
- 효과 판정: Effective / Promising / Inconclusive / Ineffective 중 하나로 결론
- 다음 단계 권고: BIP 유지 / 수정 / Tier 강화 / FBA 재실시 등 1가지
- 학부모님과 관리자도 이해할 수 있는 평이한 표현 사용`;
  }

  async function runAI() {
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setAiBusy(true);
    try {
      const reply = await call(buildAIPrompt(), { max_tokens: 2000 });
      setNarrative(reply);
      toast('AI 종합 의견이 생성됐습니다. 검토 후 인쇄하세요.');
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  function onPrint() {
    if (!curStu) return;
    printEvalReport({
      student: { code: curStu.code, level: curStu.level, disability: curStu.disability, note: curStu.note },
      teacherName: user?.name,
      school: user?.school,
      charts: chartRefs,
      data: curStuData,
      narrative,
      effectSize,
      period,
    });
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={680}>
      <h3>📊 결과 보고서 생성</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        현재 화면의 모든 차트와 데이터, 적용 BIP, 교사 종합 의견을 합친 A4 보고서를 생성합니다.
        IEP 회의·학기말 보고·학부모 면담 자료로 활용하세요.
      </p>

      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label className="form-label" style={{ marginBottom: 0 }}>💬 교사 종합 의견</label>
        </div>
        <textarea
          className="form-textarea"
          rows={10}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="예: 기초선 평균 빈도 7.2회에서 중재 후 평균 1.8회로 약 75% 감소했습니다. Level과 Trend 모두 명확한 개선이 관찰되며, 중재 도입 직후 즉각적인 변화(Immediacy)도 확인됩니다. PND 85%로 'Effective' 수준에 해당합니다. 현재 BIP를 유지하면서 일반화 단계로 확장할 것을 권장합니다."
        />
      </div>

      <div style={{ background: 'var(--pri-soft)', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid var(--pri-l)' }}>
        <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--pri)', marginBottom: 8 }}>🤖 AI 자동 작성</div>
        <AIActionBar prompt={buildAIPrompt()} onCallAI={runAI} busy={aiBusy} callLabel="🤖 종합 의견 자동 생성" align="flex-start" />
      </div>

      <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, fontSize: '.82rem', color: 'var(--sub)', marginBottom: 14 }}>
        <strong>📦 보고서 포함 내용</strong>
        <ul style={{ paddingLeft: 22, marginTop: 6, lineHeight: 1.7 }}>
          <li>학생 정보 (익명 ID·학교급·장애·비식별 요약)</li>
          <li>핵심 지표 (PND, Tau-U, 평균 빈도)</li>
          <li>5종 차트 이미지 (행동 추이·QABF·충실도·SZ 분포·SZ 월별)</li>
          <li>지표별 데이터 비교 표 (기초선 vs 중재)</li>
          <li>적용된 BIP 4영역 요약</li>
          <li>교사 종합 의견 + 서명란</li>
        </ul>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onPrint}>🖨 보고서 인쇄/PDF</button>
      </div>
    </Modal>
  );
}
