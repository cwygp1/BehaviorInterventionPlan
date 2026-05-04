import { useEffect, useState } from 'react';

const KEY = 'seai.security_banner_dismissed';

export default function SecurityBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShow(window.localStorage.getItem(KEY) !== '1');
  }, []);
  if (!show) return null;
  return (
    <div style={{ background: 'linear-gradient(90deg, #e7f7ee, #e8eefb)', borderBottom: '1px solid #c4ecd2', padding: '8px 16px', fontSize: '.78rem', color: '#0a7d4e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span>🔒 AI 전송 시 가명(ID) 및 비식별 요약만 사용. 학생 실명·민감정보 입력 금지. 보안 토큰 적용.</span>
      <button
        onClick={() => { window.localStorage.setItem(KEY, '1'); setShow(false); }}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#0a7d4e', fontSize: '1rem', fontWeight: 700 }}
        title="배너 숨기기"
      >×</button>
    </div>
  );
}
