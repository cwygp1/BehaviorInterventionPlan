import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudents } from '../../contexts/StudentContext';
import { useToast } from '../../contexts/ToastContext';
import { QUICK_MODES, MODE_LABEL, nextQuickRow } from '../../lib/todo';
import AbcForm from '../record/AbcForm';
import BehaviorForm from '../record/BehaviorForm';
import CicoRowForm from '../record/CicoRowForm';
import SessionForm from '../record/SessionForm';
import EvalForm from './EvalForm';

// 빠른 기록 창(서랍) — 오늘 표의 줄 끝 단추로 연다(mds/52 §4-2, 프로토타입 v2 ④).
//   ① 모드(관찰·수치·점검표·회기·이달 평가 — 4단계에 5번째)마다 저장 상태가 따로 — 저장한 모드 칩에 ✓, 저장 단추는 '✓ HH:MM 저장함'
//   ② '다음 학생 ▶'은 그 학생에게 필요한 모드(연 모드)를 저장한 뒤에만 켜지고, 이동은 이 단추로만(저장 후 자동 이동 없음)
//   ③ 저장하지 않은 내용이 있는 채로 닫거나 다음 학생으로 가면 '계속 쓰기 / 저장하고 닫기 / 버리고 닫기'
//   ④ 관찰은 시간·장소만 지난번 값, 사건 내용은 비워 두고 지난 문장은 회색 참고문(AbcForm) ⑤ 수치가 지난번과 같으면 확인
//   ⑥ role=dialog aria-modal, 열 때 제목에 초점·닫을 때 연 단추로, Esc 닫기(확인 경유), 열린 동안 앱 본문 inert
//   ⑦ 저장은 기존 API 그대로(각 폼이 createABC·createMonitor·createFidelity·saveCICO·회기 패널을 쓴다)
//   폼은 학생 id를 prop으로 받고, 학생이 바뀌면 key로 통째로 새로 마운트한다(이전 학생 입력이 새 학생에 저장되는 사고 방지).
//   창은 모달이 아니라 .modal-bg를 쓰지 않는다(길잡이 판정, mds/54 §3-6). 앱(.app.kb-new) 밖 body에 포털로 그린다.

const nowHM = () => {
  try { return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (_e) { return '방금'; }
};

/**
 * @param {object} p
 * @param {{sid:number, mode:string, nonce:number}|null} p.start  열 학생·모드(null이면 닫힘)
 * @param {Array} p.rows  오늘 표 줄(lib/todo.js computeTodos().rows) — '다음 학생'·진행 표시 재료
 * @param {{total:number, recorded:number}} p.summary
 * @param {() => void} p.onClose
 * @param {(sid:number, mode:string) => void} p.onSaved  저장할 때마다(오늘 표 새로 고침)
 * @param {(hash:string) => void} p.onNavigate
 */
export default function QuickRecordDrawer({ start, rows, summary, onClose, onSaved, onNavigate }) {
  const { allStudents, selectStudent } = useStudents();
  const toast = useToast();
  const [sid, setSid] = useState(null);
  const [mode, setMode] = useState('obs');
  const [need, setNeed] = useState('obs'); // 이 학생에게 필요한(연) 모드 — 이것을 저장해야 '다음 학생'이 켜진다
  const [visited, setVisited] = useState({});
  const [saved, setSaved] = useState({}); // { mode: 'HH:MM' }
  const [dirty, setDirty] = useState({}); // { mode: bool }
  const [err, setErr] = useState('');
  const [sameAsk, setSameAsk] = useState(false);
  const [confirm, setConfirm] = useState(null); // null | 'close' | 'next'
  // 이 창에서 방금 저장해 끝낸 학생 → 그때 끝낸 할 일(task). 표가 새로 고쳐져 그 학생의 할 일이 바뀌면 다시 '다음 학생'이 된다.
  //   창을 새로 열 때마다 비운다(mds/56 #11).
  const [doneIds] = useState(() => new Map());
  const goAfterRef = useRef(null); // 확인 줄을 거쳐 닫은 뒤 옮겨 갈 주소(수첩 열기·IEP 목표 카드 열기, mds/56 #13)
  const formRefs = useRef({});
  const titleRef = useRef(null);
  const openerRef = useRef(null);
  const lastSidRef = useRef(null);
  const open = !!start && !!sid;

  // 학생을 새로 열 때 상태를 모두 비운다.
  const openFor = useCallback((nextSid, m) => {
    setSid(nextSid);
    setMode(m);
    setNeed(m);
    setVisited({ [m]: true });
    setSaved({}); setDirty({}); setErr(''); setSameAsk(false); setConfirm(null);
    formRefs.current = {};
    // 회기 패널은 '지금 학생'을 읽으므로 창에서 연 학생을 지금 학생으로 고른다(자료도 이때 받아 둔다).
    selectStudent(nextSid).catch(() => {});
  }, [selectStudent]);

  useEffect(() => {
    if (!start) { setSid(null); return; }
    doneIds.clear();
    goAfterRef.current = null;
    openerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    openFor(start.sid, start.mode || 'obs');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start && start.nonce]);

  // 열린 동안 앱 본문을 inert로(초점·클릭이 뒤로 새지 않게). 닫히면 연 단추로 초점을 돌려준다.
  useEffect(() => {
    if (!open) return undefined;
    const app = document.querySelector('.app.kb-new');
    if (app) app.inert = true;
    const t = setTimeout(() => titleRef.current && titleRef.current.focus(), 30);
    return () => {
      clearTimeout(t);
      if (app) app.inert = false;
      const el = openerRef.current;
      const lastSid = lastSidRef.current;
      setTimeout(() => {
        // 연 단추가 그대로 있으면 그 단추로, 저장 뒤 줄 단추가 바뀌어 사라졌으면 그 학생 줄의 이름 단추로.
        if (el && el.isConnected && el.focus) { el.focus(); return; }
        const alt = lastSid != null && document.querySelector(`[data-today-sid="${lastSid}"]`);
        if (alt && alt.focus) alt.focus();
      }, 30);
    };
  }, [open]);
  // 학생이 바뀌면 제목으로 초점.
  useEffect(() => { if (open) { const t = setTimeout(() => titleRef.current && titleRef.current.focus(), 30); return () => clearTimeout(t); } return undefined; }, [sid, open]);

  lastSidRef.current = sid;
  const stu = allStudents.find((s) => s.id === sid) || null;
  const row = (rows || []).find((r) => r.id === sid) || null;
  const anyDirty = Object.values(dirty).some(Boolean);
  // '오늘 관찰'은 관찰·수치·회기 중 하나면 된다(lib/todo.js 규칙과 같게). 점검표는 점검표를 저장해야.
  //   4단계 '이달 평가'로 연 학생은 이달 평가를 저장해야.
  const needSaved = need === 'chk' || need === 'eval' ? !!saved[need] : !!(saved.obs || saved.num || saved.ses);
  const nextRow = useMemo(() => nextQuickRow(rows || [], sid, doneIds), [rows, sid, doneIds, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const markSaved = useCallback((m) => {
    setSaved((s) => ({ ...s, [m]: nowHM() }));
    setDirty((d) => ({ ...d, [m]: false }));
    setErr(''); setSameAsk(false);
    if (need === 'chk' || need === 'eval' ? m === need : (m !== 'chk' && m !== 'eval')) doneIds.set(sid, need === 'chk' || need === 'eval' ? need : 'obs');
    if (onSaved) onSaved(sid, m);
  }, [need, sid, doneIds, onSaved]);

  const setDirtyFor = useCallback((m) => (v) => setDirty((d) => (d[m] === v ? d : { ...d, [m]: v })), []);
  const dirtyCbs = useMemo(() => ({ obs: setDirtyFor('obs'), num: setDirtyFor('num'), chk: setDirtyFor('chk'), ses: setDirtyFor('ses'), eval: setDirtyFor('eval') }), [setDirtyFor]);
  const onChkSaved = useCallback(() => markSaved('chk'), [markSaved]);
  const onSesSaved = useCallback(() => markSaved('ses'), [markSaved]);

  async function saveMode(m, force) {
    const f = formRefs.current[m];
    if (!f) return { ok: false, error: '아직 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.' };
    if (m === 'num' && !force && f.sameAsLast && f.sameAsLast()) { setSameAsk(true); setErr(''); return { ok: false, asked: true }; }
    const r = await f.save();
    if (r.ok) markSaved(m);
    return r;
  }

  async function onSave() {
    setConfirm(null);
    const r = await saveMode(mode, false);
    if (!r.ok && !r.asked) setErr(r.error || '저장하지 못했어요.');
    if (r.ok) toast(`${stu ? stu.code : ''} ${MODE_LABEL[mode]} 저장했어요${nextRow ? ` · 다음: ${nextRow.code}` : ''}`);
  }
  async function onSameYes() {
    setSameAsk(false);
    const r = await saveMode('num', true);
    if (!r.ok) setErr(r.error || '저장하지 못했어요.');
  }

  const closeNow = useCallback(() => {
    setConfirm(null); setSameAsk(false); setErr('');
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    goAfterRef.current = null;
    if (anyDirty) { setConfirm('close'); return; }
    closeNow();
  }, [anyDirty, closeNow]);

  // 창을 닫고 다른 화면으로 — 저장 안 한 내용이 있으면 확인 줄(저장하고/버리고) 뒤에 옮겨 간다(mds/56 #13).
  const requestGo = useCallback((hash) => {
    if (anyDirty) { goAfterRef.current = hash; setConfirm('close'); return; }
    goAfterRef.current = null;
    closeNow();
    onNavigate(hash);
  }, [anyDirty, closeNow, onNavigate]);
  const finishClose = () => {
    const go = goAfterRef.current;
    goAfterRef.current = null;
    closeNow();
    if (go) onNavigate(go);
  };

  function goNext() {
    if (!nextRow) { closeNow(); toast('오늘 빠른 기록으로 할 일이 모두 끝났어요'); return; }
    openFor(nextRow.id, nextRow.mode || 'obs');
  }
  function onNext() {
    if (!needSaved) return;
    if (anyDirty) { setConfirm('next'); return; }
    goNext();
  }

  // 저장하고 닫기(또는 저장하고 다음) — 쓰던 모드를 차례로 저장. 하나라도 실패하면 멈추고 알려 준다.
  async function saveAllThen() {
    const target = confirm;
    // 회기는 패널 안 '💾 회기 저장' 단추로만 저장된다(3단계: 쓰다 만 표시는 SessionForm onDirty) — 그 모드로 돌려보낸다.
    if (dirty.ses) { setConfirm(null); setMode('ses'); setVisited((v) => ({ ...v, ses: true })); setErr('회기 기록은 칸 안의 ‘💾 회기 저장’ 단추로 저장해 주세요. 저장하면 다시 닫을 수 있어요.'); return; }
    const ms = ['obs', 'num', 'chk', 'eval'].filter((m) => dirty[m]);
    for (const m of ms) {
      // eslint-disable-next-line no-await-in-loop
      const r = await saveMode(m, true);
      if (!r.ok) { setConfirm(null); setMode(m); setVisited((v) => ({ ...v, [m]: true })); setErr(r.error || '저장하지 못했어요.'); return; }
    }
    setConfirm(null);
    if (target === 'next') goNext(); else finishClose();
  }
  function discardThen() {
    const target = confirm;
    ['obs', 'num', 'chk', 'eval'].forEach((m) => { const f = formRefs.current[m]; if (f && dirty[m] && f.discard) f.discard(); });
    setDirty({});
    setConfirm(null);
    if (target === 'next') goNext(); else finishClose();
  }

  // Esc — 확인을 거쳐 닫는다(확인 줄이 떠 있으면 확인 줄만 닫는다).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.modal-bg')) return; // 창 위에 뜬 다른 모달이 먼저
      e.preventDefault();
      if (confirm || sameAsk) { goAfterRef.current = null; setConfirm(null); setSameAsk(false); titleRef.current && titleRef.current.focus(); return; }
      requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, confirm, sameAsk, requestClose]);

  // 확인 줄이 뜨면 첫 단추로 초점.
  const askRef = useRef(null);
  useEffect(() => { if ((confirm || sameAsk) && askRef.current) askRef.current.focus(); }, [confirm, sameAsk]);

  if (!open || typeof document === 'undefined') return null;

  const pick = (m) => { setMode(m); setVisited((v) => ({ ...v, [m]: true })); setErr(''); setSameAsk(false); };
  const name = stu ? stu.code : '학생';
  const restGoal = row && (row.task === 'goal' || (row.rest || []).includes('goal'));
  const restEval = row && (row.task === 'eval' || (row.rest || []).includes('eval'));
  const nextLabel = needSaved ? '다음 학생 ▶' : `다음 학생 ▶ · ‘${MODE_LABEL[need]}’ 저장 뒤에 켜져요`;

  const body = (
    <div className="kb-new">
      <div className="kb-scrim" aria-hidden="true" onClick={requestClose} />
      <aside className="kb-drawer" role="dialog" aria-modal="true" aria-labelledby="kb-q-title" data-tour="quick-drawer">
        <div className="kb-dh">
          <span className="kb-av1" aria-hidden="true">{name.slice(0, 1)}</span>
          <h2 id="kb-q-title" ref={titleRef} tabIndex={-1}>{name} · {MODE_LABEL[mode]}</h2>
          <button type="button" className="kb-btn kb-sq" aria-label="빠른 기록 창 닫기" onClick={requestClose}>×</button>
        </div>
        <div className="kb-dsub">
          오늘 기록 {summary ? `${summary.recorded}/${summary.total}` : '-'}
          {nextRow ? ` · 다음: ${nextRow.code}(${MODE_LABEL[nextRow.mode] || '관찰'})` : ' · 다음 학생 없음'}
        </div>
        <div className="kb-dmodes" role="group" aria-label="기록 종류" data-tour="quick-modes">
          {QUICK_MODES.map((m) => (
            <button key={m.key} type="button" className="kb-pill" aria-pressed={mode === m.key} onClick={() => pick(m.key)}>
              {m.label}{saved[m.key] ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <div className="kb-db" key={sid}>
          {visited.obs && (
            <div hidden={mode !== 'obs'}>
              <AbcForm studentId={sid} ref={(r) => { formRefs.current.obs = r; }} onDirty={dirtyCbs.obs} />
            </div>
          )}
          {visited.num && (
            <div hidden={mode !== 'num'}>
              <BehaviorForm studentId={sid} ref={(r) => { formRefs.current.num = r; }} onDirty={dirtyCbs.num} />
            </div>
          )}
          {visited.chk && (
            <div hidden={mode !== 'chk'}>
              <CicoRowForm studentId={sid} ref={(r) => { formRefs.current.chk = r; }} onDirty={dirtyCbs.chk} onSaved={onChkSaved} />
            </div>
          )}
          {visited.eval && (
            <div hidden={mode !== 'eval'}>
              <EvalForm studentId={sid} ref={(r) => { formRefs.current.eval = r; }} onDirty={dirtyCbs.eval} onNavigate={onNavigate} onClose={closeNow} onGo={requestGo} />
            </div>
          )}
          {visited.ses && (
            <div hidden={mode !== 'ses'}>
              <p className="kb-dnote">회기 기록은 아래 칸의 저장 단추로 저장해요. 저장하면 위 ‘회기’에 ✓가 붙어요.</p>
              <SessionForm studentId={sid} onNavigate={onNavigate} onSaved={onSesSaved} onDirty={dirtyCbs.ses} />
            </div>
          )}
        </div>
        <div className="kb-dfw">
          {err && <div className="kb-strip kb-err" role="alert">{err}</div>}
          {sameAsk && (
            <div className="kb-strip kb-ask" role="alertdialog" aria-labelledby="kb-q-same">
              <div id="kb-q-same">지난 기록과 같아요. 그대로 저장할까요?</div>
              <div className="kb-go">
                <button type="button" ref={askRef} className="kb-btn kb-pri" onClick={onSameYes}>그대로 저장</button>
                <button type="button" className="kb-btn" onClick={() => setSameAsk(false)}>취소</button>
              </div>
            </div>
          )}
          {confirm && (
            <div className="kb-strip kb-ask" role="alertdialog" aria-labelledby="kb-q-cf">
              <div id="kb-q-cf">저장하지 않은 내용이 있어요.</div>
              <div className="kb-go">
                <button type="button" ref={askRef} className="kb-btn" onClick={() => { goAfterRef.current = null; setConfirm(null); titleRef.current && titleRef.current.focus(); }}>계속 쓰기</button>
                <button type="button" className="kb-btn kb-pri" onClick={saveAllThen}>{confirm === 'next' ? '저장하고 다음 학생' : '저장하고 닫기'}</button>
                <button type="button" className="kb-btn" onClick={discardThen}>{confirm === 'next' ? '버리고 다음 학생' : '버리고 닫기'}</button>
              </div>
            </div>
          )}
          {restGoal && (
            <div className="kb-dnote">
              {name}는 학기목표 쓰기가 남아 있어요 — 수첩에서 이어가요.{' '}
              <button type="button" className="kb-btn" onClick={() => requestGo(`#student/${sid}/iep`)}>수첩 열기</button>
            </div>
          )}
          {!restGoal && restEval && mode !== 'eval' && !saved.eval && (
            <div className="kb-dnote">
              {name}는 이번 달 IEP 평가도 남아 있어요.{' '}
              <button type="button" className="kb-btn" onClick={() => pick('eval')}>이달 평가 쓰기</button>
            </div>
          )}
          <div className="kb-df">
            {mode !== 'ses' && (
              <button type="button" className="kb-btn kb-pri" onClick={onSave} data-tour="quick-save">
                {saved[mode] && !dirty[mode] ? `✓ ${saved[mode]} 저장함` : '저장'}
              </button>
            )}
            <button type="button" className="kb-btn" onClick={onNext} disabled={!needSaved} data-tour="quick-next">{nextLabel}</button>
          </div>
        </div>
      </aside>
    </div>
  );
  return createPortal(body, document.body);
}
