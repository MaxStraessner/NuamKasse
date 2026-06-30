from __future__ import annotations

import struct
import zlib
from pathlib import Path


PUBLIC_DIR = Path(__file__).resolve().parents[1] / "public"
BACKGROUND = (245, 247, 243, 255)
INK = (39, 62, 52, 255)
ACCENT = (218, 169, 83, 255)


def write_png(path: Path, size: int, maskable: bool = False) -> None:
    padding = int(size * (0.22 if maskable else 0.14))
    radius = int(size * 0.2)
    center = size / 2
    mark_radius = size * (0.23 if maskable else 0.27)
    rows = []

    for y in range(size):
        row = bytearray()
        for x in range(size):
            color = BACKGROUND
            in_card = (
                padding <= x < size - padding
                and padding <= y < size - padding
                and rounded_rect_contains(x, y, padding, padding, size - padding, size - padding, radius)
            )
            if in_card:
                color = INK
            dx = x - center
            dy = y - center
            if dx * dx + dy * dy <= mark_radius * mark_radius:
                color = ACCENT
            if abs(dx) < size * 0.045 and abs(dy) < size * 0.17:
                color = BACKGROUND
            if abs(dy) < size * 0.045 and abs(dx) < size * 0.17:
                color = BACKGROUND
            row.extend(color)
        rows.append(b"\x00" + bytes(row))

    raw = b"".join(rows)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(raw, 9))
        + png_chunk(b"IEND", b"")
    )


def rounded_rect_contains(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius


def png_chunk(kind: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)


def write_svg() -> None:
    PUBLIC_DIR.joinpath("favicon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#f5f7f3"/>
  <rect x="78" y="78" width="356" height="356" rx="96" fill="#273e34"/>
  <circle cx="256" cy="256" r="126" fill="#daa953"/>
  <path d="M256 164v184M164 256h184" stroke="#f5f7f3" stroke-width="44" stroke-linecap="round"/>
</svg>
""",
        encoding="utf-8",
    )


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    write_svg()
    write_png(PUBLIC_DIR / "favicon.png", 64)
    write_png(PUBLIC_DIR / "icon-192.png", 192)
    write_png(PUBLIC_DIR / "icon-512.png", 512)
    write_png(PUBLIC_DIR / "icon-maskable-192.png", 192, maskable=True)
    write_png(PUBLIC_DIR / "icon-maskable-512.png", 512, maskable=True)
    write_png(PUBLIC_DIR / "apple-touch-icon.png", 180)


if __name__ == "__main__":
    main()
