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
