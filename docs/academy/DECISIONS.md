# Yomu Academy decisions

Only load-bearing or surprising decisions belong here. Routine implementation choices stay in code and tests.

## D-001 — One canonical implementation line

**Decision:** Academy is implemented only in this repository's existing `main`. Donor branches, release worktrees, dormant Codex worktrees, transcript stores, and generated-image stores are read-only evidence.

**Why:** Donor A contains 2,529 untracked records and broad unrelated deletions; Donor B and the dormant worktrees also contain dirty state that branch merges would miss. Selective reviewed ports are the only reproducible path.

## D-002 — Preserve intent when upstream supersedes dirty lines

**Decision:** During the 2026-07-12 fast-forward, settings, pitch, CSS, and generated conflicts resolved to current upstream when history proved the stashed implementation had already landed and then been improved. The genuinely new NHK/framework-mirror work remained local, and its safety stash remains available.

**Why:** Blind line retention would have reverted safer okurigana pitch alignment, clamped-row settings, contrast, and puck-rest changes. Preservation means keeping unsuperseded behavior, not reviving obsolete implementations.

## D-003 — Reference engines are reproducible evidence, not vendored dependencies

**Decision:** Third-party checkouts and research corpora live outside this product repository. The audited engine commits are `inkle/ink@35c63e52f1d36060930dc7ed3cfba38ea224b528`, `y-lohse/inkjs@1b17540a619021b551ecc4bc5bf873758e6b509b`, `Monogatari/Monogatari@86659baf065178071f0956092f754e1d76be0072`, `goldfire/howler.js@1d3053576a860e9854645493ad6c4a72c6cc6e45`, `GoogleChrome/workbox@62b9d8ba8eb3c1a2ab8aac9d84c90cda7865d6a3`, and `open-spaced-repetition/ts-fsrs@cdec8d2f8340f8e62ced596c1da02e20e70073f0`. The read-only Jiten audit used `obfusk/jiten@02e625520927670590780e7b0f7ccb48987102e0` (AGPL-3.0-or-later); no Jiten code or assets are copied into Yomu.

**Why:** Academy adopts small mechanisms behind its own interfaces. Vendoring research inputs obscures ownership and supply-chain review, while recording immutable upstream commits preserves reproducibility without publishing local working material.

## D-004 — One event log and one Yomu learning source of truth

**Decision:** Attempts, review ratings, grammar-known changes, scenes, bonds, unlocks, and profile changes are append-only learner events. Academy projections and Cloudflare sync derive from these events; Academy does not create a parallel SRS deck or mutable progress flag sprawl.

**Why:** Reader and Academy must agree after reading, reviewing, mining, offline work, and cross-device sync.

## D-005 — Source records and Academy augmentation never share mutable text

**Decision:** Immutable source occurrence/question/media/answer records are versioned separately from hints, feedback, solo adaptation, grading, story framing, and SRS seeds.

**Why:** Faithful extraction corrections must not overwrite pedagogy, and Academy improvements must never silently rewrite Moodle questions.

## D-006 — Assets ship only through an explicit usage manifest

**Decision:** A directory name or file presence never approves art/audio. Every shipped asset needs provenance, verdict, exact runtime home, rights state, and mobile review. Pollinations/Flux/Python sprite families remain rejected.

**Why:** The donors contain attractive but inconsistent or uncleared batches. Runtime truth must be auditable asset by asset.

## D-007 — Placement advances curriculum evidence, not emotional history

**Decision:** Manual/assessed placement may seed known state and curriculum position, but prior story scenes remain unseen until played. Every midstream learner receives an authored arrival bridge and chronological journal access.

**Why:** A learner's language level cannot honestly imply that they experienced relationships or reveals.

## D-008 — Stage 1 access is local proof, never production theatre

**Decision:** `<PRIVATE_CLASS_INVITE>` is accepted by a localhost-only adapter for deterministic enrollment QA. Non-local hosts must call the production session boundary and fail closed until Stage 7 deploys it.

**Why:** The vertical slice needs a runnable access seam, but claiming a static client-side code as secure production access would invalidate the release gate.

## D-009 — Missing release audio means intentional silence

**Decision:** Stage 1's release-safe theme catalogue contains silence. Browser Japanese speech is routed through `AudioDirector` for the mock and Language Lab; private Persona/Shinday files are not copied into the public build.

**Why:** A silent authored state is honest and lifecycle-testable. Shipping uncleared prototype media or restoring the rejected synthesised drone is not.

## D-010 — Hosted shell revisions are derived from content

**Decision:** `scripts/sync-academy.cjs` hashes the complete allowlisted Academy runtime plus hosted Reader dependencies and renders that hash into the HTML and service-worker templates.

**Why:** A manual revision reused after a code rebuild caused the active worker to serve stale bytes during Browser QA. A content-derived revision makes that failure non-repeatable and also updates when art, content, or Reader dependencies change.

## D-011 — Use the approved rainy CG until Aakash passes likeness review

**Decision:** Aakash's first bond beat and journal replay use the approved OpenAI rainy-directions CG. No standalone Aakash sprite ships in Stage 1.

**Why:** The existing donor sprites fail the explicit likeness/style gate. A named speaker must remain visible, so the mobile layout includes a responsive crop of the approved event art instead of inventing a placeholder portrait.

## D-012 — Pages rebuilds Academy after hosted Reader assets

**Decision:** The Pages workflow builds and syncs Reader assets first, then runs `build:academy`, then builds VitePress. Academy path changes explicitly trigger the workflow.

**Why:** Academy's content-derived service-worker revision includes the hosted Reader dependencies. Committing a locally rendered revision while CI rebuilt Reader assets afterward would make the cache name describe different bytes than the deployment.

## D-013 — Source bytes and teacher review stay private; public status is allowlisted metadata

**Decision:** Moodle bytes, filenames, titles, prompts, extracted text, rendered pages, native images, and the teacher comparison surface live only under the ignored private artifact root. Public Stage 2 outputs are constructed field by field from hashes, byte counts, opaque IDs, enums, and aggregate status, then checked both structurally and against tokens harvested from the real private corpus.

**Why:** A denylist cannot anticipate every identifying filename, class title, URL, or worksheet phrase. The public corpus needs auditable coverage and failure states, but publishing source material is neither necessary nor licensed by that need.

## D-014 — Reopen product acceptance before content volume

**Decision:** Stage 1's engineering closure remains evidence for access, persistence, source separation, annotations, responsive behavior, and offline restore, but it is not the product template. Further source-volume implementation is paused until a rebuilt Lesson 0 proof passes [`DIRECTION-RESET.md`](DIRECTION-RESET.md). The fourteen-expression handout is one section of a complete 60–90 minute class; full-bleed VN scenes, literal learning objects, skill-matched production, three consequential opening missions, coherent spatial navigation, and reversible learner freedom are mandatory.

**Why:** A technically green route currently makes one source item playable through an answer-leaking choice, then jumps to an unrelated single-kanji task. Scaling that pattern across 73 weeks and 42 GB would create a polished archive browser rather than a serious Japanese course.

## D-015 — Protected audio begins only after the invite session

**Decision:** This supersedes D-008/D-009 for the live infrastructure boundary. `<PRIVATE_CLASS_INVITE>` exchanges through the Cloudflare Worker/D1. Owner-approved Persona and Shinday files remain private R2 objects behind that session. The access route is silent; the authenticated Rie route begins the opening theme. Local Vite acceptance proxies the live boundary and rewrites only Academy's Secure `__Host-` cookies on its HTTP leg.

**Why:** Starting protected media before the session caused avoidable 401s and connection pressure. A local-only fake session could not prove the real cookie/range/audio behavior.

## D-016 — Review-candidate sprites may appear only as explicit blocked previews

**Decision:** This supersedes D-011 for current direction-reset QA. Aakash, Xingyu, and Rie's new expressions are individually ledgered as release-blocked previews with provenance and prospective homes. No expression expansion or release approval occurs before owner likeness and equal-stage cast review.

**Why:** The current app needs to test composition with real cutouts, while presence in `public/academy/art` must never silently become likeness approval.

## D-017 — Classmate rotation is source-backed planning before scene authorship

**Decision:** The 73-week appearance plan is a versioned, planning-only package pinned to the donor week index. A classmate assignment requires source-topic evidence plus a documented learning specialty; outline-only weeks stay review-required. Exact names, full-class reach, and concentration limits are validated.

**Why:** Rotating names arbitrarily would be cosmetic and unsafe. Waiting until all scenes are written would make accidental cast concentration expensive to repair.

## D-018 — Paid codes are claimed, never carried through URLs or storage

**Decision:** Stripe returns only its Checkout session proof. Academy removes `checkout` and `session_id` from history immediately, polls the same-origin claim endpoint with the HttpOnly claim cookie, then pre-fills/copies the validated code in memory. It never stores or places the generated code in a URL.

**Why:** The two-proof claim preserves payment recovery without turning browser history, analytics, storage, D1, or logs into plaintext credential stores.

## D-019 — One course, two presentation hosts

**Decision:** Story view and Course view use one route tree, curriculum graph, activity runtime, learner event log, and Study collection. The mode swaps the host only. Class uses a collapsed level spine that opens a compact lesson overview; every activity returns there through persisted route history. The ten living-paper types and grounded-lesson gate in [`LESSON-EXPERIENCE-CONTRACT.md`](LESSON-EXPERIENCE-CONTRACT.md) are binding before content volume resumes.

**Why:** A second course-first implementation would duplicate progress and grading, while a game-only shell would exclude learners who want direct study. Predictable syllabus → lesson → activity → feedback navigation follows familiar learning software without sacrificing the world.

## D-020 — Presentation cannot make a lesson playable

**Decision:** Every advertised lesson must pass one deep grounding validator proving input provenance, curriculum resolution, relevant teaching, media, guided/independent/transfer production, grading, concealment, repair, canonical review evidence, construct-preserving access, source fidelity, and honest blockers. Story, art, cast, rewards, and layout are outside that interface.

**Why:** Scaling an attractive but academically thin template across 73 Weeks and the shared library would make later coverage claims meaningless. The validator keeps learning substance testable at one seam.

## D-021 — Shipped lesson bytes authorize learner writes

**Decision:** A learner write names a lesson; it never supplies that lesson's grounding verdict. The runtime resolves the complete lesson from the registry, verifies the shipped bytes against the pinned SHA-256 and content revision, re-runs the audit, and permits the write only for a grounded-playable lesson and activity with matching concepts, source scope, and canonical Yomu review identity. Answer concealment is valid only through a resolvable surface-audit definition whose recorded facts match the claim. Legacy ungrounded routes are removed from current state and Back history.

**Why:** Build-time validation alone cannot stop a stale route or caller-created contract from writing false evidence. One byte-pinned resolver and one normalized review identity make the same academic decision govern navigation, attempts, review scheduling, and the derived Week ledger.
## D-022 — Learner-facing concealment proof is executable evidence

**Decision:** A lesson cannot assert that answers are hidden. Each ready concealment proof resolves an exact renderer definition (ID, revision, SHA-256, source locator, owned surface), an answer-bearing content corpus, and assessment answer definitions. It replays the captured pre-commit `outerHTML` without browser globals and rejects stale bindings, tampering, encoded answers, custom/shadow surfaces, canvas/frame/object/embed content, or omitted corpus values.

**Why:** A well-shaped JSON reference can certify itself while the real renderer leaks an answer. Learner writes need proof tied to the code and content that produced the surface.

**Consequence:** Lesson 0 remains blocked until its actual renderers generate passing artifacts. Opaque surfaces need a separate auditable contract; they cannot be waived by prose.

## D-023 — Playable is a current learner-reachability claim

**Decision:** A Source Question, activity, lesson, or Week contributes to a `*Playable` count only when a learner can currently reach it through a route that passes the complete grounding contract and may write new learner evidence. Audit completion and implementation existence are durable, separate counts; a quarantined legacy renderer is implemented but not playable.

**Why:** Keeping a historical playable count after raising the academic gate makes the ledger contradict the runtime. The honest gap between audited, implemented, and playable is actionable production state rather than a lost milestone.

## D-024 — First-term memory keeps Shaun and Peter distinct

**Decision:** Shaun is a canonical first-term classmate and Peter remains a separate canonical classmate. Both appear in the Foundation story record and first-term scrapbook spread. Shaun's owner-supplied reference may produce a review sprite; Peter does not receive an invented likeness.

**Why:** A group image is not a substitute for two character records. Keeping name, story membership, and likeness evidence separate prevents forgotten classmates from being merged or visually fabricated.

## D-025 — Placement audio resolves through the listening crosswalk

**Decision:** Placement may expose a source recording only when the authored item names a completed listening-crosswalk locator and the crosswalk's packaged entry has the same SHA-256. An unavailable or mismatched recording does not fall back silently. Exact-text browser speech remains an explicitly labelled delivery mode for levels without a completed mapping.

**Why:** Remote source paths and matching filenames prove neither byte identity nor permission to ship. Reusing the existing crosswalk keeps placement, Moodle, Minna, and later Genki audio on one auditable delivery seam while preserving an honest usable diagnostic for unmapped levels.

## D-026 — Advanced arrival reuses authored-week tasks and canonical adaptive evidence

**Decision:** The first advanced arrival slice is N3 and directly reuses the exact `l2-l07` Moodle/Minna 074 activity, task binding, packaged audio, and authored-week evidence owner. `academy-adaptive-learner-v1` selects guided, test-out, repair, or independent arrival support from canonical learner events. The arrival task may write activity and learning evidence, but it may not write scenes, encounters, bonds, or replay memories.

**Why:** A separate entry-task or audio registry would duplicate active source ownership and could drift from the reviewed recording, question order, answer gate, and packaging digest. Plot progression must remain based on authored story evidence rather than placement convenience.

**Consequence:** N3 entrants receive a real, source-owned task with honest exact audio and adaptive support before campus entry. N2/N1 receive no fabricated source mapping, and Genki audio remains unclaimed until an exact task binding exists.
