# Academy adversarial page audit

**Audit date:** 2026-07-16
**Latest recheck:** 2026-07-16, after concurrent fixes
**Current:** `http://127.0.0.1:5185/academy/` (the supplied port root `/` was also checked)
**Reference:** `http://127.0.0.1:5190/academy/`
**Viewports:** 1440 × 900 desktop and 390 × 844 narrow phone

## Verdict

Do not replace the start. The settled current and older `Where should we begin?` frames are pixel-identical at both audited sizes (matching SHA-256 hashes). They already preserve the right promise: Rie is visibly waiting in a real classroom, the image is warm despite the rain, and the learner is offered three honest ways in. Keep that frame, its class visibility, and its emotional invitation as a reference lock.

The experience still loses confidence after entry, but the first repair wave is material. The blank port root now redirects to the Academy, the portrait chooser no longer sits under the VN sheet, and the station-platform/Japan Centre location art now loads at both sizes. The reachable world still behaves like several products superimposed on the same photographs: living paper, near-black glass, tiny edge tabs, oversized translucent worksheets, and location-specific one-offs. Named classmates still fall back to anonymous bottle-shaped silhouettes, and world navigation still clips on key desktop and phone routes. A real seven-step N1 placement check now demonstrates advanced reading and listening, but it becomes unusable at 320 px and does not yet prove the later N1 learning journey.

## Recheck status

| Rank | Queue item | Status | Before → after evidence |
| --- | --- | --- | --- |
| S0.1 | Blank supplied root | **Resolved** | [desktop before](./adversarial-page-audit/current-desktop.png) → [desktop after](./adversarial-page-audit/reaudit-2026-07-16-desktop-root.png); [phone before](./adversarial-page-audit/current-phone.png) → [phone after](./adversarial-page-audit/reaudit-2026-07-16-phone-root.png) |
| S0.2 | Portrait chooser overlap | **Resolved; follow-up exposed** | [desktop before](./adversarial-page-audit/current-desktop-03-profile-portrait.png) → [desktop after](./adversarial-page-audit/reaudit-2026-07-16-desktop-portrait.png); [phone before](./adversarial-page-audit/current-phone-03-profile-portrait.png) → [phone after](./adversarial-page-audit/reaudit-2026-07-16-phone-portrait.png) |
| S0.3 | Broken mature-location art and silhouettes | **Partially resolved** | [platform phone before](./adversarial-page-audit/current-phone-reachable-station-platform.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-phone-station-platform.png); [Japan Centre phone before](./adversarial-page-audit/current-phone-reachable-japan-centre.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-phone-japan-centre.png) |
| S0.4 | Clipped navigation/course spine | **Partially resolved; platform desktop remains** | [platform desktop before](./adversarial-page-audit/current-desktop-reachable-station-platform.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-desktop-station-platform.png); [Japan Centre phone before](./adversarial-page-audit/current-phone-reachable-japan-centre.png) → [contained route rail](./adversarial-page-audit/s0-4-japan-centre-route-rail/mobile.png) |
| Bookshop P0 | Missing/deprecated Sophie art | **Resolved for Bookshop** | [desktop arrival](./adversarial-page-audit/bookshop-2026-07-16/desktop-arrival.png); [phone arrival](./adversarial-page-audit/bookshop-2026-07-16/phone-arrival.png) |
| Bookshop P1 | Back/collectible overlap, oval decoration, duplicate location badge | **Resolved** | [desktop arrival](./adversarial-page-audit/bookshop-2026-07-16/desktop-arrival.png); [phone arrival](./adversarial-page-audit/bookshop-2026-07-16/phone-arrival.png) |
| Bookshop P1 | Living-paper consistency and concise state hierarchy | **Partially resolved** | Arrival is paper; the catalogue still changes to a dense dark-glass task: [desktop catalogue](./adversarial-page-audit/bookshop-2026-07-16/desktop-catalogue.png), [phone catalogue](./adversarial-page-audit/bookshop-2026-07-16/phone-catalogue.png) |
| S0.5 | N1 placement at 320 px | **Open — actions clipped and non-scrollable** | [320 px first question](./adversarial-page-audit/reaudit-2026-07-16-phone-320-placement-n1.png); [geometry](./adversarial-page-audit/placement-n1-reaudit-results.json) |
| N1 diagnostic | Real advanced placement content | **Materially improved; presentation/source follow-ups open** | [desktop reading](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-3.png); [desktop listening](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-5.png); [phone reading](./adversarial-page-audit/reaudit-2026-07-16-phone-placement-n1-step-3.png); [phone listening](./adversarial-page-audit/reaudit-2026-07-16-phone-placement-n1-step-5.png) |
| Root P1 | Class-filled entrance promise | **Open — current and live 5190 roots both show the generic rainy desk** | [current desktop root](./adversarial-page-audit/current-desktop-00-access.png); [5190 desktop root](./adversarial-page-audit/older-desktop-00-access.png); [ensemble source asset](../../../../public/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp); [older class-flow evidence](../direction-reset/01-complete-first-class.png) |
| Reference lock | Older/current start | **Preserved exactly** | Recheck hashes still match the older reference at both sizes: [desktop](./adversarial-page-audit/reaudit-2026-07-16-desktop-start.png), [phone](./adversarial-page-audit/reaudit-2026-07-16-phone-start.png) |

The focused recheck also ran axe on root, portrait, start, classroom, station platform, and Japan Centre at both sizes. It returned no automated violations. That does not clear the manual touch-size, clipping, copy, or identity-choice issues below. Raw follow-up measurements are in [`reaudit-results.json`](./adversarial-page-audit/reaudit-results.json).

### Bookshop seeded-item recheck

The direct Bookshop harness now passes at 1440 × 900 and 390 × 844 with no horizontal overflow, console errors, or serious/critical Axe violations. Back and the collectible are separate 44 px-or-larger targets. The purposeless oval and duplicate current-location badge are absent. The arrival dialogue uses translucent living paper with a clipped paper edge and blur rather than the previous generic slab.

Sophie now renders from `sophie__bookshop-neutral__halfbody__v003.png` as a transparent, painterly, book-holding pose. `public/academy/art/characters/sophie/inventory.json` records its dimensions, alpha, pose, angle, usage, checksum, and the completed migration from the deprecated v002 art. The deprecated file is absent after reference migration, and the public/docs inventory and v003 bytes match. This closes the requested migrate-before-delete gate for the Bookshop surface only; it does not clear the broader named-cast silhouette issue.

Remaining Bookshop issues:

- **P1 — visual-system drift:** continuing past the paper arrival replaces the task surface with a large dark-glass catalogue. It is readable, but it breaks the living-paper interaction language on the same page.
- **P1 — phone character staging:** Sophie remains identifiable, but the 390 px composition cuts most of her body and part of her face off the left edge. The crop preserves task space but weakens expression reading and the sense of talking to a person.
- **P1 — collectible wrapping:** `書店のメモ` wraps into three short lines on phone while the nearby `目録カード` label remains separate. The two paper artifacts compete for the top-right hierarchy.
- **P2 — redundant ambient status:** `First visit` and `Arranging catalogue cards` describe overlapping state without changing the learner's next decision. Keep one concise story cue.
- **P2 — world/content coherence:** `こまかい おかね / Small change` appears as a catalogue shelf beside dictionary, novel, and map. Even if source-grounded vocabulary, it does not read as a plausible bookshop category; stage it as dialogue or an object interaction instead of catalogue taxonomy.

Raw Bookshop geometry and accessibility results are in [`report.json`](./adversarial-page-audit/bookshop-2026-07-16/report.json).

### N1 placement recheck

The N1 option now opens a substantive seven-step diagnostic rather than repeating generic placement copy. The observed sequence includes grammar completion, vocabulary reading, two long advanced reading passages, two listening items, and a speaking/writing confidence check. The reading passage about technological connection and social isolation is long enough to test discourse comprehension, and the listening item asks the learner to infer what must happen before a meeting. This is credible placement evidence and should replace the earlier claim that N1 is entirely copy-only.

The presentation still fails important release gates:

- **S0 — 320 px actions are clipped, not merely below the fold:** on the first N1 question, Back begins at `y=706.8` and ends at `732.8`; Continue begins at `y=742.8` and ends at `790.8` in a 720 px viewport. The document height remains 720 px, so the learner cannot scroll to recover either action. Evidence: [320 px screenshot](./adversarial-page-audit/reaudit-2026-07-16-phone-320-placement-n1.png) and [`placement-n1-reaudit-results.json`](./adversarial-page-audit/placement-n1-reaudit-results.json).
- **P1 — prompt titles collide with the paper:** the question heading is partly hidden behind the top edge of the answer sheet on desktop reading and listening steps. On phone, the same heading sits in the seam between the progress region and paper, weakening hierarchy before a cognitively demanding task. Evidence: [desktop reading](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-3.png), [desktop listening](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-5.png), and [phone listening](./adversarial-page-audit/reaudit-2026-07-16-phone-placement-n1-step-5.png).
- **P1 — Back is undersized:** the measured Back control is only 57 × 26 px at desktop, 390 px, and 320 px. It is visually subordinate but also below the 44 px target baseline.
- **P1 — the listening source is browser speech:** both audited listening steps expose `data-audio-delivery="browser-speech"` with no packaged audio `src`. This is an honest fallback, but it cannot stand as evidence that source Moodle/Soya/textbook audio has been integrated or that natural listening conditions are being tested. Raw evidence: [`placement-n1-advanced-steps.json`](./adversarial-page-audit/placement-n1-advanced-steps.json).
- **P1 — source provenance is invisible on the diagnostic surface:** the questions may be grounded internally, but the learner and auditor cannot tell whether a passage is exact, adapted, or authored. Add a concise source/relation footer without turning the diagnostic into a bibliography.
- **P2 — long phone reading needs a deliberate scroll contract:** at 390 × 844, the first answer is only partly visible after the passage and the navigation lies below the captured viewport. Long N1 reading is appropriate; the page should make continuation and progress discoverable while preserving a comfortable line length.

The N1 check returned no automated Axe violations and no console errors at 1440 × 900 or 390 × 844. Those results do not clear the manual clipping, touch-size, or source-fidelity failures above.

### Access-root composition recheck

The current 5185 access root and the captured 5190 access root are visually identical: both place the minimal code form over a rainy desk with an empty notebook, cereal bowl, clock, and no people. The desk is competently rendered and the form is usable, but it communicates solitary self-study rather than “the class is waiting for you.” It therefore loses the strongest older Academy promise the user explicitly asked to preserve: a warm first-viewport ensemble, visible school entrance, and immediate human belonging.

The desired composition is not recoverable by simply reverting to the currently running 5190 root. Its recoverable source remains in the repository:

- [`campus-home__ensemble-spring--wide.webp`](../../../../public/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp) already contains the class, campus entrance, warm interior light, evening atmosphere, and a clear low-detail area suitable for a small access sheet.
- [`01-complete-first-class.png`](../direction-reset/01-complete-first-class.png) records the intended first-class flow and class-filled visual promise.
- [`campus-entrance__blue-hour-arrival--wide.webp`](../../../../public/academy/art/locations/wide/campus-entrance__blue-hour-arrival--wide.webp) and its mobile counterpart preserve the entrance ceremony and can support the door transition, but contain no class ensemble and therefore do not solve the root regression alone.

**P1 recovery contract:** use the ensemble source as the first-viewport signal, keep the access sheet minimal—class code, primary `Open the doors`, and quiet `Get a class code` only—and transition through the existing blue-hour doors into Rie's opening. Do not add feature copy, pricing exposition, or a dashboard to the first frame. On mobile, art-direct a dedicated crop or derived asset that keeps at least two classmates and the lit entrance visible above/around the access sheet; a center crop of the current wide ensemble risks retaining architecture while cutting away the class on the right. The form must remain fully visible at 320 × 720 and must not cover every face.

## Method and coverage

The walkthrough used the real pages and assets served by the two local apps. The current app's built-in localhost `UCL2026` fallback was exercised by making only the session exchange unavailable; no fixture page, fabricated learner record, or product-code edit was used. Screens were allowed to settle before comparison. Raw DOM measurements and route observations are in [`audit-results.json`](./adversarial-page-audit/audit-results.json).

The current app was walked through every route reachable from a fresh learner without inventing progress:

- Enrollment: access, the three profile steps, Rie unlock, starting point, manual band, N1 arrival bridge, and the seven-step N1 placement check.
- World/study: courtyard, classroom, library/review, cafe, cafeteria, street, lab, station, konbini, ramen, park, station platform, and Japan Centre.
- Class: Lesson 0 overview and its first source activity.

`home` and `bookshop` exist in the world vocabulary but had no usable incoming control in the fresh route graph. Story, journal, replay, day-end, profile-sync, writing, and later lesson routes remained progress-gated or had no visible entry; they are reported as unavailable, not passed.

Representative evidence:

- Reference lock: [current desktop start](./adversarial-page-audit/current-desktop-05-start.png), [older desktop start](./adversarial-page-audit/older-desktop-05-start-settled.png), [current phone start](./adversarial-page-audit/current-phone-05-start.png), [older phone start](./adversarial-page-audit/older-phone-05-start-settled.png)
- Opening and scaffolding: [phone portrait choice](./adversarial-page-audit/current-phone-03-profile-portrait.png), [phone Japanese start](./adversarial-page-audit/current-phone-start-ja.png), [phone N1 bridge](./adversarial-page-audit/current-phone-branch-arrival-n1.png)
- Strong living-paper examples: [desktop source activity](./adversarial-page-audit/current-desktop-reachable-source-activity.png), [phone library](./adversarial-page-audit/current-phone-reachable-review.png)
- Bookshop recheck: [desktop arrival](./adversarial-page-audit/bookshop-2026-07-16/desktop-arrival.png), [phone arrival](./adversarial-page-audit/bookshop-2026-07-16/phone-arrival.png), [desktop catalogue](./adversarial-page-audit/bookshop-2026-07-16/desktop-catalogue.png), [phone catalogue](./adversarial-page-audit/bookshop-2026-07-16/phone-catalogue.png)
- N1 placement: [320 px first question](./adversarial-page-audit/reaudit-2026-07-16-phone-320-placement-n1.png), [desktop advanced reading](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-3.png), [phone advanced listening](./adversarial-page-audit/reaudit-2026-07-16-phone-placement-n1-step-5.png)
- World problems: [desktop classroom](./adversarial-page-audit/current-desktop-reachable-classroom.png), [phone cafe](./adversarial-page-audit/current-phone-reachable-cafe.png), [phone station platform](./adversarial-page-audit/current-phone-reachable-station-platform.png), [phone Japan Centre](./adversarial-page-audit/current-phone-reachable-japan-centre.png)

## Ranked issues

### S0 — Fix before claiming a coherent playable Academy

#### 1. **Resolved** — the supplied current root was a blank 404

Before the fix, `http://127.0.0.1:5185/` returned an empty 404 document. It now redirects to `http://127.0.0.1:5185/academy/` and renders the complete class-code entrance on desktop and phone. Evidence: [desktop before](./adversarial-page-audit/current-desktop.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-desktop-root.png); [phone before](./adversarial-page-audit/current-phone.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-phone-root.png).

**Close-out:** keep the redirect smoke check. The recheck observed the `よむ Academy` title, complete entrance art, and usable controls at both sizes.

#### 2. **Resolved; follow-up exposed** — phone onboarding covered the learner's identity choice

The VN sheet no longer covers the portrait grid. All four full-body choices and `Tell Rie` are visible on phone, and the desktop composition is clean. Evidence: [phone before](./adversarial-page-audit/current-phone-03-profile-portrait.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-phone-portrait.png); [desktop after](./adversarial-page-audit/reaudit-2026-07-16-desktop-portrait.png).

**Close-out:** the page now behaves as a dedicated portrait sheet. Keep it separate from VN dialogue. Address the newly exposed identity-label issue below before treating the choice as final.

#### 3. **Partially resolved** — mature destinations shipped missing art and silent silhouette fallbacks

The broken station-platform background, Japan Centre background, and souvenir-tag art now load on phone. The art-recovery portion is resolved. The cast portion is not: Aakash and Sophie still render as the same green bottle-shaped silhouette in the rechecked mature locations. The app can name them but still cannot visually express them, so the emotional gap after Rie's opening remains.

Evidence: [platform before](./adversarial-page-audit/current-phone-reachable-station-platform.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-phone-station-platform.png); [Japan Centre before](./adversarial-page-audit/current-phone-reachable-japan-centre.png) → [after](./adversarial-page-audit/reaudit-2026-07-16-phone-japan-centre.png). The new DOM inspection recorded zero broken images and one silhouette on each rechecked location.

**Remaining fix:** keep the repaired location assets and finish the named-cast contract. A named cast member needs at least a readable neutral pose before the location is reachable. Use a designed paper portrait fallback—not anonymous geometry—when an expression asset is absent.

#### 4. **Partially resolved** — navigation is a clipped location carousel, not a dependable course spine

The platform phone rail and Japan Centre phone rail are now contained. Japan Centre's three destinations use a bounded three-column route rail at 390 px instead of extending the ramen route to `x=454`; the focused browser harness passes desktop, phone, and reduced-motion phone with no horizontal overflow, clipped primary surfaces, console errors, or Axe violations. The core issue remains on desktop: the platform action panel still runs to `x=1600` in a 1440 px viewport, cutting the primary action. The utility menu still exposes language/presentation controls but no dependable route map. `home` and `bookshop` remain modeled without a usable fresh-state incoming control; journal/replay/story remain undiscoverable before progress gates.

Evidence: [phone Japan Centre before](./adversarial-page-audit/current-phone-reachable-japan-centre.png) → [contained route rail](./adversarial-page-audit/s0-4-japan-centre-route-rail/mobile.png), [reduced-motion phone](./adversarial-page-audit/s0-4-japan-centre-route-rail/mobile-reduced-motion.png), [desktop harness](./adversarial-page-audit/s0-4-japan-centre-route-rail/desktop.png), [desktop platform still open](./adversarial-page-audit/reaudit-2026-07-16-desktop-station-platform.png), and raw earlier measurements in `reaudit-results.json`.

**Fix:** retain diegetic exits, but add one stable paper route sheet with current place, available destinations, class, library, story, journal, and Back. It must fit at 320–390 px without cropped destinations. Remove or explicitly mark dead incoming routes.

#### S0.5. **Open** — N1 placement traps learners at 320 px

The diagnostic's first question renders both Back and Continue below the physical viewport while reporting no scrollable document height. This is a hard stop on a supported narrow-phone width, not a preference or polish issue. The question itself remains readable, so the failure appears only when the learner tries to act.

Evidence: [320 px placement](./adversarial-page-audit/reaudit-2026-07-16-phone-320-placement-n1.png) and [`placement-n1-reaudit-results.json`](./adversarial-page-audit/placement-n1-reaudit-results.json).

**Fix:** allow the placement route to grow and scroll naturally; keep its actions in normal flow or a safe sticky footer; preserve bottom safe-area padding. Verify every one of the seven steps at 320 × 720, including the longest reading passage and browser zoom.

### S1 — High-value repairs

#### R1. The access root opens on an empty desk instead of the class

The current and 5190 roots both show the same solitary rainy desk. This is functional but generic, and it contradicts the explicit reference lock that the Academy begins with people, place, warmth, and an entrance ceremony. The issue is separate from the later `Where should we begin?` frame, which remains correctly preserved.

Evidence: [current desktop](./adversarial-page-audit/current-desktop-00-access.png), [5190 desktop](./adversarial-page-audit/older-desktop-00-access.png), [current phone](./adversarial-page-audit/current-phone-00-access.png), [5190 phone](./adversarial-page-audit/older-phone-00-access.png), and the recoverable [ensemble asset](../../../../public/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp).

**Fix:** recover the class-filled source asset into the access runtime, preserve the three-control maximum, then art-direct a phone crop that keeps classmates and the doorway as first-viewport signals. Use the existing blue-hour entrance art for the door transition, not as a classless replacement for the access composition.

#### N1. **Newly exposed** — portrait labels describe props while the choice changes identity

Once the overlap was removed, a semantic problem became visible. The four choices are accessible and captioned as `Camera and folded map`, `Planner and study cards`, `Offering a card`, and `Pencil and notebook`, but the images change the learner's whole embodied appearance, including face, hair, build, and gender presentation. A learner choosing a camera can reasonably believe they are choosing a prop or personality cue, not selecting how they will be represented throughout the fiction. The thin selected border does not explain that consequence. On phone, `Back` also begins below the first 844 px viewport, so reconsidering the choice requires a small scroll.

Evidence: [desktop repaired chooser](./adversarial-page-audit/reaudit-2026-07-16-desktop-portrait.png) and [phone repaired chooser](./adversarial-page-audit/reaudit-2026-07-16-phone-portrait.png). The phone DOM placed `Back` at `y=833–879`.

**Fix:** say explicitly that this chooses the learner's story appearance. Give each option an appearance-aware accessible description in addition to its prop/personality cue, and state whether it can be changed later. Keep the full, non-overlapping paper layout.

#### 5. The visual system splits between living paper and dark transparency

The start, library, arrival bridge, lesson plan, and VN source activity are the strongest surfaces because they read like handled paper placed in a real scene. By contrast, street, station, platform, and Japan Centre put dense copy on dark translucent rectangles or near-black bars. Cafe introduces a third system: a small order slip pinned over a dark world. The learner repeatedly has to relearn where title, Back, action, evidence, and destination controls live.

Evidence: [desktop Lesson 0](./adversarial-page-audit/current-desktop-reachable-classroom-activity-class.png), [desktop source activity](./adversarial-page-audit/current-desktop-reachable-source-activity.png), [phone library](./adversarial-page-audit/current-phone-reachable-review.png), [desktop classroom](./adversarial-page-audit/current-desktop-reachable-classroom.png).

**Fix:** make living paper the interaction layer. Keep dark transparency for atmosphere labels and momentary captions only. A task should use one paper surface with a consistent source line, prompt, controls, feedback, and replay affordance.

#### 6. World screens are compositionally overfull on desktop and cramped on phone

Desktop classroom tries to show place identity, five exits, Rie, a stamp, an ambient object, the practice, Back, and utility controls at once. The central paper loses contrast over the scene and competes with tiny edge text. Phone often avoids overlap by turning the same elements into a long or clipped perimeter, leaving the main character isolated in unused space.

**Fix:** establish a scene budget: location plate, one character beat, one active task, and one navigation affordance. Move secondary exits and props behind the route sheet. Do not render every available system simultaneously.

#### 7. The story promise becomes task-directory copy

The opening gives Rie a voice and a reason to care. Most world exits immediately become implementation-style summaries: “Open the current lesson plan, syllabus, and practice path,” “Earn it by completing today's activity,” or “Opens with the grounded … lesson.” These are useful QA labels, not story dialogue. Classmates are often a name plus an exercise rather than people with reactions, callbacks, or expressive poses.

**Fix:** keep source and state truth in a secondary line, but let the primary copy be an invitation from a person in the place. Preserve Rie's warmth and extend it to Aakash, Felix, Sophie, and the class through expressions, short reactions, and journal callbacks.

#### 8. The first playable loop delays replay and ownership

The library says “Nothing is due,” the campus journal is locked behind today's activity, and story/replay are not visible in the fresh graph. A learner can perform isolated world tasks, but cannot yet see the loop: encounter → attempt → evidence → journal/replay → changed relationship or route.

**Fix:** after the first small task, visibly award one paper artifact, one review item, and one journal line. Offer replay immediately from the success state. Teach the loop before exposing a large world.

#### 9. **Partially resolved** — N1 placement is real; the N1 journey is not yet proven

The seven-step N1 check now demonstrates advanced reading length, inference, vocabulary, listening, and productive-skill confidence. That is a meaningful correction. The bridge into N1 still shows only `Meet the class` and a generic promise that Rie will catch the learner up, and the audited route does not yet demonstrate the first placed lesson, adaptive support, story continuity, source comparison, or a durable N1 review loop. The listening check currently uses browser speech rather than a natural source recording.

Evidence: [manual bands](./adversarial-page-audit/current-phone-branch-manual-band.png), [N1 bridge](./adversarial-page-audit/current-phone-branch-arrival-n1.png), [advanced reading](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-3.png), [advanced listening](./adversarial-page-audit/reaudit-2026-07-16-desktop-placement-n1-step-5.png), and [`placement-n1-advanced-steps.json`](./adversarial-page-audit/placement-n1-advanced-steps.json).

**Fix:** preserve the real diagnostic, then make its result lead to a visible first task and support model. N1 needs an authentic or clearly sourced text, synthesis/productive response, natural listening audio, adaptive scaffolding, and an explanation of how earlier plot continuity is summarized without infantilising the learner.

#### 10. Source fidelity is unusually good, but the presentation hides it

Reachable tasks name concrete Moodle, Minna no Nihongo, and Genki relations, and the source activity shows the source page alongside the VN. This is a genuine strength. In dark world panels the source line is tiny, low-contrast, and placed below the choices, so it reads like legal fine print rather than teaching provenance.

**Fix:** preserve the exact source labels. Put them on a consistent paper footer with a short relation label such as “exact task,” “sequence adaptation,” or “recognition support.” Let learners open the source sheet from the same surface.

### S2 — Important polish and accessibility

#### 11. Touch and reading affordances fall below a reliable phone baseline

Observed controls include a 30 px-high character action, a 38 px-high Listen button, a 40 px-wide `CD` choice, and a 42 px-high shop-bell control. The `記 / 読 / 訳` controls are visually terse and require prior knowledge. Furigana-rich answers wrap awkwardly—sometimes splitting a base word across lines—inside narrow dark cards.

**Fix:** use a 44 × 44 px minimum target box, expand the reading controls to named actions on first use, and prevent ruby/base-word fragmentation inside choices. Test at 320 px as well as 390 px.

#### 12. Contrast and hierarchy vary with the photograph

Muted English help, source lines, and exit descriptions are frequently gray on black transparency or pale paper over a detailed photo. Rain streaks and scene landmarks run behind text. The library and VN paper panels remain readable because they provide an opaque reading field; world cards do not consistently do so.

**Fix:** use opaque or near-opaque paper for instructional copy, reserve photo overlay text for short labels, and run automated contrast checks on every plate rather than only on color tokens.

#### 13. Motion decorates the world but does not clarify state change

Rain and scene movement create atmosphere, but the route changes themselves can spend noticeable time in visually empty or partially assembled frames before settling. The moving rain layer also crosses dense desktop task panels. There is no visible explanation of what changed after an action; first-visit, practice-ready, and destination-transition states can look like layout churn.

**Fix:** keep ambient motion subtle and behind opaque paper. Use one short, deterministic paper transition to explain state change. Verify `prefers-reduced-motion` with screenshots and ensure the settled content never depends on an animation finishing.

#### 14. Japanese scaffolding exists, but it is not yet a teaching system

The start fully switches to Japanese and showed no visible `未翻訳`; this is good. In world tasks, Japanese, ruby, English glosses, source labels, and the `記 / 読 / 訳` tools compete rather than form a clear scaffold ladder. The learner is not told when a support will fade or what independent performance looks like.

Evidence: [Japanese phone start](./adversarial-page-audit/current-phone-start-ja.png), [phone street](./adversarial-page-audit/current-phone-reachable-street.png).

**Fix:** define three explicit support states—full reading/meaning, reading only, and Japanese only—and make the current state legible. Record support use and invite replay at one step less support.

#### 15. Multimodality is present but uneven

The reachable slice includes listening buttons, native audio controls, source imagery, recognition choices, and some manipulation. That is stronger than a text-only course. Speaking, writing, and replayable production are promised in Lesson 0 but not visible in the first settled task; several world screens still reduce multimodality to “Listen, then tap one of three.”

**Fix:** show one short listen–notice–produce cycle in the first 10 minutes. Use the same sentence across audio, source image, typed/spoken production, feedback, and replay so modalities reinforce one learning object.

## Reference lock: what must survive cleanup

1. Keep the settled start's exact emotional composition: Rie fully visible, warm classroom, rain outside, strong face, and three starting choices.
2. Keep the entrance ceremony language: the learner is joining a class, not opening a dashboard.
3. Keep Rie's calm adult warmth and the fiction disclosure.
4. Keep exact source ownership and the source page shown inside the lesson.
5. Keep living paper as the tactile identity of decisions, lessons, evidence, and replay.
6. Keep Japanese mode complete at the first decision point.

## Recommended cleanup sequence

1. Finish the two remaining S0 slices: named-cast portraits and unclipped route/action controls at platform and Japan Centre.
2. Clarify what the repaired portrait chooser changes and make its accessible names describe appearance as well as props.
3. Establish one responsive world shell and one opaque living-paper task surface; migrate classroom, street, station, platform, and Japan Centre before adding more locations.
4. Make the first success unlock journal + one review + immediate replay.
5. Repair the real N1 diagnostic at 320 px, then prove its placed first lesson and one productive multimodal loop.
6. Remove or reconnect dead route vocabulary (`home`, `bookshop`, and any modeled destination with no live inbound control) before expanding the map.

## Release bar

This slice is not ready to be described as a coherent zero-to-N1 Academy until all S0 items are closed, the first task visibly completes the replay loop, and the real N1 diagnostic leads to a reachable placed lesson. The older/current start itself already passes; treat any visual change to that frame as a regression unless it preserves the same class, warmth, and promise.
