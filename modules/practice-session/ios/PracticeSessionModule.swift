import ExpoModulesCore

struct SessionState: Record {
  @Field var title: String = ""
  @Field var subtitle: String?
  @Field var running: Bool = true
  @Field var elapsedMs: Double = 0
}

/**
 * The Android side is a foreground service that keeps the process alive during
 * a session. iOS suspends a backgrounded app rather than killing it, and the
 * session timer is wall-clock, so there is nothing to keep alive here — the
 * functions exist so callers need no platform check. (A Live Activity for the
 * running session is #97.)
 */
public class PracticeSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PracticeSession")

    Function("show") { (_: SessionState) in }
    Function("hide") {}
  }
}
