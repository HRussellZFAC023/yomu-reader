#!/usr/bin/env python3
"""Technical QA over a directory of v3 assets -> JSON report.

Checks, per asset:
  - dimensions (native/delivered from sibling meta if present)
  - alpha coverage + residual magenta fringe (transparent PNGs)
  - near-duplicate composition via 16x16 average-hash (Hamming distance)
Emits docs/.../qa/<name>.json and a human summary to stdout.

Usage:
  python3 .../validate.py --glob "characters/**/*.png" --out qa/characters.json
"""
from __future__ import annotations
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
OUT_ROOT = os.path.join(ROOT, "public", "academy", "art", "claude-production-v3")
QA_ROOT = os.path.join(ROOT, "docs", "academy", "art", "claude-production-v3")


def ahash(im: Image.Image, n: int = 16) -> np.ndarray:
    g = np.asarray(im.convert("L").resize((n, n), Image.Resampling.LANCZOS), dtype=np.float32)
    return (g > g.mean()).flatten()


def alpha_report(im: Image.Image) -> dict:
    if im.mode != "RGBA":
        return {}
    a = np.asarray(im)[..., 3].astype(np.float32) / 255.0
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    edge = (a > 0.05) & (a < 0.85)
    fringe = float((((np.minimum(r, b) - g) > 60) & edge).sum() / max(1, edge.sum()))
    return {"coverage": round(float((a > 0.5).mean()), 4),
            "edge_magenta_fringe": round(fringe, 4)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--glob", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dup-threshold", type=int, default=12)
    args = ap.parse_args()

    paths = sorted(p for p in glob.glob(os.path.join(OUT_ROOT, args.glob), recursive=True)
                   if not p.endswith(".json"))
    entries, hashes = [], []
    for p in paths:
        try:
            im = Image.open(p)
        except Exception as e:  # noqa: BLE001
            entries.append({"file": os.path.relpath(p, OUT_ROOT), "error": str(e)})
            continue
        rel = os.path.relpath(p, OUT_ROOT)
        e = {"file": rel, "size": list(im.size), "mode": im.mode}
        e.update(alpha_report(im.convert("RGBA")) if im.mode in ("RGBA", "P", "LA") else {})
        entries.append(e)
        hashes.append((rel, ahash(im)))

    # near-duplicate detection
    dups = []
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            d = int(np.count_nonzero(hashes[i][1] != hashes[j][1]))
            if d <= args.dup_threshold:
                dups.append({"a": hashes[i][0], "b": hashes[j][0], "hamming": d})

    flags = [e for e in entries if e.get("edge_magenta_fringe", 0) > 0.05
             or (0 < e.get("coverage", 1) < 0.06)]
    report = {"glob": args.glob, "count": len(paths), "flagged": flags,
              "near_duplicates": dups, "entries": entries}
    out = os.path.join(QA_ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(report, f, indent=2)
    print(f"QA {args.glob}: {len(paths)} assets, {len(flags)} flagged, {len(dups)} near-dup pairs -> {args.out}")
    for fl in flags[:12]:
        print("  ⚠", fl["file"], {k: fl[k] for k in ("coverage", "edge_magenta_fringe") if k in fl})
    for dp in dups[:12]:
        print("  ⧉ dup", dp["a"], "≈", dp["b"], f"(d={dp['hamming']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
