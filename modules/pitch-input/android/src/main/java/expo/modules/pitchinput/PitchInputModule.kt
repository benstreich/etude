package expo.modules.pitchinput

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val RATE = 44100

/** Frames per analysis window. Must match WINDOW in src/lib/tuner-math.ts. */
private const val WINDOW = 4096

class MicUnavailableException(cause: String) :
  CodedException("ERR_MIC_UNAVAILABLE", "Microphone unavailable: $cause", null)

/**
 * A microphone tap and nothing else.
 *
 * Pitch detection deliberately lives in src/lib/tuner-math.ts instead of here,
 * so the algorithm is written once, in one language, and can be tested on a
 * desktop without a device. This class owns a ring buffer of the newest WINDOW
 * frames and hands them to JS whenever it asks.
 */
class PitchInputModule : Module() {
  private var recorder: AudioRecord? = null
  private var thread: HandlerThread? = null

  @Volatile
  private var running = false

  // The ring. Guarded by `lock` because the capture thread writes it while the
  // JS thread reads it.
  private val ring = ShortArray(WINDOW)
  private var writeIndex = 0
  private var filled = false
  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("PitchInput")

    Property("sampleRate") { RATE }
    Property("isRecording") { running }

    Function("start") { start() }
    Function("stop") { stop() }

    Function("read") {
      synchronized(lock) {
        if (!filled) {
          ByteArray(0)
        } else {
          // Little-endian Int16, oldest first, so JS can view it as an Int16Array.
          val out = ByteBuffer.allocate(WINDOW * 2).order(ByteOrder.LITTLE_ENDIAN)
          for (i in 0 until WINDOW) out.putShort(ring[(writeIndex + i) % WINDOW])
          out.array()
        }
      }
    }

    OnDestroy { stop() }
  }

  private fun start() {
    if (running) return

    val minBuf = AudioRecord.getMinBufferSize(
      RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    if (minBuf <= 0) throw MicUnavailableException("no buffer size")

    // VOICE_RECOGNITION, not VOICE_COMMUNICATION: the latter applies AGC and
    // noise suppression, which colour the very pitch we are trying to measure.
    val rec = try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        maxOf(minBuf, WINDOW * 4)
      )
    } catch (e: Exception) {
      throw MicUnavailableException(e.message ?: "constructor failed")
    }

    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw MicUnavailableException("not initialized")
    }

    synchronized(lock) {
      writeIndex = 0
      filled = false
    }

    recorder = rec
    running = true
    rec.startRecording()

    val t = HandlerThread("pitch-input").also { it.start() }
    thread = t
    Handler(t.looper).post {
      val chunk = ShortArray(1024)
      while (running) {
        val n = rec.read(chunk, 0, chunk.size)
        if (n <= 0) continue
        synchronized(lock) {
          for (i in 0 until n) {
            ring[writeIndex] = chunk[i]
            writeIndex = (writeIndex + 1) % WINDOW
            if (writeIndex == 0) filled = true
          }
        }
      }
    }
  }

  private fun stop() {
    if (!running) return
    running = false
    thread?.quitSafely()
    thread = null
    recorder?.let {
      runCatching { it.stop() }
      it.release()
    }
    recorder = null
  }
}
