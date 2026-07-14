# Yomu Academy status

**Updated:** 2026-07-13 (hard grounding/write gate locked; zero class Weeks playable)

**Current stage:** Product direction reset before further Stage 2–8 volume. Stage 1 engineering evidence remains valid; its learner-experience acceptance is reopened.

**Canonical release line:** grounded source, canonical Study assets, and release evidence are pushed through `428beec6e`. The current audited checkpoint is built locally at `s1-5672f965734c`, has Fable `PASS`, and is not yet pushed.

## Gate board

| Gate | State | Evidence |
| --- | --- | --- |
| Stage 0 baseline | Green | Discovery, source inventories, salvage decisions, pins, and preservation commits `055bb4eca` / `3d1624fb3` are on `origin/main`. |
| Direction reset | Amber / active | [`DIRECTION-RESET.md`](DIRECTION-RESET.md) and [`LESSON-EXPERIENCE-CONTRACT.md`](LESSON-EXPERIENCE-CONTRACT.md) bind one route tree, equal Story/Course hosts, a collapsed Class spine, compact lesson overview, ten predictable paper types, and the hard grounding gate. Class, Lesson 0 overview, route-history Back, and shared Study now work in the current app; the complete grounded lesson and equal Course host remain open. |
| Separate hosted application | Green | `config/vite/academy.config.ts`, `academy/index.html`, and `scripts/sync-academy.cjs`; readable Academy output remains outside `dist/yomu.user.js`. |
| Grounding and learner writes | Green as an enforcing gate | Every complete lesson resolves from a typed registry entry that pins lesson ID, content revision, and shipped-byte SHA-256. `LearnerEvidence` re-audits those bytes before any write. A ready concealment proof now replays the exact pre-commit DOM snapshot against content-derived translations/transcripts and registered answers, resolves the renderer by ID/revision/SHA/source, and fails closed for stale, forged, shadow/custom-element, canvas/frame, encoded-answer, or browser-only evidence. Lesson 0 still has no ready surface audit. |
| Enrollment and placement | Green for invite access and route choice | `UCL2026` exchanges against the live Cloudflare Worker/D1; Rie's fiction note, name/reason, four portraits, Lesson 0, manual N5–N1, mock recommendation, and learner override remain available. Manual N3 Browser proof reaches the correct present-season Class group; the former ungrounded band-entry tasks are deliberately no longer reachable. Cross-device account/link proof remains open. |
| Faithful source record | Green as source data / not a playable Week | Moodle Level 1 Lesson 1 page 2 item 9 retains immutable document/occurrence/question and separate augmentation records with exact SHA-256 provenance. Its former activity route is now classified as legacy-ungrounded and cannot authorize new learner evidence. |
| Learning/world loop | Red / active | Legacy `band-entry`, lesson-fork, source, Aakash, writing, one-item kanji, duplicate review, and unpaired Lab routes are removed from state, Back history, and now their unreachable render modules. Class opens the correct level, blocked Lesson 0 shows an honest overview with no start action, and Academy mounts canonical Study with a 15-minute countdown and route-history Back. A complete grounded lesson remains the missing loop. |
| Reader integration | Green for current slice | Academy is rebased on Yomu 1.6.148's generic annotation/safe-lane work. Sequential and prefetched scans share authored sense resolution; `もう一度` remains one token while its popover exposes `もう` / `一度` with exact readings and Jiten/local/public pitch fallback. Compound, expression-pitch, and all 1,010 JPDB helper tests pass (1,023 total). Full-corpus annotation acceptance remains a later gate. |
| Audio lifecycle | Green for approved BGM/SFX; lesson speech red | Live authenticated R2 playback proves approved Persona/Shinday media. [`evidence/lesson-zero-audio/REPORT.md`](evidence/lesson-zero-audio/REPORT.md) byte-audits all four current Lesson 0 speech inputs and finds 0/4 release-ready assets. The vowel-row and Speaking learner-turn script defects are repaired; reviewed recordings, transcripts, timecodes, consent, bindings, and byte hashes remain required. |
| Offline shell | Green | Annotated N4 state reloaded offline in the accepted Browser build. The last deployed Stage 1 proof remains `s1-bbf9a61f26a3`; the current exact candidate is rebuilt at `s1-5672f965734c`, includes the Shaun journal asset, and passes offline-manifest validation. |
| Responsive/accessibility | Green for slice | Current real app: 320×780 annotated controls stay inside 26–294 px with `scrollWidth=320` and zero duplicate radio inputs; 390×844, 1024×768, and 1440×900 visual evidence is stored under `evidence/stage-1/`. |
| Academy tests | Green for the grounding delta | Full Academy passes 75 files / 428 tests after concealment, cast, recovery, and complexity hardening. TypeScript, Fallow (0 findings), the source/library validators, complexity ceiling, and `git diff --check` pass. |
| Cross-model review | Green for current grounding delta | Fable session `84ad730d-d9c6-4d20-b683-db4db8674840` passed the architecture and identified three proof-hardening risks. Release review `9ff9f8d1-b1be-4e81-9b15-244e7f0982f0` correctly failed renderer anchoring, opaque surfaces, entity decoding, and bfcache disposal. After fixes, session `5d1ce53e-6c8e-426b-80ee-da979edb3908` returned `PASS`. Final checkpoint review `b29c8446-9c18-4a8e-b5a2-93095bc02f5f` returned `PASS` with no code blocker and confirmed 0/73 honesty, placement/Study concealment, Peter/Shaun gates, secrets, and generated parity. |
| Full repository check | Green locally for current delta | Controlled-concurrency Reader CI passes all four regular shards (244 files; 3,567 passed / one skipped) and eight JPDB shards (1,010/1,010). Study passes 380/380; Academy passes 75/428. Canonical userscript, Study, Academy `s1-5672f965734c`, VitePress, and verification pass; P0 smoke, deterministic QA 13/13, docs a11y 66/66, source/library validation, Fallow, and complexity all pass. An earlier oversubscribed run was isolated as concurrent-process starvation; every reported case passed alone and in the controlled full run. Push and hosted smoke remain open. |
| Deployment path | Green | Pages workflow now rebuilds hosted Reader assets, then Academy, then VitePress so the Academy service-worker revision hashes the exact deployed dependencies. |
| Commit, push, deploy | Amber for current slice | The earlier Stage 1 Pages line remains green at `5f759ee5f`. The Cloudflare Worker/D1/R2 boundary is live for `UCL2026` and protected audio, while the current direction-reset frontend is verified locally but not yet committed/pushed/deployed. |
| Stage 2 source baseline | In progress | The audited denominator remains 96 Moodle archives, 916 occurrences, 688 unique payloads, 716 PDF occurrences / 527 unique PDFs, and 185 MP3 occurrences / 146 unique audio payloads. One source question is audited and implemented; zero currently have a learner-reachable grounded route. |
| Stage 2 Moodle payload ledger | Green | Manifest SHA `2400b43e…a78`; 96/96 archives, 916 member occurrences, 688 unique member payloads, 3 direct resources / 1 unique direct payload, and 1,466,136,959 uncompressed bytes reconcile exactly. Every tracked payload has an explicit stored/census state. |
| Stage 2 PDF/media census | Green for Moodle | 527/527 unique PDFs: 1,087 pages, 4,931 native objects extracted, 2,982 positioned media regions, 100,479 text boxes, and 906 vector-review pages; layout/native/vector failures are all zero. 146/146 audio payloads probe successfully. |
| Stage 2 pack migration | Green as candidates | All 44 donor packs and 879 items survive as 879 immutable source-item candidates plus 879 disjoint augmentation records. The claim guard reports 1 audited, 1 implemented, and 0 currently playable Source Questions; 699 loci and all donor answers/media remain review-required. |
| Stage 2 private editor | Green | A real three-page kanji source loaded all page images over HTTP 200 with 13 candidates and no `file://` URLs. Its overlay exposed 114 text boxes, four media regions, and two vector pages; screenshots remain in ignored private artifacts because the source is not public. |
| Stage 2 tests/privacy | Green for Moodle | The four source-pipeline suites pass 32/32 after generation; public validation and `git diff --check` pass. All 96 archives were rescanned under CRC32 validation and all 527 PDF render sets have DPI/page-count sidecars. Fable session `bf7e5f77-af85-495d-b3bc-fdb4777d6ea6` re-ran validation, independently checked public privacy/counts, verified all six follow-up fixes, and returned `PASS`. |
| Shared Japanese library | Green for mechanical census / review open | The privacy-safe public status now records the authorized tree separately: 15,790 filesystem entries / 13,123 regular files / 11,081 unique payloads and 68 Moodle-overlap hashes. Archive states cover 89/89 containers (84 censused; five explicitly `failed:zip64-unsupported`), PDFs 450/450, and media 5,090/5,090. Cache-only publish, structural/token privacy, focused 21/21 tests, and public validation pass; no library count inflates Moodle or verified-question coverage. Human source review and media-to-activity pairing remain open. |
| 73-week cast planning | Green as planning data | Versioned 73/73 appearance planning is pinned to the donor week index: 67 source-topic-backed assignments, six honest review-required gaps, all 19 documented classmates with a primary appearance, exact-name/specialty/concentration validation, and no claim that weeks are authored or playable. |
| 73-week delivery catalogue | Green and honest | All 73 class Weeks have an explicit delivery state: orientation is `review-blocked`, the other 72 are `planning-only`, and `grounded-playable` is 0. `RESOURCE-LEDGER.json` derives `classWeeksPlayable: 0`; no route, shell, art, or cast plan can increment it. |
| Next grounded Week | No-go | [`evidence/next-grounded-week/REPORT.md`](evidence/next-grounded-week/REPORT.md) selects `l3-2-l04` as the smallest closed next slice, but it remains blocked: 137 donor candidates are not Source Questions, 114 lack loci, 28 need media review, and three MP3s lack verified transcripts/timecodes/pairing. |

## Protected local work

These paths predate Academy and remain outside Academy commits:

- `dist/yomu.user.js`
- `src/reader/dom/index.ts`
- `tests/reader/framework-managed-mirror.test.ts`
- `scripts/nhk-diag.mjs`
- `scripts/nhk-mirror-overlap-smoke.mjs`
- `scripts/nhk-probe2.mjs`

The latest protected snapshot is `fcdf50ca1c6b1b5fc734a95a0a916c8adca39e50`; equivalent intermediate snapshots remain at `9df954dadad3b7eefb58fdcc8045b19bec13f626` and `2faaad35627ed90bc03e5f878c2d0d9010b5c81c`. The pre-Academy copies remain `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` and `c228c1ea483b49634fb2a642954916e3efcf0197`.

## Open work

- Stage 1 proved plumbing, but its ungrounded activity routes no longer count as delivery and cannot create new evidence. Product acceptance remains reopened under `DIRECTION-RESET.md`.
- Stage 2 has mechanically censused all Moodle payloads; human source-question/media/answer review remains open. One Moodle question is audited and implemented, but its legacy ungrounded route is quarantined, so current playable coverage is zero.
- The 42 GB shared Japanese library's separate ledger, archive/PDF/media census, privacy-safe public status, and resource-ledger section are complete. Five ZIP64 containers remain explicit failures; 2,073 unknown-extension files, 34,222 mechanical PDF question signals, source-question review, rights decisions, transcripts, and media-to-activity pairing remain open. No mechanical candidate is verified/playable coverage.
- Stage 3 still owns 73/73 authored and reachable class Weeks, including Minna 24/26 bridges.
- Stage 4 still owns calibrated Foundation–N1 banks, audited recurring mock forms, and complete four-skill evidence.
- Stages 5–6 still own the full cast/story/art/audio production. Aakash, Xingyu, and three Rie expressions are explicit release-blocked previews; Mika, Sophie, and Ruparna remain correctly withheld where photo-to-name evidence is insufficient.
- Stage 7 now has live Worker/D1/R2 access, `UCL2026`, protected range media, and one uncharged live `cs_live_…` Checkout proof. The client return flow is implemented; an actual paid webhook→claim acceptance, logout/expiry/revocation, event sync, and cross-device proof remain open.
- Physical iPhone/iPad/Apple Pencil acceptance remains an owner gate in Stage 8.
- Lesson 0 still fails the release gate. The concealment mechanism is executable and adversarially reviewed, but `blocker:lesson-zero-answer-concealment-surface-audit` remains until every real pre-commit renderer produces a matching audit artifact. Audio remains 0/4 ready; the two script/activity mismatches are repaired, while recordings and exact media bindings remain open.

## Next three actions

1. Resolve Lesson 0's remaining concealment, accessibility, authored-audio, assessment, and transfer proofs; let the validator flip delivery state last.
2. Complete the equal Course presentation host and the first curated Library video/PDF shelf without creating another activity or progress system.
3. Process `l3-2-l04` in the report's no-go order: question census and loci first, then media/audio/answers, teaching/production, runtime proof, and finally the derived ledger.
