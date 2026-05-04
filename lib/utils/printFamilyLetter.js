// Family communication letter printer — formal yet warm A4 print template.
export function printFamilyLetter({ studentId, teacherName, school, body, subject, category, signature, sentDate }) {
  const today = sentDate || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>가정 연계 통신문</title>
<style>
@page{size:A4;margin:18mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1f2937;background:#fff;padding:20px;line-height:1.8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.letter{max-width:720px;margin:0 auto;padding:30px 40px;border:2px solid #4f6bed;border-radius:6px;position:relative}
.school{font-size:.82rem;color:#6b7280;text-align:right;margin-bottom:6px}
.title-block{text-align:center;border-bottom:3px solid #4f6bed;padding-bottom:18px;margin-bottom:24px}
h1{font-size:1.7rem;color:#3a54cf;letter-spacing:6px;font-weight:800}
.subtitle{font-size:.78rem;color:#6b7280;margin-top:6px;letter-spacing:3px;text-transform:uppercase}
.salutation{font-size:1rem;margin-bottom:14px;font-weight:600}
.body{white-space:pre-wrap;font-size:.96rem;line-height:1.9;color:#1f2937}
.signature-block{margin-top:36px;text-align:right;line-height:2}
.signature-block .date{font-size:.92rem;color:#374151}
.signature-block .name{font-size:1.05rem;font-weight:700;color:#3a54cf;margin-top:4px}
.note{margin-top:28px;padding:14px;background:#fff7e6;border-left:4px solid #f59f00;border-radius:0 4px 4px 0;font-size:.84rem;color:#92400e}
@media print{body{padding:0}.letter{border:2px solid #4f6bed}}
</style></head><body><div class="letter">
${school ? `<div class="school">${school}</div>` : ''}
<div class="title-block">
  <h1>가정 연계 통신문</h1>
  <div class="subtitle">Family Communication${category ? ' · ' + category : ''}</div>
</div>
${subject ? `<div style="text-align:center;font-size:1.05rem;font-weight:700;color:#3a54cf;margin-bottom:18px;padding:10px;background:#f0f3ff;border-radius:6px">${subject}</div>` : ''}
<p class="salutation">학부모님께,</p>
<div class="body">${body || '(내용 없음)'}</div>
<div class="signature-block">
  <div class="date">${today}</div>
  <div class="name">${teacherName || '담임'} 드림</div>
  ${signature ? `<div style="font-size:.8rem;color:#888">${signature}</div>` : ''}
</div>
<div class="note">⚠ 이 통신문은 학생 행동 변화에 대한 가정과의 협력을 위한 자료입니다. 학생 ${studentId ? '(' + studentId + ')' : ''}의 비식별 정보만 포함되어 있습니다.</div>
</div></body></html>`;
  const w = window.open('', '', 'width=820,height=1000');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 250);
}
