---
title: "Yomu Academy Character Production"
status: "review-ready neutral masters"
owner: "character art production"
date: "2026-07-11"
manifest: "public/academy/art/characters/production-manifest.json"
---

# Character Production

## Delivered Pass

This pass establishes one coherent neutral production master for the five recurring Open Door Desk characters: Rie-sensei, Suzu Arai, Leo Ward, Mika Chen, and Nori Vale. The assets are transparent PNG half-body sprites under `public/academy/art/characters/production/`, with their original flat-magenta generation sources retained in each character's `source/` directory.

These are **review-ready identity masters**, not automatically shipped runtime assets. No app, renderer, CSS, package, or queue status was changed.

| Character | Identity lock | Silhouette hook | Neutral master |
| --- | --- | --- | --- |
| Rie | existing generated Rie portrait | bun, cardigan, thermos, worksheets | `rie__sprite__neutral-welcome__halfbody__v001.png` |
| Suzu | original fictional design | precise bob, pencil, stacked notice cards | `suzu__sprite__neutral-inspect__halfbody__v001.png` |
| Leo | original fictional design | field jacket, camera strap, folded route card | `leo__sprite__neutral-map__halfbody__v001.png` |
| Mika | original fictional design | low tie, sky cardigan, folio, umbrella strap | `mika__sprite__neutral-plan__halfbody__v001.png` |
| Nori | original fictional design | short waves, layered overshirt, open palm, rehearsal card | `nori__sprite__neutral-invite__halfbody__v001.png` |

## Reference Audit

The worktree and parent project contain no discoverable class-photo file, consent record, or consented photo manifest. The inspected visual references were the generated Rie portrait, the generated cast contact sheet, the generated campus group, and the existing Aakash portrait. Therefore:

- Rie uses the existing generated Rie image as an identity and wardrobe anchor.
- Suzu, Leo, Mika, and Nori are original fictional designs derived from story roles and non-sensitive visual hooks.
- No asset in this pass claims or implies a real classmate's likeness.
- A future photo-likeness pass remains blocked until the consent requirements in `CAST-ART-BIBLE.md` are met.

## Visual Lock

The common rendering target is realistic anime-film visual-novel art: painterly raster texture, subtle structured pixel grain, adult proportions, practical evening-class clothing, cool indigo/teal fill, and restrained amber rim light. Every master uses a stable front three-quarter stance, visible hands, a dialogue-readable silhouette, and blank unbranded props.

The characters separate at thumbnail scale through hair mass, shoulder line, palette, and prop geometry. They should not be normalized into one shared face or one shared body template during expression production.

## Generation Recipe

Built-in image generation used the existing Rie portrait and cast contact sheet as rendering references. The shared prompt was:

> Create an original adult Yomu Academy visual-novel character in realistic anime-film rendering with painterly texture, subtle structured pixel grain, cool blue-hour shadows and warm amber edge light. Use stable front three-quarter framing, show the figure through mid-thigh, preserve generous padding, use believable hands and blank unbranded props, and isolate the subject on a perfectly flat #ff00ff background with no floor, shadow, gradient, texture or reflection.

Character-specific direction is stored in `production-manifest.json`. Every classmate prompt explicitly prohibited real-person likeness, child proportions, school uniforms, logos, readable text, franchise imagery, and copying a reference face.

## Raster Preparation

The preferred repository helper, `remove_chroma_key.py`, was attempted but could not run because Pillow is not installed in the selected Python environment. The installed FFmpeg 8.1.2 build was used instead:

```text
colorkey=0xff00ff:0.26:0.05,format=rgba
```

Validation completed for all five final PNGs:

- `sips` reports `hasAlpha: yes`.
- FFmpeg alpha statistics include fully transparent (`0`) and fully opaque (`255`) pixels.
- Each cutout was composited over a light neutral background for visual inspection.
- Hair, hand, paper, camera, thermos, and clothing edges remain intact after the stronger key pass.

A slight rose-violet edge remains in a few lit hair strands. This is primarily generated rim-light color rather than opaque background, but it must be checked at actual stage scale on both dark and light plates before release.

Transparent WebP was not produced: this FFmpeg build has no `libwebp` encoder, and the installed `sips` cannot write WebP. PNG is the honest production output for this pass.

## Known Limitations

- Generator output dimensions are native rather than the aspirational `1536 x 2048` sprite master size: four assets are `1086 x 1448`; Leo is `1023 x 1537`. Do not upscale merely to satisfy the nominal dimensions.
- Rie is framed farther back than the other four. Runtime layout should normalize visible character height, or Rie should receive a closer v002 after art review.
- These are one-pose neutral identity locks, not the full six-expression by three-pose matrix.
- The source chroma PNGs are retained for reproducibility and improved future keying.

## Next Production Pass

After human approval, generate expression variants by editing each approved neutral master rather than prompting from text alone. Preserve face geometry, hair mass, wardrobe, prop scale, camera height, shoulder width, and canvas alignment.

The first route-useful variants should be:

| Priority | Character | Variant |
| --- | --- | --- |
| P0 | Rie | `warm-explain`, then `warm-handoff` |
| P1 | Suzu | `thinking-inspect`, then `determined-write` |
| P1 | Leo | `determined-photograph` |
| P1 | Mika | `thinking-plan`, then `determined-decide`, then `relieved-present` |
| P1 | Nori | `warm-rehearse` |

Do not mark a generated file as shipped based on file presence. The renderer owner should advance only approved assets after scene-scale QA and manifest review.
