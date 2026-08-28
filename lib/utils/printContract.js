// Behavior contract printer — opens a print-styled HTML in a new window.
// 0828: LMAC(행동계약서) 표준 구조로 개편 — 과제(누가/무엇을/언제/얼마나 잘)와
// 보상(누가/무엇을/언제/얼마나)을 나란히 적고, 서명·날짜, 과제 기록표(없음/월~금/일주일)까지
// 원본 양식(Contract Form, Dardig & Heward 계열) 그대로 담는다. 빈칸은 밑줄로 남아
// 인쇄 후 손으로 적을 수도 있다.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DAYS_MF = ['월', '화', '수', '목', '금'];
const DAYS_WEEK = ['월', '화', '수', '목', '금', '토', '일'];

// html 문자열만 만들어 돌려준다 — printBehaviorContract가 쓰고, 미리보기·테스트에서도 재사용.
export function buildContractHtml({
  studentId, teacherName,
  task = {},      // { who, what, when, howWell }
  reward = {},    // { who, what, when, howMuch }
  d1, d2,
  recordType = 'mf',  // 'none' | 'mf' | 'week'
  weeks = 4,
}) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmt = (v) => v ? new Date(v).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '____ . __ . __';
  const nWeeks = Math.min(8, Math.max(1, Number(weeks) || 4));
  const days = recordType === 'week' ? DAYS_WEEK : DAYS_MF;

  // 항목 한 줄 — 값이 없으면 밑줄만 남겨 손글씨 칸으로 쓴다.
  const field = (label, val) => `<div class="fld"><span class="fld-label">${label}</span><span class="fld-value${val ? '' : ' blank'}">${esc(val) || '&nbsp;'}</span></div>`;

  const recordHtml = recordType === 'none' ? '' : `
<div class="record">
  <div class="record-title">과제 기록 <span class="record-en">Task Record</span>
    <span class="record-hint">— 과제를 해낸 날에 ○ 표시하거나 스티커를 붙여요</span></div>
  <table class="record-table">
    <thead><tr><th class="wk"></th>${days.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
    <tbody>${Array.from({ length: nWeeks }, (_, i) =>
      `<tr><td class="wk">${i + 1}주</td>${days.map(() => '<td></td>').join('')}</tr>`).join('')}
  </tbody></table>
</div>`;

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>행동 계약서</title>
<style>
@page{size:A4;margin:12mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1a2238;background:#fafbff;padding:24px;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.contract{max-width:740px;margin:0 auto;background:#fff;padding:34px 40px 26px;border:7px double #2a3568;position:relative}
.contract::before{content:'';position:absolute;top:12px;left:12px;right:12px;bottom:12px;border:1px solid #c9b066;pointer-events:none}
.header{text-align:center;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #c9b066;position:relative}
.header::after{content:'';position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);width:10px;height:10px;background:#c9b066;border-radius:50%}
.seal{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;background:#c9b066;color:#fff;border-radius:50%;font-size:1.3rem;font-weight:800;margin-bottom:8px;font-family:serif;box-shadow:0 3px 10px rgba(201,176,102,.4)}
h1{font-size:1.7rem;font-weight:800;letter-spacing:9px;color:#2a3568;margin-bottom:3px;padding-left:9px}
.subtitle{font-size:.68rem;color:#999;letter-spacing:4px;text-transform:uppercase;font-weight:600}
.student-tag{display:inline-block;background:#2a3568;color:#fff;padding:3px 14px;border-radius:99px;font-size:.76rem;font-weight:700;letter-spacing:1px;margin-top:9px}
.intro{font-size:.82rem;color:#555;text-align:center;margin-bottom:14px;line-height:1.6}
.tr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.panel{border:1.5px solid #d5dae8;border-radius:8px;overflow:hidden;page-break-inside:avoid}
.panel-head{padding:7px 12px;font-weight:800;font-size:.9rem;letter-spacing:2px;color:#fff;display:flex;align-items:baseline;gap:8px}
.panel-head .en{font-size:.62rem;font-weight:600;letter-spacing:2px;opacity:.75;text-transform:uppercase}
.panel.task .panel-head{background:#2a3568}
.panel.reward .panel-head{background:#b3924a}
.panel-body{padding:10px 12px 6px}
.fld{display:flex;align-items:flex-end;gap:8px;margin-bottom:9px}
.fld-label{flex:0 0 62px;font-size:.76rem;font-weight:700;color:#2a3568;padding-bottom:3px}
.panel.reward .fld-label{color:#8a6d2f}
.fld-value{flex:1;min-height:2em;font-size:.9rem;border-bottom:1.5px solid #c9cfdd;padding:0 2px 3px;white-space:pre-wrap;word-break:keep-all}
.fld-value.blank{border-bottom-style:dashed}
.period{display:flex;align-items:center;justify-content:center;gap:14px;background:#fff7e6;border:1.5px dashed #c9b066;padding:8px 14px;border-radius:6px;margin-bottom:14px}
.period-label{font-size:.7rem;color:#8a6d2f;letter-spacing:3px;font-weight:700}
.period-value{color:#2a3568;font-size:.92rem;letter-spacing:1px;font-weight:700}
.signs{margin-bottom:6px}
.sign-row{display:flex;align-items:flex-end;gap:10px;margin-bottom:12px}
.sign-role{flex:0 0 128px;font-size:.8rem;font-weight:700;color:#2a3568}
.sign-role .sub{display:block;font-size:.62rem;color:#999;font-weight:600}
.sign-line{flex:1;border-bottom:1.5px solid #2a3568;min-height:30px;position:relative;display:flex;align-items:flex-end;padding:0 4px 2px;font-size:.86rem}
.sign-line .hint{position:absolute;right:4px;bottom:4px;font-size:.6rem;color:#c2c6d2}
.sign-date{flex:0 0 150px;display:flex;align-items:flex-end;gap:6px}
.sign-date .lbl{font-size:.72rem;font-weight:700;color:#777;padding-bottom:2px}
.sign-date .line{flex:1;border-bottom:1.5px solid #2a3568;min-height:30px}
.record{margin-top:4px;page-break-inside:avoid}
.record-title{font-size:.86rem;font-weight:800;color:#2a3568;letter-spacing:1px;margin-bottom:6px}
.record-en{font-size:.62rem;color:#999;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-left:4px}
.record-hint{font-size:.68rem;color:#999;font-weight:500;letter-spacing:0}
.record-table{width:100%;border-collapse:collapse;table-layout:fixed}
.record-table th,.record-table td{border:1.2px solid #b9c0d4;text-align:center}
.record-table th{background:#eef1fa;color:#2a3568;font-size:.78rem;font-weight:700;padding:5px 0}
.record-table td{height:${recordType === 'week' ? 30 : 34}px}
.record-table .wk{width:52px;background:#fff7e6;color:#8a6d2f;font-size:.74rem;font-weight:700}
.footer{text-align:center;margin-top:14px;padding-top:10px;border-top:1px dashed #ddd;font-size:.66rem;color:#999}
@media print{body{background:#fff;padding:0}}
</style></head><body><div class="contract">
<div class="header"><div class="seal">約</div><h1>행동 계약서</h1><div class="subtitle">Behavior Contract</div>
${studentId ? `<div class="student-tag">대상 학생 · ${esc(studentId)}</div>` : ''}</div>
<p class="intro">우리는 아래의 약속을 확인하고, 서로의 노력을 응원하기로 하였습니다.</p>
<div class="tr-grid">
<div class="panel task"><div class="panel-head">과제 <span class="en">Task</span></div><div class="panel-body">
${field('누가', task.who)}${field('무엇을', task.what)}${field('언제', task.when)}${field('얼마나 잘', task.howWell)}
</div></div>
<div class="panel reward"><div class="panel-head">보상 <span class="en">Reward</span></div><div class="panel-body">
${field('누가', reward.who)}${field('무엇을', reward.what)}${field('언제', reward.when)}${field('얼마나', reward.howMuch)}
</div></div>
</div>
<div class="period"><span class="period-label">계약 기간</span><span class="period-value">${fmt(d1)} &nbsp;~&nbsp; ${fmt(d2)}</span></div>
<div class="signs">
<div class="sign-row"><span class="sign-role">과제를 하는 사람<span class="sub">학생 서명</span></span><span class="sign-line">${esc(task.who) || ''}<span class="hint">(서명)</span></span><span class="sign-date"><span class="lbl">날짜</span><span class="line"></span></span></div>
<div class="sign-row"><span class="sign-role">보상을 주는 사람<span class="sub">교사 서명</span></span><span class="sign-line">${esc(reward.who || teacherName) || ''}<span class="hint">(서명)</span></span><span class="sign-date"><span class="lbl">날짜</span><span class="line"></span></span></div>
</div>
${recordHtml}
<div class="footer">이 계약서는 학생의 긍정적 행동 변화를 격려하기 위한 도구입니다 · 작성일 ${today}</div>
</div></body></html>`;
  return html;
}

export function printBehaviorContract(opts) {
  const html = buildContractHtml(opts);
  const w = window.open('', '', 'width=820,height=1000');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 250);
}
