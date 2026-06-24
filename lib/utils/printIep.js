// IEP(개별화교육계획) Word(.doc) 내보내기.
// 라이브러리 없이 Word/한글이 그대로 여는 HTML 기반 .doc 를 생성·다운로드한다.
// 학생은 익명 ID(student_code)만 사용한다.

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// 여러 줄("-" 항목)을 Word에서 줄바꿈으로 표시
const escML = (s) => esc(s).replace(/\r?\n/g, '<br/>');

// Word 가로(A4 landscape) 페이지 설정 — 넓은 표가 잘리지 않게.
const LANDSCAPE_CSS = '@page Section1 { size:841.95pt 595.35pt; mso-page-orientation:landscape; margin:1.2cm; } div.Section1{ page:Section1; }';

const GRADE = { 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };
const unitOf = (t) => (t === 'rate' ? '%' : '회');

function monthlyTable(goal) {
  const rows = (goal.monthly || [])
    .map(
      (m) =>
        `<tr><td class="m">${esc(m.month)}월</td><td>${escML(m.goal)}</td><td>${escML(m.content)}</td>` +
        `<td>${(m.methods || []).map((x) => '- ' + esc(x)).join('<br/>')}</td>` +
        `<td>${escML(m.eval)}</td></tr>`
    )
    .join('');
  return (
    `<table><thead><tr><th style="width:46px">월</th><th>교육목표</th><th>교육내용</th>` +
    `<th style="width:150px">교육방법</th><th style="width:32%">평가</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function fociBlock(goal) {
  const foci = Array.isArray(goal.eval_foci) ? goal.eval_foci.filter((f) => String(f).trim()) : [];
  if (!foci.length) return '';
  return `<p class="std"><b>평가초점</b><br/>${foci.map((f) => '· ' + esc(f)).join('<br/>')}</p>`;
}
function tierLine(goal) {
  const t = goal.support_tier || goal.supportTier;
  return t ? `<p class="crit">지원 수준: ${esc(t)}</p>` : '';
}

function critLine(goal) {
  if (goal.crit_type === 'qual') return `<p class="crit">평가 방식: 질적 평가 — 평가초점 중심의 내러티브(서술형) 평가</p>` + tierLine(goal);
  const u = unitOf(goal.crit_type);
  return `<p class="crit">평가 기준: ${goal.crit_type === 'rate' ? '독립 수행 비율' : '기회 중 성공 횟수'} ${esc(goal.crit_start)}${u} → ${esc(goal.crit_end)}${u} (양적) · 평가초점 중심 질적 서술 병행</p>` + tierLine(goal);
}

function semestralTable(goal) {
  return (
    `<table><thead><tr><th style="width:90px">영역</th><th style="width:30%">현행수준</th>` +
    `<th>학기목표</th><th style="width:30%">평가(학기말 종합)</th></tr></thead>` +
    `<tbody><tr><td class="m">${esc(goal.area || goal.subject)}</td><td>${escML(goal.plop)}</td>` +
    `<td>${escML(goal.semester_goal)}</td><td>${escML(goal.semestral_eval)}</td></tr></tbody></table>`
  );
}

/**
 * @param {object} opts
 * @param {object} opts.student  - { code, level, disability }
 * @param {string} opts.teacherName
 * @param {string} opts.school
 * @param {Array}  opts.goals    - iep_goals rows (camel/snake mixed ok)
 */
export function downloadIepWord({ student = {}, teacherName = '', school = '', goals = [] }) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`;

  const header =
    `<table class="head"><tr>` +
    `<td class="hl">성명</td><td>${esc(student.code)}</td>` +
    `<td class="hl">학년·반</td><td>${esc(student.level)}</td>` +
    `<td class="hl">담임</td><td>${esc(teacherName)}</td></tr>` +
    `<tr><td class="hl">장애유형</td><td>${esc(student.disability)}</td>` +
    `<td class="hl">학교</td><td>${esc(school)}</td>` +
    `<td class="hl">작성일</td><td>${esc(dateStr)}</td></tr></table>`;

  const body = goals
    .map((g, i) => {
      const title = `${esc(g.subject)}${g.area ? ' · ' + esc(g.area) : ''} · ${esc(GRADE[g.grade_code] || '')} · ${g.semester}학기`;
      return (
        `<h3>${i + 1}. ${title}</h3>` +
        `<p class="std">성취기준 [${esc(g.standard_code)}] ${esc(g.standard_text)}</p>` +
        fociBlock(g) +
        `<h4>학기별 개별화교육계획/평가</h4>${semestralTable(g)}` +
        `<h4>월별 개별화교육계획/평가</h4>${monthlyTable(g)}` +
        critLine(g)
      );
    })
    .join('<hr/>');

  const css =
    LANDSCAPE_CSS +
    'body{font-family:"맑은 고딕",sans-serif}' +
    'table{border-collapse:collapse;width:100%;margin:6px 0 14px}' +
    'td,th{border:1px solid #000;padding:5px 6px;font-size:10.5pt;vertical-align:top}' +
    'th{background:#2f5496;color:#fff;text-align:center}' +
    'table.head td{font-size:10.5pt}.hl{background:#eee;font-weight:bold;width:80px}' +
    'td.m{background:#f3f6fc;font-weight:bold;text-align:center;white-space:nowrap}' +
    '.chip{display:inline-block;border:1px solid #ccc;border-radius:4px;padding:0 5px;margin:1px;font-size:9.5pt}' +
    'h2{font-size:14pt;text-align:center;margin:0 0 10px}h3{font-size:12pt;margin:16px 0 4px}h4{font-size:10.5pt;margin:10px 0 2px}' +
    '.std{font-size:10.5pt;color:#333;margin:2px 0 8px}.crit{font-size:9.5pt;color:#555}hr{margin:18px 0}';

  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><meta charset='utf-8'><style>${css}</style></head><body><div class="Section1">` +
    `<h2>개별화교육계획 / 평가</h2>${header}${body}</div></body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IEP_${(student.code || '학생')}_${dateStr.replace(/[^0-9]/g, '')}.doc`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 3000);
}

function triggerDownload(html, filename) {
  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}

// ── 평가초점 연수자료 양식(생활 지원 중심 / 교과 중심) Word 내보내기 ─────────────
const DAILY_SUBJECT = '일상생활 활동';

function dedupeLines(arr) {
  const out = [];
  const seen = new Set();
  (arr || []).forEach((s) => String(s || '').split(/\r?\n/).forEach((line) => {
    const t = line.replace(/^\s*[-•·]\s*/, '').trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }));
  return out;
}
const bulletML = (arr) => (arr.length ? arr.map((t) => '- ' + esc(t)).join('<br/>') : '-');
const critMethodText = (t) => (t === 'qual' ? '관찰법(질적·서술 평가)' : t === 'freq' ? '관찰법(기회 중 성공 횟수)' : '관찰법(독립 수행 비율 %)');

function iepFormTable(g) {
  const isDaily = (g.subject || '') === DAILY_SUBJECT;
  const headLabel = isDaily ? '영역' : '과목';
  const headValue = isDaily ? (g.area || g.subject || '') : (g.subject || '');
  const foci = Array.isArray(g.eval_foci) ? g.eval_foci.filter((f) => String(f).trim()) : [];

  const goalParts = [];
  goalParts.push('&lt;학기목표&gt;');
  goalParts.push('- ' + escML(g.semester_goal || ''));
  if (!isDaily && g.standard_code) {
    goalParts.push('');
    goalParts.push('＊관련성취기준');
    goalParts.push('[' + esc(g.standard_code) + '] ' + esc(g.standard_text || ''));
  }
  goalParts.push('');
  goalParts.push('&lt;평가계획&gt;');
  if (g.support_tier || g.supportTier) goalParts.push('＊지원수준: ' + esc(g.support_tier || g.supportTier));
  goalParts.push('＊평가방법: ' + critMethodText(g.crit_type));
  if (foci.length) {
    goalParts.push('＊평가초점');
    foci.forEach((f) => goalParts.push('- ' + esc(f)));
  }
  const goalBlock = goalParts.join('<br/>');

  const content = bulletML(dedupeLines((g.monthly || []).map((m) => m.content)));
  const methods = bulletML(dedupeLines((g.monthly || []).flatMap((m) => m.methods || [])));
  const evalText = g.semestral_eval
    ? escML(g.semestral_eval)
    : bulletML(dedupeLines((g.monthly || []).map((m) => m.eval)).slice(0, 5));
  const heading = isDaily ? '생활 지원 중심 개별화교육계획' : '교과 중심 개별화교육계획';

  return (
    `<h3>${esc(heading)}</h3>` +
    `<table class="form">` +
    `<tr><td class="hl">${headLabel}</td><td>${esc(headValue)}</td><td class="hl" style="width:60px">학년</td><td>${esc(GRADE[g.grade_code] || '')}</td></tr>` +
    `<tr><td class="hl">현행수준</td><td colspan="3">${escML(g.plop || '')}</td></tr>` +
    `<tr><td class="hl" rowspan="2">학기 목표</td><td rowspan="2" style="width:38%">${goalBlock}</td><td class="hl" style="width:64px">교육내용</td><td>${content}</td></tr>` +
    `<tr><td class="hl">교육방법</td><td>${methods}</td></tr>` +
    `<tr><td class="hl">평가</td><td colspan="3">${evalText}</td></tr>` +
    `</table>`
  );
}

/**
 * 평가초점 연수자료 양식대로 IEP를 Word(.doc)로 내보낸다.
 * 일상생활 활동 → 생활 지원 중심, 그 외 → 교과 중심 양식으로 자동 구성.
 */
export function downloadIepFormWord({ student = {}, teacherName = '', school = '', goals = [] }) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`;
  const header =
    `<table class="head"><tr>` +
    `<td class="hl">성명</td><td>${esc(student.code)}</td>` +
    `<td class="hl">학교급</td><td>${esc(student.level)}</td>` +
    `<td class="hl">담임</td><td>${esc(teacherName)}</td>` +
    `<td class="hl">작성일</td><td>${esc(dateStr)}</td></tr></table>`;
  const body = goals.map(iepFormTable).join('<div style="page-break-after:always"></div>');
  const css =
    LANDSCAPE_CSS +
    'body{font-family:"맑은 고딕",sans-serif}' +
    'table{border-collapse:collapse;width:100%;margin:6px 0 16px}' +
    'td,th{border:1px solid #000;padding:6px 8px;font-size:10.5pt;vertical-align:top}' +
    'table.head td{font-size:10.5pt}.hl{background:#dbe5f1;font-weight:bold;text-align:center;width:84px;white-space:nowrap}' +
    'h2{font-size:15pt;text-align:center;margin:0 0 10px}h3{font-size:12pt;margin:16px 0 4px;color:#1f3864}';
  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><meta charset='utf-8'><style>${css}</style></head><body><div class="Section1">` +
    `<h2>개별화교육계획</h2>${header}${body}</div></body></html>`;
  triggerDownload(html, `개별화교육계획_양식_${(student.code || '학생')}_${dateStr.replace(/[^0-9]/g, '')}.doc`);
}

const REPORT_CSS =
  LANDSCAPE_CSS +
  'body{font-family:"맑은 고딕",sans-serif}' +
  'table{border-collapse:collapse;width:100%;margin:6px 0 18px}' +
  'td,th{border:1px solid #000;padding:5px 6px;font-size:10pt;vertical-align:top}' +
  'th{background:#2f5496;color:#fff;text-align:center}' +
  'table.head td{font-size:10.5pt}.hl{background:#eee;font-weight:bold;width:80px}' +
  'td.c{text-align:center;background:#f3f6fc;font-weight:bold;white-space:nowrap}' +
  'h2{font-size:14pt;text-align:center;margin:0 0 4px}h3{font-size:11.5pt;margin:16px 0 4px}' +
  '.yr{font-size:10pt;margin:0 0 6px}';

/**
 * 학생 단위 · 전 교과 통합 "개별화교육계획/평가" 완성본(학기별 + 월별 종합표) Word 출력.
 * @param {object} opts { student:{code,level,disability}, teacherName, school, year, semester(''|1|2), goals:[] }
 */
export function downloadIepReport({ student = {}, teacherName = '', school = '', year, semester = '', goals = [] }) {
  const yr = year || new Date().getFullYear();
  const list = semester ? goals.filter((g) => String(g.semester) === String(semester)) : goals;

  const head =
    `<table class="head"><tr>` +
    `<td class="hl">성명</td><td>${esc(student.code)}</td>` +
    `<td class="hl">학년·반</td><td>${esc(student.level)}</td>` +
    `<td class="hl">담임</td><td>${esc(teacherName)}</td></tr>` +
    `<tr><td class="hl">장애유형</td><td>${esc(student.disability)}</td>` +
    `<td class="hl">학교</td><td>${esc(school)}</td>` +
    `<td class="hl">작성일</td><td>${esc(`${yr}. ${new Date().getMonth() + 1}. ${new Date().getDate()}.`)}</td></tr></table>`;

  // 학기별 종합표 (행=목표)
  const semRows = list.map((g) =>
    `<tr><td class="c">${g.semester}학기</td><td class="c">${esc(g.area || g.subject)}</td>` +
    `<td>${escML(g.plop)}</td><td>${escML(g.semester_goal)}</td>` +
    `<td>${escML(g.semestral_eval)}</td><td class="c">${esc(teacherName)}</td></tr>`
  ).join('');
  const semTable =
    `<table><thead><tr><th style="width:48px">학기</th><th style="width:90px">영역</th>` +
    `<th style="width:24%">현행수준</th><th>학기목표</th><th style="width:26%">평가</th><th style="width:70px">담임교사</th></tr></thead>` +
    `<tbody>${semRows || '<tr><td colspan="6">저장된 목표가 없습니다.</td></tr>'}</tbody></table>`;

  // 월별 종합표 (행=목표×월)
  const monRows = list.flatMap((g) =>
    (g.monthly || []).map((m) =>
      `<tr><td class="c">${g.semester}학기</td><td class="c">${esc(g.area || g.subject)}</td><td class="c">${esc(m.month)}월</td>` +
      `<td>${escML(m.goal)}</td><td>${escML(m.content)}</td>` +
      `<td>${(m.methods || []).map((x) => '- ' + esc(x)).join('<br/>')}</td>` +
      `<td>${escML(m.eval)}</td><td class="c">${esc(teacherName)}</td></tr>`
    )
  ).join('');
  const monTable =
    `<table><thead><tr><th style="width:44px">학기</th><th style="width:80px">영역</th><th style="width:40px">월</th>` +
    `<th>교육목표</th><th>교육내용</th><th style="width:120px">교육방법</th><th style="width:22%">평가</th><th style="width:60px">담임교사</th></tr></thead>` +
    `<tbody>${monRows || '<tr><td colspan="8">월별 계획이 없습니다.</td></tr>'}</tbody></table>`;

  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><meta charset='utf-8'><style>${REPORT_CSS}</style></head><body><div class="Section1">` +
    `<h2>학기별 개별화교육계획 / 평가</h2><div class="yr">학년도 : ${esc(yr)}${semester ? ` · ${semester}학기` : ''}</div>${head}` +
    `<h3>학기별 개별화교육계획/평가</h3>${semTable}` +
    `<h3>월별 개별화교육계획/평가</h3>${monTable}</div></body></html>`;

  triggerDownload(html, `IEP_계획서_${(student.code || '학생')}_${yr}${semester ? '_' + semester + '학기' : ''}.doc`);
}
