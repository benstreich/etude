"""Generate the drone samples in assets/audio/ (Tools tab).

Twelve notes, A3 (220 Hz) up to G#4, one seamless 2-second loop each. The
screen gets every other octave and a shifted A4 from the playback rate with
pitch correction off, so only one octave is rendered.

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


def freq(i: int) -> float:
    """A3 = 220 Hz, then equal-tempered semitones upward."""
    return 220.0 * 2 ** (i / 12)


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
    for i, name in enumerate(NOTES):
        p = OUT / f"drone_{name}.wav"
        write(p, render(freq(i)))
        total += p.stat().st_size
        print(f"{p.name:14s} {freq(i):8.2f} Hz  {p.stat().st_size // 1024} KB")
    print(f"total {total // 1024} KB")
