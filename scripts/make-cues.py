"""Generate the two audio-identity cues in assets/audio/.

Signature interval: a rising perfect fourth, D4 (293.66 Hz) -> G4 (392 Hz).
Voice is a felt mallet: sine fundamental plus a quiet 4th partial that decays
four times faster, 8ms attack, exponential release.

Run with plain python3, no dependencies:  python scripts/make-cues.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"

D4, G4, G5, D5 = 293.66, 392.0, 784.0, 587.33


def mallet(buf: list, freq: float, start: float, dur: float, level: float) -> None:
    """Mix one mallet note into buf at `start` seconds."""
    n = int(RATE * dur)
    attack = int(RATE * 0.008)  # 8ms linear ramp in
    off = int(RATE * start)
    for i in range(n):
        j = off + i
        if j >= len(buf):
            break
        t = i / RATE
        env = min(1.0, i / attack) * math.exp(-5.0 * t / dur)
        # 4th partial at ~6%, decaying in a quarter of the note's length
        part = 0.06 * math.exp(-5.0 * t / (dur * 0.25))
        buf[j] += level * env * (
            math.sin(2 * math.pi * freq * t) + part * math.sin(2 * math.pi * freq * 4 * t)
        )


def write(path: Path, buf: list, master: float) -> None:
    frames = bytearray()
    for s in buf:
        frames += struct.pack("<h", int(max(-1.0, min(1.0, s * master)) * 32767))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print(f"{path.name}: {path.stat().st_size} bytes")


OUT.mkdir(parents=True, exist_ok=True)

# Cue 1 "Mallet resolve" - session complete. D4, then G4 220ms later with a
# G5 shimmer riding on top of it.
a = [0.0] * int(RATE * 2.4)
mallet(a, D4, 0.0, 1.6, 1.0)
mallet(a, G4, 0.220, 2.1, 1.0)
mallet(a, G5, 0.220, 1.1, 0.25)
write(OUT / "cue-session-complete.wav", a, 0.5)

# Cue 2 "Harmonic ping" - reminder notification. The fourth's answer, an
# octave up and alone.
b = [0.0] * int(RATE * 2.0)
mallet(b, D5, 0.0, 1.8, 0.55)
write(OUT / "cue-reminder.wav", b, 1.0)
