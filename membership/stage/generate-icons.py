#!/usr/bin/env python3
"""Build recognizable TEST app icons using only Python's standard library.

The accepted environment must not use the production iOS home-screen icon.
"""
from pathlib import Path
import struct
import sys
import zlib

FONT = {
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
}
DARK = (6, 63, 65, 255)
TEAL = (8, 127, 119, 255)
ORANGE = (180, 83, 9, 255)
WHITE = (255, 255, 255, 255)


def rounded(x, y, x0, y0, x1, y1, r):
    if x < x0 or x >= x1 or y < y0 or y >= y1:
        return False
    cx = min(max(x, x0 + r), x1 - r - 1)
    cy = min(max(y, y0 + r), y1 - r - 1)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2


def icon(size):
    rgba = bytearray(size * size * 4)
    def paint(x, y, color):
        i = 4 * (y * size + x)
        rgba[i:i+4] = bytes(color)

    outer = (int(size * .074), int(size * .074), int(size * .926), int(size * .926))
    banner = (int(size * .117), int(size * .673), int(size * .883), int(size * .900))
    for y in range(size):
        for x in range(size):
            color = DARK
            if rounded(x, y, *outer, int(size * .145)):
                color = TEAL
            if rounded(x, y, *banner, int(size * .040)):
                color = ORANGE
            paint(x, y, color)

    def glyph(letter, x, y, unit):
        for j, line in enumerate(FONT[letter]):
            for i, bit in enumerate(line):
                if bit == "1":
                    for py in range(y + j * unit, y + (j + 1) * unit):
                        for px in range(x + i * unit, x + (i + 1) * unit):
                            if 0 <= px < size and 0 <= py < size:
                                paint(px, py, WHITE)

    unit = max(1, round(size * .073))
    glyph("R", (size - 5 * unit) // 2, int(size * .084), unit)
    unit = max(1, round(size * .025))
    spacing = unit
    width = 4 * 5 * unit + 3 * spacing
    x = (size - width) // 2
    y = int(size * .673) + (int(size * .900) - int(size * .673) - 7 * unit) // 2
    for letter in "TEST":
        glyph(letter, x, y, unit)
        x += 6 * unit

    raw = b"".join(b"\x00" + rgba[y * size * 4:(y + 1) * size * 4] for y in range(size))
    def chunk(kind, payload):
        return (struct.pack(">I", len(payload)) + kind + payload +
                struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", header) +
            chunk(b"IDAT", zlib.compress(raw, 9)) +
            chunk(b"IEND", b""))


def main():
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    for name, size in (("stage-icon-192.png", 192),
                       ("stage-icon-512.png", 512),
                       ("stage-apple-touch-icon.png", 180)):
        (output / name).write_bytes(icon(size))


if __name__ == "__main__":
    main()
