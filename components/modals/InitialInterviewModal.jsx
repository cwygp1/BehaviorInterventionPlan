import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveBIP } from '../../lib/api/students';

// 학생 행동지원 의뢰 및 초기면담지 — 개별 중재 워크플로 ①단계.
// 0822 동료 제공 정식 양식(06_분석문서/초기면담지)을 구조 그대로 반영.
// 학교명·실명·연락처 등 식별정보 칸은 앱의 비식별 원칙에 따라 두지 않는다(학생 프로필로 갈음).
// 저장: bip_data.interview(JSONB) — BIP API의 부분 업데이트로 이 필드만 저장.

// ① 학생 행동특성 — 일상생활 참여정도·수행수준(1~10, 높을수록 참여수준 높음)
export const TRAIT_AREAS = [
  { key: 'selfcare', label: '신변처리', hint: '대소변 관리, 손씻기 등' },
  { key: 'eating', label: '식사하기', hint: '먹기, 식기 사용하기 등' },
  { key: 'comm', label: '의사소통', hint: '구어, 비구어 사용 등' },
  { key: 'social', label: '대인활동', hint: '또래관계 맺기, 감정 표현 등' },
  { key: 'mobility', label: '움직임과 이동', hint: '독립보행, 보조기 사용 등' },
  { key: 'learning', label: '학습준비활동', hint: '학습활동에 필요한 도구 조작 등' },
  { key: 'leisure', label: '여가와 놀이', hint: '' },
];

// ② 이 행동이 특히 문제되는 이유(복수 체크)
export const REASON_OPTIONS = ['학습 참여 저해', '또래관계 어려움', '교사 지시 불이행', '수업방해', '안전 문제', '정서적 어려움', '보호자 민원 우려'];

// ③ 염려되는 문제의 유형 — 해당되는 것만 체크 후 심각성(학생 자신/타인·주변 환경 각 1~5)
export const CONCERN_TYPES = [
  '타인에 대한 신체적 공격(예: 교사나 또래 폭행, 기물파손)',
  '자해행동 등 자신의 건강을 해치는 행위',
  '언어적 공격성(예: 폭언, 폭설)',
  '교사, 부모 등 성인에 대한 반항과 도전',
  '과잉행동, 충동적 행동',
  '심각한 규범 위반(예: 가출, 결석, 도벽, 거짓말)',
  '불건전한 또래 관계(예: 폭력적인 학생들과만 어울림)',
  '사회성 문제(친구 없음, 대인관계 기피)',
  '불안(대인공포, 특정 상황이나 사물에 대한 공포 등)',
  '성문제(자위행위, 또래와의 성문제 등)',
];

// ④ 문제행동 발생 환경을 변화시키기 위해 사용한 방법
export const ENV_METHODS = ['과제 난이도 또는 제시 방법 등을 수정', '자리배치 조정', '시각적 지원(예: 활동표, 그림상징)', '학부모상담', '의료지원 요청', '보조인력 재배치', '해당없음'];
// ⑤ 기대행동을 가르치기 위해 사용해 본 방법
export const TEACH_METHODS = ['문제행동 발생 가능성이 있을 때 상기시킴', '기대행동/규칙 명료화 및 가르치기', '강화프로그램', '행동에 대한 체계적 피드백 제공', '개별면담(구두로 약속)', '행동계약서', '해당없음'];
// ⑥ 문제행동에 대한 선행사건(행동 직전에 흔히 있는 일)
export const ANTECEDENTS = ['과제 제시', '어려운 과제', '선호하지 않는 활동 시작', '활동 종료 또는 전이 요구', '기다리기 요구', '또래와의 갈등', '교사의 지적', '관심 부족 상황', '소음, 혼잡, 감각자극', '원하는 것을 얻지 못함'];
// ⑦ 문제행동에 대한 후속결과(행동 후 흔히 일어나는 일)
export const CONSEQUENCES = ['교사의 관심을 받음', '또래의 반응을 얻음', '타임아웃(잠시 혼자)', '원하는 물건 또는 활동을 얻음', '훈계 또는 제재를 받음', '별다른 반응 없음', '별도 공간 이동'];

const EMPTY = {
  interviewee: '', date: '',
  traits: {},                    // { selfcare: 1~10, ... }
  referReason: '',               // 의뢰 사유
  priorityBehavior: '',          // 현재 가장 우선적으로 지원이 필요한 행동
  reasons: [], reasonEtc: '',    // 문제되는 이유 체크 + 기타
  abcA: '', abcB: '', abcC: '',  // 발생 환경(A)/문제행동(B)/일반적인 결과(C)
  concerns: {},                  // { <유형>: { self: 1~5, other: 1~5 } } — 체크된 것만
  concernEtc: '',                // 기타 유형 이름
  envMethods: [], envEtc: '',    // 환경 변화 방법
  teachMethods: [], teachEtc: '',// 기대행동 교수 방법
  antecedents: [], anteEtc: '',  // 선행사건
  consequences: [], consEtc: '', // 후속결과
  expectation: '',               // 기대하는 행동목표 및 기대행동
};

// 작성 진행도 — 섹션 단위(8) 기준. AssessmentLauncher·Tier3 보드가 공용.
export function interviewProgress(interview) {
  const iv = { ...EMPTY, ...(interview || {}) };
  const filled = [
    Object.values(iv.traits || {}).some((v) => +v >= 1),
    !!String(iv.referReason || '').trim(),
    !!String(iv.priorityBehavior || '').trim(),
    (iv.reasons || []).length > 0 || !!String(iv.reasonEtc || '').trim(),
    !!(String(iv.abcA || '').trim() || String(iv.abcB || '').trim() || String(iv.abcC || '').trim()),
    Object.keys(iv.concerns || {}).length > 0,
    (iv.envMethods || []).length + (iv.teachMethods || []).length > 0,
    (iv.antecedents || []).length + (iv.consequences || []).length > 0 || !!String(iv.expectation || '').trim(),
  ];
  return { done: filled.filter(Boolean).length, total: filled.length };
}

const secHead = { background: '#2f5496', color: '#fff', padding: '6px 12px', fontWeight: 700, fontSize: '.86rem', borderRadius: 8, margin: '14px 0 8px' };
const chipRow = { display: 'flex', gap: 4, flexWrap: 'wrap' };

export default function InitialInterviewModal({ open, onClose }) {
  const { curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const iv = curStuData?.bip?.interview || {};
    setF({ ...EMPTY, ...iv, date: iv.date || new Date().toISOString().slice(0, 10) });
  }, [open, curStuData]);

  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));
  const setTrait = (k, v) => setF((cur) => ({ ...cur, traits: { ...(cur.traits || {}), [k]: cur.traits?.[k] === v ? undefined : v } }));
  const toggleIn = (k, item) => setF((cur) => {
    const arr = Array.isArray(cur[k]) ? cur[k] : [];
    return { ...cur, [k]: arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item] };
  });
  const setConcern = (type, side, v) => setF((cur) => {
    const c = { ...(cur.concerns || {}) };
    const entry = { ...(c[type] || {}) };
    if (entry[side] === v) delete entry[side]; else entry[side] = v;
    if (entry.self == null && entry.other == null) delete c[type]; else c[type] = entry;
    return { ...cur, concerns: c };
  });

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const res = await saveBIP(curStuId, { interview: f }); // 부분 업데이트 — BIP 본문은 유지
      updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), interview: res?.data?.interview || f } }));
      toast('초기면담지 저장 완료 — 중재계획(BIP)·기능평가의 기초 정보로 활용됩니다.');
      onClose();
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const score10 = (area) => (
    <div style={chipRow}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <span key={n} className={'qchip' + (f.traits?.[area.key] === n ? ' on' : '')} onClick={() => setTrait(area.key, n)}>{n}</span>
      ))}
    </div>
  );
  const score5 = (type, side) => (
    <div style={chipRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={'qchip' + (f.concerns?.[type]?.[side] === n ? ' on' : '')} onClick={() => setConcern(type, side, n)}>{n}</span>
      ))}
    </div>
  );
  const checkGrid = (items, key, etcKey, etcPh) => (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map((it) => (
          <span key={it} className={'qchip' + ((f[key] || []).includes(it) ? ' on' : '')} onClick={() => toggleIn(key, it)}>{it}</span>
        ))}
      </div>
      <input className="form-input" style={{ marginTop: 6 }} value={f[etcKey] || ''} onChange={(e) => set(etcKey, e.target.value)} placeholder={etcPh} />
    </>
  );

  return (
    <Modal open={open} onClose={onClose} maxWidth={860}>
      <h3>📝 학생 행동지원 의뢰 및 초기면담지</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 10px', lineHeight: 1.6 }}>
        개별 중재의 <strong>①단계</strong> — 정식 초기면담 양식입니다. 아는 만큼 적고 저장하세요.
        학교명·실명·연락처 등 <strong>식별정보는 적지 않습니다</strong>(기본 정보는 학생 프로필로 갈음).
      </p>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">면담 대상 (관계만)</label>
          <input className="form-input" value={f.interviewee} onChange={(e) => set('interviewee', e.target.value)} placeholder="예: 보호자(모), 담임, 전담교사" />
        </div>
        <div className="form-group">
          <label className="form-label">면담일</label>
          <input type="date" className="form-input" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>

      <div style={secHead}>① 학생 행동특성 — 일상생활 참여정도·수행수준 (1~10점, 높을수록 참여수준 높음)</div>
      {TRAIT_AREAS.map((a) => (
        <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ minWidth: 170, fontSize: '.85rem' }}><strong>{a.label}</strong>{a.hint && <span style={{ color: 'var(--muted)' }}> ({a.hint})</span>}</span>
          {score10(a)}
        </div>
      ))}

      <div style={secHead}>② 문제가 되는 행동 — 구체적으로 기술</div>
      <div className="form-group">
        <label className="form-label">의뢰 사유</label>
        <textarea className="form-textarea" rows={2} value={f.referReason} onChange={(e) => set('referReason', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">현재 가장 우선적으로 지원이 필요한 행동</label>
        <textarea className="form-textarea" rows={2} value={f.priorityBehavior} onChange={(e) => set('priorityBehavior', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">이 행동이 특히 문제되는 이유 (해당 모두 선택)</label>
        {checkGrid(REASON_OPTIONS, 'reasons', 'reasonEtc', '기타 이유')}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">문제행동 발생 환경 (A)</label>
          <textarea className="form-textarea" rows={3} value={f.abcA} onChange={(e) => set('abcA', e.target.value)} placeholder="예) 또래가 다가가거나 지나갈 때" />
        </div>
        <div className="form-group">
          <label className="form-label">문제행동 (B)</label>
          <textarea className="form-textarea" rows={3} value={f.abcB} onChange={(e) => set('abcB', e.target.value)} placeholder="예) 머리를 손바닥으로 때리거나 발로 참" />
        </div>
        <div className="form-group">
          <label className="form-label">일반적인 결과 (C)</label>
          <textarea className="form-textarea" rows={3} value={f.abcC} onChange={(e) => set('abcC', e.target.value)} placeholder="예) 손을 잡아 제지함" />
        </div>
      </div>

      <div style={secHead}>③ 염려되는 문제의 유형 — 해당되는 곳에만 심각성 체크 (1 아니다 ~ 5 항상 그렇다)</div>
      <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginBottom: 6 }}>왼쪽: 학생 자신에 대한 심각성 · 오른쪽: 타인 또는 주변 환경에 대한 심각성</div>
      {CONCERN_TYPES.map((t) => (
        <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: 1, minWidth: 240, fontSize: '.84rem' }}>{t}</span>
          {score5(t, 'self')}
          <span style={{ color: 'var(--border)' }}>|</span>
          {score5(t, 'other')}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '5px 0' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 200 }} value={f.concernEtc} onChange={(e) => set('concernEtc', e.target.value)} placeholder="기타 유형 (이름을 적고 심각성 체크)" />
        {String(f.concernEtc || '').trim() && (<>{score5('기타: ' + f.concernEtc.trim(), 'self')}<span style={{ color: 'var(--border)' }}>|</span>{score5('기타: ' + f.concernEtc.trim(), 'other')}</>)}
      </div>

      <div style={secHead}>④ 문제행동이 발생하는 환경을 변화시키기 위해 사용한 방법</div>
      {checkGrid(ENV_METHODS, 'envMethods', 'envEtc', '기타 방법 / 학부모상담 간략 기술')}

      <div style={secHead}>⑤ 기대행동을 가르치기 위해 사용해 본 방법</div>
      {checkGrid(TEACH_METHODS, 'teachMethods', 'teachEtc', '기타 방법')}

      <div style={secHead}>⑥ 문제행동에 대한 선행사건 (행동 직전에 흔히 있는 일)</div>
      {checkGrid(ANTECEDENTS, 'antecedents', 'anteEtc', '기타 선행사건')}

      <div style={secHead}>⑦ 문제행동에 대한 후속결과 (행동 후 흔히 일어나는 일)</div>
      {checkGrid(CONSEQUENCES, 'consequences', 'consEtc', '기타 후속결과 / 타임아웃·별도 공간 장소')}

      <div style={secHead}>⑧ 선생님께서 기대하는 대상 학생을 위한 행동목표 및 기대행동</div>
      <textarea className="form-textarea" rows={3} value={f.expectation} onChange={(e) => set('expectation', e.target.value)} placeholder="중재를 통해 학생이 어떤 행동을 하게 되기를 기대하나요?" />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSave} disabled={busy}>{busy ? '저장 중…' : '💾 저장'}</button>
      </div>
    </Modal>
  );
}
