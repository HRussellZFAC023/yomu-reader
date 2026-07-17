# Lessons 27-31 asset and presentation audit

Date: 2026-07-15
Scope: `l2-l02` through `l2-l06` (curriculum Lessons 27-31)
Excluded: `l2-l07` / Lesson 32 and later

## Runtime decision

| Lesson | Package | Story origin | Approved plate | Cast presentation | Purpose |
|---|---|---|---|---|---|
| 27 | `l2-l02` | station | `location.station` | name-only | Experience postcards and B-21 travel listening |
| 28 | `l2-l04` | classroom | `location.classroom` | name-only | Chapter 20 plain-form matrix |
| 29 | `l2-l03` | home | `location.home` | name-only | Summer-holiday B-22 listening |
| 30 | `l2-l05` | station | `location.station` | name-only | B-24, B-25, and Minna 069 planning/listening |
| 31 | `l2-l06` | library | `location.library` | name-only | Chapter 21 opinion notebook |

The story-origin plate now drives the authored-week screen and the local story location drives the extension header. The broader Home world route still uses its writing-studio fallback; Lesson 29 deliberately selects the approved recovered home-desk plate through the lesson presentation map.

No lesson sprite was authorized. Alex, Jodi, Tom, Francis, Shin, and Sophie do not have approved lesson-runtime likenesses, so the existing `name-only` gate remains intact. No recovered prop was repurposed: approved props are bound to earned world-reward homes, and using them here would be decoration rather than task evidence.

## Exact source visuals

All delivered pages were visually inspected. They contain source prompts, examples, empty answer loci, and source illustrations; no answer key is printed on the learner task pages.

| Package | Runtime page | SHA-256 |
|---|---|---|
| `l2-l02` | `moodle-chapter-19-1-vocabulary-page-1.png` | `b9a76542879c20ac1e1519c4f2246bf3d16ca84e510e680e98119d41c40c3802` |
| `l2-l02` | `moodle-chapter-19-listening-page-1.png` | `70b5f991a2cc262205669d21901b2f945b5faf24e8ad41caa5134bb34f2a7414` |
| `l2-l03` | `moodle-chapter-19-2-3-vocabulary-page-1.png` | `edaa7f991771ccda7ff2a2a00ebffb5418234df2e0cd536c059cce532f38119e` |
| `l2-l03` | `moodle-chapter-19-2-tari-grammar-page-3.png` | `20595904296d510ed9aab10a13148c8d0c9d85e27779a637ac9cb5949dccf738` |
| `l2-l04` | `moodle-chapter-20-1-vocabulary-page-1.png` | `c0069c4fcc3b1d31df9badbb2f4532078b02d925e2c44303c5e50408e95819f2` |
| `l2-l04` | `moodle-chapter-20-1-plain-style-verb-page-3.png` | `d8d0b2b0ff00c3e6801b4e02d97cde11382a201e85b0ea468b717a448cd9f38f` |
| `l2-l05` | `moodle-chapter-20-2-vocabulary-page-1.png` | `0981cc1579d4cde558ecec3f68dc385e72cc50a09fee38c7d54e36aa1edd6e5c` |
| `l2-l05` | `moodle-chapter-20-listening-page-1.png` | `f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975` |
| `l2-l05` | `moodle-chapter-20-conversation-page-1.png` | `ad13d146b8e82ad147870d90a1e47c0f8a43b96ac306e6bc869410dc616f2cb1` |
| `l2-l06` | `moodle-chapter-21-1-vocabulary-page-1.png` | `a0137ffaab518de2a37d783c5c02c4efe8d719cbe2c8647e186e55e35a00a02f` |
| `l2-l06` | `moodle-chapter-21-opinion-teaching-page-1.png` | `dc138ddbfe0ff40495511a961485f03767ffae7afada9e5886e922809a48dcdb` |
| `l2-l06` | `moodle-chapter-21-opinion-task-page-2.png` | `9c93bc53a77ebb3b3cf2a5013400240acfda5b856773c9d14c13be763c9627d9` |

Each page is now a keyboard-reachable inspection control. The responsive thumbnail has a stable page aspect ratio; the modal inspector is bounded to the viewport on desktop and mobile. A full-size image is created only when opened, avoiding duplicate eager downloads.

## Answer visibility

- Source pages remain visible before commitment because they contain the exact prompts, not keys.
- B-21, B-22, B-24, plain-matrix, and Chapter 21 derived answer sections remain `hidden` until an attempt.
- B-25 and Minna 069 transcripts and reviewed answers are absent from the DOM before an attempt.
- Neutral multiple-choice labels remain visible where the activity response itself is a source-bounded choice.

## Offline coverage

The four approved location plates and the original Lesson 27-31 page/audio assets were already in the Academy core cache except for the concurrent Minna 069 addition. The following exact files were added to both source and hosted service-worker manifests:

- `/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png`
- `/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3`

The listening parsers now accept the authored `minna` corpus and `conversation-check` response contract so that the new Lesson 30 beat is reachable instead of failing during module initialization.

## Verification

- `npm run typecheck`: pass.
- Focused presentation/runtime suite: 5/5 tests pass.
- Neighboring regression set: 39/39 tests pass across source activities, authored-week presentation, story continuity, and offline manifest.
- `npm run build:academy`: pass; all 19 grounding, pedagogy, and resource-ledger validation tests passed before the Vite production build and hosted-runtime sync.
- Browser presentation matrix: pass at `1280x900` and `390x844` for all five lessons. Every approved plate loaded, every local story label remained visible, no unsupported host sprite appeared, and no viewport had horizontal overflow.
- Browser source-inspector runtime: pass at `390x844` using the real Lesson 27 activity plugin. Both exact pages and hashes were present, the trigger was keyboard reachable, the modal image loaded within the viewport, and the answer key remained hidden.
- Broader listening/old Lesson 30 assertions: 5 failures are stale expectations from the concurrent Minna 069 addition (12 vs 13 packaged tracks, 24 vs 29 bindings, and two vs three Lesson 30 beats). No production failure was reported by those assertions.
- Cross-model read-only review: blocked because both Fable and the Opus fallback reported the local Claude account weekly limit; reset is shown as 2026-07-19 05:00 Europe/London.

Focused test: `tests/academy/lesson-27-31-asset-presentation.test.ts`

Browser evidence: `artifacts/academy-lessons-27-31/browser-qa.json` and eleven desktop/mobile PNG captures in the same directory.
