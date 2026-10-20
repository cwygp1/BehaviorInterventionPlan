import { openPrintWindow } from './printWindow';
import { toPlainCopyText } from './aiText';

// 위기 시나리오(Acting-Out Cycle 7단계) 인쇄 — 1020(피드백 3차 ②) "이대로 인쇄가 가능하면 좋겠음".
// AI 결과는 마크다운이지만 인쇄용 변환기는 따로 없으므로(화면은 react-markdown), 복사 단추와 같은
// toPlainCopyText로 기호를 걷고 esc + pre-wrap으로 찍는다(printBIP 관례). AI 글은 반드시 esc — raw 삽입 금지.
const esc = (v) => String(v ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

export function printCrisisScenario({ studentId, level, disability, situation, output, teacherName, school, createdAt }) {
  const dateStr = (createdAt ? new Date(createdAt) : new Date()).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const body = esc(toPlainCopyText(output || ''));
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>위기 대응 시나리오 — ${esc(studentId || '학생')}</title>
<style>
@page{size:A4;margin:18mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1a2238;background:#fff;padding:20px;line-height:1.75;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc{max-width:760px;margin:0 auto;background:#fff;padding:36px 44px;border-top:6px solid #dc2626}
.head{border-bottom:2px solid #dc2626;padding-bottom:14px;margin-bottom:20px}
.head h1{font-size:1.6rem;color:#b91c1c;font-weight:800;letter-spacing:2px;margin-bottom:4px}
.head .sub{font-size:.76rem;color:#888;letter-spacing:2px;text-transform:uppercase;font-weight:600}
.school{font-size:.82rem;color:#666;text-align:right;margin-bottom:6px}
.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 16px;font-size:.88rem;background:#fef2f2;padding:12px 16px;border-radius:6px;margin-bottom:20px}
.meta .row{display:flex;gap:6px}.meta .k{color:#888;font-weight:600;width:72px}.meta .v{font-weight:700;flex:1}
h2{font-size:1rem;color:#b91c1c;margin:18px 0 8px;letter-spacing:1px}
.box{padding:12px 16px;background:#fafbff;border:1px solid #e4e9f2;border-radius:6px;font-size:.92rem;white-space:pre-wrap;word-break:keep-all}
.scn{white-space:pre-wrap;word-break:keep-all;font-size:.92rem}
.footer{margin-top:28px;padding-top:12px;border-top:1px dashed #ddd;font-size:.74rem;color:#999;display:flex;justify-content:space-between}
@media print{body{padding:0}.doc{padding:0;border-top:6px solid #dc2626}}
</style></head><body><div class="doc">
${school ? `<div class="school">${esc(school)}</div>` : ''}
<div class="head"><h1>🚨 위기 행동 대응 시나리오</h1><div class="sub">Acting-Out Cycle 7단계</div></div>
<div class="meta">
  <div class="row"><span class="k">학생</span><span class="v">${esc(studentId || '—')}</span></div>
  <div class="row"><span class="k">학교급</span><span class="v">${esc(level || '—')}</span></div>
  <div class="row"><span class="k">장애 영역</span><span class="v">${esc(disability || '—')}</span></div>
  <div class="row"><span class="k">작성일</span><span class="v">${dateStr}</span></div>
</div>
<h2>위기 상황</h2>
<div class="box">${esc(situation || '(없음)')}</div>
<h2>단계별 대응</h2>
<div class="scn">${body || '(내용 없음)'}</div>
<div class="footer"><span>${esc(teacherName || '담임')}${teacherName ? ' 교사' : ''}</span><span>신체적 개입은 안전 최우선·최후의 수단·최소한의 힘·일시적 사용·기록과 보고 원칙을 따릅니다.</span></div>
</div></body></html>`;
  openPrintWindow(html, 'width=820,height=1000', 250);
}
