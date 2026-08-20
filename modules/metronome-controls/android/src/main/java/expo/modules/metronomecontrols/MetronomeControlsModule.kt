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

class TickState(
  @Field val bpm: Int = 120,
  // accent level per beat of one bar: 2 downbeat, 1 group start, 0 plain
  @Field val pattern: List<Int> = listOf(2, 0, 0, 0)
) : Record

/**
 * Foreground service whose only job is the ongoing notification carrying the
 * − / play-pause / + buttons. The clicks themselves are played by expo-audio up
 * in JS; this service exists so Android keeps the process alive while the screen
 * is off and puts the controls on the lock screen.
 */
class MetronomeControlsService : Service() {
  private var bpm = 120
  private var running = false
  private var subtitle: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    // preload the clicks now so the first background beat isn't silent while they load
    soundPool = SoundPool.Builder()
      .setMaxStreams(3)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      .build()
      .also {
        soundIds[0] = it.load(this, R.raw.click, 1)
        soundIds[1] = it.load(this, R.raw.click_mid, 1)
        soundIds[2] = it.load(this, R.raw.click_accent, 1)
      }
  }

  override fun onDestroy() {
    stopTicking()
    soundPool?.release()
    soundPool = null
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

  private var soundPool: SoundPool? = null
  private val soundIds = IntArray(3) // index = accent level
  private var tickThread: HandlerThread? = null
  private var tickHandler: Handler? = null
  @Volatile private var tickBpm = 120
  @Volatile private var tickPattern = intArrayOf(2, 0, 0, 0)
  private var tickBeat = 0
  private var tickNextAt = 0.0 // fractional ms so odd tempos don't drift

  private val tickRunnable = object : Runnable {
    override fun run() {
      val pattern = tickPattern
      val level = pattern[tickBeat % pattern.size].coerceIn(0, 2)
      soundPool?.play(soundIds[level], 1f, 1f, 1, 0, 1f)
      tickBeat++
      tickNextAt += 60000.0 / tickBpm
      val now = SystemClock.uptimeMillis()
      if (tickNextAt < now) tickNextAt = now + 60000.0 / tickBpm
      tickHandler?.postAtTime(this, tickNextAt.toLong())
    }
  }

  private var wakeLock: PowerManager.WakeLock? = null

  fun startTicking(bpm: Int, pattern: IntArray) {
    tickBpm = bpm.coerceIn(20, 300)
    if (pattern.isNotEmpty()) tickPattern = pattern
    if (tickThread != null) return // already ticking; new tempo/pattern apply from the next beat
    // without a wakelock the CPU naps between beats once the screen is off
    wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "etude:metronome")
      .also { it.acquire(4 * 60 * 60 * 1000L) } // 4h safety cap
    tickBeat = 0
    tickThread = HandlerThread("metronome-tick").also { it.start() }
    tickHandler = Handler(tickThread!!.looper)
    tickNextAt = SystemClock.uptimeMillis().toDouble()
    tickHandler?.postAtTime(tickRunnable, tickNextAt.toLong())
  }

  fun stopTicking() {
    tickHandler?.removeCallbacksAndMessages(null)
    tickThread?.quitSafely()
    tickThread = null
    tickHandler = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
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
      MetronomeControlsService.instance?.startTicking(state.bpm, state.pattern.toIntArray())
    }

    Function("stopTicking") {
      MetronomeControlsService.instance?.stopTicking()
    }
  }

  private fun hide() {
    context.stopService(Intent(context, MetronomeControlsService::class.java))
  }
}
