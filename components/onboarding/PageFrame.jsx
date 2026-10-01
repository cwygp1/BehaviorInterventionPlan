import { useEffect, useState } from 'react';
import { useStudents } from '../../contexts/StudentContext';
import { PAGE_HELP } from '../../lib/helpText';
import { anchorSelector, firstStepFor, firstSentence, INTRO_SKIP, introHideKey, INTRO_ALL_OFF_KEY } from '../../lib/onboarding';
import StartChecklist from './StartChecklist';

// 화면 맨 위 안내 묶음(mds/46) — pages/index.js가 모든 화면 위에 놓는다. 화면 파일은 고치지 않는다.
//   방법 6  화면 소개 한 줄 — 도움말 문구(PAGE_HELP.what)를 ❓ 없이도 늘 보이게. ×로 이 화면/모든 화면에서 숨김.
//   방법 2  빈 화면 첫 할 일 — 기록이 0건이면 '첫 할 일' 한 줄 + 단추(입력 칸으로 스크롤 또는 앞 단계 화면으로).
//   방법 4  홈 '시작하기' 체크리스트(StartChecklist).

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_e) { /* 사생활 모드 */ } };

export function scrollToAnchor(key) {
  const el = document.querySelector(anchorSelector(key));
  if (!el) return false;
  try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_e) { el.scrollIntoView(); }
  el.classList.add('ob-flash');
  setTimeout(() => el.classList.remove('ob-flash'), 1800);
  return true;
}

function PageIntro({ page }) {
  const what = PAGE_HELP[page] && PAGE_HELP[page].what;
  const [hidden, setHidden] = useState(true); // 첫 그림은 숨김 → 저장값 읽은 뒤 표시(깜빡임 방지)
  useEffect(() => { setHidden(lsGet(INTRO_ALL_OFF_KEY) === '1' || lsGet(introHideKey(page)) === '1'); }, [page]);
  if (!what || hidden || INTRO_SKIP.includes(page)) return null;
  // '이 화면은 …곳이에요.' 문장 그대로 — 첫 문장만(둘째 문장은 ❓ 도움말에서).
  const first = firstSentence(what);
  return (
    <div className="ob-intro" role="note">
      <span className="ob-intro-ico" aria-hidden="true">💡</span>
      <span className="ob-intro-t">{first}</span>
      <button type="button" className="ob-intro-x" onClick={() => { lsSet(introHideKey(page), '1'); setHidden(true); }} title="이 화면에서 이 줄 숨기기" aria-label="이 화면 소개 숨기기">×</button>
      <button type="button" className="ob-intro-all" onClick={() => { lsSet(INTRO_ALL_OFF_KEY, '1'); setHidden(true); }} title="모든 화면의 소개 줄 숨기기">모두 숨기기</button>
    </div>
  );
}

function FirstStepCard({ page, onNavigate }) {
  const { curStu, curStuId, curStuData, curStuDataLoaded, homeSummary } = useStudents();
  const iepCount = curStuId && homeSummary?.summaries?.[curStuId] ? (homeSummary.summaries[curStuId].iep_count ?? null) : null;
  const step = firstStepFor(page, { curStu, curStuData, curStuDataLoaded, iepCount });
  if (!step) return null;
  const onGo = () => {
    if (step.anchor) scrollToAnchor(step.anchor);
    else if (step.go) onNavigate(step.go);
  };
  return (
    <div className="ob-first" role="note">
      <div className="ob-first-ico" aria-hidden="true">🌱</div>
      <div className="ob-first-body">
        <div className="ob-first-t">{step.title}</div>
        <div className="ob-first-s">{step.text}</div>
      </div>
      <button type="button" className="btn btn-pri btn-sm ob-first-btn" onClick={onGo}>{step.cta}</button>
    </div>
  );
}

export default function PageFrame({ page, onNavigate }) {
  // 체험 시연 중엔 화면 위 안내를 접는다(자막과 같은 말을 하고 자리만 차지함).
  const [demoActive, setDemoActive] = useState(false);
  useEffect(() => {
    const sync = () => setDemoActive(document.body.classList.contains('demo-active'));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  if (demoActive) return null;
  return (
    <>
      {page === 'home' && <StartChecklist onNavigate={onNavigate} />}
      <PageIntro page={page} />
      <FirstStepCard page={page} onNavigate={onNavigate} />
    </>
  );
}
