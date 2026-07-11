---
title: "Yomu Academy — claude-production-v3 art delivery"
status: "in production"
owner: "production art direction"
asset_root: "public/academy/art/claude-production-v3"
tool_root: "docs/academy/art/claude-production-v3/pipeline"
date: "2026-07-11"
---

# Yomu Academy — claude-production-v3

A cohesive, QA-gated production art set for Yomu Academy: expressive raster cast
portraits and transparent VN sprites, original hand-painted environment plates in
multiple time/weather states, story-event CGs, lesson scenes, props, and the
protagonist portrait choices — all rendered to **one** visual contract so the
whole thing composites as a single production, not a stock-art dump.

This directory owns **only**:

- `public/academy/art/claude-production-v3/**` — the shipped raster assets + sibling `*.meta.json`.
- `docs/academy/art/claude-production-v3/**` — the pipeline, specs, manifests, contact sheets, QA, and provenance.

It never overwrites prior art (`characters/claude-production`, `characters/production`,
`characters/cast`, `environments/`, etc. are left untouched) and never edits runtime
or CSS. Every asset has a **planned runtime home** recorded in its metadata and in
[USAGE.md](USAGE.md).

## Why this exists (what it fixes vs. prior passes)

The audited prototype (see [../../design/UX-SCREEN-AUDIT.md](../../design/UX-SCREEN-AUDIT.md))
shipped SVG avatar fallbacks, character-bearing backgrounds duplicated with a second
portrait, framed room "sprites", and half-body files with magenta hair fringe. The
v1 `characters/claude-production` sprites also sit on an un-keyed pink halo (a global
magenta key ate faces, so backgrounds were left in). v3 fixes both root causes:

- **Cohesion** — one shared style module ([`pipeline/style.py`](pipeline/style.py))
  supplies an identical render/light/palette/negative contract to every prompt, and
  every asset of a character is composed from one locked identity descriptor, so
  face/hair/wardrobe never drift between a character's bust, sprite, and expressions.
- **Clean alpha** — a **border-connected flood** keyer
  ([`pipeline/genlib.py`](pipeline/genlib.py) `key_border_flood`) removes only the
  background reachable from the frame edge, so an interior skin/face island is never
  keyed even when its colour is close to the backdrop. This is the flaw that defeats
  every global colour key (magenta ≈ pale warm skin) and produced v1's fringe.

## The visual contract

Derived from [VISUAL-BIBLE.md](../../design/VISUAL-BIBLE.md),
[ENVIRONMENT-BIBLE.md](../ENVIRONMENT-BIBLE.md), [CAST-ART-BIBLE.md](../CAST-ART-BIBLE.md),
and the shipped anchors (`campus-blue-hour.webp`, `rie-sensei.webp`):

- **Render** — warm hand-painted anime realism, clean confident lineart, subtle
  structured pixel grain, believable adult anatomy, expressive faces. Not flat
  vector, not photoreal, not a franchise imitation.
- **Light** — cool blue-hour indigo/teal ambient vs. warm amber practicals; one key
  direction; no rim-light gimmicks, neon, bloom, or lens flare. (Sprites are lit with
  even neutral studio light; the scene light is added by compositing onto the plate.)
- **Palette** — deep indigo `#293e62`, desaturated teal shadow, amber `#d79a4b`,
  coral/rose `#b96b78`, leaf `#2f7654`, paper cream `#e8dfcf`.
- **Hard negatives** — no text/lettering/logos/crests/signage/UI/watermark; no
  franchise/artist imitation; no copyrighted mascot; adults only, no school uniform,
  no plastic AI skin, no same-face, no malformed hands, no duplicated people.

## Pipeline

Text-to-image via the free **Pollinations flux** HTTP endpoint (no key), then local
post-processing. Flux caps the long edge near ~1024px, so masters are generated at
model-native size and LANCZOS-upscaled to the delivery size; every meta records
`native_px`, `delivered_px`, and `upscaled`.

| Tool | Role |
| --- | --- |
| `pipeline/style.py` | The single shared style contract (render/light/palette/negatives + chroma fields). |
| `pipeline/genlib.py` | Fetch (paced, 429-aware retry) + border-flood keyer + despill + defringe + best-of-N + delivery resize. |
| `pipeline/generate.py` | Spec-driven driver; appends the shared style, writes assets + sibling meta + provenance. |
| `pipeline/build_specs.py` | The production matrix — emits every group spec from the locked identity/location/event canon. |
| `pipeline/build_contact_sheet.py` | Labelled review contact sheets (transparent art over a checker). |
| `pipeline/validate.py` | Technical QA: alpha coverage, residual key fringe, near-duplicate ahash, dims. |
| `pipeline/build_manifest.py` | Aggregates all meta into `ASSET-MANIFEST.json` with usage + runtime homes + dup/flag reports. |

### Chroma keying

- Default key field is **green** `#00ff00` (pale skin/cream are far from green; a
  magenta field is used only when the subject/prop is green-dominant, e.g. Rie's
  thermos, Christian). The keyer itself is colour-agnostic: it floods inward from
  dense border seeds that match the detected backdrop, absorbing pixel-grain via a
  per-seed tolerance and stopping at the figure silhouette. Interior islands stay
  opaque. A despill pass removes the backdrop's colour cast on soft edges; a 1px
  defringe shaves the dark-hair edge ring.
- **Best-of-N** — transparent sprites generate several seeds and auto-keep the
  highest-scoring (healthy keyed fraction + opaque central figure + crisp detail),
  because flux quality varies seed to seed. Rejects (un-keyable, figure fills frame,
  scene-not-backdrop) fail loudly and are regenerated.

### Regenerate anything

```bash
# rebuild all specs from the canon
python3 docs/academy/art/claude-production-v3/pipeline/build_specs.py
# (re)generate a group; idempotent (skips existing) unless --force
python3 docs/academy/art/claude-production-v3/pipeline/generate.py \
    --spec docs/academy/art/claude-production-v3/specs/characters-core.json --workers 2
# regenerate specific rejected assets with fresh seeds
python3 .../generate.py --spec .../characters-core.json --only sophie__bust__happy --force
```

`YOMU_GEN_INTERVAL` (seconds, default 4.0) sets the global request pacing. Run specs
**sequentially in one process** — the anonymous endpoint 429s on concurrent bursts.

## The production matrix

Full matrix authored in `specs/` (regeneratable). Tiers:

**Tier A (primary delivery)**
- `characters-core` — all 21 cast: neutral/happy/thinking **bust** + neutral **half-body sprite**.
- `rie-expanded` — Rie's full 10-expression bust set, work-location busts (konbini / ramen / station), and expression sprites.
- `environments-a` — 16 locations × {evening, rain} × {wide 1600×900, mobile 900×1125}.
- `events` — 11 story CGs (prologue notebook, name-circle, konbini-midnight, ramen/okonomiyaki/pub nights, library two-hander, kanji-garden, surprise party, airport farewell, class group) × wide+mobile.
- `props` — 18 prop/food/object/kanji studies (transparent).
- `protagonist` — 4 player-character portrait options.

**Tier B (authored; generated as throughput allows)**
- `characters-expressions` — remaining 7 expressions (laughing, surprised, concerned, determined, embarrassed, speaking, listening) as busts for all 21 cast.
- `environments-b` — {morning, afternoon, special-event} states for all 16 locations × wide+mobile.

See [ASSET-MANIFEST.json](ASSET-MANIFEST.json) for the exact shipped inventory,
dimensions, alpha health, near-duplicate report, and per-asset runtime homes, and
[USAGE.md](USAGE.md) for how each group wires into the runtime.

## QA gates (see [qa/](qa/))

1. **Technical** — `validate.py` / `build_manifest.py`: correct dims, alpha coverage
   in range, residual key fringe ≤ 0.05, no near-duplicate compositions.
2. **Art direction** — a fan-out reviewer panel + a GPT-5.5 vision pass (per project
   rule, vision QA runs through the `codex` CLI, not Claude's own vision) checks face
   consistency, anatomy, hands, pseudo-text, crop, lighting, and emotional fit on the
   contact sheets. Verdicts land in `qa/`.
3. **Reject, don't pad** — weak or inconsistent generations are rejected and
   regenerated with new seeds rather than shipped to hit a count.

## Provenance & rights

Every asset is `origin: generated`, `tool: pollinations flux (text-to-image)`, with
its exact prompt, seed, model, and dimensions in its sibling `*.meta.json` and in
`provenance/`. Prompts describe Yomu's own forms and story purpose only; no living
artist, studio, franchise, or copyrighted character is named as a style shortcut, and
no real classmate's face is assigned to a name — cast identity comes from the written
canon (`src/academy/cast.ts` + the vetted descriptors in `scripts/generate_sprites.py`).
