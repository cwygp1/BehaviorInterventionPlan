// 나이스(NEIS) 양식 "학기별/월별 개별화교육계획·평가" Word(.docx) 내보내기.
// HTML 위장 .doc 방식(Word 버전에 따라 깨짐)을 대체 — docx 라이브러리로 진짜 .docx를 생성한다.
// 양식 출처: 개별화교육계획 양식-나이스(학기별 표 + 월별 표 + 하단 평가계획 표).
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, VerticalAlign, PageOrientation, HeadingLevel,
} from 'docx';

const FONT = '맑은 고딕';

// 여러 줄 텍스트("- 항목" 줄바꿈 포함)를 문단 배열로.
function paras(text, { align = AlignmentType.LEFT, bold = false, size = 18 } = {}) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  return lines.map((line) => new Paragraph({
    alignment: align,
    spacing: { after: 20 },
    children: [new TextRun({ text: line, font: FONT, size, bold })],
  }));
}

function cell(text, { width, bold = false, center = false, shade = false, size = 18, colSpan, rowSpan } = {}) {
  return new TableCell({
    ...(width ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
    ...(colSpan ? { columnSpan: colSpan } : {}),
    ...(rowSpan ? { rowSpan } : {}),
    verticalAlign: VerticalAlign.CENTER,
    shading: shade ? { fill: 'EFEFEF' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: paras(text, { align: center ? AlignmentType.CENTER : AlignmentType.LEFT, bold, size }),
  });
}

const headCell = (t, w) => cell(t, { width: w, bold: true, center: true, shade: true });

function fullTable(rows) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function title(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text, font: FONT, size: 30, bold: true, color: '000000' })],
  });
}

// 성명 | 과정/학년반 | 담임 머리표(나이스 양식 상단)
function nameTable(student, teacherName) {
  return fullTable([
    new TableRow({
      children: [
        headCell('성명', 10), cell(student.code || '', { width: 23, center: true }),
        headCell('과정/학년반', 12), cell(student.level || '', { width: 25, center: true }),
        headCell('담임', 10), cell(teacherName || '', { width: 20, center: true }),
      ],
    }),
  ]);
}

const yearLine = (yr) => new Paragraph({
  spacing: { after: 100 },
  children: [new TextRun({ text: `학년도 : ${yr}`, font: FONT, size: 20 })],
});

const gap = () => new Paragraph({ children: [], spacing: { after: 100 } });

// 교육방법 배열(지도전략/지원수준/강화 스케줄)을 여러 줄 텍스트로.
const methodsText = (m) => (Array.isArray(m) ? m : String(m || '').split(/\r?\n/))
  .map((x) => String(x).trim()).filter(Boolean)
  .map((x) => (x.startsWith('-') || x.startsWith('▪') ? x : '▪ ' + x)).join('\n');

/**
 * 나이스 양식(학기별 + 월별 + 평가계획) 개별화교육계획/평가 .docx 다운로드.
 * @param {object} opts
 * @param {object} opts.student      - { code, level }
 * @param {string} opts.teacherName
 * @param {number} opts.year         - 학년도
 * @param {string|number} [opts.semester] - ''(전체) | 1 | 2
 * @param {Array}  opts.goals        - iep_goals rows
 */
export async function downloadNiceIepDocx({ student = {}, teacherName = '', year, semester = '', goals = [] }) {
  const yr = year || new Date().getFullYear();
  const list = semester ? goals.filter((g) => String(g.semester) === String(semester)) : goals;

  // ── ① 학기별 개별화교육계획/평가 ──────────────────────────────
  const semHeader = new TableRow({
    tableHeader: true,
    children: [
      headCell('학기', 6), headCell('영역', 10), headCell('현행수준', 26),
      headCell('학기목표', 26), headCell('평가', 24), headCell('담당교사', 8),
    ],
  });
  const semRows = list.map((g) => new TableRow({
    children: [
      cell(`${g.semester}학기`, { center: true }),
      cell(g.area || g.subject || '', { center: true }),
      cell(g.plop || ''),
      cell(g.semester_goal || ''),
      cell(g.semestral_eval || ''),
      cell(teacherName, { center: true }),
    ],
  }));

  // ── ② 월별 개별화교육계획/평가 ────────────────────────────────
  const monHeader = new TableRow({
    tableHeader: true,
    children: [
      headCell('학기', 5), headCell('영역', 8), headCell('월', 5),
      headCell('교육목표', 17), headCell('교육내용', 17), headCell('교육방법', 22),
      headCell('평가', 19), headCell('담당교사', 7),
    ],
  });
  const monRows = list.flatMap((g) => (g.monthly || []).map((m) => new TableRow({
    children: [
      cell(`${g.semester}학기`, { center: true }),
      cell(g.area || g.subject || '', { center: true }),
      cell(`${m.month}월`, { center: true }),
      cell(m.goal || ''),
      cell(m.content || ''),
      cell(methodsText(m.methods)),
      cell(m.eval || ''),
      cell(teacherName, { center: true }),
    ],
  })));

  // ── ③ 하단 평가계획 표 (월 | 영역 | 평가계획) ─────────────────
  const planHeader = new TableRow({
    tableHeader: true,
    children: [headCell('월', 6), headCell('영역', 12), headCell('평 가 계 획', 82)],
  });
  const planRows = list.flatMap((g) => (g.monthly || []).map((m) => new TableRow({
    children: [
      cell(`${m.month}월`, { center: true }),
      cell(g.area || g.subject || '', { center: true }),
      cell(m.eval_plan || ''),
    ],
  })));

  const emptyRow = (cols) => new TableRow({ children: [cell('저장된 계획이 없습니다.', { colSpan: cols, center: true })] });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
        children: [
          title('학기별 개별화교육계획/평가'),
          yearLine(yr),
          nameTable(student, teacherName),
          gap(),
          fullTable([semHeader, ...(semRows.length ? semRows : [emptyRow(6)])]),
        ],
      },
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
        children: [
          title('월별 개별화교육계획/평가'),
          nameTable(student, teacherName),
          gap(),
          fullTable([monHeader, ...(monRows.length ? monRows : [emptyRow(8)])]),
          gap(),
          fullTable([planHeader, ...(planRows.length ? planRows : [emptyRow(3)])]),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `개별화교육계획_나이스_${student.code || '학생'}_${yr}${semester ? '_' + semester + '학기' : ''}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}
