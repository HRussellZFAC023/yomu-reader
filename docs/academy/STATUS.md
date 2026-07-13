# Yomu Academy status

**Updated:** 2026-07-13 (direction reset active; journal, learner-freedom, cast-integrity, and audio-runtime slices verified)

**Current stage:** Product direction reset before further Stage 2–8 volume. Stage 1 engineering evidence remains valid; its learner-experience acceptance is reopened.

**Canonical release line:** Stage 1 was pushed through `5f759ee5f`; source is `371140513`, hosted assets are `c5ef4629d`, Pages run `29203203144` deployed them successfully, and post-build asset refresh `d1104d10d` is integrated beneath this stage-close record.

## Gate board

| Gate | State | Evidence |
| --- | --- | --- |
| Stage 0 baseline | Green | Discovery, source inventories, salvage decisions, pins, and preservation commits `055bb4eca` / `3d1624fb3` are on `origin/main`. |
| Direction reset | Amber / active | [`DIRECTION-RESET.md`](DIRECTION-RESET.md), seven concept boards, sixteen current-app Browser captures, and two likeness-gate sheets define and prove the corrected direction. Text, Aakash, journal, day-end, and donation-letter slices pass visually; the complete Lesson 0 and Sound/Speaking missions remain open. |
| Separate hosted application | Green | `config/vite/academy.config.ts`, `academy/index.html`, and `scripts/sync-academy.cjs`; readable Academy output remains outside `dist/yomu.user.js`. |
| Deep module boundaries | Green | Source, Activity, Scene, Learner Event, Audio, access, persistence, routing-flow, evidence, and Yomu bridge Modules have conformance tests; core orchestrators are below 300 lines. |
| Enrollment and placement | Green for invite access | `UCL2026` now exchanges against the live Cloudflare Worker/D1 and returns a cloud session; Rie fiction note, name/reason, four portraits, Lesson 0, manual N5–N1, skill-evidence mock, learner override, and five band-entry tasks work. Cross-device account/link proof remains open. |
| Faithful source slice | Green | Moodle Level 1 Lesson 1 page 2 item 9 has immutable document/occurrence/question and separate augmentation records, exact SHA-256 provenance, precise repair, retry, and review scheduling. |
| Learning/world loop | Red / active | Text and Aakash are full-bleed sprite-led VN scenes with Japanese IME production and repair. The native `…` menu now exposes lesson choice and a persistent, reversible end-of-day VN scene; Aakash returns to campus instead of forcing writing. The isolated single-kanji route and incomplete full lesson still need replacement. |
| Reader integration | Green for current slice | Learner-controlled prompt/dialogue annotation works in the VN scenes. Sequential and prefetched scans now share authored sense resolution; live replay renders `行( い )って` with heiban `行く` evidence. Tests preserve one-token `もう一度`, exact reading/pitch, and popover components `もう` / `一度`. Full-corpus annotation acceptance remains a later gate. |
| Audio lifecycle | Green for approved BGM/SFX; lesson speech amber | Live authenticated R2 HEAD/range and Browser playback prove Royal Days plus Shinday confirm; anonymous media returns 401. Native-fetch binding, local secure-cookie bridging, eager pre-auth SFX, protected-media SW caching, and a stale volume overshoot are fixed. The Moodle handout has no speech audio, so Lesson 0 recordings remain open. |
| Offline shell | Green | Annotated N4 state reloaded offline in the accepted Browser build. An isolated rebuild of committed source produced deploy revision `s1-bbf9a61f26a3` and passed Academy build, docs build, and userscript verification. |
| Responsive/accessibility | Green for slice | Current real app: 320×780 annotated controls stay inside 26–294 px with `scrollWidth=320` and zero duplicate radio inputs; 390×844, 1024×768, and 1440×900 visual evidence is stored under `evidence/stage-1/`. |
| Academy tests | Green for current slice | Definitive `npm run check:academy` passes 55 files / 280 tests, source-public validation, TypeScript, and the Academy production build. The current hosted revision is `s1-d4a83db85bf2`; the separate Japanese-library status remains an honest generation warning, not a coverage claim. |
| Cross-model review | Green | The architecture follow-up passed in session `4308dfa7-1730-450e-b96d-6a22239cd44e`. Final delta session `7e12dfb2-4dbc-4cd4-bb65-9af74ec64bab` found one hover-only contrast blocker, verified its 5.10:1 composed-mirror fix, and returned `PASS`. |
| Full repository check | Amber for current delta | The earlier Stage 1 `npm run qa` passed end to end. For this delta, Reader focused tests, production build, hosted sync, docs build, and userscript verification pass at 1,896,391 bytes; the full repository `npm run check` / `npm run qa` rerun remains open before release. |
| Deployment path | Green | Pages workflow now rebuilds hosted Reader assets, then Academy, then VitePress so the Academy service-worker revision hashes the exact deployed dependencies. |
| Commit, push, deploy | Amber for current slice | The earlier Stage 1 Pages line remains green at `5f759ee5f`. The Cloudflare Worker/D1/R2 boundary is live for `UCL2026` and protected audio, while the current direction-reset frontend is verified locally but not yet committed/pushed/deployed. |
| Stage 2 source baseline | In progress | The audited denominator remains 96 Moodle archives, 916 occurrences, 688 unique payloads, 716 PDF occurrences / 527 unique PDFs, and 185 MP3 occurrences / 146 unique audio payloads. Only the single Stage 1 source question is currently claimed playable. |
| Stage 2 Moodle payload ledger | Green | Manifest SHA `2400b43e…a78`; 96/96 archives, 916 member occurrences, 688 unique member payloads, 3 direct resources / 1 unique direct payload, and 1,466,136,959 uncompressed bytes reconcile exactly. Every tracked payload has an explicit stored/census state. |
| Stage 2 PDF/media census | Green for Moodle | 527/527 unique PDFs: 1,087 pages, 4,931 native objects extracted, 2,982 positioned media regions, 100,479 text boxes, and 906 vector-review pages; layout/native/vector failures are all zero. 146/146 audio payloads probe successfully. |
| Stage 2 pack migration | Green as candidates | All 44 donor packs and 879 items survive as 879 immutable source-item candidates plus 879 disjoint augmentation records. The claim guard still reports only 1 verified/playable Source Question; 699 loci and all donor answers/media remain review-required. |
| Stage 2 private editor | Green | A real three-page kanji source loaded all page images over HTTP 200 with 13 candidates and no `file://` URLs. Its overlay exposed 114 text boxes, four media regions, and two vector pages; screenshots remain in ignored private artifacts because the source is not public. |
| Stage 2 tests/privacy | Green for Moodle | The four source-pipeline suites pass 32/32 after generation; public validation and `git diff --check` pass. All 96 archives were rescanned under CRC32 validation and all 527 PDF render sets have DPI/page-count sidecars. Fable session `bf7e5f77-af85-495d-b3bc-fdb4777d6ea6` re-ran validation, independently checked public privacy/counts, verified all six follow-up fixes, and returned `PASS`. |
| Shared Japanese library | In progress | Owner authorized the same harness for `/Users/heru/Documents/Japanese` (42 GB, 13,123 files). It will retain separate denominators and deduplicate against Moodle; no library count may inflate Moodle coverage. |
| 73-week cast planning | Green as planning data | Versioned 73/73 appearance planning is pinned to the donor week index: 67 source-topic-backed assignments, six honest review-required gaps, all 19 documented classmates with a primary appearance, exact-name/specialty/concentration validation, and no claim that weeks are authored or playable. |

## Protected local work

These paths predate Academy and remain outside Academy commits:

- `dist/yomu.user.js`
- `src/reader/dom/index.ts`
- `tests/reader/framework-managed-mirror.test.ts`
- `scripts/nhk-diag.mjs`
- `scripts/nhk-mirror-overlap-smoke.mjs`
- `scripts/nhk-probe2.mjs`

Safety stashes remain at `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` and `c228c1ea`.

## Open work

- The Stage 1 route proved plumbing but not a credible first class: it makes only one of fourteen source-handout expressions playable, leaks assessed meanings in English, then jumps to an unrelated single-kanji choice. Product acceptance is reopened under `DIRECTION-RESET.md`.
- Stage 2 has mechanically censused all Moodle payloads; human source-question/media/answer review remains open and only one Moodle question is claimed playable.
- The newly authorized 42 GB shared Japanese library still needs its separate resumable ledger, PDF/media census, and privacy-safe status output.
- Stage 3 still owns 73/73 authored and reachable class Weeks, including Minna 24/26 bridges.
- Stage 4 still owns calibrated Foundation–N1 banks, audited recurring mock forms, and complete four-skill evidence.
- Stages 5–6 still own the full cast/story/art/audio production. Aakash, Xingyu, and three Rie expressions are explicit release-blocked previews; Mika, Sophie, and Ruparna remain correctly withheld where photo-to-name evidence is insufficient.
- Stage 7 now has live Worker/D1/R2 access, `UCL2026`, protected range media, and one uncharged live `cs_live_…` Checkout proof. The client return flow is implemented; an actual paid webhook→claim acceptance, logout/expiry/revocation, event sync, and cross-device proof remain open.
- Physical iPhone/iPad/Apple Pencil acceptance remains an owner gate in Stage 8.

## Next three actions

1. Replace the isolated single-kanji route with the lesson's complete kanji set through the shared Study/Doodle session.
2. Expand the proven Text segment into the full resumable Lesson 0 and author/record the verified atomic classroom lines plus one natural sequence.
3. Implement Sound and Speaking only with defensible host likenesses and paired audio; keep the three missions materially different.
