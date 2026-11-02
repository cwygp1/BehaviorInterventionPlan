import { useEffect, useState } from 'react';
import { levelLabel } from '../../lib/schoolLevel';
import StuHero, { NoStudentHint, ProfileSummary } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import useAutoSave from '../../lib/hooks/useAutoSave';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useEntryDate } from '../../lib/hooks/useEntryDate';
import { useLLM } from '../../contexts/LLMContext';
import EditStudentModal from '../modals/EditStudentModal';
import AssessmentLauncher from '../student/AssessmentLauncher';
import DeadMansModal from '../modals/DeadMansModal';
import { deleteABC as apiDeleteABC, saveBIP as apiSaveBIP } from '../../lib/api/students';
import { parseLooseJSON } from '../../lib/utils/looseJson';
import { useAbcForm, AbcFormCard, sortAbc } from '../record/AbcForm';


// ABC 입력 폼(상태·초안·저장·카드 JSX)은 components/record/AbcForm.jsx로 옮겼다(새 디자인 2단계 — 빠른 기록 창과 같은 폼).

// LLM이 살짝 깨진 JSON을 줄 때 흔한 오류를 보정해 한 번 더 시도한다.
// JSON 파싱은 공용 강건 파서 사용(lib/utils/looseJson.js — jsonrepair 기반, 0824).

export default function ObservePage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const toast = useToast();
  const { callDetailed, status: llmStatus } = useLLM();
  const aiOn = llmStatus !== 'off';

  const entryDate = useEntryDate('observe'); // 기록 달력에서 고른 날짜(mds/33)
  // ABC 입력 폼 — 옮기기 전과 같은 자리(페이지 맨 위 훅)에서 지금 학생으로 부른다.
  const abcForm = useAbcForm({ studentId: curStuId, entryDate });
  const [editOpen, setEditOpen] = useState(false);
  const [deadOpen, setDeadOpen] = useState(false);

  // 0825(동료 피드백): 표적행동 선정·조작적 정의를 중재계획(BIP) 화면에서 이곳(관찰)으로 이동.
  // 데이터는 종전대로 bip_data.opdef에 저장(부분 업데이트 — 다른 BIP 필드는 건드리지 않음).
  const [opdef, setOpdef] = useState('');
  const [opdefBusy, setOpdefBusy] = useState(false);
  useEffect(() => {
    setOpdef(curStuData?.bip?.opdef || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curStuId, curStuDataLoaded]);
  const opdefDirty = curStuDataLoaded && opdef !== String(curStuData?.bip?.opdef || '');
  useAutoSave({
    enabled: !!curStuId && curStuDataLoaded,
    dirty: opdefDirty,
    signal: opdef,
    save: saveOpdefCore,
    delay: 2000,
  });


  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  // 서버 데이터 도착 전 입력 UI를 띄우지 않는다 — 로드 중 입력이 덮어써지는 것 방지.
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="관찰 기록을 불러오는 중…" /></>;

  const abc = curStuData?.abc || [];
  const abcSorted = sortAbc(abc);

  // 조작적 정의 저장(자동 저장용) — bip_data에 opdef만 부분 저장.
  // (함수 선언 호이스팅으로 위 useAutoSave에서 참조 가능)
  async function saveOpdefCore() {
    await apiSaveBIP(curStuId, { opdef });
    updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), opdef } }));
  }

  // 0719: ABC 누적 기록으로 표적행동 조작적 정의 초안 생성. (0825: BIP 화면에서 이동)
  async function aiOpdef() {
    if (!aiOn) { toast('AI가 지금 꺼져 있어요. 직접 쓰기는 그대로 돼요 — 연결은 관리자에게 알려 주세요.'); return; }
    const abcs = (curStuData?.abc || []).slice(0, 12);
    if (!abcs.length) { toast('ABC 관찰 기록이 없어요. 아래에서 먼저 기록하세요.'); return; }
    setOpdefBusy(true);
    try {
      const prompt =
        '/no_think\n너는 특수교육 행동지원(PBS) 전문가다. 아래 ABC 관찰 기록을 바탕으로 표적행동(문제행동)의 "조작적 정의"를 작성하라.\n' +
        '- 눈으로 보고 셀 수 있는 구체적 움직임으로("죽은 사람 검사" 통과), 시작·끝을 알 수 있게 1~2문장.\n' +
        '- 추측·감정 표현(화가 나서, 반항적으로 등) 금지. 쉬운 우리말.\n' +
        (opdef.trim() ? `- 교사가 쓴 초안을 다듬어라: "${opdef.trim()}"\n` : '') +
        '[ABC 기록]\n' + abcs.map((r) => `- A: ${r.a} / B: ${r.b} / C: ${r.c}`).join('\n') + '\n' +
        '반드시 JSON만 출력: {"opdef":"..."}';
      const r = await callDetailed(prompt, { temperature: 0.3, tier: 'fast', label: '조작적 정의 생성' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      const j = parseLooseJSON(out);
      if (!String(j.opdef || '').trim()) throw new Error('정의를 받지 못했어요.');
      setOpdef(String(j.opdef).trim());
      toast('조작적 정의 초안을 만들었어요. 다듬으면 자동 저장됩니다.');
    } catch (e) { toast('생성 실패: ' + e.message); }
    finally { setOpdefBusy(false); }
  }

  async function onDelete(id) {
    // 0923: 확인 없이 바로 지워지던 것 — 삭제 전에 한 번 묻는다(되돌릴 수 없음).
    const r = abc.find((x) => x.id === id);
    const when = r ? (r.date || r.created_at || '') : '';
    if (!window.confirm(`이 ABC 기록${when ? `(${when})` : ''}을 삭제할까요?\n지운 기록은 되돌릴 수 없어요.`)) return;
    try {
      await apiDeleteABC(curStuId, id);
      updateStudentData(curStuId, (cur) => ({ ...cur, abc: cur.abc.filter((r) => r.id !== id) }));
      toast('삭제됨');
    } catch (e) {
      toast('삭제 실패: ' + e.message);
    }
  }

  return (
    <>
      <StuHero />

      {/* 0825 피드백: 이 화면의 작성 순서를 드러냄 — 표적행동 선정·조작적 정의가 BIP에서 이동해 옴 */}
      <div className="card" style={{ background: 'var(--pri-soft)', borderColor: 'var(--pri-l)', fontSize: '.84rem', lineHeight: 1.6 }} data-tour="ob-order">
        🧭 <strong>작성 순서</strong> — ① <strong>학생 기초 평가</strong>(초기면담지·강화제 평가·우선순위)로 재료를 모으고, ② <strong>표적행동 선정·조작적 정의</strong>로 다룰 행동을 확정한 뒤, ③ <strong>ABC 관찰 기록</strong>을 쌓습니다. 가설 설정과 중재 전략은 중재계획(BIP) 화면에서 이어져요.
      </div>

      <div className="card" data-tour="ob-profile">
        <div className="card-title">👤 학생 프로필</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.88rem', color: 'var(--sub)' }}>
          <span><strong>ID:</strong> {curStu.code}</span>
          <span><strong>학교급:</strong> {levelLabel(curStu.level) || '미지정'}</span>
          <span><strong>장애:</strong> {curStu.disability}</span>
        </div>
        <ProfileSummary stu={curStu} style={{ marginTop: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(true)}>프로필 수정</button>
        </div>
      </div>

      {/* 0821: 강화제 평가·표적행동 우선순위를 큰 카드로 — 프로필 하단 작은 버튼이라 잘 안 쓰이던 문제 */}
      <AssessmentLauncher />

      {/* 0825(동료 피드백): 표적행동의 선정과 조작적 정의 — 중재계획(BIP) 화면에서 이동.
          "행동을 정의하는 일"은 관찰의 일부, "행동을 해석하는 일(가설·전략)"은 BIP에 남긴다. */}
      <div className="card" data-tour="ob-opdef">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>🪄 표적행동의 선정과 조작적 정의</div>
            <div className="card-subtitle">우선순위 1순위 행동을, 눈으로 보고 셀 수 있는 구체적 행동으로 정의합니다. 입력하면 자동 저장돼요.</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" data-help="ob-deadman" onClick={() => setDeadOpen(true)} title='"죽은 사람 검사"로 행동 표현을 점검'>🧟 조작적 정의 도우미</button>
            {aiOn && <button className="btn btn-ghost btn-sm" data-help="ob-opdef-ai" onClick={aiOpdef} disabled={opdefBusy}>{opdefBusy ? '생성 중…' : '✨ ABC 기록으로 AI 초안'}</button>}
          </div>
        </div>
        <textarea className="form-textarea" aria-label="표적행동 조작적 정의" rows={2} value={opdef} onChange={(e) => setOpdef(e.target.value)}
          placeholder='예: 과제를 제시받으면 3초 이내에 "싫어"라고 소리치며 책상 위 물건을 바닥으로 던진다.' />
      </div>

      <AbcFormCard f={abcForm} onNavigate={onNavigate} aiOn={aiOn} />

      <div className="card" data-tour="ob-list">
        <div className="card-title">📄 누적 ABC 기록 <span className="badge badge-pri">{abc.length}건</span></div>
        {abc.length === 0 ? (
          <div className="empty-state"><span className="emoji">📄</span>저장된 기록이 없습니다.</div>
        ) : (
          <ul className="data-list">
            {abcSorted.map((r) => (
              <li key={r.id} className="data-item" data-help="ob-row">
                <button className="data-item-del" onClick={() => onDelete(r.id)} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri" title="기록 해당일(관찰일)">📅 {r.date || r.created_at}</span>
                  <span className="data-item-date">{r.time || ''}<span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>작성 {r.created_at || '-'}</span></span>
                </div>
                <div className="data-item-body">
                  {r.setting && <><strong>배경:</strong> {String(r.setting).replace(/\n/g, ' · ')}<br /></>}
                  <strong>A:</strong> {r.a}<br />
                  <strong>B:</strong> {r.b}<br />
                  <strong>C:</strong> {r.c}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>


      <EditStudentModal open={editOpen} onClose={() => setEditOpen(false)} />
      <DeadMansModal open={deadOpen} onClose={() => setDeadOpen(false)} />
    </>
  );
}