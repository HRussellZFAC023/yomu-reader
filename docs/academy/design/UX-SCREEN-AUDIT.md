# Yomu Academy UX Screen Audit

**Audit date:** 2026-07-11

**Status:** Not release-ready

**Contract:** [VISUAL-BIBLE.md](VISUAL-BIBLE.md)

## Evidence

This audit covers the current learner UI, not design mocks:

- `_shot.mjs` captures at `1440 x 900`, `834 x 1112`, and `390 x 844`.
- Fresh returning-learner captures of campus and Lesson 9 at the same three viewport classes.
- `src/academy/styles.css`, `experience.css`, `foundation-player.css`, `app.ts`, `vn.ts`, and the current assets under `public/academy/art/`.

The original `05-after` and `06-lesson` files are not campus or lesson evidence. Native validation stopped the harness on the empty required placement selects, so both names contain the placement form. The capture workflow needs a semantic ready assertion before it can become a release gate. Screen findings below rely on source inspection and fresh captures; the stale files evidence only this harness failure.

## Verdict

The paired environment plates and the lesson's quiet paper canvas provide a credible foundation. The shipped composition does not yet form one visual novel: onboarding stacks a character-bearing CG, a second room portrait, a form card, door animation, and decorative motion; campus uses a character CG plus a duplicate speaker image; lessons then drop most of the character and place identity. Mobile onboarding also loses reachable content.

## Findings

| Priority | Finding | Evidence | Required decision |
| --- | --- | --- | --- |
| P0 | Mobile onboarding has no usable vertical scroll owner. At `390 x 844`, step 1 cuts off the fourth focus option and both actions. | `body` and `.academy-onboarding` hide overflow; `mobile-02-onboarding1` ends mid-form. | Move long forms to one scrollable study surface and reserve space for actions/safe area. |
| P0 | Rie is duplicated in the same composition. Steps 1-3 show Rie baked into `prologue-open-doors-v2.png` and again in `rie-sensei.webp`; campus repeats Rie in the Lesson 9 CG and a dialogue speaker image. | Desktop, tablet, and mobile onboarding/campus captures; `app.ts`. | Use an empty plate plus one transparent sprite, or one character-bearing CG with no additional portrait. |
| P1 | The opening transition can obscure live copy. The desktop capture at the defined ready time shows the door layer across the title and body; another transition frame contains large black/empty regions. | `desktop-01-onboarding0`, `desktop-03-onboarding2`; `acDoorL`/`acDoorR`. | Copy must be readable from first paint. Remove the door effect or put it behind content and finish before interaction appears. |
| P1 | The legacy Rie image is a second room scene, not a sprite. It introduces a new crop, light source, backdrop, and scale inside the existing scene. | `public/academy/art/characters/rie-sensei.webp`. | Retire it from stage/dialogue use. Browser-check a transparent production sprite over four backgrounds before wiring it. |
| P1 | Tablet and mobile onboarding make the art fight the form. Rie's baked face is clipped at the right edge while a small rectangular Rie floats above or beside the card. | `tablet-02-onboarding1`, mobile steps 1-3. | Keep one Rie, preserve her face and gesture, and let the form own the vertical flow. |
| P1 | Choice copy collapses into narrow word stacks. The three study-affinity options become columns too narrow for normal phrases. | Desktop and mobile step 2. | Use full-width rows on mobile/tablet portrait; use three columns only when each track is at least `180px`. |
| P1 | Campus speaker hierarchy is contradictory on mobile. The CG crop centres the male classmate while the dialogue says Rie; Rie is mostly outside the frame and then repeated in the dialogue. | Fresh `390 x 844` campus capture plus current `app.ts` composition. | Author a mobile focal crop for the speaking beat or use the empty rain plate plus Rie sprite. |
| P1 | Lesson navigation text is visually unusable on desktop. Several route names reduce to the same `Lesson...` because `.academy-lesson-title` forces nowrap/ellipsis. | Fresh `1440 x 900` lesson capture; `styles.css`. | Wrap to two lines or show the distinguishing label first. Never truncate required navigation text. |
| P1 | Dialogue has three incompatible forms: transparent hero copy, large white form card, and a separate campus speaker composition. Lesson dialogue becomes inline teaching rows. | All reviewed screens. | Adopt the one dialogue hierarchy in the Visual Bible and carry its speaker, Japanese, support, and control rhythm into study mode. |
| P1 | Decorative motion exceeds narrative motion. Door rotation, petals, breathing background, glow, spark rings, pulsing advance, and tap hearts coexist. | `styles.css`. | Keep finite scene change, sprite enter, and completion feedback only. |
| P2 | `PROLOGUE` is a mood label that adds no state beyond the opening itself. | Onboarding header at all sizes. | Remove it; retain numeric progress only when there is actual multi-step progress. |
| P2 | `This lesson` restates the side-rail context rather than adding state. | `.academy-track-label` in `app.ts`. | Remove it or replace it with progress/section data that changes a learner decision. |
| P2 | The stage has no stable loading presentation. A fresh tablet campus capture can show a blank deep-ink field until the large CG decodes. | Fresh tablet capture before image decode; image appears after decode. | Preload the selected plate or show a purposeful low-cost placeholder/skeleton that does not resemble a finished blank scene. |
| P2 | The newer transparent Rie sprite still shows magenta fringe around fine hair over a checkerboard and is full-body despite a `halfbody` filename. | Browser checkerboard inspection of `production/rie/...halfbody...png`. | Clean the alpha fringe and align crop metadata/filename before stage use. |

## Screen Decisions

| Screen | Keep | Replace or remove | Acceptance |
| --- | --- | --- | --- |
| Prologue | Doorway location, warm/cool light, direct primary action | Door overlay, `PROLOGUE` label, perpetual petals, character-bearing plate plus extra portrait | Copy readable at first paint; one Rie; primary and skip actions visible at every target size |
| Focus and affinity | Clear questions, native radio semantics, restrained paper colour | Fixed-height stage, room portrait, narrow card columns | One scroll owner; all options/actions reachable; rows remain readable at `320px` |
| Placement | Short native selects and clear back/continue actions | Duplicate Rie and static art stack | Validation error does not cover labels; keyboard and zoom keep submit reachable |
| Campus | Full-bleed place, paired mobile plate, clear next action | Character CG plus duplicate speaker image, competing top labels/progress blocks | Speaker is the visual focal point; one identity instance; place and next action read in three seconds |
| Lesson | Paper ground, context strip, strong body size, useful listening sequence | Truncated route rail, abrupt loss of scene/speaker grammar, orphaned Japanese wraps | Navigation labels distinguish routes; context remains visible; no line or action clips at `200%` zoom |

## Preserve

- The environment set's cool indigo ambient light, warm practicals, clear perspective, and authored wide/mobile pairs.
- The lesson canvas's restrained surface colours, visible focus ring, `16px` body copy, and semantic native controls.
- The compact activity metadata such as `Listening - 8 min`; unlike a decorative eyebrow, it changes learner decisions.
- The scene-to-study context band, once its crop and text remain readable at all sizes.

## Remove From The Shipping Grammar

- SVG character fallbacks in learner-facing VN paths.
- Character-bearing backgrounds combined with any second image of that character.
- Framed room portraits used as sprites.
- Perpetual petals, breathing zoom, glow loops, spark rings, and tap hearts.
- Required copy hidden by `overflow`, nowrap, line clamp, or ellipsis.
- Atmospheric or redundant eyebrows such as `Prologue`, `This lesson`, `Welcome`, or `Your journey`.

## Verification Gate

1. Run `tests/academy/visual-contract.test.ts` with no expected failures.
2. Capture onboarding steps 0-3, campus, dialogue, lesson start, validation error, and open side panel at every viewport in the Visual Bible.
3. Wait for fonts and image decode, then assert the requested screen is actually present before naming the file.
4. For every capture, programmatically require `scrollWidth <= clientWidth`; require each visible text/control box to stay within its scroll owner; require the primary action to be reachable.
5. Repeat at `200%` browser zoom, reduced motion, forced colours, keyboard-only input, and with instructional audio muted.
6. Review exact shipped raster assets on white, black, mid-grey, and their destination plate for anatomy, pseudo-text, crop, identity, lighting, and alpha fringe.

Release requires zero P0/P1 findings and a complete, correctly named screenshot matrix.
