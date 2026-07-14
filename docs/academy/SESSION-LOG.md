# Yomu Academy session log

## 2026-07-12 — Stage 0 baseline and preservation

### Repository work

- Confirmed the nested Git root and read `AGENTS.md`, `package.json`, the Yomu audit skill, and its evidence checklist.
- Initial state: local `main` at `be74ced31839ecbb183b52147e9da7acfe927fef`, 249 commits behind `origin/main`, with 16 modified Reader files and three untracked NHK probes.
- `git fetch origin main --tags` fetched the branch but exited 1 because local tag `v1.6.38` would be clobbered. Re-ran `git fetch --no-tags origin main` successfully.
- Saved all dirty/untracked work as stash `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` (`pre-academy-preserve-reader-work-2026-07-12`), fast-forwarded to `472375626e47643b36abdf510ed79e14b54dba5f`, then applied the stash without dropping it.
- Resolved seven conflicts. Git history showed the stashed settings/pitch/CSS work had already landed upstream and received subsequent safety/accessibility improvements, so those paths retained upstream. Generated `dist` conflicts were resolved by rebuilding from source.
- Preserved the genuinely new NHK/framework mirror changes. Re-enabled the intended same-text replacement re-conceal path using weakly resolved live host/state; no attribute feedback loop occurs because attribute-only callbacks return without rewriting present properties.
- Restored the local dependency tree with `npm ci`. It reported eight transitive audit findings and five install scripts requiring allow-list review; no opportunistic dependency mutation was performed.
- Copied all 18 discovery documents byte-for-byte into `docs/academy/discovery/`.
- Created six clean shallow reference clones at the exact pinned commits and tracked recreation metadata rather than nested repositories.
- Generated a full inventory for both donors and 14 dormant worktrees. Donor A currently has 271 dirty tracked and 2,529 untracked records; no wholesale merge is permitted.

### Verification

- `npm run typecheck` — passed.
- `npx vitest run tests/reader/compound-pitch.test.ts tests/reader/framework-managed-mirror.test.ts tests/reader/settings-css.test.ts` — first run: 40 passed, one preserved NHK test failed because its observer call was commented.
- `npx vitest run tests/reader/framework-managed-mirror.test.ts tests/reader/mirror-observer-leak.test.ts tests/reader/nhk-framework-duplication.test.ts tests/reader/repaint-loop-mirror.test.ts tests/reader/listener-lifecycle-leak.test.ts` — 47 passed, 1 existing skip after the lifecycle-safe fix.
- `npm run build` — passed; readable userscript output 2,043.92 kB (436.50 kB gzip).
- First isolated `npm run check` attempt — all TypeScript, regular CI shards, JPDB shards, and builds passed; VitePress then rejected one Stage 0 directory link (`discovery/` resolved as missing `discovery/index`). Corrected the link to `discovery/README.md` before rerunning the gate.
- Final isolated `npm run check` — passed end to end. All four regular CI shards and eight JPDB shards passed, then userscript/companion builds, generated-doc sync, VitePress, and verification passed. Final readable `dist/yomu.user.js`: 1,887,240 bytes and 43,448 lines, leaving 112,760 bytes under the Greasy Fork limit; the existing >90% size warning remains an architectural constraint.
- `diff -qr` between the source discovery pack and repository copy — no differences; 18 files.
- Inventory JSON parses and contains all 16 configured evidence sources.
- Browser evidence: none; Stage 0 has no Academy runtime change.

### Cross-model review

- Prepared and invoked a read-only Claude Fable conflict review using the repository's required stdin workflow and `--permission-mode plan`.
- Claude returned HTTP 429 before reading the repository: session limit reached, resets 16:00 Europe/London. No files changed. Retry is mandatory before a risky release.

### Next action

Begin the Stage 1 enrollment slice from the authorized salvage list, starting with deep runtime interfaces and the audio boundary before visual polish.

### Stage close

- Committed the green baseline as `055bb4eca` (`academy: establish one-shot production baseline`).
- Pushed `main` from `472375626` to `055bb4eca` on `origin`.
- No deployment was relevant because Stage 0 introduced no runtime or hosted Academy surface.
- Stage 1 is now active; protected Reader/NHK work remains isolated until the status-close commit is complete.

## 2026-07-12 — Stage 1 enrollment vertical slice

### Architecture and implementation

- Added a separate readable Vite application at `/academy/` with an allowlisted
  hosted sync; Academy curriculum/art does not enter the size-limited
  userscript bundle.
- Established Source Library, Activity Runtime, Scene Runtime, Learner Record,
  IndexedDB event store, AudioDirector, access gateway, Yomu bridge, route-flow,
  and learning-evidence Modules with conformance tests.
- Split application ownership so `AcademyApp` is 244 lines,
  `EnrollmentFlow` owns enrollment/placement, `WorldFlow` owns the campus loop,
  and `LearnerEvidence` owns append-only mutations. Recorded ADRs 0001–0004.
- Made event batches one IndexedDB transaction. Deterministic milestone/review
  IDs, payload-equivalence checks, one serial mutation queue, and scheduled
  review projection make retries and reloads idempotent.

### Product slice

- Implemented localhost `UCL2026` exchange behind the production access
  interface, Rie's exact fiction note, name/reason capture, four approved
  protagonist choices, and replayable Rie unlock/bond state.
- Implemented Lesson 0, manual N5–N1 choice, the optional separate-skill mock,
  learner override, and five authored transfer tasks after level-specific
  plot-preserving bridges. Curriculum evidence never marks earlier scenes seen.
- Extracted Moodle Level 1 Lesson 1 page 2 item 9 into immutable source and
  occurrence records with exact archive/document hashes. Augmentation supplies
  deterministic accepted answers, error-specific explanation, smaller repair,
  nearby example, retry, and Yomu review seed without rewriting the source.
- Added the Aakash rainy-directions repair/unlock/bond beat, responsive approved
  event art, class journal/replay, location-first campus, canonical local review,
  Language Lab listening/shadowing record, and intentional audio silence.
- Reused Reader KanjiVG, Doodle, stroke assessment, annotation, pitch,
  dictionary, settings, and localisation surfaces. Added a keyboard-equivalent
  rightward writing path with an explicit evidence tag.

### Art, source, and offline integrity

- Bound only approved Rie/protagonist/location/event deliveries. The art ledger
  records provenance, verdict, runtime home, and SHA-256 for every shipped file;
  a validator rejects unledgered or mistyped runtime art. Donor Flux/Python
  families remain rejected.
- Vendored only the required KanjiVG glyph plus CC BY-SA licence/attribution;
  the browser adapter rebuilds allowlisted SVG/path attributes rather than
  injecting source markup.
- Replaced a hand-maintained service-worker revision after Browser QA proved it
  could serve stale bytes. `sync-academy.cjs` now derives a SHA-256 revision from
  every allowlisted runtime file and hosted Reader dependency, then renders the
  HTML/SW templates. Failed navigation responses are never cached.

### Browser evidence

- Fresh actual-app route `qa-run=final-stage1-acceptance` completed:
  code -> profile -> Rie unlock -> Lesson 0/Sound -> wrong source answer/repair
  -> source pass -> wrong direction/repair -> Aakash unlock -> handwriting ->
  campus -> review -> unlocked Lab/Cafe -> journal -> reload. Console was empty.
- Manual N3 and mock recommendation/override routes reached their correct
  transfer content and restored after reload.
- Reader annotations were present before interaction. At 320×780 all annotated
  answer controls stayed inside the viewport with no duplicate radio controls;
  390×844, 1024×768, and 1440×900 captures have no horizontal overflow.
- An annotated N4 route reloaded from the content-hashed service-worker cache
  under CDP network-offline conditions and exposed the explicit offline state.
- Evidence and current real-app screenshots are in `evidence/stage-1/`.

### Review and verification

- Initial Claude Fable review returned `BLOCK` for art provenance, direct mock
  speech, navigation cache poisoning, stale bundle revisions, event atomicity,
  duplicate review scheduling, keyboard handwriting, and related lifecycle/
  accessibility/documentation gaps.
- Resolved every finding with enforcing tests. Follow-up session
  `4308dfa7-1730-450e-b96d-6a22239cd44e` re-read the diff, re-ran all 61 Academy
  tests, and returned `PASS`; compact evidence is in
  `evidence/stage-1/FABLE-REVIEW.md`.
- The first full `npm run qa` attempt found a separate Reader lifecycle race:
  an empty native subtitle cue poll could apply after controller destruction and
  reach viewport code after Vitest teardown. Added a destroyed-state guard,
  automatic installed-controller cleanup, and a focused regression. Typecheck
  and the full 241-test subtitle controller file pass.
- The second full run exposed two genuine hosted accessibility defects. A linked
  `/yomu.css` was being superseded by a late fallback fetch, so hosted linked CSS
  is now authoritative. The docs theme also hydrated from inaccessible white
  accent ink through a transient grey Reader mirror. Synchronous accent/brand
  ink tokens, a pure contrast selector with black fallback, mirror-aware hover
  styling, and focused tests now keep rest and hover states at AA contrast.
- Raised the Reader FAB's resting opacity floor and added a CSS contract after
  axe found its label below contrast on hosted pages.
- The complexity gate initially found one Academy validator and two inherited QA
  script functions above 30. Split them by event contract, layout responsibility,
  and zoom-attempt lifecycle without changing assertions; the repository maximum
  is now 29.
- Final Fable delta session `7e12dfb2-4dbc-4cd4-bb65-9af74ec64bab` first returned
  `BLOCK` for the primary CTA hover ink, then inspected the real fix and returned
  `PASS`. Browser evidence after annotation injection measured the visible mirror
  at `rgb(0,0,0)` over `rgb(77,137,105)`, contrast 5.0978:1.
- Definitive `npm run qa` passed end to end. Four regular Reader shards passed
  3,508 tests with one existing skip; eight JPDB shards passed 1,010 tests;
  Academy passed 20 files / 61 tests. Builds and verification passed with the
  readable userscript at 1,889,000 bytes (111,000 bytes below the Greasy Fork
  limit). Feedback/PDF/Google P0 smokes passed, deterministic QA was 13/13,
  docs accessibility was 66/66 across desktop/iPad/iPhone, and complexity peaked
  at 29/30. The accepted Browser build revision was `s1-15dd1d7d700f`.
- Committed the reviewed Stage 1 source boundary, then rebased it as `371140513`
  over upstream's bot-generated hosted-version update, leaving every
  protected Reader/NHK path unstaged. Rebuilt from an isolated checkout of that
  exact source tree, synced hosted Reader assets as `c5ef4629d`, built Academy,
  built VitePress, and verified the userscript. The clean deploy candidate is `s1-bbf9a61f26a3`;
  verification reported 1,887,405 bytes and 43,451 lines.

### Stage close

- Pushed the rebased Stage 1 line through `5f759ee5f`. Pages run `29203203144`
  passed the Reader build, hosted sync, Academy build, VitePress build,
  userscript verification, artifact upload, and deployment.
- Smoked `https://yomureader.com/academy/` in an isolated real browser at
  1440x900. The page rendered the approved entrance composition without
  horizontal overflow; Reader injected two word wrappers and one ruby while
  leaving zero duplicate radios.
- Verified live revision `s1-bbf9a61f26a3`, active `/academy/` service-worker
  scope, and HTTP 200 responses for revisioned JS/CSS, manifest, service worker,
  campus art, and the vertical-slice source record. Production `UCL2026` failed
  closed with the authored Stage 7 boundary message.
- Closed Stage 1 and opened Stage 2. Next action is the lossless 96-archive
  occurrence/payload reconciliation; the product still claims exactly one
  faithful playable Moodle question.

## 2026-07-12 — Stage 2 source pipeline authored (execution pending)

### Implementation

- Authored the Stage 2 source pipeline as focused modules under
  `scripts/academy-source-pipeline/` with a small CLI at
  `scripts/academy-source-pipeline.mjs`: ZIP central-directory IO (`zip.mjs`,
  fflate inflate only), manifest verification/mapping (`manifest.mjs`),
  resumable private occurrence/payload ledger + content-addressed extraction
  (`ledger.mjs`, `payload-store.mjs`), pure PDF-census parsers
  (`pdf-census-parse.mjs`) plus the resumable poppler census at 200 DPI with a
  per-document HTML visual review index (`pdf-census.mjs`), ffprobe audio
  census (`audio-census.mjs`), donor 44-pack migration into disjoint immutable
  source candidates vs augmentation (`packs.mjs`), duration-based listening
  pairing candidates (`pairing.mjs`), the private teacher/editor side-by-side
  comparison surface (`compare.mjs`), allowlist public serializers
  (`public-outputs.mjs`), a structural + token privacy boundary
  (`privacy.mjs`), committed-output validators (`validate.mjs`), and the
  claim-preserving RESOURCE-LEDGER updater (`resource-ledger.mjs`).
- Public outputs are metadata-only under
  `public/academy/content/source-pipeline/` (`catalog.v2.json`,
  `corpus-status.v1.json`, `pack-migration.v1.json`); private outputs live
  under Git-ignored `artifacts/yomu-academy/source-pipeline/`. Denominators
  stay distinct (occurrence / unique payload / item candidate / verified
  question / playable activity) and the claim guard pins verified/playable at
  the Stage 1 value of exactly 1.
- Added five Academy test files covering fixture-ZIP catalog determinism,
  dedup/hash/size integrity, resumable scan caching, atomic writes, manifest
  hash refusal, privacy token/structural regression, claim inflation refusal,
  the committed 96/916/688 baseline (skip-until-generated), pdfinfo/pdfimages/
  question-signal/image-dependency parsing, pack split disjointness, unresolved
  locus/media review states, and teacher-comparison root confinement.
- Wired `academy:source:census` / `academy:source:pipeline` /
  `academy:source:validate` package scripts and added the cheap public
  validator to `check:academy`; it warns (not fails) while outputs are absent
  so ordinary CI never needs the private corpus.

### Verification and blocker

- Verified corpus preconditions with read-only commands: 96 folder ZIPs plus
  3 direct DOCX resources under the private raw root, manifest present.
- BLOCKER: this session's permission sandbox denies every process-spawning
  command (`node scripts/…`, `npm run …`, `npx vitest`, `pdfinfo`, `ffprobe`),
  so the new tests, `npm run typecheck`, the full private corpus run, and
  therefore the committed public outputs and RESOURCE-LEDGER update could not
  be executed. No verification is claimed. Next session must run
  `npm run test:academy`, `npm run academy:source:pipeline`, and
  `npm run check:academy`, then commit generated public outputs after the
  validators pass.

## 2026-07-12 — Stage 2 Moodle corpus executed and verified

The earlier execution blocker was removed in the continuing session; this section supersedes the pending state above.

### Corpus and extraction

- Located and hashed the canonical private capture at `resources/yomu-academy/moodle-raw`; its manifest SHA-256 is `2400b43ef8b022e525272a4e0f2331da09e9ade5f72d7f9a0c70c9e7b1329a78`.
- Reconciled 96 archive occurrences, 916 member occurrences, 688 unique archive-member payloads, 3 direct resources / 1 unique direct payload, and 1,466,136,959 uncompressed member bytes. Archive/member hashes, sizes, extensions, and duplicate counts match the donor catalog exactly.
- Stored one private byte file per SHA-256 (689 including the direct-only payload); a resumed ledger run performed zero archive rescans.
- Censused all 527 unique PDFs at 200 DPI: 1,087 pages, 4,931 listed/extracted native image objects, 2,982 positioned media regions, 100,479 text boxes, and 906 vector-review pages (824 heavy, 82 content). Three pages in two documents lack text layers; none lacks a render or layout. PDF/layout/native/vector failure counts are zero.
- Probed all 146 unique audio payloads with ffprobe; failure count is zero. External calls are bounded by hard timeouts and explicit, opt-in retry states.
- Migrated all 44 donor packs: 879 donor items became 879 immutable source-item candidates plus 879 disjoint augmentation records. The migration retains 249 instructions, 180 donor page candidates, 429 image refs, 229 audio refs, and 879 donor answer claims. It refuses any unmapped donor field.
- Duration matching produced candidates for all 15 pack-level audio references, with only two unique matches; transcript, rights, and review status remain explicit and no pairing is reported complete.

### Public/privacy boundary

- Generated `catalog.v2.json`, `corpus-status.v1.json`, and `pack-migration.v1.json` plus the RESOURCE-LEDGER update. The public set is allowlisted metadata only and is hosted through the Academy sync allowlist.
- Structural validation, exact 96/916/688 and 716/527/185/146 baseline validation, real-private-token scanning, explicit payload-state checks, aggregate reconciliation, and the source/playable claim guard all pass.
- `allPayloadsCensused` is honestly true. Source fidelity, media fidelity, and listening pairing remain false. Only the single Stage 1 Source Question remains verified/playable.

### Browser evidence

- Served the ignored private teacher surface over localhost and opened the real `wp-b6446cd4695a` three-page kanji pack.
- All three 1,654×2,339 page renders returned HTTP 200; 13/13 candidates were present and no element used a `file://` URL after fixing the common-root resolver.
- The linked page/object/media overlay rendered three pages, 114 text boxes, four positioned media boxes, and two vector-page boxes without horizontal overflow at desktop width.
- Private screenshots are stored under the ignored teacher/PDF artifact roots; they are not committed because they contain source material.

### Verification

- `npm run test:academy` — 24 files, 86 passed, one pre-generation skip.
- `npm run typecheck` — passed.
- `npm run academy:source:pipeline` — passed repeatedly from cache.
- `npm run academy:source:validate` — passed.
- `git diff --check` on the Stage 2 slice — passed.
- The newly authorized 42 GB shared Japanese-library pass remains Stage 2 work and will keep separate denominators.

### Adversarial closure

- Fable session `bf7e5f77-af85-495d-b3bc-fdb4777d6ea6` first returned `PASS` with six non-gating robustness findings. All six were fixed: render reuse now requires a DPI/page-count sidecar; ZIP member CRC32 is verified; the archive scan reads one buffer and invalidates pre-CRC caches; PDF/audio denominators derive from the ledger; donor page renders are copied into the private HTTP-served root; and escaped privacy tokens are detected.
- Re-ran the real pipeline. All 96 archives were rescanned through CRC32 validation, 527/527 PDF render sets received explicit sidecars without unnecessary re-rendering, and the public validator remained green with the exact audited counts and 1/1 verified/playable claim.
- Added real regressions for unchanged-length ZIP corruption, render-DPI/page-count mismatch, empty-census denominator honesty, private render copying, and quote/backslash token escaping. The four focused suites pass 32/32.
- Rechecked the teacher comparison at the browser tool's 500 px minimum: document `clientWidth` and `scrollWidth` are both 485 px. The private mobile screenshot remains under the ignored artifact root.
- Resumed the same Fable session after quota refresh. It inspected every fix and test, re-ran public validation, independently rescanned the three public outputs plus RESOURCE-LEDGER for private material and count drift, and returned final `PASS` with no release-blocking defects.

## 2026-07-12 — Product direction reset

### Why implementation paused

- User acceptance identified a structural failure beneath the green Stage 1 engineering proof: the first route teaches only item 9 from a fourteen-expression source handout through an English answer-leaking choice, then jumps to an unrelated single `一` exercise.
- Stopped concurrent product slices and the 42 GB library census at safe resumable boundaries. No donor or private source tree was mutated.
- Re-read the real opening source, Donor A's fuller first-week structure, the discovery pack, and accumulated browser feedback from the learner's perspective.

### Binding correction

- Added [`DIRECTION-RESET.md`](DIRECTION-RESET.md). Japanese learning now has an explicit priority over game systems, followed by living-class presentation, reversible navigation, and world polish.
- Defined Lesson 0 as a resumable 60–90 minute class: greetings, sound/script, the complete fourteen-expression survival activity, first sentence frames, useful vocabulary, paired multi-speaker input, reading, matched production, transfer, and close.
- Made Sound, Text, and Speaking distinct missions with different early cast/place, practice balance, story result, and evidence profile.
- Defined room/corridor, campus/neighbourhood, and travel-region map scales; Japanese signage, doors, paths, minimap, parallax travel, and a discovered physical map replace destination cards.
- Defined the 42 GB learner boundary: immutable sources feed authored Week bundles and lazy shards; the learner sees one coherent class, never archive or extraction state.
- Reopened Stage 1 learner-experience acceptance while preserving its access/persistence/source/annotation/offline engineering evidence.

### Visual evidence

- Generated seven direction boards under `evidence/direction-reset/`: the complete first class, VN/source flow, expanded world map, lesson-content journey, three consequential opening missions, journal-native freedom, and the production/repair interaction loop.
- Regenerated the opening-missions board after the first concept invented `さくらさん`. Version 2 uses only canonical hosts: Xingyu/Mika, Sophie/Ruparna, and Aakash/Sam; unapproved likenesses remain deliberately obscured.
- Recorded exact hashes and the concept-only boundary in `evidence/direction-reset/README.md`. Generated text is illustrative and cannot enter canonical lesson data.

### Verification and next action

- Documentation-only direction work; no runtime tests were relevant.
- Scheduled Fable review remains queued at the user's requested 3.5-hour interval.
- Next implementation is one production-quality ten-minute proof from the complete Lesson 0, followed by real-app phone/tablet/desktop acceptance before any content-volume work resumes.
# 2026-07-13 — Direction reset: current-app Text mission proof

## Product and content

- Added the complete versioned Lesson 0 package with all fourteen immutable classroom-expression records, nine resumable sections, sentence frames, vocabulary, eighteen authored activities, multi-speaker scripts, distinct Sound/Text/Speaking mission contracts, and explicit audio blockers.
- Added the canonical first-name-only cast registry and made Lesson 0 validation derive from it. Removed guessed Aakash/Alex kana aliases and corrected Rie from “new classmate” to teacher.
- Rewrote contrived introduction lines as natural `日本語を勉強しています` and a current-scene textbook/handout correction. One expression now emits one stable review seed even when the attempt touches multiple concepts.
- The source/audio audit confirmed the Moodle Lesson 1 ZIP and classroom-phrases PDF hashes but found no source audio. No local full-phrase recording passed provenance/pairing review; the authored-recording gate stays open.

## Interface and art

- Built a reusable full-bleed VN stage with living-paper dialogue, parallax, responsive cast/object slots, learner-controlled readings, earned translation, expression changes, lifecycle cleanup, and reduced-motion behavior.
- Generated and reviewed Rie happy, encouraging, and repair expression candidates; registered them as release-blocked runtime previews. Added the standalone Aakash preview sprite to the journal and replaced its duplicated rainy CG there.
- Replaced the Text route's translated choice card with a source-bound library scene: literal handout rows 4/6/7/9, contextual `もう一度` exposure, real Japanese IME response, response-specific repair, nearby contrast, source-faithful short-form acceptance, retry focus, Rie reaction, revealed source row, flower mark, and compact resolution.
- Replaced the next Aakash directions card and three-option recognition task with a cafe-rain VN: visible Aakash sprite, learner-controlled readings, Japanese IME route production, authored left/right diagnostics, retry, stable evidence/unlock IDs, and a concise in-character resolution. Current-app desktop/phone evidence is `11` and `12` in the direction-reset evidence index.
- Fixed the live VN stacking defect that hid the library and sprite behind the root background; fixed nested activity contrast; stopped automatic handout/prompt annotation and added explicit Yomu reading toggles.
- Removed visible “Recommended…” campus copy/styling. Location names remain Japanese in English mode, and the mission choices now match the authored locations.

## Verification

- Focused Academy suites: 8 files / 58 tests passed. Offline manifest: 3/3. `npx tsc --noEmit`, `npm run build:academy`, and `git diff --check` pass. Hosted sync now includes the Lesson 0 shard and required sprite expressions; revision `s1-dad19af5580c` preceded the final CSS refinements.
- Real Browser journey used `UCL2026`, created a fresh learner, selected Lesson 0 → Text, exercised readings, submitted `わかりました`, verified response-specific retry and Rie repair art, then passed with `もう一度お願いします` and verified happy art, flower mark, focus, persistence, and continuation.
- 390×844 and 1440×900 both have no horizontal overflow. Current-app evidence and hashes are recorded in `evidence/direction-reset/README.md` (`08`–`10`).
- Live Browser QA also exposed an unrelated canonical Reader error: `行って` was annotated as `おこなって` in the old Aakash card. Its generic Reader fix and the Aakash VN replacement are the next active slices.
- Fixed that Reader regression at its source: ordinary sequential scans had bypassed the authored-vocabulary resolution used by prefetch. Both now share `applyParsedBatch`. After reloading the rebuilt hosted Reader, real Aakash-memory DOM rendered `行( い )って` with `expression=行く`, `reading=いく`, `pitch=heiban`; focused compound tests keep `もう一度` as one pitched token with its two component links.

## 2026-07-13 — Journal, cast rotation, and learner freedom

- Enlarged Rie's journal cutout so she deliberately crosses the living-paper edge and replaced the repeated rainy event image with Aakash's transparent sprite. Current-app captures `13` and `14` are indexed under `evidence/direction-reset/`.
- Added a dossier-backed authored-cast guard: canonical IDs and exact visible first names, lesson-specialty fit, peer variety, and concentration limits. Lesson 0's Xingyu/Mika, Sophie/Ruparna, and Aakash/Sam pairs pass without speculative rotation.
- Generated one Xingyu neutral review candidate from defensible matched references. It is explicitly ledgered but release-blocked. Mika, Sophie, and Ruparna were withheld where the preserved photos do not support a safe name-to-face match.
- Added native `Choose lesson` and `End for today` actions to the `…` menu. Ending the day opens a full-bleed Rie scene, persists across reload, emits no false completion evidence, and returns to campus. Aakash no longer forces the learner into the writing desk.
- Normalized every overflow-menu action to the same left-aligned living-paper geometry. Browser QA verified lesson selection, end-day persistence, Japanese campus signs, Rie's breakout, and the Aakash sprite.
- Fixed a browser-media fade race that could set volume slightly above `1` and abort approved music playback. A strict media double covers the stale animation-frame timestamp.
- Verification: journal/menu/audio/asset suites 31/31; cast/content/routing/persistence/day-end suites 32/32; TypeScript and Academy production build passed at `s1-ad5e2d11ed58`.

## 2026-07-13 — Live access, approved audio, donation return, and 73-week cast plan

- Proved the live Cloudflare boundary with `UCL2026`: cloud session exchange succeeds; authenticated Persona/Shinday HEAD and 1,024-byte ranges return `200/206`; anonymous media returns `401`.
- Fixed the browser causes behind silent/failing playback: unbound native `fetch`, local rejection of Secure `__Host-` cookies, eager pre-auth SFX pools, access-route theme timing, protected-media service-worker caching, and stale-frame volume overshoot. Real Browser playback reached `readyState=4` with Royal Days playing and Shinday confirm decoded.
- Created exactly one owner-authorized £2 live Checkout session without payment. D1 records it as pending with a live Stripe session; secret presence was checked by name only. No key, cookie, token, URL, or full Checkout id entered logs or Git.
- Added the post-checkout claim flow: sensitive return parameters are removed from history immediately; polling is bounded and abortable; the generated code is validated, prefilled, and copyable without storage or URL leakage; pending/unavailable states have one concise retry.
- Added a versioned 73-week classmate appearance plan pinned to the donor index. Sixty-seven assignments have source-topic evidence; orientation and five outline-only kickoffs remain review-required. All 19 documented classmates receive primary appearances under exact-name, specialty, and concentration validators. This is explicitly planning-only, not authored/playable content.
- Browser evidence `16` records the real living-paper donation letter. Focused donation/i18n/human suites pass 27/27, live access/audio/Worker contracts 38/38, and cast planning 14/14. TypeScript and Academy build pass at `s1-63d201aec2dc`.

## 2026-07-13 — Authorized shared Japanese-library census

- Ran `/usr/bin/time -p env ACADEMY_LIBRARY_ROOT=/Users/heru/Documents/Japanese npm run academy:library:pipeline` against the authorized 42 GB tree. The initial uncached pass took 9,295.95 seconds (2h 34m 55.95s); its per-file/per-payload records remain under ignored `artifacts/yomu-academy/source-pipeline/library/` and no source byte was copied into Git.
- The private ledger accounts for 15,790 filesystem entries, 13,123 regular files, 44,588,237,342 bytes, 11,081 unique payloads, 72 resource duplicate occurrences, and 68 payload hashes also known to Moodle. Library and Moodle remain separate denominator universes.
- Archive states cover 89/89 unique containers: 84 censused and five explicit `failed:zip64-unsupported` records. Their aggregate member counts are 64,560 occurrences and 64,558 per-container unique member payloads; no member extraction failed and none was encrypted.
- PDF census covers 450/450 unique payloads, including 44 Moodle-census reuses and zero failures: 70,983 pages, 35,641 without a text layer, 320,534 native image objects, 271 positioned media regions, 5,221,967 text boxes, 34,222 mechanical question-signal candidates, and 66,420 vector-review pages. Candidates are not verified questions or playable coverage.
- Media census covers 5,090/5,090 unique payloads, including 23 Moodle-probe reuses and zero failures, with 439,732 aggregate duration seconds where duration exists.
- Private terminal-state assertions pass, the public-schema structural allowlist has zero violations, and the existing Moodle `catalog.v2.json`, `corpus-status.v1.json`, and `pack-migration.v1.json` hashes remain unchanged.
- Aggregate publication stopped safely before writing because private basenames `.cargo-lock`, `build`, `output`, `include`, and `audio` collide with legitimate aggregate extension/state/kind strings. `npm run academy:library:validate` therefore still reports that status has not been generated. The guard needs a tested collision-safe fix; bypassing it or marking the public gate green would be incorrect.

### Privacy-safe publish closure

- Narrowed the basename exception to exactly those five generic schema-vocabulary collisions. Their full relative paths remain private tokens; every other basename plus payload hashes and the library root remain guarded. Token matching now also catches JSON escaping, URI-path encoding, URI-component encoding, and lower-case percent escapes.
- Made `publish` cache-only. It validates ledger/census schema versions and archive/PDF/media row denominators, then refuses missing or stale caches instead of reopening the 42 GB source tree.
- Added an allowlisted archive failure-reason aggregate. The public status records 89 containers as 84 censused plus five `failed:zip64-unsupported`; it does not publish a filename, path, title, source string, or hash.
- Published `library-status.v1.json` and the separate `stage2LibraryCensus` resource-ledger section from cache in 0.966 seconds. Focused library/source-privacy tests pass 21/21; TypeScript, combined Moodle/library public validation, script syntax checks, and diff checks pass.
- Mechanical completion is not content completion. Five ZIP64 archives, 2,073 unknown-extension files, 34,222 question-signal candidates, human question/media review, rights, transcripts, and activity pairing remain open; the public claims stay false for verified coverage.

## 2026-07-13 — Fable-reviewed route and grounded-lesson reset

- Ran two read-only Fable 5 reviews at the owner's required low effort in session `665dfc90-1169-4bc7-ad70-1e2b61172438`. The review accepted the full-bleed VN stage, shared Study seam, source privacy boundary, and classroom-expression content contract, while rejecting hard-coded campus Back, planning-only Week links, repeated journal cards, dead menu controls, and surface inconsistency.
- Added [`LESSON-EXPERIENCE-CONTRACT.md`](LESSON-EXPERIENCE-CONTRACT.md): one route tree, equal Story/Course hosts, collapsed Class spine, compact lesson overview, focused activity/repair/return, ten predictable paper types, private on-demand library delivery, and explicit Nielsen/Jakob usability checks.
- Added the deep grounded-lesson validator. Lesson 0 remains honestly blocked where teaching, audio, grading definitions, repair, review keys, accessibility mappings, or other academic proofs are missing; story and art cannot change that status.
- Replaced the 73-Week horizontal Class rails and dead summary action with five collapsed level chapters. Only the current level expands; only runtime-bound Lesson 0 is interactive; People and Events follow the selected level. Focused Class tests pass 4/4.
- Captured the revised real-app Class path as `evidence/direction-reset/17-class-path-overview.png`. Persisted route history and Story/Course presentation state are the active Slice 1 implementation.
- Made grounding a production-build prerequisite. `npm run build:academy` now runs the complete lesson-directory registry and resource-ledger honesty gates first; focused validation passes 4/4. A new JSON lesson cannot enter the public lesson directory anonymously, and a review-blocked lesson cannot inflate the playable-Week denominator.

## 2026-07-13 — Hard grounding, route quarantine, and shared Study proof

### Academic write boundary

- Replaced caller-supplied grounding authority with a registry-backed resolver. Each complete lesson registration pins its filename, lesson ID, content revision, and SHA-256. The resolver hashes the shipped bytes before parsing, re-runs the lesson audit, and rejects an ID or revision mismatch.
- Made `LearnerEvidence.recordActivity` resolve that registered lesson before appending an attempt or scheduling review. It rejects a blocked lesson/activity, mismatched concepts, an ungrounded Source Question, or a review item outside the lesson's canonical allow-list.
- Added one resolvable definition registry for instruction, grading, prerequisite, repair, review, and answer-concealment proofs. Canonical review identity is normalized once across validation, runtime evidence, and scheduling; cross-activity reuse of one card for different concepts fails.
- Replaced the old self-asserted concealment flag with a surface-audit definition whose facts must match the claim. Lesson 0 remains honestly blocked on `blocker:lesson-zero-answer-concealment-surface-audit` until the real rendered surfaces pass that audit.
- Added six bilingual teaching blocks for all fourteen classroom expressions and deterministic graders only where the response construct supports them. Missing audio, accessibility, transfer, scene-action assessment, and other proofs remain named blockers rather than optimistic defaults.

### Delivery and navigation truth

- Derived the 73-Week delivery catalogue from the complete-lesson registry: orientation is `review-blocked`, the other 72 Weeks are `planning-only`, and zero are `grounded-playable`. The public ledger records `classWeeksPlayable: 0`.
- Classified the legacy band-entry, lesson-fork, source, Aakash, writing, and Lab activities as ungrounded routes. Current state and persisted Back history normalize them to safe destinations; a valid invite session no longer bypasses that normalization.
- Removed the legacy activity render/write paths. Known old Academy review provenance is quarantined conservatively: untouched Academy-only cards may be removed; reviewed cards remain as Study history with `legacy-academy`; their former Academy schedules are superseded by idempotent append-only neutralization events and disappear from the active learner/review-health projections.
- Added [`evidence/next-grounded-week/REPORT.md`](evidence/next-grounded-week/REPORT.md). `l3-2-l04` is the strongest next slice, but remains **NO-GO**: five PDFs and three MP3s are byte-matched, while 137 donor records still contain zero verified Source Questions, 114 unresolved loci, 28 media reviews, and no verified audio transcripts/timecodes/pairing.

### Real-app evidence and verification

- Current-app Browser acceptance used the live `UCL2026` local proxy. A fresh learner reached the blocked Lesson 0 overview with injected annotations and no false start action. Manual N3 placement crossed the concise arrival bridge and opened the correct Level 3.2 Class group.
- Academy mounted the canonical Reader Study implementation in living paper. The real countdown decreased from 15 minutes, Pause worked, Reader Study/Doodle content rendered with its own styles, and Back returned to Class without leaving the timer behind. Phone and 1280×720 Class views were exercised.
- Fable session `7796e6c9-3b8c-49b0-910d-1198fb711679` found and then cleared the fake-write-gate, review-identity, concealment, route-drift, catalogue, and byte-pinning defects. Its final read-only run passed 73 Academy files / 395 tests with no major or medium finding. The focused grounding closure passes 8 files / 49 tests.
- Fable session `cd7fe7bf-7928-456a-9575-d28c39c64da1` independently confirmed the `l3-2-l04` no-go and rejected audio probing or an authored donor shell as grounding evidence.
- Post-visual verification is green: `npm run test:academy` passes 74 files / 400 tests; TypeScript, grounded build preflight, the 377-module production build, and `git diff --check` pass. The focused legacy quarantine group passes 4 files / 15 tests.
- Fable session `608bc2f5-2bd5-4fd4-9bfa-8422349a67e1` found one medium learner-schedule leak, verified the append-only neutralization and retained-card audit tag, and returned `PASS` with no remaining major or medium issue. Commit, upstream integration, regenerated-hosted-assets proof, push, and deploy verification remain.
- Rebased the three green Academy commits onto `origin/main` at Yomu 1.6.148. The one conflict was the compound evidence seam: upstream's empty-`matchSurface` path initially hid `もう` / `一度`. The merged resolver now derives component spelling/reading from Jiten `readingFurigana`, prefers Jiten pitch, then local metadata, then the cached public pitch fallback. Compound, expression-pitch, and JPDB helper tests pass 1,023/1,023; TypeScript passes; Fable session `9b885516-6aff-41be-9e99-153be9bc830f` returned `PASS`.
- Rebuilt canonical `/study/`, its lightweight `/newtab/` alias, and Academy after the rebase. The grounded preflight passes 4/4 and the Academy bundle is `s1-9ec43fae8501`. Protected Reader source remains isolated from generated hosted assets; the non-merging pre-1.6.148 userscript artifact remains recoverable in stash `4571c4c579a01e4083c077b229787d642e7deb76`.
- Rebuilt the readable userscript and pinned Greasy Fork companion libraries from the rebased source, then resynced Study and docs. `npm run docs:build` and `npm run verify` pass; the userscript is 1,913,406 bytes with 86,594 bytes remaining under the 2 MB limit. Commits `c0eff3ffb`, `ff6049596`, `c9a7f4148`, and `aaa151089` preserve the grounded source, hosted Academy/Study assets, compound fix, and canonical release artifacts as separate green slices.
## 2026-07-13 — CI recovery and executable grounding evidence

### Release repair

- Fixed the extension compiler's stale `dist/newtab/redirect.html` input while retaining the hosted `/newtab/` compatibility alias. Chrome, Firefox, and Safari packages validate with no redirect traversal errors.
- Pointed shipped-asset parity at canonical `docs/public/study/app.js`; added the missing Japanese settings/help and hosted Academy copy. The formerly failing CI shards pass 31 files / 337 tests and 33 files / 370 tests.
- Ran Fallow as a trace-driven cleanup: registered real standalone CLIs and generated Study output, removed the unused Academy audio barrel and legacy band-entry screen, deleted unreachable one-item kanji/Lab/duplicate-review renderers, narrowed internal exports, and retained only targeted documented public/dynamic seams. Fallow reports zero findings.
- Fixed bfcache lifecycle: persisted `pagehide` keeps Academy alive; real unload disposes once. The behavioral regression passes.

### Grounding hardening

- Added a renderer-bound answer-concealment audit. A ready proof resolves renderer ID/revision/SHA/source, surface ownership, content-derived translations/transcripts/model/accepted answers, and registered assessment definitions, then recomputes findings from stored pre-commit outerHTML in pure JavaScript.
- The gate rejects self-asserted, dangling, stale, tampered, semicolon-less entity, shadow/custom-element, canvas/frame/object/embed, omitted-corpus, and browser-only evidence. Lesson 0 stays review-blocked because no real lesson surface artifact has passed.
- Audited every current Lesson 0 speech script against Moodle, the authorized Japanese library, and the approved runtime catalog. Result: 0/3 exact matches. The evidence report pins hashes and recording requirements without publishing source bytes.
- Corrected the source-question denominator after the stricter route gate quarantined the old Stage 1 activity. The durable source audit and implementation remain 1/1, but current learner-reachable grounded playability is 0. `RESOURCE-LEDGER.json` and both source-pipeline claim guards now enforce audited/implemented/playable `1/1/0` instead of preserving the historical `1/1` claim.

### Verification

- Academy: 75 files / 428 tests passed after placement, checkpoint-recovery, cast, concealment, and complexity coverage landed.
- Focused grounding/registry/lifecycle: 37/37 passed.
- TypeScript, Fallow, and `git diff --check`: passed.
- Fable low first failed four concrete bypasses in session `9ff9f8d1-b1be-4e81-9b15-244e7f0982f0`; all were fixed. Session `5d1ce53e-6c8e-426b-80ee-da979edb3908` returned `PASS`.
- Fable low session `50baaae3-00bb-4fe3-864a-921dcb1d7524` ruled that `*Playable` is a current learner-reachability/evidence-write claim, not a historical renderer-existence claim; the ledger correction above follows that rule.

### First-term cast addendum

- Added Shaun as a canonical first-term classmate and kept Peter distinct. The Level 1 People list now includes cast named by its Foundation events, the story timeline has a first-term Peter/Shaun entry, and the journal renders one deliberate first-term scrapbook spread rather than duplicating the campus image.
- Recorded only the owner-supplied likeness digest and non-sensitive visual locks. The source image remains outside Git. Shaun's neutral cutout is a review candidate; Peter remains text-only until a defensible likeness reference exists.
- Focused cast, 73-week planning, Class path, journal, and bilingual-copy tests pass 5 files / 35 tests.
- Remaining before push: canonical Reader/Academy/docs rebuilds, userscript verification, full check/QA, living-ledger consistency, commit, workflow green, and hosted smoke.

### Final checkpoint integration

- Reconciled all three Attempt 3 external reviews into [`evidence/attempt3-review/RECONCILIATION.md`](evidence/attempt3-review/RECONCILIATION.md). Accepted blockers remain explicit: 0/73 grounded-playable Weeks, no production `recordActivity` route, incomplete equal Course host, and incomplete full Lesson 0. Requirements that would remove the fiction note, optional placement, Course view, fidelity gate, ten-chapter relationships, or rejected-art gate were not adopted.
- Placement options are now assessed surfaces: Reader injection/lookup skips them before commitment, native labels remain selectable, and fresh phone Browser proof found no ruby/Reader descendants or answer-bearing ARIA text.
- Canonical Study now uses controller-local opaque DOM identities before reveal. Nested/audio actions and async kanji enrichment resolve through memory; full spelling/reading keys appear only after reveal. Focused Study tests pass 380/380. Standalone shared-card URL concealment is tracked separately so deep-link semantics are not changed casually.
- Added Peter and Shaun to the Foundation People/event record and first-term scrapbook. Peter remains a deliberate paper record with no invented portrait. Shaun's OpenAI neutral cutout is a journal review candidate only; `story-runtime` remains false until likeness/cast-scale approval. The generated asset is in the offline manifest.
- Corrupt checkpoints now recover to a clean start even if the repair write itself fails. Campus copy, Story/Course transition, Japanese world naming, relationship chapters, and journal layout were tightened without restoring card/dashboard chrome.
- Refactored the five functions over the project complexity ceiling without weakening validation: measured values are 3, 2, 1, 20, and 2 against the ceiling of 30.

### Final verification

- Reader CI passes all four regular shards under controlled concurrency: 244 files, 3,567 passed and one skipped. All eight JPDB shards pass 1,010/1,010. An earlier run shared the machine with another worktree's Vitest pool and timed out; every reported case passed independently and in the complete controlled run.
- Academy passes 75 files / 428 tests. TypeScript, source/library validation, Fallow (zero findings), complexity, `git diff --check`, canonical userscript/Study build, Academy build, VitePress, and userscript verification pass. The readable userscript remains 1,913,406 bytes with 86,594 bytes remaining.
- P0 smoke passes, deterministic QA is 13/13, and docs a11y is 66/66. The exact Academy candidate is `s1-5672f965734c` with 15 allowlisted runtime entries.
- Fable-low final session `b29c8446-9c18-4a8e-b5a2-93095bc02f5f` returned `PASS` with no code blocker. It confirmed Study/placement concealment, 1/1/0 and 0/73 honesty, Peter/Shaun runtime gates, protected access/audio/Stripe boundaries, generated parity, and safe checkpoint commit while the overall Zero-to-N1 goal remains open.

## 2026-07-14 — Yomu 1.6.149 rebase and exact checkpoint rebuild

- Rebasing onto `origin/main` integrated Yomu 1.6.149's Study/offline/Reader work. The only source conflict was the hosted Academy translation seam; all upstream release copy and the Academy label were retained. Canonical Study and Academy were rebuilt from the merged source rather than resolving generated bundles by side.
- Refactored the changed grading, scene, learner-event, grounding, achievement, Lesson 0 validation, route-history, concealment, source-census, and fake-D1 paths into focused handlers. The hard project complexity ceiling passes. Fallow dead-code reports zero; its exact line-scoped `origin/main` audit passes with zero introduced complexity/duplication findings and one inherited Reader clone.
- The definitive controlled `npm run check` passes: Reader regular shards contain 3,583 passing tests and one skip; all eight JPDB shards pass 1,010/1,010; Academy passes 75 files / 428 tests. Focused Study/offline coverage passes 4 files / 406 tests. Source/library validation, TypeScript, canonical userscript/Study/Academy builds, VitePress, and userscript verification pass.
- The exact local artifacts are source `48aec39b3`, hosted assets `6768da9d6`, Academy `s1-49196f5d199d`, and readable userscript 1,921,487 bytes with 78,513 bytes remaining under the 2 MB ceiling. Wrangler 4.110.0 authentication and the production Worker dry-run pass with D1, R2, and origin bindings.
- Inspected the pre-existing failed `main` workflows. The Fallow job was stale against the pre-checkpoint export/config surface; current dead-code is clean. Extension packaging followed a retained `dist/newtab/redirect.html`; `stageNewTabShell` now deletes that hosted-only alias before the compiler runs. Final Fable review, push, workflow proof, Worker deploy, and live smoke remain.
- Repaired two post-rebase deterministic-QA assumptions in the harness without changing Reader behavior: the page-realm runtime snapshot now carries its own text helpers and selects the canonical parsed expression, while compact-idle subtitle controls accept their authored `.55` opacity as visible (hidden remains bounded separately). Full QA passes 13/13; subtitle/settings coverage passes 257/257.
- Ran the real extension compiler against the current tree. Chrome, Firefox, and Safari package validation report zero errors; the hosted-only redirect is absent from staging and all archives; archive integrity and the focused PWA guard pass. The optional extension-boot smoke still defaults to a stale temporary path and remains separate from package validation.
- Resumed Fable-low session `b29c8446-9c18-4a8e-b5a2-93095bc02f5f` against the complete 1.6.149 diff and living evidence. It returned `PASS` with no blocker, independently confirming refactor semantics, answer concealment, cast/runtime gates, 0/73 and 1/1/0 honesty, generated parity, CI fixes, and no secret/private-source leak.
- Recorded Fable's nonblocking behavior notes explicitly: Story presentation maps Class back to the campus host; Lesson 0 requires at least one self-introduction line per dialogue speaker rather than repeating it on every line; and the resource-ledger guard deliberately tightened to the current 1 audited / 1 implemented / 0 playable baseline. Standalone Study URL-hash concealment remains a separate open backlog item.
