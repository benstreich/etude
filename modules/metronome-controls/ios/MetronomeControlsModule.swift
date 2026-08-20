import ExpoModulesCore
import MediaPlayer

struct ControlsState: Record {
  @Field var bpm: Int = 120
  @Field var running: Bool = false
  @Field var subtitle: String?
}

struct TickState: Record {
  @Field var bpm: Int = 120
  @Field var pattern: [Int] = [2, 0, 0, 0]
}

/**
 * Lock-screen / Control Center transport for the metronome.
 *
 * The clicks are played by expo-audio up in JS — this module only owns the
 * now-playing info and the remote commands, mapping ⏮/⏭ onto slower/faster.
 * It deliberately replaces `player.setActiveForLockScreen()`: both write to
 * `MPNowPlayingInfoCenter`, so only one of them may be in charge.
 */
public class MetronomeControlsModule: Module {
  private var targets: [MPRemoteCommand: Any] = [:]

  public func definition() -> ModuleDefinition {
    Name("MetronomeControls")

    Events("onCommand")

    Function("show") { (state: ControlsState) in
      self.installCommands()
      self.publish(state)
    }

    Function("update") { (state: ControlsState) in
      self.publish(state)
    }

    Function("hide") {
      self.teardown()
    }

    // Android-only background click loop — iOS JS timers keep firing in the
    // background, so these are no-ops here.
    Function("startTicking") { (_: TickState) in }
    Function("stopTicking") {}

    OnDestroy {
      self.teardown()
    }
  }

  private func installCommands() {
    guard targets.isEmpty else { return }
    let center = MPRemoteCommandCenter.shared()
    let map: [(MPRemoteCommand, String)] = [
      (center.nextTrackCommand, "inc"),
      (center.previousTrackCommand, "dec"),
      (center.togglePlayPauseCommand, "toggle"),
      (center.playCommand, "toggle"),
      (center.pauseCommand, "toggle"),
    ]
    for (command, name) in map {
      command.isEnabled = true
      targets[command] = command.addTarget { [weak self] _ in
        self?.sendEvent("onCommand", ["command": name])
        return .success
      }
    }
    // seeking a metronome is meaningless; leave the scrubber out of it
    center.changePlaybackPositionCommand.isEnabled = false
  }

  private func publish(_ state: ControlsState) {
    DispatchQueue.main.async {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = [
        MPMediaItemPropertyTitle: "\(state.bpm) BPM",
        MPMediaItemPropertyArtist: state.subtitle ?? "Étude metronome",
        MPNowPlayingInfoPropertyIsLiveStream: true,
        MPNowPlayingInfoPropertyPlaybackRate: state.running ? 1.0 : 0.0,
      ]
      MPNowPlayingInfoCenter.default().playbackState = state.running ? .playing : .paused
    }
  }

  private func teardown() {
    for (command, target) in targets {
      command.removeTarget(target)
      command.isEnabled = false
    }
    targets.removeAll()
    DispatchQueue.main.async {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      MPNowPlayingInfoCenter.default().playbackState = .stopped
    }
  }
}
