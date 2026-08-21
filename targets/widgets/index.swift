// Étude widgets (#17, feature 6) — home small, home medium, lock circular.
// UNVERIFIED scaffold: needs a Mac + `npx expo prebuild -p ios` with
// @bacons/apple-targets to build. Reads the App Group written by
// modules/etude-widgets/ios/EtudeWidgetsModule.swift.
import SwiftUI
import WidgetKit

let appGroup = "group.com.benstreich.etude"

// theme.ts LIGHT/DARK, terracotta
extension Color {
  static let paper = Color(light: Color(hex: 0xFAF7F2), dark: Color(hex: 0x1F1B17))
  static let ink = Color(light: Color(hex: 0x1C1A17), dark: Color(hex: 0xEDE7DC))
  static let subtle = Color(light: Color(hex: 0x8A8378), dark: Color(hex: 0x9C9486))
  static let track = Color(light: Color(hex: 0xEFEAE0), dark: Color(hex: 0x2A251F))
  static let accent = Color(light: Color(hex: 0xB34A2E), dark: Color(hex: 0xD96B4A))

  init(hex: UInt) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255
    )
  }

  init(light: Color, dark: Color) {
    self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })
  }
}

struct Snapshot {
  var today = 0
  var goal = 45
  var streak = 0
  var week: [Int] = Array(repeating: 0, count: 7)
  var nextFocus: String?

  static func load() -> Snapshot {
    guard let d = UserDefaults(suiteName: appGroup) else { return Snapshot() }
    var s = Snapshot()
    s.today = d.integer(forKey: "today")
    s.goal = max(1, d.integer(forKey: "goal"))
    s.streak = d.integer(forKey: "streak")
    s.week = (d.array(forKey: "week") as? [Int]) ?? s.week
    s.nextFocus = d.string(forKey: "nextFocus")
    return s
  }

  var frac: Double { min(1, Double(today) / Double(goal)) }
}

struct Entry: TimelineEntry {
  let date: Date
  let snap: Snapshot
}

struct Provider: TimelineProvider {
  func placeholder(in _: Context) -> Entry { Entry(date: .now, snap: Snapshot(today: 14, goal: 20, streak: 6)) }
  func getSnapshot(in _: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: .now, snap: Snapshot.load()))
  }
  func getTimeline(in _: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    // data pushes come via WidgetCenter.reloadAllTimelines(); refresh hourly as a fallback
    completion(Timeline(entries: [Entry(date: .now, snap: Snapshot.load())], policy: .after(.now.addingTimeInterval(3600))))
  }
}

struct GoalRing: View {
  let frac: Double
  let lineWidth: CGFloat
  var body: some View {
    ZStack {
      Circle().stroke(Color.track, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: frac)
        .stroke(Color.accent, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
  }
}

struct SmallView: View {
  let snap: Snapshot
  var body: some View {
    VStack(alignment: .leading) {
      HStack(alignment: .top) {
        ZStack {
          GoalRing(frac: snap.frac, lineWidth: 6)
          Text("\(Int(snap.frac * 100))%").font(.system(size: 13, weight: .bold, design: .rounded)).foregroundColor(.ink)
        }
        .frame(width: 54, height: 54)
        Spacer()
        if snap.streak > 0 {
          HStack(spacing: 3) {
            Image(systemName: "flame.fill").font(.system(size: 11))
            Text("\(snap.streak)").font(.system(size: 13, weight: .semibold))
          }
          .foregroundColor(.accent)
        }
      }
      Spacer()
      Text("\(snap.today) / \(snap.goal)").font(.system(size: 17, weight: .bold, design: .rounded)).foregroundColor(.ink)
      Text("minutes today").font(.system(size: 11)).foregroundColor(.subtle)
    }
  }
}

struct MediumView: View {
  let snap: Snapshot
  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 3) {
        Text("♪ Étude").font(.system(size: 12, weight: .semibold)).foregroundColor(.ink)
        Text("\(snap.today) / \(snap.goal) min").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(.ink)
        Text([snap.streak > 0 ? "\(snap.streak)-day streak" : nil, snap.nextFocus.map { "\($0) next" }].compactMap { $0 }.joined(separator: " · "))
          .font(.system(size: 11.5)).foregroundColor(.subtle).lineLimit(1)
        Spacer()
        Link(destination: URL(string: "etude://practice")!) {
          Text("Practice")
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 110, height: 32)
            .background(Capsule().fill(Color.accent))
        }
      }
      Spacer()
      HStack(alignment: .bottom, spacing: 5) {
        let maxMin = max(snap.week.max() ?? 1, 1)
        ForEach(0..<7, id: \.self) { i in
          let v = i < snap.week.count ? snap.week[i] : 0
          RoundedRectangle(cornerRadius: 2)
            .fill(v > 0 ? Color.accent.opacity(0.4 + 0.6 * Double(v) / Double(maxMin)) : Color.track)
            .frame(width: 10, height: v > 0 ? max(6, 54 * CGFloat(v) / CGFloat(maxMin)) : 4)
        }
      }
    }
  }
}

struct CircularView: View {
  let snap: Snapshot
  var body: some View {
    // single-color accessory: ring + fermata-style minutes readout
    Gauge(value: snap.frac) {
      Text("\(snap.today)'")
    } currentValueLabel: {
      Text("\(snap.today)'").font(.system(size: 14, weight: .semibold, design: .rounded))
    }
    .gaugeStyle(.accessoryCircularCapacity)
  }
}

struct EtudeWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry
  var body: some View {
    Group {
      switch family {
      case .accessoryCircular: CircularView(snap: entry.snap)
      case .systemMedium: MediumView(snap: entry.snap)
      default: SmallView(snap: entry.snap)
      }
    }
    .containerBackground(Color.paper, for: .widget)
  }
}

struct EtudeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "EtudeWidget", provider: Provider()) { entry in
      EtudeWidgetView(entry: entry)
    }
    .configurationDisplayName("Étude")
    .description("Today’s practice at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
  }
}

@main
struct EtudeWidgetBundle: WidgetBundle {
  var body: some Widget {
    EtudeWidget()
  }
}
