import { useState } from 'react';
import Modal from '../ui/Modal';
import PromptResultBlock from './PromptResultBlock';
import { useStudents } from '../../contexts/StudentContext';
import { useLLM } from '../../contexts/LLMContext';
import { useToast } from '../../contexts/ToastContext';
import AIActionBar from '../ui/AIActionBar';

function buildPrompt(stu, data) {
  const mon = (data?.mon || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const monLines = mon.map((r) =>
    `${r.date} | Phase ${r.phase || 'B'} | 행동 "${r.beh || ''}" | 빈도 ${r.freq} | 지속 ${r.dur}분 | 강도 ${r.int} | DBR ${r.dbr}`
  ).join('\n');
  const fid = (data?.fid || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const fidLines = fid.map((r) => `${r.date} | ${r.score}/${r.total}`).join('\n');
  const sz = (data?.sz || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const szLines = sz.map((r) => `${r.date} | 사유: ${r.reason} | 시간: ${r.in_t}~${r.out_t} | 복귀: ${r.ret}`).join('\n');

  return `당신은 단일대상연구(Single Subject Design) 분석 전문가입니다.
다음 학생의 행동 데이터를 분석하여 4가지 시각적 분석 지표로 해석해주세요.

## 학생 (비식별)
- ID: ${stu?.code} · ${stu?.level} · ${stu?.disability}
- 비식별 요약: ${stu?.note || '(없음)'}

## 행동 모니터링 (Phase 표시)
${monLines || '(데이터 없음)'}

## BIP 실행 충실도 추이
${fidLines || '(데이터 없음)'}

## 심리안정실 이용
${szLines || '(데이터 없음)'}

## 분석 요청
시각적 분석(Visual Analysis)의 4지표로 해석해주세요:

### 1. Level (수준 변화)
Phase A 평균 vs Phase B 평균의 변화. 절대치와 임상적 의미.

### 2. Trend (경향)
Phase A의 추세선과 Phase B의 추세선 방향. 개선·악화·정체 판단.

### 3. Variability (변동성)
각 phase 내 데이터의 흩어짐 정도. 안정성 vs 불안정성.

### 4. Immediacy of Effect (즉각성)
Phase A 마지막 3개 데이터 vs Phase B 첫 3개 데이터 비교. 중재 도입 직후 변화의 크기.

## 결론
- 중재가 효과적인지 (Effective / Promising / Inconclusive / Ineffective 중 하나)
- 다음 단계 권고사항 (BIP 유지 / 수정 / Tier 강화 / FBA 재실시 등)
- 한국 특수교육 현장에서 바로 적용 가능한 구체적 조치 2~3가지`;
}

export default function EvalPromptModal({ open, onClose }) {
  const { curStu, curStuData } = useStudents();
  const { call, status } = useLLM();
  const toast = useToast();
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const prompt = curStu ? buildPrompt(curStu, curStuData) : '';

  async function runAI() {
    if (!curStu) { toast('학생을 먼저 선택해주세요.'); return; }
    if (status !== 'on') { toast('AI 연결을 먼저 설정해주세요.'); return; }
    setBusy(true); setOutput('');
    try {
      const reply = await call(prompt);
      setOutput(reply);
    } catch (e) { toast('AI 호출 실패: ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={780}>
      <h3>💡 AI 성과 분석</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px' }}>
        Phase A·B로 구분된 Monitor 기록을 바탕으로 단일대상연구 4지표로 AI가 해석합니다.
      </p>
      <AIActionBar prompt={prompt} onCallAI={runAI} busy={busy} callLabel="🤖 AI 성과 분석 생성" align="flex-start" />
      {(output || busy) && <PromptResultBlock prompt={prompt} output={output} busy={busy} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
