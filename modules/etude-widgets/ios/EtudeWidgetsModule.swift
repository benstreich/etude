import ExpoModulesCore
#if canImport(WidgetKit)
import WidgetKit
#endif

// Must match the App Group in targets/widgets/expo-target.config.js and app.json
let appGroup = "group.com.benstreich.etude"

struct WidgetData: Record {
  @Field var today: Int = 0
  @Field var goal: Int = 45
  @Field var streak: Int = 0
  @Field var week: [Int] = []
  @Field var nextFocus: String?
}

/**
 * Persists the widget snapshot into the shared App Group and asks WidgetKit
 * to repaint. The widget extension (targets/widgets) reads the same keys.
 */
public class EtudeWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EtudeWidgets")

    Function("setWidgetData") { (data: WidgetData) in
      guard let defaults = UserDefaults(suiteName: appGroup) else { return }
      defaults.set(data.today, forKey: "today")
      defaults.set(data.goal, forKey: "goal")
      defaults.set(data.streak, forKey: "streak")
      defaults.set(data.week, forKey: "week")
      defaults.set(data.nextFocus, forKey: "nextFocus")
      #if canImport(WidgetKit)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      #endif
    }
  }
}
