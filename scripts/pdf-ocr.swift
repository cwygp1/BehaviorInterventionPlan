// 스캔 PDF(신체활동·여가활동 지도서 — 글자 층 없음) → 텍스트. macOS Vision 한국어 OCR.
// 출력 형식은 scripts/pdf-text.swift와 같게(===== pN ===== 뒤에 줄들) 해서 parse-daily-life-guide.mjs가 그대로 읽는다.
// 페이지마다 본문 열(넓은 줄)을 먼저, 옆단(좁은 왼쪽/오른쪽 열)을 나중에 쓴다 — 글자 층 PDF의 추출 순서와 비슷하게.
//
//   swiftc -O -o /tmp/pdf-ocr scripts/pdf-ocr.swift
//   /tmp/pdf-ocr "…/신체활동지도서.pdf" > /tmp/motor.txt   (진행 상황은 stderr)
//   /tmp/pdf-ocr "…/여가활동지도서.pdf" 1 50 > /tmp/leisure-1-50.txt   (쪽 범위 선택)
import Foundation
import PDFKit
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("usage: pdf-ocr <pdf> [from] [to]\n".data(using: .utf8)!); exit(1)
}
let from = args.count >= 3 ? max(1, Int(args[2]) ?? 1) : 1
let to = args.count >= 4 ? min(doc.pageCount, Int(args[3]) ?? doc.pageCount) : doc.pageCount
let scale: CGFloat = 2.4 // 595pt → 약 1430px. 본문 10pt 글자가 OCR에 충분한 크기.

struct Line { let text: String; let minX: CGFloat; let maxX: CGFloat; let midY: CGFloat }

func render(_ page: PDFPage) -> CGImage? {
  let box = page.bounds(for: .mediaBox)
  let size = NSSize(width: box.width * scale, height: box.height * scale)
  let img = page.thumbnail(of: size, for: .mediaBox)
  var rect = NSRect(origin: .zero, size: img.size)
  return img.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func ocr(_ cg: CGImage) -> [Line] {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.recognitionLanguages = ["ko-KR", "en-US"]
  req.usesLanguageCorrection = true
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  do { try handler.perform([req]) } catch { return [] }
  return (req.results ?? []).compactMap { obs in
    guard let c = obs.topCandidates(1).first else { return nil }
    let b = obs.boundingBox // 좌하단 원점, 0~1
    return Line(text: c.string, minX: b.minX, maxX: b.maxX, midY: b.midY)
  }
}

var out = ""
for i in (from - 1)..<to {
  guard let page = doc.page(at: i) else { continue }
  var lines: [Line] = []
  if let cg = render(page) { lines = ocr(cg) }
  // 옆단: 왼쪽 가장자리(maxX < 0.30) 또는 오른쪽 가장자리(minX > 0.70)에 있는 짧은 줄.
  let side = lines.filter { ($0.maxX < 0.30 || $0.minX > 0.70) && ($0.maxX - $0.minX) < 0.32 }
  let main = lines.filter { l in !side.contains { $0.text == l.text && $0.midY == l.midY } }
  let order: (Line, Line) -> Bool = { a, b in abs(a.midY - b.midY) > 0.006 ? a.midY > b.midY : a.minX < b.minX }
  out += "===== p\(i + 1) =====\n"
  for l in main.sorted(by: order) { out += l.text + "\n" }
  for l in side.sorted(by: order) { out += l.text + "\n" }
  if (i + 1) % 10 == 0 || i + 1 == to {
    FileHandle.standardError.write("p\(i + 1)/\(to)\n".data(using: .utf8)!)
    FileHandle.standardOutput.write(out.data(using: .utf8)!); out = ""
  }
}
FileHandle.standardOutput.write(out.data(using: .utf8)!)
