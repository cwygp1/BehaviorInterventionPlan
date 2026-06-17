// 전년도 IEP 파일에서 AI 분석용 입력을 만든다.
//   - .txt/.docx/텍스트형 .pdf  → 텍스트로 추출({ text })
//   - 이미지 / 스캔형 .pdf       → 이미지(data:URL)로 변환({ images })  → AI 비전(OCR+분석)에 전달
// 추출 라이브러리는 npm 설치 없이 CDN으로 동적 로드(인터넷 필요).

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('스크립트 로드 실패: ' + src));
    document.head.appendChild(el);
  });
}

const CDN = {
  mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};

const MAX_PAGES = 6; // 비전 전송 페이지 상한(payload 보호)

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result || ''));
    rd.onerror = () => reject(new Error('파일 읽기 실패'));
    rd.readAsDataURL(file);
  });
}

async function pdfToImages(pdf, onProgress) {
  const images = [];
  const n = Math.min(pdf.numPages, MAX_PAGES);
  for (let p = 1; p <= n; p += 1) {
    onProgress && onProgress(`스캔 페이지 이미지화 ${p}/${n}…`);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.82));
  }
  return images;
}

/**
 * @returns {Promise<{text?:string, images?:string[]}>}
 */
export async function extractFromFile(file, onProgress) {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';

  if (name.endsWith('.txt') || type === 'text/plain') {
    return { text: await file.text() };
  }

  if (name.endsWith('.docx') || type.includes('officedocument') || type.includes('msword')) {
    onProgress && onProgress('Word 문서 읽는 중…');
    await loadScript(CDN.mammoth);
    const buf = await file.arrayBuffer();
    const r = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return { text: r?.value || '' };
  }

  if (name.endsWith('.pdf') || type === 'application/pdf') {
    onProgress && onProgress('PDF 여는 중…');
    await loadScript(CDN.pdf);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p += 1) {
      onProgress && onProgress(`PDF 텍스트 확인 ${p}/${pdf.numPages}…`);
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
    }
    if (text.replace(/\s/g, '').length > 40) return { text };
    // 텍스트가 거의 없음 → 스캔 PDF로 보고 이미지화하여 AI 비전에 전달
    onProgress && onProgress('스캔 PDF로 판단 → 이미지로 변환');
    return { images: await pdfToImages(pdf, onProgress) };
  }

  if (/\.(png|jpe?g|webp|bmp|gif)$/i.test(name) || type.startsWith('image/')) {
    onProgress && onProgress('이미지 준비 중…');
    return { images: [await readAsDataURL(file)] };
  }

  throw new Error('지원하지 않는 형식입니다. (.txt, .pdf, .docx, 이미지)');
}
