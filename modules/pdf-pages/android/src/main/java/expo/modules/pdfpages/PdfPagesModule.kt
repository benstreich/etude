package expo.modules.pdfpages

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class PdfUnreadableException(cause: String) :
  CodedException("ERR_PDF_UNREADABLE", "Could not read the PDF: $cause", null)

/**
 * PDF → PNG pages, so the score viewer only ever draws images.
 *
 * Mirrors the iOS module: same file names (`1.png`, `2.png`, …), same page
 * order, same "scale the longest edge to maxWidth" rule. Rendering happens
 * once at import; the viewer never touches a PDF.
 */
class PdfPagesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfPages")

    AsyncFunction("render") { uri: String, outDir: String, maxWidth: Double ->
      render(uri, outDir, maxWidth)
    }
  }

  private fun toFile(s: String): File =
    if (s.startsWith("file://")) File(Uri.parse(s).path ?: s.removePrefix("file://")) else File(s)

  private fun render(uri: String, outDir: String, maxWidth: Double): List<Map<String, Any>> {
    val src = toFile(uri)
    if (!src.exists()) throw PdfUnreadableException("no file at $uri")
    val dir = toFile(outDir).also { it.mkdirs() }

    val fd = try {
      ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY)
    } catch (e: Exception) {
      throw PdfUnreadableException(e.message ?: "open failed")
    }
    // A PdfRenderer holds the descriptor, so both close together or the fd leaks.
    fd.use { descriptor ->
      val renderer = try {
        PdfRenderer(descriptor)
      } catch (e: Exception) {
        throw PdfUnreadableException(e.message ?: "not a PDF, or password protected")
      }
      renderer.use { pdf ->
        return (0 until pdf.pageCount).map { i ->
          pdf.openPage(i).use { page ->
            // scale the longest edge down to maxWidth; never scale a small page up
            val scale = minOf(1.0, maxWidth / maxOf(page.width, page.height).toDouble())
            val w = maxOf(1, (page.width * scale).toInt())
            val h = maxOf(1, (page.height * scale).toInt())
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            // PdfRenderer draws onto transparency; sheet music on a transparent
            // background disappears in dark mode, so paint the paper first.
            bmp.eraseColor(Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val out = File(dir, "${i + 1}.png")
            FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bmp.recycle()
            mapOf("uri" to Uri.fromFile(out).toString(), "width" to w, "height" to h)
          }
        }
      }
    }
  }
}
