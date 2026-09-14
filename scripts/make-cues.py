"""Generate the two audio-identity cues in assets/audio/.

Signature interval: a rising perfect fourth, D4 (293.66 Hz) -> G4 (392 Hz).
Voice is a felt mallet: sine fundamental plus a quiet 4th partial that decays
four times faster, 8ms attack, exponential release.

Run with plain python3, no dependencies:  python scripts/make-cues.py
"""
import math
import random
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

# Cue 1b - the same motif in three other voices (#53), picked from the user's
# primary instrument by src/lib/cue-voice.ts. Same notes, same timing, so the
# app keeps one signature interval whatever you play.


def pluck(buf, freq, start, dur, level):
    """Plucked string: 2ms attack, fast decay, bright 2nd/3rd partials."""
    n, off = int(RATE * dur), int(RATE * start)
    attack = int(RATE * 0.002)
    for i in range(n):
        j = off + i
        if j >= len(buf):
            break
        t = i / RATE
        env = min(1.0, i / attack) * math.exp(-7.0 * t / dur)
        w = math.sin(2 * math.pi * freq * t)
        w += 0.30 * math.exp(-4.0 * t / dur) * math.sin(2 * math.pi * freq * 2 * t)
        w += 0.14 * math.exp(-9.0 * t / dur) * math.sin(2 * math.pi * freq * 3 * t)
        buf[j] += level * env * w


def bow(buf, freq, start, dur, level):
    """Held note: 140ms swell, sustain, slow release, 5Hz vibrato."""
    n, off = int(RATE * dur), int(RATE * start)
    rise, fall = 0.14 * dur, 0.45 * dur
    for i in range(n):
        j = off + i
        if j >= len(buf):
            break
        t = i / RATE
        if t < rise:
            env = t / rise
        elif t > dur - fall:
            env = max(0.0, (dur - t) / fall)
        else:
            env = 1.0
        f = freq * (1.0 + 0.004 * math.sin(2 * math.pi * 5.0 * t))
        w = math.sin(2 * math.pi * f * t)
        w += 0.18 * math.sin(2 * math.pi * f * 2 * t) + 0.09 * math.sin(2 * math.pi * f * 3 * t)
        buf[j] += level * env * w * 0.7


def perc(buf, freq, start, dur, level):
    """Struck skin: noise transient over a fast-damped low tone."""
    n, off = int(RATE * dur), int(RATE * start)
    rnd = random.Random(int(freq))  # deterministic: the file must rebuild byte-identical
    for i in range(n):
        j = off + i
        if j >= len(buf):
            break
        t = i / RATE
        env = math.exp(-16.0 * t / dur)
        body = math.sin(2 * math.pi * freq * 0.5 * t) + 0.4 * math.sin(2 * math.pi * freq * 1.5 * t)
        noise = rnd.uniform(-1.0, 1.0) * math.exp(-90.0 * t) * 0.55
        buf[j] += level * (env * body * 0.8 + noise)


for name, voice, (d1, d2, d3), master in (
    ("pluck", pluck, (1.1, 1.5, 0.8), 0.5),
    ("bow", bow, (1.3, 1.9, 1.0), 0.5),
    ("perc", perc, (0.7, 1.0, 0.5), 0.5),
):
    c = [0.0] * int(RATE * 2.4)
    voice(c, D4, 0.0, d1, 1.0)
    voice(c, G4, 0.220, d2, 1.0)
    voice(c, G5, 0.220, d3, 0.25)
    write(OUT / f"cue-session-{name}.wav", c, master)

# Cue 2 "Harmonic ping" - reminder notification. The fourth's answer, an
# octave up and alone.
b = [0.0] * int(RATE * 2.0)
mallet(b, D5, 0.0, 1.8, 0.55)
# underscore, not a hyphen: this one is bundled as an Android raw
# resource, and those names must be lowercase alphanumeric + "_"
write(OUT / "cue_reminder.wav", b, 1.0)
