import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { savePriority } from '../../lib/api/students';
import { PRIORITY_CRITERIA, PRIORITY_SCALE, PRIORITY_MAX, priorityRank, normalizePriority, isLegacyPriority } from '../../lib/priority';

// 표적행동 우선순위 체크리스트 (Checklist for Prioritizing Target Behaviors)
// 2026-08 최신화: Dardig & Heward(1981) 우선순위화 절차 + Cooper, Heron & Heward(2020)
// 'Nine Questions to Ask When Prioritizing Target Behaviors' 기반 최진혁(2026) 번역·수정본 반영.
// 여러 잠재적 문제행동(최대 4개)을 같은 9기준으로 평정해 총점이 가장 높은 행동을 중재 목표로 고른다.
export default function PriorityChecklistModal({ open, onClose }) {
  const { curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [behaviors, setBehaviors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false); // 개정 전 응답이 있었는지 — 재작성 안내용

  useEffect(() => {
    if (!open) return;
    const saved = curStuData?.priority?.responses;
    setLegacy(isLegacyPriority(saved));
    setBehaviors(normalizePriority(saved));
  }, [open, curStuData]);

  const setName = (bi, v) => setBehaviors((p) => p.map((b, i) => (i === bi ? { ...b, name: v } : b)));
  const setVal = (bi, qi, v) => setBehaviors((p) => p.map((b, i) => (
    i === bi ? { ...b, responses: b.responses.map((x, k) => (k === qi ? v : x)) } : b
  )));
  const addBehavior = () => setBehaviors((p) => (p.length >= 4 ? p : [...p, { name: '', responses: new Array(PRIORITY_CRITERIA.length).fill(0) }]));
  const removeBehavior = (bi) => setBehaviors((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== bi)));

  const ranked = priorityRank(behaviors);
  const top = ranked[0];

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const data = await savePriority(curStuId, { responses: behaviors });
      updateStudentData(curStuId, (cur) => ({ ...cur, priority: data.data }));
      toast(top?.name
        ? `저장 완료 — 우선순위 1순위: ${top.name} (${top.total}/${PRIORITY_MAX}점)`
        : `저장 완료 — 총점 ${top?.total ?? 0}/${PRIORITY_MAX}`);
      onClose();
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={860}>
      <h3>📋 표적행동 우선순위 체크리스트</h3>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 12px', lineHeight: 1.6 }}>
        여러 잠재적 문제행동 가운데 <strong>어떤 행동을 먼저 중재할지</strong> 정하는 도구입니다.
        행동마다 9가지 기준을 0~4점으로 평정하고, <strong>총점이 가장 높은 행동</strong>을 우선 중재 목표로 선정합니다. (행동당 최대 {PRIORITY_MAX}점)
        <br /><span style={{ color: 'var(--muted)', fontSize: '.92em' }}>
          척도 — {PRIORITY_SCALE.map((s) => `${s.v} ${s.label}`).join(' · ')}
        </span>
      </p>

      {legacy && (
        <div style={{ fontSize: '.8rem', color: '#92400e', background: '#fff7e6', border: '1px solid #fde7b8', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          ⚠ 이전 버전 체크리스트로 작성한 응답이 있었지만, <strong>기준이 공식 9문항으로 개정</strong>되어 그대로 가져오지 않았어요.
          아래 새 기준으로 다시 평정한 뒤 저장해 주세요(저장하면 새 응답으로 교체됩니다).
        </div>
      )}
      {behaviors.map((b, bi) => {
        const total = b.responses.reduce((a, c) => a + (Number(c) || 0), 0);
        const isTop = ranked.length > 1 && top && top.index === bi && total > 0;
        return (
          <div key={bi} style={{ border: '1px solid ' + (isTop ? '#3b6ef5' : 'var(--border)'), background: isTop ? '#f3f6ff' : 'transparent', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <strong style={{ fontSize: '.86rem', color: 'var(--pri-d)' }}>({bi + 1})</strong>
              <input
                className="form-input"
                style={{ flex: 1, minWidth: 200 }}
                value={b.name}
                onChange={(e) => setName(bi, e.target.value)}
                placeholder="잠재적 문제행동 (관찰 가능하게 — 예: 옆 친구의 팔을 손으로 때린다)"
              />
              <span style={{ fontWeight: 800, color: isTop ? '#3b6ef5' : 'var(--sub)', whiteSpace: 'nowrap' }}>{total}/{PRIORITY_MAX}점</span>
              {isTop && <span className="badge badge-pri">1순위</span>}
              {behaviors.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBehavior(bi)}>삭제</button>
              )}
            </div>
            {PRIORITY_CRITERIA.map((q, qi) => (
              <div key={qi} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '5px 0', borderTop: qi ? '1px solid var(--border)' : 'none' }}>
                <span style={{ flex: 1, minWidth: 220, fontSize: '.84rem' }}>{qi + 1}. {q}</span>
                <div className="qchip-area" style={{ margin: 0 }}>
                  {PRIORITY_SCALE.map((s) => (
                    <span key={s.v} className={'qchip' + (b.responses[qi] === s.v ? ' on' : '')} onClick={() => setVal(bi, qi, s.v)} title={s.label}>
                      {s.v}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addBehavior} disabled={behaviors.length >= 4}>
          + 행동 추가 ({behaviors.length}/4)
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
      <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 10 }}>
        ※ Dardig와 Heward(1981)의 우선순위화 절차를 토대로 하고, Cooper, Heron, and Heward(2020)의 ‘Nine Questions to Ask When
        Prioritizing Target Behaviors’를 바탕으로 최진혁(2026)이 번역·수정함. 저장하면 <strong>중재계획(BIP)·IEP 목표 생성</strong>에 자동 반영됩니다.
      </p>
    </Modal>
  );
}
