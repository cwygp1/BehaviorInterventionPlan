import { useEffect, useState } from 'react';
import StuHero, { NoStudentHint, ProfileSummary } from '../student/StuHero';
import { FormLoading } from '../../lib/hooks/useFormLoad';
import useAutoSave from '../../lib/hooks/useAutoSave';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup } from '../ui/QChip';
import TokenField from '../ui/TokenField';
import AIActionBar from '../ui/AIActionBar';
import Modal from '../ui/Modal';
import EditStudentModal from '../modals/EditStudentModal';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import AssessmentLauncher from '../student/AssessmentLauncher';
import DeadMansModal from '../modals/DeadMansModal';
import { createABC as apiCreateABC, deleteABC as apiDeleteABC, saveBIP as apiSaveBIP } from '../../lib/api/students';
import { parseLooseJSON } from '../../lib/utils/looseJson';

const ABC_TIMES = ['1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '쉬는 시간', '점심', '등교', '하교'];
const ABC_PLACES = ['교실', '복도', '운동장', '급식실', '특별실', '통합학급', '화장실', '보건실'];
const A_CHIPS = ['지시 받음', '활동 전환 시', '휴식 끝날 때', '또래와 갈등', '감각 자극(소음/조명)', '낯선 환경', '대기 시간', '평가/시험 시작', '좋아하는 활동 종료', '요구 거절됨'];
const B_CHIPS = ['자리 이탈', '소리 지르기', '물건 던지기', '거부', '회피', '공격 행동', '자해', '반복 행동', '울기', '도주', '무반응', '자기 자극'];
const C_CHIPS = ['교사 개입', '활동 중단', '또래 분리', '심리안정실 이용', '강화 제공', '계획적 무시', '대체행동 촉진', '위기관리팀 호출', '보호자 통보', '학생 진정'];

// 빈 칸이면 채우고, 내용이 있으면 줄바꿈으로 덧붙인다(빠른 입력 분배·붙여넣기 공용).
function mergeField(prev, val) {
  const v = String(val || '').trim();
  if (!v) return prev;
  return prev && prev.trim() ? prev.trim() + '\n' + v : v;
}

// 한 문장 → A·B·C 분배용 프롬프트(AI 호출/외부 복사 공용).
function buildSplitPrompt(text) {
  return (
    '다음 한국어 문장을 ABC 행동관찰의 세 요소로 나눠라.\n' +
    'A=선행사건(행동 직전 상황), B=행동(관찰 가능한 행동), C=후속결과(행동 직후 일어난 일).\n' +
    '각 요소는 관찰 가능한 사실로 간결하게. 반드시 JSON 객체 하나만 출력:\n' +
    '{"a":"...","b":"...","c":"..."}\n\n문장: ' + String(text || '').trim()
  );
}

// LLM이 살짝 깨진 JSON을 줄 때 흔한 오류를 보정해 한 번 더 시도한다.
// JSON 파싱은 공용 강건 파서 사용(lib/utils/looseJson.js — jsonrepair 기반, 0824).

export default function ObservePage({ onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, updateStudentData } = useStudents();
  const toast = useToast();
  const { callDetailed, status: llmStatus } = useLLM();
  const aiOn = llmStatus !== 'off';

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeVal, setTimeVal] = useState('');
  const [placeVal, setPlaceVal] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const [busy, setBusy] = useState(false);
  // 0819 피드백: 저장 성공 후 "다음 단계(기능평가)로 이동" 배너 — 새 기록을 입력하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([a, b, c]);

  // 빠른 입력(한 문장 → A·B·C 분배)
  const [quickText, setQuickText] = useState('');
  const [qcBusy, setQcBusy] = useState(false);
  const [qcPasteOpen, setQcPasteOpen] = useState(false);
  const [qcPaste, setQcPaste] = useState('');

  const [exOpen, setExOpen] = useState(false);
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

  // Sync time+place into the abcTime field display
  const timeText = [timeVal, placeVal].filter(Boolean).join(' / ');

  // ── 작성 중 내용 자동 임시저장 (학생별, 브라우저 세션) ──────────────
  // 다른 페이지/학생을 다녀와도 작성하던 ABC 내용이 사라지지 않도록 복원한다.
  const draftKey = curStuId ? `abcDraft:${curStuId}` : null;
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setA(d.a || ''); setB(d.b || ''); setC(d.c || '');
        setTimeVal(d.timeVal || ''); setPlaceVal(d.placeVal || '');
        if (d.date) setDate(d.date);
      } else {
        setA(''); setB(''); setC(''); setTimeVal(''); setPlaceVal('');
      }
    } catch (_) { /* ignore */ }
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const empty = !a && !b && !c && !timeVal && !placeVal;
      if (empty) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify({ a, b, c, timeVal, placeVal, date }));
    } catch (_) { /* ignore */ }
  }, [a, b, c, timeVal, placeVal, date, draftKey]);

  if (!curStu) return <><StuHero /><NoStudentHint /></>;
  // 서버 데이터 도착 전 입력 UI를 띄우지 않는다 — 로드 중 입력이 덮어써지는 것 방지.
  if (!curStuDataLoaded) return <><StuHero /><FormLoading label="관찰 기록을 불러오는 중…" /></>;

  const abc = curStuData?.abc || [];
  // 목록은 관찰일(date) 기준 최신순. 예전에는 배열 순서를 그대로 뒤집기만 해서
  // 시드/일괄 입력처럼 created_at이 같은 기록들이 04-14 → 04-07 → 04-25 식으로
  // 뒤섞여 보였다. 같은 날짜는 작성시각(created_at) → id로 안정 정렬한다.
  const abcKey = (r) => `${r.date || r.created_at || ''}`;
  const abcSorted = abc.slice().sort((a, b) => {
    const d = abcKey(b).localeCompare(abcKey(a));
    if (d !== 0) return d;
    const c = String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (c !== 0) return c;
    return (b.id || 0) - (a.id || 0);
  });

  // 분배 결과(JSON {a,b,c})를 A/B/C 칸에 반영(빈 칸 채움, 있으면 덧붙임).
  function applySplit(j) {
    if (j.a != null) setA((prev) => mergeField(prev, j.a));
    if (j.b != null) setB((prev) => mergeField(prev, j.b));
    if (j.c != null) setC((prev) => mergeField(prev, j.c));
  }

  // AI 연결 시: 한 문장을 직접 호출로 A·B·C 분배.
  async function splitABC() {
    const text = quickText.trim();
    if (!text) { toast('나눌 내용을 먼저 적거나 🎤로 말해주세요.'); return; }
    setQcBusy(true);
    try {
      const r = await callDetailed('/no_think\n' + buildSplitPrompt(text), { temperature: 0.2, tier: 'fast' });
      const out = (r.content && r.content.trim()) ? r.content : (r.reasoning || '');
      applySplit(parseLooseJSON(out));
      setQuickText('');
      toast('A·B·C로 나눴어요. 확인 후 저장하세요.', 'success');
    } catch (e) {
      toast('AI 분리 실패: ' + e.message, 'error');
    } finally {
      setQcBusy(false);
    }
  }

  // AI 미연결 시: 외부 AI 응답(JSON)을 붙여넣어 분배.
  function applyPastedSplit() {
    try {
      applySplit(parseLooseJSON(qcPaste));
      setQcPaste(''); setQcPasteOpen(false); setQuickText('');
      toast('응답을 적용했어요. 확인 후 저장하세요.', 'success');
    } catch (e) {
      toast('JSON 파싱 실패: ' + e.message, 'error');
    }
  }

  // 조작적 정의 저장(자동 저장용) — bip_data에 opdef만 부분 저장.
  // (함수 선언 호이스팅으로 위 useAutoSave에서 참조 가능)
  async function saveOpdefCore() {
    await apiSaveBIP(curStuId, { opdef });
    updateStudentData(curStuId, (cur) => ({ ...cur, bip: { ...(cur.bip || {}), opdef } }));
  }

  // 0719: ABC 누적 기록으로 표적행동 조작적 정의 초안 생성. (0825: BIP 화면에서 이동)
  async function aiOpdef() {
    if (!aiOn) { toast('AI 미설정: 우측 상단 AI 버튼에서 연결을 먼저 설정하세요.'); return; }
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

  // 같은 학생의 가장 최근 ABC 기록을 편집 폼에 불러온다(달라진 부분만 수정).
  function recallLast() {
    const last = abcSorted[0]; // 관찰일 기준 최신 기록
    if (!last) { toast('불러올 지난 기록이 없어요.'); return; }
    setA(last.a || ''); setB(last.b || ''); setC(last.c || '');
    if (last.time) {
      const parts = String(last.time).split('/').map((s) => s.trim());
      setTimeVal(parts[0] || ''); setPlaceVal(parts[1] || '');
    }
    toast('지난 기록을 불러왔어요. 달라진 부분만 고치세요.', 'success');
  }

  async function onSave() {
    if (!a.trim() || !b.trim() || !c.trim()) { toast('A, B, C를 모두 입력해주세요.'); return; }
    setBusy(true);
    try {
      const body = { date, time: timeText, a, b, c };
      const res = await apiCreateABC(curStuId, body);
      const newRec = res.record;
      updateStudentData(curStuId, (cur) => ({ ...cur, abc: [newRec, ...cur.abc] }));
      setA(''); setB(''); setC(''); setTimeVal(''); setPlaceVal('');
      try { if (draftKey) sessionStorage.removeItem(draftKey); } catch (_) { /* ignore */ }
      toast('ABC 기록 저장 완료', 'success');
      markSaved(); hintNextStep('qabf'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
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
          <span><strong>학교급:</strong> {curStu.level}</span>
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
            <button className="btn btn-ghost btn-sm" onClick={() => setDeadOpen(true)} title='"죽은 사람 검사"로 행동 표현을 점검'>🧟 조작적 정의 도우미</button>
            {aiOn && <button className="btn btn-ghost btn-sm" onClick={aiOpdef} disabled={opdefBusy}>{opdefBusy ? '생성 중…' : '✨ ABC 기록으로 AI 초안'}</button>}
          </div>
        </div>
        <textarea className="form-textarea" rows={2} value={opdef} onChange={(e) => setOpdef(e.target.value)}
          placeholder='예: 과제를 제시받으면 3초 이내에 "싫어"라고 소리치며 책상 위 물건을 바닥으로 던진다.' />
      </div>

      <div className="card">
        <div className="card-title">📋 ABC 행동 관찰 기록 작성</div>
        <div className="card-subtitle">선행사건(A) → 행동(B) → 결과(C)를 관찰 가능한 사실로 기록하세요.{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setExOpen(true)}>작성 예시 보기</button>
        </div>

        {/* ⚡ 빠른 입력 — 한 문장(또는 음성) → A·B·C 자동 분배 */}
        <div className="quick-capture" data-tour="ob-quick">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: '.88rem', color: 'var(--pri-d)' }}>⚡ 빠른 입력 — 상황을 한 문장으로 적으면 A·B·C로 자동 분배해 드려요</strong>
            {abc.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={recallLast} title="가장 최근 기록을 불러와 수정">↩ 지난 기록 불러오기</button>
            )}
          </div>
          <div className="qc-row">
            <textarea className="form-textarea" style={{ minHeight: 58 }} value={quickText} onChange={(e) => setQuickText(e.target.value)}
              placeholder="예: 수학 익힘책 풀라고 했더니 '싫어!' 하며 책을 던졌고, 교사가 다가가 진정시켰다" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {aiOn && <button className="btn btn-pri btn-sm" onClick={splitABC} disabled={qcBusy}>{qcBusy ? '나누는 중…' : '✨ A·B·C로 나누기'}</button>}
              {/* 🌐 외부AI 연동 임시 비활성(0719 요청) — 복원 시 주석 해제
              <button className={'btn btn-sm ' + (aiOn ? 'btn-ghost' : 'btn-pri')} onClick={() => setQcPasteOpen((o) => !o)} title="프롬프트를 복사해 클로드·ChatGPT 등에서 실행 후 응답을 붙여넣기">🌐 외부AI</button> */}
            </div>
          </div>
          {qcPasteOpen && (
            <div style={{ marginTop: 10 }}>
              <AIActionBar prompt={buildSplitPrompt(quickText)} align="flex-start" />
              <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
                <label className="form-label">AI 응답(JSON)을 붙여넣고 적용</label>
                <textarea className="form-textarea" style={{ minHeight: 56 }} value={qcPaste} onChange={(e) => setQcPaste(e.target.value)}
                  placeholder={'{"a":"...","b":"...","c":"..."}'} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button className="btn btn-ok btn-sm" onClick={applyPastedSplit}>응답 적용</button>
              </div>
            </div>
          )}
        </div>

        <div className="form-row" data-tour="ob-when">
          <div className="form-group">
            <label className="form-label">날짜</label>
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">시간 / 장소</label>
            <input className="form-input" value={timeText} readOnly placeholder="시간/장소 칩에서 선택" />
            <EditableChipGroup label="시간" storageKey="abc_time" defaults={ABC_TIMES} mode="set" target={timeVal} onChange={setTimeVal} />
            <EditableChipGroup label="장소" storageKey="abc_place" defaults={ABC_PLACES} mode="set" target={placeVal} onChange={setPlaceVal} />
          </div>
        </div>
        <div className="form-group" data-tour="ob-a">
          <label className="form-label">A (선행사건, Antecedent)</label>
          <TokenField value={a} onChange={setA} options={A_CHIPS} storageKey="abc_a" editPlaceholder="행동 직전에 어떤 상황이 있었나요?" />
        </div>
        <div className="form-group" data-tour="ob-b">
          <label className="form-label">B (행동, Behavior)</label>
          <TokenField value={b} onChange={setB} options={B_CHIPS} storageKey="abc_b" editPlaceholder="학생이 정확히 어떤 행동을 했나요?" />
        </div>
        <div className="form-group" data-tour="ob-c">
          <label className="form-label">C (결과, Consequence)</label>
          <TokenField value={c} onChange={setC} options={C_CHIPS} storageKey="abc_c" editPlaceholder="행동 직후 어떤 결과가 발생했나요?" />
        </div>
        {/* 0819 피드백: 저장·다음 단계 버튼을 한곳에 — 다음 버튼은 저장 전 옅게, 저장 후 강조 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-pri" onClick={onSave} disabled={busy}>💾 ABC 기록 저장</button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('qabf')}>📊 기능평가(QABF) →</button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ ABC 기록 저장 완료"
          hint="기록이 충분히 쌓였다면 오른쪽 버튼(기능평가)으로 행동의 기능을 평가해보세요"
        />
      </div>

      <div className="card" data-tour="ob-list">
        <div className="card-title">📄 누적 ABC 기록 <span className="badge badge-pri">{abc.length}건</span></div>
        {abc.length === 0 ? (
          <div className="empty-state"><span className="emoji">📄</span>저장된 기록이 없습니다.</div>
        ) : (
          <ul className="data-list">
            {abcSorted.map((r) => (
              <li key={r.id} className="data-item">
                <button className="data-item-del" onClick={() => onDelete(r.id)} title="삭제" aria-label="삭제">×</button>
                <div className="data-item-head">
                  <span className="badge badge-pri" title="기록 해당일(관찰일)">📅 {r.date || r.created_at}</span>
                  <span className="data-item-date">{r.time || ''}<span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>작성 {r.created_at || '-'}</span></span>
                </div>
                <div className="data-item-body">
                  <strong>A:</strong> {r.a}<br />
                  <strong>B:</strong> {r.b}<br />
                  <strong>C:</strong> {r.c}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={exOpen} onClose={() => setExOpen(false)} maxWidth={680}>
        <h3>📋 ABC 작성 예시</h3>
        <p style={{ fontSize: '.85rem', color: 'var(--sub)', marginTop: 6 }}>출처: 국립특수교육원</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: '.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>구분</th>
              <th style={{ padding: 8, textAlign: 'left', color: 'var(--err)' }}>❌ 나쁜 예시</th>
              <th style={{ padding: 8, textAlign: 'left', color: 'var(--ok)' }}>✅ 좋은 예시</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: 8, fontWeight: 700 }}>A</td><td style={{ padding: 8 }}>기분이 안 좋아 보일 때</td><td style={{ padding: 8 }}>수학 익힘책 15쪽을 풀라고 했을 때</td></tr>
            <tr><td style={{ padding: 8, fontWeight: 700 }}>B<br /><span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)' }}>행동 정의</span></td><td style={{ padding: 8 }}>반항적으로 굴었다</td><td style={{ padding: 8 }}>"싫어!"라고 소리치며 책을 바닥에 던졌다</td></tr>
            <tr style={{ background: 'var(--surface2)' }}>
              <td style={{ padding: 8, fontWeight: 700, color: 'var(--pri-d)' }} colSpan={3}>
                ☝ B(행동)는 이렇게 정의하세요 — 죽은 사람 검사
                <div style={{ fontSize: '.82rem', fontWeight: 400, color: 'var(--sub)', marginTop: 4 }}>
                  "죽은 사람도 할 수 있으면 행동이 아닙니다." 그래서 행동(B)을 적을 때는 눈으로 보고 셀 수 있는 움직임으로 적어야 해요.<br />
                  ❌ "수업을 방해하지 않는다"(가만히 있는 것 → 죽은 사람도 함) → ✅ "수업 시간에 자리에 앉아 과제를 한다"
                </div>
              </td>
            </tr>
            <tr><td style={{ padding: 8, fontWeight: 700 }}>C</td><td style={{ padding: 8 }}>혼냈다</td><td style={{ padding: 8 }}>교사가 다가가 "책을 주우세요"라고 했으나 거부함</td></tr>
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-pri" onClick={() => setExOpen(false)}>확인</button>
        </div>
      </Modal>

      <EditStudentModal open={editOpen} onClose={() => setEditOpen(false)} />
      <DeadMansModal open={deadOpen} onClose={() => setDeadOpen(false)} />
    </>
  );
}
