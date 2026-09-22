package expo.modules.metronomecontrols

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max

private const val CHANNEL_ID = "metronome-controls"
private const val NOTIFICATION_ID = 7317
private const val PKG = "expo.modules.metronomecontrols"
const val ACTION_INC = "$PKG.INC"
const val ACTION_DEC = "$PKG.DEC"
const val ACTION_TOGGLE = "$PKG.TOGGLE"

class ControlsState(
  @Field val bpm: Int = 120,
  @Field val running: Boolean = false,
  @Field val subtitle: String? = null
) : Record

class Click(
  @Field val sound: String = "wood",
  // 0 plain, 1 group start, 2 downbeat, 3 subdivision — the JS bank index
  @Field val bank: Int = 0,
  @Field val volume: Int = 100
) : Record

class TickState(
  @Field val bpm: Int = 120,
  // level per beat of one bar: 0 muted, 1 plain, 2 group start, 3 downbeat
  @Field val pattern: List<Int> = listOf(3, 1, 1, 1),
  // clicks per beat: 1 none, 2 eighths, 3 triplets, 4 sixteenths
  @Field val subdiv: Int = 1,
  @Field val sound: String = "wood",
  @Field val volume: Int = 100,
  // Where to pick the bar up: the beat the first tick belongs to, how far into
  // it, and how long that tick still has to wait. A fresh start passes zeros.
  @Field val beat: Int = 0,
  @Field val sub: Int = 0,
  @Field val startIn: Double = 0.0
) : Record

// Sample sets, mirroring SOUND_SETS in src/lib/metronome-math.ts. The four ids
// are in the order the levels index them: plain, group start, downbeat,
// subdivision — the same order as the JS click pool, and the reason a set can
// be swapped on either side without the other noticing.
private val SOUND_SETS: Map<String, IntArray> = mapOf(
  "wood" to intArrayOf(R.raw.wood_beat, R.raw.wood_mid, R.raw.wood_accent, R.raw.wood_sub),
  "click" to intArrayOf(R.raw.click_beat, R.raw.click_mid, R.raw.click_accent, R.raw.click_sub),
  "beep" to intArrayOf(R.raw.beep_beat, R.raw.beep_mid, R.raw.beep_accent, R.raw.beep_sub),
  "soft" to intArrayOf(R.raw.soft_beat, R.raw.soft_mid, R.raw.soft_accent, R.raw.soft_sub),
  "rim" to intArrayOf(R.raw.rim_beat, R.raw.rim_mid, R.raw.rim_accent, R.raw.rim_sub)
)

/** The rate scripts/make-click.py writes every sample at; the engine streams at the same one. */
private const val RATE = 44100

/**
 * The click samples as raw PCM, decoded once per process. The beat engine mixes
 * them into its own stream, so a click is never a separate playback that has to
 * spin up — which is where SoundPool lost the first milliseconds of the 22 ms
 * rim sample, and with them the click.
 */
object Samples {
  const val SUB_BANK = 3 // the subdivision sample sits after the three beat levels
  private val cache = ConcurrentHashMap<String, Array<ShortArray>>()

  /** Unknown set ids fall back to wood. */
  fun get(context: Context, sound: String): Array<ShortArray> {
    val id = if (SOUND_SETS.containsKey(sound)) sound else "wood"
    return cache.getOrPut(id) {
      val res = context.applicationContext.resources
      Array(SOUND_SETS[id]!!.size) { i -> res.openRawResource(SOUND_SETS[id]!![i]).use(::decodeWav) }
    }
  }

  fun preload(context: Context) {
    for (id in SOUND_SETS.keys) get(context, id)
  }

  /** 16-bit PCM WAV to mono samples. Multichannel files keep their first channel. */
  private fun decodeWav(input: InputStream): ShortArray {
    val bytes = input.readBytes()
    val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    var channels = 1
    var bits = 16
    var pos = 12 // past "RIFF" size "WAVE"
    while (pos + 8 <= bytes.size) {
      val id = String(bytes, pos, 4, Charsets.US_ASCII)
      val size = buf.getInt(pos + 4)
      val body = pos + 8
      if (id == "fmt ") {
        channels = buf.getShort(body + 2).toInt()
        bits = buf.getShort(body + 14).toInt()
      } else if (id == "data") {
        if (bits != 16) return ShortArray(0)
        val frames = size / 2 / max(1, channels)
        val out = ShortArray(frames)
        for (f in 0 until frames) out[f] = buf.getShort(body + f * channels * 2)
        return out
      }
      pos = body + size + (size and 1)
    }
    return ShortArray(0)
  }
}

/**
 * One-shot clicks for the sound picker's preview (#78). Timing does not matter
 * for a preview, so SoundPool is fine here; the beat itself goes through Ticker.
 */
object Clicks {
  @Volatile private var pool: SoundPool? = null
  private val loaded = ConcurrentHashMap<String, IntArray>() // set id -> SoundPool ids, by bank

  @Synchronized fun preload(context: Context): SoundPool {
    pool?.let { return it }
    val p = SoundPool.Builder()
      .setMaxStreams(4)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      .build()
    val app = context.applicationContext
    for ((id, set) in SOUND_SETS) loaded[id] = IntArray(set.size) { i -> p.load(app, set[i], 1) }
    pool = p
    return p
  }

  fun play(context: Context, sound: String, bank: Int, gain: Float) {
    if (gain <= 0f) return
    val p = pool ?: preload(context)
    val ids = loaded[sound] ?: loaded["wood"] ?: return
    p.play(ids[bank.coerceIn(0, Samples.SUB_BANK)], gain, gain, 1, 0, 1f)
  }
}

/**
 * The beat engine: one AudioTrack fed a continuous mono stream in which every
 * click is mixed at an exact sample offset. Whenever the metronome runs, in the
 * app or with the screen off, this is what clicks — JS only mirrors the beat for
 * the dots and pushes tempo edits down.
 *
 * Why not a timer firing SoundPool: a timer is only as punctual as the thread it
 * runs on, and each play() is a fresh stream that takes a variable few ms to
 * start. Frames in a stream cannot be late or early — the position of a click
 * is arithmetic on the sample count — so the grid holds to the sample whatever
 * the CPU is doing, and a tempo change just moves where the next click lands.
 *
 * The bar is kept as `beatFrame`, the frame of the current beat's downbeat, and
 * `beat`/`sub`, the next tick to play. Subdivision ticks are placed on the beat's
 * own grid (`beatFrame + sub * beatLen / n`), so changing the subdivision mid-beat
 * re-slices the current beat instead of limping, and a tempo change moves the
 * pending tick at once rather than after it.
 */
object Ticker {
  @Volatile var bpm = 120
    set(value) { field = value.coerceIn(20, 300) }
  @Volatile var pattern = intArrayOf(3, 1, 1, 1)
  @Volatile var subdiv = 1
    set(value) { field = value.coerceIn(1, 4) }
  @Volatile var sound = "wood"
  @Volatile var gain = 1f
  /** Called (on the main thread, about when the click is heard) with the tick just played and the one after it. */
  var onTick: ((beat: Int, sub: Int, nextBeat: Int, nextSub: Int) -> Unit)? = null

  @Volatile private var running = false
  private var thread: Thread? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var beat = 0
  private var sub = 0

  val isRunning: Boolean get() = running

  fun tune(bpm: Int, pattern: IntArray, subdiv: Int, sound: String, volume: Int) {
    this.bpm = bpm
    if (pattern.isNotEmpty()) this.pattern = pattern
    this.subdiv = subdiv
    this.gain = volume.coerceIn(0, 100) / 100f
    if (SOUND_SETS.containsKey(sound)) this.sound = sound
  }

  @Synchronized fun start(context: Context, beat: Int, sub: Int, startInMs: Double) {
    if (running) return
    val app = context.applicationContext
    this.beat = max(0, beat)
    this.sub = sub.coerceIn(0, 3)
    // the audio HAL keeps the CPU up while the stream plays, but a partial wake
    // lock is what guarantees it between chunks with the screen off
    wakeLock = (app.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "etude:metronome")
      .also { it.acquire(4 * 60 * 60 * 1000L) } // 4h safety cap
    running = true
    thread = Thread({ loop(app, startInMs.coerceAtLeast(0.0)) }, "metronome-audio").also { it.start() }
  }

  @Synchronized fun stop() {
    if (!running) return
    running = false
    thread?.join(500) // the loop is never blocked longer than one 10 ms chunk write
    thread = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
  }

  private class Voice(val sample: ShortArray, var pos: Int, val gain: Float)

  private fun loop(app: Context, startInMs: Double) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
    val chunk = RATE / 100 // 10 ms of frames per write: how quickly an edit reaches the stream
    val minBuf = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val bufBytes = max(minBuf, chunk * 2 * 4)
    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(RATE)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build()
      )
      .setBufferSizeInBytes(bufBytes)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .apply { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY) }
      .build()
    // what sits queued between a write and the speaker — the dots are told to wait this long
    val queuedMs = (bufBytes / 2) * 1000L / RATE
    val main = Handler(Looper.getMainLooper())
    val mix = FloatArray(chunk)
    val out = ShortArray(chunk)
    val voices = ArrayList<Voice>()
    var written = 0L // frames handed to the track so far
    var beatLen = RATE * 60.0 / bpm
    // the first tick lands `startIn` from now; a mid-beat pickup puts its downbeat before that
    var beatFrame = startInMs * RATE / 1000.0 - sub * beatLen / subdiv

    track.play()
    try {
      while (running) {
        java.util.Arrays.fill(mix, 0f)
        val end = written + chunk

        // place every tick that falls inside this chunk
        while (true) {
          val n = subdiv
          beatLen = RATE * 60.0 / bpm
          if (sub >= n) { // the subdivision shrank under a running beat: on to the next downbeat
            sub = 0
            beat++
            beatFrame += beatLen
          }
          var tickFrame = beatFrame + sub * beatLen / n
          if (tickFrame < written) {
            // its moment passed while the tempo or slicing changed — play it now, and
            // re-anchor the bar on a downbeat so the grid runs on from here
            tickFrame = written.toDouble()
            if (sub == 0) beatFrame = tickFrame
          }
          if (tickFrame >= end) break
          val offset = (tickFrame - written).toInt()
          val set = Samples.get(app, sound)
          val g = gain
          val sample = if (sub == 0) {
            val pat = pattern
            val level = pat[beat % pat.size].coerceIn(0, 3)
            if (level > 0) set[level - 1] else null // 0 = the user muted this beat: count it, don't play it
          } else set[Samples.SUB_BANK]
          if (sample != null && sample.isNotEmpty() && g > 0f) voices.add(Voice(sample, -offset, g))

          val playedBeat = beat
          val playedSub = sub
          val nextSub = if (sub + 1 >= n) 0 else sub + 1
          val nextBeat = if (sub + 1 >= n) beat + 1 else beat
          onTick?.let { cb -> main.postDelayed({ cb(playedBeat, playedSub, nextBeat, nextSub) }, queuedMs + offset * 1000L / RATE) }
          sub++ // the roll into the next beat happens at the top of the loop, against the subdivision then in force
        }

        // mix the voices in flight; `pos` is the sample index at the chunk's first frame
        val it = voices.iterator()
        while (it.hasNext()) {
          val v = it.next()
          var i = max(0, -v.pos)
          while (i < chunk) {
            val si = v.pos + i
            if (si >= v.sample.size) break
            mix[i] += v.sample[si] * v.gain
            i++
          }
          v.pos += chunk
          if (v.pos >= v.sample.size) it.remove()
        }
        for (i in 0 until chunk) out[i] = mix[i].coerceIn(-32768f, 32767f).toInt().toShort()
        if (track.write(out, 0, chunk, AudioTrack.WRITE_BLOCKING) < 0) break
        written += chunk
      }
    } finally {
      try {
        track.pause()
        track.flush()
      } catch (_: Exception) {}
      track.release()
    }
  }
}

/**
 * Foreground service whose job is the ongoing notification carrying the
 * − / play-pause / + buttons. It also keeps the process alive while the screen
 * is off, so the Ticker above keeps streaming.
 */
class MetronomeControlsService : Service() {
  private var bpm = 120
  private var running = false
  private var subtitle: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    Samples.preload(this) // decoded before the first beat asks for them
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (val action = intent?.action) {
      ACTION_INC, ACTION_DEC, ACTION_TOGGLE -> onCommand?.invoke(action.substringAfterLast('.').lowercase())
      else -> {
        bpm = intent?.getIntExtra(EXTRA_BPM, bpm) ?: bpm
        running = intent?.getBooleanExtra(EXTRA_RUNNING, running) ?: running
        subtitle = intent?.getStringExtra(EXTRA_SUBTITLE) ?: subtitle
      }
    }
    // always re-post: a button intent must not leave a startForegroundService() call unanswered
    goForeground()
    // NOT_STICKY: without the JS runtime this service is useless — a sticky restart
    // after process death would only resurrect a zombie notification with dead buttons
    return START_NOT_STICKY
  }

  fun update(bpm: Int, running: Boolean, subtitle: String?) {
    this.bpm = bpm
    this.running = running
    this.subtitle = subtitle
    goForeground()
  }

  private fun goForeground() {
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
    )
  }

  private fun button(action: String) = PendingIntent.getService(
    this,
    action.hashCode(),
    Intent(this, MetronomeControlsService::class.java).setAction(action),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun buildNotification(): android.app.Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Metronome", NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
          setSound(null, null)
        }
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle("$bpm BPM")
      .setContentText(subtitle ?: "Metronome")
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(open)
      .addAction(android.R.drawable.ic_media_previous, "Slower", button(ACTION_DEC))
      .addAction(
        if (running) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (running) "Pause" else "Play",
        button(ACTION_TOGGLE)
      )
      .addAction(android.R.drawable.ic_media_next, "Faster", button(ACTION_INC))
      .build()
  }

  companion object {
    const val EXTRA_BPM = "bpm"
    const val EXTRA_RUNNING = "running"
    const val EXTRA_SUBTITLE = "subtitle"

    // ponytail: a static instance beats binding — update() from a backgrounded app
    // can't legally go through startService() on API 26+, but a direct call can.
    var instance: MetronomeControlsService? = null
    var onCommand: ((String) -> Unit)? = null
  }
}

class MetronomeControlsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is gone" }

  override fun definition() = ModuleDefinition {
    Name("MetronomeControls")
    Events("onCommand", "onTick")

    OnCreate {
      MetronomeControlsService.onCommand = { command -> sendEvent("onCommand", mapOf("command" to command)) }
      Ticker.onTick = { beat, sub, nextBeat, nextSub ->
        sendEvent("onTick", mapOf("beat" to beat, "sub" to sub, "nextBeat" to nextBeat, "nextSub" to nextSub))
      }
    }

    OnDestroy {
      MetronomeControlsService.onCommand = null
      Ticker.onTick = null
      Ticker.stop()
      hide()
    }

    Function("show") { state: ControlsState ->
      val running = MetronomeControlsService.instance
      if (running != null) {
        running.update(state.bpm, state.running, state.subtitle)
      } else {
        ContextCompat.startForegroundService(
          context,
          Intent(context, MetronomeControlsService::class.java)
            .putExtra(MetronomeControlsService.EXTRA_BPM, state.bpm)
            .putExtra(MetronomeControlsService.EXTRA_RUNNING, state.running)
            .putExtra(MetronomeControlsService.EXTRA_SUBTITLE, state.subtitle)
        )
      }
      // the notification's tempo and the stream's are one number
      Ticker.bpm = state.bpm
    }

    Function("update") { state: ControlsState ->
      MetronomeControlsService.instance?.update(state.bpm, state.running, state.subtitle)
      Ticker.bpm = state.bpm
    }

    Function("hide") { hide() }

    // The engine does not depend on the service: it starts at once, on the JS
    // thread's call, while startForegroundService() is still creating the service.
    Function("startTicking") { state: TickState ->
      Ticker.tune(state.bpm, state.pattern.toIntArray(), state.subdiv, state.sound, state.volume)
      Ticker.start(context, state.beat, state.sub, state.startIn)
    }

    Function("updateTicking") { state: TickState ->
      Ticker.tune(state.bpm, state.pattern.toIntArray(), state.subdiv, state.sound, state.volume)
    }

    Function("stopTicking") { Ticker.stop() }

    Function("preloadClicks") {
      Samples.preload(context)
      Clicks.preload(context)
    }

    Function("click") { c: Click ->
      Clicks.play(context, c.sound, c.bank, c.volume.coerceIn(0, 100) / 100f)
    }
  }

  private fun hide() {
    context.stopService(Intent(context, MetronomeControlsService::class.java))
  }
}
