# Yomu Academy production backlog

This is the ordered execution backlog for [`discovery/PRODUCTION-RUNBOOK.md`](discovery/PRODUCTION-RUNBOOK.md). A checkbox closes only with code, tests, browser evidence where applicable, and updated living files.

## Stage 0 — clean base

- [x] Fast-forward `main` to current `origin/main` without losing active Reader work.
- [x] Copy all 18 discovery files to `docs/academy/discovery/`.
- [x] Create shallow local clones of the six pinned reference engines and verify exact commits.
- [x] Generate a lossless inventory for Donor A, Donor B, and 14 dormant worktrees.
- [x] Classify every donor/worktree payload in `SALVAGE-LEDGER.md`.
- [x] Run the full project check and record exact output.
- [x] Commit and push Stage 0 artifacts without including protected Reader work (`055bb4eca`).

Acceptance: `main` equals fetched upstream before Academy commits; donor trees are unchanged; discovery, pins, inventories, living files, and initial resource/asset ledgers are reproducible.

## Stage 1 — enrollment vertical slice

- [x] Add a separate Academy Vite entry and route without increasing the readable userscript bundle with curriculum/art payloads.
- [x] Establish deep interfaces for source library, activity runtime, scene runtime, learner event log, media runtime, and Yomu bridge.
- [x] Port an abortable scene lifecycle, map navigation model, journal/bonds read model, responsive contract, PWA shell, accessibility harness, SRS adapter, and two-way Doodle card in verified slices.
- [x] Implement invite-code entry and a local development session adapter; keep production access behind the Cloudflare interface.
- [x] Implement Rie's fiction note, name/reason capture, and the four approved protagonist choices.
- [x] Implement three starts: Lesson 0, manual N5–N1 band, or optional evidence-based mock recommendation.
- [x] Implement plot-preserving midstream bridges with separate curriculum and story state.
- [x] Implement campus, three lesson forks, one faithful source activity, precise repair, Yomu review event, Aakash unlock, journal replay, audio state, save/reload, and offline resume.
- [x] Add English and Japanese copy to the canonical translation surface and prove Japanese mode contains no `未翻訳`.
- [x] Run unit/conformance checks and real-app desktop/phone Browser acceptance after annotations inject.

Acceptance: the full [`discovery/VERTICAL-SLICE.md`](discovery/VERTICAL-SLICE.md) script works at 320px and desktop with one clear action, approved art, intentional audio, stable annotations, and persistent evidence.

## Stage 2 — source pipeline

- [ ] Rebuild occurrence/payload ledgers from all 96 Moodle archives and local Japanese sources.
- [ ] Introduce versioned immutable `SourceDocument`/`SourceQuestion` records adjacent to, but never conflated with, augmentation.
- [ ] Census every unique PDF page/object/media region and pair listening files, transcript states, answer keys, and rights.
- [ ] Migrate the 44 existing packs and process the remaining documents in resumable batches.
- [ ] Build teacher/editor source-vs-playable comparison and validators.

Acceptance: every payload has a status; every processed document has question/media counts; no image/audio task silently degrades to text.

## Stage 3 — all 73 class weeks

- [ ] Author and expose every week while preserving all source occurrences/questions.
- [ ] Add original Minna 24/26 bridges.
- [ ] Add explanations, faithful solo adaptations, deterministic grading, model-answer gating, and cumulative review.
- [ ] Project one concept graph into Class, Genki, Minna, JLPT, and JF/CEFR views.
- [ ] Give every classmate meaningful learning appearances.

Acceptance: 73/73 weeks reachable and 100% audited Moodle source questions faithfully playable; manual-review reasons cannot substitute for activities.

## Stage 4 — Foundation to N1

- [ ] Map all 307 Yomu grammar rules to concept homes.
- [ ] Author cleared/original N3–N1 input, instruction, guided practice, production, checkpoint, and review.
- [ ] Audit Soya/official candidates item by item; preserve mechanics when wording/media cannot ship.
- [ ] Build one assessment model for placement, test-out, timed/untimed mocks, review, calibration, and exposure rotation.
- [ ] Validate the concept DAG, load, register, skill-specific recommendations, and midstream plot bridges.

Acceptance: every advertised level has four-skill evidence while JLPT receptive and JF/CEFR production claims remain distinct.

## Stage 5 — story and approved art

- [ ] Author the six-season finite story, graduation, New Game Plus, alumni calendar, and recurring postgame learning loop.
- [ ] Author recognition/friction/support bond steps for every classmate.
- [ ] Generate one OpenAI neutral sprite per character, obtain likeness/style approval, then expand expressions/poses.
- [ ] Complete backgrounds, event CGs, props, worksheet media, unlocks, backlog, auto/read-skip, group chat, radio, transitions, and seasonal states.
- [ ] Enforce asset home, provenance, mobile composition, and excluded-family validators.

Acceptance: every scene advances learning/relationship/mystery/world; every speaker has approved visible art; every shipped asset has a runtime home.

## Stage 6 — audio and immersion

- [ ] Complete `AudioDirector` buses, gesture unlock, crossfade, ducking, visibility handling, cleanup, offline state, and semantic slots.
- [ ] Map private prototype OST and audited SFX without shipping uncleared media.
- [ ] Pair every listening question with audio, transcript, timecodes, shadowing, replay, and captions.
- [ ] Add pronunciation, listen-back, pitch comparison, diegetic radio, and train-home audio mode.

Acceptance: one source per bus as authored, no overlap/drone/autoplay loop, and no critical uncaptioned audio.

## Stage 7 — Cloudflare access and sync

- [ ] Load the Cloudflare, Workers best-practices, and Wrangler skills before commands or implementation.
- [ ] Review/migrate the inherited Worker into focused access/progress/media modules.
- [ ] Create/verify D1 migrations, R2 integrity manifests, signed media, anonymous invite sessions, privacy boundaries, and idempotent event sync.
- [ ] Seed `UCL2026` through the authenticated admin endpoint using available secrets; never store plaintext codes.
- [ ] Verify logout/expiry/revocation/range requests/offline merge/cross-device link.
- [ ] Keep Stripe adapter and webhook tests ready but disabled until class-code stability.

Acceptance: live anonymous access, authorization, sync, deletion, expiry, and offline recovery smoke pass.

## Stage 8 — release

- [ ] Run typecheck, full tests, Academy conformance, source/media/answer/curriculum/asset/privacy validators, docs build, complexity, bundle, and all browser journeys.
- [ ] Capture approved real-app desktop/tablet/phone evidence only after annotation injection.
- [ ] Complete keyboard, screen reader, touch, Apple Pencil, reduced-motion, captions, contrast, offline-upgrade, rollback, and performance acceptance.
- [ ] Retry mandatory Fable adversarial review; resolve every actionable release issue.
- [ ] Update README, docs, credits/licenses, changelog, deployment and rollback instructions together.
- [ ] Push, deploy, create a `v*` release with `yomu.user.js`, verify latest/non-draft, and smoke `UCL2026` live.

Acceptance: every release gate in the runbook is green, with only the explicit owner likeness/opening wording/physical-device/Stripe decisions left for owner acceptance.
