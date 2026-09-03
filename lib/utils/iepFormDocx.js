// IEP 양식(생활지원/교과 중심) + 과제분석 기록지 — 진짜 Word(.docx) 내보내기 (0824).
// HTML 위장 .doc(printIep.js — Word 버전에 따라 열 폭 붕괴·형식 경고)을 대체한다.
// 표 폭 처리는 niceIepDocx.js에서 검증된 방식 그대로: 열 너비를 트윕(dxa) 절대값으로
// tblGrid에 명시 + 고정 레이아웃 → 한컴오피스·구버전 Word에서도 동일하게 열린다.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, VerticalAlign, PageOrientation, HeadingLevel,
  TableLayoutType,
} from 'docx';
import { stdGoalsForDoc } from './iepGoalStyle';

const FONT = '맑은 고딕';
// A4 가로(16838 트윕) - 좌우 여백(700+700).
const CONTENT_W = 15438;
const pctToDxa = (p) => Math.round((CONTENT_W * p) / 100);

const GRADE = { 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };
const CHAIN_LABEL = { forward: '전진형', backward: '후진형', total: '전체과제 제시형' };
const PROMPT_LABEL = { mtl: '최대-최소촉진', slp: '최소촉진체계', td: '시간지연', sim: '동시촉진' };
const DAILY_SUBJECT = '일상생활 활동';

// ── 공통 빌더 ───────────────────────────────────────────────────────────────
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
    ...(width ? { width: { size: pctToDxa(width), type: WidthType.DXA } } : {}),
    ...(colSpan ? { columnSpan: colSpan } : {}),
    ...(rowSpan ? { rowSpan } : {}),
    verticalAlign: VerticalAlign.CENTER,
    shading: shade ? { fill: 'DBE5F1' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: paras(text, { align: center ? AlignmentType.CENTER : AlignmentType.LEFT, bold, size }),
  });
}
const headCell = (t, w, opts = {}) => cell(t, { width: w, bold: true, center: true, shade: true, ...opts });

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

function subTitle(text) {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: '1F3864' })],
  });
}

async function downloadDoc(sections, filename) {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 700, bottom: 700, left: 700, right: 700 },
        },
      },
      children: sections,
    }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}

// ── 텍스트 조립(printIep.js의 검증된 로직 이관) ─────────────────────────────
function dedupeLines(arr) {
  const out = [];
  const seen = new Set();
  (arr || []).forEach((s) => String(s || '').split(/\r?\n/).forEach((line) => {
    const t = line.replace(/^\s*[-•·]\s*/, '').trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }));
  return out;
}
const bulletText = (arr) => (arr.length ? arr.map((t) => '- ' + t).join('\n') : '-');
const critMethodText = (t) => (t === 'qual' ? '관찰법(질적·서술 평가)' : t === 'task' ? '과제분석(단계별 수행 평가)' : t === 'freq' ? '관찰법(기회 중 성공 횟수)' : '관찰법(독립 수행 비율 %)');

// 월별 교육방법 점증 사다리를 학기 요약으로 압축(printIep.js summarizeMethods와 동일 규칙).
function summarizeMethods(monthly) {
  const all = (monthly || [])
    .flatMap((m) => (Array.isArray(m.methods) ? m.methods : String(m.methods || '').split(/\r?\n/)))
    .map((s) => String(s || '').replace(/^\s*[-•·]\s*/, '').trim())
    .filter(Boolean);
  const cats = [/^지도전략\s*[:：]/, /^지원수준/, /^강화/];
  const grouped = cats.map(() => []);
  const rest = [];
  all.forEach((s) => {
    const gi = cats.findIndex((re) => re.test(s));
    if (gi >= 0) { if (!grouped[gi].includes(s)) grouped[gi].push(s); }
    else if (!rest.includes(s)) rest.push(s);
  });
  const out = [];
  grouped.forEach((lines) => {
    if (!lines.length) return;
    if (lines.length === 1) out.push(lines[0]);
    else { out.push('(학기초) ' + lines[0]); out.push('(학기말) ' + lines[lines.length - 1]); }
  });
  return [...out, ...rest];
}

function goalBlockText(g, isDaily) {
  const foci = Array.isArray(g.eval_foci) ? g.eval_foci.filter((f) => String(f).trim()) : [];
  const parts = [];
  parts.push('<학기목표>');
  parts.push('- ' + String(g.semester_goal || ''));
  // 0903(B안): 성취기준별 목표 — 설정이 '한 문장만'이면 생략.
  const sgDoc = stdGoalsForDoc(g);
  if (sgDoc.length) {
    parts.push('');
    parts.push('＊성취기준별 목표');
    sgDoc.forEach((x) => parts.push('- [' + x.code + '] ' + String(x.goal || '')));
  }
  if (!isDaily && g.standard_code) {
    parts.push('');
    parts.push('＊관련성취기준');
    parts.push('[' + g.standard_code + '] ' + (g.standard_text || ''));
    (Array.isArray(g.related_stds) ? g.related_stds : []).forEach((x) => {
      parts.push('[' + x.code + '] ' + (x.text || ''));
    });
  }
  parts.push('');
  parts.push('<평가계획>');
  if (g.support_tier || g.supportTier) parts.push('＊지원체계: ' + (g.support_tier || g.supportTier));
  parts.push('＊평가방법: ' + critMethodText(g.crit_type));
  if (foci.length) {
    parts.push('＊평가초점');
    foci.forEach((f) => parts.push('- ' + f));
  }
  const steps = Array.isArray(g.task_steps) ? g.task_steps.filter((s) => String(s).trim()) : [];
  if (g.crit_type === 'task' && steps.length) {
    parts.push('＊과제분석 단계');
    steps.forEach((s, k) => parts.push((k + 1) + ') ' + s));
  }
  return parts.join('\n');
}

// ── ① 평가초점 연수자료 양식(생활 지원 중심 / 교과 중심) .docx ────────────────
export async function downloadIepFormDocx({ student = {}, teacherName = '', goals = [] }) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`;

  const header = fullTable([
    new TableRow({
      children: [
        headCell('성명', 8), cell(student.code || '', { width: 17, center: true }),
        headCell('학교급', 8), cell(student.level || '', { width: 17, center: true }),
        headCell('담임', 8), cell(teacherName || '', { width: 17, center: true }),
        headCell('작성일', 8), cell(dateStr, { width: 17, center: true }),
      ],
    }),
  ], [8, 17, 8, 17, 8, 17, 8, 17]);

  const children = [title('개별화교육계획'), header];

  goals.forEach((g, gi) => {
    const isDaily = (g.subject || '') === DAILY_SUBJECT;
    const heading = isDaily ? '생활 지원 중심 개별화교육계획' : '교과 중심 개별화교육계획';
    const headLabel = isDaily ? '영역' : '과목';
    const headValue = isDaily ? (g.area || g.subject || '') : (g.subject || '');
    const content = bulletText(dedupeLines((g.monthly || []).map((m) => m.content)));
    const methods = (g.sem_methods && String(g.sem_methods).trim())
      ? bulletText(dedupeLines([g.sem_methods]))
      : bulletText(summarizeMethods(g.monthly));
    const evalText = g.semestral_eval
      ? String(g.semestral_eval)
      : bulletText(dedupeLines((g.monthly || []).map((m) => m.eval)).slice(0, 5));

    // 열 구성: [라벨 10 | 값 38 | 라벨 10 | 값 42]
    const COLS = [10, 38, 10, 42];
    const form = fullTable([
      new TableRow({
        children: [
          headCell(headLabel, COLS[0]), cell(headValue, { width: COLS[1], center: true }),
          headCell('학년', COLS[2]), cell(GRADE[g.grade_code] || '', { width: COLS[3], center: true }),
        ],
      }),
      new TableRow({
        children: [
          headCell('현행수준', COLS[0]),
          cell(g.plop || '', { width: COLS[1], colSpan: 3 }),
        ],
      }),
      new TableRow({
        children: [
          headCell('학기 목표', COLS[0], { rowSpan: 2 }),
          cell(goalBlockText(g, isDaily), { width: COLS[1], rowSpan: 2 }),
          headCell('교육내용', COLS[2]),
          cell(content, { width: COLS[3] }),
        ],
      }),
      new TableRow({
        children: [
          headCell('교육방법', COLS[2]),
          cell(methods, { width: COLS[3] }),
        ],
      }),
      new TableRow({
        children: [
          headCell('평가', COLS[0]),
          cell(evalText, { width: COLS[1], colSpan: 3 }),
        ],
      }),
    ], COLS);

    children.push(subTitle(heading));
    children.push(form);
    if (gi < goals.length - 1) children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
  });

  await downloadDoc(children, `개별화교육계획_양식_${(student.code || '학생')}_${dateStr.replace(/[^0-9]/g, '')}.docx`);
}

// ── ② 과제분석 단계별 평가 기록지 .docx ────────────────────────────────────
export async function downloadTaskSheetDocx({ student = {}, teacherName = '', goalText = '', steps = [], chainType = 'forward', promptSystem = 'mtl', totalCols = 8 }) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}.`;
  const clean = (steps || []).map((s) => String(s).trim()).filter(Boolean);
  const chain = CHAIN_LABEL[chainType] || '전진형';
  const prompt = PROMPT_LABEL[promptSystem] || '최대-최소촉진';

  const head = fullTable([
    new TableRow({
      children: [
        headCell('성명', 10), cell(student.code || '', { width: 23, center: true }),
        headCell('학년·반', 10), cell(student.level || '', { width: 24, center: true }),
        headCell('담임', 10), cell(teacherName || '', { width: 23, center: true }),
      ],
    }),
    new TableRow({
      children: [
        headCell('과제(목표)', 10), cell(goalText || '', { width: 57, colSpan: 3 }),
        headCell('작성일', 10), cell(dateStr, { width: 23, center: true }),
      ],
    }),
    new TableRow({
      children: [
        headCell('교수 순서', 10), cell(chain, { width: 23, center: true }),
        headCell('촉진 체계', 10), cell(prompt, { width: 24, center: true }),
        headCell('전체 단계', 10), cell(`${clean.length}단계`, { width: 23, center: true }),
      ],
    }),
  ], [10, 23, 10, 24, 10, 23]);

  // 열: 단계 5% | 하위행동 35% | 회기 칸 totalCols등분(60%)
  const sessW = 60 / totalCols;
  const COLS = [5, 35, ...Array.from({ length: totalCols }, () => sessW)];
  const blankCells = () => Array.from({ length: totalCols }, () => cell('', { width: sessW, center: true }));

  const rows = [
    new TableRow({
      children: [
        headCell('단계', 5), headCell('하위 행동(과제분석)', 35),
        headCell(`회기 / 날짜 (각 칸에 촉진 코드 기록)`, 60, { colSpan: totalCols }),
      ],
    }),
    new TableRow({
      children: [
        cell('', { width: 5 }), cell('날짜 →', { width: 35, center: true, bold: true }),
        ...blankCells(),
      ],
    }),
    ...(clean.length ? clean : ['단계를 입력하세요.']).map((s, k) => new TableRow({
      children: [
        cell(clean.length ? String(k + 1) : '-', { width: 5, center: true, bold: true, shade: true }),
        cell(s, { width: 35 }),
        ...blankCells(),
      ],
    })),
    new TableRow({
      children: [
        cell(`독립(I) 단계 수 / 전체 ${clean.length}`, { width: 40, colSpan: 2, center: true, bold: true, shade: true }),
        ...blankCells(),
      ],
    }),
  ];

  const legend = [
    new Paragraph({
      spacing: { before: 120, after: 40 },
      children: [new TextRun({ text: '촉진 수준 코드   I=독립 | V=언어 촉진 | G=몸짓 촉진 | M=시범(모델) | PP=부분 신체 촉진 | FP=전신 신체 촉진', font: FONT, size: 18, bold: true })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `회기마다 각 단계에 위 코드를 적고, 맨 아래 행에 그날 독립(I)으로 수행한 단계 수를 기록해 진전을 추적합니다. (${chain} · ${prompt})`, font: FONT, size: 18 })],
    }),
  ];

  await downloadDoc(
    [title('과제분석 단계별 평가 기록지'), head, new Paragraph({ children: [] }), fullTable(rows, COLS), ...legend],
    `과제분석_기록지_${(student.code || '학생')}_${dateStr.replace(/[^0-9]/g, '')}.docx`
  );
}
