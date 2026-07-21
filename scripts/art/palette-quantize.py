#!/usr/bin/env python3
"""Map a PNG onto the locked Uplandin palette (docs/art/field-view-palette.gpl).

Usage:
  python3 scripts/art/palette-quantize.py input.png [-o output.png] [--alpha]
  python3 scripts/art/palette-quantize.py public/art/*.png --in-place --alpha

--alpha: near-white / near-black background → transparent (sprite sheets).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GPL = ROOT / "docs" / "art" / "field-view-palette.gpl"

# Forced accents that must survive quantize even if rare in the mockup extract.
ACCENTS = [
    (244, 117, 22),   # blaze orange
    (248, 222, 197),  # cream HUD
    (30, 35, 22),     # dark olive outline
    (255, 255, 255),  # pure white (dog coat highlights)
    (0, 0, 0),        # pure black
]


def load_gpl(path: Path) -> list[tuple[int, int, int]]:
    colors: list[tuple[int, int, int]] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("GIMP") or line.startswith("Name") or line.startswith("Columns"):
            continue
        m = re.match(r"(\d+)\s+(\d+)\s+(\d+)", line)
        if m:
            colors.append((int(m.group(1)), int(m.group(2)), int(m.group(3))))
    for c in ACCENTS:
        if c not in colors:
            colors.append(c)
    return colors


def nearest(c: tuple[int, int, int], palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    r, g, b = c
    best = palette[0]
    best_d = 1e18
    for pr, pg, pb in palette:
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < best_d:
            best_d = d
            best = (pr, pg, pb)
    return best


def quantize(im: Image.Image, palette: list[tuple[int, int, int]], alpha: bool) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if alpha and a < 16:
                px[x, y] = (0, 0, 0, 0)
                continue
            if alpha and r >= 248 and g >= 248 and b >= 248:
                px[x, y] = (0, 0, 0, 0)
                continue
            if a < 255:
                # keep partial alpha but snap RGB
                nr, ng, nb = nearest((r, g, b), palette)
                px[x, y] = (nr, ng, nb, a)
            else:
                nr, ng, nb = nearest((r, g, b), palette)
                px[x, y] = (nr, ng, nb, 255)
    return im


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("inputs", nargs="+", type=Path)
    ap.add_argument("-o", "--output", type=Path, help="single-input output path")
    ap.add_argument("--in-place", action="store_true")
    ap.add_argument("--alpha", action="store_true", help="key near-white to transparent")
    ap.add_argument("--gpl", type=Path, default=DEFAULT_GPL)
    args = ap.parse_args()
    palette = load_gpl(args.gpl)
    if not palette:
        print("empty palette", file=sys.stderr)
        return 1
    for src in args.inputs:
        im = Image.open(src)
        out = quantize(im, palette, args.alpha)
        if args.output and len(args.inputs) == 1:
            dest = args.output
        elif args.in_place:
            dest = src
        else:
            dest = src.with_name(src.stem + "-pal" + src.suffix)
        out.save(dest)
        print(f"wrote {dest} ({out.size[0]}x{out.size[1]}, {len(palette)} colors)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
