package expo.modules.metronomecontrols

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.ConcurrentHashMap

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
  // Where the JS loop had got to when it handed over: the beat the next tick
  // belongs to, how far into it, and how long that tick is still due to wait.
  // Without these the service restarted the bar on its own downbeat, on top of
  // the click JS had just played.
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

/**
 * The one click engine, shared by the in-app beat and the background loop (#78).
 * Two engines at the same nominal gain sounded nothing alike: ExoPlayer streams,
 * and spinning a pipeline up per play smears the first milliseconds of a 30 ms
 * sample — where all of a click's loudness lives. SoundPool holds decoded PCM and
 * fires it whole. ponytail: lives for the process; twenty 4 KB samples.
 */
object Clicks {
  const val SUB_BANK = 3 // the subdivision sample sits after the three beat levels
  @Volatile private var pool: SoundPool? = null
  // written once by preload, read from the JS thread and the tick thread — both
  // can ask for the first click of a run at the same moment
  private val loaded = ConcurrentHashMap<String, IntArray>() // set id -> SoundPool ids, by bank

  @Synchronized fun preload(context: Context): SoundPool {
    pool?.let { return it }
    val p = SoundPool.Builder()
      .setMaxStreams(4) // four, so a subdivision click can overlap the beat's tail
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

  /** Unknown set ids fall back to wood; a gain of 0 is a muted beat, not a play. */
  fun play(context: Context, sound: String, bank: Int, gain: Float) {
    if (gain <= 0f) return
    val p = pool ?: preload(context)
    val ids = loaded[sound] ?: loaded["wood"] ?: return
    p.play(ids[bank.coerceIn(0, SUB_BANK)], gain, gain, 1, 0, 1f)
  }
}

/**
 * Foreground service whose job is the ongoing notification carrying the
 * − / play-pause / + buttons, plus the click loop while JS timers are frozen.
 * It keeps the process alive while the screen is off and puts the controls on
 * the lock screen.
 */
class MetronomeControlsService : Service() {
  private var bpm = 120
  private var running = false
  private var subtitle: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    Clicks.preload(this) // so the first background beat isn't silent while samples load
  }

  override fun onDestroy() {
    stopTicking()
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
    tickBpm = bpm.coerceIn(20, 300) // lock-screen nudges reach a live background loop too
    goForeground()
  }

  // --- background click loop -----------------------------------------------
  // Android freezes JS timers while the activity is paused, so JS hands the
  // click loop over on backgrounding and takes it back on resume.

  private var tickThread: HandlerThread? = null
  private var tickHandler: Handler? = null
  @Volatile private var tickBpm = 120
  @Volatile private var tickPattern = intArrayOf(3, 1, 1, 1)
  @Volatile private var tickSubdiv = 1
  @Volatile private var tickSound = "wood"
  @Volatile private var tickGain = 1f
  private var tickBeat = 0
  private var tickSub = 0 // position inside the beat; 0 is the beat itself
  private var tickNextAt = 0.0 // fractional ms so odd tempos don't drift

  private val tickRunnable = object : Runnable {
    override fun run() {
      val pattern = tickPattern
      val subdiv = tickSubdiv.coerceIn(1, 4)
      if (tickSub == 0) {
        // level 0 means the user muted this beat — count it, don't play it
        val level = pattern[tickBeat % pattern.size].coerceIn(0, 3)
        if (level > 0) Clicks.play(this@MetronomeControlsService, tickSound, level - 1, tickGain)
      } else {
        Clicks.play(this@MetronomeControlsService, tickSound, Clicks.SUB_BANK, tickGain)
      }
      tickSub++
      if (tickSub >= subdiv) {
        tickSub = 0
        tickBeat++
      }
      val interval = 60000.0 / tickBpm / subdiv
      tickNextAt += interval
      val now = SystemClock.uptimeMillis()
      if (tickNextAt < now) tickNextAt = now + interval
      tickHandler?.postAtTime(this, tickNextAt.toLong())
    }
  }

  private var wakeLock: PowerManager.WakeLock? = null

  /** Tempo, bar, subdivision, sound and volume — applied from the next tick. */
  fun tune(bpm: Int, pattern: IntArray, subdiv: Int, sound: String, volume: Int) {
    tickBpm = bpm.coerceIn(20, 300)
    if (pattern.isNotEmpty()) tickPattern = pattern
    tickSubdiv = subdiv.coerceIn(1, 4)
    tickGain = volume.coerceIn(0, 100) / 100f
    if (SOUND_SETS.containsKey(sound)) tickSound = sound
  }

  /**
   * Take the loop over from `beat`/`sub`, first tick in `startIn` ms — the rest
   * of the beat the JS timer had already started. A fresh start (from the lock
   * screen, with nothing to continue) passes 0, 0, 0 and clicks at once.
   */
  fun startTicking(
    bpm: Int,
    pattern: IntArray,
    subdiv: Int,
    sound: String,
    volume: Int,
    beat: Int,
    sub: Int,
    startIn: Double
  ) {
    tune(bpm, pattern, subdiv, sound, volume)
    if (tickThread != null) return // already ticking; the new config applies from the next tick
    // without a wakelock the CPU naps between beats once the screen is off
    wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "etude:metronome")
      .also { it.acquire(4 * 60 * 60 * 1000L) } // 4h safety cap
    tickBeat = if (beat >= 0) beat else 0
    tickSub = sub.coerceIn(0, 3)
    tickThread = HandlerThread("metronome-tick").also { it.start() }
    tickHandler = Handler(tickThread!!.looper)
    tickNextAt = SystemClock.uptimeMillis() + startIn.coerceAtLeast(0.0)
    tickHandler?.postAtTime(tickRunnable, tickNextAt.toLong())
  }

  /**
   * Hand the loop back, reporting where it got to so JS can carry the bar on
   * in phase: the next tick's beat and position, and the wait still left on it.
   * Null when nothing was ticking — there is no position to hand back.
   */
  fun stopTicking(): Map<String, Double>? {
    if (tickThread == null) return null
    val nextIn = (tickNextAt - SystemClock.uptimeMillis()).coerceAtLeast(0.0)
    tickHandler?.removeCallbacksAndMessages(null)
    tickThread?.quitSafely()
    tickThread = null
    tickHandler = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    return mapOf("beat" to tickBeat.toDouble(), "sub" to tickSub.toDouble(), "nextIn" to nextIn)
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
    Events("onCommand")

    OnCreate {
      MetronomeControlsService.onCommand = { command -> sendEvent("onCommand", mapOf("command" to command)) }
    }

    OnDestroy {
      MetronomeControlsService.onCommand = null
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
    }

    Function("update") { state: ControlsState ->
      MetronomeControlsService.instance?.update(state.bpm, state.running, state.subtitle)
    }

    Function("hide") { hide() }

    Function("startTicking") { state: TickState ->
      MetronomeControlsService.instance?.startTicking(
        state.bpm, state.pattern.toIntArray(), state.subdiv, state.sound, state.volume,
        state.beat, state.sub, state.startIn
      )
    }

    Function("updateTicking") { state: TickState ->
      MetronomeControlsService.instance?.tune(
        state.bpm, state.pattern.toIntArray(), state.subdiv, state.sound, state.volume
      )
    }

    Function("stopTicking") {
      MetronomeControlsService.instance?.stopTicking()
    }

    Function("preloadClicks") { Clicks.preload(context) }

    Function("click") { c: Click ->
      Clicks.play(context, c.sound, c.bank, c.volume.coerceIn(0, 100) / 100f)
    }
  }

  private fun hide() {
    context.stopService(Intent(context, MetronomeControlsService::class.java))
  }
}
