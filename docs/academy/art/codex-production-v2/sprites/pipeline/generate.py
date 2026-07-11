#!/usr/bin/env python3
"""Generate the v2 runtime sprite matrix into the v2-owned public folder.

The shared v3 style and border-flood keyer are imported read-only. This driver
owns no runtime code and never writes into the old art lanes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
SOURCE_MAP = ROOT / "public/academy/art/codex-production-v2/sprites/source-map.json"
OUT_ROOT = ROOT / "public/academy/art/codex-production-v2/sprites"
PROV_ROOT = ROOT / "docs/academy/art/codex-production-v2/sprites/provenance"
V3_PIPELINE = ROOT / "docs/academy/art/claude-production-v3/pipeline"
sys.path.insert(0, str(V3_PIPELINE))
import genlib  # noqa: E402
import style  # noqa: E402


EXPRESSIONS = {
    "neutral": "relaxed neutral presence, faint warm smile, alive eyes toward the viewer",
    "happy": "open genuine happy smile, warm bright eyes and lifted cheeks",
    "laughing": "laughing warmly, eyes crinkled, head tilted slightly back",
    "thinking": "thinking, eyes drifting aside, one brow active and a considering mouth",
    "surprised": "pleasantly surprised, eyes widened, brows up, mouth slightly open",
    "concerned": "gently concerned, brows drawn softly together, caring worried mouth",
    "determined": "quietly determined, focused steady eyes and a firm mouth",
    "embarrassed": "shy flushed half-smile, eyes glancing away and shoulders drawn in",
    "speaking": "mid-sentence speaking, mouth open naturally and one hand gesturing",
    "listening": "listening attentively, receptive half-smile and head tilted slightly",
}


def load_map() -> dict:
    with SOURCE_MAP.open(encoding="utf-8") as fh:
        return json.load(fh)


def stable_seed(character: dict, expression: str) -> int:
    raw = f"codex-v2:{character['id']}:{expression}:{character['seed']}".encode()
    return int(hashlib.sha256(raw).hexdigest()[:8], 16) % 100000


def prompt_for(character: dict, expression: str) -> str:
    return (
        f"Half-body visual-novel stage sprite of {character['identity']}. "
        f"Wardrobe: {character['wardrobe']}. "
        f"Expression and acting: {EXPRESSIONS[expression]}. "
        "Natural relaxed posture, empty hands, head to mid-thigh, centred, "
        "front three-quarter view, clear silhouette, no prop. "
        f"Identity lock: {character['lock']}. "
        f"{style.sprite_style('green')}"
    )


def run_one(character: dict, expression: str, force: bool, best_of: int) -> dict:
    cid = character["id"]
    asset_id = f"{cid}__sprite__{expression}__halfbody__v2"
    out = OUT_ROOT / cid / f"{asset_id}.png"
    meta_path = out.with_suffix(".meta.json")
    if out.exists() and meta_path.exists() and not force:
        return {"id": asset_id, "status": "skip", "file": str(out.relative_to(ROOT))}

    prompt = prompt_for(character, expression)
    seed = stable_seed(character, expression)
    try:
        seeds = [seed + index * 1009 for index in range(max(1, best_of))]
        meta = genlib.make_sprite_best(
            prompt,
            seeds,
            str(out),
            gen_w=768,
            gen_h=1024,
            key="green",
            deliver_h=1600,
        )
        meta.update({
            "id": asset_id,
            "character": cid,
            "expression": expression,
            "status": "ok",
            "version": 2,
            "source_map": str(SOURCE_MAP.relative_to(ROOT)),
            "runtime_wiring": "deferred until manifest and contact-sheet approval",
        })
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        return {"id": asset_id, "status": "ok", "file": str(out.relative_to(ROOT)), "meta": meta}
    except Exception as exc:  # noqa: BLE001
        return {"id": asset_id, "status": "fail", "file": str(out.relative_to(ROOT)), "error": str(exc)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters", default="", help="comma-separated ids; default all")
    parser.add_argument("--expressions", default="neutral,happy,thinking")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--best-of", type=int, default=1, choices=(1, 2, 3))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    data = load_map()
    wanted_chars = {x.strip() for x in args.characters.split(",") if x.strip()}
    wanted_exprs = [x.strip() for x in args.expressions.split(",") if x.strip()]
    chars = [c for c in data["characters"] if not wanted_chars or c["id"] in wanted_chars]
    unknown = wanted_chars - {c["id"] for c in chars}
    if unknown:
        raise SystemExit(f"Unknown character ids: {', '.join(sorted(unknown))}")
    unknown_exprs = set(wanted_exprs) - set(EXPRESSIONS)
    if unknown_exprs:
        raise SystemExit(f"Unknown expressions: {', '.join(sorted(unknown_exprs))}")

    jobs = [(c, e) for c in chars for e in wanted_exprs]
    print(f"v2 sprites: {len(jobs)} jobs, {len(chars)} characters, {len(wanted_exprs)} expressions", flush=True)
    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(run_one, c, e, args.force, args.best_of) for c, e in jobs]
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            mark = "OK" if result["status"] in {"ok", "skip"} else "FAIL"
            print(f"[{mark}] {result['id']}", flush=True)

    PROV_ROOT.mkdir(parents=True, exist_ok=True)
    prov = PROV_ROOT / "batch.jsonl"
    with prov.open("w", encoding="utf-8") as fh:
        for result in sorted(results, key=lambda x: x["id"]):
            fh.write(json.dumps(result, ensure_ascii=True) + "\n")
    failed = [r for r in results if r["status"] == "fail"]
    print(f"complete: ok={len(results) - len(failed)}, failed={len(failed)}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
