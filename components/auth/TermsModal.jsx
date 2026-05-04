import Modal from '../ui/Modal';

export default function TermsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={680}>
      <h3>📜 이용약관 및 운영정책 <span style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 500 }}>(v1.0)</span></h3>
      <div style={{ maxHeight: '60vh', overflowY: 'auto', fontSize: '.86rem', lineHeight: 1.7, color: 'var(--sub)', marginTop: 14 }}>
        <h4 style={{ marginTop: 14, color: 'var(--text)' }}>1. 개인정보 보호 (필수)</h4>
        <ul style={{ paddingLeft: 22, marginTop: 6 }}>
          <li>학생 실명 입력 금지 — "OO학생" 등 익명 형태로만 입력</li>
          <li>민감정보 최소 입력 — 주민번호·상세주소·불필요한 연락처 금지</li>
          <li>관리 책임의 귀속 — 관련 법령 및 기관 지침 준수, 입력 정보 관리 책임은 이용자(교사)에게 있음</li>
        </ul>

        <h4 style={{ marginTop: 14, color: 'var(--text)' }}>2. AI 결과물 성격 및 책임 (필수)</h4>
        <ul style={{ paddingLeft: 22, marginTop: 6 }}>
          <li>AI 결과물은 오류 가능성이 있으며 참고용입니다.</li>
          <li>업무 적용 전 반드시 교사가 검토·수정·확인해야 합니다.</li>
          <li>최종 책임은 교사에게 귀속됩니다.</li>
        </ul>

        <h4 style={{ marginTop: 14, color: 'var(--text)' }}>3. 이용범위 및 금지행위 (필수)</h4>
        <p style={{ marginTop: 6 }}>허용: 교육 목적</p>
        <p style={{ marginTop: 4 }}>금지:</p>
        <ul style={{ paddingLeft: 22, marginTop: 4 }}>
          <li>무단 복제/배포/수정/2차 가공</li>
          <li>역공학(리버스 엔지니어링), 보안장치 우회</li>
          <li>유사 서비스 제작·판매·재배포 (유·무료 포함)</li>
        </ul>

        <h4 style={{ marginTop: 14, color: 'var(--text)' }}>4. 동의 기록 저장 (필수)</h4>
        <p style={{ marginTop: 6 }}>분쟁 예방을 위해 동의 메타데이터(약관 버전, 동의 일시, 브라우저 정보 등)가 저장됩니다.</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-pri" onClick={onClose}>확인</button>
      </div>
    </Modal>
  );
}
