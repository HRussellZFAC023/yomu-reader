# Lesson 35 asset and presentation audit

Date: 2026-07-15
Scope: `l2-l10` (curriculum Lesson 35)
Excluded: `l2-l11` / Lesson 36 and later

## Runtime decision

Lesson 35 uses the approved responsive station plate for its existing Atlas station-route threshold framing. The source-backed `l2plus-l09` cast plan supplies Christian and Aakash; both appear by name only. No character likeness or unrelated item art is mounted in the authored screen or activity.

## Source visuals and answers

The activity mounts the exact Moodle Chapter 23-1 page 4 and page 5 renders, pinned by SHA-256. Each responsive thumbnail is a keyboard-reachable button that opens a viewport-bounded inspector; the full-size image is created only after activation.

The source pages, teaching, and prompts are unchanged. Yomu-derived completed sentences remain absent from the visible answer section until an attempt.

## Offline and ledgers

Both source pages, the `037-l2-l10.json` package, and the station wide/mobile deliveries are present in the public and hosted service-worker manifests. The runtime asset registry and mirrored `ASSET-USAGE.json` ledgers record `lesson:l2-l10` as a station plate home.

## Verification

- Focused Lesson 35 presentation, activity, and story-runtime suite: 14/14 tests pass; the expanded offline, asset-registry, and ledger regression set passes 62/62.
- Typecheck: pass.
- Real Chromium at `1280x900` and `390x844`: responsive station pixels loaded; Christian and Aakash remained name-only; both source thumbnails loaded; Enter opened the lazy full-size inspector; Escape closed it; inspector bounds stayed within the viewport; answers remained `display:none`; no horizontal overflow, character/item art, warnings, or errors were present.
- Neighboring Lessons 32-34 suite: its Lesson 32 source-question audit currently fails before presentation mounting; this concurrent out-of-scope slice was not changed.
- Cross-model review: unavailable because the local Claude account reached its weekly limit.
