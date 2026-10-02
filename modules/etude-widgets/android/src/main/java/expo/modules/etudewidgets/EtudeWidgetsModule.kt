package expo.modules.etudewidgets

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class WidgetData(
  // the JS dateKey (yyyy-MM-dd) the numbers belong to; null = an old snapshot, taken as is
  @Field val day: String? = null,
  @Field val today: Int = 0,
  @Field val goal: Int = 45,
  @Field val streak: Int = 0,
  @Field val week: List<Int> = emptyList(),
  @Field val nextFocus: String? = null,
  // #80: [accent, mid, soft] hex per scheme; empty = the brand terracotta from colors.xml
  @Field val accentLight: List<String> = emptyList(),
  @Field val accentDark: List<String> = emptyList(),
  // in-app language strings (minutesToday, min, practice, streak, next); missing = English
  @Field val labels: Map<String, String> = emptyMap(),
) : Record

/** Persists the widget snapshot and repaints placed widgets. */
object WidgetStore {
  private const val PREFS = "etude.widgets"
  private val LABELS = listOf("minutesToday", "min", "practice", "streak", "next")

  fun save(ctx: Context, data: WidgetData) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putInt("today", data.today)
      .putInt("goal", data.goal)
      .putInt("streak", data.streak)
      .putString("week", data.week.joinToString(","))
      .putString("nextFocus", data.nextFocus)
      .putString("accentLight", data.accentLight.joinToString(","))
      .putString("accentDark", data.accentDark.joinToString(","))
      .putString("day", data.day)
      .apply { LABELS.forEach { putString("label.$it", data.labels[it]) } }
      .apply()
  }

  fun load(ctx: Context): WidgetData {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val week = p.getString("week", "")!!.split(',').mapNotNull { it.toIntOrNull() }
    return rollOver(WidgetData(
      day = p.getString("day", null),
      today = p.getInt("today", 0),
      goal = p.getInt("goal", 45),
      streak = p.getInt("streak", 0),
      week = week,
      nextFocus = p.getString("nextFocus", null),
      accentLight = p.getString("accentLight", "")!!.split(',').filter { it.isNotBlank() },
      accentDark = p.getString("accentDark", "")!!.split(',').filter { it.isNotBlank() },
      labels = LABELS.mapNotNull { k -> p.getString("label.$k", null)?.let { k to it } }.toMap(),
    ))
  }

  /**
   * Only the running app writes the snapshot, so after midnight it still holds
   * yesterday: today's minutes become 0, the week slides along with zeros, and
   * a streak with a whole missed day in the gap is over. The app's next push
   * replaces all of it with the real numbers.
   */
  private fun rollOver(d: WidgetData): WidgetData {
    val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val then = d.day?.let { runCatching { fmt.parse(it) }.getOrNull() } ?: return d
    val now = fmt.parse(fmt.format(Calendar.getInstance().time)) ?: return d
    // round, not floor: a DST day is 23 or 25 hours long
    val gap = Math.round((now.time - then.time) / 86_400_000.0).toInt()
    if (gap <= 0) return d
    val week = if (gap >= 7) List(7) { 0 } else d.week.drop(gap) + List(gap) { 0 }
    return WidgetData(
      day = d.day,
      today = 0,
      goal = d.goal,
      streak = if (gap > 1) 0 else d.streak,
      week = week,
      nextFocus = d.nextFocus,
      accentLight = d.accentLight,
      accentDark = d.accentDark,
      labels = d.labels,
    )
  }
}

class EtudeWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EtudeWidgets")

    Function("setWidgetData") { data: WidgetData ->
      val ctx = appContext.reactContext ?: return@Function
      WidgetStore.save(ctx, data)
      updateAllWidgets(ctx)
    }
  }
}
