#!/usr/bin/env python3
"""
Aggregate every claude-production-v3 asset's sibling meta into one manifest,
with alpha health, near-duplicate detection, and a per-group index.

Usage:  python3 build_manifest.py
Writes: docs/academy/art/claude-production-v3/ASSET-MANIFEST.json
"""
from __future__ import annotations
import glob
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
PUB = os.path.join(ROOT, "public", "academy", "art", "claude-production-v3")
OUT = os.path.join(ROOT, "docs", "academy", "art", "claude-production-v3", "ASSET-MANIFEST.json")


def ahash(p, n=16):
    try:
        g = np.asarray(Image.open(p).convert("L").resize((n, n), Image.Resampling.LANCZOS), np.float32)
        return (g > g.mean()).flatten()
    except Exception:
        return None


def group_of(rel: str) -> str:
    parts = rel.split("/")
    if parts[0] == "characters":
        return f"character:{parts[1]}"
    return parts[0]


def main() -> int:
    metas = sorted(p for p in glob.glob(os.path.join(PUB, "**", "*.meta.json"), recursive=True)
                   if "/_raw/" not in p)
    assets, hashes = [], []
    for mp in metas:
        try:
            m = json.load(open(mp))
        except Exception:
            continue
        rel = os.path.relpath(os.path.splitext(mp)[0], PUB)
        img = os.path.join(PUB, m.get("file", "")) if os.path.isabs(m.get("file", "")) is False else m["file"]
        # m["file"] was stored as the absolute out path; recompute rel to PUB
        fp = m.get("file", "")
        relfile = os.path.relpath(fp, PUB) if os.path.exists(fp) else rel
        entry = {
            "id": m.get("id"), "group": group_of(relfile), "kind": m.get("kind"),
            "file": relfile, "delivered_px": m.get("delivered_px"),
            "native_px": m.get("native_px"), "upscaled": m.get("upscaled"),
            "key": m.get("key"), "seed": m.get("seed"),
            "alpha": m.get("alpha"), "usage": m.get("usage"),
            "runtime_home": m.get("runtime_home"),
            "origin": m.get("origin"), "tool": m.get("tool"),
        }
        assets.append(entry)
        fpath = os.path.join(PUB, relfile)
        h = ahash(fpath)
        if h is not None:
            hashes.append((relfile, h))

    # near-duplicate detection (Hamming <= 10 over 256-bit ahash)
    dups = []
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            d = int(np.count_nonzero(hashes[i][1] != hashes[j][1]))
            if d <= 10:
                dups.append({"a": hashes[i][0], "b": hashes[j][0], "hamming": d})

    # alpha-fringe / low-coverage flags
    flags = []
    for a in assets:
        al = a.get("alpha") or {}
        if al.get("edge_key_fringe", 0) and al["edge_key_fringe"] > 0.05:
            flags.append({"id": a["id"], "issue": "edge_fringe", "value": al["edge_key_fringe"]})
        if 0 < (al.get("coverage") or 1) < 0.08:
            flags.append({"id": a["id"], "issue": "low_coverage", "value": al.get("coverage")})

    groups = {}
    for a in assets:
        groups.setdefault(a["group"], 0)
        groups[a["group"]] += 1

    manifest = {
        "project": "Yomu Academy — claude-production-v3",
        "assetRoot": "public/academy/art/claude-production-v3",
        "generator": "Pollinations flux (text-to-image) + border-flood chroma keyer",
        "count": len(assets),
        "byGroup": dict(sorted(groups.items())),
        "flags": flags,
        "nearDuplicates": dups,
        "assets": sorted(assets, key=lambda a: (a["group"], a.get("id") or "")),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"manifest: {len(assets)} assets, {len(groups)} groups, "
          f"{len(flags)} flags, {len(dups)} near-dup pairs -> ASSET-MANIFEST.json")
    for g, n in sorted(groups.items()):
        print(f"  {g:28s} {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
