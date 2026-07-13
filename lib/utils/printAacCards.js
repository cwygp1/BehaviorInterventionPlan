// AAC 의사소통 카드(그림카드) 인쇄 — A4에 정사각 카드를 바둑판 배열.
// 브라우저 인쇄 대화상자에서 'PDF로 저장'을 선택하면 PDF 파일로 저장된다.
// (외부 라이브러리 없이 mm 단위 CSS로 실제 크기를 보장 — 한글 폰트도 그대로 인쇄)

const BORDER_COLORS = {
  black: '#000000',
  red: '#e63946',
  orange: '#f77f00',
  brown: '#774936',
  green: '#2a9d8f',
  purple: '#7209b7',
};

const BORDER_WIDTHS = { thin: 0.2, normal: 0.6, thick: 1.2 }; // mm

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {Object} opts
 * @param {Array<{src:string,label:string}>} opts.items - dataURL 이미지 + 단어
 * @param {number} opts.boxSize - 카드 한 변(mm)
 * @param {'img'|'outer'|'none'} opts.borderMode
 * @param {string} opts.borderColor - black|red|orange|brown|green|purple
 * @param {'thin'|'normal'|'thick'} opts.borderWidth
 * @param {'margin-bottom'|'margin-top'|'overlay-bottom'|'overlay-top'} opts.textPos
 * @param {number} opts.fontSize - pt
 */
export function printAacCards({ items, boxSize, borderMode, borderColor, borderWidth, textPos, fontSize }) {
  const color = BORDER_COLORS[borderColor] || '#000';
  const bw = BORDER_WIDTHS[borderWidth] ?? 0.6;
  const isMargin = textPos.startsWith('margin');
  const textMm = isMargin ? Math.max(6, fontSize * 0.75) : 0; // 글자 전용 띠 높이(mm)
  const outerBorder = borderMode === 'outer' ? `border:${bw}mm solid ${color};` : '';
  const imgBorder = borderMode === 'img' ? `border:${bw}mm solid ${color};` : '';

  const cards = items.map(({ src, label }) => {
    const text = label
      ? `<div class="lbl ${textPos}">${esc(label)}</div>`
      : '';
    const img = `<div class="imgwrap"><img src="${src}" alt=""></div>`;
    const inner = textPos === 'margin-top' ? text + img : img + text;
    return `<div class="cardbox">${inner}</div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>AAC 카드</title>
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Pretendard','맑은 고딕','Apple SD Gothic Neo',sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{display:flex;flex-wrap:wrap;gap:6mm;align-content:flex-start}
.cardbox{
  width:${boxSize}mm;height:${boxSize}mm;flex:0 0 ${boxSize}mm;
  ${outerBorder}
  position:relative;display:flex;flex-direction:column;overflow:hidden;
  page-break-inside:avoid;break-inside:avoid;background:#fff;
}
.imgwrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;${imgBorder}}
.imgwrap img{width:100%;height:100%;object-fit:contain;display:block}
.lbl{
  font-weight:700;font-size:${fontSize}pt;line-height:1.15;text-align:center;color:#000;
  white-space:nowrap;overflow:hidden;
}
.lbl.margin-bottom,.lbl.margin-top{flex:0 0 ${textMm}mm;display:flex;align-items:center;justify-content:center}
.lbl.overlay-top,.lbl.overlay-bottom{
  position:absolute;left:0;right:0;padding:1mm 2mm;
  background:rgba(255,255,255,.78);
}
.lbl.overlay-top{top:1.5mm}
.lbl.overlay-bottom{bottom:1.5mm}
@media print{body{margin:0}}
</style></head><body>
<div class="sheet">${cards}</div>
</body></html>`;

  const w = window.open('', '', 'width=860,height=1000');
  if (!w) throw new Error('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  w.document.write(html);
  w.document.close();
  w.focus();
  // 이미지 로딩 완료 후 인쇄 (dataURL이라 빠르지만 안전하게 지연)
  setTimeout(() => w.print(), 400);
}
