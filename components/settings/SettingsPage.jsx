import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { isSimpleMode, SIMPLE_TIERS, FULL_TIERS } from '../../lib/onboarding';
import { FONT_KEY } from '../ui/FontSizeToggle';

// 도움 > 설정(#help/settings, 새 디자인 4단계 — mds/54 §7 '도움 > 설정', mds/52 §8 D3).
//   ① 화면 모양 바꾸기(users.ui_mode — 1단계 setUiMode 그대로)
//   ② 점검표 묶음 접기 — 저장은 users.used_tiers('3' = 접음, '1,2,3' = 펼침). 기존 디자인 사이드바 '간단 모드'와 같은 값이라
//      두 디자인의 설정이 어긋나지 않는다(mds/54 N6, D3 '저장소 하나 유지'). 새 테이블·열 없음.
//   ③ 글씨 크게 — <html data-font="lg"> + localStorage(kb_font_lg). 기존 FontSizeToggle과 같은 키, 새 디자인 글자 네 단도 1.125배.

export function useFontLarge() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(document.documentElement.getAttribute('data-font') === 'lg'); }, []);
  const set = (next) => {
    setOn(next);
    if (next) document.documentElement.setAttribute('data-font', 'lg');
    else document.documentElement.removeAttribute('data-font');
    try { if (next) localStorage.setItem(FONT_KEY, '1'); else localStorage.removeItem(FONT_KEY); } catch (_e) { /* 이번 화면에만 적용 */ }
  };
  return [on, set];
}

function OnOff({ id, on, onChange, busy, labels = ['켜기', '끄기'] }) {
  return (
    <div className="kb-q-grp" role="radiogroup" aria-labelledby={id}>
      <button type="button" role="radio" aria-checked={on} className="kb-pill" onClick={() => !on && onChange(true)} disabled={busy}>{labels[0]}</button>
      <button type="button" role="radio" aria-checked={!on} className="kb-pill" onClick={() => on && onChange(false)} disabled={busy}>{labels[1]}</button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, setUiMode, updateUsedTiers } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [font, setFont] = useFontLarge();
  const folded = isSimpleMode(user);

  const toLegacy = async () => {
    if (busy) return;
    setBusy('ui');
    try { await setUiMode('legacy'); } catch (e) { toast('화면 모양을 바꾸지 못했어요: ' + e.message); setBusy(''); }
  };
  const setFold = async (next) => {
    setBusy('fold');
    try {
      await updateUsedTiers(next ? SIMPLE_TIERS : FULL_TIERS);
      toast(next ? '우리 반의 점검표 묶음을 접어 두었어요.' : '우리 반의 점검표 묶음을 펼쳤어요.');
    } catch (e) { toast('설정을 저장하지 못했어요: ' + e.message); } finally { setBusy(''); }
  };

  return (
    <div className="kb-stack" data-tour="help-settings">
      <section className="kb-card" aria-labelledby="kb-set-h">
        <h2 className="kb-h3" id="kb-set-h">설정</h2>

        <div className="kb-set-row">
          <div>
            <b id="kb-set-ui">화면 모양</b>
            <div className="kb-small">지금은 새 디자인이에요. 바꿔도 기록은 그대로이고, 기존 디자인 왼쪽 아래 ‘새 디자인으로 보기’로 언제든 돌아와요.</div>
          </div>
          {user?.is_demo
            ? <span className="kb-small">체험 계정은 바꿀 수 없어요</span>
            : <button type="button" className="kb-btn kb-out" onClick={toLegacy} disabled={!!busy} data-tour="set-ui-switch">기존 디자인으로 바꾸기</button>}
        </div>

        <div className="kb-set-row">
          <div>
            <b id="kb-set-fold">점검표 묶음 접기</b>
            <div className="kb-small">우리 반의 약속·보상판 · 매일 점검표 · 처음 조사 · 교사 자가점검 탭을 ‘더 보기’ 한 칸으로 접어요. 기능은 그대로예요. 기존 디자인의 ‘간단 모드’와 같은 설정이라 양쪽이 함께 바뀌어요.</div>
          </div>
          <OnOff id="kb-set-fold" on={folded} onChange={setFold} busy={busy === 'fold'} labels={['접기', '펼치기']} />
        </div>

        <div className="kb-set-row">
          <div>
            <b id="kb-set-font">글씨 크게</b>
            <div className="kb-small">화면 글씨를 한 단계(1.125배) 크게 해요. 이 컴퓨터에만 기억돼요.</div>
          </div>
          <OnOff id="kb-set-font" on={font} onChange={setFont} />
        </div>
      </section>
    </div>
  );
}
