#!/usr/bin/env python3
"""Generate macOS dock icon (squircle-masked PNG) and .icns from assets/icon.png."""

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).parent.parent
SRC = REPO_ROOT / "assets" / "icon.png"
DOCK_OUT = REPO_ROOT / "assets" / "icon-dock.png"
ICNS_OUT = REPO_ROOT / "assets" / "icon.icns"
ICONSET_DIR = REPO_ROOT / "assets" / "icon.iconset"

CANVAS = 1024
ARTWORK_SCALE = 0.88
SQUIRCLE_EXPONENT = 5
SQUIRCLE_RADIUS_RATIO = 0.98


def sample_bg_color(img: Image.Image) -> tuple[int, int, int]:
    """Sample background color from the top-left corner pixel."""
    rgb = img.convert("RGB")
    return rgb.getpixel((0, 0))


def make_squircle_mask(size: int, exponent: float, radius_ratio: float) -> Image.Image:
    """
    Build a grayscale squircle (superellipse) mask at `size x size`.
    The superellipse equation: |x/a|^n + |y/b|^n <= 1
    """
    mask = Image.new("L", (size, size), 0)
    pixels = mask.load()
    half = size / 2.0
    r = half * radius_ratio
    for y in range(size):
        for x in range(size):
            nx = (x - half + 0.5) / r
            ny = (y - half + 0.5) / r
            val = abs(nx) ** exponent + abs(ny) ** exponent
            pixels[x, y] = 255 if val <= 1.0 else 0
    return mask


def make_dock_icon(src: Path, dst: Path) -> None:
    src_img = Image.open(src).convert("RGBA")
    src_w, src_h = src_img.size

    bg_color = sample_bg_color(src_img)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), bg_color + (255,))

    artwork_size = int(CANVAS * ARTWORK_SCALE)
    scaled = src_img.resize((artwork_size, artwork_size), Image.LANCZOS)

    offset = (CANVAS - artwork_size) // 2
    canvas.paste(scaled, (offset, offset), scaled)

    mask = make_squircle_mask(CANVAS, SQUIRCLE_EXPONENT, SQUIRCLE_RADIUS_RATIO)

    result = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    result.paste(canvas, (0, 0), mask)

    result.save(dst, "PNG")
    print(f"Saved dock icon → {dst}")


def make_icns(src: Path, icns_out: Path, iconset_dir: Path) -> None:
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True)

    sizes = [16, 32, 64, 128, 256, 512, 1024]
    src_img = Image.open(src).convert("RGBA")

    for size in sizes:
        scaled = src_img.resize((size, size), Image.LANCZOS)
        # 1x file
        scaled.save(iconset_dir / f"icon_{size}x{size}.png")
        # 2x file (retina) — only if double size is in our list or ≤ 512
        retina_size = size * 2
        if retina_size <= 1024:
            retina = src_img.resize((retina_size, retina_size), Image.LANCZOS)
            retina.save(iconset_dir / f"icon_{size}x{size}@2x.png")

    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_out)],
        check=True,
    )
    shutil.rmtree(iconset_dir)
    print(f"Saved icns → {icns_out}")


if __name__ == "__main__":
    if not SRC.exists():
        print(f"ERROR: source image not found at {SRC}", file=sys.stderr)
        sys.exit(1)

    make_dock_icon(SRC, DOCK_OUT)
    make_icns(SRC, ICNS_OUT, ICONSET_DIR)
    print("Done.")
