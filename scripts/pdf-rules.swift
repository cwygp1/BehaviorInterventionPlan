// 표의 가로 괘선 찾기: 페이지를 그려 어두운 픽셀이 가로로 길게 이어진 줄을 찾는다.
// 출력: "===== pN =====" 뒤에 "x0<TAB>x1<TAB>y<TAB>thick" (x·y 0~1, y는 위에서부터, thick는 px). 두꺼운(≥6px) 것은 채워진 띠(표 머리).
import Foundation
import PDFKit
import AppKit
let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { exit(1) }
let from = args.count >= 3 ? max(1, Int(args[2]) ?? 1) : 1
let to = args.count >= 4 ? min(doc.pageCount, Int(args[3]) ?? doc.pageCount) : doc.pageCount
let scale: CGFloat = 2.0
var out = ""
for i in (from - 1)..<to {
  guard let page = doc.page(at: i) else { continue }
  let box = page.bounds(for: .mediaBox)
  let img = page.thumbnail(of: NSSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
  var rect = NSRect(origin: .zero, size: img.size)
  guard let cg = img.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { continue }
  let w = cg.width, h = cg.height
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
  guard let data = ctx.data else { continue }
  let px = data.bindMemory(to: UInt8.self, capacity: w * h * 4)
  let minLen = Int(Double(w) * 0.10)
  struct Run { var x0: Int; var x1: Int; var y0: Int; var y1: Int }
  var open: [Run] = []; var done: [Run] = []
  for row in 0..<h {
    let yy = row // 비트맵 메모리 첫 줄이 위
    var runs: [(Int, Int)] = []; var start = -1; var gap = 0
    for x in 0..<w {
      let o = (yy * w + x) * 4
      let lum = (Int(px[o]) * 299 + Int(px[o+1]) * 587 + Int(px[o+2]) * 114) / 1000
      let dark = lum < 225
      if dark { if start < 0 { start = x }; gap = 0 }
      else if start >= 0 { gap += 1; if gap > 2 { if x - gap - start >= minLen { runs.append((start, x - gap - 1)) }; start = -1; gap = 0 } }
    }
    if start >= 0 && w - start >= minLen { runs.append((start, w - 1)) }
    var next: [Run] = []
    for r in runs {
      if let k = open.firstIndex(where: { min($0.x1, r.1) - max($0.x0, r.0) > minLen / 2 }) {
        var o = open.remove(at: k); o.x0 = min(o.x0, r.0); o.x1 = max(o.x1, r.1); o.y1 = row; next.append(o)
      } else { next.append(Run(x0: r.0, x1: r.1, y0: row, y1: row)) }
    }
    done.append(contentsOf: open); open = next
  }
  done.append(contentsOf: open)
  // 세로 괘선: 열 방향으로 같은 검사(길이 ≥ 높이의 4%).
  let minLenV = Int(Double(h) * 0.04)
  var openV: [Run] = []; var doneV: [Run] = []
  for x in 0..<w {
    var runs: [(Int, Int)] = []; var start = -1; var gap = 0
    for y in 0..<h {
      let o = (y * w + x) * 4
      let lum = (Int(px[o]) * 299 + Int(px[o+1]) * 587 + Int(px[o+2]) * 114) / 1000
      let dark = lum < 225
      if dark { if start < 0 { start = y }; gap = 0 }
      else if start >= 0 { gap += 1; if gap > 2 { if y - gap - start >= minLenV { runs.append((start, y - gap - 1)) }; start = -1; gap = 0 } }
    }
    if start >= 0 && h - start >= minLenV { runs.append((start, h - 1)) }
    var next: [Run] = []
    for r in runs {
      if let k = openV.firstIndex(where: { min($0.y1, r.1) - max($0.y0, r.0) > minLenV / 2 }) {
        var o = openV.remove(at: k); o.y0 = min(o.y0, r.0); o.y1 = max(o.y1, r.1); o.x1 = x; next.append(o)
      } else { next.append(Run(x0: x, x1: x, y0: r.0, y1: r.1)) }
    }
    doneV.append(contentsOf: openV); openV = next
  }
  doneV.append(contentsOf: openV)
  out += "===== p\(i + 1) =====\n"
  for r in doneV.sorted(by: { $0.x0 < $1.x0 }) {
    let thick = r.x1 - r.x0 + 1
    if thick > 40 { continue }
    out += String(format: "V\t%.4f\t%.4f\t%.4f\t%d\n", (Double(r.x0 + r.x1) / 2) / Double(w), Double(r.y0) / Double(h), Double(r.y1) / Double(h), thick)
  }
  for r in done.sorted(by: { $0.y0 < $1.y0 }) {
    let thick = r.y1 - r.y0 + 1
    if thick > 40 { continue } // 그림·큰 색 면은 뺀다
    out += String(format: "%.4f\t%.4f\t%.4f\t%d\n", Double(r.x0) / Double(w), Double(r.x1) / Double(w), (Double(r.y0 + r.y1) / 2) / Double(h), thick)
  }
  if (i + 1) % 20 == 0 || i + 1 == to { FileHandle.standardError.write("p\(i + 1)/\(to)\n".data(using: .utf8)!); FileHandle.standardOutput.write(out.data(using: .utf8)!); out = "" }
}
FileHandle.standardOutput.write(out.data(using: .utf8)!)
