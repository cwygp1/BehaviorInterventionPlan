// 행동 계약서 — 진짜 Word(.docx) 내보내기 (0828).
// LMAC 계약서 구조(과제/보상 × 누가·무엇을·언제·얼마나 + 서명·날짜 + 과제 기록표)를
// 편집 가능한 문서로 내려받는다. 표 폭은 niceIepDocx/iepFormDocx에서 검증된 방식대로
// 트윕(dxa) 절대값 + 고정 레이아웃 → 한컴오피스·구버전 Word에서도 동일하게 열린다.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, VerticalAlign, HeadingLevel, TableLayoutType, HeightRule,
} from 'docx';

const FONT = '맑은 고딕';
// A4 세로(11906 트윕) - 좌우 여백(850+850).
const CONTENT_W = 10206;
const pctToDxa = (p) => Math.round((CONTENT_W * p) / 100);

const NAVY = '2A3568';
const GOLD = 'B3924A';
const SHADE_TASK = 'E8ECF7';
const SHADE_REWARD = 'F7EFDA';

function paras(text, { align = AlignmentType.LEFT, bold = false, size = 20, color } = {}) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  return lines.map((line) => new Paragraph({
    alignment: align,
    spacing: { after: 20 },
    children: [new TextRun({ text: line, font: FONT, size, bold, ...(color ? { color } : {}) })],
  }));
}

function cell(text, { width, bold = false, center = false, shade, size = 20, color, colSpan } = {}) {
  return new TableCell({
    ...(width ? { width: { size: pctToDxa(width), type: WidthType.DXA } } : {}),
    ...(colSpan ? { columnSpan: colSpan } : {}),
    verticalAlign: VerticalAlign.CENTER,
    shading: shade ? { fill: shade } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: paras(text, { align: center ? AlignmentType.CENTER : AlignmentType.LEFT, bold, size, color }),
  });
}

function fullTable(rows, colPcts) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colPcts.map(pctToDxa),
    layout: TableLayoutType.FIXED,
    rows,
  });
}

const gap = () => new Paragraph({ spacing: { after: 60 }, children: [] });

const DAYS_MF = ['월', '화', '수', '목', '금'];
const DAYS_WEEK = ['월', '화', '수', '목', '금', '토', '일'];

// Document 객체만 조립해 돌려준다 — downloadContractDocx가 쓰고, 테스트에서도 재사용.
export function buildContractDoc({
  studentId, teacherName,
  task = {},      // { who, what, when, howWell }
  reward = {},    // { who, what, when, howMuch }
  d1, d2,
  recordType = 'mf',  // 'none' | 'mf' | 'week'
  weeks = 4,
}) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmt = (v) => v ? new Date(v).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '     .   .   ';
  const nWeeks = Math.min(8, Math.max(1, Number(weeks) || 4));
  const days = recordType === 'week' ? DAYS_WEEK : DAYS_MF;

  const children = [];

  // ── 제목 ──
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: '행 동 계 약 서', font: FONT, size: 40, bold: true, color: NAVY })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text: 'Behavior Contract', font: FONT, size: 16, color: '999999' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({
      text: `대상 학생 · ${studentId || '________'}     |     작성일 · ${today}`,
      font: FONT, size: 18, bold: true, color: '555555',
    })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '우리는 아래의 약속을 확인하고, 서로의 노력을 응원하기로 하였습니다.', font: FONT, size: 20 })],
  }));

  // ── 과제 / 보상 표 (구분 | 과제 | 보상) ──
  const v = (s) => String(s || '').trim() || ' ';
  children.push(fullTable([
    new TableRow({
      children: [
        cell('구분', { width: 14, bold: true, center: true, shade: 'D9DEEC' }),
        cell('과제 (Task)', { width: 43, bold: true, center: true, shade: SHADE_TASK, color: NAVY }),
        cell('보상 (Reward)', { width: 43, bold: true, center: true, shade: SHADE_REWARD, color: GOLD }),
      ],
    }),
    new TableRow({ children: [cell('누가', { width: 14, bold: true, center: true, shade: 'F2F4FA' }), cell(v(task.who), { width: 43 }), cell(v(reward.who), { width: 43 })] }),
    new TableRow({ children: [cell('무엇을', { width: 14, bold: true, center: true, shade: 'F2F4FA' }), cell(v(task.what), { width: 43 }), cell(v(reward.what), { width: 43 })] }),
    new TableRow({ children: [cell('언제', { width: 14, bold: true, center: true, shade: 'F2F4FA' }), cell(v(task.when), { width: 43 }), cell(v(reward.when), { width: 43 })] }),
    new TableRow({ children: [cell('얼마나 잘 · 얼마나', { width: 14, bold: true, center: true, shade: 'F2F4FA', size: 16 }), cell(v(task.howWell), { width: 43 }), cell(v(reward.howMuch), { width: 43 })] }),
  ], [14, 43, 43]));
  children.push(gap());

  // ── 계약 기간 ──
  children.push(fullTable([
    new TableRow({
      children: [
        cell('계약 기간', { width: 20, bold: true, center: true, shade: 'FFF3D9', color: GOLD }),
        cell(`${fmt(d1)}   ~   ${fmt(d2)}`, { width: 80, center: true, bold: true }),
      ],
    }),
  ], [20, 80]));
  children.push(gap());

  // ── 서명 ──
  const signRow = (role, sub, name) => new TableRow({
    height: { value: 600, rule: HeightRule.ATLEAST },
    children: [
      cell(`${role}\n(${sub})`, { width: 24, bold: true, center: true, shade: 'F2F4FA', size: 18 }),
      cell(name ? `${name}          (서명)` : '(서명)', { width: 46 }),
      cell('날짜 :', { width: 30, size: 18 }),
    ],
  });
  children.push(fullTable([
    signRow('과제를 하는 사람', '학생 서명', v(task.who) === ' ' ? '' : task.who),
    signRow('보상을 주는 사람', '교사 서명', String(reward.who || teacherName || '').trim()),
  ], [24, 46, 30]));

  // ── 과제 기록표 ──
  if (recordType !== 'none') {
    children.push(gap());
    children.push(new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({ text: '과제 기록 (Task Record)', font: FONT, size: 22, bold: true, color: NAVY }),
        new TextRun({ text: '   — 과제를 해낸 날에 ○ 표시하거나 스티커를 붙여요', font: FONT, size: 16, color: '999999' }),
      ],
    }));
    const wkW = 12;
    const dayW = (100 - wkW) / days.length;
    children.push(fullTable([
      new TableRow({
        children: [
          cell('주', { width: wkW, bold: true, center: true, shade: 'D9DEEC' }),
          ...days.map((d) => cell(d, { width: dayW, bold: true, center: true, shade: SHADE_TASK })),
        ],
      }),
      ...Array.from({ length: nWeeks }, (_, i) => new TableRow({
        height: { value: 500, rule: HeightRule.ATLEAST },
        children: [
          cell(`${i + 1}주`, { width: wkW, bold: true, center: true, shade: 'FFF3D9', color: GOLD }),
          ...days.map(() => cell(' ', { width: dayW })),
        ],
      })),
    ], [wkW, ...days.map(() => dayW)]));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240 },
    children: [new TextRun({ text: '이 계약서는 학생의 긍정적 행동 변화를 격려하기 위한 도구입니다.', font: FONT, size: 14, color: '999999' })],
  }));

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
      children,
    }],
  });
}

export async function downloadContractDocx(opts) {
  const doc = buildContractDoc(opts);
  const studentId = opts?.studentId;
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `행동계약서_${studentId || '학생'}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}
