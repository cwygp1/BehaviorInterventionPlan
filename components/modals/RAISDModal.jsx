import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { saveRAISD } from '../../lib/api/students';

// 원문: 장애학생을 위한 강화제 평가 (RAISD, Fisher et al.)
// 10개 질문 각각에 대해 (구체적 선호 항목 + 강도 1~5 + 추가 질문/대답)을 기록한다.
const CATEGORIES = [
  {
    key: 'visual',
    label: '1. 보기 (시각 자극)',
    question: '거울, 불빛, 반짝거리는 물건, 빙글빙글 돌아가는 물건, TV 등을 쳐다보기를 좋아하는 경우가 있습니다. 학생은 무엇을 보는 것을 가장 좋아하나요?',
  },
  {
    key: 'sound',
    label: '2. 소리 (청각 자극)',
    question: '음악, 자동차 소리, 휘파람 소리, 삑삑거리는 소리, 사이렌 소리, 손뼉 치는 소리, 노랫소리 등 다양한 소리 중 학생은 무슨 소리를 가장 좋아하나요?',
  },
  {
    key: 'smell',
    label: '3. 냄새 (후각 자극)',
    question: '꽃향기, 커피, 화장품 냄새와 같은 다양한 냄새 중 학생은 무슨 냄새를 가장 좋아하나요?',
  },
  {
    key: 'food',
    label: '4. 음식 / 음료',
    question: '아이스크림, 피자, 주스, 햄버거, 사탕, 초콜릿 등 학생이 특별히 가장 좋아하는 음식은 무엇인가요?',
  },
  {
    key: 'physical',
    label: '5. 신체 놀이',
    question: '간지럼, 레슬링, 뛰기, 춤추기, 그네타기 등과 같은 신체 놀이 중 학생은 어떤 신체 놀이를 가장 좋아하나요?',
  },
  {
    key: 'temperature',
    label: '6. 온도 자극',
    question: '눈이나 얼음, 손난로와 같이 뜨겁거나 차가운 물건 중 학생은 어떤 온도의 물건을 만지는 것을 가장 좋아하나요?',
  },
  {
    key: 'sensory',
    label: '7. 감각 활동',
    question: '물 뿌리기, 피부에 진동, 선풍기 바람을 얼굴로 느끼기 등 다양한 감각 중 학생은 어떤 감각활동을 가장 좋아하나요?',
  },
  {
    key: 'social',
    label: '8. 사회적 관심',
    question: '안아주기, 등 토닥토닥하기, 하이파이브, "잘했어!"라고 말해주기 등 학생은 어떤 형태로 주어지는 관심을 가장 좋아하나요?',
  },
  {
    key: 'toy',
    label: '9. 장난감 / 물건',
    question: '퍼즐, 장난감, 만화책, 풍선 등과 같이 학생이 특별히 좋아하는 장난감이나 물건이 있으면 적어주세요.',
  },
  {
    key: 'etc',
    label: '10. 기타 물건 / 활동',
    question: '학생이 좋아하는 기타 물건이나 활동에는 무엇이 있는지 좀 더 깊이 생각해보고, 생각나는 것이 있으면 적어주세요.',
  },
];

// 이전 버전(6개 카테고리) 데이터 → 새 10개 질문 키로 이관.
const LEGACY_MAP = { tangible: 'toy', activity: 'etc', escape: 'etc' };

const RANK_COUNT = 16;

// 접을 수 있는 섹션 헤더 (긴 설문의 스크롤 부담 완화).
function Section({ title, open, onToggle, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface2)', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '.9rem', textAlign: 'left' }}
      >
        <span>{title}</span><span style={{ color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '12px 14px' }}>{children}</div>}
    </div>
  );
}

export default function RAISDModal({ open, onClose }) {
  const { curStu, curStuId, curStuData, updateStudentData } = useStudents();
  const toast = useToast();
  const [responses, setResponses] = useState({});
  const [ranking, setRanking] = useState(new Array(RANK_COUNT).fill(''));
  const [banned, setBanned] = useState('');
  const [unlimited, setUnlimited] = useState('');
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState({ qs: true, rank: false, limits: false });
  const toggleSec = (k) => setSec((s) => ({ ...s, [k]: !s[k] }));

  const draftKey = curStuId ? `raisd_draft_${curStuId}` : null;
  const dirtyRef = useRef(false); // 사용자가 실제로 수정했을 때만 임시 저장.

  useEffect(() => {
    if (!open) return;
    const saved = curStuData?.raisd || {};
    let resp = { ...(saved.responses || {}) };
    // 순위·금지/허용은 responses JSONB 안의 _meta 키에 함께 저장한다.
    let meta = resp._meta || {};
    delete resp._meta;
    // 작성 중 이탈한 임시 저장본이 있으면 우선 복원 (저장 성공 시 삭제됨).
    try {
      const draft = draftKey && JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (draft && draft.responses) {
        resp = { ...draft.responses };
        meta = { ranking: draft.ranking, banned: draft.banned, unlimited: draft.unlimited };
        delete resp._meta;
        toast('작성 중이던 임시 저장본을 불러왔어요. (저장을 눌러야 확정됩니다)');
      }
    } catch (_) { /* ignore */ }
    // 구버전 키(6개 카테고리)를 새 키로 옮긴다 (새 키에 값이 없을 때만).
    for (const [oldKey, newKey] of Object.entries(LEGACY_MAP)) {
      if (resp[oldKey] && !resp[newKey]) { resp[newKey] = resp[oldKey]; }
    }
    setResponses(resp);
    const rk = Array.isArray(meta.ranking) ? meta.ranking : [];
    setRanking([...rk, ...new Array(RANK_COUNT)].slice(0, RANK_COUNT).map((v) => v || ''));
    setBanned(meta.banned || '');
    setUnlimited(meta.unlimited || '');
    setSec({ qs: true, rank: false, limits: false });
    dirtyRef.current = false;
  }, [open, curStuData]); // eslint-disable-line react-hooks/exhaustive-deps

  // 임시 저장 — 사용자가 수정한 뒤부터 localStorage에 초안 보관 (모달 닫힘·이탈 대비).
  useEffect(() => {
    if (!open || !draftKey || !dirtyRef.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ responses, ranking, banned, unlimited, t: Date.now() }));
    } catch (_) { /* ignore quota */ }
  }, [open, draftKey, responses, ranking, banned, unlimited]);

  function update(key, field, value) {
    dirtyRef.current = true;
    setResponses((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }));
  }

  function updRank(i, v) {
    dirtyRef.current = true;
    setRanking((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  const setBannedDirty = (v) => { dirtyRef.current = true; setBanned(v); };
  const setUnlimitedDirty = (v) => { dirtyRef.current = true; setUnlimited(v); };

  async function onSave() {
    if (!curStuId) return;
    setBusy(true);
    try {
      const data = await saveRAISD(curStuId, {
        responses: { ...responses, _meta: { ranking, banned, unlimited } },
      });
      updateStudentData(curStuId, (cur) => ({ ...cur, raisd: data.data }));
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch (_) { /* ignore */ } }
      dirtyRef.current = false;
      toast('선호/강화물 저장 완료');
      onClose();
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={680}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>💡 선호/강화물 탐색 (RAISD)</h3>
        <button className="btn btn-pri btn-sm" onClick={onSave} disabled={busy}>💾 저장</button>
      </div>
      <p style={{ fontSize: '.84rem', color: 'var(--sub)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        장애학생을 위한 강화제 평가 (Reinforcer Assessment for Individuals with Severe Disabilities).
        교사·부모·보호자로부터 학생이 좋아하는 자극과 강화제 정보를 최대한 많이 얻는 것이 목적입니다.
        각 질문에서 선호 항목을 적고 강도(1~5)를 체크한 뒤, 보다 구체적인 정보를 위해
        <strong> 추가 질문과 대답</strong>을 기록하세요.
        <em> (예: TV를 볼 때 가장 좋아하는 프로그램은? 거울 놀이는 혼자 하기를 좋아하나요, 함께 하기를 좋아하나요?)</em>
      </p>

      <Section title={`① 질문 1~10 (선호 자극·강화제)`} open={sec.qs} onToggle={() => toggleSec('qs')}>
      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="form-group" style={{ paddingBottom: 10, borderBottom: '1px dashed var(--border)' }}>
          <label className="form-label">{cat.label}</label>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 6 }}>{cat.question}</div>
          <input
            className="form-input"
            value={responses[cat.key]?.items || ''}
            onChange={(e) => update(cat.key, 'items', e.target.value)}
            placeholder="구체적 선호 항목 (쉼표로 구분)"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: '.78rem' }}>
            <span style={{ color: 'var(--muted)' }}>강도</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={'qchip' + (responses[cat.key]?.intensity === n ? ' on' : '')}
                onClick={() => update(cat.key, 'intensity', n)}
              >{n}</button>
            ))}
          </div>
          <input
            className="form-input"
            style={{ marginTop: 6 }}
            value={responses[cat.key]?.followup || ''}
            onChange={(e) => update(cat.key, 'followup', e.target.value)}
            placeholder="더 구체적인 정보를 위한 추가 질문과 대답"
          />
        </div>
      ))}
      </Section>

      {/* 자극 선호도 순위 */}
      <Section title="② 자극 선호도 순위 (1~16)" open={sec.rank} onToggle={() => toggleSec('rank')}>
      <div className="form-group">
        <div style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 8 }}>
          설문 작성이 끝나면, 목표행동 발생 시 제시할 수 있는 자극·제거할 수 없는 자극을 모두 선택하고
          (예: 장난감은 제시/제거 가능, 산책 활동은 제시/제거 불가), 자극별 카드를 만들어 응답자에게
          좋아하는 순서대로 나열하게 한 뒤 그 순서를 아래에 기록합니다.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {ranking.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 22, textAlign: 'right', fontSize: '.8rem', color: 'var(--muted)', flexShrink: 0 }}>{i + 1}.</span>
              <input className="form-input" value={v} onChange={(e) => updRank(i, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      </Section>

      <Section title="③ 사용 금지 / 무제한 사용 가능" open={sec.limits} onToggle={() => toggleSec('limits')}>
      <div className="form-group">
        <label className="form-label">🚫 사용하지 않았으면 하는 것</label>
        <input className="form-input" value={banned} onChange={(e) => setBannedDirty(e.target.value)} placeholder="위 목록 중 학생에게 사용하지 않았으면 하는 것" />
      </div>
      <div className="form-group">
        <label className="form-label">✅ 제한 없이 사용해도 되는 것</label>
        <input className="form-input" value={unlimited} onChange={(e) => setUnlimitedDirty(e.target.value)} placeholder="위 목록 중 제한 없이 사용해도 되는 것" />
      </div>
      </Section>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>취소</button>
        <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 저장</button>
      </div>
    </Modal>
  );
}
