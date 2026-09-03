// 나이스(NEIS) 양식 "학기별/월별 개별화교육계획·평가" Word(.docx) 내보내기.
// HTML 위장 .doc 방식(Word 버전에 따라 깨짐)을 대체 — docx 라이브러리로 진짜 .docx를 생성한다.
// 양식 출처: 개별화교육계획 양식-나이스(학기별 표 + 월별 표 + 하단 평가계획 표).
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, VerticalAlign, PageOrientation, HeadingLevel,
  TableLayoutType,
} from 'docx';
import { stdGoalsForDoc } from './iepGoalStyle';

const FONT = '맑은 고딕';

// 0720 현장 제보: 퍼센트 너비만 있는 표가 한컴오피스·구버전 Word에서 열이 전부
// 최소 폭으로 붕괴(세로 한 줄)됨. 최신 Word는 재계산해 멀쩡해 맥에서만 정상으로 보였음.
// → 열 너비를 트윕(dxa) 절대값으로 tblGrid에 명시하고 고정 레이아웃을 쓴다.
// A4 가로(16838 트윕) - 좌우 여백(700+700) = 사용 가능 폭.
const CONTENT_W = 15438;
const pctToDxa = (p) => Math.round((CONTENT_W * p) / 100);

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
    // width는 열 퍼센트 → dxa 절대폭으로 변환해 넣는다(호환성).
    ...(width ? { width: { size: pctToDxa(width), type: WidthType.DXA } } : {}),
    ...(colSpan ? { columnSpan: colSpan } : {}),
    ...(rowSpan ? { rowSpan } : {}),
    verticalAlign: VerticalAlign.CENTER,
    shading: shade ? { fill: 'EFEFEF' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: paras(text, { align: center ? AlignmentType.CENTER : AlignmentType.LEFT, bold, size }),
  });
}

const headCell = (t, w) => cell(t, { width: w, bold: true, center: true, shade: true });

// colPcts: 열 너비 퍼센트 배열 — tblGrid(columnWidths)로 명시해 어느 워드에서도
// 같은 폭으로 열리게 한다. 고정 레이아웃이라 내용 길이에 따라 열이 널뛰지 않는다.
function fullTable(rows, colPcts) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    ...(Array.isArray(colPcts) && colPcts.length
      ? { columnWidths: colPcts.map(pctToDxa), layout: TableLayoutType.FIXED }
      : {}),
    rows,
  });
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
  ], [10, 23, 12, 25, 10, 20]);
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

// 0819(동료 피드백): 학기목표 아래에 관련 성취기준(대표 + 다중 선택)을 함께 표기 —
// 첫 번째 외에 선택한 성취기준도 개별화계획 문서에서 확인할 수 있게.
const goalWithStds = (g) => {
  const stds = [
    ...(g.standard_code ? [{ code: g.standard_code, text: g.standard_text }] : []),
    ...(Array.isArray(g.related_stds) ? g.related_stds : []),
  ].filter((x) => x && x.code);
  // 0903(B안): 성취기준별 목표(학생 수준으로 조정) — 설정이 '한 문장만'이면 생략.
  const sg = stdGoalsForDoc(g);
  const goalPart = sg.length
    ? `${g.semester_goal || ''}\n＊성취기준별 목표\n${sg.map((x) => `- [${x.code}] ${x.goal}`).join('\n')}`
    : (g.semester_goal || '');
  if (!stds.length) return goalPart;
  return `${goalPart}\n\n(관련 성취기준)\n${stds.map((x) => `[${x.code}] ${x.text || ''}`).join('\n')}`;
};

/**
 * 나이스 양식(학기별 + 월별 + 평가계획) 개별화교육계획/평가 .docx 다운로드.
 * @param {object} opts
 * @param {object} opts.student      - { code, level }
 * @param {string} opts.teacherName
 * @param {number} opts.year         - 학년도
 * @param {string|number} [opts.semester] - ''(전체) | 1 | 2
 * @param {Array}  opts.goals        - iep_goals rows
 */
export function buildNiceIepDoc({ student = {}, teacherName = '', year, semester = '', goals = [] }) {
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
      cell(goalWithStds(g)),
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
        // A4를 명시(트윕, 세로 기준 — docx 라이브러리가 LANDSCAPE면 가로/세로를 스왑해 출력).
        // 미지정 시 뷰어에 따라 Letter로 열려 표 폭(CONTENT_W)과 어긋날 수 있다.
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 }, margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
        children: [
          title('학기별 개별화교육계획/평가'),
          yearLine(yr),
          nameTable(student, teacherName),
          gap(),
          fullTable([semHeader, ...(semRows.length ? semRows : [emptyRow(6)])], [6, 10, 26, 26, 24, 8]),
        ],
      },
      {
        // A4를 명시(트윕, 세로 기준 — docx 라이브러리가 LANDSCAPE면 가로/세로를 스왑해 출력).
        // 미지정 시 뷰어에 따라 Letter로 열려 표 폭(CONTENT_W)과 어긋날 수 있다.
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE, width: 11906, height: 16838 }, margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
        children: [
          title('월별 개별화교육계획/평가'),
          nameTable(student, teacherName),
          gap(),
          fullTable([monHeader, ...(monRows.length ? monRows : [emptyRow(8)])], [5, 8, 5, 17, 17, 22, 19, 7]),
          gap(),
          fullTable([planHeader, ...(planRows.length ? planRows : [emptyRow(3)])], [6, 12, 82]),
        ],
      },
    ],
  });
  return { doc, yr };
}

export async function downloadNiceIepDocx(opts) {
  const { doc, yr } = buildNiceIepDoc(opts);
  const student = opts.student || {};
  const semester = opts.semester || '';
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `개별화교육계획_나이스_${student.code || '학생'}_${yr}${semester ? '_' + semester + '학기' : ''}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}
