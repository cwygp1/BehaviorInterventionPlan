import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useToast } from '../../contexts/ToastContext';

/**
 * 🌐 외부 AI 연동 모달 — 로컬 AI와 외부 AI(클로드·ChatGPT 등) 결과 비교용.
 * ① buildPrompt()로 만든 프롬프트를 복사해 외부 AI에 붙여넣고
 * ② 응답을 아래 칸에 붙여넣으면 onApply(raw)가 파싱·적용한다.
 *
 * props:
 * - open, onClose
 * - title: 모달 제목
 * - buildPrompt: async () => string  — 열릴 때 호출
 * - onApply: (rawText) => boolean    — true 반환 시 모달 닫힘(파싱 실패 등은 false)
 * - placeholder: 응답 칸 안내문(선택)
 */
export default function ExternalAIModal({ open, onClose, title = '🌐 외부 AI 연동', buildPrompt, onApply, placeholder }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [paste, setPaste] = useState('');

  useEffect(() => {
    if (!open) return;
    setPaste('');
    setPrompt('프롬프트 생성 중…');
    (async () => {
      try { setPrompt(await buildPrompt()); }
      catch (e) { setPrompt('프롬프트 생성 실패: ' + e.message); }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); toast('프롬프트를 복사했어요. 클로드(claude.ai)·ChatGPT 등에 붙여넣으세요.'); }
    catch (_) { toast('자동 복사가 막혔어요. 텍스트를 직접 선택해 복사하세요.'); }
  }
  function apply() {
    if (!paste.trim()) { toast('외부 AI의 응답을 먼저 붙여넣어 주세요.'); return; }
    if (onApply(paste)) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={700}>
      <h3>{title}</h3>
      <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, marginTop: 4 }}>
        ① 아래 프롬프트를 복사해 <b>클로드(claude.ai)·ChatGPT 등 외부 AI</b>에 붙여넣으세요.
        ② 외부 AI의 응답을 아래 칸에 붙여넣고 "응답 적용"을 누르면 화면에 채워집니다.
        로컬 AI 결과와 품질을 비교해보세요. (학생 실명 등 식별정보가 프롬프트에 없는지 확인 후 사용)
      </p>
      <div className="form-group">
        <label className="form-label">① 프롬프트 (복사해서 외부 AI에 붙여넣기)</label>
        <textarea className="form-textarea" rows={8} readOnly value={prompt} onFocus={(e) => e.target.select()} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={copyPrompt}>📋 프롬프트 복사</button>
      </div>
      <div className="form-group">
        <label className="form-label">② 외부 AI 응답 붙여넣기</label>
        <textarea className="form-textarea" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)}
          placeholder={placeholder || '외부 AI가 준 응답을 그대로 붙여넣으세요.'} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>닫기</button>
        <button className="btn btn-pri" onClick={apply}>응답 적용</button>
      </div>
    </Modal>
  );
}
