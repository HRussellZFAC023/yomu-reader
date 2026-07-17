# One-Shot Production Runbook

## Living files

Create these first on `main` and update them after every stage:

- `docs/academy/STATUS.md` - current stage, green/red gates, next three actions.
- `docs/academy/BACKLOG.md` - ordered work with acceptance criteria and evidence links.
- `docs/academy/DECISIONS.md` - only surprising, hard-to-reverse decisions.
- `docs/academy/SESSION-LOG.md` - dated summaries of edits, tests, screenshots, and blockers.
- `docs/academy/MEMORY.md` - product truth that must survive context changes.
- `public/academy/content/RESOURCE-LEDGER.json` - generated denominator/coverage counts.
- `public/academy/art/ASSET-USAGE.json` - asset provenance, verdict, runtime home, status.

A stage closes only when code, tests, browser evidence, and living files agree.

## Stage 0: establish the clean base

1. Confirm `/Users/heru/Documents/Projects/yomu/apps/yomu-reader` is on `main`, preserve unrelated local changes, and integrate current `origin/main`.
2. Record current commit and all donor/worktree commits.
3. Clone reference engines shallowly into `references/academy-engine/` and record hashes.
4. Copy this discovery pack into `docs/academy/discovery/`.
5. Generate diff inventories for Donor A, Donor B, and every Codex worktree listed in `DISCOVERY-BASELINE.md`.
6. Add no runtime code until the salvage ledger says KEEP, ADAPT, or REJECT for each patch.

Gate: coherent `main`, reproducible baseline, preserved unrelated work, and no donor mutation.

## Stage 1: skeleton and vertical slice

1. Port the reviewed Donor B shell, engine, world, journal, bonds, map, and activity interfaces.
2. Reconcile with current Reader APIs rather than copying stale Reader internals.
3. Port the best isolated patches: abortable scenes, map navigation, onboarding, responsive contract, audio controller, SRS bridge, Doodle, PWA, accessibility harness.
4. Bind approved campus, Rie, classroom, and first-event art.
5. Build one end-to-end slice: code entry -> Rie opening -> player profile -> choose Lesson 0, manual JLPT band, or optional mock -> placement recommendation and midstream story bridge where selected -> campus -> lesson fork -> one complete source activity -> SRS event -> character unlock -> journal replay -> offline resume.

Gate: the first 15 minutes look and behave like the intended product on desktop and phone.

## Stage 2: source pipeline

1. Rebuild the source ledger from all Moodle archives and local Japanese sources.
2. Run PDF page/object/media census.
3. Upgrade worksheet schema to immutable source plus augmentation.
4. Import the 44 existing packs after validator migration.
5. Process remaining unique documents in resumable batches.
6. Produce teacher/editor side-by-side source comparison.

Gate: every Moodle payload has a status; every processed document has source-question and media counts; no image-dependent task is silently text-only.

## Stage 3: complete class chronology

1. Author all 73 class weeks and bind every source occurrence.
2. Repair missing Minna 24/26 concepts with original Yomu units.
3. Add explanations before practice and faithful solo adaptations.
4. Map class, Genki, Minna, JLPT, and performance views.
5. Ensure every classmate appears meaningfully across lessons, not merely in a roster.

Gate: all class weeks are reachable and source-question coverage is 100%. Manual-review blockers keep the stage open.

## Stage 4: zero-to-N1 expansion

1. Map all 307 Yomu grammar rules to concepts and teaching/review homes.
2. Build original N3, N2, and N1 input banks with provenance and transcripts.
3. Author four-skill projects separately from JLPT receptive claims.
4. Add calibrated placement/checkpoint banks by skill, using audited Soya JLPT references and official-source candidates as source and mechanic evidence.
5. Schedule recurring N5-N1 mock-test events with timed, untimed-study, and post-attempt review modes.
6. Validate concept DAG, review spacing, vocabulary/kanji load, register, assessment calibration, and plot-preserving midstream entry.

Gate: every advertised level has input, instruction, practice, production, checkpoint, and review evidence.

## Stage 5: story and art production

1. Author the six-season spine and every classmate's three bond steps.
2. Load narrative variants through the scene compiler/loader.
3. Produce neutral character samples with OpenAI image generation; approve likeness/style before expressions.
4. Fill event, pose, background-state, prop, pop-culture, and worksheet-media gaps from the asset-home ledger.
5. Add unlocks, dialogue backlog, auto, read-skip, transitions, seasonal states, group chat, radio, and map life.
6. Implement the finite graduation ending, level-layered New Game Plus, and the postgame alumni calendar that binds SRS, Immersion Hall, mock seasons, source replay, and curated storylets into an indefinitely replayable loop.

Gate: every scene has a learning/character purpose, every named speaker has a visible approved asset, and every shipped asset has a runtime home.

## Stage 6: audio and immersion

1. Implement `AudioDirector` and theme-slot manifests.
2. Map private prototype OST by location/event.
3. Audit and map SFX by semantic event.
4. Pair all class listening files, transcript states, and question loci.
5. Add pronunciation audio, shadowing, listen-back, pitch comparison, radio drama, and train-home audio mode.

Gate: no overlapping tracks, drone fallback, blocked autoplay loop, missing transcript status, or uncaptioned critical audio.

## Stage 7: Cloudflare and sync

1. Create/verify D1 migrations for invites, profiles, learner events, and reports.
2. Upload private archive/media to R2 with integrity manifests.
3. Add signed media access and code-session auth.
4. Seed `<PRIVATE_CLASS_INVITE>` through the admin endpoint using available Wrangler credentials.
5. Verify anonymous cross-device link flow and offline event merge.
6. Keep Stripe adapter and webhook tests ready; activate after class-code stability.

Gate: invite access, logout, expiry, media authorization, sync idempotence, and offline recovery pass.

## Stage 8: release hardening

- `npx tsc --noEmit`
- Academy unit and conformance tests
- source, answer-key, image-fidelity, audio-pairing, curriculum, asset, and privacy validators
- Playwright desktop/phone/tablet journeys
- post-annotation layout screenshots and pixel checks
- keyboard, screen reader, touch, Apple Pencil, reduced motion, captions, contrast
- service-worker upgrade/offline/rollback tests
- performance budgets for initial shell, scene art, and audio
- live Cloudflare smoke behind `<PRIVATE_CLASS_INVITE>`

## Release gates

| Gate | Pass condition |
| --- | --- |
| Source fidelity | every Moodle question is playable with exact provenance and locus |
| Media fidelity | every image/audio-dependent question has its media or blocker |
| Learning loop | attempt -> feedback -> repair -> SRS -> return works |
| Narrative | full Foundation-N1 spine, all cast arcs, no placeholder prose |
| Art | approved provenance, consistent style, runtime home, mobile composition |
| Audio | intentional theme/ambience/SFX state, listening content paired |
| Yomu bridge | annotations, pitch, grammar, dictionary, mining, Doodle, SRS work in Academy |
| Access | `<PRIVATE_CLASS_INVITE>`, session, R2 authorization, sync, offline |
| UX | one clear action, stable layout, no duplicate controls, no clipping |
| Maintainability | typed registries, deep modules, schema validators, no god-object growth |

## Owner acceptance

The executor handles infrastructure and seeding. The owner receives one final checklist:

- review the fictional-story opening wording and classmate preview before sharing the class code;
- approve or correct classmate likeness samples before the expression batch;
- run the supplied iPhone/iPad/Apple Pencil acceptance path on the available devices;
- decide when to enable Stripe after the class-code launch.
