package expo.modules.practicesession

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

private const val CHANNEL_ID = "practice-session"
private const val NOTIFICATION_ID = 7318

class SessionState(
  @Field val title: String = "",
  @Field val subtitle: String? = null,
  @Field val running: Boolean = true,
  // milliseconds practised at the moment of the call; the notification's clock runs on from here
  @Field val elapsedMs: Double = 0.0
) : Record

/**
 * Foreground service behind the running practice session. Its one job is to
 * exist: with it, Android keeps the process — and so the wall-clock timer that
 * the session is — alive while the screen is off. The notification it must show
 * carries the elapsed time as a native chronometer, so it keeps ticking after
 * Android has frozen every JS timer, which happens the moment the screen goes off.
 */
class PracticeSessionService : Service() {
  private var title = ""
  private var subtitle: String? = null
  private var running = true
  private var elapsedMs = 0.0
  private var stampedAt = System.currentTimeMillis() // when elapsedMs was true

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
    if (intent != null) read(intent)
    goForeground()
    // NOT_STICKY: without the JS runtime the session it stands for is gone
    return START_NOT_STICKY
  }

  private fun read(intent: Intent) {
    title = intent.getStringExtra(EXTRA_TITLE) ?: title
    subtitle = intent.getStringExtra(EXTRA_SUBTITLE) ?: subtitle
    running = intent.getBooleanExtra(EXTRA_RUNNING, running)
    elapsedMs = intent.getDoubleExtra(EXTRA_ELAPSED, elapsedMs)
    stampedAt = System.currentTimeMillis()
  }

  fun update(title: String, subtitle: String?, running: Boolean, elapsedMs: Double) {
    this.title = title
    this.subtitle = subtitle
    this.running = running
    this.elapsedMs = elapsedMs
    stampedAt = System.currentTimeMillis()
    goForeground()
  }

  private fun goForeground() {
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(),
      // the specialUse type exists from 34; on 29–33 the manifest's declaration is what counts
      if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    )
  }

  private fun clock(ms: Double): String {
    val total = (ms / 1000).toLong().coerceAtLeast(0)
    return String.format("%02d:%02d", total / 60, total % 60)
  }

  private fun buildNotification(): android.app.Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Practice session", NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
          setSound(null, null)
        }
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val b = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(title)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(open)
    if (running) {
      // `when` is the instant the session would have started had it never paused;
      // the chronometer counts up from it on its own, no updates needed
      b.setContentText(subtitle)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setWhen(stampedAt - elapsedMs.toLong())
    } else {
      b.setContentText(listOfNotNull(subtitle, clock(elapsedMs)).joinToString(" · "))
        .setShowWhen(false)
        .setUsesChronometer(false)
    }
    return b.build()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_SUBTITLE = "subtitle"
    const val EXTRA_RUNNING = "running"
    const val EXTRA_ELAPSED = "elapsedMs"

    // ponytail: a static instance beats binding — update() from a backgrounded app
    // can't legally go through startService() on API 26+, but a direct call can.
    var instance: PracticeSessionService? = null
  }
}

class PracticeSessionModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is gone" }

  override fun definition() = ModuleDefinition {
    Name("PracticeSession")

    OnDestroy { hide() }

    Function("show") { state: SessionState ->
      val live = PracticeSessionService.instance
      if (live != null) {
        live.update(state.title, state.subtitle, state.running, state.elapsedMs)
      } else {
        ContextCompat.startForegroundService(
          context,
          Intent(context, PracticeSessionService::class.java)
            .putExtra(PracticeSessionService.EXTRA_TITLE, state.title)
            .putExtra(PracticeSessionService.EXTRA_SUBTITLE, state.subtitle)
            .putExtra(PracticeSessionService.EXTRA_RUNNING, state.running)
            .putExtra(PracticeSessionService.EXTRA_ELAPSED, state.elapsedMs)
        )
      }
    }

    Function("hide") { hide() }
  }

  private fun hide() {
    context.stopService(Intent(context, PracticeSessionService::class.java))
  }
}
