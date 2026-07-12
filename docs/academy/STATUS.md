# Yomu Academy status

**Updated:** 2026-07-12 18:51 Europe/London

**Current stage:** Stage 1 — skeleton and enrollment vertical slice (green; commit/deploy pending)

**Canonical branch:** `main` at `3d1624fb3`; `origin/main` is aligned before the pending Stage 1 commit.

## Gate board

| Gate | State | Evidence |
| --- | --- | --- |
| Stage 0 baseline | Green | Discovery, source inventories, salvage decisions, pins, and preservation commits `055bb4eca` / `3d1624fb3` are on `origin/main`. |
| Separate hosted application | Green | `config/vite/academy.config.ts`, `academy/index.html`, and `scripts/sync-academy.cjs`; readable Academy output remains outside `dist/yomu.user.js`. |
| Deep module boundaries | Green | Source, Activity, Scene, Learner Event, Audio, access, persistence, routing-flow, evidence, and Yomu bridge Modules have conformance tests; core orchestrators are below 300 lines. |
| Enrollment and placement | Green | Local `UCL2026`, Rie fiction note, name/reason, four portraits, Lesson 0, manual N5–N1, skill-evidence mock, learner override, and five plot-preserving band-entry tasks work in Browser. Production access remains correctly deferred to Stage 7. |
| Faithful source slice | Green | Moodle Level 1 Lesson 1 page 2 item 9 has immutable document/occurrence/question and separate augmentation records, exact SHA-256 provenance, precise repair, retry, and review scheduling. |
| Learning/world loop | Green | Lesson forks, Aakash direction repair/unlock, KanjiVG + shared Doodle/keyboard alternative, campus, local Yomu review, journal bonds/replay, reload, and unlocked Lab/Cafe complete end to end. |
| Reader integration | Green | Hosted Reader bundle injects segmentation, furigana/pitch state, and dictionary behavior into Academy; Japanese mode shows no `未翻訳`; controls remain stable after injection. |
| Audio lifecycle | Green for slice | One `AudioDirector` owns buses, speech ducking, overlap, cancellation, gesture state, and intentional silence. Cleared location music/source listening remain Stage 6 work. |
| Offline shell | Green | Content-hashed revision `s1-15dd1d7d700f`; annotated N4 state reloaded with network disabled from the active service-worker cache and displayed explicit offline state. |
| Responsive/accessibility | Green for slice | Current real app: 320×780 annotated controls stay inside 26–294 px with `scrollWidth=320` and zero duplicate radio inputs; 390×844, 1024×768, and 1440×900 visual evidence is stored under `evidence/stage-1/`. |
| Academy tests | Green | `npm run typecheck`; 20 Academy files / 61 tests passed. Fresh Browser enrollment and audio-cleanup journeys ended with zero console logs. |
| Cross-model review | Green | The architecture follow-up passed in session `4308dfa7-1730-450e-b96d-6a22239cd44e`. Final delta session `7e12dfb2-4dbc-4cd4-bb65-9af74ec64bab` found one hover-only contrast blocker, verified its 5.10:1 composed-mirror fix, and returned `PASS`. |
| Full repository check | Green | Definitive `npm run qa` passed: four regular shards, eight JPDB shards, Academy 20/61, production builds, 1,889,000-byte userscript verification, P0 smokes, deterministic QA 13/13, docs a11y 66/66, and complexity maximum 29/30. |
| Deployment path | Green | Pages workflow now rebuilds hosted Reader assets, then Academy, then VitePress so the Academy service-worker revision hashes the exact deployed dependencies. |
| Commit, push, deploy | Pending | Stage 1 closes only after the green checks, reviewed commit, push to `main`, and hosted Academy redeploy/smoke. |

## Protected local work

These paths predate Academy and remain outside Academy commits:

- `dist/yomu.user.js`
- `src/reader/dom/index.ts`
- `tests/reader/framework-managed-mirror.test.ts`
- `scripts/nhk-diag.mjs`
- `scripts/nhk-mirror-overlap-smoke.mjs`
- `scripts/nhk-probe2.mjs`

Safety stashes remain at `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` and `c228c1ea`.

## Open work (not Stage 1 defects)

- Stage 2 must audit all 96 Moodle archives and complete the PDF/media/source-question pipeline. Only one Moodle question is claimed today.
- Stage 3 still owns 73/73 authored and reachable class Weeks, including Minna 24/26 bridges.
- Stage 4 still owns calibrated Foundation–N1 banks, audited recurring mock forms, and complete four-skill evidence.
- Stages 5–6 still own the full cast/story/art/audio production. A standalone Aakash sprite remains withheld pending likeness approval.
- Stage 7 still owns live Worker/D1/R2 access, `UCL2026` seeding, expiry, sync, and cross-device proof.
- Physical iPhone/iPad/Apple Pencil acceptance remains an owner gate in Stage 8.

## Next three actions

1. Commit only Academy-owned paths and the explicitly reviewed shared fixes, preserving protected Reader paths.
2. Push `main`, watch the Pages deployment, and smoke the live `/academy/` shell and revisioned assets.
3. Close Stage 1 and begin the Stage 2 source-pipeline census from all 96 Moodle archives.
