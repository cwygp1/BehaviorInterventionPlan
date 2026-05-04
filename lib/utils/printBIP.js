// BIP (Behavior Intervention Plan) print template — A4 formatted document
// suitable for IEP meetings, administrative reporting, and parent conferences.
export function printBIP({ studentId, level, disability, note, teacherName, school, bip }) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const b = bip || {};
  const section = (label, content, icon, color) => `
    <div class="section">
      <div class="section-head" style="background:${color}1a;border-left:4px solid ${color}">
        <span class="ico" style="background:${color}">${icon}</span>
        <span class="lbl" style="color:${color}">${label}</span>
      </div>
      <div class="section-body">${content || '<span class="empty">(미작성)</span>'}</div>
    </div>`;
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>BIP — ${studentId || '학생'}</title>
<style>
@page{size:A4;margin:18mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1a2238;background:#fafbff;padding:20px;line-height:1.7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc{max-width:760px;margin:0 auto;background:#fff;padding:40px 46px;border-top:6px solid #4f6bed}
.head{border-bottom:2px solid #4f6bed;padding-bottom:18px;margin-bottom:24px}
.head h1{font-size:1.8rem;color:#3a54cf;font-weight:800;letter-spacing:4px;margin-bottom:4px}
.head .sub{font-size:.78rem;color:#888;letter-spacing:3px;text-transform:uppercase;font-weight:600}
.school{font-size:.82rem;color:#666;text-align:right;margin-bottom:6px}
.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 16px;font-size:.88rem;background:#f0f3ff;padding:14px 18px;border-radius:6px;margin-bottom:24px}
.meta .row{display:flex;gap:6px}
.meta .k{color:#888;font-weight:600;width:80px}
.meta .v{color:#1a2238;font-weight:700;flex:1}
.goal-card{background:linear-gradient(135deg,#fff7e6,#fff);border:1px solid #f3c47b;border-radius:8px;padding:16px 20px;margin-bottom:24px}
.goal-card h2{font-size:1rem;color:#a76200;letter-spacing:2px;margin-bottom:10px}
.goal-card .row{display:flex;gap:12px;margin-bottom:6px;font-size:.92rem}
.goal-card .label{color:#a76200;font-weight:700;min-width:84px}
.section{margin-bottom:18px;page-break-inside:avoid}
.section-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:6px 6px 0 0}
.section-head .ico{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;color:#fff;border-radius:6px;font-size:.9rem;font-weight:700}
.section-head .lbl{font-size:.94rem;font-weight:700;letter-spacing:1px}
.section-body{padding:14px 18px;background:#fafbff;border:1px solid #e4e9f2;border-top:none;border-radius:0 0 6px 6px;font-size:.92rem;white-space:pre-wrap;word-break:keep-all;min-height:30px}
.section-body .empty{color:#bbb;font-style:italic}
.signatures{display:flex;gap:30px;margin-top:36px;padding-top:20px;border-top:1px solid #e4e9f2}
.sig{flex:1;text-align:center}
.sig-line{border-bottom:1.5px solid #2a3568;height:36px;margin-bottom:6px}
.sig-label{font-weight:700;color:#3a54cf;font-size:.88rem}
.sig-name{font-size:.76rem;color:#888;margin-top:2px}
.footer{text-align:center;margin-top:24px;padding-top:14px;border-top:1px dashed #ddd;font-size:.7rem;color:#999}
@media print{body{background:#fff;padding:0}.doc{border-top:6px solid #4f6bed}}
</style></head><body><div class="doc">
${school ? `<div class="school">${school}</div>` : ''}
<div class="head"><h1>행동중재계획 (BIP)</h1><div class="sub">Behavior Intervention Plan</div></div>
<div class="meta">
  <div class="row"><span class="k">학생 ID:</span><span class="v">${studentId || '____'}</span></div>
  <div class="row"><span class="k">학교급:</span><span class="v">${level || '____'}</span></div>
  <div class="row"><span class="k">장애 영역:</span><span class="v">${disability || '____'}</span></div>
  <div class="row"><span class="k">작성일:</span><span class="v">${today}</span></div>
  <div class="row" style="grid-column:1/-1"><span class="k">비식별 요약:</span><span class="v">${note || '(없음)'}</span></div>
</div>

<div class="goal-card">
  <h2>🎯 목표 행동 설정</h2>
  <div class="row"><span class="label">대체 행동:</span><span>${b.alt || '<span style="color:#bbb">(미작성)</span>'}</span></div>
  <div class="row"><span class="label">FCT 기술:</span><span>${b.fct || '<span style="color:#bbb">(미작성)</span>'}</span></div>
  <div class="row"><span class="label">성공 기준:</span><span>${b.crit || '<span style="color:#bbb">(미작성)</span>'}</span></div>
</div>

<h2 style="font-size:1.05rem;color:#3a54cf;margin-bottom:12px;letter-spacing:1px">📜 중재 전략 (Antecedent → Teaching → Reinforcement → Response)</h2>
${section('🛡 예방 전략 (Antecedent)', b.prev, '🛡', '#0a7d4e')}
${section('📖 교수 전략 (Teaching)', b.teach, '📖', '#4f6bed')}
${section('⭐ 강화 전략 (Reinforcement)', b.reinf, '⭐', '#f59f00')}
${section('🚨 반응 절차 (Response)', b.resp, '🚨', '#ef476f')}

<div class="signatures">
  <div class="sig"><div class="sig-line"></div><div class="sig-label">담당 교사</div><div class="sig-name">${teacherName || '____________'}</div></div>
  <div class="sig"><div class="sig-line"></div><div class="sig-label">학부모 동의</div><div class="sig-name">____________</div></div>
  <div class="sig"><div class="sig-line"></div><div class="sig-label">관리자 확인</div><div class="sig-name">____________</div></div>
</div>
<div class="footer">본 BIP는 학생의 긍정적 행동 변화를 위한 개별화 중재 계획입니다. 정기 검토(2~4주)를 거쳐 효과를 평가하고, 필요 시 수정합니다. · 작성일 ${today}</div>
</div></body></html>`;
  const w = window.open('', '', 'width=820,height=1000');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 250);
}
