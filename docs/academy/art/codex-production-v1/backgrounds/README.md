# Codex Production v1 Backgrounds

## Scope

This is an art-only production candidate for the Yomu Academy location stream. It does not modify runtime scene registration, asset selection, or application behavior.

The machine-readable location/state manifest is [manifest.json](../../../../../public/academy/art/codex-production-v1/backgrounds/manifest.json). It records the source image, final raster pair, exact dimensions, dialogue and sprite safe-zone preset, authored mobile focal anchor, music/SFX mood tags, story and lesson homes, provenance, and review status for every plate.

## Delivery

- `source/`: original generated `1672 x 941` PNG source plates retained for provenance and re-rendering.
- `wide/`: `1600 x 900` WebP masters.
- `mobile/`: `900 x 1125` WebP companions made from each source with its declared focal anchor; no generic centre crop is used.
- `contact-sheets/`: source review and final-wide/final-mobile contact sheets for visual QA.

The set has 26 location-state plates across all 23 requested core places. Bloomsbury street, classroom, and cafe deliberately have alternate states because the story needs both arrival/planning and rain/evening use.

## Style Lock

- Empty visual-novel plates only: sprites and dialogue remain separate.
- Human eye-height perspective with readable foreground, mid-ground, and background.
- Lower 28% stays quiet enough for the dialogue surface.
- Indigo/teal ambient light and warm, physically motivated amber practicals; rain changes surfaces rather than simply tinting the plate.
- No readable text, pseudo-text, logos, crests, screens, maps, menus, fictional brands, people, or crowds.
- London and Japan cues are original and broad; no real institution or landmark is represented.

## Review Record

The source, wide, and mobile contact sheets were reviewed at normal and enlarged scale for empty-plate compliance, visual continuity, readable area, rain/material behavior, mobile focal retention, and obvious transport/furniture/perspective defects. All 26 wide files are exactly `1600 x 900` WebP and all 26 mobile files are exactly `900 x 1125` WebP. The rendered dHash duplicate check passed, with a closest-pair distance of `15` versus an alert threshold of `4`.

This pass is ready for a design-review handoff, not an unqualified shipped-art claim: the Visual Bible still requires a human design reviewer to sign off the exact assets selected by a runtime owner. OCR tooling was unavailable in this workspace, so text-risk review was performed visually on the source and rendered contact sheets.

## Provenance

All source plates are original outputs from OpenAI built-in image generation on 2026-07-11. The two approved task attachments were used only for their broad painterly environment finish and warm/cool lighting relationship. The Visual Bible, Environment Bible, and Story Bible supplied the place grammar and narrative context. No protected character, living artist, studio, franchise, real interior, map, photograph, institution, or brand was used as a generation target.
