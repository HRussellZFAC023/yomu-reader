# Yomu Academy Production Sprites v1

This directory documents the standalone sprite delivery under
`public/academy/art/codex-production-v1/sprites/`.

## Asset Contract

- Every stage sprite is a `1536 x 2048` RGBA PNG with genuine alpha.
- Source renders use a flat `#00ffff` cyan chroma field. The raw render is retained
  under `sources/`; the production sprite is key-removed, despilled, resized,
  and alpha-checked before it is listed in a person manifest.
- Each person has the same ten expression IDs: `neutral`, `happy`,
  `laughing`, `thinking`, `surprised`, `concerned`, `determined`,
  `embarrassed`, `speaking`, and `listening`.
- The cast is portrayed as adults in the hand-painted, cool-blue/warm-practical
  visual-novel language specified by the Visual Bible. No art contains a scene,
  cast shadow, text, brand, or frame.

## Reference Boundary

The checked-in `references/class-photos/README.md` says the original named
attachments were not recoverable, and no per-person consent/source manifest is
present. This delivery records that limitation rather than asserting a verified
photo-to-name mapping. Where a local named reference exists (the Aakash/Tom
konbini photo and the Rie raster anchor), it is recorded in that person's
manifest. Other named designs use the written cast model and the existing
production sprite as a continuity anchor.

All identity sheets and expression manifests therefore distinguish visual
continuity from a claim of photo-likeness. Any future consented, name-mapped
reference must supersede these anchors and trigger a new review.

## Layout

```text
public/academy/art/codex-production-v1/sprites/
  people/<cast-id>/<cast-id>__<expression>__halfbody__v001.png
  sources/<cast-id>__<expression>__raw.png
  contact-sheets/<cast-id>__identity-sheet__v001.png
  qa/<cast-id>__<expression>.json
```

Person manifests in `manifests/` contain visual notes, expression and pose IDs,
source references, intended story use, dimensions, alpha QA, and the
consistency review status. `CAST-COVERAGE.md` is the delivery matrix.
