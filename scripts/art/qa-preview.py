#!/usr/bin/env python3
"""Nearest-neighbor upscale preview for QA (@4x default)."""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", type=Path)
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("-o", "--out-dir", type=Path, default=None)
    args = ap.parse_args()
    for src in args.inputs:
        im = Image.open(src)
        out = im.resize((im.width * args.scale, im.height * args.scale), Image.Resampling.NEAREST)
        dest = (args.out_dir or src.parent) / f"{src.stem}@{args.scale}x{src.suffix}"
        if args.out_dir:
            args.out_dir.mkdir(parents=True, exist_ok=True)
        out.save(dest)
        print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
