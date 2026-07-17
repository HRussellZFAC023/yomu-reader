# Lesson 39 asset and presentation audit

Date: 2026-07-15
Scope: `l2-l14` (curriculum Lesson 39)

## Ownership

Lesson 39 uses the source-backed `l3-2-l03` class roster: Jenny is primary and Angel is supporting. Both remain name-only. The lesson references the existing `lab` world origin and uses the approved responsive `location.language-lab` plate; it does not authorize character likeness or item art.

The typed runtime registry and mirrored `ASSET-USAGE.json` explicitly add `lesson:l2-l14` to the language-lab plate's runtime homes. The generated Academy asset registry now covers Lessons 27-39 and records Lesson 39 as active runtime with a complete distinct wide/mobile pair and no lesson-scoped purposeful-asset gap.

## Source pages

The activity mounts all four pages of `Handouts/New_Chapter 29-1〜ている-4_intransitive verbs_States in Effect grammar exercise.pdf` from the unique `l2-l14` package. Each public PNG is pinned by SHA-256, mirrored byte-for-byte under `docs/public`, and present in both offline manifests.

Each page is a keyboard-operable button with a descriptive accessible name. Thumbnails use lazy loading, and a full-size lazy image is created only when its modal inspector opens. Escape closes the inspector and returns focus to its trigger.

## Answer boundary

The source provides no answer key. All eight Yomu-derived completions remain in a hidden `after-attempt` answer region until submission. The activity exposes no audio, cast likeness, or item art.

## Verification

- `node scripts/academy-asset-registry.mjs validate`
- Focused Vitest coverage in `tests/academy/lesson-thirty-nine-state-inspection.test.ts` and `tests/academy/lesson-39-asset-presentation.test.ts`
- `node scripts/lesson-39-presentation-browser.mjs` at 1280x900 and 390x844
- Playwright assertions for responsive plate selection, image decode, inspector bounds, keyboard behavior, answer concealment, and horizontal overflow
- Axe checks for the story presentation, activity, and open inspector with no serious or critical violations
