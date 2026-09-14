package expo.modules.etudewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.widget.RemoteViews
import androidx.core.content.ContextCompat

/** Repaint every placed Étude widget (called after each data write). */
fun updateAllWidgets(ctx: Context) {
  val mgr = AppWidgetManager.getInstance(ctx)
  for (cls in listOf(EtudeSmallWidget::class.java, EtudeMediumWidget::class.java)) {
    val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
    if (ids.isNotEmpty()) {
      ctx.sendBroadcast(Intent(ctx, cls).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
      })
    }
  }
}

private fun dp(ctx: Context, v: Float) = v * ctx.resources.displayMetrics.density

/** Accent, mid and soft for the launcher's current scheme (#80); the brand terracotta from colors.xml until the app has pushed a snapshot. */
private fun accentColors(ctx: Context, d: WidgetData): IntArray {
  val night = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
  val hex = if (night) d.accentDark else d.accentLight
  val fallback = intArrayOf(
    ContextCompat.getColor(ctx, R.color.etude_widget_accent),
    ContextCompat.getColor(ctx, R.color.etude_widget_accent_mid),
    ContextCompat.getColor(ctx, R.color.etude_widget_accent_soft),
  )
  if (hex.size < 3) return fallback
  return try {
    IntArray(3) { Color.parseColor(hex[it]) }
  } catch (_: IllegalArgumentException) {
    fallback
  }
}

private fun openAppIntent(ctx: Context): PendingIntent? {
  val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
  return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

private fun deepLinkIntent(ctx: Context, url: String): PendingIntent {
  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply { setPackage(ctx.packageName) }
  return PendingIntent.getActivity(ctx, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

/** Goal ring drawn as a bitmap — RemoteViews has no arc primitive. */
private fun ringBitmap(ctx: Context, sizeDp: Float, strokeDp: Float, frac: Float, label: String, accent: Int): Bitmap {
  val size = dp(ctx, sizeDp)
  val stroke = dp(ctx, strokeDp)
  val bmp = Bitmap.createBitmap(size.toInt(), size.toInt(), Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bmp)
  val rect = RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2)
  val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = stroke
    strokeCap = Paint.Cap.ROUND
  }
  paint.color = ContextCompat.getColor(ctx, R.color.etude_widget_track)
  canvas.drawArc(rect, 0f, 360f, false, paint)
  paint.color = accent
  canvas.drawArc(rect, -90f, 360f * frac.coerceIn(0f, 1f), false, paint)
  val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = ContextCompat.getColor(ctx, R.color.etude_widget_ink)
    textSize = dp(ctx, sizeDp * 0.24f)
    textAlign = Paint.Align.CENTER
    isFakeBoldText = true
  }
  canvas.drawText(label, size / 2, size / 2 - (text.ascent() + text.descent()) / 2, text)
  return bmp
}

/** 7 week bars as a bitmap, accent stepped by minutes like the app's charts. */
private fun barsBitmap(ctx: Context, week: List<Int>, wDp: Float, hDp: Float, accent: IntArray): Bitmap {
  val w = dp(ctx, wDp)
  val h = dp(ctx, hDp)
  val bmp = Bitmap.createBitmap(w.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bmp)
  val days = if (week.size == 7) week else List(7) { week.getOrElse(it) { 0 } }
  val max = (days.maxOrNull() ?: 0).coerceAtLeast(1)
  val gap = dp(ctx, 5f)
  val barW = (w - gap * 6) / 7
  val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  days.forEachIndexed { i, min ->
    val frac = min.toFloat() / max
    val barH = if (min == 0) dp(ctx, 4f) else (h * frac).coerceAtLeast(dp(ctx, 6f))
    paint.color = when {
      min == 0 -> ContextCompat.getColor(ctx, R.color.etude_widget_track)
      frac > 0.66f -> accent[0]
      frac > 0.33f -> accent[1]
      else -> accent[2]
    }
    val x = i * (barW + gap)
    canvas.drawRoundRect(RectF(x, h - barH, x + barW, h), dp(ctx, 2f), dp(ctx, 2f), paint)
  }
  return bmp
}

class EtudeSmallWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    val d = WidgetStore.load(ctx)
    val accent = accentColors(ctx, d)
    for (id in ids) {
      val views = RemoteViews(ctx.packageName, R.layout.etude_widget_small).apply {
        val frac = if (d.goal > 0) d.today.toFloat() / d.goal else 0f
        val pct = (frac * 100).toInt().coerceAtMost(999)
        setImageViewBitmap(R.id.ring, ringBitmap(ctx, 54f, 6f, frac, "$pct%", accent[0]))
        setTextViewText(R.id.streak, if (d.streak > 0) "🔥 ${d.streak}" else "")
        setTextColor(R.id.streak, accent[0])
        setTextViewText(R.id.minutes, "${d.today} / ${d.goal}")
        openAppIntent(ctx)?.let { setOnClickPendingIntent(R.id.root, it) }
      }
      mgr.updateAppWidget(id, views)
    }
  }
}

class EtudeMediumWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    val d = WidgetStore.load(ctx)
    val accent = accentColors(ctx, d)
    for (id in ids) {
      val views = RemoteViews(ctx.packageName, R.layout.etude_widget_medium).apply {
        setTextViewText(R.id.minutes, "${d.today} / ${d.goal} min")
        val streakPart = if (d.streak > 0) "${d.streak}-day streak" else null
        val nextPart = d.nextFocus?.let { "$it next" }
        setTextViewText(R.id.sub, listOfNotNull(streakPart, nextPart).joinToString(" · "))
        setImageViewBitmap(R.id.bars, barsBitmap(ctx, d.week, 130f, 62f, accent))
        // the pill keeps its shape drawable; tinting it needs API 31 — older phones keep terracotta
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          setColorStateList(R.id.practice, "setBackgroundTintList", ColorStateList.valueOf(accent[0]))
        }
        openAppIntent(ctx)?.let { setOnClickPendingIntent(R.id.root, it) }
        setOnClickPendingIntent(R.id.practice, deepLinkIntent(ctx, "etude://practice"))
      }
      mgr.updateAppWidget(id, views)
    }
  }
}
