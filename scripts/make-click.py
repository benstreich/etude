"""Generate the metronome click samples in assets/audio/.

Five sound sets (#57), four samples each — accent (bar downbeat), mid (compound
group start), beat (plain), sub (the subdivision click, deliberately quieter so
the pulse still reads through it). Every sample is <= 45ms, 1ms attack, so the
sets stay interchangeable in level and length.

Files are named `<set>_<level>.wav`: underscores, because the same files are
copied into the Android module as raw resources, and raw resource names may not
contain hyphens.

Run with plain python3, no dependencies:  python scripts/make-click.py
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"

# level name -> (pitch multiplier, peak). Peak, not gain: every sample is
# normalized to it, so the four levels keep the same loudness hierarchy whatever
# voice is generating them, and switching sets never changes the mix. The three
# beat peaks are the ones #35 settled on by boosting the shipped files by hand —
# baked in here so regenerating can't quietly undo that.
LEVELS = {
    "accent": (1.50, 0.98),
    "mid": (1.25, 0.90),
    "beat": (1.00, 0.82),
    "sub": (0.85, 0.45),  # quiet: it fills the gaps, it doesn't carry the pulse
}


def wood(t, n, freq, rnd):
    """Decaying sine — the original click, a struck woodblock."""
    return math.exp(-9.0 * t / n) * math.sin(2 * math.pi * freq * t / RATE)


def click(t, n, freq, rnd):
    """Filtered noise burst — the classic digital metronome."""
    body = rnd.uniform(-1.0, 1.0) * math.exp(-26.0 * t / n)
    return 0.75 * body + 0.35 * math.exp(-14.0 * t / n) * math.sin(2 * math.pi * freq * 2 * t / RATE)


def beep(t, n, freq, rnd):
    """Square-ish tone — brighter, cuts through a loud instrument."""
    w = math.sin(2 * math.pi * freq * t / RATE)
    w += 0.33 * math.sin(2 * math.pi * freq * 3 * t / RATE)
    w += 0.20 * math.sin(2 * math.pi * freq * 5 * t / RATE)
    return 0.62 * math.exp(-7.0 * t / n) * w


def soft(t, n, freq, rnd):
    """The felt mallet from docs/audio-identity.md, shortened — quiet practice."""
    w = math.sin(2 * math.pi * freq * 0.5 * t / RATE)
    w += 0.06 * math.exp(-20.0 * t / n) * math.sin(2 * math.pi * freq * 2 * t / RATE)
    return math.exp(-5.5 * t / n) * w


def rim(t, n, freq, rnd):
    """Stick on a rim: near-instant transient, almost no tail."""
    body = rnd.uniform(-1.0, 1.0) * math.exp(-55.0 * t / n)
    tone = math.exp(-40.0 * t / n) * math.sin(2 * math.pi * freq * 1.8 * t / RATE)
    return 0.55 * body + 0.6 * tone


# set id -> (voice, base frequency, length in ms). 'wood' reproduces the samples
# the app shipped with, so an install that never picks a set sounds unchanged.
SETS = {
    "wood": (wood, 1000.0, 45),
    "click": (click, 1000.0, 30),
    "beep": (beep, 1100.0, 40),
    "soft": (soft, 1200.0, 45),
    "rim": (rim, 1400.0, 22),
}


def write(path: Path, voice, freq: float, peak: float, ms: int) -> None:
    n = RATE * ms // 1000
    attack = RATE // 1000  # 1ms ramp in, so the burst doesn't start on a DC step
    rnd = random.Random(int(freq * 100))  # deterministic: rebuilds must be byte-identical
    raw = [min(1.0, i / attack) * voice(i, n, freq, rnd) for i in range(n)]
    loudest = max(map(abs, raw)) or 1.0
    frames = bytearray()
    for s in (v * peak / loudest for v in raw):
        frames += struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))


OUT.mkdir(parents=True, exist_ok=True)

for set_id, (voice, base, ms) in SETS.items():
    for level, (mult, peak) in LEVELS.items():
        write(OUT / f"{set_id}_{level}.wav", voice, base * mult, peak, ms)
    print(f"{set_id}: {len(LEVELS)} samples, {ms}ms")

# The Android foreground service plays the same samples through SoundPool while
# JS timers are frozen, and Android wants them as raw resources.
raw = Path(__file__).resolve().parent.parent / "modules" / "metronome-controls" / "android" / "src" / "main" / "res" / "raw"
raw.mkdir(parents=True, exist_ok=True)
for wav in sorted(OUT.glob("*_*.wav")):
    if wav.stem.split("_")[0] in SETS:
        (raw / wav.name).write_bytes(wav.read_bytes())
print(f"copied {len(SETS) * len(LEVELS)} samples into {raw.relative_to(raw.parents[6])}")
