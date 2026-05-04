import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import LoadingOverlay from '../ui/LoadingOverlay';
import TermsModal from './TermsModal';

export default function AuthScreen() {
  const { login, signup } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('login'); // 'login' | 'signup'
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);

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
      await login(loginEmail.trim(), loginPw);
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
            <div className="auth-brand-icon">SE</div>
            <h1>특수교육 AI 통합 플랫폼</h1>
            <p>학생 개별화 행동지원 · 수업 자료 · 위기 대처를 한 곳에서</p>
          </div>

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
