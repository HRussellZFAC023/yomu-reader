# Lesson 41 asset presentation audit

Date: 2026-07-15

## Grounding

- Lesson package: `l2-l16` / `043-l2-l16.json`
- Class week: `l3-2-l05`
- Approved name-only roster: Angel (host), Christian (supporting)
- Approved plate owner: `location.classroom`
- Responsive deliveries: distinct wide and mobile classroom plates
- Source ownership: six hash-pinned Moodle page images, mirrored under `docs/public`
- Answer policy: derived answers remain hidden until an attempt
- Cast policy: no character likeness or item art is authorized by this lesson

## Source inspector evidence

- Six source figures render as keyboard-focusable buttons.
- Thumbnails and full-size images are lazy-loaded.
- Full-size pages open in modal dialogs and close by button, backdrop, or `Escape`/cancel.
- The source inspector has a narrow-screen full-viewport rule at `620px`.
- The activity retains the exact source order and source hashes.

## Accessibility evidence

`tests/academy/lesson-41-asset-presentation.test.ts` runs Axe against the mounted Lesson 41 activity and reports zero structural violations. The JSDOM-incompatible `color-contrast` rule is excluded from that automated run; contrast remains covered by the Academy visual/browser QA lane rather than being claimed by this test.

## Verification

```text
npx vitest run --config config/vite/academy.config.ts \
  tests/academy/academy-asset-registry.test.ts \
  tests/academy/lesson-41-asset-presentation.test.ts \
  tests/academy/lesson-forty-one-prepared-state-audit.test.ts

3 files passed, 14 tests passed
```

The generated Academy asset registry reports 56 source-media records and zero explicit asset gaps for Lessons 27-41.
