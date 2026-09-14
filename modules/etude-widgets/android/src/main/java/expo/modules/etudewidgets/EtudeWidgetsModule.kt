package expo.modules.etudewidgets

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class WidgetData(
  @Field val today: Int = 0,
  @Field val goal: Int = 45,
  @Field val streak: Int = 0,
  @Field val week: List<Int> = emptyList(),
  @Field val nextFocus: String? = null,
  // #80: [accent, mid, soft] hex per scheme; empty = the brand terracotta from colors.xml
  @Field val accentLight: List<String> = emptyList(),
  @Field val accentDark: List<String> = emptyList(),
) : Record

/** Persists the widget snapshot and repaints placed widgets. */
object WidgetStore {
  private const val PREFS = "etude.widgets"

  fun save(ctx: Context, data: WidgetData) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putInt("today", data.today)
      .putInt("goal", data.goal)
      .putInt("streak", data.streak)
      .putString("week", data.week.joinToString(","))
      .putString("nextFocus", data.nextFocus)
      .putString("accentLight", data.accentLight.joinToString(","))
      .putString("accentDark", data.accentDark.joinToString(","))
      .apply()
  }

  fun load(ctx: Context): WidgetData {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val week = p.getString("week", "")!!.split(',').mapNotNull { it.toIntOrNull() }
    return WidgetData(
      today = p.getInt("today", 0),
      goal = p.getInt("goal", 45),
      streak = p.getInt("streak", 0),
      week = week,
      nextFocus = p.getString("nextFocus", null),
      accentLight = p.getString("accentLight", "")!!.split(',').filter { it.isNotBlank() },
      accentDark = p.getString("accentDark", "")!!.split(',').filter { it.isNotBlank() },
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
