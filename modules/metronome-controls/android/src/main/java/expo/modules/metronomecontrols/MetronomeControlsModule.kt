package expo.modules.metronomecontrols

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
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
    return START_STICKY
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
  }

  private fun hide() {
    context.stopService(Intent(context, MetronomeControlsService::class.java))
  }
}
