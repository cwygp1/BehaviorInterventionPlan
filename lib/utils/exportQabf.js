// QABF(행동기능설문지) 결과를 진짜 Excel(.xlsx)로 내보낸다 — 0824 exceljs 전환.
// (이전: HTML 기반 .xls — 열 때 형식 경고가 뜨고 차트가 없었음)
// exceljs는 네이티브 엑셀 차트 생성은 지원하지 않으므로, 화면의 기능·심각도 차트
// (QabfFnChart 캔버스)를 PNG로 캡처해 시트에 이미지로 삽입한다 — 공식 양식과
// 동일한 시각 결과물을 파일 안에 담는 실용적 방식이다.

import { QABF_QUESTIONS, QABF_SHORT_LABELS, QABF_SCALE, QABF_SCALE_LABELS, qabfScores } from '../qabf';

const THIN = { style: 'thin', color: { argb: 'FF888888' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
const HL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FB' } };
const TOP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3BF' } };

function headCell(cell) {
  cell.fill = HEAD_FILL;
  cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = BORDER;
}
function hlCell(cell) {
  cell.fill = HL_FILL;
  cell.font = { bold: true, size: 10 };
  cell.alignment = { vertical: 'middle' };
  cell.border = BORDER;
}
function bodyCell(cell, center = false) {
  cell.font = { size: 10 };
  cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle', wrapText: true };
  cell.border = BORDER;
}

/**
 * @param responses 25칸 응답 배열 (0~3, -1 미응답, -2 해당없음)
 * @param student   { code, ... }
 * @param chartCanvas (선택) QabfFnChart의 <canvas> — 있으면 그래프를 PNG로 삽입
 */
export async function downloadQabfExcel(responses = [], student = {}, chartCanvas = null) {
  const ExcelJS = (await import('exceljs')).default; // 무거운 라이브러리 — 클릭 시점 로드
  const { func, sev } = qabfScores(responses);
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;

  const maxSev = Math.max(...sev, 0);
  const topIdx = sev.map((v, i) => (v === maxSev && maxSev > 0 ? i : -1)).filter((i) => i >= 0);
  const topText = topIdx.map((i) => QABF_SHORT_LABELS[i]).join(', ') || '-';

  const wb = new ExcelJS.Workbook();
  wb.created = today;
  const ws = wb.addWorksheet('QABF', { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 6 },   // A 번호
    { width: 56 },  // B 문항
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, // C~F 0~3
    { width: 9 },   // G X
    { width: 12 },  // H 기능
  ];

  // ── 제목 ──
  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value = '행동기능설문지 (Questions about Behavioral Functions, QABF)';
  title.font = { bold: true, size: 14 };
  ws.getRow(1).height = 24;

  // ── 상단 정보 ──
  const info = ws.addRow(['교육생', student.code || '', '평정자', '', '날짜', dateStr, '', '']);
  hlCell(info.getCell(1)); bodyCell(info.getCell(2));
  hlCell(info.getCell(3)); bodyCell(info.getCell(4));
  hlCell(info.getCell(5)); bodyCell(info.getCell(6), true);
  const beh = ws.addRow(['도전적 행동', '', '', '', '', '', '', '']);
  ws.mergeCells(`B${beh.number}:H${beh.number}`);
  hlCell(beh.getCell(1)); bodyCell(beh.getCell(2));
  ws.addRow([]);

  // ── 기능 요약표 ──
  const sumTitle = ws.addRow([`기능 분석 요약 · 추정 주요 기능: ${topText}`]);
  ws.mergeCells(`A${sumTitle.number}:H${sumTitle.number}`);
  sumTitle.getCell(1).font = { bold: true, size: 12 };
  // A:B(구분) 병합 + C~G에 5개 기능 라벨 — 아래 기능/심각도 행과 열이 맞도록.
  const sumHead = ws.addRow(['구분', '', ...QABF_SHORT_LABELS]);
  ws.mergeCells(`A${sumHead.number}:B${sumHead.number}`);
  headCell(sumHead.getCell(1));
  QABF_SHORT_LABELS.forEach((l, i) => headCell(sumHead.getCell(i + 3)));
  const funcRow = ws.addRow(['기능 (0~5)', '', ...func]);
  ws.mergeCells(`A${funcRow.number}:B${funcRow.number}`);
  hlCell(funcRow.getCell(1));
  func.forEach((v, i) => bodyCell(funcRow.getCell(i + 3), true));
  const sevRow = ws.addRow(['심각도 (0~15)', '', ...sev]);
  ws.mergeCells(`A${sevRow.number}:B${sevRow.number}`);
  hlCell(sevRow.getCell(1));
  sev.forEach((v, i) => {
    const cell = sevRow.getCell(i + 3);
    bodyCell(cell, true);
    if (topIdx.includes(i)) { cell.fill = TOP_FILL; cell.font = { bold: true, size: 10 }; }
  });
  ws.addRow([]);

  // ── 기능·심각도 그래프 (화면 캔버스 → PNG 삽입) ──
  if (chartCanvas && typeof chartCanvas.toDataURL === 'function') {
    try {
      const imgId = wb.addImage({ base64: chartCanvas.toDataURL('image/png'), extension: 'png' });
      const anchorRow = ws.lastRow.number; // 0-based tl 좌표용
      ws.addImage(imgId, {
        tl: { col: 0, row: anchorRow },
        ext: { width: 560, height: 280 },
      });
      // 이미지가 차지할 공간만큼 빈 행 확보(대략 15행)
      for (let i = 0; i < 15; i += 1) ws.addRow([]);
    } catch (_e) { /* 캡처 실패 시 그래프 없이 진행 */ }
  }

  // ── 25문항 응답표 ──
  const qHead = ws.addRow([
    '번호', '문항',
    ...QABF_SCALE.map((v) => `${v} ${QABF_SCALE_LABELS[v]}`),
    'X 해당없음', '기능',
  ]);
  qHead.eachCell((cell) => headCell(cell));
  QABF_QUESTIONS.forEach((item, i) => {
    const sel = responses[i];
    const row = ws.addRow([
      i + 1, item.q,
      ...QABF_SCALE.map((v) => (sel === v ? '●' : '')),
      sel === -2 ? '●' : '',
      QABF_SHORT_LABELS[i % 5],
    ]);
    bodyCell(row.getCell(1), true);
    bodyCell(row.getCell(2));
    for (let c = 3; c <= 7; c += 1) bodyCell(row.getCell(c), true);
    bodyCell(row.getCell(8), true);
  });

  ws.addRow([]);
  const note = ws.addRow(['※ 척도: 0 해당없음 / 1 가끔 / 2 종종 / 3 자주 · 기능=0점 초과 응답 문항 수, 심각도=점수 합']);
  ws.mergeCells(`A${note.number}:H${note.number}`);
  note.getCell(1).font = { size: 9, color: { argb: 'FF666666' } };

  // ── 다운로드 ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `QABF_${(student.code || '학생')}_${dateStr.replace(/[^0-9]/g, '')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}
