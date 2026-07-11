#!/usr/bin/env python3
"""Assemble a labelled contact sheet from a glob of assets (for director review).

Usage:
  python3 .../build_contact_sheet.py --glob "characters/rie/*.png" \
      --out contact-sheets/rie.webp --cols 5 --bg checker
Labels come from filenames (recorded in image only for review sheets, never in
shipped art). Transparent assets render over a checker so alpha is inspectable.
"""
from __future__ import annotations
import argparse
import glob
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
OUT_ROOT = os.path.join(ROOT, "public", "academy", "art", "claude-production-v3")


def checker(w: int, h: int, s: int = 16) -> Image.Image:
    im = Image.new("RGB", (w, h), (210, 210, 214))
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x // s + y // s) % 2:
                d.rectangle([x, y, x + s, y + s], fill=(176, 176, 182))
    return im


def font(sz: int):
    for p in ("/System/Library/Fonts/Supplemental/Arial.ttf",
              "/System/Library/Fonts/Helvetica.ttc"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--glob", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--cell", type=int, default=360)
    ap.add_argument("--bg", choices=["checker", "ink", "white"], default="checker")
    ap.add_argument("--title", default="")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(OUT_ROOT, args.glob)))
    paths = [p for p in paths if not p.endswith(".meta.json")]
    if not paths:
        print("no files match", args.glob)
        return 1

    cell, pad, lab = args.cell, 14, 26
    cols = args.cols
    rows = (len(paths) + cols - 1) // cols
    head = 46 if args.title else 0
    W = cols * (cell + pad) + pad
    H = head + rows * (cell + lab + pad) + pad
    base = {"ink": (20, 34, 60), "white": (250, 250, 248)}.get(args.bg)
    sheet = Image.new("RGB", (W, H), base or (32, 32, 36))
    d = ImageDraw.Draw(sheet)
    if args.title:
        d.text((pad, 12), args.title, fill=(240, 240, 240), font=font(24))

    for i, p in enumerate(paths):
        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = head + pad + r * (cell + lab + pad)
        try:
            im = Image.open(p).convert("RGBA")
        except Exception:
            continue
        im.thumbnail((cell, cell), Image.Resampling.LANCZOS)
        tile = checker(cell, cell) if args.bg == "checker" else Image.new("RGB", (cell, cell), base)
        tile = tile.convert("RGBA")
        ox, oy = (cell - im.width) // 2, (cell - im.height) // 2
        tile.alpha_composite(im, (ox, oy))
        sheet.paste(tile.convert("RGB"), (x, y))
        name = os.path.splitext(os.path.basename(p))[0]
        col = (235, 235, 235) if args.bg != "white" else (30, 30, 30)
        d.text((x, y + cell + 4), name[:44], fill=col, font=font(13))

    out = os.path.join(OUT_ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out, "WEBP", quality=88, method=6)
    print(f"contact sheet -> {args.out}  ({len(paths)} cells, {sheet.size})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
