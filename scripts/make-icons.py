"""Build the alternate app icons (#80): the adaptive-icon foreground composited over
each accent colour, one 1024×1024 PNG per accent, for iOS (Android builds its
adaptive icon from the foreground + colour in app.json, no file needed).

Pure Python (zlib + struct), no Pillow — like scripts/make-click.py. Re-run after
the real artwork replaces assets/images/android-icon-foreground.png (#6):

    python scripts/make-icons.py

The default icon stays terracotta; only the other five accents get a file.
"""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOREGROUND = ROOT / "assets" / "images" / "android-icon-foreground.png"
OUT = ROOT / "assets" / "icons"

# theme.ts ACCENTS[...].light[0]; terracotta is the default icon and needs no file
ACCENTS = {
    "forest": "#4A7C59",
    "indigo": "#5B5BD6",
    "ocean": "#2E7DB3",
    "plum": "#9D4A8E",
    "slate": "#556270",
}


def read_png_rgba(path: Path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos, idat, w, h = 8, [], 0, 0
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            assert (depth, ctype, interlace) == (8, 6, 0), "need 8-bit RGBA, non-interlaced"
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))
    bpp, stride = 4, w * 4
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        line = bytearray(raw[p + 1 : p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1:
                line[i] = (line[i] + a) & 0xFF
            elif f == 2:
                line[i] = (line[i] + b) & 0xFF
            elif f == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if pa <= pb and pa <= pc else b if pb <= pc else c
                line[i] = (line[i] + pred) & 0xFF
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return w, h, bytes(out)


def write_png_rgb(path: Path, w: int, h: int, rgb: bytes) -> None:
    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    stride = w * 3
    raw = b"".join(b"\x00" + rgb[y * stride : (y + 1) * stride] for y in range(h))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def composite(rgba: bytes, bg: str) -> bytes:
    r0, g0, b0 = (int(bg[i : i + 2], 16) for i in (1, 3, 5))
    out = bytearray(len(rgba) // 4 * 3)
    for i in range(0, len(rgba), 4):
        a = rgba[i + 3]
        o = i // 4 * 3
        out[o] = (rgba[i] * a + r0 * (255 - a)) // 255
        out[o + 1] = (rgba[i + 1] * a + g0 * (255 - a)) // 255
        out[o + 2] = (rgba[i + 2] * a + b0 * (255 - a)) // 255
    return bytes(out)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    w, h, rgba = read_png_rgba(FOREGROUND)
    for name, colour in ACCENTS.items():
        target = OUT / f"{name}.png"
        write_png_rgb(target, w, h, composite(rgba, colour))
        print(f"{target.relative_to(ROOT)}: {target.stat().st_size} bytes")
