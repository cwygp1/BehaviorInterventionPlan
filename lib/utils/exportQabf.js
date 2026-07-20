// QABF(행동기능설문지) 결과를 Excel(.xls)로 내보낸다.
// 라이브러리 없이 Excel이 그대로 여는 HTML 기반 워크시트를 생성·다운로드한다.
// (앱의 Word/PDF 내보내기와 동일한 방식)

import { QABF_QUESTIONS, QABF_SHORT_LABELS, QABF_SCALE, QABF_SCALE_LABELS, qabfScores } from '../qabf';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function downloadQabfExcel(responses = [], student = {}) {
  const { func, sev } = qabfScores(responses);
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;

  const maxSev = Math.max(...sev, 0);
  const topIdx = sev.map((v, i) => (v === maxSev && maxSev > 0 ? i : -1)).filter((i) => i >= 0);
  const topText = topIdx.map((i) => QABF_SHORT_LABELS[i]).join(', ') || '-';

  // 상단 정보
  const infoRows =
    `<tr><td class="hl">교육생</td><td>${esc(student.code || '')}</td><td class="hl">평정자</td><td></td><td class="hl">날짜</td><td>${esc(dateStr)}</td></tr>` +
    `<tr><td class="hl">도전적 행동</td><td colspan="5"></td></tr>`;

  // 기능 요약표 (기능 0~5 / 심각도 0~15)
  const sumHead = `<tr><th>구분</th>${QABF_SHORT_LABELS.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>`;
  const funcRow = `<tr><td class="hl">기능 (0~5)</td>${func.map((v) => `<td class="num">${v}</td>`).join('')}</tr>`;
  const sevRow = `<tr><td class="hl">심각도 (0~15)</td>${sev.map((v, i) => `<td class="num"${topIdx.includes(i) ? ' style="background:#fff3bf;font-weight:bold"' : ''}>${v}</td>`).join('')}</tr>`;

  // 25문항: 선택된 점수에 ● 표시 (X = 해당없음, 점수 제외)
  const qHead =
    `<tr><th style="width:36px">번호</th><th>문항</th>` +
    QABF_SCALE.map((v) => `<th style="width:54px">${v}<br/>${esc(QABF_SCALE_LABELS[v])}</th>`).join('') +
    `<th style="width:54px">X<br/>해당없음</th>` +
    `<th style="width:80px">기능</th></tr>`;
  const qRows = QABF_QUESTIONS.map((item, i) => {
    const sel = responses[i];
    const cells = QABF_SCALE.map((v) => `<td class="num">${sel === v ? '●' : ''}</td>`).join('');
    const naCell = `<td class="num">${sel === -2 ? '●' : ''}</td>`;
    return `<tr><td class="num">${i + 1}</td><td>${esc(item.q)}</td>${cells}${naCell}<td>${esc(QABF_SHORT_LABELS[i % 5])}</td></tr>`;
  }).join('');

  const style =
    'table{border-collapse:collapse}' +
    'td,th{border:1px solid #888;padding:4px 6px;font-size:11px;vertical-align:middle;mso-number-format:"\\@"}' +
    'th{background:#2f5496;color:#fff;text-align:center}' +
    '.hl{background:#eef2fb;font-weight:bold}.num{text-align:center}' +
    '.title{font-size:15px;font-weight:bold}';

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8">` +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>QABF</x:Name>` +
    `<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
    `<style>${style}</style></head><body>` +
    `<table><tr><td class="title" colspan="6">행동기능설문지 (Questions about Behavioral Functions, QABF)</td></tr></table>` +
    `<table>${infoRows}</table><br/>` +
    `<table><tr><td class="title" colspan="6">기능 분석 요약 · 추정 주요 기능: ${esc(topText)}</td></tr>${sumHead}${funcRow}${sevRow}</table><br/>` +
    `<table>${qHead}${qRows}</table>` +
    `<br/><table><tr><td>※ 척도: 0 해당없음 / 1 가끔 / 2 종종 / 3 자주 · 기능=0점 초과 응답 문항 수, 심각도=점수 합</td></tr></table>` +
    `</body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QABF_${(student.code || '학생')}_${dateStr.replace(/[^0-9]/g, '')}.xls`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}
