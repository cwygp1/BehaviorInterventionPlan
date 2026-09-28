// PDF 글자 층 → 좌표 붙은 줄 목록 (scripts/pdf-ocr-xy.swift 와 같은 출력 형식).
//
// 배경(0928, mds/39): 국어 지도서는 글자 층에 제목만 있어 Vision OCR(pdf-ocr-xy.swift)을 썼지만, 수학 지도서(InDesign CS6)는
//   본문·표가 전부 글자 층에 있다. OCR은 670쪽에 7분 걸리고 따옴표(‘ ’)·띄어쓰기·아이콘·글자('장터'→'정터')를 틀리게 읽는데,
//   글자 층은 0.1초에 정확하다. 글자 층이 온전한 지도서는 이 스크립트로 xy 파일을 만들고 파서는 그대로 쓴다.
//
// 먼저 글자 층이 있는지 본다:  pdftotext -f 60 -l 62 -layout <pdf> - | head -40   (표·본문이 나오면 이 경로, 제목만 나오면 OCR)
//
// 사용법(poppler 필요: brew install poppler):
//   pdftotext -bbox-layout "…/수학 ①~② 교사용지도서.pdf" /tmp/math-bbox.html
//   node scripts/pdf-text-xy.mjs /tmp/math-bbox.html [from] [to] > /tmp/math-xy.txt
//   /tmp/pdf-rules "…/수학 ①~② 교사용지도서.pdf" > /tmp/math-rules.txt              # 괘선은 지금처럼(scripts/pdf-rules.swift, 기본 문턱)
//   node scripts/parse-math-guide.mjs /tmp/math-xy.txt /tmp/math-rules.txt
//   ※ 괘선은 기본 문턱으로 돌린다. pdf-rules.swift 머리의 '수학은 238' 안내는 옅은 선을 좌우 대비로 잡게 고치기(0928 10:03) 전 것이라,
//     238을 주면 표 칸의 옅은 바탕색이 통째로 어둡게 잡혀 40px 넘는 덩어리로 버려지고 세로선이 사라진다(평가 표 0행, 차시·소단원 칸 합침).
//
// 출력: "===== pN =====" 뒤에 "x0<TAB>x1<TAB>y<TAB>text" — x0·x1·y는 0~1, y는 줄의 세로 가운데(위에서부터). 소수 4자리.
//   · <line> 하나가 한 줄. 낱말은 띄어 잇는다.
//   · 낱말 사이가 4.8pt를 넘고 그 줄 낱말 간격 중앙값의 1.5배보다 넓으면 표 칸 경계로 보고 줄을 나눈다.
//     (수학 지도서: 본문 낱말 간격은 99%가 4.2pt 아래, 칸 경계는 5pt 이상. 큰 글자 제목은 간격이 고르게 넓어 중앙값 기준에 걸리지 않는다.
//      잘못 나눠도 파서가 같은 y의 줄을 x 순으로 다시 잇지만, 잘못 합치면 다른 열 글이 섞이므로 나누는 쪽으로 기운다.)
//     꼬리말 띠(y > 0.92)는 나누지 않는다 — 파서가 "72 | 교수·학습의 실제"처럼 한 줄로 읽어 쪽 번호 차이를 잰다.
//   · 지우는 글자: U+200C·U+001A·U+0007(InDesign 글머리표 뒤에 붙는 제어문자), HTML 엔티티(&amp; &lt; &gt; &apos; &quot;)는 되돌린다.
//   · 그림 아이콘(전자책·붙임딱지 표시)은 사용자 영역 글리프(U+E000~F8FF)로 들어오므로 지운다 — OCR에서는 ')' 'C' '☆' 잡티로 읽히던 것.
//   · 자료 칸의 "토큰판,토큰(" 같은 쉼표 붙음(26건)은 여기서 생기지 않는다 — 파서 joinItems가 칸 끝까지 찬 줄을 다음 줄과 붙여 쓸 때
//     쉼표로 끝난 줄에도 공백을 안 넣는 것(OCR 판도 28건 같음). 파서 쪽에서 쉼표·마침표로 끝난 줄은 띄어 잇게 하면 된다.
//   · 정렬은 OCR 스크립트와 같다: y가 0.004 안이면 같은 줄로 보고 x 순.
import fs from 'fs';

const [htmlPath, fromArg, toArg] = process.argv.slice(2);
if (!htmlPath) { console.error('usage: node scripts/pdf-text-xy.mjs <bbox-layout.html> [from] [to]'); process.exit(1); }

const GAP_MIN_PT = 4.8;        // 이보다 넓고
const GAP_MEDIAN_RATIO = 1.5;  // 그 줄 낱말 간격 중앙값의 이 배수보다 넓으면 표 칸 경계
const FOOTER_Y = 0.92;         // 이 아래(쪽 아랫부분)는 나누지 않는다
const SAME_LINE = 0.004;       // 정렬 때 같은 줄로 볼 y 차이

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const clean = (s) => unescape(s)
  .replace(/[\u200b\u200c\u200d\ufeff\u001a\u0007]/g, '')          // InDesign 글머리표 뒤 제어문자·폭 없는 공백
  .replace(/[\ue000-\uf8ff]/g, '')                                // 그림 아이콘(사용자 영역 글리프) — 자료 칸의 전자책·붙임딱지 표시
  .replace(/\s+/g, ' ').trim();

const html = fs.readFileSync(htmlPath, 'utf8');
const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
const lineRe = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g;
const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;

const from = Math.max(1, parseInt(fromArg || '1', 10) || 1);
const to = parseInt(toArg || '0', 10) || Infinity;
let n = 0;
const out = [];
for (const pm of html.matchAll(pageRe)) {
  n += 1;
  if (n < from) continue;
  if (n > to) break;
  const W = +pm[1] || 1, H = +pm[2] || 1;
  const rows = [];
  for (const lm of pm[3].matchAll(lineRe)) {
    const words = [];
    for (const wm of lm[5].matchAll(wordRe)) {
      const t = clean(wm[5]);
      if (t) words.push({ x0: +wm[1], y0: +wm[2], x1: +wm[3], y1: +wm[4], t });
    }
    if (!words.length) continue;
    words.sort((a, b) => a.x0 - b.x0);
    const yMid = ((+lm[2] + +lm[4]) / 2) / H;
    const gaps = words.slice(1).map((w, i) => w.x0 - words[i].x1).sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const gapMax = yMid > FOOTER_Y ? Infinity : Math.max(GAP_MIN_PT, median * GAP_MEDIAN_RATIO);
    let seg = [words[0]];
    const flush = () => {
      const x0 = Math.min(...seg.map((w) => w.x0)) / W, x1 = Math.max(...seg.map((w) => w.x1)) / W;
      const y = ((Math.min(...seg.map((w) => w.y0)) + Math.max(...seg.map((w) => w.y1))) / 2) / H;
      rows.push({ x0, x1, y, t: seg.map((w) => w.t).join(' ') });
    };
    for (let i = 1; i < words.length; i++) {
      if (words[i].x0 - words[i - 1].x1 > gapMax) { flush(); seg = [words[i]]; } else seg.push(words[i]);
    }
    flush();
  }
  rows.sort((a, b) => (Math.abs(a.y - b.y) > SAME_LINE ? a.y - b.y : a.x0 - b.x0));
  out.push(`===== p${n} =====`);
  for (const r of rows) out.push(`${r.x0.toFixed(4)}\t${r.x1.toFixed(4)}\t${r.y.toFixed(4)}\t${r.t}`);
}
process.stdout.write(out.join('\n') + '\n');
console.error(`${Math.min(n, to === Infinity ? n : to) - from + 1}쪽, 줄 ${out.length - (Math.min(n, to === Infinity ? n : to) - from + 1)}개`);
