import Foundation
import PDFKit
let args = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: args[1]))!
let mode = args[2]
if mode == "count" {
  var codes = 0, textPages = 0, total = doc.pageCount
  var hits: [String] = []
  for i in 0..<total {
    guard let s = doc.page(at: i)?.string, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
    textPages += 1
    if let r = s.range(of: #"일상\d{2}-\d{2}"#, options: .regularExpression) { codes += 1; if hits.count < 6 { hits.append("p\(i+1): " + String(s[r])) } }
  }
  print("pages=\(total) textPages=\(textPages) pagesWith일상코드=\(codes)"); print(hits.joined(separator: " | "))
} else {
  let from = Int(args[3])!, to = Int(args[4])!
  for i in (from-1)..<min(to, doc.pageCount) {
    print("===== p\(i+1) ====="); print(doc.page(at: i)?.string ?? "(no text)")
  }
}
