# Yomu Academy status

**Updated:** 2026-07-12 (Moodle census green; full Japanese-library census and adversarial review active)

**Current stage:** Stage 2 — source pipeline (active; Stage 1 green and closed)

**Canonical release line:** Stage 1 was pushed through `5f759ee5f`; source is `371140513`, hosted assets are `c5ef4629d`, Pages run `29203203144` deployed them successfully, and post-build asset refresh `d1104d10d` is integrated beneath this stage-close record.

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
| Offline shell | Green | Annotated N4 state reloaded offline in the accepted Browser build. An isolated rebuild of committed source produced deploy revision `s1-bbf9a61f26a3` and passed Academy build, docs build, and userscript verification. |
| Responsive/accessibility | Green for slice | Current real app: 320×780 annotated controls stay inside 26–294 px with `scrollWidth=320` and zero duplicate radio inputs; 390×844, 1024×768, and 1440×900 visual evidence is stored under `evidence/stage-1/`. |
| Academy tests | Green | `npm run typecheck`; 20 Academy files / 61 tests passed. Fresh Browser enrollment and audio-cleanup journeys ended with zero console logs. |
| Cross-model review | Green | The architecture follow-up passed in session `4308dfa7-1730-450e-b96d-6a22239cd44e`. Final delta session `7e12dfb2-4dbc-4cd4-bb65-9af74ec64bab` found one hover-only contrast blocker, verified its 5.10:1 composed-mirror fix, and returned `PASS`. |
| Full repository check | Green | Definitive `npm run qa` passed: four regular shards, eight JPDB shards, Academy 20/61, production builds, 1,889,000-byte userscript verification, P0 smokes, deterministic QA 13/13, docs a11y 66/66, and complexity maximum 29/30. |
| Deployment path | Green | Pages workflow now rebuilds hosted Reader assets, then Academy, then VitePress so the Academy service-worker revision hashes the exact deployed dependencies. |
| Commit, push, deploy | Green | `main` pushed at `5f759ee5f`; Pages run `29203203144` passed build/deploy. Live `/academy/` serves `s1-bbf9a61f26a3`, owns its service-worker scope, returns 200 for app/CSS/manifest/SW/art/source records, and fails production invite entry closed until Stage 7. |
| Stage 2 source baseline | In progress | The audited denominator remains 96 Moodle archives, 916 occurrences, 688 unique payloads, 716 PDF occurrences / 527 unique PDFs, and 185 MP3 occurrences / 146 unique audio payloads. Only the single Stage 1 source question is currently claimed playable. |
| Stage 2 Moodle payload ledger | Green | Manifest SHA `2400b43e…a78`; 96/96 archives, 916 member occurrences, 688 unique member payloads, 3 direct resources / 1 unique direct payload, and 1,466,136,959 uncompressed bytes reconcile exactly. Every tracked payload has an explicit stored/census state. |
| Stage 2 PDF/media census | Green for Moodle | 527/527 unique PDFs: 1,087 pages, 4,931 native objects extracted, 2,982 positioned media regions, 100,479 text boxes, and 906 vector-review pages; layout/native/vector failures are all zero. 146/146 audio payloads probe successfully. |
| Stage 2 pack migration | Green as candidates | All 44 donor packs and 879 items survive as 879 immutable source-item candidates plus 879 disjoint augmentation records. The claim guard still reports only 1 verified/playable Source Question; 699 loci and all donor answers/media remain review-required. |
| Stage 2 private editor | Green | A real three-page kanji source loaded all page images over HTTP 200 with 13 candidates and no `file://` URLs. Its overlay exposed 114 text boxes, four media regions, and two vector pages; screenshots remain in ignored private artifacts because the source is not public. |
| Stage 2 tests/privacy | Green for Moodle | The four source-pipeline suites pass 32/32 after generation; public validation and `git diff --check` pass. All 96 archives were rescanned under CRC32 validation and all 527 PDF render sets have DPI/page-count sidecars. Fable session `bf7e5f77-af85-495d-b3bc-fdb4777d6ea6` re-ran validation, independently checked public privacy/counts, verified all six follow-up fixes, and returned `PASS`. |
| Shared Japanese library | In progress | Owner authorized the same harness for `/Users/heru/Documents/Japanese` (42 GB, 13,123 files). It will retain separate denominators and deduplicate against Moodle; no library count may inflate Moodle coverage. |

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

- Stage 2 has mechanically censused all Moodle payloads; human source-question/media/answer review remains open and only one Moodle question is claimed playable.
- The newly authorized 42 GB shared Japanese library still needs its separate resumable ledger, PDF/media census, and privacy-safe status output.
- Stage 3 still owns 73/73 authored and reachable class Weeks, including Minna 24/26 bridges.
- Stage 4 still owns calibrated Foundation–N1 banks, audited recurring mock forms, and complete four-skill evidence.
- Stages 5–6 still own the full cast/story/art/audio production. A standalone Aakash sprite remains withheld pending likeness approval.
- Stage 7 still owns live Worker/D1/R2 access, `UCL2026` seeding, expiry, sync, and cross-device proof.
- Physical iPhone/iPad/Apple Pencil acceptance remains an owner gate in Stage 8.

## Next three actions

1. Commit/push the Fable-approved Moodle census slice without protected Reader or concurrent UI/access work, then verify its deployment.
2. Extend the same resumable, privacy-safe harness across `/Users/heru/Documents/Japanese`, deduplicating against Moodle while keeping library denominators separate.
3. Integrate and browser-test the parallel warm/animated UI, diegetic map/navigation, real access/audio/Stripe, cast, and Japanese annotation-coverage fixes before moving into the 73-Week authoring volume.
