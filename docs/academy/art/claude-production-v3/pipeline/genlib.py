"""
Yomu Academy claude-production-v3 — core generation library.

Shared by every art worker. Guarantees identical fetch/retry, identical magenta
keying + despill (fixes the v1 pink-halo bug), identical validation, and honest
native->delivery upscaling recorded in metadata.

Pipeline (text-to-image): Pollinations flux HTTP endpoint (free, no key).
Flux caps the long edge near ~1024px, so we generate at model-native size and
LANCZOS-upscale to the delivery master, flagging `upscaled: true` in metadata.
"""
from __future__ import annotations
import io
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MAGENTA = (255, 0, 255)
KEY_COLORS = {"green": (0, 255, 0), "magenta": (255, 0, 255), "blue": (0, 0, 255)}

# Pollinations' anonymous tier rate-limits concurrent/rapid requests hard (429).
# A single global gate enforces a minimum spacing between request *launches* so
# that even with a few worker threads we stay under the limit. Tunable via env.
_MIN_INTERVAL = float(os.environ.get("YOMU_GEN_INTERVAL", "5.5"))
_gate = threading.Lock()
_last = [0.0]


def _pace() -> None:
    with _gate:
        wait = _MIN_INTERVAL - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()


# --------------------------------------------------------------------------- net
def fetch(prompt: str, width: int, height: int, *, model: str = "flux",
          seed: int = 0, retries: int = 6, timeout: int = 200) -> Image.Image:
    """Fetch one image from Pollinations with global pacing + 429-aware backoff.

    Raises RuntimeError after `retries` failures (429/500s, timeouts, or an
    image that decodes to a near-uniform field = a failed/blocked generation)."""
    url = (f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}"
           f"?width={width}&height={height}&model={model}&nologo=true&seed={seed}")
    last = None
    for attempt in range(1, retries + 1):
        try:
            _pace()
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            im = Image.open(io.BytesIO(data)).convert("RGB")
            arr = np.asarray(im, dtype=np.float32)
            if arr.std() < 6.0:  # near-uniform => bad/blocked generation
                raise RuntimeError(f"near-uniform image (std={arr.std():.1f})")
            return im
        except Exception as e:  # noqa: BLE001 — retry any transient failure
            last = e
            is_429 = isinstance(e, urllib.error.HTTPError) and e.code == 429
            if attempt < retries:
                # 429 needs a long cool-off; other errors ramp gently.
                time.sleep((20 + attempt * 18) if is_429 else min(4 + attempt * 3, 20))
    raise RuntimeError(f"fetch failed after {retries} tries: {last}")


# ---------------------------------------------------------------------- keying
def key_chroma(im: Image.Image, key: str = "green", *, tol: float = 110.0,
               feather: float = 26.0, despill: float = 0.7) -> Image.Image:
    """Vectorized chroma-key -> RGBA with feathered alpha + per-channel despill.

    Default GREEN: pale warm anime skin and cream fabric are far from green, so a
    generous key never eats the face (the fatal flaw of a magenta key, where
    pale skin ~= desaturated magenta). Use `magenta` (or `blue`) only when the
    subject/prop is green-dominant. Despill removes the key-colour cast on kept
    edges; it is skin-safe because skin is not key-channel-dominant."""
    kr, kg, kb = KEY_COLORS[key]
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dist = np.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2)
    alpha = np.clip((dist - tol) / feather, 0.0, 1.0)

    r2, g2, b2 = r.copy(), g.copy(), b.copy()
    if key == "green":  # spill = green above the red/blue average
        ex = np.clip(g - np.maximum(r, b), 0.0, 255.0) * despill
        g2 = np.clip(g - ex, 0, 255)
    elif key == "magenta":
        ex = np.clip(np.minimum(r, b) - g, 0.0, 255.0) * despill
        r2 = np.clip(r - ex, 0, 255)
        b2 = np.clip(b - ex, 0, 255)
    elif key == "blue":
        ex = np.clip(b - np.maximum(r, g), 0.0, 255.0) * despill
        b2 = np.clip(b - ex, 0, 255)

    out = np.dstack([r2, g2, b2, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def key_magenta_generic(im: Image.Image, key=(255, 0, 255), *, tol: float = 70.0,
                        feather: float = 26.0) -> Image.Image:
    """Chroma-key an arbitrary uniform background colour -> RGBA (fallback path).

    Used only when flux ignored magenta and painted a safe, uniform, non-skin
    backdrop. No despill (the cast toward a neutral backdrop is negligible)."""
    kr, kg, kb = key
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dist = np.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2)
    alpha = np.clip((dist - tol) / feather, 0.0, 1.0)
    out = np.dstack([r, g, b, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def key_border_flood(im: Image.Image, *, thresh: int = 76, feather: float = 1.4
                     ) -> tuple[Image.Image, dict]:
    """Border-connected background removal — the robust keyer.

    Floods inward from dense border seeds using PIL's per-seed colour tolerance
    (`thresh` = sum of abs channel diffs), so backdrop pixel-grain is absorbed
    locally while the flood stops at the figure silhouette. Only background
    reachable from the frame edge becomes transparent, so an interior skin/face
    island is NEVER keyed even when its colour is close to the backdrop (the
    failure that defeats every global colour key). Works for any uniform-ish
    backdrop flux paints (chroma green/magenta OR a muted studio grey).

    Returns (rgba, info). Raises if the border looks like a painted scene, not a
    backdrop (subject not isolated -> reject and regenerate)."""
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]], axis=0)
    bgmed = np.median(border, axis=0)              # robust to figure touching an edge
    seed_tol = 58.0                                # "is this border pixel backdrop?"
    bg_like = np.abs(border - bgmed).sum(1) < seed_tol
    bg_frac = float(bg_like.mean())
    if bg_frac < 0.25:                             # subject fills frame / no backdrop
        raise RuntimeError(f"no backdrop (bg_frac={bg_frac:.2f}) — subject not isolated, reject")
    bg = border[bg_like].mean(0)                   # refined backdrop colour
    sat = float(bg.max() - bg.min())
    sentinel = (11, 254, 7)                        # unlikely exact colour post-fill
    work = im.convert("RGB").copy()
    step = 5
    seeds = ([(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)]
             + [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)])
    wa = np.asarray(work)
    for (x, y) in seeds:                           # seed ONLY true backdrop border pixels
        px = wa[y, x]
        if tuple(px) != sentinel and float(np.abs(px.astype(np.float32) - bg).sum()) < seed_tol:
            ImageDraw.floodfill(work, (x, y), sentinel, thresh=thresh)
            wa = np.asarray(work)
    connected = (wa[..., 0] == sentinel[0]) & (wa[..., 1] == sentinel[1]) & (wa[..., 2] == sentinel[2])

    alpha = np.where(connected, 0.0, 255.0).astype(np.float32)
    rgba = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
    if feather:
        a = rgba.split()[3].filter(ImageFilter.GaussianBlur(feather))
        rgba.putalpha(a)
    dom_excess = float(bg.max() - (bg.sum() - bg.max()) / 2)
    if dom_excess > 12:                            # colored backdrop -> despill its cast
        rgba = _despill_toward_neutral(rgba, bg)
    return rgba, {"bg": [round(float(x)) for x in bg], "bg_frac": round(bg_frac, 2),
                  "keyed_frac": round(float(connected.mean()), 3), "sat": round(sat, 1)}


def _despill_toward_neutral(im: Image.Image, bg) -> Image.Image:
    """Reduce a saturated backdrop's colour cast on kept semi-transparent edges."""
    arr = np.asarray(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    edge = (a > 4) & (a < 235)
    bg = np.array(bg, dtype=np.float32)
    dom = int(np.argmax(bg))                       # dominant backdrop channel
    others = [i for i in range(3) if i != dom]
    ch = [r, g, b]
    ex = np.clip(ch[dom] - np.maximum(ch[others[0]], ch[others[1]]), 0, 255) * 0.8
    ch[dom] = np.where(edge, np.clip(ch[dom] - ex, 0, 255), ch[dom])
    out = np.dstack([ch[0], ch[1], ch[2], a]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def defringe(im: Image.Image, px: int = 1) -> Image.Image:
    """Erode the alpha edge by `px` to shave the thin chroma ring left on dark
    hair/edges against magenta. Small enough to keep fine hair silhouette."""
    if px <= 0:
        return im
    a = im.split()[3]
    a = a.filter(ImageFilter.MinFilter(size=1 + 2 * px))
    im = im.copy()
    im.putalpha(a)
    return im


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    """Crop to the alpha bounding box with a small transparent pad."""
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(im.width, r + pad), min(im.height, b + pad)
    return im.crop((l, t, r, b))


def alpha_health(im: Image.Image, key: str = "green") -> dict:
    """Report alpha coverage + residual key-colour fringe on soft edges for QA."""
    a = np.asarray(im)[..., 3].astype(np.float32) / 255.0
    coverage = float((a > 0.5).mean())
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    edge = (a > 0.05) & (a < 0.85)
    if key == "green":
        keyish = (g - np.maximum(r, b)) > 60
    elif key == "blue":
        keyish = (b - np.maximum(r, g)) > 60
    else:  # magenta
        keyish = (np.minimum(r, b) - g) > 60
    fringe = float((keyish & edge).sum() / max(1, edge.sum()))
    return {"coverage": round(coverage, 4), "edge_key_fringe": round(fringe, 4)}


# ------------------------------------------------------------------ delivery
def resize_cover(im: Image.Image, w: int, h: int) -> Image.Image:
    """Scale to cover then center-crop to exactly (w,h). For env plates."""
    im = im.convert("RGB")
    s = max(w / im.width, h / im.height)
    nw, nh = round(im.width * s), round(im.height * s)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x, y = (nw - w) // 2, (nh - h) // 2
    return im.crop((x, y, x + w, y + h))


def upscale_to(im: Image.Image, w: int, h: int) -> Image.Image:
    """LANCZOS upscale preserving aspect to fit within (w,h) then pad-canvas
    is NOT used; we scale the longest edge to match. For sprites we keep aspect
    and scale so height==h (VN stage baseline). Returns image + no crop."""
    s = h / im.height
    return im.resize((round(im.width * s), h), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG")


def save_webp(im: Image.Image, path: str, quality: int = 92) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)


# --------------------------------------------------------------- high level
def _corner_color(im: Image.Image, k: int = 14):
    """Mean colour of the four corner patches, plus how uniform they are."""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w = a.shape[:2]
    patches = [a[:k, :k], a[:k, -k:], a[-k:, :k], a[-k:, -k:]]
    means = np.array([p.reshape(-1, 3).mean(0) for p in patches])
    return means.mean(0), float(means.std(0).mean())


def _is_skinlike(c) -> bool:
    """True if colour c looks like skin/cream/beige (unsafe to key)."""
    r, g, b = c
    return r > 150 and g > 110 and b > 80 and (r - b) < 120 and abs(r - g) < 70


def make_sprite(prompt: str, seed: int, out_png: str, *, gen_w: int = 768,
                gen_h: int = 1024, model: str = "flux", key: str = "green",
                deliver_h: int | None = None) -> dict:
    """Generate -> chroma-key -> despill -> defringe -> trim -> (upscale) -> PNG.

    Default GREEN key (skin-safe). Guard: if keying removes nothing (flux painted
    a backdrop), try a corner-detected key when the backdrop is a uniform non-skin
    colour; else raise so the driver rejects it (an opaque 'sprite' is a defect)."""
    raw = fetch(prompt, gen_w, gen_h, model=model, seed=seed)
    native = raw.size
    keyed, info = key_border_flood(raw)
    if info["keyed_frac"] < 0.06:      # almost nothing removed -> figure fills frame or no bg
        raise RuntimeError(f"background barely keyed (keyed_frac={info['keyed_frac']}) — reject")
    keyed = trim(defringe(keyed, 1))
    upscaled = False
    if deliver_h and keyed.height < deliver_h:
        keyed = upscale_to(keyed, keyed.width, deliver_h)
        upscaled = True
    save_png(keyed, out_png)
    health = alpha_health(keyed, key)
    health.update(info)
    return {
        "file": out_png, "kind": "sprite", "prompt": prompt, "seed": seed,
        "model": model, "key": key, "native_px": list(native),
        "delivered_px": list(keyed.size), "upscaled": upscaled, "alpha": health,
        "origin": "generated", "tool": "pollinations flux (text-to-image)",
    }


def sprite_score(rgba: Image.Image, info: dict) -> float:
    """Heuristic quality score for a keyed sprite. Rewards a healthy keyed
    fraction, an OPAQUE central figure (no see-through face/torso), and crisp
    detail; penalises residual key fringe."""
    a = np.asarray(rgba)[..., 3].astype(np.float32) / 255.0
    h, w = a.shape
    cx0, cx1, cy0, cy1 = int(w * .30), int(w * .70), int(h * .10), int(h * .72)
    central_opacity = float((a[cy0:cy1, cx0:cx1] > 0.6).mean())  # want ~1.0
    kf = info.get("keyed_frac", 0.5)
    kf_ok = 1.0 - min(1.0, abs(kf - 0.58) / 0.42)               # peak near 0.58
    g = np.asarray(rgba.convert("L"), dtype=np.float32)
    lap = float(np.abs(np.gradient(g)[0]).mean() + np.abs(np.gradient(g)[1]).mean())
    sharp = min(1.0, lap / 14.0)
    return float(2.4 * central_opacity + 1.0 * kf_ok + 0.6 * sharp)


def make_sprite_best(prompt: str, seeds: list[int], out_png: str, *, gen_w: int = 768,
                     gen_h: int = 1024, model: str = "flux", key: str = "green",
                     deliver_h: int | None = None) -> dict:
    """Generate several seeds, key each, keep the highest-scoring one. This is the
    yield lever for transparent sprites (flux quality varies seed to seed)."""
    best = None
    tried = []
    for seed in seeds:
        try:
            raw = fetch(prompt, gen_w, gen_h, model=model, seed=seed)
            keyed, info = key_border_flood(raw)
            if info["keyed_frac"] < 0.06:
                tried.append({"seed": seed, "rejected": "barely-keyed"})
                continue
            sc = sprite_score(keyed, info)
            tried.append({"seed": seed, "score": round(sc, 3), "keyed_frac": info["keyed_frac"]})
            if best is None or sc > best[0]:
                best = (sc, seed, keyed, raw.size, info)
        except Exception as e:  # noqa: BLE001
            tried.append({"seed": seed, "rejected": str(e)[:60]})
    if best is None:
        raise RuntimeError(f"all {len(seeds)} seeds rejected: {tried}")
    sc, seed, keyed, native, info = best
    keyed = trim(defringe(keyed, 1))
    upscaled = False
    if deliver_h and keyed.height < deliver_h:
        keyed = upscale_to(keyed, keyed.width, deliver_h)
        upscaled = True
    save_png(keyed, out_png)
    health = alpha_health(keyed, key)
    health.update(info)
    return {
        "file": out_png, "kind": "sprite", "prompt": prompt, "seed": seed,
        "score": round(sc, 3), "candidates": tried, "model": model, "key": key,
        "native_px": list(native), "delivered_px": list(keyed.size),
        "upscaled": upscaled, "alpha": health, "origin": "generated",
        "tool": "pollinations flux (text-to-image)",
    }


def make_bust(prompt: str, seed: int, out_webp: str, *, gen_w: int = 768,
              gen_h: int = 1024, model: str = "flux",
              deliver: tuple[int, int] | None = None) -> dict:
    """Generate a dialogue bust on a soft plate (no keying)."""
    raw = fetch(prompt, gen_w, gen_h, model=model, seed=seed)
    native = raw.size
    upscaled = False
    if deliver:
        raw = resize_cover(raw, *deliver)
        upscaled = native[0] < deliver[0]
    save_webp(raw, out_webp)
    return {
        "file": out_webp, "kind": "bust", "prompt": prompt, "seed": seed,
        "model": model, "native_px": list(native), "delivered_px": list(raw.size),
        "upscaled": upscaled, "origin": "generated",
        "tool": "pollinations flux (text-to-image)",
    }


def make_plate(prompt: str, seed: int, out_webp: str, w: int, h: int, *,
               model: str = "flux") -> dict:
    """Generate an environment/event plate at native then cover-resize to (w,h)."""
    gw, gh = (1216, 684) if w >= h else (720, 1216)
    raw = fetch(prompt, gw, gh, model=model, seed=seed)
    native = raw.size
    plate = resize_cover(raw, w, h)
    save_webp(plate, out_webp)
    return {
        "file": out_webp, "kind": "plate", "prompt": prompt, "seed": seed,
        "model": model, "native_px": list(native), "delivered_px": [w, h],
        "upscaled": native[0] < w, "origin": "generated",
        "tool": "pollinations flux (text-to-image)",
    }
