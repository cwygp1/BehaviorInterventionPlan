import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { useLLM } from '../../contexts/LLMContext';
import { EditableChipGroup } from '../ui/QChip';
import TokenField from '../ui/TokenField';
import AIActionBar from '../ui/AIActionBar';
import Modal from '../ui/Modal';
import NextStepBanner, { useSavedFlag, hintNextStep } from '../ui/NextStepBanner';
import { createABC as apiCreateABC } from '../../lib/api/students';
import { parseLooseJSON } from '../../lib/utils/looseJson';
import { escortSignal } from '../../lib/escortSignal';
import { PillRadio, QField } from '../quick/QuickBits';

// 칩 목록은 lib/chartCatalog.js 단일 출처(1001) — 사용자 차트가 같은 목록으로 자유 입력을 묶는다.
import { ABC_TIMES, ABC_PLACES, A_CHIPS, B_CHIPS, C_CHIPS, SETTING_CHIPS } from '../../lib/chartCatalog';

// ABC 관찰 입력 폼 — ObservePage에서 떼어 냈다(새 디자인 2단계, mds/54 §2-1 #15).
//   · useAbcForm(studentId)  상태·초안·지난 기록 불러오기·저장(기존 저장 API createABC 그대로). 학생 id는 prop으로 받는다.
//   · AbcFormCard            기존 화면(ObservePage)의 'ABC 행동 관찰 기록 작성' 카드 — 옮기기 전 JSX 그대로.
//   · AbcForm(기본)          빠른 기록 창용 — 같은 훅 + 새 디자인 입력칸. 학생이 바뀌면 key로 새로 마운트한다(mds/54 §6 위험 7).
//   기존 화면은 훅을 페이지 맨 위에서 curStuId로 부르므로 동작(초안 키 abcDraft:학생id·달력 날짜·지난 기록 불러오기·
//   저장 후 안내·다음 단계 반짝임·길잡이 신호)이 옮기기 전과 같다.

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
    'A=선행사건(행동 직전 상황), B=행동(관찰 가능한 행동), C=후속결과(행동 직후 일어난 일), S=배경사건(그날의 조건: 수면 부족·투약 변경·아침 갈등·일정 변경·아픔 등 — 문장에 없으면 빈 문자열).\n' +
    '각 요소는 관찰 가능한 사실로 간결하게. 반드시 JSON 객체 하나만 출력:\n' +
    '{"a":"...","b":"...","c":"...","s":""}\n\n문장: ' + String(text || '').trim()
  );
}

// 관찰일(date) 기준 최신순. 같은 날짜는 작성시각(created_at) → id로 안정 정렬(ObservePage와 같은 규칙).
export function sortAbc(abc) {
  const abcKey = (r) => `${r.date || r.created_at || ''}`;
  return (abc || []).slice().sort((a, b) => {
    const d = abcKey(b).localeCompare(abcKey(a));
    if (d !== 0) return d;
    const c = String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (c !== 0) return c;
    return (b.id || 0) - (a.id || 0);
  });
}

// 지난 기록의 '시간 / 장소' 글자를 두 칸으로.
export function splitTimePlace(time) {
  const parts = String(time || '').split('/').map((s) => s.trim());
  return [parts[0] || '', parts[1] || ''];
}

/**
 * @param {object} p
 * @param {number|null} p.studentId
 * @param {string|null} [p.entryDate]  기록 달력에서 고른 날짜(부르는 쪽이 useEntryDate('observe')로 받아 넘김)
 * @param {'page'|'quick'} [p.variant]
 */
export function useAbcForm({ studentId, entryDate = null, variant = 'page' }) {
  const { studentDataCache, updateStudentData } = useStudents();
  const toast = useToast();
  const { callDetailed } = useLLM();
  const data = studentId ? studentDataCache[studentId] : null;
  const quick = variant === 'quick';

  const [date, setDate] = useState(() => entryDate || new Date().toISOString().slice(0, 10));
  const [timeVal, setTimeVal] = useState('');
  const [placeVal, setPlaceVal] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const [setting, setSetting] = useState(''); // 0914: 배경사건(선택)
  const [busy, setBusy] = useState(false);
  // 0819 피드백: 저장 성공 후 "다음 단계(기능평가)로 이동" 배너 — 새 기록을 입력하면 숨김.
  const [savedOk, markSaved] = useSavedFlag([a, b, c]);

  // 빠른 입력(한 문장 → A·B·C 분배)
  const [quickText, setQuickText] = useState('');
  const [qcBusy, setQcBusy] = useState(false);
  const [qcPasteOpen, setQcPasteOpen] = useState(false);
  const [qcPaste, setQcPaste] = useState('');

  const [exOpen, setExOpen] = useState(false);

  // Sync time+place into the abcTime field display
  const timeText = [timeVal, placeVal].filter(Boolean).join(' / ');

  // ── 작성 중 내용 자동 임시저장 (학생별, 브라우저 세션) ──────────────
  // 다른 페이지/학생을 다녀와도 작성하던 ABC 내용이 사라지지 않도록 복원한다.
  //   빠른 기록 창도 같은 키를 쓴다(창에서 쓰다 만 내용이 기록 탭에서도 이어짐). 단 창은 시간·장소를 지난번 값으로
  //   미리 채우므로, 사건 내용(A·B·C·배경사건)이 하나라도 있을 때만 적는다.
  const draftKey = studentId ? `abcDraft:${studentId}` : null;
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setA(d.a || ''); setB(d.b || ''); setC(d.c || ''); setSetting(d.setting || '');
        setTimeVal(d.timeVal || ''); setPlaceVal(d.placeVal || '');
        if (d.date && !entryDate) setDate(d.date); // 달력에서 날짜를 골라 왔으면 그 날짜가 우선
        restoredRef.current = true;
      } else {
        setA(''); setB(''); setC(''); setSetting(''); setTimeVal(''); setPlaceVal('');
      }
    } catch (_) { /* ignore */ }
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      const empty = quick ? (!a && !b && !c && !setting) : (!a && !b && !c && !setting && !timeVal && !placeVal);
      if (empty) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify({ a, b, c, setting, timeVal, placeVal, date }));
    } catch (_) { /* ignore */ }
  }, [a, b, c, setting, timeVal, placeVal, date, draftKey]);

  const abc = data?.abc || [];
  const abcSorted = useMemo(() => sortAbc(abc), [abc]);
  const last = abcSorted[0] || null;

  // 빠른 기록 창: 시간·장소만 지난번 값으로 미리 채운다(사건 내용은 비워 둔다, 프로토타입 ④). 초안이 있으면 초안이 우선.
  //   (ref로 '한 번만'을 막지 않는다 — 개발 모드 StrictMode의 효과 두 번 실행에서 초안 효과가 칸을 비운 뒤에도 다시 채우게.
  //    대신 시간·장소가 이미 있으면 건드리지 않는다.)
  useEffect(() => {
    if (!quick || !data || restoredRef.current || !last) return;
    if (timeVal || placeVal) return;
    const [t, p] = splitTimePlace(last.time);
    setTimeVal(t); setPlaceVal(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, data, last]);

  // 분배 결과(JSON {a,b,c})를 A/B/C 칸에 반영(빈 칸 채움, 있으면 덧붙임).
  function applySplit(j) {
    if (j.a != null) setA((prev) => mergeField(prev, j.a));
    if (j.b != null) setB((prev) => mergeField(prev, j.b));
    if (j.c != null) setC((prev) => mergeField(prev, j.c));
    if (j.s) setSetting((prev) => mergeField(prev, j.s)); // 배경사건은 문장에 있을 때만
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
      toast('AI 응답을 읽지 못했어요: ' + e.message, 'error');
    }
  }

  // 같은 학생의 가장 최근 ABC 기록을 편집 폼에 불러온다(달라진 부분만 수정).
  function recallLast() {
    const last = abcSorted[0]; // 관찰일 기준 최신 기록
    if (!last) { toast('불러올 지난 기록이 없어요.'); return; }
    setA(last.a || ''); setB(last.b || ''); setC(last.c || ''); setSetting(last.setting || '');
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
      const body = { date, time: timeText, setting, a, b, c };
      const res = await apiCreateABC(studentId, body);
      const newRec = res.record;
      updateStudentData(studentId, (cur) => ({ ...cur, abc: [newRec, ...cur.abc] }));
      setA(''); setB(''); setC(''); setSetting(''); setTimeVal(''); setPlaceVal('');
      try { if (draftKey) sessionStorage.removeItem(draftKey); } catch (_) { /* ignore */ }
      toast('ABC 기록 저장 완료', 'success');
      markSaved(); hintNextStep('qabf'); // 저장 확인 + 사이드바 다음 메뉴 반짝임
      escortSignal('abc-saved'); // 🧭 길잡이 '저장' 단계 끝
    } catch (e) {
      toast('저장 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  // 빠른 기록 창 저장 — 같은 API·같은 본문·같은 캐시 갱신. 알림은 창이 띄우므로 결과만 돌려준다.
  //   빈 칸이면 막고 어느 칸인지 알려 준다(기존 화면과 같은 규칙: A·B·C 모두 필요).
  async function saveQuick() {
    const empty = [!a.trim() && 'a', !b.trim() && 'b', !c.trim() && 'c'].filter(Boolean);
    if (empty.length) return { ok: false, field: empty[0], error: '그 전에 있었던 일 · 학생 행동 · 그 뒤에 일어난 일, 세 칸을 모두 적어 주세요.' };
    setBusy(true);
    try {
      const body = { date, time: timeText, setting, a, b, c };
      const res = await apiCreateABC(studentId, body);
      const newRec = res.record;
      updateStudentData(studentId, (cur) => ({ ...cur, abc: [newRec, ...cur.abc] }));
      const [t, p] = [timeVal, placeVal];
      setA(''); setB(''); setC(''); setSetting('');
      setTimeVal(t); setPlaceVal(p); // 같은 학생을 한 번 더 적을 때를 위해 시간·장소는 남긴다
      try { if (draftKey) sessionStorage.removeItem(draftKey); } catch (_) { /* ignore */ }
      hintNextStep('qabf');
      escortSignal('abc-saved');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: '저장하지 못했어요 — ' + e.message };
    } finally {
      setBusy(false);
    }
  }

  // 창의 '버리고 닫기' — 쓰던 내용과 초안을 지운다.
  function discard() {
    setA(''); setB(''); setC(''); setSetting('');
    try { if (draftKey) sessionStorage.removeItem(draftKey); } catch (_) { /* ignore */ }
  }

  const dirty = !!(a.trim() || b.trim() || c.trim() || setting.trim());

  return {
    studentId, data, abc, abcSorted, last,
    date, setDate, timeVal, setTimeVal, placeVal, setPlaceVal, timeText,
    a, setA, b, setB, c, setC, setting, setSetting, busy,
    savedOk, quickText, setQuickText, qcBusy, qcPasteOpen, setQcPasteOpen, qcPaste, setQcPaste, exOpen, setExOpen,
    splitABC, applyPastedSplit, recallLast, onSave, saveQuick, discard, dirty,
  };
}

/** 기존 화면(ObservePage)의 'ABC 행동 관찰 기록 작성' 카드 + 작성 예시 창 — 옮기기 전 JSX 그대로. */
export function AbcFormCard({ f, onNavigate, aiOn }) {
  const {
    abc, date, setDate, timeVal, setTimeVal, placeVal, setPlaceVal, timeText,
    a, setA, b, setB, c, setC, setting, setSetting, busy,
    savedOk, quickText, setQuickText, qcBusy, qcPasteOpen, qcPaste, setQcPaste, exOpen, setExOpen,
    splitABC, applyPastedSplit, recallLast, onSave,
  } = f;
  return (
    <>
      <div className="card" data-help="ob-form">
        <div className="card-title">📋 ABC 행동 관찰 기록 작성</div>
        <div className="card-subtitle">선행사건(A) → 행동(B) → 결과(C)를 관찰 가능한 사실로 기록하세요.{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => setExOpen(true)}>작성 예시 보기</button>
        </div>

        {/* ⚡ 빠른 입력 — 한 문장(또는 음성) → A·B·C 자동 분배 */}
        <div className="quick-capture" data-tour="ob-quick">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <strong style={{ fontSize: '.88rem', color: 'var(--pri-d)' }}>⚡ 빠른 입력 — 상황을 한 문장으로 적으면 A·B·C로 자동 분배해 드려요</strong>
            {abc.length > 0 && (
              <button className="btn btn-ghost btn-sm" data-help="ob-recall" onClick={recallLast} title="가장 최근 기록을 불러와 수정">↩ 지난 기록 불러오기</button>
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
        {/* 0914(홍준표 부록): 배경사건 — 가설문 “〔배경사건〕이 있는 날” 절과 예방 전략 조정의 재료 */}
        <div className="form-group" data-tour="ob-setting">
          <label className="form-label">배경사건 (Setting event · 선택) <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.76rem' }}>— 행동 직전 사건(A)이 아니라, 그날 학생을 더 예민하게 만든 조건</span></label>
          <TokenField value={setting} onChange={setSetting} options={SETTING_CHIPS} storageKey="abc_setting" editPlaceholder="예: 수면 부족, 투약 변경 (없으면 비워 두세요)" />
          <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 4 }}>기록해 두면 중재 계획(BIP)의 가설문에 “〔배경사건〕이 있는 날”로 들어가고, 그런 날엔 예방 전략을 더 두텁게 쓸 수 있어요.</div>
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
          <button className="btn btn-pri" data-help="ob-save" onClick={onSave} disabled={busy}>💾 ABC 기록 저장</button>
          <span aria-hidden="true" style={{ color: 'var(--muted, #9aa3b2)' }}>→</span>
          <button className={'btn ' + (savedOk ? 'btn-pri' : 'btn-ghost')} onClick={() => onNavigate?.('qabf')}>📊 기능평가(QABF) →</button>
        </div>
        <NextStepBanner
          show={savedOk}
          message="✅ ABC 기록 저장 완료"
          hint="기록이 충분히 쌓였다면 오른쪽 버튼(기능평가)으로 행동의 기능을 평가해보세요"
        />
      </div>

      <Modal open={exOpen} onClose={() => setExOpen(false)} maxWidth={680}>
        <h3>📋 ABC 작성 예시</h3>
        <p style={{ fontSize: '.85rem', color: 'var(--sub)', marginTop: 6 }}>출처: 국립특수교육원</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: '.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>구분</th>
              <th style={{ padding: 8, textAlign: 'left', color: 'var(--err)' }}>❌ 나쁜 예시</th>
              <th style={{ padding: 8, textAlign: 'left', color: 'var(--ok-t)' }}>✅ 좋은 예시</th>
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
    </>
  );
}

const TIME_OPTS = ABC_TIMES;
const PLACE_OPTS = ABC_PLACES;
const withCur = (list, v) => (v && !list.includes(v) ? [v, ...list] : list);

/**
 * 빠른 기록 창 '관찰' 모드 — 새 디자인 입력칸. 저장은 창 바닥 단추가 ref.save()로 부른다.
 *   props: studentId(필수), onDirty(bool), 학생이 바뀌면 부르는 쪽이 key={studentId}로 새로 마운트.
 */
const AbcForm = forwardRef(function AbcForm({ studentId, onDirty }, ref) {
  const f = useAbcForm({ studentId, variant: 'quick' });
  const aRef = useRef(null); const bRef = useRef(null); const cRef = useRef(null);
  useEffect(() => { if (onDirty) onDirty(f.dirty); }, [f.dirty, onDirty]);
  useImperativeHandle(ref, () => ({
    save: async () => {
      const r = await f.saveQuick();
      if (!r.ok && r.field) { const el = { a: aRef, b: bRef, c: cRef }[r.field]?.current; if (el) el.focus(); }
      return r;
    },
    discard: f.discard,
    isDirty: () => f.dirty,
  }));
  if (!f.data) return <div className="kb-loading">지난 기록을 불러오는 중…</div>;
  const ref0 = (k) => (f.last && f.last[k] ? '지난번: ' + String(f.last[k]).replace(/\n/g, ' · ') : '');
  const id = (k) => `qa-${studentId}-${k}`;
  return (
    <div className="kb-q-body" data-tour="qr-obs">
      <div className="kb-q-banner">
        {f.last
          ? <>지난번 시간·장소를 미리 채웠어요. 사건 내용은 그날 일어난 일을 새로 적어 주세요.</>
          : <>처음 적는 관찰이에요. 그날 있었던 일을 있는 그대로 적어 주세요.</>}
        {f.last && (
          <div><button type="button" className="kb-btn" onClick={f.recallLast}>지난 기록 그대로 불러오기</button></div>
        )}
      </div>
      <div className="kb-q-row">
        <QField id={id('date')} label="날짜">
          <input id={id('date')} type="date" className="kb-q-input" value={f.date} onChange={(e) => f.setDate(e.target.value)} />
        </QField>
      </div>
      <PillRadio id={id('time')} label="시간" options={withCur(TIME_OPTS, f.timeVal)} value={f.timeVal} onChange={f.setTimeVal} allowClear small />
      <PillRadio id={id('place')} label="장소" options={withCur(PLACE_OPTS, f.placeVal)} value={f.placeVal} onChange={f.setPlaceVal} allowClear small />
      <QField id={id('a')} label="그 전에 있었던 일 (A · 선행사건)">
        <textarea id={id('a')} ref={aRef} className="kb-q-input" rows={2} value={f.a} onChange={(e) => f.setA(e.target.value)} placeholder={ref0('a') || '예: 수학 익힘책 15쪽을 풀라고 했을 때'} />
      </QField>
      <QField id={id('b')} label="학생 행동 (B · 눈으로 보고 셀 수 있게)">
        <textarea id={id('b')} ref={bRef} className="kb-q-input" rows={2} value={f.b} onChange={(e) => f.setB(e.target.value)} placeholder={ref0('b') || '예: "싫어!"라고 소리치며 책을 바닥에 던졌다'} />
      </QField>
      <QField id={id('c')} label="그 뒤에 일어난 일 (C · 결과)">
        <textarea id={id('c')} ref={cRef} className="kb-q-input" rows={2} value={f.c} onChange={(e) => f.setC(e.target.value)} placeholder={ref0('c') || '예: 교사가 다가가 "책을 주우세요"라고 했으나 거부함'} />
      </QField>
      <QField id={id('s')} label="배경사건 (선택 · 그날 학생을 더 예민하게 만든 조건)">
        <input id={id('s')} className="kb-q-input" value={f.setting} onChange={(e) => f.setSetting(e.target.value)} placeholder="예: 수면 부족, 투약 변경 (없으면 비워 두세요)" />
      </QField>
    </div>
  );
});

export default AbcForm;
