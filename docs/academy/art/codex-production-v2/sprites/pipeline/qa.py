#!/usr/bin/env python3
"""Technical QA and contact-sheet builder for v2 sprites."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[6]
PUBLIC = ROOT / "public/academy/art/codex-production-v2/sprites"
DOCS = ROOT / "docs/academy/art/codex-production-v2/sprites"
MANIFEST = DOCS / "SPRITE-MANIFEST.json"
SHEET = DOCS / "CONTACT-SHEET.png"


def ahash(image: Image.Image) -> str:
    gray = image.convert("L").resize((16, 16), Image.Resampling.LANCZOS)
    arr = np.asarray(gray, dtype=np.float32)
    return "".join("1" if value >= arr.mean() else "0" for value in arr.ravel())


def hamming(left: str, right: str) -> int:
    return sum(a != b for a, b in zip(left, right))


def inspect(path: Path) -> dict:
    image = Image.open(path)
    arr = np.asarray(image.convert("RGBA"))
    alpha = arr[..., 3]
    nonzero = alpha > 8
    coverage = float(nonzero.mean())
    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    edge = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    semi = (edge[:, 3] > 8) & (edge[:, 3] < 245)
    green_fringe = float(((edge[:, 1] - np.maximum(edge[:, 0], edge[:, 2]) > 55) & semi).mean()) if semi.any() else 0.0
    return {
        "file": str(path.relative_to(ROOT)),
        "character": path.parent.name,
        "expression": path.stem.replace(f"{path.parent.name}__sprite__", "").replace("__halfbody__v2", ""),
        "mode": image.mode,
        "width": image.width,
        "height": image.height,
        "coverage": round(coverage, 5),
        "corner_alpha": [int(x) for x in corners],
        "edge_green_fringe": round(green_fringe, 5),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "ahash": ahash(image),
        "flags": [],
    }


def checker(size: tuple[int, int], cell: int = 24) -> Image.Image:
    image = Image.new("RGB", size, "#263244")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell, y + cell), fill="#34445c")
    return image


def build_sheet(items: list[dict]) -> None:
    by_char = {}
    for item in items:
        by_char.setdefault(item["character"], []).append(item)
    chars = sorted(by_char)
    cols = 7
    cell_w, cell_h = 220, 360
    rows = (len(chars) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "#101722")
    font = ImageFont.load_default()
    for index, character in enumerate(chars):
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        block = checker((cell_w, cell_h))
        variants = sorted(by_char[character], key=lambda item: (item["expression"], item["file"]))
        # Show a neutral first, then up to two contrasting expressions.
        chosen = sorted(variants, key=lambda item: (item["expression"] not in {"neutral", "happy", "concerned"}, item["expression"]))[:3]
        for slot, item in enumerate(chosen):
            image = Image.open(ROOT / item["file"]).convert("RGBA")
            image.thumbnail((cell_w // 3 - 8, cell_h - 70), Image.Resampling.LANCZOS)
            px = slot * (cell_w // 3) + (cell_w // 3 - image.width) // 2
            py = 28 + (cell_h - 70 - image.height)
            block.paste(image, (px, py), image)
        draw = ImageDraw.Draw(block)
        draw.rectangle((0, 0, cell_w - 1, cell_h - 1), outline="#7ed6b1", width=2)
        draw.text((8, 8), character, fill="#f2eadb", font=font)
        sheet.paste(block, (x, y))
    DOCS.mkdir(parents=True, exist_ok=True)
    sheet.save(SHEET, "PNG")


def main() -> int:
    files = sorted(PUBLIC.glob("*/**/*__sprite__*__halfbody__v2.png"))
    items = [inspect(path) for path in files]
    seen_sha = {}
    seen_hashes = []
    for item in items:
        if item["mode"] != "RGBA":
            item["flags"].append("not-rgba")
        if item["height"] < 1400:
            item["flags"].append("height-under-1400")
        if max(item["corner_alpha"]) > 8:
            item["flags"].append("opaque-corner")
        if not 0.06 <= item["coverage"] <= 0.9:
            item["flags"].append("unhealthy-alpha-coverage")
        if item["edge_green_fringe"] > 0.05:
            item["flags"].append("green-fringe")
        if item["sha256"] in seen_sha:
            item["flags"].append(f"exact-duplicate:{seen_sha[item['sha256']]}")
        else:
            seen_sha[item["sha256"]] = item["file"]
        for previous in seen_hashes:
            if previous["character"] == item["character"] and hamming(previous["ahash"], item["ahash"]) < 8:
                item["flags"].append(f"near-duplicate:{previous['file']}")
                break
        seen_hashes.append(item)

    manifest = {
        "project": "Yomu Academy sprite production v2",
        "assetRoot": "public/academy/art/codex-production-v2/sprites",
        "count": len(items),
        "passed": sum(not item["flags"] for item in items),
        "flagged": sum(bool(item["flags"]) for item in items),
        "sprites": items,
    }
    DOCS.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    build_sheet(items)
    for item in items:
        if item["flags"]:
            print("FLAG", item["file"], ", ".join(item["flags"]))
    print(f"sprites={len(items)} passed={manifest['passed']} flagged={manifest['flagged']}")
    return 1 if manifest["flagged"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
