# Narrative stream backlog

One ordered stream; no phase or stage grouping. An item is complete only when its acceptance evidence exists.

- [x] Pin explicitly licensed Japanese script corpora with upstream revisions, licences, hashes, and exclusions.
- [x] Record Pokemon and Persona transcripts as citation-only references rather than mirroring unlicensed game dialogue.
- [x] Publish derived pacing, voice, callback, bond, rhythm, and language-progression findings without source dialogue.
- [x] Establish the four-season, 48-chapter canon and finite graduation ending.
- [x] Reconcile the actual cast registry with prose, lesson, and likeness eligibility.
- [x] Define the class-continuity/elective-appointment lattice, diegetic consent, private-source, withdrawal, and portrayal contracts.
- [x] Specify the end-to-end canon, lesson, class-thread, appointment, return, placement, and graduation stream.
- [x] Specify typed script units, fictional message nodes, state ownership, evidence hooks, replay isolation, callbacks, and validation gates.
- [x] Publish voice contrast, pressure behavior, class-thread cadence, original diagnostics, and naturalness rejection tests.
- [x] Publish the finite plot-level callback ledger with changed-meaning transitions and use budgets.
- [x] Map Seasons 1–2 to the actual Lesson 0 and numbered Level 1/2 package reservoirs.
- [x] Separate grounded world locations from planned narrative homes and define location-hook acceptance.
- [x] Mark N3–N1 content as a real release dependency instead of inventing package IDs or claiming it is shipped.
- [ ] Record an ADR for the 24-to-48 chapter migration, event projection compatibility, and moved postgame gate.
- [ ] Rename the class-event catalog's band-valued `season` field to `curriculumBand` and add an explicit four-season story reference without changing event IDs.
- [ ] Add `story-package.v2` TypeScript types and a parser in a focused narrative module.
- [ ] Add a compiler or loader that keeps authored JSON independent from the DOM and presentation engine.
- [ ] Add validators for graph reachability, checkpoints, cast caps, consent routes, callback lifecycle, language invariants, and source safety.
- [ ] Add the explicit prefixed-story-location to `WorldPlaceId` alias resolver and reject unknown or ungrounded gating locations.
- [ ] Add a relationship manifest with `continuity-only`, `bond-authored`, and `hold` states; do not derive it from story eligibility.
- [ ] Add the fictional class-thread compiler and prove it accepts no raw timestamps, usernames, external attachments, or private-chat source fields.
- [ ] Add structured lesson/component/exercise references to chapters 1–24 and replace descriptive hook strings after parity tests pass.
- [ ] Add a migration projection from completed episode 24 to `seasonTwoCompleted` while preserving old event history.
- [ ] Move `calendar:lantern-atlas-review` behind chapter 48 and retain an explicit legacy review route during migration.
- [ ] Review episode 24 prose and presentation so it closes the first exhibition without implying graduation or permanent plot completion.
- [ ] Author and register grounded N3 package families for chapters 25–30 across listening, reading, speaking, writing, and transfer.
- [ ] Author and register grounded N2 package families for chapters 31–39 across quotation, evidence, permission, correspondence, and refusal.
- [ ] Author and register grounded N1 package families for chapters 40–48 across synthesis, ambiguity, mediation, public inquiry, and graduation composition.
- [ ] Write chapter 25 and prove a complete need-input-lesson-repair-transfer-consequence-return loop.
- [ ] Write chapters 26–36 with one lead, at most two supports, and explicit portrayal/consent snapshots.
- [ ] Write chapters 37–48 and verify the seven ending facts without omniscient overclaim or unresolved central plot.
- [x] Produce and audit five class-continuity beats for each non-textbook story-eligible person across the four seasons.
- [ ] Author six-appointment routes only for consent-cleared `bond-authored` entries, then audit spacing, activity variety, fallback lines, and emotional duplication.
- [ ] Hold Shaun's lesson ownership and broader voice until registry evidence changes; keep current use story-bounded.
- [ ] Keep Mary and Takeshi to sparse source-grounded legend cameos until original voice cards pass review.
- [ ] Build the callback ledger and budget every seed, echo, transform, and payoff across all 48 chapters.
- [ ] Bind each package callback use to the canonical ledger with exact prior scene, use number, changed meaning, and optional fallback.
- [ ] Author Foundation-to-N1 line and message variants against semantic beat IDs; review Japanese for naturalness at every layer.
- [ ] Create reviewed voice cards for every speaking role and run adjacent-speaker contrast plus voice-stripping tests per scene.
- [ ] Add NG+ support reduction and perspective variants without introducing new canonical facts or consent changes.
- [ ] Author the first alumni storylet and prove it requires graduation without reopening the atlas plot.
- [ ] Bind portrait use to registry eligibility plus exact asset revision/hash and provide name-only presentation fallbacks.
- [ ] Add withdrawal-safe replay fallbacks that preserve generic learner evidence but remove retired dialogue and portrait bytes.
- [ ] Run copyright similarity review against all research paths and reject any source line, close paraphrase, proprietary name, or distinctive plot import.
- [ ] Run adversarial cast-consent review, Japanese editorial review, pedagogy review, and narrative continuity review.
- [ ] Prove desktop, tablet, and phone resume at every activity boundary and season hinge with no overlapping UI or lost state.
- [ ] Prove placement bridges for N4, N3, N2, and N1 preserve chronology without auto-completing scenes or relationships.
- [ ] Prove replay and practice remixes can append learning evidence but cannot append canon, relationships, unlocks, or graduation.
- [ ] Publish the runtime only after the code, content registry, learner-event migration, tests, docs, and deployed assets agree on chapter 48 as the finite ending.

## Scene-signature execution backlog

Finite queue derived from `SCENE-SIGNATURE-MATRIX.md`. A row is complete only when its acceptance evidence exists. “Authored” and “runtime-bound” are separate states: the 105 source signatures are already authored, but most still need explicit presentation binding.

### Frozen ownership sets

These sets keep parallel work file-disjoint. An owner may not edit outside the assigned set without handing the item back for re-planning.

#### O-RUNTIME · shared contract

- `src/academy/content/story-signature-schema.ts` (new)
- `src/academy/content/story-signature-runtime.ts` (new)
- `src/academy/content/story-runtime.ts`
- `src/academy/content/story-runner.ts`
- `src/academy/domain/learner-record.ts`
- `tests/academy/story-signature-runtime.test.ts` (new)
- `tests/academy/learner-record.test.ts`

#### O-UI · prop, hotspot, talk, and motion host

- `src/academy/ui/story-signature-object.ts` (new)
- `src/academy/ui/story-screen.ts`
- `src/academy/ui/vn-stage.ts`
- `src/academy/vn/performance-contract.ts`
- `src/academy/vn/performance-engine.ts`
- `src/academy/styles/story-signatures.css` (new)
- `tests/academy/story-screen.test.ts`
- `tests/academy/vn-stage.test.ts`
- `tests/academy/vn-performance-engine.test.ts`

#### O-CONTENT-1 · U001–U033, Chapters 1–12

- `src/academy/content/story-sources/s1e01-the-blank-atlas.v2.json`
- `src/academy/content/story-sources/s1e02-margin-map.v2.json`
- `src/academy/content/story-sources/s1e03-route-zero.v2.json`
- `src/academy/content/story-sources/s1e04-welcome-frequency.v2.json`
- `src/academy/content/story-sources/s1e05-final-boss-kana.v2.json`
- `src/academy/content/story-sources/s1e06-invitation-chain.v2.json`
- `src/academy/content/story-sources/s1e07-no-spoilers.v2.json`
- `src/academy/content/story-sources/s1e08-menu-without-pictures.v2.json`
- `src/academy/content/story-sources/s1e09-the-story-in-two-tenses.v2.json`
- `src/academy/content/story-sources/s1e10-instructions-for-a-cloud.v2.json`
- `src/academy/content/story-sources/s1e11-storm-route-variant.v2.json`
- `src/academy/content/story-sources/s1e12-the-vanishing-course.v2.json`

#### O-CONTENT-2 · U034–U057, Chapters 13–24

- `src/academy/content/story-sources/s1e13-dinner-by-if.v2.json`
- `src/academy/content/story-sources/s1e14-two-answers.v2.json`
- `src/academy/content/story-sources/s1e15-chorus-with-a-hole.v2.json`
- `src/academy/content/story-sources/s1e16-the-night-the-map-went-dark.v2.json`
- `src/academy/content/story-sources/s1e17-catwalk-clue.v2.json`
- `src/academy/content/story-sources/s1e18-the-memory-card-museum.v2.json`
- `src/academy/content/story-sources/s1e19-seventy-percent-door.v2.json`
- `src/academy/content/story-sources/s1e20-map-from-memory.v2.json`
- `src/academy/content/story-sources/s1e21-questions-in-the-dark.v2.json`
- `src/academy/content/story-sources/s1e22-blank-space.v2.json`
- `src/academy/content/story-sources/s1e23-farewell-rehearsal.v2.json`
- `src/academy/content/story-sources/s1e24-lanterns-return.v2.json`

#### O-CONTENT-3 · U058–U081, Chapters 25–36

- `src/academy/content/story-sources/s3e01-after-the-applause.v2.json`
- `src/academy/content/story-sources/s3e02-caption-without-owner.v2.json`
- `src/academy/content/story-sources/s3e03-helpful-rewrite.v2.json`
- `src/academy/content/story-sources/s3e04-terms-of-invitation.v2.json`
- `src/academy/content/story-sources/s3e05-chair-not-reserved.v2.json`
- `src/academy/content/story-sources/s3e06-two-schedules.v2.json`
- `src/academy/content/story-sources/s3e07-under-the-subtitle.v2.json`
- `src/academy/content/story-sources/s3e08-right-screen-wrong-draft.v2.json`
- `src/academy/content/story-sources/s3e09-what-we-can-say.v2.json`
- `src/academy/content/story-sources/s3e10-empty-microphone.v2.json`
- `src/academy/content/story-sources/s3e11-names-in-the-margin.v2.json`
- `src/academy/content/story-sources/s3e12-permission-page.v2.json`

#### O-CONTENT-4 · U082–U105, Chapters 37–48

- `src/academy/content/story-sources/s4e01-return-address.v2.json`
- `src/academy/content/story-sources/s4e02-map-of-claims.v2.json`
- `src/academy/content/story-sources/s4e03-polite-no.v2.json`
- `src/academy/content/story-sources/s4e04-three-true-versions.v2.json`
- `src/academy/content/story-sources/s4e05-left-unsaid.v2.json`
- `src/academy/content/story-sources/s4e06-open-question.v2.json`
- `src/academy/content/story-sources/s4e07-journey-not-everyone-takes.v2.json`
- `src/academy/content/story-sources/s4e08-last-revision.v2.json`
- `src/academy/content/story-sources/s4e09-rehearsal-for-leaving.v2.json`
- `src/academy/content/story-sources/s4e10-public-evening.v2.json`
- `src/academy/content/story-sources/s4e11-atlas-closes.v2.json`
- `src/academy/content/story-sources/s4e12-next-page.v2.json`

#### O-ART · approval import and runtime bindings

- Owner-supplied approved-art JSON (read-only input; exact path must be recorded when delivered)
- `src/academy/assets.ts`
- `public/academy/art/ASSET-USAGE.json`
- only the exact approved `public/academy/art/items/*` files named by `N[...]` rows in the matrix
- `tests/academy/runtime-asset-registry.test.ts`
- `tests/academy/academy-asset-registry.test.ts`

#### O-AUDIO · semantic audio only

- `src/academy/audio/sfx-catalog.ts`
- `src/academy/audio/manifest.json`
- `public/academy/content/audio/sfx-catalog.json`
- `tests/academy/audio-manifest-sfx.test.ts`
- `tests/academy/vn-shinday-audio.test.ts`

#### O-VERIFY · integration evidence

- `tests/academy/story-signature-matrix.test.ts` (new)
- `tests/academy/story-catalog.test.ts`
- `scripts/qa-audit.mjs`
- `docs/academy/evidence/scene-signatures/` (new generated evidence only)

### Ranked queue

| Rank | Status | Item | Exact ownership | Acceptance test | Integration dependency |
| ---: | --- | --- | --- | --- | --- |
| 0 | **DONE** | Inventory 48 canonical packages, 105 scene IDs, 290 stage nodes, actual runtime seams, art authority, and SFX catalog; choose one signature per scene. | `docs/academy/story/SCENE-SIGNATURE-MATRIX.md`, this file | `jq -s` over the 48 packages reports `105` scenes and `0` without stage nodes; the matrix has U001–U105 exactly once and verdict total 105. | None. This design delivery is the queue's authority. |
| 1 | **DONE** | Existing authored signatures: every canonical scene already has at least one special stage detail. | The 48 files in O-CONTENT-1 through O-CONTENT-4, read-only for this delivered state | Census reports 290 stage nodes and no scene without one. This is **source-authored**, not a claim that runtime presentation is complete. | None. |
| 2 | **DONE** | Existing VN presentation primitives: object slot, deterministic scene/node hooks, one-shot pose/scene/camera grammar, reduced-motion cut, modest parallax, and stage disposal. | `src/academy/ui/vn-stage.ts`, `src/academy/vn/performance-contract.ts`, `src/academy/vn/performance-engine.ts`, `src/academy/ui/story-screen.ts` | Current `tests/academy/vn-stage.test.ts`, `vn-performance-engine.test.ts`, and `story-screen.test.ts` cover the delivered primitives. | None; extend, do not replace. |
| 3 | **DONE** | Existing art authority and bound finale/event art. | `src/academy/assets.ts`, `public/academy/art/ASSET-USAGE.json` | Runtime registry contains 71 records; `event.empty-microphone-rehearsal`, `event.withheld-panel-handoff`, and `event.atlas-finale-next-page` are approved and mapped to eight matrix rows. | None. New art remains separate. |
| 4 | **DONE** | Existing semantic SFX catalog with honest gaps. | O-AUDIO | Catalog reports 26 cues: 19 mapped, 7 gaps. Physical door/arrival/footstep gaps resolve to silence. | None. |
| 5 | **READY** | Freeze the deep signature descriptor and one-time event. Add `scene-signature-triggered` as non-canonical, idempotent state; validate `kind`, `assetId`, `motion`, `reducedMotion`, `interaction`, `optionalTalk`, `callbackId`, and `dossierRef`. | O-RUNTIME only | `npm test -- tests/academy/story-signature-runtime.test.ts tests/academy/learner-record.test.ts`; duplicate `(sceneId, signatureId)` projects once; replay/canon/bond/graduation projections are unchanged. | Ranks 0–4. Blocks all content binding. |
| 6 | **READY** | Build the focused UI host for static props, one-time hotspots, SD choices, and settled replay. Keep `story-screen.ts` as orchestration and `vn-stage.ts` as generic presentation. | O-UI only | `npm test -- tests/academy/story-screen.test.ts tests/academy/vn-stage.test.ts tests/academy/vn-performance-engine.test.ts`; mouse, Enter, Space, touch, Escape/Not now, disposal, and `prefers-reduced-motion` pass; no hotspot below 44 × 44 CSS px. | Rank 5 descriptor. Can run alongside content drafting after schema freeze. |
| 7 | **READY** | Bind U001–U033 without changing dialogue/canon. Keep 23 rows as authored and refine the 10 marked rows only. | O-CONTENT-1 only | Schema test loads all 12 files; exact 33 signature IDs occur once; each row's DOM key and deterministic outcome match the matrix; callback IDs resolve to `CALLBACK-LEDGER.md`. | Rank 5. UI snapshots may use the Rank 6 harness. |
| 8 | **READY** | Bind U034–U057 without changing dialogue/canon. Keep 19 rows as authored and refine the 5 marked rows only. | O-CONTENT-2 only | Schema test loads all 12 files; exact 24 signature IDs occur once; door/notebook/SD paths settle idempotently; no hidden-content bytes enter DOM. | Rank 5. File-disjoint from Ranks 7, 9, 10. |
| 9 | **READY** | Bind U058–U081 without changing dialogue/canon. Keep 20 rows as authored and refine the 4 marked rows only. | O-CONTENT-3 only | Schema test loads all 12 files; exact 24 signature IDs occur once; withheld content is absent, permission state remains scoped, and event art stays registered. | Rank 5. File-disjoint from Ranks 7, 8, 10. |
| 10 | **READY** | Bind U082–U105 without changing dialogue/canon. Keep 19 rows as authored and refine the 5 marked rows only. | O-CONTENT-4 only | Schema test loads all 12 files; exact 24 signature IDs occur once; atlas closes once, graduation remains finite, and no ending choice is ranked. | Rank 5. File-disjoint from Ranks 7–9. |
| 11 | **READY** | Enforce the per-character story-dossier gate for all 10 optional-talk rows: U015, U037, U051, U055, U059, U065, U077, U091, U093, U095. | O-VERIFY test file only; matrix and 24 files under `docs/academy/story/dossiers/` remain read-only | `npm test -- tests/academy/story-signature-matrix.test.ts`; parse the chosen-signature cell after stripping emphasis and select `(?:^|\+\s)SD (?<character>[A-Z][A-Za-z-]*) /`, including compound hotspot/door forms. Every match has exactly one `Story dossier:` path under `docs/academy/story/dossiers/`; its filename equals the normalized captured character, its `§` heading exactly resolves in that file, and its quoted concept occurs in the normalized Markdown text of that section. Discovery-only or callback-only provenance fails. Test expects exactly 10 SD rows. | Rank 0 matrix. Can run before runtime work. |
| 12 | **READY** | Enforce callback provenance and finite budgets for all SU rows. | O-VERIFY test file only | Same matrix test extracts each SU `callback:*`, resolves it in `docs/academy/story/CALLBACK-LEDGER.md#plot-callbacks`, verifies lifecycle order and use budget, and rejects recognition-only duplicate uses. | Rank 0 matrix; independent of Rank 11 implementation. |
| 13 | **WAITING-APPROVAL** | Import only owner-approved `N[...]` art, bind exact hashes/paths, and leave every unapproved row on its declared Text/CSS or name-only fallback. Never bulk-approve the 1,743 review files. | O-ART only | Registry tests pass; every imported file exists and matches approved JSON; rejected/unlisted files have zero runtime references; mobile crop and alt review recorded. | Owner-supplied approved-art JSON. Does **not** block Ranks 5–12. |
| 14 | **READY** | Preserve mapped SFX and silence gaps. If owner-approved physical sounds arrive, add semantic mappings with provenance and fixed captions; otherwise ship silent doors/arrivals. | O-AUDIO only | `npm test -- tests/academy/audio-manifest-sfx.test.ts tests/academy/vn-shinday-audio.test.ts`; no row maps `menu.confirm`/`scene.advance` to a physical door; audio unlocks only after gesture. | Rank 5 cue shape; new physical audio is optional. |
| 15 | **BLOCKED-BY 5–12** | Integrate the four content tranches with runtime/UI, then run the full deterministic matrix. | O-RUNTIME + O-UI + O-VERIFY under one integrator; content sets read-only during merge | Matrix test reports 48 packages, 105 scene IDs, 105 signatures, 81 Keep, 24 Refine, 0 Missing, 12 persisted hotspots, 10 SD talks, 0 unresolved SU IDs, 0 uncited SD rows. Focused tests and `npm run check` pass. | Ranks 5–12. Art Rank 13 may remain on fallbacks; audio Rank 14 may remain silent. |
| 16 | **BLOCKED-BY 15** | Browser QA on real Academy routes, desktop + phone + reduced motion. Capture DOM evidence, not fixture screenshots as visual proof. | O-VERIFY only | `npm run qa`; evidence records every refined interaction, keyboard/touch parity, settled replay, 44 px targets, no horizontal overflow, no motion under reduction, no duplicate learner event, and no `未翻訳`. | Rank 15 integrated build. |
| 17 | **BLOCKED-BY 16** | Final adversarial review: visual noise, source safety, consent, callback load, performance, and approval gates. | Review-only across integrated diff; no new ownership | Reviewer confirms one signature per scene, no generic loops/particles, no coerced talk, no unapproved likeness/art, no hidden-content leak, and no callback over-budget. `npm run check` remains green after fixes. | Rank 16 evidence. Required before release integration. |

### Top disjoint tranches

After Rank 5 freezes the schema, the highest-value parallel work is:

1. **Content A:** O-CONTENT-1, U001–U033, 33 scenes.
2. **Content B:** O-CONTENT-2, U034–U057, 24 scenes.
3. **Content C:** O-CONTENT-3, U058–U081, 24 scenes.
4. **Content D:** O-CONTENT-4, U082–U105, 24 scenes.
5. **UI host:** O-UI, with no story JSON ownership.
6. **Approval lane:** O-ART and O-AUDIO, mutually disjoint and non-blocking while fallbacks/silence remain valid.

The four content tranches total 105 scenes with no shared package file. Rank 11 dossier verification and Rank 12 callback verification can start immediately because they read the completed matrix rather than runtime code.

### Stop conditions

- Do not start an `N[...]` asset without a matching owner-approved JSON record.
- Do not add an SD talk without its matching per-character story-dossier path, exact section heading, quoted in-section concept, optional no-talk path, and non-canonical event assertion.
- Do not invent a callback ID or exceed `CALLBACK-LEDGER.md` because a prop looks reusable.
- Do not make a physical sound from a UI cue. Silence is the correct fallback for an unmapped door, arrival, or footstep.
- Do not add a second flourish to “improve” a Keep row. Bind the chosen detail and stop.
