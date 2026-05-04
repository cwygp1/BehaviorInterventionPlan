// Comprehensive evaluation report — combines student info, all charts (as
// images captured from Chart.js canvases), summary tables, and a teacher
// narrative into one A4 print document.

function chartImage(canvasEl) {
  if (!canvasEl) return '';
  try { return canvasEl.toDataURL('image/png', 1.0); } catch (_) { return ''; }
}

function fmtDateRange(records) {
  if (!records?.length) return '데이터 없음';
  const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const first = sorted[0]?.date || '';
  const last = sorted[sorted.length - 1]?.date || '';
  return first === last ? first : `${first} ~ ${last}`;
}

function avg(arr, key) {
  const vals = arr.map((r) => Number(r[key]) || 0);
  if (!vals.length) return 0;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

export function printEvalReport({ student, teacherName, school, charts, data, narrative, effectSize, period }) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const monA = (data?.mon || []).filter((r) => r.phase === 'A');
  const monB = (data?.mon || []).filter((r) => r.phase !== 'A');
  const fid = data?.fid || [];
  const sz = data?.sz || [];
  const bip = data?.bip || {};

  const radarImg = chartImage(charts?.radar);
  const behImg = chartImage(charts?.behavior);
  const fidImg = chartImage(charts?.fid);
  const szDonutImg = chartImage(charts?.szDonut);
  const szBarImg = chartImage(charts?.szBar);

  const fidPct = fid.length ? Math.round(fid.reduce((s, r) => s + (r.score / r.total) * 100, 0) / fid.length) : null;

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>결과 보고서 — ${student?.code || '학생'}</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕',sans-serif;color:#1a2238;background:#fff;padding:18px;line-height:1.6;font-size:.86rem;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc{max-width:780px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #4f6bed;padding-bottom:14px;margin-bottom:18px}
.head h1{font-size:1.5rem;color:#3a54cf;letter-spacing:3px;font-weight:800}
.head .sub{font-size:.74rem;color:#888;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-top:2px}
.head .meta{text-align:right;font-size:.78rem;color:#666}
.head .meta b{color:#3a54cf}
.summary{background:#f0f3ff;border-left:4px solid #4f6bed;padding:14px 18px;border-radius:0 6px 6px 0;margin-bottom:18px}
.summary .row{display:grid;grid-template-columns:90px 1fr;gap:6px 10px;margin-bottom:4px}
.summary .k{color:#888;font-weight:600;font-size:.78rem}
.summary .v{color:#1a2238;font-weight:600;font-size:.86rem}
h2.sec{font-size:1rem;color:#3a54cf;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #c4d3f1;letter-spacing:1px}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.chart-card{border:1px solid #e4e9f2;border-radius:6px;padding:8px;page-break-inside:avoid}
.chart-card .title{font-size:.78rem;color:#666;font-weight:700;margin-bottom:4px;text-align:center}
.chart-card img{width:100%;height:auto;display:block}
.chart-full{grid-column:1/-1}
table{width:100%;border-collapse:collapse;font-size:.8rem;margin-bottom:12px}
th,td{border:1px solid #d6dde8;padding:6px 8px;text-align:left}
th{background:#e9edff;color:#3a54cf;font-weight:700}
td.num{text-align:right}
td.cen{text-align:center}
.effect-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.effect-card{background:#f6f8ff;border:1px solid #c4d3f1;border-radius:6px;padding:10px 14px;text-align:center}
.effect-card .lbl{font-size:.72rem;color:#888;letter-spacing:1px}
.effect-card .val{font-size:1.4rem;font-weight:800;color:#3a54cf;margin:4px 0}
.effect-card .meaning{font-size:.74rem;color:#666}
.bip-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bip-cell{background:#fafbff;border:1px solid #e4e9f2;border-radius:6px;padding:10px 12px;page-break-inside:avoid}
.bip-cell .label{font-size:.74rem;color:#3a54cf;font-weight:700;letter-spacing:1px;margin-bottom:4px}
.bip-cell .content{font-size:.82rem;white-space:pre-wrap;word-break:keep-all;color:#444}
.narr{background:#fff7e6;border-left:4px solid #f59f00;padding:14px 18px;border-radius:0 6px 6px 0;margin-bottom:14px;page-break-inside:avoid}
.narr .label{font-size:.78rem;color:#a76200;font-weight:700;letter-spacing:1px;margin-bottom:6px}
.narr .content{font-size:.86rem;line-height:1.8;white-space:pre-wrap;color:#92400e}
.signatures{display:flex;gap:30px;margin-top:24px;padding-top:14px;border-top:1px solid #e4e9f2}
.sig{flex:1;text-align:center}
.sig-line{border-bottom:1.5px solid #2a3568;height:30px;margin-bottom:4px}
.sig-label{font-weight:700;color:#3a54cf;font-size:.82rem}
.footer{text-align:center;margin-top:18px;padding-top:10px;border-top:1px dashed #ddd;font-size:.66rem;color:#999}
@media print{body{padding:0}h2.sec{page-break-after:avoid}.chart-card,.bip-cell,.narr,.effect-card{page-break-inside:avoid}}
</style></head><body><div class="doc">
<div class="head">
  <div>
    <h1>결과 평가 보고서</h1>
    <div class="sub">Single-Subject Behavior Intervention Report</div>
  </div>
  <div class="meta">
    ${school ? `<div>${school}</div>` : ''}
    <div>작성일 <b>${today}</b></div>
    <div>담임 <b>${teacherName || '____'}</b></div>
  </div>
</div>

<!-- 학생 정보 + 보고 기간 -->
<div class="summary">
  <div class="row"><span class="k">학생 ID</span><span class="v">${student?.code || '____'}</span></div>
  <div class="row"><span class="k">학교급</span><span class="v">${student?.level || '____'} · ${student?.disability || '____'}</span></div>
  <div class="row"><span class="k">비식별 요약</span><span class="v">${student?.note || '(없음)'}</span></div>
  <div class="row"><span class="k">보고 기간</span><span class="v">${period || fmtDateRange(data?.mon || [])}</span></div>
  <div class="row"><span class="k">대체 행동</span><span class="v">${bip.alt || '(미작성)'}</span></div>
</div>

<!-- 핵심 지표 -->
<h2 class="sec">📊 핵심 지표</h2>
<div class="effect-grid">
  ${effectSize?.pnd != null ? `
  <div class="effect-card">
    <div class="lbl">PND</div>
    <div class="val">${effectSize.pnd}%</div>
    <div class="meaning">${effectSize.pnd >= 90 ? '매우 효과적' : effectSize.pnd >= 70 ? '효과적' : effectSize.pnd >= 50 ? '의문스러움' : '비효과적'}</div>
  </div>` : ''}
  ${effectSize?.tau != null ? `
  <div class="effect-card">
    <div class="lbl">Tau-U</div>
    <div class="val">${effectSize.tau.toFixed(2)}</div>
    <div class="meaning">${Math.abs(effectSize.tau) < 0.2 ? '효과 거의 없음' : Math.abs(effectSize.tau) < 0.6 ? '약함~중간' : Math.abs(effectSize.tau) < 0.8 ? '큼' : '매우 큼'}</div>
  </div>` : ''}
  <div class="effect-card">
    <div class="lbl">기초선 평균 빈도</div>
    <div class="val" style="color:#ef476f">${avg(monA, 'freq')}</div>
    <div class="meaning">${monA.length}건의 기록</div>
  </div>
  <div class="effect-card">
    <div class="lbl">중재 평균 빈도</div>
    <div class="val" style="color:#12b886">${avg(monB, 'freq')}</div>
    <div class="meaning">${monB.length}건의 기록</div>
  </div>
</div>

<!-- 차트 -->
<h2 class="sec">📈 시각 분석</h2>
<div class="charts-grid">
  ${behImg ? `<div class="chart-card chart-full"><div class="title">행동 변화 추이 (Phase A → Phase B)</div><img src="${behImg}" /></div>` : ''}
  ${radarImg ? `<div class="chart-card"><div class="title">QABF 행동 기능 분석</div><img src="${radarImg}" /></div>` : ''}
  ${fidImg ? `<div class="chart-card"><div class="title">BIP 실행 충실도 추이${fidPct != null ? ' · 평균 ' + fidPct + '%' : ''}</div><img src="${fidImg}" /></div>` : ''}
  ${szDonutImg ? `<div class="chart-card"><div class="title">심리안정실 사유 분포</div><img src="${szDonutImg}" /></div>` : ''}
  ${szBarImg ? `<div class="chart-card"><div class="title">심리안정실 월별 이용</div><img src="${szBarImg}" /></div>` : ''}
</div>

<!-- 데이터 표 -->
<h2 class="sec">📋 데이터 요약</h2>
<table>
  <thead><tr><th>지표</th><th>기초선 (Phase A)</th><th>중재 (Phase B)</th><th>변화</th></tr></thead>
  <tbody>
    ${[['freq','발생 빈도'],['dur','지속 시간(분)'],['int','강도'],['dbr','DBR']].map(([k,l]) => {
      const a = Number(avg(monA, k));
      const b = Number(avg(monB, k));
      const d = (b - a).toFixed(1);
      const color = d < 0 ? '#0a7d4e' : (d > 0 ? '#ef476f' : '#666');
      return `<tr><td>${l}</td><td class="num">${a}</td><td class="num">${b}</td><td class="num" style="color:${color};font-weight:700">${d > 0 ? '+' : ''}${d}</td></tr>`;
    }).join('')}
    <tr><td>관찰 기록 수</td><td class="num">${monA.length}건</td><td class="num">${monB.length}건</td><td class="num">${monB.length - monA.length}</td></tr>
    <tr><td>BIP 충실도 평균</td><td class="cen" colspan="2">${fidPct != null ? fidPct + '%' : '—'}</td><td class="cen">${fid.length}회 측정</td></tr>
    <tr><td>심리안정실 이용</td><td class="cen" colspan="3">${sz.length}회 (${sz.length === 0 ? '없음' : '주된 사유: ' + (Object.entries(sz.reduce((a,r)=>{a[r.reason]=(a[r.reason]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1])[0]?.[0] || '미분류')})</td></tr>
  </tbody>
</table>

<!-- BIP 요약 -->
<h2 class="sec">📜 적용된 BIP 요약</h2>
<div class="bip-grid">
  <div class="bip-cell"><div class="label">🛡 예방 전략</div><div class="content">${bip.prev || '(미작성)'}</div></div>
  <div class="bip-cell"><div class="label">📖 교수 전략</div><div class="content">${bip.teach || '(미작성)'}</div></div>
  <div class="bip-cell"><div class="label">⭐ 강화 전략</div><div class="content">${bip.reinf || '(미작성)'}</div></div>
  <div class="bip-cell"><div class="label">🚨 반응 절차</div><div class="content">${bip.resp || '(미작성)'}</div></div>
</div>

${narrative ? `
<h2 class="sec">💬 교사 종합 의견</h2>
<div class="narr">
  <div class="content">${narrative}</div>
</div>` : ''}

<div class="signatures">
  <div class="sig"><div class="sig-line"></div><div class="sig-label">담임 교사</div></div>
  <div class="sig"><div class="sig-line"></div><div class="sig-label">학부모 확인</div></div>
  <div class="sig"><div class="sig-line"></div><div class="sig-label">관리자 / 위기관리팀</div></div>
</div>

<div class="footer">본 보고서는 ${period || ''} 기간의 행동지원 결과를 단일대상연구(Single Subject Design) 시각 분석 기준으로 정리한 것입니다. 작성 ${today}</div>
</div></body></html>`;
  const w = window.open('', '', 'width=820,height=1100');
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 350);
}
