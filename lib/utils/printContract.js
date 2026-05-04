// Behavior contract printer — opens a print-styled HTML in a new window.
export function printBehaviorContract({ studentId, teacherName, stu, crit, tch, d1, d2 }) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmt = (v) => v ? new Date(v).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '____.__.__';
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>행동 계약서</title>
<style>
@page{size:A4;margin:18mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1a2238;background:#fafbff;padding:30px;line-height:1.7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.contract{max-width:720px;margin:0 auto;background:#fff;padding:50px 55px 40px;border:7px double #2a3568;position:relative}
.contract::before{content:'';position:absolute;top:14px;left:14px;right:14px;bottom:14px;border:1px solid #c9b066;pointer-events:none}
.header{text-align:center;margin-bottom:30px;padding-bottom:22px;border-bottom:2px solid #c9b066;position:relative}
.header::after{content:'';position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);width:12px;height:12px;background:#c9b066;border-radius:50%}
.seal{display:inline-flex;align-items:center;justify-content:center;width:58px;height:58px;background:#c9b066;color:#fff;border-radius:50%;font-size:1.6rem;font-weight:800;margin-bottom:14px;font-family:serif;box-shadow:0 4px 12px rgba(201,176,102,.4)}
h1{font-size:2.1rem;font-weight:800;letter-spacing:10px;color:#2a3568;margin-bottom:6px;padding-left:10px}
.subtitle{font-size:.74rem;color:#999;letter-spacing:5px;text-transform:uppercase;font-weight:600}
.student-tag{display:inline-block;background:#2a3568;color:#fff;padding:5px 16px;border-radius:99px;font-size:.82rem;font-weight:700;letter-spacing:1px;margin-top:14px}
.intro{font-size:.9rem;color:#555;text-align:center;margin-bottom:28px;padding:0 30px;line-height:1.7}
.section{margin-bottom:18px;page-break-inside:avoid}
.section-title{font-size:.88rem;font-weight:700;color:#2a3568;display:flex;align-items:center;margin-bottom:8px}
.section-num{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:#2a3568;color:#fff;border-radius:50%;font-weight:700;font-size:.78rem;margin-right:10px}
.section-content{background:#f6f8ff;border-left:4px solid #c9b066;padding:14px 18px;border-radius:0 4px 4px 0;font-size:1.04rem;color:#1a2238;min-height:30px;white-space:pre-wrap;word-break:keep-all}
.section-content.empty{color:#aaa;font-style:italic}
.period{text-align:center;background:#fff7e6;border:1.5px dashed #c9b066;padding:16px;border-radius:6px;margin:24px 0}
.period-label{font-size:.72rem;color:#888;letter-spacing:4px;margin-bottom:6px;font-weight:600}
.period-value{color:#2a3568;font-size:1.05rem;letter-spacing:1px;font-weight:700}
.signatures{display:flex;gap:36px;margin-top:46px;padding-top:24px;border-top:1px solid #e0e0e0}
.sig{flex:1;text-align:center}
.sig-line{border-bottom:1.5px solid #2a3568;height:46px;margin-bottom:8px;position:relative}
.sig-line::after{content:'(서명 또는 도장)';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.72rem;color:#bbb}
.sig-label{font-weight:700;color:#2a3568;font-size:.94rem;letter-spacing:1px}
.sig-name{font-size:.78rem;color:#777;margin-top:3px}
.footer{text-align:center;margin-top:24px;padding-top:14px;border-top:1px dashed #ddd;font-size:.7rem;color:#999}
@media print{body{background:#fff;padding:0}}
</style></head><body><div class="contract">
<div class="header"><div class="seal">約</div><h1>행동 계약서</h1><div class="subtitle">Behavior Contract</div>
${studentId ? `<div class="student-tag">대상 학생 · ${studentId}</div>` : ''}</div>
<p class="intro">저는 아래의 약속을 지키기 위해 노력하고,<br>선생님은 저의 노력을 응원하며 함께하겠습니다.</p>
<div class="section"><div class="section-title"><span class="section-num">1</span>나(학생)의 약속</div><div class="section-content${stu ? '' : ' empty'}">${stu || '(미입력)'}</div></div>
<div class="section"><div class="section-title"><span class="section-num">2</span>성공 기준</div><div class="section-content${crit ? '' : ' empty'}">${crit || '(미입력)'}</div></div>
<div class="section"><div class="section-title"><span class="section-num">3</span>선생님의 약속 (보상)</div><div class="section-content${tch ? '' : ' empty'}">${tch || '(미입력)'}</div></div>
<div class="period"><div class="period-label">계약 기간</div><div class="period-value">${fmt(d1)} &nbsp;~&nbsp; ${fmt(d2)}</div></div>
<div class="signatures">
<div class="sig"><div class="sig-line"></div><div class="sig-label">학생 서명</div><div class="sig-name">${studentId || '____________'}</div></div>
<div class="sig"><div class="sig-line"></div><div class="sig-label">교사 서명</div><div class="sig-name">${teacherName || '____________'}</div></div>
</div>
<div class="footer">이 계약서는 학생의 긍정적 행동 변화를 격려하기 위한 도구입니다.<br>작성일 · ${today}</div>
</div></body></html>`;
  const w = window.open('', '', 'width=820,height=1000');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 250);
}
