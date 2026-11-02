import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import LoadingOverlay from '../ui/LoadingOverlay';
import TermsModal from './TermsModal';

// 화면 모양 고르기(mds/54 §4).
//   · 로그인: 기본은 '계정에 저장된 대로'(값 '') — 사용자가 새/기존을 직접 눌렀을 때만 ui_mode를 보낸다.
//     기기 쿠키(kb_ui)로 미리 찍지 않는다 — 다른 기기 기본값이나 공용 PC 앞사람 선택이 계정 설정을 덮지 않게(mds/56 #5·#6).
//   · 가입: 언제나 '새 디자인'이 기본(쿠키와 무관).
function UiModePick({ value, onChange, name, keepOption = false }) {
  return (
    <fieldset className="auth-ui-pick" style={{ border: 'none', padding: 0, margin: '2px 0 10px' }}>
      <legend style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--sub)', marginBottom: 6 }}>화면 모양</legend>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {keepOption && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.9rem', cursor: 'pointer', minHeight: 32 }}>
            <input type="radio" style={{ width: 18, height: 18 }} name={name} value="" checked={value === ''} onChange={() => onChange('')} /> 저장된 대로
          </label>
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.9rem', cursor: 'pointer', minHeight: 32 }}>
          <input type="radio" style={{ width: 18, height: 18 }} name={name} value="new" checked={value === 'new'} onChange={() => onChange('new')} /> 새 디자인
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.9rem', cursor: 'pointer', minHeight: 32 }}>
          <input type="radio" style={{ width: 18, height: 18 }} name={name} value="legacy" checked={value === 'legacy'} onChange={() => onChange('legacy')} /> 기존 디자인
        </label>
      </div>
      <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 2 }}>
        {value === ''
          ? '내 계정에서 마지막으로 고른 화면으로 열려요. 바꾸려면 새 디자인이나 기존 디자인을 누르세요.'
          : value === 'legacy'
            ? '✨ 새 디자인 써 보기 — 메뉴 5개와 학생 수첩으로 정리한 화면이에요. 언제든 다시 바꿀 수 있어요.'
            : '처음이면 새 디자인을 권해요 · 언제든 기존 디자인으로 바꿀 수 있어요.'}
      </div>
    </fieldset>
  );
}

export default function AuthScreen() {
  const { login, signup, startDemo } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);
  // 화면 모양 — 로그인은 '저장된 대로'(''이면 보내지 않음), 가입은 '새 디자인'(mds/56 #5·#6).
  const [uiLogin, setUiLogin] = useState('');
  const [uiSignup, setUiSignup] = useState('new');

  // 체험을 마치고 '내 계정 만들기'를 누르면 회원가입 탭으로 연다(DemoPlayer가 표시를 남김).
  useEffect(() => {
    try {
      if (sessionStorage.getItem('kb_auth_tab') === 'signup') { setTab('signup'); sessionStorage.removeItem('kb_auth_tab'); }
    } catch (_e) { /* 사생활 모드 */ }
  }, []);

  // ▶ 3분 체험하기(mds/46) — 가입 없이 임시 계정으로 들어가 시연이 저절로 재생된다.
  async function onDemo() {
    setBusy(true);
    setBusyMsg('체험용 교실을 준비하는 중입니다...');
    try {
      await startDemo();
    } catch (err) {
      toast('체험 시작 실패: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');

  // Signup form
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPw, setSuPw] = useState('');
  const [suPw2, setSuPw2] = useState('');
  const [suSchool, setSuSchool] = useState('');
  const [suAgree, setSuAgree] = useState(false);

  async function onLogin(e) {
    e.preventDefault();
    setBusy(true);
    setBusyMsg('로그인 중입니다...');
    try {
      await login(loginEmail.trim(), loginPw, uiLogin || undefined);
    } catch (err) {
      toast('로그인 실패: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSignup(e) {
    e.preventDefault();
    if (suPw !== suPw2) {
      toast('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!suAgree) {
      toast('이용약관에 동의해 주세요.');
      return;
    }
    setBusy(true);
    setBusyMsg('계정을 만드는 중입니다...');
    try {
      await signup({
        email: suEmail.trim(),
        password: suPw,
        name: suName.trim(),
        school: suSchool.trim(),
        consent: { terms_version: 'v1.0', user_agent: navigator.userAgent.slice(0, 300) },
        ui_mode: uiSignup,
      });
      toast(suName + ' 선생님, 환영합니다!');
    } catch (err) {
      toast('회원가입 실패: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LoadingOverlay show={busy} message={busyMsg} />
      <div className="auth-screen show">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon"><img src="/icon.png" alt="꼬박꼬박 로고" style={{ width: '100%', height: '100%', borderRadius: 'inherit', display: 'block' }} /></div>
            <h1>꼬박꼬박 행동중재 통합 운영 시스템</h1>
            <p>학생 개별화 행동지원 · 수업 자료 · 위기 대처를 한 곳에서</p>
          </div>

          <div className="auth-demo">
            <div className="auth-demo-t">처음이세요? 가입 없이 먼저 보세요</div>
            <div className="auth-demo-d">화면이 저절로 움직이며 학생 등록 → 행동 기록 → IEP 목표 → 그래프까지 3분 안에 보여 드려요. 언제든 멈추고 직접 해 볼 수 있어요.</div>
            <button type="button" className="auth-demo-btn" onClick={onDemo} disabled={busy}>▶ 3분 체험하기</button>
            <div className="auth-demo-note">체험은 기존 디자인으로 열려요. 체험 기록은 24시간 뒤 자동으로 지워져요. 체험에서 만든 학생·기록은 가입 계정으로 옮겨지지 않아요.</div>
            {/* 1009(mds/48): 시연 대본은 컴퓨터 화면 기준 — 좁은 화면에서는 단추를 숨기고 안내만(CSS .auth-demo-mobile) */}
            <div className="auth-demo-mobile">📺 체험 시연은 <strong>컴퓨터 화면</strong>에서 볼 수 있어요. 휴대폰·태블릿 세로 화면에서는 가입 뒤 바로 써 보세요.</div>
          </div>
          <div className="auth-divider">또는 로그인</div>

          <div className="auth-tabs">
            <button className={'auth-tab' + (tab === 'login' ? ' on' : '')} onClick={() => setTab('login')}>로그인</button>
            <button className={'auth-tab' + (tab === 'signup' ? ' on' : '')} onClick={() => setTab('signup')}>회원가입</button>
          </div>

          {tab === 'login' ? (
            <form className="auth-form on" onSubmit={onLogin}>
              <div className="auth-field">
                <label>이메일</label>
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="teacher@school.kr" required />
              </div>
              <div className="auth-field">
                <label>비밀번호</label>
                <input type="password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} placeholder="••••••••" required />
              </div>
              <UiModePick name="ui-login" value={uiLogin} onChange={setUiLogin} keepOption />
              <button type="submit" className="auth-btn" disabled={busy}>
                {busy ? <><span className="btn-spinner" /><span>로그인 중...</span></> : '로그인하기'}
              </button>
            </form>
          ) : (
            <form className="auth-form on" onSubmit={onSignup}>
              <div className="auth-field"><label>선생님 성함</label><input value={suName} onChange={(e) => setSuName(e.target.value)} placeholder="홍길동" required /></div>
              <div className="auth-field"><label>이메일</label><input type="email" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="teacher@school.kr" required /></div>
              <div className="auth-field"><label>비밀번호 (6자 이상)</label><input type="password" value={suPw} onChange={(e) => setSuPw(e.target.value)} minLength={6} required /></div>
              <div className="auth-field"><label>비밀번호 확인</label><input type="password" value={suPw2} onChange={(e) => setSuPw2(e.target.value)} minLength={6} required /></div>
              <div className="auth-field"><label>소속 학교 <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(선택)</span></label><input value={suSchool} onChange={(e) => setSuSchool(e.target.value)} placeholder="예: OO초등학교" /></div>
              <div className="auth-consent">
                <input type="checkbox" id="suAgree" checked={suAgree} onChange={(e) => setSuAgree(e.target.checked)} />
                <label htmlFor="suAgree">
                  <span className="req">*</span>이용약관 및 운영정책(개인정보·AI 결과물 책임·이용범위·권리 귀속·동의 기록 저장)에 동의합니다.{' '}
                  <button type="button" className="terms-link" onClick={() => setTermsOpen(true)}>전문 보기</button>
                </label>
              </div>
              <UiModePick name="ui-signup" value={uiSignup} onChange={setUiSignup} />
              <button type="submit" className="auth-btn" disabled={busy}>
                {busy ? <><span className="btn-spinner" /><span>가입 중...</span></> : '가입하고 시작하기'}
              </button>
            </form>
          )}

          <p className="auth-hint">
            🔒 비밀번호는 안전하게 암호화(해시)되어 저장되며,<br />
            학생 정보는 실명이 아닌 익명 ID로만 입력해 주세요.
          </p>
        </div>
      </div>
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </>
  );
}
