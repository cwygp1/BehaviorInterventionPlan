// 좌표 붙은 OCR: 페이지마다 "x0<TAB>x1<TAB>y<TAB>text" (x·y는 0~1, y는 위에서부터). 표 열·행을 좌표로 가르기 위한 것.
import Foundation
import PDFKit
import Vision
import AppKit
let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { exit(1) }
let from = args.count >= 3 ? max(1, Int(args[2]) ?? 1) : 1
let to = args.count >= 4 ? min(doc.pageCount, Int(args[3]) ?? doc.pageCount) : doc.pageCount
let scale: CGFloat = 2.4
func render(_ page: PDFPage) -> CGImage? {
  let box = page.bounds(for: .mediaBox)
  let img = page.thumbnail(of: NSSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
  var rect = NSRect(origin: .zero, size: img.size)
  return img.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}
var out = ""
for i in (from - 1)..<to {
  guard let page = doc.page(at: i), let cg = render(page) else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate; req.recognitionLanguages = ["ko-KR", "en-US"]; req.usesLanguageCorrection = true
  let h = VNImageRequestHandler(cgImage: cg, options: [:])
  try? h.perform([req])
  out += "===== p\(i + 1) =====\n"
  let rows = (req.results ?? []).compactMap { obs -> (CGFloat, CGFloat, CGFloat, String)? in
    guard let c = obs.topCandidates(1).first else { return nil }
    let b = obs.boundingBox
    return (b.minX, b.maxX, 1 - b.midY, c.string)
  }.sorted { a, b in abs(a.2 - b.2) > 0.004 ? a.2 < b.2 : a.0 < b.0 }
  for r in rows { out += String(format: "%.4f\t%.4f\t%.4f\t", r.0, r.1, r.2) + r.3 + "\n" }
  if (i + 1) % 10 == 0 || i + 1 == to {
    FileHandle.standardError.write("p\(i + 1)/\(to)\n".data(using: .utf8)!)
    FileHandle.standardOutput.write(out.data(using: .utf8)!); out = ""
  }
}
FileHandle.standardOutput.write(out.data(using: .utf8)!)
