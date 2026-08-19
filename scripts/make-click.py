"""Generate the metronome click samples in assets/audio/.

Two short decaying sine bursts — accent (downbeat) is a fifth higher and louder.
Run with plain python3, no dependencies:  python scripts/make-click.py
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
MS = 45
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"


def click(path: Path, freq: float, gain: float) -> None:
    n = RATE * MS // 1000
    attack = RATE // 1000  # 1ms ramp in, so the burst doesn't start on a DC step
    frames = bytearray()
    for i in range(n):
        env = min(1.0, i / attack) * math.exp(-9.0 * i / n)
        s = gain * env * math.sin(2 * math.pi * freq * i / RATE)
        frames += struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print(f"{path.name}: {path.stat().st_size} bytes")


OUT.mkdir(parents=True, exist_ok=True)
click(OUT / "click-accent.wav", 1500.0, 0.9)  # bar downbeat
click(OUT / "click-mid.wav", 1250.0, 0.75)  # compound-meter group start (the "4" in 6/8)
click(OUT / "click.wav", 1000.0, 0.6)
