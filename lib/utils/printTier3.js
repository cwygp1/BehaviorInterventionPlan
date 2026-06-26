// Tier 3 통합 개별화 문서 Word(.doc) 내보내기.
// 갑님 양식대로 ①연간 교육목표+월별 목표 ②행동중재계획 ③모니터링 및 평가 계획을
// 한 문서로 모아 출력한다. 라이브러리 없이 Word/한글이 그대로 여는 HTML 기반 .doc.
// 흩어진 모듈 데이터(IEP 목표·QABF·BIP·ABC)를 끌어모으고, 저장값이 없는 칸은
// 교사가 Word에서 바로 채울 수 있도록 편집형 기본 틀을 채워 출력한다.

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escML = (s) => esc(s).replace(/\r?\n/g, '<br/>');

// "- a\n- b" 또는 "a / b" 혼합 입력을 줄단위 불릿으로.
function bulletML(value) {
  const lines = String(value == null ? '' : value)
    .split(/\r?\n|\s*\/\s*/)
    .map((l) => l.replace(/^\s*[-•·]\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return '';
  if (lines.length === 1) return esc(lines[0]); // 한 줄은 불릿 없이
  return lines.map((l) => '- ' + esc(l)).join('<br/>');
}

// 빈 칸이면 옅은 안내 문구(교사가 채우는 자리)
const ph = (text) => `<span style="color:#999">${esc(text)}</span>`;

// A4 가로 — 넓은 월별 표가 잘리지 않게.
const LANDSCAPE_CSS =
  '@page Section1 { size:841.95pt 595.35pt; mso-page-orientation:landscape; margin:1.4cm; } div.Section1{ page:Section1; }';

const GRADE = { 2: '초등학교 1~2학년', 4: '초등학교 3~4학년', 6: '초등학교 5~6학년', 9: '중학교 1~3학년', 12: '고등학교 1~3학년' };

// ── 위기 관리 절차 기본 틀(저장값이 없을 때) ──────────────────────────────
const CRISIS_DEFAULT =
  '위기상황(교실 밖으로 나가려 하거나 실제 교출행동 등 안전이 위협받는 경우) 학생의 안전 확보를 위해 다음 절차를 따른다.\n' +
  '① 분리: 교사는 대상 학생의 안전을 확보하고, 보조인력(사회복무요원 등)이 다른 학생을 옆 공간으로 이동시킨다.\n' +
  '② 지원 요청: 행동중재팀·관리자에게 즉시 연락하여 현장 지원을 받는다.\n' +
  '③ 진정: 지정된 안정 공간(심리안정실)으로 안내하여 진정할 시간을 제공하고, 담임교사는 학생의 이동을 모니터링한다.\n' +
  '④ 일과 재개 판단: 학생의 정서 상태를 확인한 뒤 일과 재개 여부를 협의하여 결정한다. 추가 휴식이 필요하면 심리안정실에서 보호한다.\n' +
  '⑤ 복귀: 익숙한 쉬운 과제(예: 퍼즐·숫자 자석·패턴 맞추기)부터 일과를 재개하며 점차 학습과제로 전환한다.\n' +
  '⑥ 기록·보고: 위기상황의 경과를 행동일지에 기록하고, 행동중재팀 회의 및 보호자에게 보고한다.';

const FAMILY_DEFAULT = '가정에서도 동일한 그림카드·신호를 사용하고, 목표 행동 성공 시 가정에서 칭찬·강화(스티커 등)를 제공한다. 주 단위로 가정-학교 간 관찰 내용을 공유한다.';
const REVIEW_DEFAULT = '1개월 단위 점검 · 학기말 종합 평가 (필요 시 중간 수정)';

const MONITOR_DEFAULT = [
  { item: '문제행동 발생 빈도', method: '체크리스트·빈도 기록', owner: '특수교육 지원인력' },
  { item: '대체행동 사용률', method: '대체행동(카드·요청) 사용 횟수 기록', owner: '담임교사' },
  { item: '목표 달성도', method: '월별 평가 기준 대비 수행률', owner: '담임교사' },
  { item: '보호자 피드백', method: '가정 관찰 기록', owner: '보호자' },
];

// 연간 교육목표 + 월별 목표 (목표 1개당: 영역/목표 표 + 월별 표)
function goalBlock(g, idx) {
  const area = g.area || g.subject || '일상생활·행동지원';
  const annual = g.semester_goal || g.semesterGoal || '';
  const monthly = Array.isArray(g.monthly) ? g.monthly : [];

  const goalHead =
    `<table class="t3"><tr>` +
    `<td class="hl" style="width:120px">영역</td><td>${escML(area)}</td></tr>` +
    `<tr><td class="hl">목표</td><td>${annual ? escML(annual) : ph('연간/학기 목표를 입력하세요')}</td></tr></table>`;

  const rows = monthly.length
    ? monthly
        .map(
          (m) =>
            `<tr><td class="m">${esc(m.month)}월</td>` +
            `<td>${m.goal ? escML(m.goal) : ''}</td>` +
            `<td>${m.content ? escML(m.content) : ''}</td>` +
            `<td>${(m.methods || []).length ? (m.methods || []).map((x) => '- ' + esc(x)).join('<br/>') : ''}</td>` +
            `<td>${m.eval ? escML(m.eval) : ''}</td></tr>`
        )
        .join('')
    : `<tr><td class="m">${ph('월')}</td><td colspan="4">${ph('월별 목표를 입력하세요 (IEP 모듈에서 자동 연동됩니다)')}</td></tr>`;

  const monthTable =
    `<table class="t3"><thead><tr>` +
    `<th style="width:54px">월</th><th style="width:22%">교육 목표</th><th style="width:22%">교육 내용</th>` +
    `<th style="width:22%">교수 방법</th><th>평가</th></tr></thead><tbody>${rows}</tbody></table>`;

  return `<div class="goal">${monthly.length || idx === 0 ? '' : ''}${goalHead}${monthTable}</div>`;
}

// 행동중재계획 (항목/내용 2열)
function bipBlock({ bip = {}, problemBehavior = '', functionText = '', crisis = '', family = '', review = '' }) {
  const alt = [
    bip.alt ? '대체 행동: ' + bip.alt : '',
    bip.fct ? 'FCT(기능적 의사소통): ' + bip.fct : '',
    bip.teach ? '교수 전략: ' + bip.teach : '',
  ]
    .filter(Boolean)
    .join('\n');
  const reinf = [bip.reinf || '', bip.crit ? '성공 기준: ' + bip.crit : ''].filter(Boolean).join('\n');

  const row = (label, content, fallback) =>
    `<tr><td class="hl" style="width:130px">${esc(label)}</td><td>${
      content && String(content).trim() ? bulletML(content) || escML(content) : ph(fallback)
    }</td></tr>`;

  return (
    `<table class="t3">` +
    row('문제행동', problemBehavior, '문제행동을 관찰 가능한 사실로 기술하세요') +
    row('행동의 기능', functionText, 'QABF 기능평가 결과를 입력하세요 (예: 교사 주의 끌기 · 과제 회피)') +
    row('예방 전략', bip.prev, '선행사건 조정 전략을 입력하세요') +
    row('대체행동 교수', alt, '대체행동·FCT·교수 전략을 입력하세요') +
    row('강화 전략', reinf, '강화 전략을 입력하세요') +
    row('위기 관리 절차', crisis || CRISIS_DEFAULT) +
    row('가정 연계', family || FAMILY_DEFAULT) +
    row('검토 및 수정 일정', review || REVIEW_DEFAULT) +
    `</table>`
  );
}

// 모니터링 및 평가 계획 (평가항목/방법/담당자 3열)
function monitorBlock(rows) {
  const list = rows && rows.length ? rows : MONITOR_DEFAULT;
  const body = list
    .map(
      (r) =>
        `<tr><td>${escML(r.item)}</td><td>${escML(r.method)}</td><td class="c">${escML(r.owner)}</td></tr>`
    )
    .join('');
  return (
    `<table class="t3"><thead><tr>` +
    `<th style="width:34%">평가 항목</th><th>방법</th><th style="width:24%">담당자</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

/**
 * Tier 3 통합 개별화 문서를 Word(.doc)로 내려받는다.
 * @param {object} opts
 * @param {object} opts.student          - { code, level, disability, note }
 * @param {string} opts.teacherName
 * @param {string} opts.school
 * @param {Array}  opts.goals            - iep_goals rows ( monthly[] 포함 )
 * @param {object} opts.bip              - { alt, fct, crit, prev, teach, reinf, resp }
 * @param {string} opts.problemBehavior  - 문제행동(ABC 등에서 시드)
 * @param {string} opts.functionText     - 행동의 기능(QABF 결과 요약)
 * @param {string} opts.crisis           - 위기 관리 절차(없으면 기본 틀)
 * @param {string} opts.family           - 가정 연계(없으면 기본 틀)
 * @param {string} opts.review           - 검토 및 수정 일정(없으면 기본 틀)
 * @param {Array}  opts.monitorRows      - [{item, method, owner}]
 */
export function downloadTier3Doc({
  student = {},
  teacherName = '',
  school = '',
  goals = [],
  bip = {},
  problemBehavior = '',
  functionText = '',
  crisis = '',
  family = '',
  review = '',
  monitorRows = [],
}) {
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

  const goalsHtml = goals.length
    ? goals.map((g, i) => goalBlock(g, i)).join('')
    : goalBlock({}, 0);

  const css =
    LANDSCAPE_CSS +
    'body{font-family:"맑은 고딕",sans-serif;color:#1a1a1a}' +
    'table.t3,table.head{border-collapse:collapse;width:100%;margin:6px 0 16px}' +
    'table.t3 td,table.t3 th,table.head td{border:1px solid #000;padding:6px 8px;font-size:10.5pt;vertical-align:top;word-break:keep-all}' +
    'table.t3 th{background:#2f5496;color:#fff;text-align:center}' +
    '.hl{background:#dbe5f1;font-weight:bold;white-space:nowrap}' +
    'table.head .hl{width:78px;text-align:center}' +
    'td.m{background:#f3f6fc;font-weight:bold;text-align:center;white-space:nowrap}' +
    'td.c{text-align:center;white-space:nowrap}' +
    'h1{font-size:16pt;text-align:center;margin:0 0 4px;letter-spacing:2px}' +
    '.subt{text-align:center;font-size:9.5pt;color:#666;letter-spacing:3px;margin:0 0 14px}' +
    'h2{font-size:12.5pt;margin:20px 0 6px;color:#1f3864;border-bottom:2px solid #2f5496;padding-bottom:3px}' +
    '.goal{margin-bottom:10px}' +
    '.foot{margin-top:18px;padding-top:10px;border-top:1px dashed #bbb;font-size:8.5pt;color:#888;text-align:center}';

  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
    `<head><meta charset='utf-8'>` +
    `<meta name=ProgId content=Word.Document>` +
    `<meta name=Generator content="Microsoft Word 15">` +
    `<meta name=Originator content="Microsoft Word 15">` +
    `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->` +
    `<style>${css}</style></head><body><div class="Section1">` +
    `<h1>개별화 행동지원 계획 (Tier 3)</h1>` +
    `<div class="subt">INDIVIDUALIZED BEHAVIOR SUPPORT PLAN · TIER 3</div>` +
    header +
    `<h2>Ⅰ. 연간 교육 목표 및 월별 목표</h2>${goalsHtml}` +
    `<h2>Ⅱ. 행동중재계획</h2>${bipBlock({ bip, problemBehavior, functionText, crisis, family, review })}` +
    `<h2>Ⅲ. 모니터링 및 평가 계획</h2>${monitorBlock(monitorRows)}` +
    `<div class="foot">본 계획은 학생의 긍정적 행동 변화를 위한 개별화(Tier 3) 지원 계획입니다. 정기 검토를 거쳐 효과를 평가하고 필요 시 수정합니다. · 작성일 ${dateStr}</div>` +
    `</div></body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Tier3_통합계획_${student.code || '학생'}_${dateStr.replace(/[^0-9]/g, '')}.doc`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 3000);
}

export { GRADE };
