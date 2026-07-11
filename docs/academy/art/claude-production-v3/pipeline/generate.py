#!/usr/bin/env python3
"""
Yomu Academy claude-production-v3 — spec-driven generator (the shared harness).

Every art worker calls THIS, never its own generator, so keying/pacing/style are
identical across the whole production. A worker's only creative job is to author
its group spec (subject text + which style field) and QA/regenerate rejects.

Usage:
  python3 docs/academy/art/claude-production-v3/pipeline/generate.py \
      --spec docs/academy/art/claude-production-v3/specs/<group>.json [--workers 3] [--force] [--only id1,id2]

Spec JSON:
  {"group":"character:rie",
   "assets":[
     {"id":"rie__bust__neutral","type":"bust","out":"characters/rie/rie__bust__neutral.webp",
      "subject":"Waist-up bust of Rie ...","seed":4218,"deliver":[1024,1536]},
     {"id":"rie__sprite__neutral__halfbody","type":"sprite",
      "out":"characters/rie/rie__sprite__neutral__halfbody.png","subject":"...","deliver_h":2048},
     {"id":"classroom__blue-hour__wide","type":"plate","w":1600,"h":900,
      "out":"environments/classroom/blue-hour-wide.webp","subject":"..."}
   ]}

`type` selects the pipeline + style suffix. `subject` is the per-asset text; the
shared style suffix is appended here. `out` is relative to the v3 public root.
"""
from __future__ import annotations
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import genlib
import style


def _np_default(o):
    """JSON encoder fallback: coerce numpy scalars/arrays to plain Python."""
    import numpy as _np
    if isinstance(o, (_np.floating,)):
        return float(o)
    if isinstance(o, (_np.integer,)):
        return int(o)
    if isinstance(o, _np.ndarray):
        return o.tolist()
    return str(o)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", ".."))
OUT_ROOT = os.path.join(ROOT, "public", "academy", "art", "claude-production-v3")
PROV_ROOT = os.path.join(ROOT, "docs", "academy", "art", "claude-production-v3", "provenance")

_print_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


def seed_for(asset: dict) -> int:
    if "seed" in asset:
        return int(asset["seed"])
    h = hashlib.sha256(asset["id"].encode()).hexdigest()
    return int(h[:8], 16) % 100000


def build_prompt(asset: dict) -> str:
    subj = asset["subject"].strip()
    t = asset["type"]
    key = asset.get("key", "green")
    if t == "sprite":
        suffix = style.sprite_style(key)
    elif t == "bust":
        suffix = style.bust_style()
    elif t == "plate":
        suffix = style.env_style()
    elif t == "event":
        suffix = style.event_style()
    elif t == "prop":
        suffix = style.prop_style(key)
    else:
        raise ValueError(f"unknown type {t}")
    return f"{subj} {suffix}"


def run_asset(asset: dict, force: bool) -> dict:
    out = os.path.join(OUT_ROOT, asset["out"])
    if os.path.exists(out) and not force:
        return {"id": asset["id"], "status": "skip", "file": asset["out"]}
    prompt = build_prompt(asset)
    seed = seed_for(asset)
    t = asset["type"]
    try:
        if t == "sprite":
            best_of = int(asset.get("best_of", 1))
            if best_of > 1 or "seeds" in asset:
                seeds = asset.get("seeds") or [seed + i * 1009 for i in range(best_of)]
                meta = genlib.make_sprite_best(prompt, seeds, out,
                                               gen_w=asset.get("gen_w", 768),
                                               gen_h=asset.get("gen_h", 1024),
                                               key=asset.get("key", "green"),
                                               deliver_h=asset.get("deliver_h"))
            else:
                meta = genlib.make_sprite(prompt, seed, out,
                                          gen_w=asset.get("gen_w", 768),
                                          gen_h=asset.get("gen_h", 1024),
                                          key=asset.get("key", "green"),
                                          deliver_h=asset.get("deliver_h"))
        elif t == "bust":
            meta = genlib.make_bust(prompt, seed, out,
                                    gen_w=asset.get("gen_w", 768),
                                    gen_h=asset.get("gen_h", 1024),
                                    deliver=tuple(asset["deliver"]) if asset.get("deliver") else None)
        elif t == "plate":
            meta = genlib.make_plate(prompt, seed, out, asset["w"], asset["h"])
        elif t == "event":
            meta = genlib.make_plate(prompt, seed, out, asset.get("w", 1600), asset.get("h", 900))
            meta["kind"] = "event"
        elif t == "prop":
            meta = genlib.make_sprite(prompt, seed, out,
                                      gen_w=asset.get("gen_w", 768),
                                      gen_h=asset.get("gen_h", 768),
                                      key=asset.get("key", "green"),
                                      deliver_h=asset.get("deliver_h"))
            meta["kind"] = "prop"
        meta.update({"id": asset["id"], "status": "ok",
                     "usage": asset.get("usage"), "runtime_home": asset.get("runtime_home")})
        # sibling meta
        mpath = os.path.splitext(out)[0] + ".meta.json"
        os.makedirs(os.path.dirname(mpath), exist_ok=True)
        with open(mpath, "w") as f:
            json.dump(meta, f, indent=2, default=_np_default)
        flag = ""
        if t in ("sprite", "prop"):
            a = meta.get("alpha", {})
            if a.get("edge_magenta_fringe", 0) > 0.05:
                flag = f"  ⚠ fringe={a['edge_magenta_fringe']}"
            if a.get("coverage", 1) < 0.06:
                flag += f"  ⚠ low-coverage={a.get('coverage')}"
        log(f"  ✓ {asset['id']} -> {meta['delivered_px']} {flag}")
        return {"id": asset["id"], "status": "ok", "file": asset["out"], "meta": meta}
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ {asset['id']} FAILED: {e}")
        return {"id": asset["id"], "status": "fail", "file": asset["out"], "error": str(e)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    with open(args.spec) as f:
        spec = json.load(f)
    assets = spec["assets"]
    if args.only:
        wanted = set(args.only.split(","))
        assets = [a for a in assets if a["id"] in wanted]

    group = spec.get("group", os.path.basename(args.spec))
    log(f"== generate {group}: {len(assets)} assets, {args.workers} workers ==")
    t0 = time.time()
    results = []
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(run_asset, a, args.force): a for a in assets}
        for fut in cf.as_completed(futs):
            results.append(fut.result())

    os.makedirs(PROV_ROOT, exist_ok=True)
    safe = group.replace(":", "__").replace("/", "__")
    with open(os.path.join(PROV_ROOT, f"{safe}.jsonl"), "w") as f:
        for r in results:
            f.write(json.dumps(r, default=_np_default) + "\n")

    ok = sum(r["status"] == "ok" for r in results)
    skip = sum(r["status"] == "skip" for r in results)
    fail = [r["id"] for r in results if r["status"] == "fail"]
    log(f"== {group}: ok={ok} skip={skip} fail={len(fail)} in {time.time()-t0:.0f}s ==")
    if fail:
        log("   failed: " + ", ".join(fail))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
