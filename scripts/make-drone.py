"""Generate the drone samples in assets/audio/ (Tools tab).

Twelve notes, all in scientific octave 4 (C4 261.63 Hz .. B4 493.88 Hz, with
A4 at 440), one seamless 2-second loop each. The screen gets the other octaves
and a shifted A4 from the playback rate with pitch correction off.

Rendering the whole set in ONE scientific octave matters: it is the top octave
the picker offers, so every rate the app ever asks for is <= ~1.014 and it only
ever pitches down. Rendering A..B an octave lower (the old A3..G#4 run) pushed
A4/A#4/B4 above A4=440 past expo-audio's rate ceiling of 2.0.

Voice: a soft organ — sine fundamental with a quiet 2nd and 3rd partial —
because a bare sine disappears under a real instrument and anything richer
argues with it. Loop length is rounded to a whole number of cycles of the
fundamental so the join is click-free; the partials are integer multiples and
therefore also land on zero at the seam.

Files: drone_<note>.wav, '#' written as 's' (raw resource names are [a-z0-9_]).
Mono, 16-bit, 22 050 Hz: ~88 KB each, ~1 MB in all.

Run with plain python3, no dependencies:  python scripts/make-drone.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"
NOTES = ["a", "as", "b", "c", "cs", "d", "ds", "e", "f", "fs", "g", "gs"]
PARTIALS = [(1, 1.0), (2, 0.35), (3, 0.18)]
PEAK = 0.6  # leaves headroom under the metronome click and a real instrument
TARGET_SEC = 2.0


# semitones from A4 within octave 4 — C4..G#4 sit BELOW A4, A4..B4 above it
SEMIS_FROM_A4 = {"a": 0, "as": 1, "b": 2, "c": -9, "cs": -8, "d": -7, "ds": -6,
                 "e": -5, "f": -4, "fs": -3, "g": -2, "gs": -1}


def freq(name: str) -> float:
    """Equal-tempered frequency of `name` in octave 4, A4 = 440 Hz."""
    return 440.0 * 2 ** (SEMIS_FROM_A4[name] / 12)


def render(f: float) -> list:
    cycles = max(1, round(TARGET_SEC * f))
    n = round(RATE * cycles / f)  # whole cycles → the last sample meets the first
    buf = []
    for i in range(n):
        t = i / RATE
        v = sum(a * math.sin(2 * math.pi * f * k * t) for k, a in PARTIALS)
        buf.append(v)
    m = max(abs(v) for v in buf) or 1.0
    return [v / m * PEAK for v in buf]


def write(path: Path, buf: list) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767)) for v in buf))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in NOTES:
        p = OUT / f"drone_{name}.wav"
        write(p, render(freq(name)))
        total += p.stat().st_size
        print(f"{p.name:14s} {freq(name):8.2f} Hz  {p.stat().st_size // 1024} KB")
    print(f"total {total // 1024} KB")
