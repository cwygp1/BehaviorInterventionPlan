// DPR (Daily Progress Report) printable card — A4 with score columns per period.
export function printDPRCard({ studentId, date, periods, goals, level }) {
  const today = date || new Date().toLocaleDateString('ko-KR');
  const goalsList = (goals || []).filter(Boolean);
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>DPR 카드 — ${studentId || '학생'}</title>
<style>
@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1a2238;background:#fff;padding:14px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card-wrap{max-width:760px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #4f6bed;padding-bottom:10px;margin-bottom:14px}
.head h1{font-size:1.4rem;color:#3a54cf;letter-spacing:4px;font-weight:800}
.head .sub{font-size:.78rem;color:#888;letter-spacing:3px;text-transform:uppercase;font-weight:600}
.meta{display:flex;gap:14px;flex-wrap:wrap;font-size:.86rem}
.meta b{color:#3a54cf}
.goals{background:#f0f3ff;border-left:4px solid #4f6bed;padding:10px 14px;border-radius:0 4px 4px 0;margin-bottom:14px}
.goals .label{font-size:.74rem;color:#3a54cf;font-weight:700;letter-spacing:2px;margin-bottom:4px}
.goals ul{padding-left:20px;font-size:.92rem}
.legend{font-size:.74rem;color:#666;margin-bottom:8px;text-align:center;background:#fff7e6;border:1px solid #f3c47b;padding:6px;border-radius:4px}
.legend b{color:#92400e}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{border:1px solid #c4d3f1;padding:8px;text-align:center}
th{background:#e9edff;color:#3a54cf;font-weight:700}
td.period{background:#f6f8ff;font-weight:600;color:#3a54cf;text-align:left;padding-left:10px;width:30%}
td.score{height:42px}
td.score-circle{font-size:1.05rem;color:#bbb;width:14%}
.totals{margin-top:14px;display:flex;justify-content:space-between;align-items:center;background:#f0f3ff;padding:12px 16px;border-radius:6px}
.totals .t{font-size:.92rem;color:#3a54cf}
.sigs{margin-top:24px;display:flex;justify-content:space-between;border-top:1px dashed #c4d3f1;padding-top:14px;font-size:.82rem;color:#666}
.sig-line{display:inline-block;border-bottom:1px solid #888;width:140px;margin-left:8px;padding-bottom:2px;height:20px}
.note{margin-top:12px;font-size:.74rem;color:#999;text-align:center}
@media print{body{padding:0}}
</style></head><body><div class="card-wrap">
<div class="head">
  <div>
    <h1>DPR 카드</h1>
    <div class="sub">Daily Progress Report</div>
  </div>
  <div class="meta">
    <div>학생 ID: <b>${studentId || '___'}</b></div>
    <div>날짜: <b>${today}</b></div>
    ${level ? `<div>학교급: <b>${level}</b></div>` : ''}
  </div>
</div>
<div class="goals">
  <div class="label">🎯 오늘의 목표 행동</div>
  ${goalsList.length ? `<ul>${goalsList.map((g) => `<li>${g}</li>`).join('')}</ul>` : '<div style="font-size:.86rem;color:#888">(목표를 입력해 주세요)</div>'}
</div>
<div class="legend">
  <b>점수 기준</b> &nbsp; 3 = 매우 잘함 &nbsp; · &nbsp; 2 = 잘함 &nbsp; · &nbsp; 1 = 노력 필요 &nbsp; · &nbsp; 0 = 못함
</div>
<table>
<thead>
<tr><th>교시</th><th>3점</th><th>2점</th><th>1점</th><th>0점</th><th>비고</th></tr>
</thead>
<tbody>
${(periods || []).map((p) => `
<tr>
  <td class="period">${p}</td>
  <td class="score-circle">○</td>
  <td class="score-circle">○</td>
  <td class="score-circle">○</td>
  <td class="score-circle">○</td>
  <td class="score"></td>
</tr>`).join('')}
</tbody>
</table>
<div class="totals">
  <span class="t">합계: ____ / ${(periods || []).length * 3}</span>
  <span class="t">평균: ____ %</span>
</div>
<div class="sigs">
  <div>학생 서명: <span class="sig-line"></span></div>
  <div>교사 서명: <span class="sig-line"></span></div>
  <div>학부모 확인: <span class="sig-line"></span></div>
</div>
<div class="note">⚠ 이 카드는 매일 가정과 학교 사이에 오갑니다. 학부모님은 점수를 확인 후 격려해 주세요.</div>
</div></body></html>`;
  const w = window.open('', '', 'width=820,height=1000');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 250);
}
