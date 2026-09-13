import AVFoundation
import ExpoModulesCore

/** Frames per analysis window. Must match WINDOW in src/lib/tuner-math.ts. */
private let WINDOW = 4096

/**
 * Microphone tap for the tuner. Mirrors the Android module exactly: a ring of
 * the newest WINDOW frames, handed to JS as little-endian Int16 PCM, oldest
 * first. All pitch detection lives in src/lib/tuner-math.ts.
 *
 * NOTE: written without a device to verify against — this project has no Apple
 * developer account yet. Test before trusting it.
 */
public class PitchInputModule: Module {
  private let engine = AVAudioEngine()
  private var running = false
  // The hardware rate, not an assumption: iOS routinely hands back 48 kHz.
  private var rate: Double = 44100
  private var ring = [Int16](repeating: 0, count: WINDOW)
  private var writeIndex = 0
  private var filled = false
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("PitchInput")

    Property("sampleRate") { self.rate }
    Property("isRecording") { self.running }

    Function("start") { try self.start() }
    Function("stop") { self.stop() }

    Function("read") { () -> Data in
      self.lock.lock()
      defer { self.lock.unlock() }
      guard self.filled else { return Data() }
      var out = Data(capacity: WINDOW * 2)
      for i in 0..<WINDOW {
        var s = self.ring[(self.writeIndex + i) % WINDOW].littleEndian
        withUnsafeBytes(of: &s) { out.append(contentsOf: $0) }
      }
      return out
    }

    OnDestroy { self.stop() }
  }

  private func start() throws {
    guard !running else { return }

    let session = AVAudioSession.sharedInstance()
    // .measurement leaves the signal alone — no AGC or processing shaping the
    // pitch we are trying to measure.
    try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
    try session.setActive(true)

    lock.lock()
    writeIndex = 0
    filled = false
    lock.unlock()

    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    rate = format.sampleRate

    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      guard let self, let channel = buffer.floatChannelData?[0] else { return }
      self.lock.lock()
      for i in 0..<Int(buffer.frameLength) {
        let clamped = max(-1, min(1, channel[i]))
        self.ring[self.writeIndex] = Int16(clamped * 32767)
        self.writeIndex = (self.writeIndex + 1) % WINDOW
        if self.writeIndex == 0 { self.filled = true }
      }
      self.lock.unlock()
    }

    engine.prepare()
    try engine.start()
    running = true
  }

  private func stop() {
    guard running else { return }
    running = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
