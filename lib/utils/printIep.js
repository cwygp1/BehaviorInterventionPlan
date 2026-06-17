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
      const u = unitOf(g.crit_type);
      const title = `${esc(g.subject)}${g.area ? ' · ' + esc(g.area) : ''} · ${esc(GRADE[g.grade_code] || '')} · ${g.semester}학기`;
      return (
        `<h3>${i + 1}. ${title}</h3>` +
        `<p class="std">성취기준 [${esc(g.standard_code)}] ${esc(g.standard_text)}</p>` +
        `<h4>학기별 개별화교육계획/평가</h4>${semestralTable(g)}` +
        `<h4>월별 개별화교육계획/평가</h4>${monthlyTable(g)}` +
        `<p class="crit">평가 기준: ${g.crit_type === 'rate' ? '독립 수행 비율' : '기회 중 성공 횟수'} ${esc(g.crit_start)}${u} → ${esc(g.crit_end)}${u}</p>`
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
