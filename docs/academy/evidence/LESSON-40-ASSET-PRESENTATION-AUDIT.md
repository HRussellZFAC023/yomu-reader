# Lesson 40 asset and presentation audit

Date: 2026-07-15
Scope: `l2-l15` (curriculum Lesson 40)

## Ownership

Lesson 40 uses the source-backed `l3-2-l04` class roster: Alex is primary and Jodi is supporting. Both remain name-only. The lesson references the existing `classroom` world origin and uses the approved responsive `location.classroom` plate; it does not authorize character likeness or item art.

The typed runtime registry and mirrored `ASSET-USAGE.json` explicitly add `lesson:l2-l15` to the classroom plate's runtime homes. The generated Academy asset registry now covers Lessons 27-40 and records Lesson 40 as active runtime with a complete distinct wide/mobile pair and no lesson-scoped purposeful-asset gap.

## Source pages

The activity mounts all five pages of `Handouts/Chapter 29-2 〜てしまいます_しまいました grammar exercise.pdf` from the unique `l2-l15` package. Every page is pinned by SHA-256, mirrored byte-for-byte under `docs/public`, and available through a keyboard-focusable inspector.

Thumbnails use lazy loading. The full-size image is not inserted until the learner opens its dialog, and the full-size image also uses lazy loading. Derived completion and regret answers remain under `data-answer-visibility="after-attempt"` and hidden until submission.

## Offline and responsive verification

The package JSON, five source pages, and both classroom plate variants are present in the public and docs service-worker homes. `scripts/lesson-40-presentation-browser.mjs` verifies the wide plate at `1280x900`, the mobile plate at `390x844`, source image decoding, inspector bounds and keyboard return, concealed answers, horizontal overflow, clean console output, and no serious or critical Axe violations.

No Lesson 41, world-route, listening, SRS, or authentication files are part of this audit.
