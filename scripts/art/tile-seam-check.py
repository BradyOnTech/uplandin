#!/usr/bin/env python3
"""2×2 / 3×3 tile seam check. Exit 1 if horizontal/vertical edge mismatch is high.

Usage:
  python3 scripts/art/tile-seam-check.py public/art/tile-southern-plains-grass-open.png
  python3 scripts/art/tile-seam-check.py path/to/tile.png --threshold 45
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


def edge_delta(im: Image.Image) -> tuple[float, float]:
    """Mean absolute RGB delta along left↔right and top↔bottom edges."""
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    hr = 0.0
    for y in range(h):
        l, r = px[0, y], px[w - 1, y]
        hr += abs(l[0] - r[0]) + abs(l[1] - r[1]) + abs(l[2] - r[2])
    hr /= max(1, h * 3)
    vr = 0.0
    for x in range(w):
        t, b = px[x, 0], px[x, h - 1]
        vr += abs(t[0] - b[0]) + abs(t[1] - b[1]) + abs(t[2] - b[2])
    vr /= max(1, w * 3)
    return hr, vr


def composite(im: Image.Image, n: int = 2) -> Image.Image:
    w, h = im.size
    out = Image.new("RGB", (w * n, h * n))
    for y in range(n):
        for x in range(n):
            out.paste(im.convert("RGB"), (x * w, y * h))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("tile", type=Path)
    ap.add_argument("--threshold", type=float, default=40.0, help="max mean channel delta on wrap edges")
    ap.add_argument("--preview", type=Path, help="write 2×2@8x preview PNG")
    args = ap.parse_args()
    im = Image.open(args.tile)
    hr, vr = edge_delta(im)
    print(f"{args.tile}: h-edge={hr:.1f} v-edge={vr:.1f} threshold={args.threshold}")
    if args.preview:
        prev = composite(im, 2).resize((im.width * 16, im.height * 16), Image.Resampling.NEAREST)
        prev.save(args.preview)
        print(f"preview {args.preview}")
    if hr > args.threshold or vr > args.threshold:
        print("FAIL: tile edges do not wrap cleanly", file=sys.stderr)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
