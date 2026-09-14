import ExpoModulesCore
import PDFKit
import UIKit

/**
 * PDF → PNG pages, so the score viewer only ever draws images.
 *
 * Mirrors the Android module exactly: same file names (`1.png`, `2.png`, …),
 * same page order, same "scale the longest edge to maxWidth" rule. Rendering
 * happens once at import; the viewer never touches a PDF.
 *
 * NOTE: written without a device to verify against — this project has no Apple
 * developer account yet. Test before trusting it.
 */
public class PdfPagesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PdfPages")

    AsyncFunction("render") { (uri: String, outDir: String, maxWidth: Double) -> [[String: Any]] in
      try self.render(uri: uri, outDir: outDir, maxWidth: maxWidth)
    }
  }

  private func toURL(_ s: String) -> URL {
    s.hasPrefix("file://") ? (URL(string: s) ?? URL(fileURLWithPath: s)) : URL(fileURLWithPath: s)
  }

  private func render(uri: String, outDir: String, maxWidth: Double) throws -> [[String: Any]] {
    let src = toURL(uri)
    guard let doc = PDFDocument(url: src) else {
      throw Exception(name: "ERR_PDF_UNREADABLE", description: "Could not read the PDF at \(uri)")
    }
    let dir = toURL(outDir)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    var pages: [[String: Any]] = []
    for i in 0..<doc.pageCount {
      guard let page = doc.page(at: i) else { continue }
      let box = page.bounds(for: .mediaBox)
      // scale the longest edge down to maxWidth; never scale a small page up
      let scale = min(1.0, maxWidth / max(box.width, box.height))
      let size = CGSize(width: max(1, box.width * scale), height: max(1, box.height * scale))

      let format = UIGraphicsImageRendererFormat()
      format.scale = 1 // size is already in pixels, not points
      format.opaque = true
      let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
        // sheet music on a transparent background disappears in dark mode
        UIColor.white.setFill()
        ctx.fill(CGRect(origin: .zero, size: size))
        // PDF space has its origin bottom-left; UIKit's is top-left
        ctx.cgContext.translateBy(x: 0, y: size.height)
        ctx.cgContext.scaleBy(x: scale, y: -scale)
        ctx.cgContext.translateBy(x: -box.origin.x, y: -box.origin.y)
        page.draw(with: .mediaBox, to: ctx.cgContext)
      }
      guard let png = image.pngData() else { continue }
      let out = dir.appendingPathComponent("\(i + 1).png")
      try png.write(to: out, options: .atomic)
      pages.append(["uri": out.absoluteString, "width": Int(size.width), "height": Int(size.height)])
    }
    return pages
  }
}
