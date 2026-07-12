# Yomu Academy decisions

Only load-bearing or surprising decisions belong here. Routine implementation choices stay in code and tests.

## D-001 — One canonical implementation line

**Decision:** Academy is implemented only in this repository's existing `main`. Donor branches, release worktrees, dormant Codex worktrees, transcript stores, and generated-image stores are read-only evidence.

**Why:** Donor A contains 2,529 untracked records and broad unrelated deletions; Donor B and the dormant worktrees also contain dirty state that branch merges would miss. Selective reviewed ports are the only reproducible path.

## D-002 — Preserve intent when upstream supersedes dirty lines

**Decision:** During the 2026-07-12 fast-forward, settings, pitch, CSS, and generated conflicts resolved to current upstream when history proved the stashed implementation had already landed and then been improved. The genuinely new NHK/framework-mirror work remained local, and its safety stash remains available.

**Why:** Blind line retention would have reverted safer okurigana pitch alignment, clamped-row settings, contrast, and puck-rest changes. Preservation means keeping unsuperseded behavior, not reviving obsolete implementations.

## D-003 — Reference engines are reproducible evidence, not vendored dependencies

**Decision:** The six exact shallow clones live locally under `references/academy-engine/*/` and are ignored. Pins and recreation commands are tracked.

**Why:** Academy adopts small mechanisms behind its own interfaces; committing roughly 100 MB of nested Git repositories would obscure ownership and supply-chain review.

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
