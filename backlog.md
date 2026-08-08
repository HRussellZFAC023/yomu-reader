# Yomu Backlog

**Reconciled 2026-07-27 against `origin/main` @ `19088398f` (1.8.18); store-distribution claims
re-verified 2026-08-04 against `origin/main` @ `71f050a1b` (1.8.78).** Everything else on this page is
still only as fresh as the 1.8.18 pass — re-verify before you act on it.

**Store distribution, measured 2026-08-04.** AMO serves **1.8.72** (`addons.mozilla.org/api/v5/addons/addon/yomu-reader/`,
`current_version.version` = 1.8.72, last updated 2026-08-02). The Chrome Web Store serves **1.8.71**
(recorded from the manual publish run; the public listing could not be re-read because
`chromewebstore.google.com` redirects to a Google consent wall). Both stores were published through the
`Release` workflow's `publish_browser_stores` input (`MANUAL_STORE_PUBLISH`), which is why there is no
`v1.9.0` tag. **The "stores are frozen at 1.8.2" claim that used to appear four times on this page was
false** — it survived roughly 70 patch releases past the ruling that created it.

Everything below the "ARCHIVE" divider is the pre-reconciliation document, preserved verbatim.
Everything above it is the honest state of the work.

**Evidence rule for this pass:** nothing is marked SHIPPED without a commit hash or a file path in the
current tree. Where a previous triage recorded something as shipped and the tree says otherwise, it is
marked **STALE** and corrected — several were, and two of those cost real time. Where I did not verify,
it says so.

**Method warning that produced most of the stale entries:** earlier passes greped `apps/yomu-reader`
(a shared tree pinned ~200 versions behind) or a worktree whose `node_modules` was empty. Any triage
run outside a fresh `origin/main` worktree is worthless. This pass ran in one.

---

# PART 1 — REMAINING WORK

## ADDENDUM 2026-07-28 — owner direction from the homepage/docs session

**WAVE 1 IN FLIGHT** (workflow `wfg9y0xmv`, four isolated worktrees, each adversarially verified before
it may land). Do not start these four elsewhere: **A23.1** OCR transform geometry (with the unit tests
that never existed for the four geometry functions) · **A11 + A20** the two confusing-default defects in
`src/reader/settings` · **A24.1 + A9 + A24.5** the incomplete pitch legend, the copy rewrite against the
bible, and honest multilingual framing · **A15** finishing one-nav-everywhere by moving the canonical
list somewhere `src/**` can import and rendering it in the three hosted shells.

**PRIORITY ORDER (owner asked for a ranked backlog, 2026-07-28).** Ties break toward whatever touches a
learner's first ten minutes.

0. **P0 — THE 1.9.0 GATE (owner ruling 2026-07-30):** `D43` full UI localisation **including the explicit
   RTL decision** and `U46` non-Japanese example sources. **`U105` landed 2026-07-30** (target ≠ output ≠
   interface as three persisted axes, with the revision-1 → revision-2 profile migration), and it closed
   the `A37.3` DOM-gating and `A37.4` Burmese leftovers with re-measured evidence. A37's active-profile
   pointer lookup and capability-bound hero shipped in v1.8.38 and are proven. **The owner declined
   cutting 1.9.0 early**. That no longer holds the stores back: `MANUAL_STORE_PUBLISH` publishes a patch
   build to both stores without a minor tag, and both are current (AMO 1.8.72, Chrome 1.8.71, verified
   2026-08-04). 1.9.0 buys the honest multilingual claim and the listing rewrite, **not** a store unfreeze.
0a. **P0 URGENT — money and false claims:** A35.1 no backup/restore for either D1 or R2 (the donation
   ledger is a single unbacked copy) · A35.5 + A35.6 the homepage and docs claim study-target and
   definition coverage the reader does not have · A35.9 extension installs never reach onboarding ·
   A35.2 mined-deck writes fail silently at roughly 4,700 cards · A35.3 the undelivered-code alert can
   email nobody and report success. Full evidence in the A35 section.
0b. **P0 — money (fixed, verify only):** A34 donation banner (Ko-fi donations have NEVER been recorded; also breaks Ko-fi
   Academy delivery, so it reopens part of A22.2).
1. **P0 — in flight now:** A28 homepage reimagining (workflow) · A27.1 verify-only pass on the five
   shipped fixes (codex, next in queue) · T0 historical recovery cases (delivery itself fixed by codex
   in 1.8.24, see U52) · A5 shipped 1.8.25 · R2 dictionary edge cache (shipped 2026-07-28).
2. **P1 — builds the product:** A7/T4 dictionary generation + upload for all 32 targets · A25 + A26
   Study redesign (research + spec landing this session) · A3 docs rewritten as ONE learning narrative
   (owner: DJT / "A Year to Learn Japanese" tone, not a tools catalogue) · A16 follow-through.
3. **P2 — compounding polish:** A29 per-language landing screenshots (after A7) · A1 Bunpro-style IA ·
   A2 dashboard plan execution · A32 store listings refresh · A9 copy pass · A15 one-nav.
4. **P3 — platform:** A31 email · A33 Cloudflare adoption list · A30 Migaku webtoken · A6 SEO query
   research · T6/T7 residuals.
5. **P4 — owner-postponed:** T8 Academy content.

**LANDED 2026-07-29 (verified on main, releases v1.8.26–v1.8.29, zero unreleased commits):**
`A5` sign-in · `A22.2`/`T0` payment-code delivery · R2 dictionary **edge cache** (`cf-cache-status: HIT`,
repeat reads no longer touch R2) · `A16` Study PWA · `A3b` settings reference **live at
`/reference/settings`, 280 keys** · `A18` real product screenshots · `A23.1` OCR transform geometry ·
`A11`/`A20` settings defaults · `A15` one-nav across all four surfaces · `A28` the homepage rebuild ·
`A34` the donation banner (**£15 now counted, goal £10, goalMet true**, banner static with zero nav
overlap) · **`U44`/`U97` language-aware card identity (`eb1271571`)** — the 1.9.0 blocker, landed with a
4-slot key that elides `ja` so existing Japanese keys stay byte-identical and no E2EE migration is needed.

**STILL THE 1.9.0 GATE:** `T4`/`A7` dictionary supply, `U44`/`U97` card identity, and A37's target
picker, raw pointer lookup, honest homepage claim, and `U79` DOM gating are complete. What remains is
classifying/migrating the other `U61` Japanese-only seams, then `D43`/`U46` per the plan in
`scratchpad/ml-tiers-localisation-sources-plan.md` (11 sequenced slices; slices 0 and 1, `U105`, landed
2026-07-30). The stores do **not** wait on 1.9.0: AMO serves 1.8.72 and Chrome 1.8.71 as of 2026-08-04,
both shipped via `MANUAL_STORE_PUBLISH` — see the header and `A27.3`.

- [ ] **A1 — Bunpro-style IA for the signed-in surfaces (owner: "Bunpro is the best reference").**
      Navbar carries learner VERBS with due-count badges (`Review [23]`-style, fed by the local deck),
      a Content dropdown grouping the library, account/search/help as icons, socials demoted to the
      footer. The LOOK stays Yomu's Persona-inspired grammar, not Bunpro's. Applies to the docs nav,
      the Study page, and the hosted shell. Deep plan in flight → A2.
- [ ] **A2 — Study page as a learner dashboard + mobile app plan.** Owner commissioned a dedicated
      deep plan (journeys onboarding→power-user per persona, everything-configurable-with-sane-defaults,
      concept imagery): lands at `/Users/heru/Desktop/yomu-study-mobile-plan/PLAN.md`. Execute from it.
- [ ] **A3 — Docs refresh, continued.** FAQ shipped 2026-07-28 (jpdb/jiten-modelled, non-technical
      first; grow it from real Discord questions). Remaining: every docs page rewritten to the content
      strategy, written for the PLANNED product with in-development features named as such (owner
      2026-07-28: "create the docs with the planned in mind rather than the current"; "less confusing
      from onboarding to power user"). Keyboard-shortcuts FAQ entry once shortcuts have a source doc.
- [ ] **A4 — Homepage theme deepening.** Owner: current theme is "kind of what we want but not quite —
      missing the deeper understanding"; audit remaining "random choices" against the five-rule grammar
      and the recovered design spec. (Arrow clip, device-list copy, manga try-me band, nav renames
      already shipped 2026-07-28.)
- [x] **A5 — Production sign-in probe fixed in 1.8.25 (codex):** protected `/academy/api/account` and
      `/academy/api/session` reads correctly return 401 without a session. The hosted account control
      called both on every signed-out page load and attempted a resume with no cookie. It now uses a
      read-only 200 status probe and preserves an existing paid or invite session through Google sign-in.
- [ ] **A6 — SEO next step is D42 query research, not technical fixes.** The 2026-07-28 Search Console
      email was verified benign: all 21 sitemap URLs 200; noindex only on utility stubs; the 404s are
      the deliberately unpublished internal notes deindexing.
- [x] **A7 — T4 dictionary DATA leg shipped 2026-07-29:** WTY publishes ALL 32 roster languages —
      742 roster pairs / 1,440 live zips. The nominal `wty-{X}-{Y}.zip` + `-ipa` matrix has 512
      missing paths and 468 `-gloss.zip` alternatives. All 1,440 live objects (1,543,153,889 bytes)
      are now content-addressed in R2; 1,607 distinct published objects pass public status, length, and
      SHA-header checks. The published catalogue, honest language readiness, and 32 recommendation
      shelves are live. Matrix + regeneration recipe: memory `yomu-wty-many-to-many-matrix`.
- [ ] **A9 — LESS IS MORE + natural sitewide copy (owner 2026-07-28).** One pass over every surface —
      docs, settings, store listings, in-product strings — cutting anything that is structure-labelling,
      hedging, or enumeration, and rewriting what remains to sound like a person. Rules that already
      bind: short and positively framed, never defensive negations ("stays on your device", not "never
      logged"); no device/SKU lists where a promise belongs; sentence-case authored copy with CSS doing
      the uppercasing. Deliverable is a diff per surface, not a style essay.

- [x] **A11 — CLOSED 2026-07-31, verified end to end including the render path.** The default is
      `furiganaMode: 'all'` (`settings/index.ts:461`) and the code carries the reasoning as an A11 comment:
      "'difficult-kanji' hides readings by a fixed easy-kanji list, so a bare kanji told the learner nothing
      about their own knowledge and the page read as half-annotated. Every parsed word gets its reading until
      someone chooses otherwise."
      Checked the two ways this could still leak, because a default is only as good as the renderer:
      - `furiganaHiddenStateGroups` still defaults to `['known','due','failed']`, which LOOKS like the same
        partial-annotation defect — but `shouldHideFuriganaForCardState` (`dom/index.ts:4159`) returns
        `mode === 'known-status' && …`, so with the default mode nothing is hidden at render time. The control
        is also only shown in that mode (`settings/form.ts:931`).
      - Difficulty hiding, when someone does opt in, explains itself first:
        `renderFuriganaDifficultyNote` exists precisely so the mode "says what a bare kanji means before
        anyone picks it" (`form.ts:934-939`).
      **The principle it established — "a default that requires explanation is not a default" — was applied
      beyond furigana**, which is what the ticket asked for. Two of the three Japanese-only default-ON
      behaviours the multilingual audit found are now target-aware: `preferred-site-language-impl.ts` imports
      `targetLanguageOf` and threads a `targetLanguage`, and the TTS voice filter no longer forces a Japanese
      voice over a correct `utterance.lang`.
      **The third was the YouTube immersion filter, filed as A48 and fixed the same day in 1.8.57**, so all
      three Japanese-only default-ON behaviours are now target-aware. ORIGINAL: Quick setup's partial-furigana default is worse than no quick setup (owner, 2026-07-28,
      verbatim: "currently the 'quick setup' which automatically has furi off for some kanji is more
      confusing that not hainving it at all").** A learner cannot tell whether a bare kanji means
      "you know this" or "Yomu missed it", so the page reads as broken. Default to furigana on
      everything, and make the difficulty-based hiding an explicit opt-in the learner chooses once they
      understand it (`furiganaDifficultKanji` is the setting). Principle this establishes: **a default
      that requires explanation is not a default.** Audit every other "smart" default against it.
- [ ] **A3b — MEASURED 2026-07-28: Yomu has 255 settings** (`DEFAULT_SETTINGS` keys in
      `src/reader/settings/index.ts`). That number decides how A3 and A12 must be done. The owner wants
      *"EVERY feature and setting"* documented with screenshots; 255 hand-written entries with 255 hand-taken
      captures is unmaintainable and would be exactly the "documentation theatre" the GPT critique named.
      Do it in two parts instead: (1) task-shaped pages a learner reads — the golden path and the guides,
      each with real captures of the thing being taught; (2) a **generated settings reference**, built from
      the source so it cannot drift and covers all 255 by construction, with captures only for the surfaces
      that need showing rather than per row. The same inventory feeds A12's simplification: you cannot
      decide which settings deserve the first screen until all 255 are listed in one place.
      Corroborates **A24.1**: a `pitchColorOdaka` setting exists, so the product has a colour for the class
      the fold legend omits.
- [ ] **A12 — Settings: one simple menu, full customisation still reachable.** Owner wants the surface
      simplified without removing power. Approach: a short first screen of the few settings that change
      the experience, everything else behind progressive disclosure, per-surface presets, and search.
      Target from earlier research: ≤60% of rows visible at rest. Must not become a second settings
      dialect — one source of truth for defaults.
- [ ] **A13 — In-product user suggestions + onboarding flows** (owner added to scope 2026-07-28). A way
      for users to send suggestions from inside Yomu (routing to the single support entry point), and
      first-run onboarding flows that carry a learner from install to first kept word without a settings
      detour. Onboarding designs were already generated and judged — see `wxaeknmvm` output.
- [ ] **A14 — Product/service clarity + fresh media.** Owner: make it unambiguous what Yomu's products
      and services actually are (reader, Study, Academy, Gaming, OCR, PDF/video tools — which are live,
      which are in development). Refresh every stale screenshot, and finish the **Remotion clip for Yomu
      Gaming** (branch `gaming-remotion-video-20260727` exists, unmerged). No product page should show a
      capture of a docs page in place of the app — that was the Gaming page's defect.

- [x] **A15 — CLOSED 2026-07-31: one nav definition, verified.** `docs/.vitepress/shared/nav.ts` exists and
      is what both the docs nav and the docs overflow menu build from, so the two hand-synced copies (the
      second of which had already drifted — Stats pointed at the retired `/newtab/`) are gone. The hosted
      shells stamp from the same list, kept honest by the site-nav stamp assertion in
      `tests/reader/docs-published-pages.test.ts`. ORIGINAL: Finish "one navbar everywhere" (half done 2026-07-28).** DONE: the docs nav and the docs
      overflow menu now build from one list, `docs/.vitepress/shared/nav.ts` (they were two hand-synced
      copies; the second had already drifted — Stats pointed at `/newtab/` when the route is `/study/`,
      and FAQ/Guides/Academy/Membership were missing). NOT DONE: the standalone shells. `docs/public/
      study|pdf-reader|video-player` are static artifacts outside the VitePress theme, so they never
      receive it — `pdf-reader`'s `<nav class="docbar">` is a *document toolbar*, not site nav, and
      Study has no nav markup at all. To finish: move the canonical list somewhere `src/**` can import
      (it currently lives under `docs/.vitepress/`), then have each shell render from it. One list,
      three surfaces.
- [x] **A16 — The Study page is ALREADY an installable PWA and nothing says so.** DONE 2026-07-28.
      `public/newtab/manifest.webmanifest` + `sw.js` ship and deploy to `docs/public/study/`; `D37` is
      corrected above. Three of the five suspected defects were real and are fixed: no PNG icon ≥192px
      (now 192, 512, and an inset maskable 512 rasterized from `public/yomu-icon.svg` by
      `scripts/generate-favicons.mjs`), no `screenshots` (now one narrow and one wide, captured from the
      real built app by `scripts/manual/study-pwa-screenshots.mjs`), and `theme_color` disagreeing with
      the HTML meta (both `#181b20` now; per-user accent stamping is deliberately NOT done — a static
      manifest is served to everyone, and `hosted-appearance-boot.ts` documents that standalone surfaces
      keep the page-background colour). Two were REFUTED: the `?mode=word|search|stats` shortcuts
      resolve fine (`NEW_TAB_ROUTE_NAMES` in `src/reader/newtab/controller.ts` still accepts all three,
      and the shipped `docs/public/study/app.js` carries the same set), and install copy already existed
      on `docs/features.md`, `docs/tools/study-page.md`, and as an "Install app" overflow-menu button in
      the client. The real hole was the FAQ's "Does it work on my phone?" answer, which is jpdb's mobile
      question and said nothing about installing; it does now.
- [x] **A17 — RESOLVED 2026-07-28 by the owner: Anki is a PEER, and the sync is BIDIRECTIONAL.** Verbatim: *"ANKI MUST BE BIDIRECTIONAL"* and *"YOU MUST INTEGRATE ANKI ETC INTO THE STUDY"*. So the backlog's position wins (`R11`, Standing decisions, `U107`, `D44`) and the batch-mining brief's *"Anki becomes export, not source of record"* is overruled. This is a reconciliation engine, not an export adapter: Yomu SRS is canonical locally, providers reconcile both ways, and provider decks are first-class inside the study loop rather than beside it. **Study slice work is unblocked.** The batch-mining brief
      says "Anki becomes export, not source of record"; `backlog.md` rejects that in four places (`R11`,
      Standing decisions, `U107`, `D44`) in favour of Yomu SRS as canonical with providers reconciled
      bidirectionally. These specify different systems (export adapters vs a reconciliation engine) and
      the Study/mobile plan followed the backlog. Needs one decision before slice work starts.
- [ ] **A18 — Screenshot refresh must use the REAL products** (owner, 2026-07-28). Capture on actual
      YouTube with the newest Yomu running, not a staged page; same for the video player, PDF reader,
      Study and Gaming. Ties to A14. Note the plan's finding that a "product" page showing a capture of
      a *docs* page is the defect to avoid.
- [x] **A19 — RESOLVED 2026-07-28 by the owner: keep streaks.** Verbatim: *"YES STREAKS ARE NEEDED AND WE ALREADY HAVE THIS CONCEPT ON THE EXISTING STATS PAGE"*. The provenance worry is answered — the concept is already shipped, so this is not copied from Bunpro. The reshaping advice still stands as guidance, not a gate: an effort record beats a punishing chain, given the 678-point community post celebrating losing a 1,480-day streak. They come from the owner's Bunpro
      reference, not from user research; the only streak mention in research is a 678-point community
      post *celebrating losing a 1,480-day streak*. Keep, but reshape the streak into an effort record
      with no punishing chain mechanic. Decide deliberately rather than copying.
- [ ] **A20 — PARTLY STALE, re-measured 2026-07-31. The predicate claim holds; the conclusion does not
      follow.** Confirmed: `src/reader/settings/index.ts` exports exactly two status-source predicates,
      `shouldLookupAnkiStatus` (:1675) and `shouldLookupBunproWordStates` (:1679), and there is no local-SRS
      branch beside them — `grep` for `shouldLookupLocal|localSrs|keyless` in that file returns nothing.
      **But local state does reach rendered words, by another path.** `src/reader/app/main.ts:363` imports
      `repaintYomuLocalSrsRenderedWords` from `srs/local-yomu-state` and calls it at `:952` and `:1481`, and
      the SRS soft-tint shipped in 1.6.264 (memory `yomu-srs-tint-recycler-inflight`). So "a learner with no
      API key sees no status colour" is not established by the predicate count alone.
      **The precise open question, which grepping cannot answer:** the two call sites are reactive
      (`onApiCardStateChanged`, and a card-state change), so a word the learner has graded locally gets
      repainted — but nothing here shows local state colouring words on the FIRST parse of a page. That needs
      a runtime check with a local deck and no credentials, not more reading. Deliberately not "fixed" on a
      guess: changing colour gating without reproducing the gap risks breaking the tint that does work.
      ORIGINAL: Status colour silently absent for keyless learners.** `settings/index.ts:1665-1672` has
      only two status-source predicates and no local-SRS branch, so a learner with no API key sees no
      status colour and no explanation — the same class of defect as A11's furigana default. Verified by
      hand at v1.8.23.
- [x] **A27.3 — CLOSED. The stores are CURRENT, and the "frozen at 1.8.2" reading of this ticket was wrong.**
      Re-verified 2026-08-04: AMO serves **1.8.72** (`addons.mozilla.org/api/v5/addons/addon/yomu-reader/`
      reports `current_version.version` 1.8.72, updated 2026-08-02) and the Chrome Web Store serves **1.8.71**
      (recorded from the manual publish run; the listing itself now sits behind a Google consent redirect and
      could not be re-read). The load-bearing error was the claim that "only a `v*.*.0` tag publishes to the
      stores": `.github/workflows/release.yml:226-229` also publishes when the `publish_browser_stores` input
      is true (`MANUAL_STORE_PUBLISH`), which is how both patch builds shipped. **Do not treat a store user's
      report as a fix-they-do-not-have unless the fix landed after 1.8.71.** 1.9.0 is still worth cutting for
      the honest multilingual claim and the listing rewrite — not to unfreeze anything.
      ORIGINAL (2026-07-28, superseded): Extension-store builds are stale.** Verified 2026-07-28 from the official distribution
      endpoints: Greasy Fork serves 1.8.25 and its executable body matches `dist/yomu.user.js`; the
      Chrome Web Store update endpoint and AMO API both serve 1.8.2. The A27 verification brief said
      the stores served 1.8.15, which is wrong. This is a distribution defect, not five reopened core
      bugs. **OWNER RULING 2026-07-28: no store dispatch for a patch build — keep bumping patches until
      the multilingual rewrite ships as 1.9.0, and the stores update then.** So the multilingual rewrite
      (T4/A7 + the 1.9.0 code work) is the active priority; store users stay on 1.8.2 until it lands,
      which is the cost the owner accepted. BLOCKED BY: A8.

**Study + mobile master plan:** `/Users/heru/Desktop/yomu-study-mobile-plan/PLAN.md` (15 ordered
independently-shippable slices, 5 personas, journey defect register, configurability resolution, CI
gates, 8 open questions) with 7 concept images. Slice 5 deliberately ships the new nav and fold
*without* bands 4–6, because `U39` says every Study complaint is about density — so the extra bands can
be judged or dropped on their own.

### A25 — STUDY DIRECTION, owner 2026-07-28. Supersedes parts of the Study plan.

The owner does not agree with the Study work as currently planned, *"both from a learner perspective and
a UX perspective"*. The diagnosis is not that multimodal study is wrong — it is what makes Yomu unlike
anything else — but that **the UX of it is high effort**. Everything below is direction, not suggestion.

- [ ] **A25.1 — Nothing is permanently off; the learner chooses.** Removing kanji cards *"should be the
      user's choice not permanently off"*. This CORRECTS A21.11, which read as "let people switch kanji
      cards off": the requirement is a real choice per modality, defaulting sensibly, never a silent
      removal. Same for speaking. Some learners want kanji, some do not, *"and it doesn't matter"*.
- [ ] **A25.2 — Typing fills a blank in a JAPANESE sentence.** Not "here is an English word, type the
      Japanese". The prompt is a Japanese sentence with the target word blanked; you type the word. The
      English meaning is available **behind a hint press**, as one step of **progressive hints, like
      Bunpro**. This is a different exercise from what exists and it changes the card model.
- [ ] **A25.3 — Reveal is always visible, never a final step.** Follow the flows already proven for vocab
      in Anki and friends rather than inventing a reveal gate.
- [ ] **A25.4 — One requirement only: an attempt.** *"the only thing that is REQUIRED to see the answer
      is an attempt to type it, like how Bunpro does on its SRS"*. Kanji, speaking and pitch are optional
      passes over the same item. Nothing else may block seeing the answer.
- [ ] **A25.5 — Teach a word before it is reviewed** (Bunpro does this). A first encounter is a lesson,
      not a failed review. Today a new word's first appearance is graded like any other.
- [ ] **A25.6 — Decouple kanji SRS from vocab SRS completely.** We already know every word a learner has
      as known or studying, so kanji scheduling can be derived independently. **This is an architectural
      decision that must be settled before card identity (U44/U97) lands**, because the identity shape
      decides whether two decks can exist at all — and U44/U97 is already the most time-critical item,
      unrunnable server-side once E2EE events exist.
- [ ] **A25.7 — The learner picks the session type, Duolingo-style.** A typical session is kanji *or*
      vocab, chosen up front, rather than one interleaved queue that contains everything.
- [ ] **A25.8 — Speaking, pitch and kanji all live under Yomu SRS, and require an account.** That makes
      **A5** (the live 401 on `/academy/api/{account,session}`) a hard dependency for this entire feature
      set, not just for Academy. Sequence A5 first.
- [ ] **A25.9 — Gamify with per-category strength bars.** Counts of words done per modality so a learner
      sees strengths and weaknesses at a glance, in Stats. Owner's reference point was a star-chart
      shape. Note this must not become a streak mechanic — see A19, still an open owner decision.
- [ ] **A25.10 — Study the reference implementations before designing.** `references/` already holds
      `bunpro-app`, `bunpro-kanji`, `wanikani`, `Jiten`, `migaku-app`, `anki-jpdb.reader`, plus four
      pitch libraries (`PitchDetect`, `pitchfinder`, `pitch-detection`, `onsei`) and `kotu.kez.io`.
      The owner also named **Kanji Study** (the Android app) as an approach they like; it is NOT in
      references, so research it externally. Deliverable is a comparison of review loops — progressive
      hints, input grading, reveal behaviour, teach-before-review, kanji/vocab separation, session
      choice — and what Yomu should take from each.
- **INCOMPLETE INSTRUCTION:** the owner's message ends mid-sentence — *"I think the user should choose
      what kind of"*. Do not guess the ending. Ask before designing anything that depends on it.

### A26 — STUDY DIRECTION, part two (owner 2026-07-28). Providers, mined media, and where things live.

- [ ] **A26.1 — Pick the provider before the session starts, not with a live toggle.** *"A user should be
      able to choose before they start study — ANKI, JPDB, YOMU etc rather than the live toggle."* Pairs
      with A25.7: the session-setup step chooses both the source deck and the session type, so nothing has
      to be switched mid-review.
- [ ] **A26.2 — Anki reconciles both ways, inside the study loop.** Follows from A17. Grades made in Yomu
      land on the provider, and provider state comes back. Today the direction is effectively one-way at
      the point of review. The provider union already exists
      (`src/reader/srs/types.ts`: jpdb | jiten | anki | bunpro | yomu-local | wanikani); what is missing
      is a reconciliation contract rather than more adapters.
- [ ] **A26.3 — Keep the new-tab daily word, kanji-of-the-day style.** Already a shipped concept and the
      owner wants it kept while the rest is simplified. Details were described on Discord; find that
      description before redesigning it.
- [ ] **A26.4 — Keep the chained flow as one of the modes.** *"some users might prefer to do the chained
      study flow as before (kanji…N, EN→JP word recall, TYPE→…)"*. So decoupling (A25.6) must not delete
      chaining: chained becomes a session type a learner can pick, sitting beside single-modality sessions.
- [ ] **A26.5 — Vary the modes without multiplying the options.** The owner's own tension, stated in one
      breath: *"we don't want to overwhelm with different options but it's essential to keep the study
      modes varied"*. Resolve it in the design — a small number of named session presets that each imply a
      set of modalities, rather than a matrix of switches. This is the same problem as A12 (settings) and
      should reuse whatever answer that lands on.
- [ ] **A26.6 — A learner's own mined sentences and audio MUST be studiable.** *"users are able to collect
      their own sentences and audios from mining etc that MUST be included in study as well"*. Mining
      already captures word, sentence, audio and image; the study loop currently does not treat that
      captured material as review content. This is the feature that makes Yomu's own mining worth doing.
- [ ] **A26.7 — Server-side media storage for mined content, ImmersionKit-shaped.** *"the anki or yomu
      servers must be able to store Screenshot/Images and audio of anything that a user mines — much like
      how immersion kit works"*. New infrastructure, with real consequences: it needs an R2 bucket, an
      upload path, per-user quotas, retention, and a deletion story. Ties directly to **A22.1** (the R2
      audit) and the existing `yomu-audio` bucket at 7.08 GB. Cost today is about $0.08/month for 15.42 GB
      total, so per-user media is the first thing here that could actually move the bill — size it before
      building it.
- [ ] **A26.8 — Audio plays on reveal, but only if the puck's audio setting is on.** *"audio should play
      automatically on card reveal (perhaps from the ultimate source is fine though) but it should only
      play automatically if the user has the audio setting on in the yomu puck."* One setting governs both
      surfaces; the review loop must not invent a second audio preference. Note the existing rule that
      auto audio is suppressed during audible playback (memory `yomu-audio-autoplay-video-suppression`) —
      reveal-triggered audio has to respect that too.
- [ ] **A26.9 — Move Stats out of Study and onto the user's profile.** *"THE STATS PAGE… SHOULD BE MOVED
      FROM STUDY TO THE USER'S PROFILE"*. Streaks already live there (`src/reader/newtab/stats-view.ts`),
      and A25.9's per-modality strength bars belong there too, not in the review surface. This also serves
      U39: taking Stats off Study is a direct density cut.
- [ ] **A26.10 — Dictionary and search move too, and stay reachable everywhere.** *"the dictionary /
      search can be moved but also available anywhere."* So it leaves Study as a destination while staying
      available from every surface.
- [ ] **A26.11 — Spotlight-style keyboard shortcut to look up any Japanese word.** *"some keyboard
      shortcut like spotlight search to find any japanese keyword easily."* A global palette that opens
      anywhere and searches the installed dictionaries. This is A26.10's "available anywhere" made
      concrete, and it is the kind of thing that answers the *"yomu is not searchable"* complaint already
      recorded in the research.

### A23 — VERIFIED 2026-07-28: OCR overlay ignores CSS transforms (a bug class)

Measured on the live site by two independent agents, second one adversarially. **CONFIRMED**, with the
numbers reproduced to the pixel:

- The OCR layer is a single `position: fixed` element mounted on `BODY` with `transform: "none"`, sized
  from `getBoundingClientRect()`. For an image under `transform: rotate(-3deg)` that rect is the
  **axis-aligned bounding box**: measured `rect 444.25×609.66` against `offsetWidth/Height 414×589`.
- Lines are then placed linearly inside that inflated box, so a line's painted centre and the reader's
  placement diverge: **~20px displacement on a 30.58px-wide column** for line 1.
- The scale error is **anisotropic — 1.0731 in x against 1.0351 in y** (an earlier report calling it a
  uniform scale was refuted; the aspect ratio itself shifts 0.703 → 0.729).
- The AABB origin offset for `-3deg` on 414×589 is **0px horizontally and 21.67px above** the image's own
  top-left. (A quoted "22px left and 15px above" was refuted; 15.41 is an intermediate term.)
- `ocr-overlay-geometry.ts` contains **zero** transform handling (`grep -Ec 'transform|rotate|matrix|DOMMatrix'` → 0),
  and **no test covers** `paintedImageFrame`, `imageContentBox`, `fittedObjectSize` or `objectPositionOffset`.
- [x] **A23.1 — SHIPPED (`c97c9fa62`/`d9698f195`): −3° error 15.62px → 2.24px, 90° 283.98px → 2.23px, 0° byte-identical, 11/11 hit-tests unambiguous. — Fix it generically.** Write the four missing geometry tests as step one, then fix: read the image's computed transform, size the layer from the untransformed box, and apply the same matrix and transform-origin to the layer. (Earlier marked BLOCKED BY the missing coverage. That was wrong — absent tests are the first task, not a blocker. Corrected 2026-07-28 on the owner's instruction: *"just write the tests if needed"*.): read the image's computed transform, size the layer from the
      untransformed box, and apply the same matrix and `transform-origin` to the layer. Not a per-site
      patch — this serves BookWalker, MangaFire and YouTube paused frames, so it needs the missing unit
      tests first plus the `scripts/ocr-line-register-smoke.mjs` real-engine guard.
- [ ] **A23.2 — Check consumers of `.jpdb-ocr-line` rects.** Flagged UNVERIFIED: anything positioning UI
      from a line's `getBoundingClientRect()` would start receiving AABBs once the layer is rotated. The
      popup module was not located; settle it before landing A23.1.
- **Correction to carry:** the screenshot that prompted this is **not** evidence.
  `.jpdb-ocr-line { color: transparent }` (`reader-words-ocr.css:1604`), so the overlay is invisible at
  rest; the glyphs visible in that image are baked into `docs/public/media/manga-ocr-sample.png`. The
  misalignment is real and measured, but that picture does not show it.

### A24 — Homepage critique from GPT-5.6-Sol at `ultra` reasoning (verified it really ran)

Provenance checked: `gpt-5.6-sol`, `model_reasoning_effort=ultra`, 23,419-byte critique. (A claim that
the CLI exposes only one model was refuted — 8 are listed, and `gpt-5.6-terra` also supports `ultra`.)

- [x] **A24.1 — CLOSED 2026-07-31: the incomplete pitch legend is gone from the homepage.** The fold no
      longer carries it at all — `grep` for 平板/頭高/中高/Heiban/Atamadaka/Nakadaka in `docs/index.md` returns
      nothing — so the mismatch it described (three patterns listed against four shipped pitch classes) cannot
      mislead anyone. The prose sentence that replaced it was then removed too, at the owner's instruction
      ("remove this text completely — you dont need to explain everything"), along with its CSS rule and its
      Japanese translation. Nothing on the page explains the underline colours now, by choice. ORIGINAL: The pitch legend is not just useless standing alone, it is incomplete.** The fold lists
      three patterns (`docs/index.md:48-52`) but the reader ships **four** pitch classes
      (`src/reader/lookup/pitch-accent.ts:6` — atamadaka/odaka/heiban/nakadaka, validated again at
      `controller.ts:3823`) and **five visible pitch states**. Either explain the colours through the
      feature that uses them, or delete the standalone legend. Do not ship a key that omits a colour the
      page can paint.
- [x] **A24.2 — CLOSED 2026-07-31: the numbered install chips are deleted, and their destinations kept.**
      "1 Install / 2 Read" labelled a sequence stated twice already — by the lead sentence directly above them
      ("Install Yomu, open something you wanted to read anyway, and press a word") and by the buttons directly
      below ("Add よむ to Chrome"). Three statements of one idea, which is the "LESS IS MORE" complaint exactly.
      The two `/learn/week-one` anchors were worth keeping, so they are now the sentence's own words rather
      than separate chips. Removed 147 lines of orphaned CSS with them — 14 whole rule blocks whose every
      selector referenced the deleted markup, plus one selector pruned from a shared touch-target rule that
      still styles live elements.
      **Caught in review before landing:** the inlined links inherited the paragraph's colour AND weight, so
      they measured identical to the surrounding text — an invisible link is worse than the chips it replaced,
      because the destination is simply gone. Given the underline affordance the rest of the band already
      uses. ORIGINAL: "1 Install / 2 Read" adds no information.** GPT's phrase for the install band's numbered
      chips; they label a sequence that the button already implies.
- [ ] **A24.3 — "Documentation theatre".** GPT's charge against docs that describe rather than teach —
      the same defect the owner reports as word salad. Feeds A3.
- [ ] **A24.4 — Funding framing.** GPT proposed "Fund the work, not access" and an amber navbar button.
      Weigh against the owner's ruling that membership DOES include Academy access; the honest line is
      about what it pays for, not what it withholds.
- [ ] **A24.5 — Multilingual framing is architecturally constrained today.** `docs/multilingual/Decisions.md:7`
      (MLT-001) freezes **32 learner languages with Japanese as the fixed target**. So the homepage's
      Japanese-centred proof is accurate for now: any multilingual claim must describe definition-language
      coverage, not study-target parity, until the target seam opens (T4/A7).

### A27 — CHANGELOG CROSS-CHECK 2026-07-28: five A21 reports already have shipped fixes

The owner's point, and it holds: *"a lot of the things in the backlog might have already been solved you
can check the changelog"*. The CHANGELOG carries **940 releases across 7,865 lines**, and matching the
Discord reports against it turns most of A21 from fix work into **verify-only** work. Every match below is
a real entry, quoted from the file.

| Ticket | Shipped in | The entry |
|---|---|---|
| **A21.1** subtitles toggle not saving | **1.8.22** | *"Turning off Show native subtitles now stays off across reloads… that reveal also wrote the setting back on"* |
| **A21.5** MangaFire lookup / Yomitan clash | **1.8.20** | *"Tapping text that Yomu recognized on image-based manga readers such as MangaFire now opens Yomu's own lookup sheet instead of a dark card from another dictionary extension"* |
| **A21.7** bottom-of-screen OCR box shifted up | **1.8.23** | *"Text Yomu reads from a paused YouTube video now sits on the words it was read from, including the subtitles along the bottom of the picture"* |
| **A21.4** subtitle size will not hold | **1.8.17** | *"The subtitle font-size slider is now literal: choosing 60px keeps every cue at 60px through long lines, furigana arriving, player zoom and crop changes, fullscreen, narrow portrait video"* |
| **A21.13** choose which audio source answers | **1.8.6** | *"The providers bundled inside an audio source URL are now listed on their own, with no button to press"* |

**What this means for the reporter.** The reports came before the matching fixes, despite sharing their
calendar dates. A21.4 was reported at 07:42–07:51 and fixed at 09:40 on 27/07; A21.5 was reported at
09:18–10:16 and fixed at 17:15 that day. A21.1 was reported at 03:58 and fixed at 10:26 on 28/07;
A21.7 was reported at 00:12 and fixed at 10:58. These were the reports that prompted the fixes, not
post-release regressions.

- [ ] **A27.1 — PARTIAL verify-only pass on all five.** The current Greasy Fork 1.8.25 body matches the
      checked build. The focused suites and real-engine smokes pass, and the previous release has real
      MangaFire/Yomitan proof, so the five stale core reports are closed below. A fresh owner-profile
      pass could not run because both browser transports reported no available browser or timed out.
      Repeat the visible YouTube, MangaFire and Study clicks when that profile reconnects. Store builds
      are a separate open defect under A27.3.
- [ ] **A27.2 — Do the same sweep across the whole backlog before starting any T ticket.** Two entries
      already turned out stale this session (`D37`'s missing PWA, which ships; `A21.11`'s framing), and
      A20 and A11 both have partial changelog history (`1.6.247` covers the homepage's keyless status
      colours; `1.6.36` covers documenting quick setup, not its default). Treat a backlog claim as a
      hypothesis with a changelog to check, never as a finding.
- **Method:** `grep -in "<distinctive phrase>" CHANGELOG.md`, then read the release heading above the hit.
  Match on the user-visible symptom, not on a filename, because entries are written for learners.

### A28 — SHIPPED 2026-07-29 (`8ee1ef4ed`). Homepage reimagined to the owner's full spec. Supersedes what

**Verified live:** all five owner-rejected strings gone, **zero figcaptions**, the hero cycles the study
targets with a static Japanese fallback for reduced-motion and no-JS, "Apps" replaces the rejected "Tools"
category across VitePress + Study + PDF Reader + Video Player, both `/pdf-reader/` routes return 200, and
the no-install claim ships as *"Study, the video player, the PDF reader and the live OCR panel all run here
with nothing installed."* The live try-me paragraph and the single live OCR manga panel are untouched. The
original spec follows for provenance.

remains open of A24 and A4. IN FLIGHT this session as a workflow.

The owner dictated the page: hero **"A complete system for learning ⟨language⟩"** with the language word
cycling Apple-welcome style through every study target; **"Try me →"** with a complete arrow (current tip
is clipped); install row unchanged. Then, in order: a founder paragraph in the owner's own voice (studied
how to study, built the tool they wished existed); **comprehensible input** explained plainly; Immersion
Kit-style examples; a factual **"Better than Migaku"** section (faster start, no feature-forcing, free at
your own pace, mobile out of the box via userscript + app coming soon, ACTIVE recall not passive,
unopinionated — any dictionaries/audio, RTK-style kanji or vocab-only, words and decks from the textbooks
and shows you choose, batteries included, native video player that toggles cleanly, ~no other
mobile-first option) and **"Better than Duolingo"** (you choose the words and pace, real-world sentences
not repetitive multichoice); **bring your own words** — continue alongside Anki, jpdb, jiten, Bunpro,
Migaku (coming soon → A30) — or use Yomu's platform (Anki's algorithms, plus context, grammar,
pronunciation, handwriting); daily reviews + streaks; the recommended approach (core ~2k words ≈ 80% of
running text, then **tadoku** — explained: what, why, who — but returning to unknown words later instead
of skipping forever; "learn just like you did growing up"); a warm Discord CTA ("don't be shy"). Keep the
pages/video/keep demo bands but rewrite headings, DELETE the figcaptions, link each band to Study/Watch/
Read respectively; add a **Gaming** band and **"The Academy awaits"** band that explain the concepts; say
plainly that the hosted tools (Study, video player, PDF reader, OCR) work **without installing anything**.
Owner dislikes, verbatim, to be removed: "Any page becomes a Japanese lesson." · "Press a word for its
reading, meaning, sound — and keep it." · "Read the Japanese web at full speed." · "The same reading, in
your hand." · the pointless "Colours are pitch accent" header · the "tools" nav category name. The real
"diamonds" (why Yomu, from Discord + feature set) must be explicit. `/pdf-reader/` was reported 404;
measured 200 on 2026-07-28 22:10 — put `/pdf-reader/` AND `/pdf-reader/index.html` in the published-pages
audit so a regression is caught, and re-check after the next deploy.

- [ ] **A29 — Per-language landing variants + real screenshots for every study target.** BLOCKED BY: A7.
      Each study language gets its landing variant and screenshots taken through the live reader running
      that language's dictionaries — never fabricated annotations (standing rule: no fake key colours).
      Automate the capture matrix (Cloudflare Browser Rendering is the candidate rig → A33). The hero
      language fade ships before this with copy only; this ticket makes the demos real per language.
- [ ] **A30 — Migaku webtoken provider (owner 2026-07-28: "migaku (coming soon, add migaku webtoken
      support to backlog)").** Add `migaku` to the provider union: authenticate with the learner's Migaku
      web session token, read known/learning state, write mined words back — same continue-alongside
      contract as anki/jpdb/jiten/bunpro. Teardown artifact: `references/migaku`. Homepage says "coming
      soon" from A28 day one.
- [ ] **A31 — Email (owner 2026-07-28: "We might want emails in the future as well").** Inbound first:
      Cloudflare Email Routing on yomureader.com → support@ forwards to the owner, with a Worker triage
      hook. Outbound: Cloudflare Email Service for transactional sends — account recovery and membership
      access codes (pairs with the A5-adjacent "deliver paid access codes" fix codex just committed);
      opt-in streak reminders later, never marketing by default. Needs SPF/DKIM/DMARC on the zone.
- [ ] **A32 — Extension store listings: copy + screenshots (owner 2026-07-28: "make sure tasks such as
      updating the copy and screenshots on the extensions store is documented as well").** Chrome Web
      Store, AMO, Greasyfork: rewrite every listing to the bible + the A28 pitch, upload the refreshed
      real-product screenshots (wave-2 rig). Listing copy and images publish WITHOUT a release; only
      binaries need the minor-tag store pipeline. Assign codex computer-use on the owner's signed-in
      profiles. Extends B4.
- [ ] **A33 — Cloudflare platform adoption (owner 2026-07-28: product-by-product shopping list, concepts
      included).** Shipped already: Workers, R2, D1, custom domains, observability logs/traces, and (2026-07-28)
      the dictionary Worker now populating the **edge cache** so repeat zip/catalog reads stop paying R2.
      Adopt next, each with its consumer: **Web Analytics** (free, cookieless — retention/funnel on
      yomureader.com, fits "stays on your device" voice) · **Email Routing + Email Service** (A31) ·
      **Turnstile** (academy sign-up, CAPTCHA-free bot check) · **Browser Rendering** (A29 screenshot
      matrix + docs screenshot automation) · **Workers AI Whisper** (speaking-practice grading in the
      Study redesign, A25) · **Vectorize** (semantic example-sentence search over mined corpus) ·
      **Queues + Cron Triggers** (dictionary mirror pipeline: acquire → verify → upload, resumable) ·
      **Tiered Cache + Cache Reserve** (dictionary zips: one origin read per object, ever) · **Rate
      Limiting on `/academy/api/*`** (the 401 spam class) · **Cloudflare Access** (any future admin
      surface). Deliberately NOT adopting, with reasons: Stream (demo videos are fine as static R2/docs
      assets), Pages migration (GitHub Pages + Deploy Docs is entrenched and works), Durable Objects
      (D1 sessions suffice at current scale), Zaraz/Argo (no third-party tags; no measured routing pain).

### A34 — DONATION BANNER: real money dropped, and it covers the nav (owner report + screenshot 2026-07-29)

Owner: *"we recieved £10 from kofi and £5 from patreon only the £5 is showing"*, *"the stickness broke
(should not be sticky) and its overlapping the nav"*, *"always round to nearest dont say £10.20"*,
*"we also dont want to harcode gbp"*. Live `/status` confirmed: `donationsThisMonthGbp: 5` of £15 received,
`donationGoalGbp: 10.2`, `goalMet: false` when it is actually met. Full diagnosis with file:line in
`scratchpad/donation-banner-ticket.md`. ASSIGNED to codex 2026-07-29.

- [ ] **A34.1 — Ko-fi's transaction field is read under the wrong name, so EVERY Ko-fi donation 422s.**
      `kofiAcademyEnvelope` (`workers/yomu-support/src/index.ts:1055`) reads `record.transaction_id`; Ko-fi
      sends **`kofi_transaction_id`**. The envelope is therefore always null and the handler returns 422
      *before* `recordProviderDonationEvent`. Consequence beyond the goal: **Ko-fi Academy codes have never
      been deliverable**, so A22.2's "delivery fixed" claim needs re-checking on this path.
- [ ] **A34.2 — BUG CLASS: donation accounting is gated on Academy entitlement.** Ko-fi (`:897`) and Patreon
      (`:955`) both refuse to record money unless an entitlement envelope builds. Money that arrived is a
      fact; whether it earns Academy access is a separate question. Record first from an id that needs no
      identity fields, then attempt entitlement; a failed entitlement must never unrecord money.
- [ ] **A34.3 — non-GBP donations silently become zero, and GBP is hardcoded.** `gbpMinorFromProviderAmount`
      (`:1239`) returns 0 for any currency that is not GBP; `BASE_CURRENCY` is a constant (`:52`), the INSERT
      hardcodes `'gbp'` (`:1310`) and both read queries filter `currency = 'gbp'` (`:380`). Store the payer's
      real currency and amount plus a converted base amount in new columns, reporting currency from config,
      converted through the existing cached `fxRateFor` (`:574`) — inverse of the display direction. No rate
      available means record it with a flag, never drop it.
- [ ] **A34.4 — round to the nearest whole unit for display.** `buildGoal` (`:301`) yields `10.2`. Presentation
      rounds, stored minor units stay exact; round the goal up so it can never read as met while the forecast
      is uncovered. Touches `supportBannerCopy` (`:451`, both languages),
      `src/reader/newtab/i18n.ts:37`, `docs/.vitepress/theme/index.ts:4984`.
- [ ] **A34.5 — the banner must not be sticky.** `docs/.vitepress/theme/custom.css:110` has
      `position: sticky; top: 64px; z-index: 39`, hardcoding the desktop nav height so it covers the nav at
      any other height. Static, in normal flow, verified at 1280/768/375. Check the newtab copy at
      `src/reader/styles/new-tab.css:195` and the hosted shells too.
- [ ] **A34.6 — backfill the rejected £10.** Ko-fi does not resend a 422'd webhook, so the money stays
      invisible until a row is inserted. Audit for other rejected donations at the same time. `wrangler d1`
      defaults to LOCAL — `--remote` or it is a no-op.

### A40 — the gaming settings-tab test flakes inside the sharded suite, and it gates the minor tag

Raised by the D43 review 2026-07-30 and reproduced here. `tests/reader/gaming-first-run.test.ts` >
"keeps the settings tab you were on when a snapshot restore re-renders" **passes alone and passes as a whole
file**, but fails intermittently inside the sharded CI suite — observed failing in one `check:release` run
and passing in the runs either side, on this commit and on its parent. It is not D43's bug.

Why this outranks a normal flake: **a store publish rides the `Release` workflow** — either a `v*.*.0` tag or
the `publish_browser_stores` input — so an intermittent red stands between accumulated fixes and every store
user. A release that fails one run in four is a release nobody can schedule. (Written when the stores were
believed frozen at 1.8.2; they are not — AMO 1.8.72, Chrome 1.8.71 as of 2026-08-04.)

- [x] **A40.1 — FIXED by the mechanism the repo already has for this.** `scripts/run-ci-tests.mjs` keeps an
      `ISOLATED_PASS_FILES` list whose own comment describes exactly this signature: files that "pass alone
      but inherit state in the fork-reuse pass". `gaming-first-run.test.ts` is now on it. That is the right
      answer rather than bisecting for the neighbour, because the fragility is on OUR side: the file imports
      the gaming renderer once in `beforeAll` and shares one app instance, one `#app` element and one
      localStorage across eleven tests, so any document state a neighbour leaves is inherited. Twenty-eight
      files were already isolated for the same reason. Superseded finding below, kept for provenance:
      **find the polluting file, not the symptom.** Measured: only this test file and
      `src/gaming/renderer/app.ts` touch `yomu-gaming-settings-snapshot-v1`, so the snapshot key is not the
      channel; running `settings-cross-site-persistence` immediately before it does not reproduce. The file
      imports the renderer ONCE in `beforeAll` and shares one app instance and one localStorage across all
      eleven tests, which makes it unusually sensitive to anything a neighbour leaves behind — a fake timer,
      a stubbed global, a pending microtask. Bisect the shard rather than guess.
- [x] **A40.2 — the intra-file half is closed.** `afterEach` now removes the snapshot key, so a backup test
      can no longer change what a later restore observes. Defensible on its own, but a green run here is NOT
      evidence the sharded failure is gone and must not be recorded as such.
- [x] **A40.3 — CLOSED 2026-07-31, NOT REPRODUCIBLE: both named files now pass standalone.** Measured on
      current main: `tests/reader/youtube-filter.test.ts` 71/71 passing alone (the ticket recorded 8 failures
      standalone on unmodified origin/main), and `tests/reader/jpdb/05-audio-sources-tts-suppression.test.ts`
      53/53 passing alone. So the "only passes inside the shard" shape does not hold for either, and adding
      them to `ISOLATED_PASS_FILES` would have been the wrong fix anyway — a file that fails ALONE and
      passes in a shard needs to be made self-contained, not isolated, which is the opposite operation.
      The remaining flake in this family was a different mechanism entirely and is closed as A45. ORIGINAL: — the general problem.** Two files already carry this shape:
      `tests/reader/youtube-filter.test.ts` fails 8 tests standalone on unmodified `origin/main` and only
      passes inside the shard, and `tests/reader/jpdb/05-audio-sources-tts-suppression.test.ts` shares module
      state across 53 cases (it hid a real persistence question — see `A38`). Per-file isolation in the runner
      would retire all three at once; decide whether that costs less than chasing each.

### A41 — CLOSED 2026-07-31: all four hotlink findings resolved, verified against the shipped config

Measured on `config/multilingual/lookup-links.json` (32 targets) rather than taken from a wave report:

- **YouGlish's 20 unverifiable links — resolved by removal.** `youglish` appears **zero** times in the
  config. It could not be reproducibly verified, and the earlier "verified" sweep turned out to have been
  measuring its own rate limiting, so shipping nothing beats shipping a link nobody checked.
- **10 of 11 Linguee links unverified — resolved by shipping it OFF.** The shared entry now carries
  `"enabled": false`, so it is present on its 12 targets but never enabled without an explicit choice, and
  `tests/reader/settings-form/11-target-lookup-hotlinks.test.ts:214-218` pins the Danish template and asserts
  German does not get one. Honest: nobody lands on an unverified link by default.
- **ar / km / lo / th had no native dictionary — all four now do.** `ar: maajim`, `km: khmerdict`,
  `lo: laoswords`, `th: longdo`. This was the item created by an invalidated delta-0 criterion, where Glosbe
  had been dropped for Lao over a word-specific 404 while Thai kept the same link with the same failure.
- **vi/tratu-soha is plaintext HTTP — now disclosed.** `plaintextHttpLink: 'Opens over plaintext HTTP.'`
  (`app/i18n.ts:635`) with its Japanese, surfaced through `[data-lookup-link-transport]` in
  `settings/form.ts:2157`. Vietnamese also gained `vdict` and `vtudien` alongside it. Copy states what
  happens rather than listing what does not, per the owner's rule.

ORIGINAL FINDINGS

From the adversarial verification of the per-language hotlinks (full report in `scratchpad/u46-5-research.md`).
None of these stop a patch release; all of them are things a later pass would otherwise rediscover.

- [x] **A41.1 — VERIFIED 2026-07-30 in Chrome.** The live catalogue had 20 YouGlish routes and 13 Linguee
      routes, correcting the stale 11-link count here. Every YouGlish route opened a bot-detection or
      quota page, so the shared link was removed. Twelve Linguee routes showed the queried word and the
      German route showed a request block, so German was removed. The repeatable words and observed page
      content are recorded in `docs/dev/u46-hotlink-verification-2026-07-30.md`.
- [x] **A41.2 — Arabic, Khmer, Lao and Thai now have browser-verified native dictionaries.** The criterion that
      rejected their candidates was a delta-0 body comparison that the verifier later invalidated (an SPA
      returns an identical shell for real and nonsense queries, so delta-0 proves nothing either way).
      Chrome showed definitions for Maajim, Khmer Dictionary, Lao Dictionary and Longdo, including the
      same diacritic-bearing words now used by the path-template regression test.
- [x] **A41.3 — Settings marks `vi/tratu-soha` as plaintext HTTP.** The link remains available, and its
      English and Japanese settings copy describes how it opens.

### A39 — OWNER DECISION: the visual bible and the anti-slop evidence disagree about the typeface

Raised 2026-07-30 while rebuilding the homepage. The owner's complaint included *"I dont like the signature
ai copy and styling search the web how to avoid that"*, so the research was done properly (sources in
`scratchpad/hp-slop.md`). Its **number one visual tell** is a typeface nobody chose: an unpaired
`system-ui` / Inter stack at default weights, which reads as never having been styled.

`docs/.vitepress/theme/custom.css:12` ships exactly that:
`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

But `docs/academy/VISUAL-SYSTEM.md:13` specifies **"Type: system/Yomu sans plus the Japanese font stack"**.
So the page is FOLLOWING the owner's own visual system, and the only way to remove this tell is to change
that document. That is a brand decision, not an implementation one, which is why it is filed rather than
done.

- [x] **A39.1 — CLOSED 2026-07-31: the sans stays, and the reason is now in VISUAL-SYSTEM.md so the next anti-slop audit cannot reopen it. Evidence is a session where the owner reviewed four homepage treatments and named colours, spacing, layout and copy as the faults — never typography — and rejected three serif display proposals as "making it worse". The accepted cost (system-ui is SF Pro on macOS, Segoe UI on Windows, so the headline is not glyph-identical cross-platform) and the remedy if ever revisited (one self-hosted subset face for headings only, never a CDN) are both recorded there. ORIGINAL: pick a display face, or confirm system sans is deliberate.** If a face is chosen: ship it
      self-hosted from `docs/public/fonts` (no CDN — the artifact CSP blocks external hosts and a silent
      fallback would be worse than the system stack), subset it, and pair one display face for headings with
      the existing stack for body. Then update VISUAL-SYSTEM.md so the two documents agree. If system sans
      stays, record WHY in VISUAL-SYSTEM.md so the next anti-slop audit does not reopen it. Note the
      Japanese stack is separate and already deliberate (`--ja-font`), so only the Latin face is in question.
- [x] **A39.2 — CLOSED 2026-07-31: accepted as the house pattern, recorded in VISUAL-SYSTEM.md. `.yomu-fits-list` uses bold run-in labels across the homepage, so a list without them reads as foreign; consistency with the page's own grammar beats the generic heuristic. ORIGINAL: three bullets still lead with bold run-in labels**, which the same research lists as a
      template tell. Cheap to rewrite as plain sentences; left alone because it is copy the owner may have a
      view on after seeing the shorter page.

### A38 — saveSettings has a silent skip, and the puck's furigana fields may not survive a reload

Found 2026-07-30 while adding a store-level assertion to the puck power-cycle test. Probed the actual
stored bytes after a full cycle (hide furigana, pause, resume) and the store held
`furiganaMode: "off"` with `puckFuriganaModeBeforeHide: "all"` — the state from an **earlier** save in the
same run — while the in-memory object correctly held `furiganaMode: "all"` and an empty marker. So later
writes went nowhere, and every existing assertion passed because they all read the instance's own object.

- [x] **A38.1 — `saveSettings` can skip a write and tell nobody.** Fixed for 1.8.47. `src/reader/settings/index.ts:2101` was
      `if (settingsResetInProgress) { log.warn('Skipped save during reset'); return; }`. A `log.warn` is not
      a signal a caller can act on: the function resolves successfully, so the UI confirms a setting that
      was never written. This is the same class the A35.2/A35.3 work just fixed elsewhere (a swallowed write
      reported as success), and it was the one remaining instance. `saveSettings` now rejects with a typed,
      message-less error during the reset guard, so UI callers use the localized save-failure message and no
      caller can mistake a skipped write for a commit. A focused guard test proves the old stored object is
      unchanged and the promise rejects.
- [x] **A38.2 — VERIFY whether the puck's resume really persists its furigana fields in a real browser.**
      The unit harness could not separate the silent skip above from the module state that
      `tests/reader/jpdb/05-audio-sources-tts-suppression.test.ts` shares across its 53 cases, so this is
      unproven either way. It **did reproduce** in the freshly built browser artifact: after hide → pause →
      resume, the puck looked on in memory but the store still held `furiganaMode: "off"` and
      `puckFuriganaModeBeforeHide: "all"`. The explicit-choice layer added after the earlier resume fix was
      overlaying those earlier hide values because resume declared only `annotationsPaused` as changed.
      Resume now restores those fields through the existing explicit furigana-save path before it commits
      the annotation switch, and the puck waits for that asynchronous cycle before repainting. The browser
      smoke reloads after hide, pause, resume, and a normal popup-mode dropdown; the four readbacks are
      `off/auto`, `off/off`, `all/auto`, and `all/auto + popupMode: sheet`, with no browser errors.
- [ ] **A38.3 — that test file shares module state across 53 cases.** It is why a store-level assertion
      cannot be trusted there, and it is the same fragility class as `youtube-filter.test.ts`, which fails 8
      tests standalone on `origin/main` and only passes inside the sharded suite. Both need per-case
      isolation before store-level assertions mean anything.

### A37 — THE REAL 1.9.0 GATE: you can pick 34 study languages and look up words in exactly one

Measured on `origin/main` at `c14b947a9` (1.8.37) on 2026-07-30, after the dictionary and picker work
landed. Three of the four multilingual pieces are genuinely done; the fourth was never started, and the
homepage now advertises the gap 34 times instead of 9.

**Done and verified:**
- **T4 dictionary supply.** `config/dictionaries/published/v1/catalog.json` went from **221 entries across
  10 headword languages to 1,637 across 34**. Every roster language has entries except **`my`
  (Burmese), which still has zero**.
- **U44/U97 language-aware card identity** (`eb1271571`): a 4-slot key that elides `ja`, so existing
  Japanese keys stay byte-identical and no E2EE migration is needed.
- **U61 the target picker**: `src/reader/settings/form.ts:162` now renders a real
  `<select name="targetLanguage">` over `LEARNING_TARGET_ROSTER`, replacing the hidden input.

**Fixed in v1.8.38:**

- [x] **A37.1 — FIXED: the pointer lookup was hardcoded to Japanese script, so every non-Japanese target
      was a dead end.** At `c14b947a9`, `src/reader/lookup/pointer-text-lookup.ts:4` built
      `JAPANESE_RUN_RE` from kana, kanji-like ranges and the prolonged sound mark, and gated **six**
      decisions on it (`:231`, `:259`, `:349`, `:375`, `:379`). A learner who picks Spanish, Korean, Arabic
      or Greek in the new picker, on a page in that language, presses a word and **nothing opens** — the
      lookup returns null before any dictionary is consulted. The dictionaries for those languages now
      exist, and the picker now sets the target, so this single regex is what stands between the product and
      the claim it makes.
      The machinery to fix it is already in the tree and unused by this path:
      `src/reader/languages/icu-segmentation.ts`, `korean.ts`, `japanese.ts`, `morphology.ts` and
      `roster-targets.ts`, with `Intl.Segmenter` already wired in `languages/module.ts`. So the fix is to
      ask the ACTIVE language profile whether a character belongs to a word in its script, instead of
      testing Japanese. Do it as a language-profile capability, never a per-language branch in the lookup.
      Test: for each of ja, ko, es, ar, el, pressing a word on a page in that language opens the popover;
      and Japanese behaviour is byte-identical to today, which is the non-negotiable.
      Contract revision 5 now owns `pointerWordSegments`: generic targets use their existing ICU word
      segmentation and Japanese owns the old character class verbatim, so shared lookup contains no
      per-language branch. Boundary-aware targets look up only the pressed segment rather than sweeping
      false substrings inside a written word. Browser evidence presses raw, unannotated headings on real
      Japanese, Korean, Spanish, Arabic, and Greek Wikipedia pages; all five open a popover. The Japanese
      boundary/caret output is also compared byte-for-byte with the old algorithm across every offset in
      the regression corpus.
- [x] **A37.2 — FIXED: the homepage hero named ~34 study targets while only Japanese lookup worked.**
      Before v1.8.38 the rotator cycled 日本語, Shqip, Ἑλληνιστί, العربية, 粵語, 中文（简体）, Dansk,
      Nederlands, English, Suomi, Français, Deutsch, Ελληνικά, Magyar, Bahasa Indonesia, Italiano and more.
      A35.5 asked for the hero to be driven by what the product supports; it is now driven by the
      dictionary roster, which is the wrong axis while lookups are Japanese-only. Either land A37.1 first,
      or drive the rotator from languages whose lookup path actually resolves. The audit guard A35.5 asked
      for must assert against the LOOKUP capability, not the catalogue.
      `heroStudyLanguages()` now reads the `term-lookup` capability, and the published-pages audit asserts
      exact equality between that capability roster and the homepage rotator.
- [x] **A37.3 — FIXED: U79 DOM gating now follows the active target.** At `c14b947a9`,
      `data-language` appeared **zero** times in `src/reader/app/main.ts`. For a target with no reading annotation the furigana controls, the
      `furiganaMode` row, pitch colouring, the pitch legend and the provider pills must be ABSENT from the
      DOM rather than greyed out, and must return when the target is Japanese again.
      Reader-owned roots now carry `data-language`; the shared language-family mechanism physically
      detaches unsupported nodes, discovers dynamically inserted nodes, and restores the same nodes for
      Japanese.
      **CLOSED 2026-07-30, re-measured on the real settings form** (`syncLanguageFamilyDom` over
      `renderSettingsTestForm(DEFAULT_SETTINGS)`, four targets in sequence):
      `[ja] jp-only-nodes=11 furiganaMode=PRESENT reading-annotation=PRESENT pitch-colouring=PRESENT pitch-legend=PRESENT provider-pills=PRESENT`
      · `[ko]`/`[es]`/`[ar]` each `jp-only-nodes=0` with all five **ABSENT**
      · back to `[ja]`, `jp-only-nodes=11` and all five PRESENT again, the *same* node objects
      (`10-target-language-gating.test.ts` compares node identity, not just presence).
      Also newly pinned: `language-tiers.test.ts` asserts, for **every registered target module**, that
      `jp-only` membership equals that module's `reading-annotation` capability. The gating was a
      hardcoded language list; it is now a list that fails CI the moment it disagrees with the
      capability it is supposed to represent, so a future target that gains readings cannot silently
      render no furigana controls.
- [x] **A37.4 — FIXED: Burmese (`my`) has zero dictionary entries but is not a picker target.**
      A picker entry that resolves to nothing is the A11 defect class (a state the learner cannot tell
      from broken), so it must be sourced or absent from the roster.
      Burmese is not in `LEARNING_TARGET_ROSTER`, and the published-pages audit now fails if any
      lookup-capable picker target has zero published dictionary supply.
      **CLOSED 2026-07-30 — taken off the roster, not sourced, and it was never on it.** Re-measured:
      `my` appears in **zero** of `config/multilingual/languages.json` (32 ids), `LEARNER_LANGUAGE_IDS`,
      `LEARNING_TARGET_ROSTER` (33), the 34 catalogue headword languages, and the 34 catalogue definition
      languages. Its only remaining mentions are two ICU-segmentation comments and one segmentation test
      that checks Burmese *text* splits into more than one token — a segmenter fact, not a picker entry.
      The decision is therefore **off the roster**: sourcing Burmese dictionary data is not on the 1.9.0
      path, and shipping the picker entry without it is the A11 defect class. Every roster language now
      has headword supply (measured: `ar 31 · da 31 · de 63 · el 61 · en 63 · es 62 · fa 31 · fi 30 ·
      fr 63 · grc 29 · hu 31 · id 37 · it 62 · ja 145 · km 29 · ko 63 · la 31 · lo 29 · mn 29 · nl 63 ·
      pl 61 · pt 62 · ro 31 · ru 62 · sh 23 · sq 31 · sv 31 · th 60 · tl 30 · tr 62 · vi 62 · yue 36 ·
      zh 99`, plus `lzh 4` which is supply only) — the "roster language with zero supply" set is empty.
      **RE-CONFIRMED 2026-07-30 by the U46 hotlink pass, on the hotlink axis this time.** The owner's
      "find existing websites and hotlink to it" direction removes the dictionary-data reason to keep
      Burmese off the roster, so the question was asked again against live sites. Burmese still has
      nothing worth a picker entry: **Tatoeba `mya` = 1 sentence** with an English translation (vs
      `tha` 586, `tgl` 707), **en.wiktionary carries 0 audio files** for `ရေ` / `စာအုပ်` (vs ar 21, fa 17,
      vi 10), **Glosbe returns 0 in-HTML example blocks**, `lo.wikipedia`-class native wikis are absent,
      and the **entire Forvo Burmese hub is 488 words** — `ရေ` and `စာအုပ်` both have a page and zero
      recordings. `my.wiktionary` (100,123 articles) is the single usable source, which is one
      definition link and no sentences, no audio, no images. A one-link picker entry is the A11 defect
      class again, so **Burmese stays off the roster and out of
      `config/multilingual/lookup-links.json`**, and `11-target-lookup-hotlinks.test.ts` asserts both.
      Same ruling, same reason, for `lzh` (Literary Chinese): supply-only, never a picker target.

**A37 no longer blocks 1.9.0.** Proven with real browser evidence: ja, ko, es, ar and el each pressed on a
raw unannotated Wikipedia heading (`rawReaderWords: 0`, so the text was not pre-annotated) opened a popover
in the correct active language; screenshots in `scratchpad/a37-after-*.png`.

**OWNER RULING 2026-07-30 — 1.9.0 waits for `D43` + `U105` + `U46`.** The owner was offered cutting 1.9.0
immediately and chose the fuller multilingual story instead. **The premise of that offer — that only a minor
tag can reach the stores — was wrong.** `MANUAL_STORE_PUBLISH` shipped patch builds to both stores instead:
AMO 1.8.72 and Chrome 1.8.71, verified 2026-08-04. So there is no store freeze to trade against; 1.9.0 buys
the honest multilingual claim and the listing rewrite (see `A27.3`, `B4`/`U40`). Do not offer the trade again unless the owner asks.

The remaining gate, precisely:

- **`D43`** full UI localisation for every target, **including an explicit RTL decision** for Arabic and
  Farsi — in scope with named work, or excluded with a defined behaviour when someone picks Arabic. The
  ticket forbids discovering RTL late.
  **PLATFORM + RTL DECISION LANDED 1.8.42. CONTENT IS NOT DONE — 2 of 33 locales are complete.**
  What landed: one locale manifest over all 33 interface locales
  (`src/reader/locales/manifest.ts`, backed by the review ledger
  `config/multilingual/interface-locales.json`); one stable ID vocabulary
  `chrome.* / setup.* / errors.* / a11y.* / docs.*` with a compatibility resolver for both legacy
  systems, so the 1,207 reader-chrome keys and the 3,662 docs prose strings get IDs without touching a
  call site (`src/reader/locales/message-ids.ts`); deterministic fallback
  `requested → language subtag → catalogue id → alias → en`, and the `未翻訳` placeholder is **gone**
  (`src/reader/locales/resolve.ts`); the copy tier is a **property of the string**, resolved from its ID by
  a ranked rule table naming all nine mandatory categories, plus a source-text escalation net that a test
  runs adversarially over every chrome string (`src/reader/locales/copy-tiers.ts`); and the 32 machine-draft
  setup catalogues **seed** the pipeline rather than being discarded — they gained two hand-written keys and
  are served through the same `setup.*` namespace as Japanese.
  **Availability is measured, not declared.** `tests/reader/locales/interface-locales.test.ts` re-measures
  every ledger row against the real packs; a locale may only be offered when it answers **every** registered
  ID itself. That is why exactly `en` and `ja` are selectable and the other 31 are not.
  **The RTL decision, as shipped:** Arabic and Farsi are IN SCOPE, listed, dimmed, `disabled`,
  `aria-disabled`, and labelled with the reason — in the current interface language on the option and in
  their own language in the `title`. The read path is the real guarantee:
  `SELECTABLE_INTERFACE_LANGUAGES` in `src/reader/settings/form-read.ts` is derived from the manifest, so a
  blocked tag forced into the control (`disabled` does not stop `select.value = 'ar'`) is **never stored**
  and can never be answered in English in silence.
  **RTL gate: 2 of 8 items done**, each recorded item-by-item in the ledger's `rtlGate`, with the partial
  ones described as partial. Done: direction propagation, per-script font stacks. **Half done:** bidi
  isolation — substituted values are isolated when the interface is RTL, but the target terms, definitions,
  source names, URLs and shortcuts chrome renders as their own elements are not yet wrapped with
  `lang`/`dir=auto`; and the logical-CSS sweep, which moved 80 shared-chrome declarations and deliberately
  left subtitle/video overlay CSS, positional `left`/`right` and the rotated checkmark glyph physical.
  **Not started:** geometry verification, the 320/768/1440 × 100/200% matrix, real-app RTL screenshots,
  owner acceptance. `rtlGatePasses()` returns **false** and is asserted false.
  **Still open for D43:** MT drafts + native review for the human-critical tier across 31 locales, the
  four unreviewed Japanese website bodies, the other 31 website locale trees,
  the separately rendered hosted shells, and the six unfinished RTL gate items.
  **WEBSITE ARCHITECTURE CHECKPOINT 2026-08-08:** root English and `/ja/` now use
  official static VitePress locales rather than the client text swapper. English
  publishes 21 routes and Japanese publishes the 17 bodies that passed the
  existing review ledger, with static/SPA metadata, route-safe locale links and
  rendered browser gates. This closes the route architecture, not D43: the four
  blocked Japanese bodies and 31 unavailable locale rows remain explicit.
- ~~**`U105`**~~ **DONE 2026-07-30.** The three axes are separately persisted, migrated and consumed;
  `target=ja, output=ko, interface=en` is a passing regression in
  `tests/reader/languages/language-tiers.test.ts`.
- **`U46`** example-sentence and media sources for the other targets, with the targets that have **no**
  usable source named so the affordance degrades visibly rather than silently.
- ~~`A37.3` / `A37.4`~~ **both closed and re-verified 2026-07-30** with the evidence recorded above.

Plan of record for all three: `scratchpad/ml-tiers-localisation-sources-plan.md` (11 sequenced slices).

**ROSTER COUNT, MEASURED 2026-07-30 — this settles the contradiction the older tickets carry.** The
numbers are four different axes and every earlier count mixed at least two of them:

| Axis | Count | Source of truth |
|---|---:|---|
| Configured output/interface roster | **32** | `config/multilingual/languages.json`, `LEARNER_LANGUAGE_IDS` — contains neither `ja` nor `my` |
| Target picker entries | **33** | `LEARNING_TARGET_ROSTER` = `ja` + the 32 |
| Registered target modules | **33** | `ja` + `ko` + 31 generic roster modules (the roster minus `ko`) |
| Catalogue headword languages | **34** | the 33 picker targets + `lzh` (Literary Chinese), which is dictionary *supply*, not a picker target |
| Catalogue definition languages | **34** | includes `sl` (1 entry), also supply and not on the roster |

So "34 study languages" was the supply count, "33-language roster" was the picker, and "the other 31"
was the roster minus `ja` and `ko`. **No configured language is unaccounted for.**
`tests/reader/languages/language-tiers.test.ts` asserts every `LEARNING_TARGET_ROSTER` entry has a
registered module, and `tests/reader/docs-published-pages.test.ts` asserts every lookup-capable picker
target has published dictionary supply — so the next `my` fails a gate instead of shipping a picker entry
that resolves to nothing.

### A35 — UNDOCUMENTED WORK FOUND BY SWEEP 2026-07-29

Six independent sweeps produced 40 raw findings; this is what survived dedupe against the backlog and
re-verification against the tree at `6d681dfa8` and against production on 2026-07-29. Every number below
was re-measured in this triage pass unless the line says otherwise. Ranked: money and data loss, then a
false claim on a live page, then a defect a learner hits, then engineering risk, then polish.

**Money and data loss**

- [x] **A35.1 — CRITICAL: no backup and no restore path for either D1 database or any R2 bucket.** The
      donation ledger is a single unbacked copy. `workers/yomu-support/wrangler.jsonc` binds D1
      `yomu-support` (`c39e8f5c-e6fc-44e0-9b0c-987cde5bcd3c`), which holds `donation_events` — the only
      record of money received (`workers/yomu-support/src/index.ts:1505-1526`; live
      `support.yomureader.com/status` reports `donationsThisMonthGbp` from `donationsSource: "d1"`).
      `wrangler.academy.jsonc` binds D1 `yomu-academy` (`34866a17-0594-4544-a527-9c79c30b4fb7`) holding
      accounts, entitlements and issued Academy codes across 15+ migrations. R2 `yomu-dictionaries` is
      167 objects / 6,127,919,560 bytes per `workers/yomu-dictionaries/README.md:7-10`. A repo-wide search
      for `d1 export`, `d1 backup`, `d1 time-travel`, `--from-remote` or `r2 object get` across `*.md`,
      `*.mjs`, `*.ts`, `*.yml` and `*.jsonc` matches only the yomu-audio *upload* helper: no backup script
      in `scripts/`, no cron export in `.github/workflows/`, no recovery section in any of the six worker
      READMEs. `config/dictionaries/mirror-objects.v1.json` is not a mirror — its `baseUrl` is
      `https://dictionaries.yomureader.com`, so it inventories the bucket's own contents, and
      re-acquisition depends on catalogue source URLs that include `drive.google.com` links. Losing the
      support D1 destroys who donated and how much; losing the academy D1 destroys who paid and which code
      was issued, which is the failure U47/U52/U55 already exist for. Do: a scheduled `wrangler d1 export`
      of both databases to R2 with `--remote` (memory `wrangler-remote-flag-silent-noop`), a written and
      once-rehearsed restore procedure per store, and a second copy of the dictionary bucket that does not
      depend on Google Drive. Write down that Time Travel exists and what it does not cover (a deleted
      database, a deleted account).
- [x] **A35.2 — HIGH: the mined deck is one storage key and its writes fail silently.**
      `src/reader/srs/local-yomu.ts:265-267` writes the whole deck as one value under
      `yomu:srs-local:v1`. `gmStorageSet` (`src/reader/app/storage.ts:351-365`) falls back to
      `localStorageSet` on any GM failure, and `localStorageSet`
      (`src/reader/app/storage.ts:825-831`) is `try { localStorage.setItem(...) } catch { }` — a
      `QuotaExceededError` is discarded. On the hosted Study PWA there is no GM store, so localStorage is
      the only sink. The mutation path then notifies listeners with the comment
      `/* local persistence already succeeded */` (`src/reader/srs/local-yomu.ts:283`), which the swallow
      makes untrue. `grep -ni quota src/reader/**/*.ts` finds handling only for the OCR cache
      (`ocr-cache-store.ts:150`) and the subtitle HTML cache (`parsed-html-cache.ts:180`). A representative
      mined card (expression, reading, four meanings, mined sentence, source URL, tags, scheduler fields)
      serialises to 552 chars, so a Chrome-sized ~5 MB budget is spent at roughly 4,700 cards, after which
      every mine and every grade is dropped while the UI reports success. Do: surface the write failure to
      the caller and to the user, split the deck out of one key (per-card or chunked records), and add a
      quota-exhaustion test on the hosted-Study path. Related but not the same as U44/U97, which is about
      the card model, not the write.
- [x] **A35.3 — HIGH: the undelivered-code alert returns false when its recipient secret is unset, and
      nothing checks.** T0 records that "a PII-free ledger alerts on missing delivery". The alert only
      sends when two secrets are present: `sendOwnerAggregateAlert`
      (`workers/yomu-support/src/academy-code-delivery.ts:518-525`) opens
      `const owner = normalizeRecipientEmail(env.ACADEMY_DELIVERY_ALERT_EMAIL); const email =
      env.ACADEMY_CODE_EMAIL; if (!owner || !email) return false;` with no log, no throw and no counter.
      The caller stores that boolean as `ownerAlertAccepted` (:314-316) and the scheduled entrypoint
      discards it: `workers/yomu-support/src/index.ts:259-261` is
      `async scheduled(...) { ctx.waitUntil(reconcileAcademyCodeDeliveries(env)); }`. The cron is
      `"crons": ["*/15 * * * *"]` in `workers/yomu-support/wrangler.jsonc:54`, and
      `ACADEMY_DELIVERY_ALERT_EMAIL` appears in that file's `secrets.required` array (:48) — which is
      documentation, not a wrangler field, so nothing verifies it was ever set. Every 15 minutes the job
      can find stale deliveries, email nobody and return success. Do: fail loudly when the recipient is
      missing (log at error level and expose it in `/status`), have `scheduled` read the returned
      reconciliation and log the counts, and confirm both secrets are actually set on the deployed Worker.
- [ ] **A35.4 — 533 MB of Academy art and derived corpora exists only on an unpushed local branch.**
      `codex/academy-art-upgrade-20260717` resolves locally to `ae34778f0` and has no remote counterpart
      (`git branch -r --list 'origin/codex/academy-art-upgrade-20260717'` is empty); `git cherry
      origin/main` reports 18 patches not on main, last commit 2026-07-18. Measured against `origin/main`:
      4,091 files on the branch and not on main, 532,997,196 bytes, of which 480,517,678 bytes are images
      (276 `.png`, 64 `.webp`, 26 `.jpg`) plus 1,812 `.jsonl` and 1,805 `.tsv`. These are generated sprites
      and derived corpora that cost real generation spend and cannot be reproduced byte-for-byte, held on
      one machine in a repo whose cleanup routine deletes local branches and release worktrees (memory
      `yomu-worktree-sweeper-hazard`). Do: push the ref, or decide to drop it and say so. This refines the
      line-1426 unmerged-worktree entry, which was taken from an older snapshot with different branch names
      and does not name a branch with no remote at all.

**A claim on a live page that is not true**

- [x] **A35.5 — FIXED and structurally prevented (v1.8.38).** `heroStudyLanguages()` reads the shipped
      `term-lookup` capability, and `tests/reader/docs-published-pages.test.ts:185` asserts the homepage
      rotator is EXACTLY that set — so the claim is now derived from what the lookup can do rather than from
      the dictionary roster, and a marketing claim cannot outrun the product again. The lookup itself was
      opened in the same release (`JAPANESE_RUN_RE` deleted; ja/ko/es/ar/el each open a popover on raw
      Wikipedia headings). Original finding: **the homepage hero names nine study targets; the reader permits one, and A24.5
      already ruled this claim out.** `docs/index.md:14` ships
      `<h1>A complete system for learning <span class="yomu-language-rotator" aria-label="Japanese">` whose
      cycle is Japanese, Chinese, Cantonese, Korean, Spanish, French, German, Russian, Vietnamese. The
      shipped reader permits one target: `src/reader/languages/roster.ts:21`
      `export const SLICE1_TARGET_LANGUAGE = 'ja' as const;`; `src/reader/settings/form.ts:146-147` renders
      fixed text plus `<input type="hidden" name="targetLanguage">`, not a picker; every pointer lookup is
      gated on `JAPANESE_RUN_RE` (`src/reader/lookup/pointer-text-lookup.ts:4,258`), built from kana, Han
      and the prolonged sound mark, so pressing a word in Korean, Spanish, French, German, Russian or
      Vietnamese returns null and nothing opens. Chinese and Cantonese match only because they share Han
      and are then handed to the Japanese parsers. A24.5 (backlog:329) says any multilingual claim must
      describe definition-language coverage, not study-target parity, until T4/A7 opens the seam; A28
      (backlog:369) then lists the cycling hero as a verified pass. Nothing reconciles the two. Do: decide
      which claim the page makes. Either cycle definition languages (and fix A35.6 first, because that
      claim is also overstated), or hold the hero to Japanese until the target seam opens. Add the hero
      claim to the published-pages audit so the gate can catch a marketing claim the product cannot meet.
      This is not U61/T4, which record the engineering gap; the public claim is what is unwritten.
- [x] **A35.6 — FIXED (`8dc53355c`).** `docs/features.md:10` now reads "Yomu ships definitions in 9
      languages." — the measured count, matching the nine shelves that actually carry entries in their own
      language. Original finding: **"Yomu ships definitions in 32 languages" is wrong for 23 of the 32.**
      `docs/features.md:17` reads "**The meaning**, in your language. Yomu ships definitions in 32
      languages." Measured over `config/dictionaries/published/v1/recommendations/*.json` (32 shelves, all
      `XX-ja`, so Japanese is the only target with a shelf), counting entries whose `definitionLanguage`
      equals the shelf's own `learnerLanguage`: 23 shelves have zero — ar, da, el, fa, fi, grc, id, it, km,
      ko, la, lo, mn, pl, ro, sh, sq, th, tl, tr, vi, yue, zh. The nine with any are en 4, es 2, fr 2, de
      1, hu 1, nl 1, pt 1, ru 1, sv 1 (of 8 entries each). `zh-ja.json` declares
      `"strategy": "native-first"`, `"readiness": "ready"`, `"blockers": []` and every one of its eight
      dictionaries has `definitionLanguage` of `en` or `ja`. All 32 shelves declare `readiness: "ready"`.
      A24.5 named definition-language coverage as the honest claim, so this is the one multilingual promise
      the docs were meant to be able to keep. Do: change the copy to the measured count until supply lands
      (T4 covers the supply work), and treat the shelf's readiness field as unfit for a UI to read — U62
      already records that `languages.json` lies; this is the same lie in the per-shelf files, on the
      definition axis rather than the headword axis T4 measures.
- [x] **A35.7 — FIXED 2026-07-29.** `@cijapanese` was a RENAME, not a deletion: the surviving
      `/c/ComprehensibleJapanese` URL carries `canonicalBaseUrl: @nijapanese`, titled "Natural Japanese
      (NIJ)", same creator, so that entry is repointed and renamed. No live handle could be found for
      `@chinese-muimui` (`@muimui` resolves but is a different channel — nothing on it carries むいむい), so
      it is dropped rather than pointed somewhere wrong. The docs references the ticket lists were already
      removed by the A3 narrative rewrite. The generic fix shipped as `npm run check:channels`, which curls
      every handle: **99/99 resolve**. It stays OFF the release path deliberately — it needs the network and
      YouTube rate-limits, so it belongs on a schedule rather than in front of a release.
      Two things worth keeping: the checker's first version silently skipped
      `{ handle: '@はいじぃ迷作劇場', name: "Haiji's ..." }` because the name is double-quoted, so it now
      parses handles independently of row formatting and hard-fails when its count disagrees with the file.
      And `tests/reader/youtube-filter.test.ts` hardcoded the roster size in six places; those now derive
      from `YOUTUBE_CHANNEL_RECOMMENDATION_COUNT`. **Note for whoever touches that file next: it fails 8
      tests on unmodified `origin/main` when run standalone and only passes inside the sharded CI suite, so
      judge it with `check:release`, never with a single-file run.**
      Original finding: **`@cijapanese` is dead in the docs, in that page's JSON-LD, and in the shipped
      channel roster, and nothing in the repo ever checks a link.** Verified with a Chrome UA following
      redirects on 2026-07-29: `youtube.com/@cijapanese` → 404 and `youtube.com/@chinese-muimui` → 404,
      while controls `@nihongoconteppei` and `@kurzgesagt_jp` → 200. Both dead handles ship in
      `src/reader/subtitles/youtube-channel-recommendations.ts:109` (`'Comprehensible Japanese', level:
      'N5'`) and `:82` (`'とある中国人のむいむい'`). The same dead handle appears three times in
      `docs/guides/comprehensible-input-youtube.md`: `:40` as the first N5 recommendation, `:102` in body
      prose, and `:11` inside the `FAQPage` JSON-LD answer Google parses ("For N5, start with
      Comprehensible Japanese (@cijapanese)…"). `@ComprehensibleJapanese` and two other guesses also 404,
      so the replacement needs looking up. Do: find the live handle or drop the entry, in all four places,
      and add a link check over `youtube-channel-recommendations.ts` (101 handles) plus the outbound links
      in `docs/**/*.md` so the next dead channel does not ship silently. The generic fix is the check; both
      lists are hand-maintained today with nothing that curls them.
- [x] **A35.8 — RESOLVED by the homepage rewrite. The false sentence ("On a phone it runs in the browser
      you already have") no longer exists: the 56% copy cut removed it, and `grep -niE
      'phone|browser you already|safari|android' docs/index.md` now returns only the honest
      "Free, on your computer and your phone." The iOS route stays discoverable through the failure path a
      manager-less tap actually produces — the install note links to the manager instructions
      (`/learn/week-one#install-yomu`) — and the full six-step iOS walkthrough lives in the learning path.
      Deliberately NOT re-adding a device sentence: the owner's standing direction is a promise over an SKU
      list, and less copy on this page. Original finding: **the homepage tells phone users it runs in the
      browser they already have, and the iOS
      caveat it used to carry is gone.** `docs/index.md:69` reads "On a phone it runs in the browser you
      already have." For iOS that is wrong: `docs/getting-started.md:29-39` says Safari has no store
      version, Yomu arrives as a userscript, and lists six steps starting with installing the Userscripts
      app, with the callout "**Don't skip step 3.** … This is the most common reason an install seems to do
      nothing." `docs/getting-started.md:162` says "On Safari, iPhone and iPad the userscript is the only
      option." The mobile band that used to disclose this is gone: `grep -i 'android|iphone|ipad|safari'
      docs/index.md` now returns one line, `:69`, and it is the claim itself. Setup friction is the
      most-reported complaint in the research (T3, B1), and iOS is where it is highest. Do: restore one
      sentence on the homepage naming the Android store click and the iOS userscript manager, and link it
      to `getting-started`.

**Defects a learner hits**

- [x] **A35.9 — FIXED in v1.8.36: browser-extension installs reach onboarding on the first Japanese
      page and remember completion in shared extension storage.** The repeated per-lookup Finish setup
      strip was removed on 2026-07-31: onboarding already offers the starter download, failures point to
      Settings → Sources, and T3's owner-decided try-first flow requires deferred setup to be skippable
      forever. Previously, `src/reader/app/startup.ts:74` was
      `if (runningAsBrowserExtension()) return isYomuNewTabUrl(href);`, gating onboarding to the
      extension's own new-tab/Study page, and `scripts/lib/extension-runtime-hardening.mjs:155-163`
      deliberately strips `chrome_url_overrides` and `chrome_settings_overrides` so nothing ever navigates
      there ("Study remains packaged and opens as a normal page from the popup"). The offline dictionary
      install has exactly one automatic trigger, onboarding
      (`src/reader/app/onboarding.ts:441` → `src/reader/app/main.ts:1201`). So an extension learner reading
      a Japanese page has an empty dictionary store with `localDictionariesEnabled: true`
      (`src/reader/settings/index.ts:475`) and every lookup falls through to `noDefinitions`, "No enabled
      definition source returned results." (`src/reader/app/i18n.ts:1118`, rendered at
      `src/reader/sources/definition-stack.ts:91`). There is no finish-setup nudge: grep for
      `setupHint|finishSetup|noSourcesYet|setupNeeded|firstRunHint` across `src/reader` returns zero. The
      comment justifying the gate is also now false — it claims extensions have no GM store, but
      `scripts/lib/extension-runtime-hardening.mjs:171-174` force-adds the `storage` permission, so
      `extensionStorageArea()` (`src/reader/app/storage.ts:1032-1041`) returns `chrome.storage.local`,
      which is cross-origin and would carry `onboardingSeen`. Do: persist `onboardingSeen` through
      extension storage and let the first run happen on the first Japanese page, or ship an in-page
      finish-setup prompt when the dictionary store is empty. The stores are the main distribution channel;
      today an install's first lookup returns the empty-source message. Feeds T3's try-first work, which
      describes the redesign but not this bug.
- [x] **A35.10 — FIXED 2026-07-30: first-run dictionary setup names its real contents, states the size,
      and stays visible after onboarding closes.** The original 34.1 MiB measurement omitted the
      `kanjium-pitch` ZIP: its current response is 1,072,708 bytes, making the full six-download set
      **36,805,189 bytes (35.1 MiB)**. The English and Japanese labels now say definitions, names, kanji,
      frequency, and pitch with that total; neither claims Jitendex. Reader and Study both pass the
      importer's existing `onProgress` messages to their replacement toast, so download, ZIP reading,
      parsing, and storage progress remain on screen after the welcome panel closes. Focused proof:
      `npx vitest run tests/reader/onboarding.test.ts tests/reader/offline-dictionary-setup.test.ts`
      (14/14) plus `npm run typecheck` and `npm run locales:report` (English and Japanese human-critical
      coverage 387/387).
- [x] **A35.11 — CLOSED 2026-07-31, verified on main: `src/reader/popup/modal-accessibility-impl.ts` is the shared
      controller — Tab trap (`event.key !== 'Tab'` guard plus wrap), background `aria-hidden` with exact
      restoration, and focus returned to the trigger. Crucially `aria-modal` is now set INSIDE that
      controller (`:18`) rather than on every popover, so the claim is only made where it is honoured;
      hover/passive popovers expose no modal role at all, which is the honest answer for something the user
      did not open. Shipped as `2533ec984` with 184/184 focused assertions and check:release PASS. ORIGINAL: HIGH: the lookup popover declares `aria-modal` with no focus trap, no background hiding
      and no focus restore.** `src/reader/popup/shell.ts:83-86` sets `role="dialog"` and
      `aria-modal="true"` on every lookup popover, hover-triggered ones included (the `trigger` parameter
      only picks the sheet class). `src/reader/app/main.ts:10340` moves focus into it on mount, and
      `dismiss()` (`main.ts:10497-10521`) removes the nodes without restoring focus, so Escape leaves the
      keyboard user on `document.body` and Tab restarts at the top of the page. There is one `Tab` handler
      in all of `src/reader` — `src/reader/settings/dialog-controller.ts:780-782` → `trapFocus` (:845) —
      so Tab from inside the lookup walks into the page the dialog says is inert. Background `aria-hidden`
      is applied only by the settings dialog (`dialog-controller.ts:812-824`), which also records and
      restores `activeElement` (:621-623, :794-798). For hover popovers there is no backdrop either, yet
      `aria-modal="true"` tells a screen reader the rest of the page is gone. Do: either trap focus, hide
      the background and restore focus on dismiss, or drop `aria-modal` for non-modal triggers. Nothing in
      the backlog covers focus, ARIA or keyboard reachability for the popover — grep for "focus trap",
      "aria-modal", "accessibility" and "screen reader" returns zero hits.
- [x] **A35.12 — CLOSED 2026-07-31, verified on main: `src/reader/jpdb/jpdb-api.ts` now contains **zero**
      `new Error('<English literal>')` sites and routes failures through ID-keyed messages
      (`'missing-key': 'jpdbApiKeyMissingError'`, `'rate-limited': 'jpdbRateLimitedError'`), so a toast can be
      localised while the log keeps its English. That is the seam the ticket asked for rather than 124
      translated literals. Shipped as `ebab4625d fix(i18n): localize user-facing errors`. ORIGINAL: runtime error toasts are English whatever the interface language is set to.** There are
      124 `new Error('<English literal>')` sites under `src/reader`. The user-facing ones include
      `src/reader/jpdb/jpdb-api.ts:52-81`: 'JPDB API key is not set.', 'JPDB rejected the API key.', 'JPDB
      is rate limited. Try again in a moment.', `JPDB request failed (${status}).` Every consuming toast
      uses `this.toast(error instanceof Error ? error.message : uiText(this.settings.interfaceLanguage,
      '<key>'))` — `src/reader/app/main.ts:5675` (lookup failure), `:4116` (review grading), `:10042`,
      `src/reader/app/visible-page-scanner.ts:753`, `src/reader/app/factory-reset-coordinator.ts:109` — so
      the localised string is unreachable whenever a real `Error` is thrown, which is every actual failure.
      `i18n.ts` already carries ja copy for the fallbacks (`jpdbLookupFailed`, `reviewFailed`,
      `jpdbScanFailed`) that the pattern bypasses, and the localisation suites cover only the settings form
      (`tests/reader/settings-form/05-localization-layout-scan`, `06-`, `07-`). Wrong key and rate limit
      are the two failures a new learner meets first. Do: map thrown errors to copy keys at the toast
      boundary and add one test that asserts a ja-interface toast contains no ASCII sentence. Feeds D43.
- [x] **A35.13 — FIXED 2026-07-29 (deploy pending).** Reproduced first: `GET /academy/api/health` 200,
      `HEAD` on the same URL 404, while `support.yomureader.com/status` and
      `dictionaries.yomureader.com/healthz` both HEAD 200. `workers/yomu-academy/src/index.ts` now folds
      HEAD into GET before building the `route` string, so every readable route answers HEAD the way the
      other Workers already do. Needs a worker deploy to take effect; re-check both verbs after it.
      Original finding: **the Academy Worker 404s HEAD on every one of its GET routes.** Measured: `GET
      https://yomureader.com/academy/api/health` → 200; `HEAD` on the same URL → **404** with
      `content-type: application/json`. The other Workers answer HEAD correctly — `support.yomureader.com/status`,
      `dictionaries.yomureader.com/healthz` both HEAD 200. The cause is
      `workers/yomu-academy/src/index.ts:76`: `const route = \`${request.method} ${pathname}\`` feeding a
      `switch (route)` of literals like `case 'GET /academy/api/health':` with `default:` throwing 404, so
      it applies to every GET route in that Worker. HEAD is what uptime monitors, link checkers and
      prefetch use, so the academy API reports itself down to any HEAD check while healthy. Do: normalise
      HEAD to GET before building `route`, the way the other Workers already do with their read-method
      sets.

**Engineering risk**

- [x] **A35.14 — CLOSED 2026-07-29: the static origin now has an active Cloudflare response-header
      rule, and all five Workers apply the same security baseline at their response boundary.**
      Static pages receive two-year preload-ready HSTS, nosniff, strict-origin referrer handling,
      and a frame-only CSP that does not constrain Reader/Study/Academy resources. Worker API and
      media responses use a strict `default-src 'none'` CSP, no-referrer, nosniff, and HSTS; the
      support donation form preserves its narrower route-specific CSP. The Cloudflare rule excludes
      Academy Worker routes so it cannot replace their stricter policy. `Permissions-Policy` is
      deliberately omitted because Reader and Academy have optional microphone recording;
      `X-Frame-Options` is omitted in favour of the single `frame-ancestors` source of truth; and
      cross-origin isolation/resource headers are omitted because the userscript intentionally
      consumes these services from other origins. The apex passed the preload eligibility check and
      is pending inclusion after submission to `hstspreload.org`. See `docs/dev/security-headers.md`.
      **Original finding: no security headers on the origin or on four of five Workers, so the http→https
      redirect was strippable.** Header dumps on 2026-07-29: `https://yomureader.com/` returns
      `access-control-allow-origin: *` and cache/CDN plumbing and nothing else. Absent on every host
      tested: `strict-transport-security`, `content-security-policy`, `referrer-policy`,
      `x-frame-options`, `permissions-policy`. `x-content-type-options: nosniff` exists on exactly one
      host, `dictionaries.yomureader.com`; it is missing on the apex, `support.`, `audio.`, `edge.` and
      `/academy/api/*`. `http://yomureader.com/` 301s to https, but with no HSTS the first hop is
      downgradeable and the zone can never be preloaded. Backlog greps: HSTS, Strict-Transport,
      Content-Security, Referrer-Policy, X-Content-Type and "security header" are all zero hits, and A33's
      Cloudflare list (backlog:429-441) has no response-header rule. Consequences with the measurements
      attached: no `frame-ancestors` or `x-frame-options` means `/study/` can be framed;
      `access-control-allow-origin: *` on `/yomu.user.js` lets any origin fetch and re-host the userscript,
      which is the clone risk U109 raises while U109 asks only for checksums. GitHub Pages cannot set
      headers, so this has to be a Cloudflare Transform / Response Header rule. Do: one rule on the zone
      adding HSTS, nosniff, referrer-policy and frame-ancestors across the apex and the four subdomains,
      then re-run the dumps.
- [x] **A35.15 — CLOSED 2026-07-29: repository hygiene and committed-artifact checks now gate every
      pull request and push to `main`, including the userscript bot's generated commit before it pushes.**
      The checks need no dependency install or network access, so the new committed-state job stays a
      short pure-commit gate. **Original finding: the two gates that catch a poisoned main ran on the tag path only.**
      `scripts/run-check.mjs:109-110` runs `check:repository` then `check:artifacts` first.
      `grep -n 'check:repository|check:artifacts|check:release' .github/workflows/*.yml` returns exactly
      one hit: `release.yml:95` (`npm run check:release`). ci.yml runs neither.
      `scripts/check-repository-hygiene.mjs:8-25` hard-fails when any tracked file sits under
      `artifacts/`, `qa-artifacts/`, `.claude/`, `references/`, `tmp/`, `verify/` or
      `release-worktrees/` — one such file fails the gate for every session, which is what happened to the
      v1.8.22 publish (memory `yomu-hygiene-gate-blocks-everyone`).
      `scripts/check-committed-artifacts.mjs:1-25` documents its own reason: `verify` compares freshly
      rebuilt bytes against freshly rebuilt bytes, and "that masking is how yomureader.com/study/ kept
      serving a 1.8.14 build under a 1.8.15 release". `build-userscript.yml` pushes regenerated artifacts
      to main after typecheck, build, sync, docs:build and verify, never `check:artifacts`, and ci.yml's
      push trigger carries `paths-ignore: dist/yomu.user.js`, so that bot commit runs no suite either.
      Both checks pass on this tree today. Do: add a 20-second job to ci.yml running `check:repository` and
      `check:artifacts` on pull_request and push, and to `build-userscript.yml` after its commit. Both are
      pure functions of committed bytes and cannot flake.
- [x] **A35.16 — CLOSED 2026-07-29: every test file now runs in a push/PR workflow, Worker
      typechecking is explicit, and `video/` has its own CI typecheck.** The coverage audit reports
      812/812 files assigned (457 reader, 352 Academy, 3 Worker; orphaned 0); the original sweep
      baseline was 807 files with 354 orphaned. The Academy job executes all 352 files and fails on
      any result outside the named 26-assertion `origin/main` baseline; it prints every remaining
      baseline failure so the pre-existing Academy debt is not hidden. Worker sources are included
      directly by `tsconfig.json`, the Worker suites have a dedicated CI job, and
      the isolated Remotion package installs from `video/package-lock.json` before typechecking.
      **Original finding: 354 test files ran in no workflow, Worker typechecking was accidental, and `video/`
      was ungated.** Three holes in what CI covers, all measured at HEAD.
      - `find tests/academy -name '*.test.ts'` = **352**, `tests/workers` = **2**, `tests/reader` = 453.
        ci.yml only runs `node scripts/run-ci-tests.mjs --kind regular|jpdb` (`ci.yml:61,77`) and that
        script selects from `READER_TESTS_DIR = tests/reader` (`scripts/run-ci-tests.mjs:10`) and
        `tests/reader/jpdb` (:14). `grep -n 'test:academy|test:workers' .github/workflows/*.yml` returns
        nothing. On the release path `scripts/run-check.mjs:153` gates the academy suite behind
        `if (!releaseCheck)`, and `check:release` is exactly what `release.yml:95` runs. So the academy
        suite — including `academy-worker-payment-ingress`, `academy-worker-stripe`,
        `academy-worker-oidc`, `academy-worker-session`, `academy-worker-entitlement`,
        `donation-access-e2e` — runs only on a developer laptop, and so does `test:workers` (2 files, 17
        tests, 1.5s). The full academy suite is CI-impossible for a stated reason (local moodle corpora);
        the Worker and D1 subset is not, and a CI-runnable slice already exists in package.json as
        `academy:backend-lifecycle:proof:local`.
      - `tsconfig.json:23` includes `src/**`, `tests/**`, `config/**` and `vite.config.ts`; `workers/**` is
        absent, so `npm run typecheck` covers Worker code only where a test under `tests/**` imports it
        statically. `npx tsc --noEmit --listFiles | grep /workers/` lists 34 of the 35 non-declaration
        Worker sources; the miss is `workers/yomu-dictionaries/src/index.ts` (344 lines, serves the 6.1 GB
        catalogue), because its test loads it dynamically —
        `tests/workers/yomu-dictionaries-worker.test.ts:46` is
        `await import(workerModulePath) as DictionaryWorkerModule` against a hand-written interface. It
        compiles clean today, so this is a coverage hole rather than a live break.
      - `video/` is 17 files / 2,944 lines (`video/src/GamingLoop.tsx`, `scenes/ActOne.tsx`, …), listed in
        `.fallowrc.jsonc` `ignorePatterns`, referenced by no root npm script and no workflow, with no
        `video/node_modules` so its own `typecheck` cannot run. Backlog S0 asks for a full Remotion video
        for Yomu Gaming, so the first signal of a break is a failed render.
      Do: add the CI-runnable academy Worker/D1 slice plus `test:workers` to ci.yml; add `workers/**/*.ts`
      to the typecheck include (or a second tsconfig); decide whether `video/` gets a nightly
      `npm ci && npm run typecheck` or stays deliberately unverified, and write the decision down.
- [x] **A35.17 — CLOSED 2026-07-29: every requested release-smoke engine must run, and the pass line
      names the engines that completed.** A skipped or missing requested engine now fails coverage, and
      `playwright install-deps` host-dependency errors are no longer misclassified as an optional missing
      executable. **Original finding: WebKit could drop out of the release-gating layout smoke while the smoke still
      reported pass.** `scripts/lib/smoke-harness.mjs:953-955`: `isMissingBrowserExecutable` returns true
      when the message includes `"Executable doesn't exist"` **or** matches `/playwright install/i`.
      Playwright's host-dependency failure is a different fault but its message matches that regex —
      `node_modules/playwright-core/lib/server/registry/dependencies.js:227` builds "Host system is
      missing dependencies to run browsers." and appends `npx playwright install-deps`.
      `launchOptionalBrowser` (:944-951) turns anything so classified into `{ skipped: true }` instead of
      rethrowing; `scripts/reddit-chrome-furigana-smoke.mjs:255-259` records the skip and continues, and
      the final assertion (:304) is `assert(summaries.some(summary => !summary.skipped), …)` — one
      surviving engine satisfies it. The all-skip case does fail (`YOMU_REDDIT_SMOKE_ENGINES=firefox node
      scripts/reddit-chrome-furigana-smoke.mjs` → `{"summaries": []}`, exit 1); the partial-skip case has
      no guard. `smoke:reddit-chrome` sits inside `smoke:layout-regressions`, which runs in ci.yml
      (`:107`) and in `smoke:release` on the tag path (`release.yml:96`). WebKit is the engine that catches
      the Safari and iPad furigana and mirror-geometry regressions this repo keeps rediscovering. Do:
      require every *requested* engine to have run, stop classifying `install-deps` messages as a missing
      executable, and print the engine list in the pass line.
- [x] **A35.18 — CLOSED 2026-07-30: a scheduled probe watches all five Workers, and every health payload
      now names the build that answered.** `.github/workflows/production-health.yml` runs
      `scripts/production-health-check.mjs` every 30 minutes and on demand, installing nothing so a
      lockfile or registry problem can never be why the monitor goes quiet. A non-200, a non-JSON body,
      or a `disabled`/`unconfigured`/`error` status fails the run, each endpoint retried three times.
      Build drift is reported and never failed on, because deploys are manual. All five payloads carry a
      `revision` block from `workers/shared/service-revision.ts` (`version` from package.json at build
      time, so it compares to main with no Cloudflare API call, plus `deploymentId`/`deployedAt` from the
      `version_metadata` binding; both `null` rather than omitted when the binding is absent).
      `tests/workers/production-health.test.ts` fails when a Worker has no probe, when a probe names a
      host its own wrangler config does not route, and when no scheduled workflow invokes the probe.
      DEPLOYED AND VERIFIED LIVE 2026-07-30 17:0x — all five moved from `version=unstamped` to
      `version=1.8.43` with real `deployed=` timestamps. Also re-verified in the same pass: the R2 edge
      cache still goes `x-yomu-edge-cache: miss` → `hit` with `cf-cache-status: HIT`, and an
      `objects/sha256/` key still serves `max-age=31536000, immutable`. Note for future probes: the
      dictionaries Worker deliberately excludes HEAD from the Cache API, so `curl -sI` cannot show the
      miss→hit pair — use body-discarded GETs. **Original finding:** Deployment is
      manual by design: `grep -rn 'wrangler' .github/` returns nothing, no package.json script deploys,
      and `workers/yomu-dictionaries/README.md:12-13` states "Provisioning and publication remain explicit
      operator actions." All wrangler configs set `observability.enabled: true`, which is log retention;
      there is no `tail_consumers`, no notification config and no alert sink in the repo. No workflow
      touches production, and the only cron (`nightly.yml`, `17 3 * * *`) runs fixture-served smokes. Live
      probes exist but are manual (`scripts/dictionaries/verify-live.mjs:91`). Measured 2026-07-29:
      `dictionaries.yomureader.com/healthz` 200, `audio.yomureader.com/status` 200,
      `support.yomureader.com/status` 200, `yomureader.com/academy/api/health` 200,
      `edge.yomureader.com/health` **400** — nobody knows how long that has been 400. The academy payload
      identifies its build only as `workerVersionId`, an opaque Cloudflare id; no other Worker reports a
      revision, so "is production running main?" cannot be answered. Do: a scheduled workflow that curls
      the five health endpoints and fails on non-200 (and fix or retire the `edge` route), plus
      `CF_VERSION_METADATA` and the package version stamped into every health response.
- [x] **A35.19 — CLOSED 2026-07-29: yomu-audio now puts R2 index responses and immutable audio
      objects behind the Workers Cache API, and yomu-support caches its public banner reads.** Both
      Workers expose `x-yomu-edge-cache: miss|hit`, use GET URL keys without `Range`, and restore their
      canonical browser `Cache-Control` on hits. The sibling audit found `jpdb-public-proxy` already
      caches only public user-agnostic GETs and excludes authorization. Academy media is deliberately
      not edge-cached: it requires an access session, is `private`, varies on `Cookie`, supports byte
      ranges, and must not become a shared response. **Original finding: yomu-audio served R2 with no edge cache, and its cache was wired to the slow path
      only.** `workers/yomu-audio/src/index.ts:138` routes `/audio/*` to `serveR2AudioObject` (:186), which
      does `await env.AUDIO_BUCKET.get(rawKey)` (:189) and returns
      `cache-control: public, max-age=31536000, immutable` (:192) with no `caches.default` lookup or put.
      The Worker is on `audio.yomureader.com` as `custom_domain: true`, so a Worker response never
      populates the zone cache on its own and that header is inert at the edge. The Cache API helpers in
      the same file (`cacheMatch` :394, `cachePut` :400) are called only on the upstream fetch fallback
      (:156, :165). The R2-index JSON path returns at :148 with `max-age=3600` and no `cachePut`, so it
      re-reads the shard on every cold isolate. This is the defect A33 records as fixed for
      yomu-dictionaries (`workers/yomu-dictionaries/src/index.ts:115-126` wraps its R2 reads in
      `edge.match`/`edge.put`) left in place on the highest-volume, most repeat-requested, immutable path.
      Same class at lower volume in yomu-support: `src/index.ts:296` builds
      `cache-control: public, max-age=300` for `/goal`, `/progress` and `/status`, and `/progress` runs two
      D1 aggregates per call (:406, :414) with no memo. jpdb-public-proxy is clean (:242-246). Do: copy the
      dictionary Worker's edge-cache wrapper onto `/audio/*` and the R2-index path, and put the support
      banner reads behind the Cache API so a banner impression is not two D1 reads.
- [ ] **A35.20 — compression leg CLOSED 2026-07-31; minification leg blocked by design; one new finding.**
      **CLOSED — compression.** A Cloudflare Compression Rule ("Prefer Zstandard for Academy app bundle",
      matching `http.request.uri.path eq "/academy/app.js"`, order zstd/brotli/gzip) now makes the zone stop
      answering gzip to a browser that offers everything. Verified independently on production with a real
      browser header: `/academy/app.js` went **3,484,388 -> 3,065,512 bytes**, saving **418,876 bytes (12.0%)
      on every visit**. A cache-busting request returned a Cloudflare `MISS` and still served zstd, so it is
      not a warmed-cache artifact. Free-plan compatible, 1 of 10 available rules.
      Kept deliberately path-specific rather than zone-wide, because zstd is WORSE for small responses here:
      `/yomu.user.js` measures gzip 411,960 / br 405,106 / zstd 416,467, so it was correctly left on gzip.
      **NEW, and separate from the fix — the docs HTML serves the worst of the three.** Measured on `/`:
      br **11,021**, gzip **11,049**, zstd **11,726** — and with a realistic browser header the zone chooses
      **zstd**, the largest. That is Cloudflare's own default negotiation, not the new rule (which matches
      only the Academy bundle), so it predates this work. It costs ~705 bytes per page view against brotli,
      about 6.4%. Small per hit but it is on every page. Fix is a second Compression Rule preferring brotli
      for HTML — worth pairing with a check of whether any other text response is being handed zstd where
      brotli wins.
      **MEASURED 2026-07-31, and both remaining legs now have a specific answer.**
      - **Compression: confirmed, quantified, and it is a negotiation bug rather than a missing feature.**
        Brotli and zstd both work when requested alone, so the zone can produce them — but with a realistic
        browser header (`accept-encoding: gzip, deflate, br, zstd`) it serves **gzip**. Transferred bytes for
        the same object: gzip **3,484,388**, br **3,111,707** (-10.7%), zstd **3,066,162** (-12.0%). So every
        visitor pays about **418 KB extra** on a 3 MB script for no reason. Most likely cause is the origin
        returning an already-gzipped variant that Cloudflare passes through rather than recompressing;
        needs a dashboard/zone check, which is a codex task (memory `yomu-deploys-via-codex`).
      - **Minification is BLOCKED by design, and the ticket did not know it.** Turning on `minify` in
        `config/vite/academy.config.ts` would break provenance tests that deliberately grep the *shipped*
        bundle for readable source expressions — `tests/academy/learning-voice-playback.test.ts:645-649`
        asserts `docs/public/academy/app.js` contains `value.role === "academy-character"` and
        `options.invalidEntry === "skip"`, and `tests/academy/n3-mock-listening.test.ts:295` diffs the public
        bundle against `git show HEAD:` . Those exist to prove the runtime ships the accepted parser, which
        is content-governance for a cast with likeness consent, so they are not simply deletable.
        **The real fix is to stop proving provenance by substring-matching minifiable code:** assert against
        a build-time provenance manifest or a source map, then minification is free. Until then `minify:
        false` is load-bearing and should be commented as such rather than looking like an oversight.
      The audio and runtime-art legs closed on 2026-07-30; the script/compression legs below remain open.
      - **Closed:** the 13 Persona BGM files were re-encoded from 377,876,845 B of FLAC to 55,844,890 B
        of ~128 kbps VBR Opus. The 14 short Shinday WAV effects remain unchanged at 795,670 B, so the
        measured protected-audio allowlist is now **56,640,560 B**. `AUDIO_PRECACHE_BYTES` carries that
        exact manifest sum. The service worker no longer fans out across all 27 objects after one media
        request: it demand-caches only the requested allowlisted object, through one serial queue.
      - **Closed:** the 222 runtime PNGs (468,899,599 B) were codec-only exports to 39,584,548 B of WebP,
        with dimensions preserved before their PNG twins were removed. Together with the 172 existing
        WebPs, `public/academy/art` and its deployed docs mirror now contain 394 WebPs totalling
        **65,662,430 B**, down from 494,977,481 B across the former mixed PNG/WebP tree.
      - `docs/public/academy/app.js` = **16,699,522 B** unminified, `style.css` = 1,908,716 B.
        `config/vite/academy.config.ts:119-131` sets `minify: false`, `cssMinify: false` and
        `lib: { formats: ["iife"], fileName: () => "app.js" }`, which forbids splitting by construction.
        `minify: false` is correct for the userscript (`scripts/verify-userscript.cjs:107-109` hard-fails
        minified output because Greasy Fork requires readable source) and has been copied into the hosted
        configs (`academy.config.ts:123`, `newtab.config.ts:29`, `gaming.config.ts:30`) where Greasy Fork
        has no say. esbuild --minify takes app.js to 13,186,589 (21%) and style.css to 1,518,072 (20.5%),
        which shows the mass is inlined curriculum data, not code.
      - With Chrome's own `Accept-Encoding: gzip, deflate, br, zstd`, `/academy/app.js` is served
        **gzip, 3,378,919 bytes**; asking for `br` alone returns br and `zstd` alone returns zstd, so real
        browsers never get the smaller encodings on the precompressed static assets (the homepage HTML does
        get zstd under the same header). A33 commits to Tiered Cache and Cache Reserve and says nothing
        about compression.
      Memory records 9.7 MB/page and 1 GB installed as the Migaku density the reject list exists to
      refuse; Academy is now 3.4 MB compressed and 16.7 MB parsed in one file. Remaining order: turn on
      minify for the hosted configs, then force br/zstd on `*.js`/`*.css` at the zone.
- [x] **A35.21 — HIGH: 8.55 MB of JS is injected into every page, half of the companion bytes are
      duplicated core, and the 2 MB gate reads one file.** `dist/yomu.user.js` = 1,736,020 B and the 12
      companions in `dist/greasyfork/` = 6,816,913 B, so 8,552,933 B across 13 scripts, all unconditional
      `@require`s (`dist/yomu.user.js:14-25`) under `@match *://*/*` and `@match file:///*` (:12-13).
      Largest companion `yomu-settings-surface.user.js` = 1,708,134 B. Cross-companion redundancy measured
      with large-window brotli: sum of individually compressed companions 1,427,919 B against brotli of
      the concatenation 734,156 B, so **48.6%** of companion bytes are duplicated shared core (~3.1 MB
      raw). V8 parse and compile of all 13 measured at 98.7 ms. `dist/yomu.css` = 472,788 B and
      `installStyles()` (`src/reader/app/main.ts:1749-1758`) installs it into the document and the shared
      shadow sheet from `installCoreSurfaces()` (:1338) unconditionally — `pageHasJapaneseText` is computed
      at :1333 and never gates it. The size gate is called once, on the main file only:
      `scripts/verify-userscript.cjs:110` `failIfGreasyForkSizeExceeded(size)` where `size` is
      `dist/yomu.user.js` (`scripts/lib/userscript-build-utils.cjs:115-118`), so
      `yomu-settings-surface.user.js` sits ~292 KB under the same cap completely unchecked. Minification is
      not a lever (verify-userscript.cjs:107-109). Do: hoist the duplicated core into one shared companion
      so the other 11 stop carrying it; run the size check over every emitted companion; skip the 473 KB
      sheet install on pages the reader has no work on. Cycle 10 asks for an early budget against the 2 MB
      core cap and does not describe the aggregate payload or the duplication the split introduced.
      **Closed in `cx-weight-20260730` and released in v1.8.46:** the stale total re-measured at 9,863,031 bytes. The distributed
      header now loads one Rollup-deduplicated, wrapper-trimmed `yomu-runtime` companion, for 5,874,598
      injected bytes across two scripts (3,988,433 bytes / 40.4% less). The gate measures both files from the actual `@require`
      metadata, rejects unmeasurable dependencies, and holds an aggregate ratchet that cannot increase.
- [x] **A35.22 — FIXED: OCR scroll positioning now gathers every surface measurement before writing any
      overlay.** `ocr-position-pass.ts` defines the read/write plan contract and layout memo, while the
      controller batches every recognized image into one two-phase rAF pass. Ancestor transforms are memoized per
      surface and invalidated for that surface when its ancestor mutates; resize, orientation, fullscreen,
      stylesheet changes, and controller restart advance the whole-page epoch. The rAF call keeps its
      `Window` receiver so Firefox userscript sandboxes cannot strand the position latch.
      `scripts/ocr-scroll-position-perf-smoke.mjs` measures the old interleaved path and the shipped path
      against separate, identical BookWalker-shaped fixtures in Chromium: 24 recognized images, ancestor
      depth 15, eight OCR lines each, six layers visible, and 21 alternating rounds. Median positioning
      time fell from **5.050 ms/frame to 0.450 ms/frame** (11.22x); `getComputedStyle` calls fell from
      **120 to 18** and `getBoundingClientRect` calls from **72 to 24**. The old backlog estimate of 320
      flushing reads assumed every recognized image was visible; the measured fixture has six visible layers
      from 24 recognized images. `ocr-position-pass.test.ts` proves every read precedes the first write, and the line,
      transform, and paused-YouTube-frame checks preserve glyph alignment. BookWalker spread and continuous
      modes passed in Firefox, WebKit, and Chromium.
- [x] **A35.23 — PARTLY FIXED 2026-07-31: there is a file-size gate now, and it is a ratchet.** The ticket's
      core complaint was "no file or class size gate anywhere", which was true. `scripts/file-size-audit.mjs`
      plus `config/quality/file-size-baseline.json` now track every `src/**/*.ts` over 2,000 lines — 15 files
      today, worst `src/reader/app/main.ts` at 10,935 and `src/reader/newtab/controller.ts` at 10,854 — and
      run as a `file-size-ratchet` stage in `check:release` beside the complexity ratchet, because a gate
      nothing invokes is not a gate. Deliberately a ratchet, not a limit: 15 files are already over, so a
      hard cap would fail on day one and be read as noise, exactly as the complexity audit was before it was
      baselined. Only growth fails, the baseline may only go down, and the script announces when a file has
      shrunk enough to tighten it. A file crossing 2,000 lines for the FIRST time fails with "split it rather
      than baselining it", so the mega-files cannot quietly gain siblings.
      Mutation-checked both ways: appending two lines to `dom/index.ts` fails with
      `grew 7944 -> 7946 lines`, and a fresh 2,101-line file fails with `is new over 2000 lines`.
      **Still open:** the ticket also wants CLASS size gated, and this counts lines only. The complexity
      audit already walks the TypeScript AST, so class size belongs there rather than in a second AST walk —
      and the real work the ticket asks for is still splitting the two 10k-line controllers, which the gate
      now stops getting worse but does not do. ORIGINAL: three reader classes of 8k-11k lines, and no file or class size gate anywhere.** Measured
      line counts: `src/reader/newtab/controller.ts` 10,782, `src/reader/app/main.ts` 10,702,
      `src/reader/subtitles/controller.ts` 8,359, `src/reader/dom/index.ts` 7,940 (no class at all),
      `src/reader/ocr/controller.ts` 5,007. Within them, `export class ReaderApp` (`main.ts:747`) is 9,956
      lines and 756 methods; `export class NewTabController` (`controller.ts:714`) is 9,822 lines, 796
      methods and 99 fields behind 126 imports. Grouping NewTabController's method names by verb prefix
      names the jobs it holds at once: render 84, handle 51, load 48, study 25, apply 24, sync 18, kanji
      11, play 10, anki 10, submit 9, grade 8, prefetch 8, offline 7, jiten 6. Grep for `MAX_LINES`,
      `maxLines` or `line-limit` across `scripts/check-repository-hygiene.mjs`, `scripts/qa-audit.mjs` and
      `scripts/complexity-audit.mjs` returns nothing: the complexity audit measures per-function
      cyclomatic complexity only, so none of these files register. These are the files every reader bug
      lands in, which matches the recorded pattern of a fix in one surface regressing another. Do: pick one
      of the two 10k files, carve out two or three coherent modules by the verb groups above, and add a
      file-length ceiling to the hygiene check with the current worst files recorded as a shrinking
      baseline.
- [x] **A35.24 — PARTLY FIXED: the complexity gate is real now. Measured before: exit 1, 51 functions over
      the threshold of 30, worst 112, and no workflow ran it while README.md advertised `npm run qa` and
      AGENTS.md named it. A gate that always fails is read as noise and stops being a gate, so existing debt
      is baselined and only GROWTH fails — no new function over 30, and nothing worse than today's worst.
      Both numbers are measured, may only be lowered, and the script says so out loud when a refactor earns
      a tighter baseline (an unlowered baseline is how a ratchet quietly stops ratcheting). Verified: exit 0
      at the baseline, exit 1 when the baseline is nudged to 50. It now runs as its own `complexity-ratchet`
      stage in `check:release`, because a gate nothing invokes is not a gate.
      **UPDATED 2026-07-30 — the count-only baseline is replaced and the dead-code half is closed.** The
      ratchet is now per function (`config/quality/complexity-baseline.json`), which closes a hole the
      scalar version could not see: one function improving while another regressed left the count and the
      worst case unchanged. It fails on a new offender, on a recorded one getting worse, and on a recorded
      entry that no longer matches the tree, so the list can only shrink. Mutation-checked: lowering one
      recorded entry by 1 fails with `scripts/academy-account-lifecycle-live-proof.mjs:main rose from 41
      to 42`, and exit 0 on restore. Re-record with `--update-baseline`.
      Dead code: `src/academy/routing/overflow-destinations.ts` (18 lines, never imported) is deleted, and
      three rotted `.fallowrc.jsonc` suppressions are gone — one naming
      `scripts/bookwalker-canvas-probe.mjs`, a file that no longer exists (fallow ignores a missing entry
      silently), and `src/academy/audio/voice-lines.ts` parked as a not-yet-wired seam while five modules
      imported it normally. `tests/reader/dead-code-config.test.ts` now checks the suppression list
      against the tree, so the one file whose rot was invisible by construction can no longer rot.
      `LOOKUP_LINK_COMPONENTS` is no longer exported (used only in its own file) — that was the U46 delta
      in the red Fallow CI run. `tests/reader/documented-commands.test.ts` fails when README/AGENTS/CONTEXT
      name an `npm run` script that no package.json defines; it caught AGENTS.md naming `npm run qa:live`
      for months after the script was deleted (the real name is `manual:jpdb-live`).
      **Still open:** `qa-audit.mjs` and `docs-a11y-audit.mjs` remain unexercised by CI. Original finding: **the documented quality command cannot pass, and the dead-code
      suppression list has
      rotted.** Two halves of the same problem: gates that read as if they hold.
      - `package.json:129` `qa` = `npm run check && npm run smoke:p0 && node scripts/qa-audit.mjs && node
        scripts/docs-a11y-audit.mjs && node scripts/complexity-audit.mjs`. Running the last stage alone at
        HEAD: **exit 1, 51 functions over the threshold of 30** (`scripts/complexity-audit.mjs:8`
        `THRESHOLD = Number(process.env.YOMU_COMPLEXITY_MAX || 30)`, :76 `process.exitCode = 1`). Worst:
        112 `scripts/lib/academy-workflow-trust.mjs:31 validateGovernanceTrustStore`, 98
        `scripts/validate-story-package.mjs:11 validate`, 91 `scripts/lib/academy-workflow-model.mjs:926
        validateProof`. No workflow runs the audit, so nothing has held the line. README.md:128 advertises
        `npm run qa`; AGENTS.md:25 names it. The two audits ahead of it — `qa-audit.mjs`, whose DOM
        evidence AGENTS.md:55 requires for browser-impacting changes, and `docs-a11y-audit.mjs` — are
        unreachable in that chain. AGENTS.md:28 also tells every agent to run `npm run qa:live`, which does
        not exist (`'qa:live' in scripts` → false; the same dead command is cited in
        `docs/qa/GENERIC-BOUNDARY-PITCH-TAXONOMY-AUDIT-20260716.md`).
      - `.fallowrc.jsonc:83` declares `scripts/bookwalker-canvas-probe.mjs` as an entry point and the file
        does not exist (deleted in `0dcbf4022`), which fallow ignores without a warning. 46 of the 60
        declared `scripts/` entry points are invoked by no npm script and no workflow, so declaring an
        orphan as an entry point is how they stay invisible to the only dead-code detector the repo has.
        `.fallowrc.jsonc:128` still parks `src/academy/audio/voice-lines.ts` as a deliberate seam, but five
        modules now import it normally (`src/academy/ui/story-screen.ts`, `ui/character-scenes.ts`,
        `ui/vn-stage.ts`, `routing/enrollment-flow.ts`, `routing/world-flow.ts`). The other parked seam is
        real dead code: `src/academy/routing/overflow-destinations.ts` exports
        `ACADEMY_OVERFLOW_DESTINATIONS` (six destinations including Class Board and Achievements) and grep
        for the symbol or the module path across all of `src` and `tests` returns zero hits outside the
        file.
      Do: either record a complexity baseline the offender list must shrink from, or stop advertising `qa`
      as a gate; fix the AGENTS.md line; prune the entry-point list to what actually runs and re-file the
      genuinely dead module. U63 records that `fallow:dead-code` exits non-zero; it does not cover the
      config rot or the unpassable `qa`.
- [x] **A35.25 — docs/public keeps every content-addressed build forever.** `docs/public/greasyfork` is
      **385 MB across 536 tracked files**, of which **198 are copies of `yomu-settings-surface`**; there
      are also **48** tracked `docs/public/yomu.<hash>.css` copies. `git count-objects -vH` reports
      size-pack **4.68 GiB**. There is no pruning in the sync path: `scripts/sync-docs-userscript.cjs`
      mentions retention exactly once, in the comment at :49 ("managers with an older header must keep
      validating their pinned URLs"). Retain-forever is right in principle, because an installed userscript
      pins its `@require` by hash and SRI and deleting an old companion 404s that install (memory
      `yomu-release-staging-add-u-trap`). Unbounded is a different thing: 198 copies of a 1.7 MB companion
      serve nobody, and the weight is paid on every clone, every VitePress build and every Pages deploy.
      Do: keep the last N releases plus anything referenced by a still-supported header, prune the rest in
      one commit, and put the retention window in the sync script next to that comment.
      **Closed in `cx-weight-20260730` and released in v1.8.46:** sync now keeps current built/hosted headers, 40 release tags and
      hosted-header revisions (7.68 days at the measured cadence), plus the published store headers.
      The store pin was `v1.8.2` until 2026-08-04, when it was corrected to the measured store floor
      (`v1.8.71` Chrome, `v1.8.72` AMO) in `scripts/lib/content-addressed-retention.mjs`.
      The pruning gate fails on either an unreferenced committed hash or a missing supported pin.

**Polish**

- [x] **A35.26 — CLOSED 2026-07-30: all five gaps fixed, guarded as shell parity, and verified live.**
      The three working hosted apps are in `sitemap.xml` (20 `<loc>` entries before, 23 after) — they are
      static files in `docs/public`, so VitePress never routed them and `transformItems` never received
      them, meaning no filter change could ever have let them through. Every internal link, docs page,
      README entry and the PWA shortcut now use the URL each shell declares canonical, and the redundant
      `hostedHref` nav field is gone along with the stale comment claiming the bare route 404s — the false
      belief that caused the bug. The Academy shell gained canonical + the full og/twitter set, the PDF
      shell's `<title>` now agrees with its `og:title` and it has the two missing twitter fields plus a
      meta description, and `/favicon.ico` is a real two-entry ICO built by `scripts/lib/favicon-ico.cjs`
      from the PNGs that were already the source of truth, so the contract test can recompute the bytes.
      `tests/reader/technical-seo.test.ts` holds it as parity across all four shells and sweeps README and
      `src/reader/app/constants.ts` and the nav definition, which is how it caught a README link the
      first sweep missed. VERIFIED LIVE after deploy: `/favicon.ico` 200 `image/vnd.microsoft.icon` 2,482
      bytes (was the 11,989-byte HTML 404 page), the sitemap carries the three, and `/academy/` serves
      canonical + og:title + twitter:title.
      **OWNER DECISION OPEN (one line to reverse):** `/academy/` is deliberately held OUT of the sitemap.
      It is equally indexable and equally linked, but nobody can currently play it and
      `scripts/submit-indexnow.mjs` pushes every sitemap URL straight to search engines, so listing it
      would advertise a dead end. It still carries full social metadata, so a shared link unfurls
      correctly — only search submission is withheld. Add `'academy/'` to `hostedAppSitemapRoutes` once
      it is playable. **Original finding:** A6 (backlog:82-84) closed
      technical SEO on the evidence that all sitemap URLs return 200, which only examined what is in the
      sitemap. Measured 2026-07-29 on the live site:
      - `sitemap.xml` has **24 `<loc>` entries and none of `/study/`, `/video-player/`, `/pdf-reader/`,
        `/academy/`**, all of which return 200, carry no `noindex`, and are built as indexable landing
        pages.
      - `/pdf-reader/index.html` and `/video-player/index.html` return 200 and declare
        `rel="canonical"` to `/pdf-reader/` and `/video-player/`, while the homepage links the
        `index.html` forms and `manifest.webmanifest`'s "Video Player" shortcut uses
        `/video-player/index.html`. So every internal link and the PWA shortcut point at a URL that
        declares itself a duplicate. The docs pages get this right (`/changelog.html` canonicals to
        `/changelog`).
      - `/academy/` head contains only charset, viewport, theme-color, description, title, icon, manifest
        and stylesheet: no canonical, no `og:*`, no `twitter:card`. Every other surface carries the full
        set with `og-image.png` (200, 1200x630). Academy is the surface paying supporters are sent a link
        to, and that link renders as a bare URL.
      - `/pdf-reader/index.html` has `<title>Yomu PDF</title>` against `og:title` "Yomu PDF Reader", and
        carries `twitter:card` and `twitter:image` with no `twitter:title` or `twitter:description` —
        the only app shell missing them.
      - `/favicon.ico` returns **404** and serves the 11,481-byte HTML error page. The declared icons all
        exist (`/yomu-icon.svg`, `/favicon-32x32.png`, `/favicon-16x16.png`, `/apple-touch-icon.png` all
        200); the root `.ico` path browsers and unfurlers request unconditionally is simply absent.
      Do: add the four app routes to the sitemap; link and canonicalise one form of each app URL; copy the
      six social-metadata lines from a sibling shell into the Academy shell; fix the PDF reader title and
      add its two twitter fields; drop one PNG at `docs/public/favicon.ico`. Feeds D42, which is query
      research and does not cover any of this.

---

- [ ] **A42 — PROGRESS MEASURED 2026-07-31. Most of the gap list has closed; the audit document below is
      now the BEFORE picture, not the current state.** Verified on main rather than taken from wave reports:
      - **b1 (no target choice at install) FIXED.** `app/onboarding.ts` no longer renders a read-only
        `<output>` containing the literal `'日本語 — Japanese'`. It holds a real `targetLanguageSelect`
        populated through `./study-target-picker` (`populateStudyTargetSelect`, `isSelectableStudyTarget`),
        with `tests/reader/study-target-picker.test.ts` and
        `tests/reader/multilingual-onboarding-settings.test.ts` behind it.
      - **b2 (dictionary shelf could not reach non-Japanese supply) FIXED.** The recommendation directory now
        holds **1,056 `<learner>-<target>.json` manifests** (ar-ar, ar-da, ar-de, ar-el, ar-en, ar-es, …)
        where it held 32 `<learner>-ja.json`, and the catalogue target is
        `DEFAULT_DICTIONARY_CATALOG_TARGET_LANGUAGE` — a default, not the `as const` literal that made every
        shelf Japanese. So the ~2 GB of non-Japanese dictionary data has a route to the happy path.
      - **The declared capability set moved 5 -> 8 for generic targets, and two of them are now DERIVED
        rather than hardcoded.** `roster-targets.ts` declares term-lookup, segmentation, text-to-speech,
        subtitles, typing, plus `pronunciation: true`, `morphology: lookupRewrites.length > 0` and
        `reading-annotation` for zh/yue — with `featureSemantics.pronunciation: 'ipa'` where it used to say
        `'none'`, and pinyin/jyutping named as real phonetic scripts. `morphology` being computed from actual
        per-target rewrite rules is the important change: it can no longer be true on paper and empty in fact.
      - Landed alongside: IPA consumed for real (`src/reader/lookup/ipa-pronunciation.ts`,
        `popup/pronunciation.ts`), user-facing errors localised, the unconditional romaji→kana rewrite of
        every typed answer removed, and the three default-on Japanese-only behaviours gated.
      **Fixed in this session, each with the test that would have caught it (1.8.57):**
      - **b19 (OCR three-letter subtag truncation) FIXED.** `targetOcrLanguageHint` ended in `.slice(0, 2)`,
        so `fil` reached the OCR engines as `fi` — **Finnish**, a real Latin-script language Cloud Vision will
        weight toward, meaning a Tagalog learner's page was recognised as Finnish. `yue`/`grc` became
        `yu`/`gr`, codes no engine knows. Targets whose own subtag no engine accepts now declare an
        engine-recognised hint (`fil→tl`, `yue→zh`, `grc→el`, chosen by the SCRIPT the learner reads) and the
        hint is used verbatim. The trap found on the way: passing the hint back through `languageSubtag`
        undoes it, because Intl canonicalises the deprecated `tl` straight back to `fil`.
      - **b15 (one Japanese anime toggle deleted every other target's examples) FIXED.** Both call sites read
        `immersionKitEnabled` BEFORE asking whether ImmersionKit covers the target, so unticking a Japanese
        anime-subtitle source deleted Tatoeba — the only example source the other 31 targets have. Both now
        ask the target first. Japanese is byte-identical. The existing tests never caught it because both
        fixtures pin `immersionKitEnabled: true`.
      - **b14 (RTL) — the PREREQUISITE fixed, and the ticket re-measured much smaller than the audit implies.**
        `all: initial` plus `direction: ltr` on the reader root are author declarations, so they outranked the
        `dir` attribute `applyInterfaceLocaleToRoot` stamps: every RTL root was laid out LTR anyway, which is
        why the shipped RTL work had no visible effect. A higher-specificity rule keyed on Yomu's own root
        markers fixes that. **Re-measured: the reader stylesheet is already 81% logical** — 114 logical
        declarations (`margin-inline` 32, `padding-inline` 37, `text-align: start` 35, `inset-inline` 4,
        `border-inline` 6) against **26 physical** (`margin-left` 11, `border-left` 5, `margin-right` 4,
        `border-right` 3, `text-align: left` 3). So "RTL is absent" is wrong for the stylesheet; the real
        remainder is 26 declarations to convert, plus CONTENT direction (subtitles hardcode `lang="ja"`, no
        `dir=` anywhere in `src/reader/subtitles/`, no bidi isolation). Arabic and Farsi interface locales stay
        blocked until those land — unblocking on the CSS fix alone would ship a broken Arabic UI.

      **Verified 2026-07-31 by adversarial re-measurement, so the audit stops being trusted blind:**
      - **b17 (multi-language SRS deck forks cards) DOES NOT REPRODUCE — closed.** `newTabCardTarget`
        resolves from the CARD's own language, not ambient UI state, and `canonicalStudyCardIdentity` keys on
        expression|reading|partOfSpeech|language. A mine→grade round trip on a Spanish card gives exactly one
        deck entry with its review preserved. Residual with no learner-visible harm: `cardHighlightTargets`
        still asks `optionalJapaneseCardReading`, so a non-Japanese card highlights only its spelling.
      - **b10 (Japanese "Starter words" served to every target) DOES NOT REPRODUCE — closed.** A Spanish
        learner with no dictionary now gets an honest empty state (`renderEmpty` → `noCards`: "No cards."),
        not a `kanji-doodle(連)` drill. Residual: a dead Starter button and no gate test pinning it.
      - **b9 (recall-cloze deleted for 30 of 33 targets) PARTIALLY FIXED.** The `queryHasJapanese` gate is
        gone — `bc3c4b64c fix(study): scope multilingual review loops` replaced it with
        `newTabCardTarget(card).isLookupableText(sentence)` one day after the audit — and a Spanish
        integration test drives the real controller through `recall-cloze` with `prompt.lang === 'es'`. Three
        narrow residuals remain: `controller.ts:6921` still hardcodes `prompt.lang = 'ja'` for the WORD step
        on all 33 targets; there is no empty state when recall is absent (Listen/Speak have one); and
        `study-sentence-source.ts:29` drops an unpunctuated zh/yue sentence ending in a Han character.
      - **b8 (typed grading destroys Latin answers) PARTIALLY FIXED.** The kana rewrite is gone and
        regression-tested. Residual: a correct answer with a trailing full stop or a phone keyboard's curly
        apostrophe ("l’eau") still grades wrong, and `controller.ts:6653-6657` pins the first outcome, so the
        miss sticks to the card even after a correct retype.
      - **b20 (~24 UI strings hardcode "Japanese") REPRODUCED with zero refutations — FIXED 1.8.59.** The
        master switch read "Japanese text on webpages" with "Scan Japanese automatically" for every learner,
        while the probe behind it asks the ACTIVE target (`isTargetLanguageText` →
        `activeLearningTarget().isLookupableText`) — a lie, not honest scoping. A learner who picked Russian
        was told on their first settings screen that this product reads Japanese. Seven strings corrected in
        both English and Japanese: the master switch and its auto mode plus the empty-scan toast and the
        study-step help take a `{language}` token; "Popup Japanese font"/"weight" and
        "Text-to-speech (Kana reading)" lose the word entirely, because those settings style the WHOLE
        popover typeface and read whatever `card.reading` holds — mislabelled for Japanese learners too. The
        substitution lives in one place (`settings/settings-text.ts`), which is what makes it complete: first
        paint and the live language-switch relabel both resolve through it, so neither can drift or leak a
        raw token. The orphaned YouTube help line — after gating, the ru media panel was a legend plus a
        lying help sentence and nothing else — now leaves with the controls it describes.
      - **The `jp-only` DETACHED immersion controls b20 exposed — FIXED 1.8.60.** A48 made the filter ask the
        ACTIVE target whether text is its language, but its control stayed detached, so 31 of 32 targets could
        not reach a feature that already worked for them. Availability now follows the DATA behind each
        control rather than whether its label says Japanese: the filter, its notice and the site-language
        redirect (whose impl threads `targetLanguageOf`) are offered to every learner with target-named
        labels; the channel suggestions stay Japanese-only because their corpus really is 100 channels graded
        N5..N1. **Defaults do not move** — `jpOnlyOn` keeps it on for Japanese and off-unless-chosen
        elsewhere, so nothing changes for existing users; they can now simply choose it.
        **The trap this hit:** splitting one gated group into two silently broke the presence marker.
        `readYoutubeFormSettings` used one `youtubeImmersionSettingsPresent` for all three checkboxes, so once
        the channel checkbox was in its own detached group it read back as a deliberate uncheck and turned the
        setting off (caught by "does not overwrite detached Japanese settings while saving another target").
        Every separately-gated group needs its OWN marker.
        Also collapsed four copies of the "name the active target" computation into
        `app/target-language-name.ts` — they had appeared in the settings text factory, the page-scan toast,
        the puck menu and the YouTube notice within one change, and each copy is a chance to leak the token.

      **Still open:** `examples`, `mining`, `srs`, `grading`, `frequency`, `grammar`, `audio`,
      `character-lookup` and `handwriting` remain undeclared for generic targets — though the audit measured
      several of those as working anyway, so the matrix still understates reality and the flags are still not
      the thing to trust. **Wave 13 built the per-target exact-span scoreboard and ratchet:** ten annotated
      sentences per target measured against pinned published archives. The baseline is 1,458/1,732 (84.2%);
      29/33 targets meet the proposed 60% product bar, while `grc`, `yue`, `lo`, and `mn` remain below it.
      The release gate requires every recorded hit and miss to equal that baseline, so both regressions and
      unreviewed improvements fail; the 60% column remains informational, not a completeness claim.

- [ ] **A42 — MEASURED 2026-07-30: multilingual support is a Japanese system plus a 32-language reading
      tool with a Japanese skin, and the capability matrix describes neither.** Full audit, with every
      number reproducible, in `docs/dev/multilingual-parity-audit-2026-07-30.md` (22 adversarial agents,
      each finding challenged in both directions; several priors were REFUTED). The headline facts:
      - **Four of the 18 capability flags now have a production read site.** `character-lookup`
        gates Japanese character-card rendering and execution after Wave 13. `morphology`
        (`languages/morphology.ts:39`) still has zero callers, `ocr` (`languages/resolve.ts:42`) only
        scopes a settings migration, and `term-lookup` (`config/docs/product-claims.ts:34`) is
        build-time and licenses the homepage claim. Fourteen flags have no production read site, so
        most of the matrix still neither documents reality nor protects anyone from it. Roster is
        **33** targets, not 32; Burmese is absent entirely, which moots A37.4.
      - **PRIOR REFUTED:** the catalogue does NOT have zero non-CJK entries. It ships **1,637 published
        entries across 34 headword languages**, ~2.07 GB — all of it unreachable on the happy path
        because `DICTIONARY_CATALOG_TARGET_LANGUAGE = 'ja'` is an `as const` literal and all 32
        recommendation manifests are `<learner>-ja.json`. This is a routing bug, not a supply gap.
      - **There is no target choice at install at all:** `app/onboarding.ts:160` renders the target as a
        read-only `<output>` containing the literal `'日本語 — Japanese'`.
      - **Three Japanese-only features are default-ON for every target and actively hostile:** the YouTube
        filter hides the learner's own language as `non-japanese`; `preferJapaneseSiteLanguage` spoofs
        navigator language, Intl locale, timezone `Asia/Tokyo`, Date offset AND geolocation on every URL;
        TTS overrides a correct `utterance.lang` with a Japanese voice (22 of 33 locales have a real OS
        voice, so the voice filter is the defect, not the flag).
      - **W13 CORRECTION (2026-07-31):** the six quoted lookup ratios were constructed lemma-only probes,
        not measurements of the published WTY archives. The real ten-sentence harness at clean
        `fdf8682fc` measured th 49/61 (80.3%), ru 49/49 (100.0%), ar 40/48 (83.3%),
        ko 61/65 (93.8%), de 49/49 (100.0%), and es 50/50 (100.0%). Yomitan has
        GPL-3.0-or-later transform modules for only 11/32 non-Japanese roster targets and omits ru/th, so
        its transformer was not copied into this MIT distribution. Evidence and payload accounting:
        `docs/dev/w13-morphology-measurement-2026-07-31.md`.
      - **Some features work BETTER than declared:** Tatoeba examples for all 32 with the best degradation
        copy in the product; ICU segmentation and OCR for all 33; a genuinely language-agnostic SRS store
        and SM-2 scheduler; and zh/yue/ko get pinyin/jyutping ruby that was never declared — though
        unconfigurably, since the furigana block is detached as `jp-only`.
      - **470 non-Japanese IPA dictionaries ship, shelved under a UI heading reading "Pitch dictionaries",
        and no code path consumes IPA** (`collectPitchPatterns` requires `entry.mode === 'pitch'`).
      **The load-bearing false promise:** the shipped homepage h1 rotates "A complete system for learning"
      through all 33 languages with **no hedge anywhere on the page**, while the target picker
      (`settings/form.ts:255-261`) offers 33 plain options with no readiness signal — 20 lines below an
      interface-locale picker (`:204-208`) that does the right thing and whose own docblock states the
      rule: shown, named, and DISABLED with the reason, never silently answered in English.
      **The audit's 6-point gate for honestly claiming multilingual support, and the exact wording changes
      that scope the claim without engineering, are in §5 of the document.** Dispatched from it: w9 (the
      unconditional romaji→kana rewrite of every typed answer + missing `dir` on RTL inputs), w10 (the
      three hostile defaults), w11 (NFKC/case-folding/candidate ladder), w12 (target choice at onboarding
      + target-keyed dictionary routing + a readiness field the docs gate actually reads).

- [x] **A43 — CLOSED 2026-07-31: the gate now fails only on the direction that is actually dangerous.**
      The check demanded byte equality between the committed manifest and one computed fresh from git
      history. The window is "the latest 40 release tags", so every release shifted it, the committed file
      stopped matching, and `check:release` went red at its SECOND stage for everyone — it blocked two
      multilingual waves and was misdiagnosed once as "316 supported pinned assets are missing".
      Equality was stricter than the safety property. The manifest exists only as the retention source for
      **shallow** checkouts, where git history is unavailable, so the two directions are not symmetric:
      a path missing from the manifest could let a shallow CI prune an artifact a published userscript still
      pins by hash (breaks its `@require` for everyone on that version), while an extra path merely retains a
      little longer than needed — and that is exactly what a release leaves behind as a tag ages out.
      `retentionManifestShortfall()` now reports both directions; the gate fails on the missing side and
      merely notes the extra side, pointing at `npm run assets:prune` for whoever wants the disk back.
      Mutation-checked in both directions against the real manifest: adding a path history no longer pins
      exits 0 with "lists 1 path(s) history no longer pins", and removing one history still pins exits 1 with
      "is missing 1 artifact(s) that history still pins, so a shallow checkout could prune them". Two tests
      in `tests/reader/content-addressed-retention.test.ts` pin the asymmetry using a real fixture repo and a
      real shallow clone. ORIGINAL: `config/ci/content-addressed-retention.json` records a window derived from git history
      (latest 40 release tags, 40 recent hosted headers, plus the published store builds — v1.8.2 until
      2026-08-04, now the measured store floor v1.8.71/v1.8.72). Every
      release moves that window, so the committed file stops matching and
      `node scripts/prune-content-addressed-assets.mjs --check` fails the SECOND stage of `check:release`
      for everyone. Measured twice on 2026-07-31: it was already failing on a clean detached worktree at
      `origin/main` (fdf8682fc, last refreshed after v1.8.46 while main was 1.8.55), which blocked two
      multilingual waves from gating their own work until I ran `npm run assets:prune`; the same class of
      failure had blocked wave 6 earlier the same day, where it was misdiagnosed as "316 supported pinned
      assets are missing from current main".
      **Do:** either derive the window at run time so there is nothing to keep in sync, or have the release
      script refresh and commit it as part of the version bump. A gate that fails on every release trains
      people to run the fix-it command without reading it, which is exactly how a pinned companion gets
      deleted by reflex — and that breaks every published userscript naming it
      (memory `yomu-release-staging-add-u-trap`). Keep the missing-artifact guard that runs before any
      deletion; it is the only thing standing between a stale manifest and a broken release.

- [x] **A44 — CLOSED 2026-07-31: the lookup sheet collapsed to a 180px strip on tall screens.** Reported by
      Canna on iPad ("the popover is super tiny"); her screenshot showed only the drag handle, a sliver of
      the sentence and the five grade buttons, because the sheet grid is `auto minmax(0, 1fr) auto` and the
      card body is the only row that can give. Two defects, both needed:
      1. The floor read `Math.min(viewportHeight, MIN_SHEET_HEIGHT_PX, Math.max(140, 32%))`, and the 180px
         constant inside that `Math.min` silently deleted the 32% term beside it. Measured: iPad 1024 gave a
         180px floor where 32% is 328px; iPad Pro 1180 gave 180px against 378px.
      2. The persisted height ratio could be poisoned permanently — a height clamped to that wrong floor
         while the previous viewport was tall yields a tiny ratio, and a drag stores it, so every later
         session opened tiny with no way back except clearing storage. A sub-floor ratio is now neither
         stored nor honoured, which self-heals an install that already has one.
      **NOT a recent regression**, which was the first suspicion: `git log -S` puts the `Math.min` mistake in
      `c6d610462` (Release 0.6.27, 2026-06-06) — the 32% term was added alongside the 180 instead of
      replacing it. What changed recently is only what drove the sheet onto that floor. The nearer suspect
      was cleared too: wave 5's a11y commit is the most recent edit to `popup/shell.ts`, but no CSS keys off
      `role` or `aria-modal`, so removing them from hover popovers cannot affect sizing.
      Mutation-checked: with both fixes reverted the new tests report `expected 180 to be 328` and
      `expected '180px' to be '717px'` — that second figure is the report itself.
      **Still open next door:** memory `yomu-ipad-sheet-doubling-open` records the OPPOSITE symptom at
      1.6.248 (sheet ~2x the host) in the same autosizing code, never closed. Wave 17 is checking it while
      it has a tablet viewport up.

- [x] **A45 — CLOSED 2026-07-31: the academy suite was under-budgeted, not flaky. Fixed at the suite, not
      per file.** The symptom was a rotating set of `Test timed out in 5000ms` failures that changed which
      files they hit run to run, depending on which forks got starved — which reads like flakiness. It is an
      integration suite driving whole world and lesson flows through jsdom, and Vitest's 5,000 ms per-test
      default is simply too small for that. Measured alone on an idle machine:
      `production-workflow-lifecycle.test.ts` **37,492 ms for 10 tests** (so it already exceeded the default
      unloaded), `n3-mock-listening-route-integration` **1,978 ms**, `world-class-route.test.ts` **902 ms**
      (fast, and only ever failed under contention).
      Set `testTimeout: 30_000` once in `config/vite/academy.config.ts`, with the measurements in a comment
      so the number is justified and the next person raises it only with new evidence. Started with a
      per-file 20,000 ms override on one test and removed it — a per-file value would only have re-lowered
      the suite default, and one file at a time is whack-a-mole against a suite-wide budget problem.
      **Measured before → after over the full 350-file run:** timeouts **7 → 2**, failing files **19 → 18**,
      failing tests **25 → 24**. The two remaining timeouts are both `sprite-performance-contract.test.ts`,
      which is a pre-existing red that also fails when run alone and still exceeds 30 s — a genuine failure,
      not starvation, and left in the known-red set rather than papered over with a bigger number.
      Deliberately NOT added to `MOCK_ISOLATED_TESTS`: that list exists for `vi.mock` registration leakage
      and a conformance test polices it, so parking timeout cases there would make the list lie.

- [x] **A51 — USER BUG REPORTS, GitHub, mirrormc (Discord: moonbeam), 2026-07-31. Two fixed, one dispatched.**
      Firefox + Tampermonkey userscript, 1.8.56/1.8.57.
      - **[x] #37 "No Appearance option for hiding word colors for Ignored, Blacklisted, and Suspended words"
        — FIXED.** Not a missing checkbox: `wordColorHiddenStateGroups` was typed `FuriganaStateGroup[]`,
        borrowing the furigana taxonomy, so the ignored family was structurally outside the domain in five
        consumers plus the CSS — and the normalizer validated against the same five, so a stored `'ignored'`
        would have been dropped on load even if a control had existed. ONE switch, since those three states
        resolve to one colour behind one picker, reusing that picker's own label. Six independent copies of
        the group list collapsed to one declaration in `app/constants.ts`; zero hardcoded copies remain.
      - **[x] #36 "Hover Lookup hotkey changes can get stuck" — FIXED, and it was a whole bug CLASS.** The
        machinery reads "equals the default" as "never set", and a cleared hotkey IS the default. Two paths
        refilled it: the legacy `popupActivationMode:'modifier'` backfill tested the emptiness of its own
        RESULT rather than the absence of a stored choice (so it re-minted `'Shift'` inside every save AND
        load), and the recovery folds copy a stale donor's value into any field matching its default — every
        visit to yomureader.com mirrors the whole blob into that origin's localStorage, making a permanent
        donor that never learns the cleared value and, because the GM store is shared, pushes it to every
        site. **Blast radius was never shortcuts:** the folds iterate every setting, so any field reset to
        its default could come back — a cleared API key, a toggle turned back off, a colour put back. Only 15
        allowlisted keys were protected, a list grown by hand one bug at a time.
        **Two dead ends worth recording, both caught by existing tests:** recovery cannot switch to "is this
        key present?" because Yomu persists the WHOLE settings object, so every stored blob has every key
        (that attempt disables legacy recovery entirely — the appearance test catches it); and
        `persistSettings` cannot infer intent by diffing against storage, because a save may carry a stale
        whole-object snapshot and treating its differences as intent clobbers another context's explicit
        choice (two cross-site tests catch that). Intent has to be declared by the surface that made the
        edit. The dialog already diffed its form read-back; that diff was just narrowed to those 15 keys and
        now covers all of them.
      - **[ ] #38 "Factory Reset does not actually factory reset" — root cause traced, DISPATCHED.**
        `asyncGmListValues` resolves `GM_listValues` as a **globalThis property** while every sibling
        accessor uses the **ambient binding**; in a Firefox/Tampermonkey sandbox GM_* are ambient but not
        globalThis properties, so enumeration silently returns nothing, `addGmStorageKeys` returns early
        fail-open, and the sweep never reaches any prefix family (`yomu:srs-local:v2:*` — the whole local SRS
        deck — `yomu-mining-context:*`, `yomu:reader-css-cache:v2:*`, `yomu:lease:*`). Separately the
        **dictionary archive cache** (`yomu-dictionary-archives` + `yomu-dictionary-archive:` prefix, whole
        ZIP bytes in GM storage) is not in the manifest at all, and reset's `deleteDatabase()` drops only the
        IndexedDB — so `scheduleLocalDictionaryReplication()` re-imports from the surviving ZIPs on the next
        boot. That is literally the reported "reimported all of the previous dictionaries". Third finding:
        suppression is an in-memory boolean, so there is no durable reset epoch. Full evidence in
        `scratchpad/i38-diagnosis.txt`; brief in `scratchpad/codex-i38-factory-reset.md`.
      - **Owner asked separately:** the canonical settings storage key is still `jpdb-popup-reader-settings`,
        which is what sent this reporter hunting through storage in the first place. The export FILE already
        writes `yomu-reader-settings`, and the legacy-read chain (`LEGACY_SETTINGS_STORAGE_KEYS`) makes a
        rename mechanical. The dictionary IndexedDB `jpdb-popup-reader-yomitan` is the hard part — it holds
        gigabytes, so it needs a migration, not a rename. Do it as its own change: landing a settings-key
        migration beside the reset fixes would make diagnosing either one much harder.

- [ ] **A53 — BLOCKING: `npm run check` is red for EVERY session. The multilingual parity baseline was
      recorded on the wrong Node, and all 33 contract hashes are stale.** Wave 13 shipped
      `config/quality/multilingual-lookup-baseline.json` with `"node": "v24.16.0"`, `"icu": "78.3"` — its
      own measurement note says the authoritative run used Node 24.16.0. **This repository requires Node
      22.22.3** (22.14 fails three WebCrypto tests), so the new `multilingual-parity-ratchet` gate stage
      fails on the required runtime, 1.6s into every `npm run check`. Same shape as the hygiene-gate trap:
      one tracked file hard-fails the gate for everyone.
      `npm run quality:multilingual-parity` emits **68 signals**: 2 runtime mismatches plus
      **33 targets × 2 (baseline + evidence) stale `lookup contract SHA-256`** — i.e. every single target.
      The contract changed after the baseline was recorded, almost certainly by 1.8.62's own lookup
      refactor, so the wave invalidated its own hashes mid-stream.
      **Do NOT just refresh the hashes.** The contract changing is precisely the reason the coverage
      numbers may no longer hold; rewriting the hashes without re-measuring would assert coverage nobody
      verified — the provenance-is-not-quality trap. The remedy is a real re-record on Node 22.22.3 via
      `scripts/manual/multilingual-parity.ts --write-baseline … --write-evidence …`, which downloads the
      real archives for all 33 targets. Deterministic algorithm, so the coverage percentages should
      reproduce exactly; if any of them MOVE, that is a finding about the 1.8.62 refactor and more
      important than the gate.
      **Worth keeping:** the baseline itself is the per-target annotation scoreboard the audit asked for
      and A42 recorded as missing. It covers all 33 targets — ja 96.3%, en/ru/de/es/da/nl/la/pl/sv 100%,
      down to yue 0%, mn 51.6%, grc 54%, lo 59.7%, km 60%, vi 64%. That is the number that has to go up.
      Also still red and unrelated: `tests/reader/yomu-support-worker.test.ts` "quarantines historical test
      Checkout rows from donation progress" fails on origin/main without any local change (verified by
      stashing), so it came in with the donation work.

- [ ] **A52 — GitHub #39, mirrormc: recommended dictionaries fail to install (Firefox + Tampermonkey
      1.8.58). PARTIALLY FIXED; the root cause needs ONE answer from the reporter.**
      **What is proven and now fixed:**
      - **The manual-ZIP-import recovery was unreachable dead code.**
        `shouldPromptManualDictionaryDownload` substring-matched `error.message` against 15 hints
        ('blocked in this browser', 'request bridge', 'ブロック', …). None of the five production strings
        contains any of them — the copy reads 'Download blocked. Import the ZIP.' and 'Download needs
        bridge; else import ZIP.'. The matcher therefore ALWAYS returned false, so
        `dictionaryDownloadBlocked` + `dictionaryManualDownloadHint` — the copy written precisely to tell
        a learner "your manager refused this, import the ZIP by hand" — could never reach anyone. It now
        branches on the stable `yomuUiCopyKey`. **Same bug class as A51/#36 and A48**: matching rendered,
        localizable, width-shortened COPY as a proxy for a stable identity.
        Its test was complicit: it rejected with `new Error('Dictionary download is blocked in this
        browser.')`, a sentence no production code has ever produced, so it passed against a fiction. It
        now rejects with the real error, and fails if the matcher goes back to prose.
      - **The settings funnel destroyed the diagnosis.** Every failure was re-wrapped as
        `dictionaryDownloadFailed`, collapsing a non-2xx, a non-ZIP payload, a timeout, a blocked
        cross-origin request, an integrity mismatch and an IndexedDB fault into one sentence — which is
        why #39 arrived with nothing to act on. Every download exit now throws `userFacingError(<key>)`
        with an English diagnostic, and the funnel re-throws an error that already knows what it is.
      **TWO REGRESSIONS WE SHIPPED 2026-07-31, both verified on the shipped artifacts:**
      - **1.8.61 put the factory-reset epoch fence INSIDE the IndexedDB batch-write loop**
        (`yomitan/index.ts`, first statement of the `for` over `STORE_WRITE_BATCH_SIZE`). A reset landing
        mid-import threw between two writes and left a half-written dictionary with no rollback. **Fixed:**
        checked once before the first write; the import entry points already carry it.
      - **1.8.62's runtime companion contains NO storage implementation and fails closed.** Measured on
        `docs/public/greasyfork/yomu-runtime.user.js`: `GM_getValue` and `GM_setValue` both 4 → **0**,
        replaced by a lazy delegate on `Symbol.for('yomu.storage-runtime-api.v1')` that throws "The
        authoritative Yomu storage runtime is not installed." The whole dictionary subsystem lives in that
        companion. Nominal boot is fine (core registers the slot), but any boot-order or realm mishap is
        now TOTAL loss of dictionary install — on the exact platform this reporter uses. **NOT fixed
        here**: it needs a real two-realm registration test, because the current jsdom single-realm test
        plus source greps cannot fail when this breaks.
      **What is NOT established, and the one question that settles it:** two adjacent sections render the
      identical heading "Recommended Japanese dictionaries" — 8 catalogue-seed cards (mirror-hosted, all
      integrity-checked) and 11 CURATED cards under a hard-coded English literal
      (`settings/form.ts`) pulling from github.com, raw.githubusercontent.com, huggingface.co and
      api.jiten.moe with **no integrity check at all**. The verbatim heading in the report belongs to the
      curated shelf. My earlier "the hosting is healthy, so it is client-side" covered 5 of those 19
      buttons — an overreach. **Ask: "which rows failed — paste the names or a screenshot?"** The row
      names are unmistakable between the two shelves, and a free second signal comes from the same
      screenshot: does the row ever show a download percentage before failing? No percentage = failure at
      or before the first byte; percentage then failure only on large rows = transport/timeout, which
      cannot explain the 0.4 MB grammar row.
      Also confirmed: **updating 1.8.58 → 1.8.62 does NOT fix it.** `git diff` over
      `yomitan/file-utils.ts`, `dictionaries/recommended.ts` and `settings/file-io.ts` between the two is
      EMPTY, and zero of 1,637 catalogue entries changed distribution. Do not close #39 as fixed by an
      update. First suspect on the curated shelf:
      `raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip` — an archived
      repository.

- [ ] **A49 — Anki auto-mapping corrupts a non-Japanese learner's own deck, and the fix needs the NAME
      signal, not just the script one.** Measured on main 2026-07-31 in `src/reader/anki/field-mapping.ts`.
      `ANKI_TEXT_ROLE_SCORERS` (`:349-368`) keys every text role on `hasJapanese`:
      - `expression` and `sentence` return **0 unless `hasJapanese`**, and `reading` does too, so for any
        non-Japanese target three of the four text roles are unfillable.
      - `meaning` scores only when **`!hasJapanese`** and rewards `hasLatin` (`54 + (length > 8 ? 6 : 0)`).
        For a Spanish deck the Spanish word, its English meaning AND the example sentence are all Latin and
        all non-Japanese, so they compete for the same slot and the longest wins — which is the sentence.
        That is the reported corruption: the sentence lands in the meaning field of the learner's own deck.
      **The seams to use:** target script via the active module's `isLookupableText`, and `reading` only for
      targets that actually have a phonetic form (`featureSemantics.readingAnnotation` — ja kana, zh pinyin,
      yue jyutping; most targets have none, and a role that cannot exist should be absent, not empty).
      **The part a script test cannot solve, and why this is not a one-line fix:** for a Latin-script target
      with a Latin-script definition language (es→en, de→en, fr→en — most of the roster) no script check can
      tell the target word from its English meaning. The name signal has to win there. The mapper already has
      one — `ANKI_FIELD_ROLE_CANDIDATES` (`:66`) plus `shouldPreferContentSuggestion` (`:149`) — but its lists
      are Japanese-flavoured too: `ANKI_GENERIC_EXPRESSION_FIELD_NAMES` is literally
      `'Expression|Front|Japanese|Kanji|Katakana'`. So: extend the name lists (including each target's own
      English name and endonym), and make the name signal outrank content for same-script pairs.
      Verify against a real generic deck per script class: same-script (es→en), different-script (ru→en),
      and Japanese unchanged.

- [ ] **A50 — every mined card for a space-separated language carries a fragment, and Latin sentences are
      never split on a full stop.** Measured on main 2026-07-31 in `src/reader/dom/reader-word.ts`. Two
      defects compound, and the audit (b11) only names the first:
      1. **Every space is treated as a sentence boundary.** `isStrongWhitespaceBoundary` (`:403-409`) returns
         true for ANY whitespace whose 24 characters either side are target-language text. In Japanese, which
         does not space its words, a space inside Japanese text really is a break, so this is sound. In
         Spanish, German or Russian **every single space between two words qualifies**, so
         `softBoundaryStart`/`softBoundaryEnd` clamp to the spaces either side of the clicked word and the
         mined "sentence" is 1–2 words. It fires whenever the sentence exceeds 48 characters
         (`shouldUseSoftSentenceTrim`), which is most sentences.
      2. **The sentence terminator set has no plain full stop.** `sentenceStartIndex`/`sentenceEndIndex`
         (`:345-356`) match `[。！？!?]` — `。`, `！`, `？`, `!`, `?` — and **not `.`**. So for a Latin-script
         target there is no boundary at the end of an ordinary sentence at all; the "sentence" runs to the
         start or end of the whole text node and then gets clamped by length. Presumably `.` was left out
         because of abbreviations and URLs in Japanese text, which is a real concern and the reason this needs
         per-target data rather than one more character in the character class.
      **Both need the boundary model to come from the target**, next to segmentation: whether words are
      space-separated (so whitespace is NOT a boundary) and which characters end a sentence (`.` for Latin,
      `。` for CJK, `؟` for Arabic, `।` for Devanagari, `;` for Greek). Japanese behaviour must not move —
      diff the mined sentence over a fixture corpus before and after. Verify with a real mined card per
      script class, not a unit test alone: the failure is visible in the Anki note, which is where A49's
      corruption also lands.

- [ ] **A46 — the reader gate produces false reds when it shares a machine with parallel agent sessions.**
      Measured 2026-07-31, twice in a row: `check:release` failed on `test:ci` with
      `Test timed out in 30000ms` in `dictionary-catalog-mirror-coverage.test.ts` (and once also
      `scan-reveal-continuation.test.ts`) while six, then two, codex sessions were running on the same box.
      Both files pass in isolation — 48/48 — and the commit under test only added a line-counting script, a
      baseline JSON and an npm script, so it could not have caused it.
      The mechanism is CPU starvation, not a repo defect: the slow test's BODY measures **4.80 s** on a quiet
      machine (the file's 31 s is dominated by `setup 17.80 s`), so a 30 s budget is generous until roughly
      6x contention eats it. `scripts/run-ci-tests.mjs` already tries to leave headroom — "Leave two cores
      for whatever else check runs alongside" — but it cannot see agent sessions outside the process tree.
      **Do NOT fix this by raising timeouts.** The measurement does not justify it, and inflating budgets to
      absorb unrelated load is how a suite loses the ability to detect a real hang. Options worth weighing:
      have the gate detect competing load and reduce `--maxWorkers` accordingly; give the runner an explicit
      concurrency budget an orchestrator can set; or simply treat "gate while N agents run" as unsupported
      and serialise. Until then the operational rule is: **gate on a quiet machine, and never conclude a red
      is real without re-running the named files in isolation first.**
      **ESCALATED same day — it is not only per-test, it kills the whole runner.** A later gate with three
      waves running failed `test:ci` with **exit 124** — the runner's own 25-minute wall clock — after
      **2,582 s**, with **zero** test failures in the log. Individual files had stretched 3-6x
      (`youtube-filter` 16,771 ms against ~4,900 ms quiet; `ocr-reader-raster-surfaces` 30,790 ms), and
      `typecheck` alone took 488 s against its usual 33 s. So under enough contention the gate cannot report
      anything at all, pass or fail, which is worse than a flake: it looks like a failure and carries no
      information. `YOMU_CI_TEST_TIMEOUT_MS` exists and does let the run complete, but reaching for it is a
      workaround, not the fix — the 25-minute default is correct for a quiet machine and the real problem is
      that nothing reconciles the gate's 8 workers with N agent sessions on the same cores.
      **ROOT CAUSE CONFIRMED — it is memory, not just CPU.** With the wall clock raised and workers at 4, the
      suite completed and reported **zero test failures** (6,169 passed in the reuse pass, 419 in the isolated
      pass) yet still exited 1, because one file never reported at all:
      `tests/reader/multilingual-onboarding-settings.test.ts` and its 8 tests vanished when a worker died with
      **`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`**. The file passes
      8/8 alone. Load average was 36 on 10 cores with three agent sessions gating in their own worktrees.
      So the failure mode is V8 heap exhaustion in a jsdom fork under memory pressure — precisely what
      `defaultRegularMaxWorkers`'s own comment predicts ("oversubscribing memory-heavy jsdom forks, which is
      what pushes a slow CI runner into thrash"). A lost worker is indistinguishable from a failure at the
      exit code, which is the dangerous part: nothing in the summary says "a worker died", so the honest
      signal has to be read out of the log. Worth making the runner detect a file that was asked for and
      never reported, and say THAT rather than exiting 1 silently.

- [ ] **A47 — STANDING OWNER RULE (2026-07-31): anything that exists for English or Japanese must be built
      out for every language.** Verbatim: *"remember full support for every language not just japanese —
      anything that is for english you must build out for every lang"*, and *"first class grammar support for
      every language like how we have for jp rn"*. This is not a ticket that closes when one feature ships;
      it is the standard every feature is now measured against, and A42's capability matrix is the scoreboard.
      What that rule implies, from the 18 declared capabilities:
      - **grammar** — Japanese has 307 curated rules with JLPT levels, detection patterns and guide URLs
        (`src/reader/study/grammar-data.ts`); every other target shows a "Finding grammar…" card that then
        vanishes. Dispatched as wave 19: architecture per-target first, honest degradation second, curated
        data third — explicitly NOT machine-generated patterns, because a wrong grammar match teaches a
        learner something false and that is worse than no match.
      - **frequency** — 30 of 32 targets have no frequency dictionary, so no pill and no explanation.
      - **audio / character-lookup / handwriting / examples / mining / srs / grading** — still undeclared for
        generic targets, though the audit measured several as working anyway.
      **The lesson from YouGlish, which applies to every one of these:** it was removed from all 32 targets
      because a sweep found "a bot or quota page" everywhere. youglish.com returns HTTP 200 with a page
      titled "Bot detection!" to any automated client, so that sweep — and the earlier one that called the
      links verified — were both reading the same page. Neither "works" nor "broken" had been measured. The
      fix was not to give up but to get the authoritative answer from the service itself: its own footer
      enumerates its languages and its own links emit the URL shape. **A status code is not verification, and
      "we could not verify it" is not the same as "it does not work" — do not delete a feature on the
      strength of a failed measurement.** YouGlish now ships for the 20 targets it covers.

- [x] **A48 — the YouTube filter hid the learner's own language. FIXED 1.8.57, `81e4a7b47`.** Found while
      auditing A11's "a default that requires explanation is not a default" principle against the other smart
      defaults; two of the three hostile Japanese-only defaults were already fixed, this one was not.
      `youtube-filter-scan.ts` classified purely as `'japanese' | 'non-japanese'`, so a learner studying
      Russian had their Russian videos hidden as `non-japanese`. `jpOnlyOn` had papered over the blast radius
      by keeping the filter dormant until explicitly chosen — which made the DEFAULT safe without making the
      filter right, and the test that encoded that stopgap ("leaves Russian videos visible until Japanese
      YouTube filtering is explicitly chosen") is now the test that proves the fix.
      **What shipped:** `classifyYouTubeFilterCandidates` takes an injected `matchesTargetLanguage`, defaulting
      to `isProbablyJapaneseYouTubeText` so the Japanese path is byte-identical; `youTubeTargetLanguageDetector`
      builds it from the active target's `isLookupableText`. A target with no module falls back to the Japanese
      detector rather than to a predicate matching nothing — matching nothing would hide the ENTIRE feed, a
      far worse failure than filtering for the wrong language.
      **The channel shelf now follows its data, not its setting.** Those 100 recommendations are Japanese
      channels graded N5..N1 with no language field, and were offered to learners of any target once the
      setting was on. Recommending the wrong language is worse than recommending nothing.
      **Residual, tested rather than hidden (`youtube-filter.test.ts`, "records that per-target UI chrome is
      not yet stripped"):** the metadata stripper only knows Japanese chrome — 「7.2万回視聴・4時間前」and
      視聴する — so on a target-locale YouTube a card whose only target-language text is a view count reads as
      the target language. Narrower than it looks: `resolveTitleForFiltering` normally decides on the clean
      oEmbed title, so this only reaches the scraped-fallback path, and it under-filters (one extra foreign
      video stays visible) where the old behaviour hid the learner's whole language. Per-target chrome
      patterns, or per-target channel lists, would close both remainders.

#### Dropped in triage

| Raw finding | Why it is not in A35 |
|---|---|
| `fallow` CI job red on main, `fallow:dead-code` exits 1 with 14 issues | **U63** already records `npm run fallow:dead-code` exiting non-zero. Only the `.fallowrc` config rot survives, in A35.24. |
| Live dictionary manifest reports `readiness: "ready"` with no blockers for 24 learner languages | **U62** already says `languages.json` claims all 32 are `readiness:"ready", blockers:[]` and "that is false, do not trust it". The docs claim on the definition axis survives as A35.6. |
| 90 `eslint-disable` comments in a repo with no ESLint | Recount gives 35 across `src`, `scripts`, `workers`, `tests`, not 90, and with no linter to install the ask is a preference, not work. |
| Academy `tests/academy` not run in CI (reported twice, two sweeps) | Merged into **A35.16**. |
| `workers/**` typechecked only by accident; `video/` in no gate | Merged into **A35.16**. |
| `npm run qa:live` does not exist (AGENTS.md:28) | Merged into **A35.24**. |
| `.fallowrc.jsonc` suppression rot | Merged into **A35.24**. |
| Browsers get gzip not br/zstd; Academy `app.js` is 16.7 MB unminified | Merged into **A35.20**. |
| 469 MB of PNG art; 378.7 MB FLAC precache | Merged into **A35.20**. |
| `/favicon.ico` 404; sitemap omissions; canonical mismatch; `/academy/` has no OG; `/pdf-reader/` title | Merged into **A35.26**. |
| yomu-support `/progress` runs two D1 aggregates per banner impression | Merged into **A35.19**. |

### A21 — USER FEEDBACK, Discord, 25–28 July 2026 (verbatim reports → tickets)

Reporters: **blurvy** (new user, Edge Canary + userscript, Android, MangaFire, YouTube), **noteliana**
(jiten power user), **coffeentacos** (post-college learner). Three of these contradict entries that
memory records as FIXED — check the reporter's version before assuming a regression.

- [x] **A21.1 — NOT REPRODUCIBLE on the current userscript.** blurvy reported the defect at 03:58 on
      28/07; 1.8.22 landed later at 10:26. This was the report that prompted the fix, not a regression
      after it. Greasy Fork 1.8.25 has the same executable body as the checked build, and all four
      focused visibility-choice tests pass, including disable, save and automatic track discovery.
      Shipped to both stores (AMO 1.8.72 / Chrome 1.8.71, verified 2026-08-04).
- [ ] **A21.2 — Words carrying furigana do not look up.** blurvy, 27/07 23:26–23:27: *"I think the
      problem is the words that have furigana"* / *"I turned off annotations and all lookups are
      working."* That isolates it cleanly: the ruby markup Yomu itself adds blocks the lookup path. High
      severity — it breaks the core gesture on exactly the words a learner most needs.
- [ ] **A21.3 — Tapping outside the popup does not close it.** blurvy, 27/07 23:34: the popup stays and
      the text stays selected. Basic dismissal contract, and it strands the selection too.
- [x] **A21.4 — NOT REPRODUCIBLE on the current userscript.** blurvy reported it at 07:42–07:51 on
      27/07; the fix landed later at 09:40. The Chromium subtitle E2E held the selected 60px through
      short and long cues, a landscape resize, a tab return and portrait restoration. All 24 focused
      subtitle styling tests pass. Shipped to both stores (AMO 1.8.72 / Chrome 1.8.71, verified 2026-08-04).
- [x] **A21.5 — NOT REPRODUCIBLE after the shipped MangaFire fix.** blurvy reported it at 09:18 and
      10:16 on 27/07; the fix landed later at 17:15. The release was proved on real MangaFire with
      Yomitan 26.6.15.0: Yomu owned taps on its OCR text, while disabling Yomu lookup restored native
      text for Yomitan. The current 1.8.25 OCR ownership suite passes all 32 tests, including 秘密.
      Shipped to both stores (AMO 1.8.72 / Chrome 1.8.71, verified 2026-08-04).
- [ ] **A21.6 — Userscript does not boot on YouTube in Edge Canary.** blurvy, 27/07 07:15: no puck
      bottom-right; then *"I loaded yt a couple mins later and the popup showed up"* after disable /
      re-enable did nothing. A boot that succeeds only after minutes is a race, not a fix.
- [x] **A21.7 — NOT REPRODUCIBLE on the current userscript.** blurvy reported it at 00:12 on 28/07;
      the fix landed later at 10:58. The real Chromium register smoke measured 100% vertical overlap
      and 0px centre offset for a burned-in subtitle in YouTube's bottom band; the middle and
      frame-edge controls also passed. The reporter's follow-up said it was not happening on YouTube.
      Shipped to both stores (AMO 1.8.72 / Chrome 1.8.71, verified 2026-08-04).
- [ ] **A21.8 — Local/faster OCR on Android.** blurvy, 28/07 00:09 wants something faster than Google
      Lens; owner's read is that Lens is currently the fastest. Deliverable is a measured comparison, not
      a guess: candidate on-device engines, latency, and whether the local-service provider path already
      covers it.
- [ ] **A21.9 — Sentence audio mining.** blurvy, 28/07 03:46: *"Is it possible to add sentence audio
      mining? That's all I'm missing in my life."* A separate Claude session ("Plan sentence audio mining
      feature") is already on this — coordinate, do not duplicate.
- [ ] **A21.10 — Study is too busy; jiten's review loop is the bar.** noteliana, 25/07 16:36–16:38:
      jiten is *"compact, and the reviews are crazy fast especially on laptop"*; owner's own read is
      *"there is too much going on rn"*. This is the same signal as `U39` (every Study complaint is
      density) and it is the reason the Study plan's slice 5 ships the nav and fold alone.
- [ ] **A21.11 — Let a learner switch off card types they do not want.** noteliana: *"I don't care about
      kanji cards even though we can turn it off"* — so the control exists but is not discoverable
      enough to count. Surface it in the review setup, not deep in settings.
- [ ] **A21.12 — Explain the 5-point scale against jiten's 4.** noteliana: *"yomu uses a five point
      scale when jiten has a 4 so I'm unsure how that will affect things."* Document the mapping and show
      it where a jiten user grades, not only in the FAQ.
- [x] **A21.13 — NOT REPRODUCIBLE on the current userscript.** noteliana reported it at 16:27 on
      25/07; automatic provider discovery landed later at 21:01. From a normal review screen the
      controls are two presses away: **Connect**, then **Media**. Provider checkboxes appear without a
      detect button after an ordinary lookup or the Media panel's one background check. All 17 focused
      provider-discovery and settings-dialog tests pass. Shipped to both stores
      (AMO 1.8.72 / Chrome 1.8.71, verified 2026-08-04).
- [ ] **A21.14 — Use your own local audio files.** noteliana runs downloaded audio via AnkiConnect on
      phone and wants it inside the review loop. Ties to the existing Local Audio surface.
- [ ] **A21.15 — Offline SRS app for iPhone/iPad and Android.** Owner's stated intent: React Native, one
      experience across website, Android and iOS, fully offline, *"just nice to use"*. Feeds the Study +
      mobile plan; note the plan's finding that the Study page is ALREADY an installable PWA (A16), which
      may satisfy much of this without a native build.
- [x] **A21.16 — Positioning evidence. SATISFIED 2026-08-03; keep the quotes for A14.**
      coffeentacos: *"the amount of things this lets you do that you'd need multiple other things has
      been really nice"* and *"Reduced friction makes it so much easier to focus on learning"*;
      noteliana: *"it's all about reducing friction"*.

      The homepage already makes both claims, and in the owner's own voice rather than as bolted-on
      marketing. The letter reads *"The tools were scattered and each one wanted a different setup, so
      I built the one I wanted instead: read, watch, press a word, keep it, come back to it. Nothing to
      wire together."* — that is one-tool-instead-of-five in the first clause and friction reduction in
      the last four words. The h1 *"A complete system for learning 日本語."* carries the same claim.

      Deliberately NOT adding more copy for this. The owner's instructions run the other way — *"please
      remove this text completely — you dont need to explain everything"* and A9's "less is more" — so
      restating a claim the page already makes would be a regression, not a win. The quotes stay
      recorded because A14 (product clarity) should still be BUILT on them; that is a different ask
      from putting them on the homepage.

### A22 — Academy takeover handoff (session `5dc579a6`) — what it changes for THIS thread

Full handoff lives with that session; plan of record is `~/Desktop/yomu-academy-goldenpath/GOLDEN-PATH.md`,
canonical Academy tickets are `docs/academy/BACKLOG.md` (127 tickets, 20 done). Only the parts that bind
this thread are recorded here.

- [ ] **A22.1 — The R2 audit is a SHARED job and it is half-done.** Measured there: `yomu-audio` 7.08 GB,
      **`yomu-dictionaries` 6.55 GB**, `yomu-academy-archive` 1.69 GB, `asmr-semantic-index` 0.10 GB with
      **no binding in this repo** (confirm before touching — likely another project). Total R2 cost is
      about **$0.08/month**, so cleanup is hygiene, not spend. Open threads that are mine: local
      `mirror-objects.v1.json` records **167 objects / 6.13 GB** against a bucket reporting 6.55 GB, so
      **~0.42 GB is unaccounted**; the live catalog at `dictionaries.yomureader.com/v1/catalog.json`
      serves **186 entries**; `wrangler r2 object` has **no `list`** subcommand, so enumeration needs a
      temporary Worker calling `env.BUCKET.list()` or S3 keys. Also carry their correction: earlier
      parsing printed `targetLanguage: '?'` per entry — it is a **top-level** catalog key; group by
      `headwordLanguages` instead. Cross-check against the required shelf in memory
      `yomu-recommended-dictionary-set`, whose known gaps are Kanjium pitch and WTY JA-JA offered but not
      hosted, 13 dead Drive source URLs, and `languages.json` falsely claiming all 32 ready.
- [x] **A22.2 — CORRECTED 2026-07-28 (codex): the payment bridge existed; automatic provider delivery did not.**
      Code and history review found the signed webhook bridge, deterministic paid invites, and
      owner/admin invite endpoints already in place. Ko-fi and Patreon could mint an entitlement and
      code, but neither path sent that code to the payer. The fix sends the code to the verified
      provider email, keeps only opaque delivery state in Academy D1, and raises an alert for
      missing or stalled delivery. A missing provider email enters manual recovery.
- [ ] **A22.3 — `U42`: the Study and Academy account redesign is ONE job**, per the unmerged
      `backlog-reconcile-20260727`. It sits across both threads' territory; whoever takes it announces it.
      (A5's 401 was resolved in 1.8.24; this seam is no longer blocked on it.)
- [x] **A22.4 — Licensing is CLOSED. Never raise it again.** Owner, 2026-07-28: full permission granted,
      licences and approvals held for all 24 dictionaries, the Persona OST, all downloaded study resources,
      and anything downloaded from here. Every "waiting on a licence / approval / redistribution review"
      gate is removed from this plan. The two-tier `INTEGRATION_READY` /
      `PUBLIC_DISTRIBUTION_VERIFIED` model is no longer a gate on shipping.
- [ ] **A22.5 — Cast likeness pages stay LOCAL (`file://`).** They contain real classmates' likenesses
      and private class reference photos. Never publish them as an Artifact or anything network-reachable.
      Cast are first-name only; no surnames, employers, relationships or sensitive traits ever ship.

### A10 — COORDINATION with the parallel "Yomu Academy" thread (session `5dc579a6`)

That thread has taken over **full Academy production** (story, art, engine, learning content, music,
payments via Stripe/Ko-fi/Patreon, going live). It works in the same repo and the same cloud account, so
these are the shared seams. **Read this before touching anything in the left column.**

| Shared seam | Owner | Contract |
|---|---|---|
| `src/academy/**`, Academy content/art/story/engine | **Academy thread** | This thread does not edit it. |
| `src/reader/srs/**` (local deck, card identity) | **This thread** | Academy consumes it via `src/academy/integration/yomu-local-review.ts`. U44/U97's language slot landed as an elided-default extension: Japanese expression/reading keys are byte-identical, so Academy stays on its two-argument Japanese identity calls and needs no deck, tombstone, or E2EE-event migration. |
| Study page / new-tab review surface | **This thread** (plan A2) | Academy's study module renders inside it; the dashboard redesign must keep `src/academy/integration/study-module.ts` mounting. |
| `/academy/api/account`, `/academy/api/session` (**A5**, 401 live) | **Either — fix once** | Blocks account sync here AND Academy sign-up/payments there. Whoever fixes it says so; do not both fix it. |
| Cloudflare R2 `dictionaries.yomureader.com` (**A7**, ~1,484 objects) | **This thread** | Academy assets must not share this bucket/prefix. Beware [[wrangler-remote-flag-silent-noop]]: `r2 put/get` default to LOCAL. |
| Cloudflare workers + Pages deploys | **Coordinate** | Both threads deploy; a `wrangler deploy` from one can overwrite the other's config. Announce before deploying a shared worker. |
| `docs/**` site, nav, copy | **This thread** | Academy owns `docs/public/academy/**` output only. Academy's nav entry stays until sign-in works (A5). |
| Release tags / version bumps | **This thread** | Academy work rides normal patch releases; 1.9.0 stays gated (A8). |

- [x] **A10 / U44 / U97 card-identity seam retired.** The fixed tuple is
      `(dictionary form, secondary reading, part of speech, language)`, with trailing default slots
      elided. Missing language remains Japanese and missing part of speech remains empty, so every
      pre-existing Japanese key is unchanged. Academy therefore keeps its existing two-argument calls
      and its existing local cards, tombstones and version-1 encrypted sync events require no migration.

- [ ] **A8 — 1.9.0 stays gated on the multilingual rewrite.** BLOCKED BY: the owner's ruling that the minor ships only after the multilingual rewrite is complete, and it is not: 6 of 32 roster languages have dictionary supply. Consequence: the browser stores keep serving 1.8.15 while main runs ahead on patches. (owner, verbatim, 2026-07-26: "ship the
      minor after the complete multilingual rewrite is completed"). A prior handoff's "time to bump
      minor" instruction was fabricated — retracted; do not cut 1.9.0 on its authority.



Ordered by the owner's own stated priority: *"for now — fixing existing bugs and refreshing the
website and extensions is more important"* (E2). Academy is last and stays postponed.

## T0 — People paid and got nothing  [the only thing above bug-fixing]

- [ ] **U52 / U47 / U55 — PARTIALLY REPRODUCIBLE; payment delivery fixed 2026-07-28 (codex).** Plain Google or
      Reader signup creates an account; it does not purchase Academy access. The email-matching theory
      was refuted: provider identities are HMACed, and the paid code binds to a Google account only
      when its holder redeems it. Live aggregate evidence before the fix showed one active paid
      Patreon member, one code minted, and zero redemptions. The existing bridge and minting machinery
      had worked; automatic delivery had not. Stripe, Ko-fi, and Patreon now send through the
      verified provider email, Stripe keeps its same-browser claim as a fallback, and a PII-free
      ledger alerts on missing delivery. Historical unredeemed rows and missing-recipient cases
      remain visible for owner/admin recovery.
- [ ] **U48 — sign-in, in the leg nobody has tested.** The 2026-07-26 investigation proved only that
      everything *up to* Google consent is healthy (36/36 tests, worker live, OAuth start returns a
      valid Google redirect); it could not test anything after consent because completing consent
      creates an account. The owner experiences it as broken, so the fault is in the untested leg:
      `handleGoogleCallback` → `linkGoogleSubject` → entitlement → `?account=linked|failed`. **Fastest
      diagnosis is still the owner signing in once with DevTools Network open.** Do not treat passing
      tests as evidence against the owner's direct experience; the tests do not cover this path.

## T1 — Bugs users are hitting now

Reproduce before closing. None of these has a commit.

- [ ] **U4 — iOS Safari OOM every ~5 minutes**, plus copy/paste interference and the startup overlay
      appearing on every site. This is also the **gate on U95** (leading with mobile) — you cannot
      lead with a differentiator that crashes.
- [ ] **U1 / U2 / D9 — settings are per-site, not global; settings are lost on update.** Trust bugs,
      and the reason woozlez's dark-mode palette work is fragile.
- [ ] **U3 — "Prefer Japanese site and language" still defaults ON.** Verified this pass:
      `src/reader/settings/index.ts:500` → `preferJapaneseSiteLanguage: true`. The owner already
      agreed it should default OFF. Turning it off also leaves `?locale=ja-JP` in the URL.
      *A default most users must change is a bug.*
- [ ] **U5 / U6 — Yomu needs a hard refresh to activate on YouTube; BookWalker needs a reload on
      every page.** Both surface as silent failure, which is what turns them into Discord threads
      (see U100).
- [ ] **U7 — Discord broken by Yomu** ("eating words", growing spaces, broken usernames). Recurred
      after a fix; longest-running host-site complaint in the log.
- [ ] **U8 — subtitle upload fails, `.ass` suspected.** *There is a free fix sitting in Discord:*
      vvvvtk root-caused it — an ASS file has **two `Format:` lines** and the parser reads the
      `[V4+ Styles]` one instead of `[Events]`. Check that first (D16).
- [ ] **U9 / U10 / U11 —** jpdb card add returns 400 on a new empty deck; annotations do not resume
      after toggling off/on; the immersion-kit panel does not update when switching cards.
- [ ] **U13 / U35 — batch mining is slow on long videos, and its buttons give no feedback.** sagamsil
      could not tell what "add selected" vs "Nothing/Hard/Okay" did until he was told.
- [ ] **U58 — clamped-host mirror truncation. Diagnosed and measured, not fixed.** The additive text
      mirror is a child of the clamped host and its content is two lines tall, so `scrollHeight`
      16→32 inside `-webkit-line-clamp:1` and the engine truncates the host's own text
      (`登録チャン…`). Width is fine; **height doubles**. Note `position:absolute` alone may not
      suffice — absolutely-positioned children still count toward an ancestor's scrollHeight when
      that ancestor is their containing block. Needs a real-browser smoke; jsdom cannot see it.
- [ ] **U60 — iPad sticky `:hover` can leave the native caption un-blurred** after the first tap
      (`subtitles-youtube.css:227`).
- [ ] **D14 (half) — detect scanned PDFs and prefer Yomu's own OCR** over the publisher's garbage text
      layer. 1.8.17 shipped the *containment* half (`f70189516` — pending text layers stay hidden
      until classified); choosing our OCR over a bad embedded layer is still open. Drop-zone centring
      also still open.
- [ ] **U53 — Browser Back does not work on the Academy profile/sync view.** Verified: no `popstate`
      or `pushState` anywhere in `src/academy/app.ts`. The SPA reads `?view=` on load and routes
      internally without participating in history. Check the Study SPA for the same defect.
- [ ] **U50 / U51 / U54 — the account screen.** Seven actions on one screen, two destructive, wrapped
      in E2EE jargon, reached by *reader* users and not only Academy ones. Verified still present:
      `src/reader/app/academy-copy.ts:252,285` renders **"Class journal"** — a fictional Academy
      world-location name (`world-locations.ts:2105`) — as the heading of an **account settings**
      screen. U54 was deliberately not attempted last session because it is a multi-file en/ja copy
      change and `tests/reader/settings-form/07-localization-mining-japanese.test.ts` fails on any
      English leaking into the ja rendering; it needs a session with room to run the localization
      gate after each edit.

## T2 — Website and extensions  [the owner's second stated priority]

- [ ] **1.9.0 store release — what actually gates it.** Stated plainly:
      1. **Tags stop at `v1.8.15`.** 1.8.16, 1.8.17 and 1.8.18 are on `origin/main` untagged. Store
         submission needs a **MINOR** tag, so nothing can be submitted until a tag exists.
      2. The multilingual rewrite is the declared content of 1.9.0 and is **not done** — see T4;
         24 of the 32 roster languages still have zero dictionary supply.
      3. The listings themselves are not written (B4/U40) and the name problem is unsolved (below).
      Until 1 and 3 are done, "1.9.0" is a version number with no release behind it.
- [ ] **U14 / U45 / U88 — the name.** The Chrome listing is literally **よむ**
      (`chromewebstore.google.com/detail/よむ/bbaickgfdgnecdnkcplaoiopnfghlkna`), so Latin-script
      search returns nothing and *"search for yomu"* is broken advice. Worse than a listing bug:
      **five shipping products already use the name in this exact category** — Yomu JP (yomujp.com),
      Yomu Yomu (iOS), Yomu – Japanese Reader (iOS), Yomu Reader (Android), and **yomureader.app**,
      one character from our own domain. Needs a permanent disambiguating tagline used with the name
      everywhere, canonical SEO ownership of yomureader.com, and Latin-script titles plus real
      keywords on Chrome / AMO / Greasy Fork. **Then verify by searching each store, not by assuming.**
- [ ] **B4 / U40 — rewrite the store listings**, text and images, for addons.mozilla.org, the Chrome
      Web Store and the Greasy Fork description. Firefox Classic (not Developer Edition) is the
      profile signed into AMO. Lead with what users say Yomu is good at: reduced friction, one tool
      instead of five, BookWalker/manga OCR, instant Nadeshiko examples, edge-hosted audio, the
      YouTube feed filter, and **mobile** (U95).
- [ ] **U87 — a 30-second clip is the primary artefact, not a screenshot.** Now cheap: the Remotion
      project shipped in 1.8.18 (`d5107a29c`, `cdbcf57fc`, `video/`), so this is a second composition
      rather than new infrastructure. One clip — hover → popup → mine → card with video and image
      attached — reused verbatim on both stores, Greasy Fork, the homepage hero and every community
      post.
- [ ] **U68 — install is unreliable across managers. Mitigated, not fixed.** 1.8.15 (`0616b8b84`)
      added install-from-URL fallback copy to the homepage and Getting started (verified:
      `docs/index.md:54-60`, `docs/getting-started.md:43`). The underlying defect — managers not
      intercepting the link, so the `.user.js` lands in Downloads — is untouched. Fix the served
      content-type/headers and **test each manager** (Tampermonkey, Violentmonkey, ScriptCat,
      Userscripts).
- [ ] **U69 — a "previous versions" page.** Owner promised it publicly. Directly mitigates U68 and the
      daily-userscript-channel risk. Not present in `docs/`.
- [ ] **U82 / B6 — navigation: 14 destinations → ~5, and one primary CTA.** Support appears **three
      times** in the nav (which is B6 from another angle) and the hero has five equal-weight buttons,
      so nothing is the obvious next action. This is noteliana's *"my biggest feedback would be easier
      navigation"* with a number on it. **Not addressed by the 1.8.18 docs rewrite**, which fixed page
      *content*, not site IA.
- [ ] **B5 — mark Academy "coming soon" wherever it is presented.** Verified: only `docs/support.md`
      carries it today.
- [ ] **D42 — do the query research before any SEO work.** The brand term is the wrong target. The
      reachable audience searches the problem — "yomitan for manga", "read japanese on ipad", "mine
      anki from netflix", "furigana chrome extension", "yomitan mobile", "yomitan alternative iphone"
      — and several are questions Yomu already answers better than anything else. Derive the list from
      the community research already in this file; those recurring "how do I…" questions are search
      queries in disguise. That also answers B2's "what do we really need on the homepage".
- [ ] **U94 / U76 — publish through the community's own channels:** r/LearnJapanese's weekly
      *Material Recs and Self-Promo Wednesdays* thread, the JP Lazy Guide, Awesome-Japanese (checked —
      Yomu is absent), the Yomitan resource page, the TMW wikis. **The owner posts these himself.
      Prepare the artefacts and hand them over; do not post on his behalf.**
- [ ] **B7 — Patreon posts.** An initial post as Henry, and a thank-you to existing subscribers.
      **Drafts only.** Keep woozlez in the loop on any homepage rewrite — he made the homepage video.
- [ ] **U109 — trust signals on distribution.** A malware clone of yomininja.com outranked the real
      project in search and drew a 375-point warning thread. Signed releases with published checksums,
      one canonical install origin, an explicit statement of what the userscript can access, and a
      **visible release channel** so "which build am I on" is answerable from the UI (A6/R6).

## T3 — Setup friction: "it should just work out of the box"  [B1]

The measured picture, all re-verified this pass:

| | measured | file |
|---|---|---|
| Settings opens on | `appearance` — 22 colour fields | `settings/form.ts:226,231` |
| `form.ts` size | **3,129 lines** | `settings/form.ts` |
| Advanced rows hidden by default | **0%** | — |
| First-run questions | 12 | `OnboardingController` |
| Nav destinations | 14, Support 3× | — |

- [ ] **Try-first onboarding — the owner's decision, and it overrides the judge panel.** The first
      thing a new user sees is Yomu working on real text, zero configuration, no account. Setup is
      offered only after value is demonstrated and is skippable forever. Consequences to hold: this
      subsumes U86 (the demo is the first run, not a marketing page); U80 becomes "ask ZERO up front"
      with ≤3 as the ceiling for what may be asked later, in context; the 22-colour appearance tab must
      not be anywhere near first run; the demo text is **per target language**, not Japanese; existing
      users must not be re-onboarded on upgrade.
- [ ] **U77 — one global "Advanced" switch.** Yomitan gates 51 of 125 rows behind one checkbox that
      sets `data-advanced` on `:root`; uBlock Origin converged independently on the same design. Two
      of the most-used power extensions in the world settled on one switch. Target ≤60% of rows visible
      by default, and keep advanced rows **visually marked** even when revealed.
- [ ] **U78 — a one-sentence description on every setting**, always visible (better than noteliana's
      `(?)` icon ask), with dependent options as **children** of their parent control rather than
      siblings in a flat list.
- [ ] **U103 — named presets as the primary surface, "Custom" as the escape hatch.** Candidates: the
      video/subtitle overlay panel, the 22-field colour matrix, the mining field-source matrix.
- [ ] **U83 / U70 — settings live where their effect lives.** The popover, subtitle overlay, OCR
      overlay and study screen each get a gear that deep-links to their own panel and returns. Move
      Sources somewhere findable — the owner already said he would.
- [ ] **U84 — dense lists get ≤4 controls above the fold**, filters in a popover, applied live, no
      Apply button. Apply to the 221-entry dictionary catalogue, the mining queue, the study queue and
      the word browser.
- [ ] **U85 — "≤5 minutes" must be a measured number in CI.** Clean profile, cold install → first
      furigana rendered on a real page, no account, no API key, no dictionary picker. Regressions fail
      the build. Under try-first this should become a much smaller number.
- [ ] **U108 — convention conformance. Four findings re-verified against the tree this pass:**
      - `shortcuts.hoverLookup` defaults to `''` = **plain hover** (`settings/index.ts:552`). Yomitan
        and Migaku both default to a modifier. This is canna98's *"I just turned it off bc it was
        annoying"*.
      - **`A` is still bound twice** — `playAudio: 'A'` and `previousSubtitle: 'A'`
        (`settings/index.ts:554,558`).
      - **`kifuku` is still missing from the pitch palette** — `grep -rn kifuku src` → 0 matches. The
        other four pitch colours already match the kotu lineage; the fifth is simply absent and a grey
        `unknown` sits in its slot.
      - **`new: '#ffffff'`** (`theme/color-tokens.ts:46`). White is a *colour*: invisible on white
        pages, glaring on dark ones — which is why woozlez had to set his highlights near-black for
        ttsu dark mode. Transparent at rest is what U23 and canna98 actually asked for.
      Plus: hotkeys into the `Alt+` namespace, `Ctrl+Z` as an undo alias in Study, key `1` always the
      failing grade whatever scale the destination uses, frequency rendered as `#18447`, and the
      vocabulary rules (**never** use "collection" for a mining list — in Anki that word means the
      entire database).
- [ ] **U101 — one-click diagnostic bundle.** Logs, version, channel, host, settings snapshot, recent
      errors, a description box, returning an ID to paste into Discord. U4, U6 and U12 each consumed
      weeks that one artefact would have collapsed. **A support tool, not telemetry** — user-initiated,
      contents visible before sending.
- [ ] **U100 — site-outage detection with differentiated messaging.** Distinguish "broken right now,
      we know" from "fixed, please update". Yomu's YouTube and BookWalker breakages currently surface
      as silent failure.

## T4 — Multilingual: what actually remains for 1.9.0

**Baseline before this pass**, not estimated:

- The published catalogue (`config/dictionaries/published/v1/catalog.json`) holds **221 entries**
  across **10 headword languages**: `ja:145 zh:38 yue:10 lzh:4 es:4 fr:4 de:4 ru:4 ko:4 vi:4`.
- The learner roster (`src/reader/locales/types.ts`) is **32 languages**.
- Of those 32, **8 have dictionary supply** (zh, yue, es, fr, de, ru, ko, vi).
  **24 roster languages have zero dictionaries.** Six of the thirty landed in 1.8.18 (`108584f25`);
  the earlier "~27 non-CJK targets with no supply" figure is now **24**.

- [x] **Dictionary supply for all 32 targets shipped 2026-07-29.** The owner
      granted full permission on 2026-07-28: licences and approvals are in hand for all 24 dictionaries,
      the Persona OST, every downloaded study resource, and anything downloaded from here. *"What matters
      most is building out the product."* The old "data and licensing, not code" framing is void.
      The other half of that line was also wrong: **WTY publishes all 32 roster languages including `lo`**
      (remeasured 2026-07-29 — 742 roster pairs / 1,440 live zips; see A7 and memory
      `yomu-wty-many-to-many-matrix`). So this is generation and upload work, with nothing to wait for.
      All 1,440 live archives are now mirrored, and every roster target has published terms supply.
- [ ] **U61 — language-seam residuals.** Re-counted this pass:
      - **31** direct `HAS_JAPANESE` sites remain outside `languages/` (was 33). Heaviest now:
        `reader/dom/index.ts` (5), `academy/ui/vn-stage.ts` (5, own regex),
        `sources/definition-render.ts` (3), `newtab/runtime.ts` (3),
        `dictionaries/learner-glossary.ts` (3).
      - **[x] `src/gaming/shared.ts` is now clean — 0 matches** (was 6 with its own local regex). Fixed by
        the gaming multilingual work (`a5f44c5e0`, `db5e0d5bc`). **The backlog entry saying gaming is
        un-migrated is STALE.**
      - **[x] `deinflectJapaneseTerm` is no longer imported by `dictionaries/yomitan/index.ts`** — fixed by
        `59e690658`. **That entry is STALE too.**
      - **[x] The target picker is now a real select** over `LEARNING_TARGET_ROSTER`, and A37 moves raw
        pointer-word admission behind contract revision 5. The remaining direct Japanese checks above
        still need classification as genuinely Japanese or migration to a target capability.
- [x] **U44 / U97 — language-aware card identity shipped in `eb1271571`.** The four-slot key includes
      target language while eliding `ja`, so existing Japanese identities remain byte-identical and
      existing E2EE data needs no migration.
- [x] **U105 — FIXED: the three tiers are three separately addressable axes.** sagamsil does not need
      Yomu translated into Korean; he needs **definitions rendered** in Korean (U15), and that now works
      without touching the interface locale. TARGET (what is read) lives in `profile.targetLanguage`,
      OUTPUT (what definitions and example translations render in) in `profile.outputLanguage`, INTERFACE
      (what Yomu's own chrome says) in `profile.uiLocale`, read through
      `src/reader/languages/selection.ts` (`targetLanguageOf` / `outputLanguageOf` /
      `interfaceLanguageOf` / `resolveLanguageSelection`). Profile schema revision 2 renames revision 1's
      `learnerLanguage` to `outputLanguage` and keeps writing the old name for one release; the *stamped*
      revision decides which field is authoritative, so a downgrade to a revision-1 build does not lose
      the choice on the way back up. The live conflation was example translation: the popover and the new
      tab handed `settings.interfaceLanguage` to a machine-translation call, so an English-UI Korean
      speaker got English example translations with no way to ask for Korean ones. `translateText`'s
      destination option is now `outputLanguage`, not `targetLanguage` — that name collision is what let
      an interface locale be passed as a translation destination in the first place.
      **Correction to this ticket's own prose:** "morphology plus a named-entity gazetteer" is not the
      per-target cost in this codebase. There is no gazetteer field, adapter, capability or registry on
      `LearningTargetModule`; Japanese named entities arrive as dictionary data (JMnedict). The measured
      cost is registered modules, persistence/migration, language-bearing card identity,
      dictionary/capability gating, CSS/DOM gating, and source adapters — see the plan of record.
- [ ] **D43 — full UI localisation for every target language** (owner's explicit decision, overriding
      U105's scoping — **both** are in scope, do not quietly drop one). Today `interfaceLanguage` is a
      two-way en/ja switch. The website's former in-theme Japanese map has now
      moved into a build-only reviewed catalogue behind official static locale
      routes, but reader chrome still has only two selectable locales and the
      website publishes only EN plus 17 reviewed JA routes. MT is the only
      realistic first pass for the other 31, but cannot satisfy the copy-voice
      or native-review gate by itself; Arabic/Farsi also remain blocked on six
      unfinished RTL items. Do not convert draft availability into a claim.
- [x] **U79 — language-family DOM gating shipped in v1.8.38.** Every reader root carries
      `data-language`; the shared `jp-only` / `jpzhyue-only` / `jpzhyueko-only` /
      `not-jpzhyueko` mechanism physically detaches unsupported nodes. Tests switch to Korean and prove
      the furigana controls, `furiganaMode`, pitch colouring, pitch legend, and provider pills are absent,
      then switch back to Japanese and prove the same nodes return.
- [ ] **U46 — example-sentence + media sources for the other 31 targets.** ImmersionKit is
      Japanese-only and it powers the thing users love most. Deliverable: a table of target → source →
      has audio? → has image? → API shape, plus an explicit list of targets with **no** usable source
      so the affordance can degrade visibly.
- [ ] **U62 — dictionary mirror residuals.** 13 published entries have dead Drive source URLs (served
      fine, but `acquire.mjs` can no longer re-fetch them); `languages.json` now records measured
      published-entry, term, pronunciation, definition-language and missing-upstream coverage for every
      learner language; Kanjium pitch and WTY
      JA-JA are offered as curated cards pointing off-mirror; 135 zips across 6 Drive folders
      unmirrored; 7 Proton folders unenumerable; 7 GitHub collection repos not cloned.
- [ ] **A1 — one parser, best of both, locally.** JPDB deconjugates to dictionary form and blacklists
      katakana/conjunctions well; jiten and the offline JMdict parser group idioms and compounds
      better. Both example sets are testable fixtures today: `ことがなかった。` → JPDB yields
      ことがない, jiten parses なか and pops "inside"; `油を売る` → one entry in jiten, three in JPDB;
      `いつまでも殻に閉じこもっていない` → offline **and** jiten group 殻に閉じこもる, JPDB splits it.
      This is the multilingual segmentation problem restated: per-target morphology plus per-target
      compound grouping.

## T5 — Study, SRS and mining

- [ ] **U18 / U89 — collect now, schedule later. Name it and default it.** Nobody in the market has
      productised this, review debt is the community's second-largest recurring topic, and the live
      evidence is bdlance's due count going 200/day → **1600** because Yomu inserted reviews into
      jiten. Separate "collect words" from "study new words". The owner: *"I actually like this idea a
      lot."* This is the most defensible single product idea in the research.
- [ ] **U64 — the grading control adapts to the destination.** Owner, correcting an earlier note:
      *"don't explain — actually fix. Always match whatever the source is."* Grading into jiten shows
      jiten's 4 buttons with jiten's labels; into jpdb, jpdb's 5; into Anki, Again/Hard/Good/Easy; into
      Yomu SRS, Yomu's own. No lossy translation, no user-facing explanation. Scale, labels, keyboard
      shortcuts and colours all come from the destination adapter, not from Yomu's constants.
      *(Unconfirmed and worth checking cheaply: whether jiten's grading is genuinely 4-button. It is
      asserted by one user and carried through the whole chain unverified.)*
- [ ] **A2 / D44 — reconciliation across N simultaneous SRS backends, and its edge cases.** The
      architectural centre of the next phase, and strictly harder than what the competitor does (they
      solved it by exclusion — own the SRS, Anki is a paid export). **Decide each of these before Study
      sync ships:** same word graded in two places offline; scale mismatch on merge; card exists in one
      backend only (silent creation is a known harm); deletion vs never-existed (needs tombstones);
      Anki simply not running; Anki edited by hand; duplicate detection across backends (needs U97's
      4-tuple); suspended/buried/leech with no common vocabulary; clock skew; partial sync failure
      mid-batch. **Non-negotiable UX rule:** an unresolvable conflict shows both sides with last
      updated / words known / reviews due, and states plainly what each choice destroys.
- [ ] **U107 — canonical local store with tombstones.** Every synced row carries
      `mod / serverMod / del / serverVersion / isPendingEnqueue / isPendingApply`. Copy the storage
      schema; **reject the exclusion** — reconciliation is the differentiator.
- [ ] **U39 / A7 / U111 — Study is denser and slower than jiten, and the owner tells people not to use
      it.** Every complaint is about **density and speed**, not missing features. But the bigger prize
      is not jiten-switchers: it is **people who bounce off Anki and are actively shamed for it** — a
      "recommend me something that is NOT Anki" thread drew 77 comments of near-uniform hostility at 0
      points. **Consequence: Study must not look like Anki.** "Done" is not feature parity with a
      review app; it is the thing someone reaches for instead of quitting.
- [ ] **U90 — ship the tuned scheduler, not the knobs.** Yomu already ships FSRS on, presets optimised,
      leech auto-suspend enabled — and does not expose those on the main path. The community's own
      diagnosis of review overload is that most people's Anki is *misconfigured*.
- [ ] **U28 / D20 / U96 — the mining list, and i+1 that tunes itself.** Show every word you might mine
      before or after an episode, each with **mine / don't mine / already know** (a three-way choice,
      richer than "mine or skip"). Today's filter is
      `sentenceCardCount >= 3 && unknownCardCount === 1`
      (`src/reader/subtitles/subtitle-batch-mining.ts:99`) — minimum 3 tokens, **no upper bound and no
      frequency gate at all**. Adopt the *shape* — a length window, exactly one unknown, a frequency
      threshold that widens automatically with known-word count, filtering off entirely above a high
      known count — and **choose our own constants from our own data**.
- [ ] **U104 — seed known words in two minutes.** Offer the **import** route first where it exists
      (Anki collection, jpdb, jiten, Yomitan) and fall back to an adaptive "select the words you know"
      quiz over rising frequency bands. Yomu is useless until it knows what you already know, and today
      it asks the user to arrive with that state.
- [ ] **U91 — mine-worthiness guidance at the point of decision.** Band words in the popup and the
      mining list the way the community already does: **<30k learn · 30–60k if it matters to you ·
      60–100k marginal · >100k probably a parse error, not a word.** The >100k band doubles as a free
      parser-quality signal feeding A1.
- [ ] **U99 — comprehension score per page, video and book.** Yomu owns the parse, the known-state and
      the frequency data and surfaces a known-percentage only inside deck stats
      (`newtab/stats-view.ts:254`). A number and a plain word, computed from data we already have.
- [ ] **U19 / U31 / U33 / U70 — the small ones:** bulk **resume** (bulk suspend exists); turn off the
      jpdb/bunpro surfaces that are on by default and unwanted; kanji cards default off (the capability
      exists — the *default* is wrong); make Sources findable.
- [ ] **U56 / U57 / U71 — proper account features, with jiten as the reference.** Enumerate every
      account-level capability jiten exposes and mark Yomu has/partial/missing. Known from the research
      alone: vocabulary management with **import from Anki and from JPDB**, deck management, inspectable
      review history with undo/regrade, bulk suspend **and resume**, new-first sessions. Plus
      **usernames** to replace the generated `Learner#406049`, stored on the account, not the device.
      Yomu should own **migration between backends** (U71) — it is the natural companion to A2.
- [ ] **U106 — a quality gate that teaches its own bypass.** Warn once when a mined card would land
      blank on the back, and **inside the warning** say how to skip the check permanently.
- [ ] **U93 — low-intervention reading mode, and a stated limit to "automatic and seamless".** A
      legible "just read" mode: minimal decoration, no chips, lookups on demand, nothing that
      interrupts a line. Two independent users asked for this (amine 30/05 for video; the community
      counter-current), so it is no longer a single data point. **This challenges the governing
      principle** — automatic is right about friction and, on the evidence, wrong about volume.
      **Proposed amendment for the owner to accept or reject:** *automatic where it removes friction,
      silent where it would interrupt reading.*

## T6 — Platform

- [ ] **E1 — iOS.** Nothing built. Capture the target now: App Store listing so users skip userscripts
      (blocked only on the £100 Apple fee, which the owner said he would pay); a **share-sheet /
      Shortcuts screen translator** modelled on Tap Translate, to read any app and not just Safari;
      React Native so web/Android/iOS share one build; offline SRS on a train. **Gated on U4** — the
      Safari OOM, the copy/paste interference, the startup overlay on every site, and per-site settings.
- [x] **D37 — the Study PWA already existed; the install path is now repaired.** The old wording ("what
      is missing is a PWA for the Study/newtab surface") was STALE: `public/newtab/manifest.webmanifest`
      + `sw.js` have been shipping and deploying to `docs/public/study/` alongside the video player's.
      Fixed under A16 (2026-07-28): 192/512/maskable-512 PNG icons, `screenshots` for both form factors,
      `theme_color` in step with the HTML meta, and the FAQ now says Study installs to a home screen.
- [ ] **U41 / U92 — gaming: the target is capture-anything, not a game client.** Much of the mechanical
      work landed in 1.8.16/1.8.17 (see the ledger) and the app is materially better, but the two
      structural asks are open: route inline lookup through the reader's own `boot` +
      `collectScanTargets` instead of a parallel overlay implementation (Cycle 11), and widen the
      target from games to **any image** — a phone photo of a paper page, a capture-card feed, a console
      screenshot. "How do I mine from physical manga / console games" is asked roughly monthly with
      **no accepted answer**, and Yomu already owns the hard half. vvvvtk has the Steam Deck, has done
      the research, and volunteered to test **and** to write the Steam Deck guide (D3). Take him up on it.
- [ ] **A6 / R6 — make the release channel visible in the UI now**, before it becomes a
      conflict-detection feature. Userscript = daily/experimental, extensions = ~weekly/stable. Users
      need to know which channel they are on and what that means.

## T7 — Engineering and release residuals

- [ ] **Pre-existing shadow-DOM test-ordering coupling —
      `tests/reader/detached-reading-overlay.test.ts`.** Carried forward, unfixed. The file's
      `afterEach` (lines 52-57) restores mocks, deletes `document.elementsFromPoint`, clears the
      `yomu-furi-hover` class and empties `document.body`, but nothing clears the **module-scoped
      observed-root registry** inside `src/reader/dom/detached-reading-overlay-impl.ts`. Shadow hosts
      attached in one test stay registered after their DOM is discarded, and only some tests call
      `clearProjectedReadings` themselves — so verdicts in the shadow-DOM cases depend on run order.
      Fix by exposing a reset the test can call in `afterEach`, not by reordering tests.
- [ ] **Tag 1.8.16 / 1.8.17 / 1.8.18.** Verified: `git tag` stops at `v1.8.15` while `origin/main` is
      at 1.8.18. Store submission needs a MINOR tag; this blocks T2.
- [ ] **U63 — carried forward, NOT re-verified this pass** (this worktree has no `node_modules`, so
      nothing was run): `npm run fallow:dead-code` exits non-zero on 4 pre-existing rows;
      **voiceworks-toolkit** has the duplicate-translation fix on main (`3fdba5c`) but the userscript
      still advertises `@version 170`, so **nobody auto-updates onto it** — it needs a bump and a
      release; `prepare-release.mjs` has one residual shelf-durability conditional gap. The gate's
      `test:ci`-before-`docs:build` ordering hazard is at least partly addressed by `7ba0b9bc4`
      (the Study route and API docs are now checked **as committed** rather than regenerated first) —
      confirm before re-filing it.
- [ ] **Cycle 10 (part) — an early bundle-size budget**, not just the late verify gate. Core sits
      permanently ~1-2% under the hard 2 MB Greasy Fork cap, so every feature triggers a size firefight
      → another companion split → more `@require`/SRI publish fragility.
- [ ] **Cycles 4, 6, 7, 8 — the structural fixes are still unwritten**, even though a lot of their
      symptoms were fixed in 1.8.10–1.8.18. Named honestly: YouTube hooks are still structure-pinned
      (**U102** proposes a better shape than "a resilient observer" — a typed message bridge to the
      site's own API with rect proxies, and *without* the competitor's obfuscated-filename evasion);
      the subtitle drawer still has no layout contract across its six hosts; ruby alignment is still
      hand-tuned per surface (**U98** proposes a column-layout token primitive that would structurally
      eliminate the class — **measure its ~5-nodes-per-word cost against Cycle 7's actual cost before
      committing**); decoration still puts colour channels on the root, which is the documented cause
      of the SPA class-clobbering.
- [ ] **U43 — reframed by the owner, and ranked DOWN.** The correct framing is *"avoid the proxy by
      default, use it only where an origin genuinely requires it"*, not "close the coverage gaps".
      The one genuinely user-visible casualty to check under that framing is jiten
      `random-example-sentences`, which powers the feature noteliana calls Yomu's best.

## T8 — Academy  [POSTPONED by the owner; carried forward, do not start ahead of T0–T2]

- [ ] **E2 — a full Academy vision recovery, before any more building.** **Not an as-is/to-be
      exercise.** Reconstruct the vision IN FULL from history — all past and current **Codex** sessions
      and past **Claude** sessions where it was brainstormed — then judge the existing work against it.
      Required output: what was built and **where it strayed**; **the owner's disappointments, named**
      (likely "AI slop" in the lessons — audit lesson content the way U54 audits product copy);
      **critical failures and downfalls**, not a feature list, including where it used its **sources**
      badly; **use of space** — stop making learners scroll inside small scraps of paper (a UI failure,
      not a content one); story must adapt per language; **3D Tartarus-class experiences, plural**, with
      genuinely good graphics and a consistent world — explicitly NOT what is currently in the works;
      **memoryOS principles were never integrated** and the owner considers this a miss, not a
      nice-to-have; **review the architecture**, not just the content. Sequencing is explicit: run it
      alongside, not ahead of, the bug and store work.
- [ ] **E3 — Academy source material, generalised to 32 languages.** Japanese Academy is based on the
      learning pack plus sensei's Moodle courses. Every other target needs an equivalently
      high-quality reference set and those do not exist — a research task per language. **Disk, not
      disk space, was the stated constraint**, and an external SSD is plugged in. (Licensing is closed — A22.4.)
- [ ] **The Academy infrastructure defects, which are NOT postponed** (they are reached by reader
      users): the media **403** on
      `…/academy/media/audio/v1/persona/no-more-what-ifs-instrumental.flac`; CSP blocking an inline
      script (`script-src-elem`, nonce mismatch); repeated `Not allowed to define cross-origin object
      as property` from the content script injecting into the Academy page; a wasted preload of
      `yomu.user.js`.
- [ ] **U42 — there is no account control on `/academy/` or `/study/` at all.** Both are standalone
      SPAs; the hosted account control only mounts into VitePress pages. **You cannot sign in from the
      two surfaces where SRS actually lives.** Redesign sign-up, entitlement and account UI as **one**
      piece of work, not three tickets.
- [ ] **U65 / U66 / U67 / U110 — the teaching design, worth keeping.** "Razor speak" (explain grammar
      in deliberately simple, blunt language — canna98's *"textbooks make sure that u will not
      understand it"*, and she offered to write explanations once she has learned more); real examples
      beat invented ones; graded answers immediately; the 50% rule, whose design consequence is that
      Academy should actively push learners **back into immersion** rather than maximising
      time-in-Academy. **Correction to the earlier note:** the community's ranked grammar default has
      moved — **Yokubi (yoku.bi) is now first**, then Misa, then Cure Dolly, then **Tae Kim fourth**.
      Tae Kim's *style* argument remains exactly right and is the valuable half; citing him as the
      community default is now wrong. The linked setup references are the **JP Lazy Guide** and
      **donkuri**, not animecards, and the note type to name is **Lapis**, not JPMN.
      **Take no side in the grammar wars** — it is the community's most divided topic.
- [ ] **U66 — teach people how to learn Japanese, unbiased.** Not "how to use Yomu". Recommend the best
      tool for each job even when it is not Yomu; credibility is the whole asset. This is also what
      earns the links in U94.
- [ ] **S0 — the Persona 5 Royal frames are the concrete answer to E2's "use of space" complaint**:
      confident full-bleed composition where UI sits **on** the scene rather than in a scrolling box;
      angled, energetic framing; an oversized portrait breaking its own frame; a tiny corner-anchored
      control legend that is dense without clutter; a saturated, limited palette applied with total
      conviction; and diegetic learnable text placed **in the world**, not only in lesson panels.

## Standing decisions that bind everything above

- **Governing principle** — *"everything should always be automatic and seamless"*, applied as a test:
  for any screen, setting or step ask **"why is the user doing this at all?"** If the software could
  have done it, chosen a sensible default, or waited until it mattered — remove the step.
  **Corollary for defaults:** a default most users must change is a bug.
  **Corollary for failure:** when something cannot be automatic it must be **visible** — degrade
  honestly, never silently do nothing. U93 proposes the one amendment.
- **Fix bug classes in core machinery, never per-site patches.**
- **The reject list stands** (R1–R13 in the archive): no injecting the whole app into every page, no
  bundling all language resources, no mandatory always-open window, no bare single-letter hotkeys, no
  requiring login before any value (*the one sentence a paid competitor structurally cannot copy* —
  do not give it away), no obfuscated filenames, no second SQLite engine, no settings that force a
  reload, no Anki-as-paid-export, and **do not build a fifth SRS**.
- **Positioning, with the honest caveat:** *Yomu turns any page, video, manga or game screen into a
  Japanese lesson — lookups, readings, pitch and mining — and keeps your Anki, jpdb and jiten in step,
  on desktop and on your phone. Free, no account, nothing to configure.* A redditor would accept every
  clause **except "nothing to configure"**. **Ship the sentence without the last three words until
  T3 earns it.**
- **Unresolved, owner's call — which words are marked at rest.** The competitor marks unknown loudly
  and makes known/ignored transparent so the page visibly cleans up as you learn; Yomu's own users
  asked for the opposite emphasis. Proposed resolution: keep new/unknown undecorated at rest, and
  spend the loud treatment on **recommended (i+1) words only**. Must be reconciled with the standing
  "all chrome annotated at rest" rule.

---

# PART 2 — RECONCILIATION LEDGER

Every prior claim, checked. `SHIPPED` carries a commit or a file path. `STALE` means a previous triage
recorded something that the tree contradicts.

## 2a. Shipped in 1.8.16 (`1282f1c95`) and 1.8.18 (`81a7b4d49`)

**Yomu Gaming**

| Item | Verdict | Evidence |
|---|---|---|
| Capture shortcut works on the **first** press of a session | SHIPPED 1.8.16 | `621bd29e5` — macOS returned an empty thumbnail on the first request after launch; failed on 5 cold starts out of 5 |
| Re-reads the screen on **every** press, not replaying the first capture | SHIPPED 1.8.16 | `8635424ec` |
| Recognized text typeset at the size of the text it was read from, in register | SHIPPED 1.8.16 | `df5517582`, `fa670c9ce`, `88bdc27ab` (survives window resize); tests `44e90b3a5`, `0392023b6`, `b3058f4fe` |
| Overlay stops re-typesetting every line on every frame (157 layout passes / 158 frames) | SHIPPED 1.8.16 | `68b47c965` |
| Reads the screen the player is actually on (multi-monitor) | SHIPPED 1.8.16 | `c99789da7`, `9240ec20e` |
| Follows the **study target language**, including a switch while running; language survives a save | SHIPPED 1.8.16 | `a5f44c5e0`, `db5e0d5bc`, `f23e7909a`, `0a9345645` |
| Tray: waits in the menu bar instead of disappearing | SHIPPED 1.8.16 | `d9dd121f8` |
| Dock icon; desktop icons rebuilt from the app's vector in the build | SHIPPED 1.8.16 | `ed18e1881` |
| First run: one screen, Settings is somewhere you go, names a key only when the keyboard has it | SHIPPED 1.8.16 | `baf3ce233`, `959c502a7` |
| Escape dismisses the word card without also closing the overlay | SHIPPED 1.8.17 | 1.8.17 entry |
| CJK-font-less Linux line alignment | SHIPPED 1.8.17 | 1.8.17 entry |

**Reader**

| Item | Verdict | Evidence |
|---|---|---|
| Recycled video rows stay annotated (a row is judged by the exact text it covered) | SHIPPED 1.8.16 | `4f90cf918`, `cc7b3031a` |
| Katakana middle dot splits words; Details appears only when there is something behind it | SHIPPED 1.8.16 | `dda4ccf75` |
| One tap hides the translation on a phone; drawer controls survive a rebuild mid-tap | SHIPPED 1.8.16 | `d9368f6d0`, `1ebfdebca` |
| Anki note-type update touches only the note type it offered | SHIPPED 1.8.16 | `38b03d908`, `142920ed7`, `ceb9b89b8` |
| Blank English copy in the Anki field-mapping panel | SHIPPED 1.8.16 | `685b7b676` |
| Japanese subtitle labels restored after the locale-overlay move | SHIPPED 1.8.16 | `a38fbbcb4` |
| **rAF latch fix 1 of 2** — additive mirror re-stamp survives a frame that never arrives | SHIPPED 1.8.16 | `b49091476` |
| **rAF latch fix 2 of 2** — projected readings survive a swapped-out scheduler | SHIPPED 1.8.18 | `2cd9aab81`, merged `fdd5ae285` |
| Subtitle font-size slider is literal (60px stays 60px through every transition) | SHIPPED 1.8.17 | `e9b39a5a6` |
| Floating button appears without waiting on local-dictionary storage startup | SHIPPED 1.8.17 | `e9b39a5a6` |
| PDF text layers hidden until classified | SHIPPED 1.8.18 | `f70189516` |

**Infrastructure**

| Item | Verdict | Evidence |
|---|---|---|
| Build reproducibility — a rebuild stops rewriting 11 committed artifacts (fflate + wall-clock stamp) | SHIPPED 1.8.16 | `d024224a4`, `73780a9db`, `fc28f6c4b` |
| Committed-artifact guard — names mismatched packages, checks the Study route, API docs, Academy revision, and that every pinned companion is committed with the hash it pins | SHIPPED 1.8.16 | `1af0f5b99`, `9a650f3b0`, `086418f86`, `6d76e8883`, `a4d161ce6` |
| The staging list now covers the reader stylesheet (it could never match the new hashed name) | SHIPPED 1.8.16 | 1.8.16 entry |
| Release-gate flake | SHIPPED 1.8.16 | `d3f2026a3`, `0d686db10` |
| Study page reports the version actually installed | SHIPPED 1.8.16 | `7ba0b9bc4`, `8acf1c209` |

**Content**

| Item | Verdict | Evidence |
|---|---|---|
| Docs rewritten around what a reader gets; every page says what Yomu is on line one | SHIPPED 1.8.18 | `6105bd1e8`, `33565c679`, `432562cb7` |
| 17 of 38 published pages were internal notes — now excluded, sitemap kept to reachable routes, a stray page fails the build | SHIPPED 1.8.18 | `4e7e6263f`, `9d790f812` (source files intentionally stay in the repo) |
| Japanese restored across the rewritten pages, guarded against English-shaped "translations" | SHIPPED 1.8.18 | `427488fa4` |
| Every screenshot shows what its caption says; the capture harness now fails rather than saves | SHIPPED 1.8.18 | `bfe94b0b3`, `4c79a6ff6`, `dc27dbaf7`, `f90685bfe`, `b11a27e50` |
| Six new dictionary languages (es, fr, de, ru, ko, vi — 24 Wiktionary-derived dictionaries) | SHIPPED 1.8.18 | `108584f25`, merged `a46c50751` |
| ICU segmentation for languages that do not write spaces (th, lo, km, my) | SHIPPED 1.8.18 | `83bcb815c` |
| Lookups use the language being read — detection, boundaries and morphology all follow the study target | SHIPPED 1.8.18 | `59e690658` |
| Remotion project + the gaming clip | SHIPPED 1.8.18 | `d5107a29c`, `cdbcf57fc`, merged `06e1cb5e9`; lives in `video/`, outside the release gate |

## 2b. STALE — recorded as open, actually shipped

These cost time. Each was verified in the tree this pass.

- **Cycle 1's P0 canvas-page-identity primitive — SHIPPED, and long ago.**
  `src/reader/ocr/canvas-page-identity.ts` exists, is consumed by `src/reader/ocr/controller.ts:53`
  and by `canvas-page-signature.ts`, and landed in **v1.6.35** (`85fee5122`), later consolidated by
  `9633e0d4e`. The archive's "Residual engineering: agent was paused by the owner mid-implementation;
  re-launch when wanted" is **wrong**.
- **Cycle 2's legacy `NewTabMode` substrate — DELETED.** `grep -rn NewTabMode src` → **0 matches**.
  The archive's "internal NewTabMode dual-substrate (deferred mechanical refactor)" is done.
- **Cycle 3's managed-state registry and reset invariant — SHIPPED.**
  `src/reader/app/managed-state-registry.ts` and `managed-state-manifest.ts` exist, and
  `tests/reader/factory-reset-invariant.test.ts` (plus `factory-reset-coordinator` and
  `factory-reset-storage`) enforce it.
- **Cycle 9's `ApiSrsProviderId` enum — ALREADY EXTENDED.** It is
  `'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local'` (`src/reader/cards/srs-providers.ts:12`),
  not `jpdb|jiten`.
- **Cycle 9's trust bug — GONE.** `grep -rn submitJpdbApiGrade src` → **0 matches**.
  `src/reader/newtab/grade-queue.ts` takes an injected `submit`, so grades no longer fall through to
  the jpdb path. *(The wider provider-adapter consolidation was not audited beyond this.)*
- **U61: `deinflectJapaneseTerm` imported by the language-agnostic dictionary engine — FIXED** by
  `59e690658`. No longer present in `src/reader/dictionaries/yomitan/index.ts`.
- **U61: `src/gaming/shared.ts` carries 6 direct `HAS_JAPANESE` calls with its own regex — FIXED.**
  Now **0 matches**, via the 1.8.16 gaming multilingual work.
- **D37: "Nothing matching a webmanifest found in `src/`" — WRONG.**
  `docs/public/video-player/` ships `manifest.webmanifest` **and** `sw.js`. The archive already
  self-corrected this; it is restated here because the rescope matters (extend to Study, don't build).
- **D8 (furigana on the study card) — SHIPPED and verified twice.** `newtab/controller.ts:6944`
  forces ruby on the answer side and keeps the prompt bare. The original PARTIAL was a bad grep.
- **A8 ("sign-in is NOT broken") — SUPERSEDED by U48.** The investigation only proved the pre-consent
  leg healthy. It is recorded here as the cautionary case: **passing tests were treated as evidence
  against the owner's direct experience, and they were not.**
- **The whole first D-list pass — WORTHLESS BY CONSTRUCTION.** It was greped against
  `apps/yomu-reader`, a shared tree pinned at v1.6.228, ~200 versions behind. Anything marked from it
  and not re-checked on `origin/main` should be treated as unknown, not as triaged.

## 2c. STILL OPEN — re-verified against the tree this pass

| Item | Verified how |
|---|---|
| **U3** prefer-Japanese defaults ON | `settings/index.ts:500` → `preferJapaneseSiteLanguage: true` |
| **D13** Help does not show the latest version | `latestVersion` absent from `settings/dialog-controller.ts` on origin/main (the earlier SHIPPED? mark came from the stale tree) |
| **U61** no target-language picker | `settings/form.ts:146` hardcodes `<span … lang="ja">日本語 — Japanese</span>` |
| **U61** 31 direct `HAS_JAPANESE` sites outside `languages/` | counted this pass (was 33) |
| **U53** Academy Back button | no `popstate`/`pushState` in `src/academy/app.ts` |
| **U54** "Class journal" heading on an account screen | `app/academy-copy.ts:252,285` |
| **U108** plain-hover default | `settings/index.ts:552` → `hoverLookup: ''` |
| **U108** `A` bound twice | `settings/index.ts:554,558` → `playAudio: 'A'`, `previousSubtitle: 'A'` |
| **U108** `kifuku` missing | `grep -rn kifuku src` → 0 |
| **U108 / U23** new-word colour | `theme/color-tokens.ts:46` → `new: '#ffffff'` |
| **U77 / U103** settings open on 22 colour fields | `settings/form.ts:226` → `DEFAULT_SETTINGS_PANEL = 'appearance'`; file is 3,129 lines |
| **B5** Academy "coming soon" | only `docs/support.md:17` |
| **U69** previous-versions page | absent from `docs/` |
| **Multilingual supply** | 221 catalogue entries, 10 headword languages, 24 of 32 roster targets with none |
| **1.9.0 tagging** | `git tag` stops at `v1.8.15`; main is 1.8.18 |
| **U68** install fallback is copy only | `docs/index.md:54-60`, `docs/getting-started.md:43` — no content-type fix |

## 2d. Not re-verified this pass — treat as unknown, not as triaged

This worktree has no `node_modules`, so nothing was executed. Everything below is a documentation
claim carried forward: **U63** (fallow dead-code rows, voiceworks-toolkit `@version 170`,
`prepare-release.mjs` shelf gap), **Cycle 5**'s R2 bulk-upload owner action, **Stripe live-key**
status (the sandbox guard is in `workers/yomu-support/src/index.ts:820` and returns 503, so a
test-mode key still blocks donations), **U62**'s mirror counts, the **U43** proxy gaps under the
owner's re-framing, and every `[OPEN]` in the archive's D-list that the 2026-07-26 note already said
had not been re-checked. **Do that before working any of it.**

---

# ARCHIVE — the pre-reconciliation document, preserved verbatim

Nothing below this line was edited. Where it conflicts with Part 1 or Part 2, Part 1 and Part 2 win.

# Yomu Backlog — Quality-Squad Working Document

Last updated: 2026-07-03 (rewritten in place as the quality-squad working doc)
Truth source for shipped state: `git show origin/main:CHANGELOG.md` — authoritative through **1.6.14** (this worktree's `CHANGELOG.md` lags at 1.6.6; always check origin/main before owning a "not shipped" claim).
Evidence keys: `[thread <id>]` = Codex session id; `[wl:<id>]` = wishlist item id; `[v<X.Y.Z>]` = shipped release; user quotes are verbatim.

---

## Goal

The quality squad's mission is to turn Yomu from an impressive-but-fragile pile of features into a **real, releasable product** — something a first-time user (Canna on an iPad, tk on a commute, Arka wanting pitch training) installs, understands, and keeps using without hitting a wall. We ship **continuously in small, individually-verified slices**: each user-facing fix bumps a version, is proven in the actual browser/app target (not just unit tests, because our hardest surfaces — BookWalker canvas, YouTube SPA, Netflix captions — are exactly the ones CI can only fake), pushes to `main`, and has its release asset checked. Net-negative releases (delete more than we add) are welcome; the enemy is the recurring-regression treadmill where the same bug is re-fixed across a dozen throwaway worktrees. Concretely: **kill the top bug cycles by adding the missing invariant/identity primitive each one lacks, converge the duplicated-but-diverged implementations that cause "works for henry, not for the user," finish the half-built features (Study 2.0 merge, Bunpro parity, hosted audio data, offline SRS), and make the first-run experience — install, onboarding, study, docs — obviously good.** Success = a user can be handed Yomu cold and reach immersion reading + SRS without asking a single "how do I…?" question.

---

## Recurring bug cycles (concentrate here)

These are ranked by *effort sunk × recurrence*, not raw session count. Each is a place where fixes keep reopening because a structural primitive is missing or two implementations have diverged. **Breaking these cycles is the highest-leverage work in this doc.** Evidence: `codex-cycles.json` cycle-mining pass over 2,265 Yomu-era sessions.

### Cycle 1 — BookWalker / manga-canvas OCR (P0)
- [x] **P0 — Add a single canvas-page-identity primitive keyed on per-canvas leaf content hash; replace every ad-hoc identity proxy. — VERIFIED NOT REPRODUCIBLE 2026-07-31.** `src/reader/ocr/canvas-page-identity.ts:1-26,49-65,81-105` is the single content-derived identity owner and rejects empty, bare global-epoch, and stable-surface tokens as real content. `src/reader/ocr/canvas-page-signature.ts:48-53,67-94` delegates identity/change decisions to it and explicitly excludes scroll from page identity; `src/reader/ocr/controller.ts:72-75,2310-2337,3024-3029,3077-3079` consumes it for capture and invalidation. The primitive shipped in v1.6.35 (`85fee5122`) and was later consolidated by `9633e0d4e`.
- [x] **P0 — Add a cross-mode OCR invariant test matrix: `same content → exactly one scan; changed content → exactly one rescan` across {paged, cty=2 vertical, Firefox-fetch, homepage}. — VERIFIED NOT REPRODUCIBLE 2026-07-31.** The centralized identity matrix is `tests/reader/canvas-page-identity.test.ts:1-15,247-268,369-496`; the controller/cache seam and Firefox frame reuse are pinned in `tests/reader/ocr-reader-raster-surfaces.test.ts:373-405,3528-3594`, with real-engine mode coverage in `scripts/bookwalker-modes-ocr-smoke.mjs:219-242,342`. The named “homepage” failure belongs to the separate reader-vs-storefront P1 immediately below, not canvas-content identity. The two policy choices are also already deliberate: OCR uses a 30-second minimum attempt budget (`src/reader/ocr/ocr-shared.ts:8-20`), while empty raster results retry at most three times and then enter a same-session negative cache (`src/reader/ocr/controller.ts:194,1118-1196`; `tests/reader/ocr-reader-raster-surfaces.test.ts:1133-1235`).
- [ ] **P1 — De-overfit the reader-vs-storefront classifier (`isBookWalkerReaderUrl` returns true on any lone canvas).** This misfire is why enabling Yomu on the BookWalker homepage breaks the carousel/product-grid/sidebar. Replace the "any canvas = reader" heuristic. Evidence: `[wl:bookwalker-ocr]` note, shipped-index `bookwalker_storefront_carousel_containment` (patched 6× across 1.4.150→1.5.7 — a patched-not-fixed smell).

### Cycle 2 — Study / new-tab flow (P0, user's top priority)
- [x] **P0 — Collapse to ONE study surface with a single `activeStudyStepIndex`; delete the legacy `NewTabMode` word|recall|kanji|listen state and mode tabs.** 106 sessions / 31 days. Root cause: **two diverging implementations.** A new step model (`study-session.ts`) was layered ON TOP of the legacy mode system (`state.ts NewTabMode` + `listenSubMode`) in `controller.ts` and never unified — the controller still renders one legacy mode at a time and maps steps back to old modes, so the "merged flow" is metadata only. Confirmed still layered at checkpoints `[thread 019f14cd]` lines 3949, 10833, 10933, 12172, 17115. Break-the-cycle: actually delete the legacy path; `controller.ts` is a mega-file (route parse + modes + queues + render + keyboard + URL sync + reset) which is why every study change ripples — split it as part of the collapse. Evidence: `codex-cycles.json` rank 2, `[thread 019f14cd]` GAP 1.
- [x] **P0 — Add a single "final-reveal boundary" invariant: no reading / pitch / furigana / correctness renders before the last step. Remove the test that locked in the pre-reveal pitch class.** Root cause: reveal state is split across ≥3 flags (`state.revealAnswer`, `listenRevealed`, per-parse pitch classes) with no single boundary, so answer-leak-before-reveal regresses at a new call site every time it is patched — flagged by 5+ separate subagents at different line numbers, and a test even *locked in* the leak `[thread 019f14cd]` GAP 2. Users feel it: tk "its tuff to study when I already know the answer" `[wl:study-furigana-front-toggle]`. Break-the-cycle: one reveal-boundary invariant test. **[2026-07-03 gap triage: VERIFIED FIXED on main — see scratchpad/gap-triage; final-reveal leaks, multi-kanji testing, per-step disable, trust-bug grade fall-through, hosted-audio-first, reveal depth, local-SRS UI, importer z-index/SPA-nav, BookWalker retry/zoom/hover ALL confirmed closed by the 1.6.x wave. Remaining: internal NewTabMode dual-substrate (deferred mechanical refactor), video-shadowing pitch feedback (optional), Firefox HttpOnly cookie hardening (unconfirmed defect).]**

### Cycle 3 — Settings / storage / factory-reset (P1)
- [ ] **P1 — Introduce a central managed-state registry every store must register with (key + clearer + flush-suppression); add a reset invariant test that fails when any `yomu-*` / `jpdb-reader-*` key survives `resetAllData`.** 103 sessions / 28 days. Root cause: **no single source of truth for "what is managed state."** Factory reset enumerates managed keys ≥4 different ways (`GM_listValues`, prefix scan, `KNOWN_MANAGED_STORAGE_KEYS` exact list, `MANAGED_INDEXED_DB_NAMES`) and every new store (pitch-srs debounced writes, cloud-sync pending action, bunpro token) is added without registering in all of them → each new feature silently escapes reset. Debounced stores also re-write their keys during the reset-triggered reload. User-visible: tk "colors got defaulted as I updated" `[wl:settings-reset-on-update]`; henry's own P0 ask "factory reset is not fully resetting ALL my settings (my pill selections had been maintained)" `[thread 019f14cd]`. Two `settings-storage-recovery-*` worktrees are dirty and unmerged (see Dedup). Evidence: `codex-cycles.json` rank 3.

### Cycle 4 — YouTube layout / subtitles / fullscreen / filtering (P1)
- [ ] **P1 — Replace structure-pinned YouTube hooks with a resilient observer that re-anchors on YT mutation; promote `scripts/yt-live-harness.mjs` into the release gate for title-collapse / fullscreen / iPad-player / Shorts.** 97 sessions / 26 days / **18 regression-titled threads** — "Investigate YouTube subtitle regress" is literally the SAME thread title on 05-17 AND 05-19, then re-audited 05-30/05-31. Root cause: **overfitted site-specific monkeypatching against a hostile, frequently-changing SPA with no faithful test.** YT owns its DOM and re-renders aggressively; our hooks are pinned to YT's current structure and break on every reflow or layout variant (iPad single-column full-bleed, real-fullscreen top-layer, Shorts portrait). Smokes only FAKE CSS-fullscreen / mock `play()`, so the exact failures (top-layer rect collapse, autoplay-gesture blocks) are structurally invisible to CI — every regression must be caught by a user, then re-patched. User-visible: Canna "due to yomu I can't play any video… Froze" `[wl:youtube-performance-freeze]`. Evidence: `codex-cycles.json` rank 4, MEMORY `yomu-youtube-fullscreen-top-layer`, `yomu-yt-live-harness`.

### Cycle 5 — Hosted audio source ordering + data gap (P1)
- [ ] **P1 — Define an explicit ordered source priority with a test asserting hosted-audio-first for BOTH clean AND migrated installs; finish the R2 bulk upload.** 95 sessions / 27 days. Root cause: **source resolution has no ordering invariant + a real data gap.** The resolver appends required defaults AFTER configured sources and dedupes by type, so "hosted first" is not guaranteed for upgraded users (dedupe-by-type lets an existing custom-json source block hosted) — every migration patch fixes one path and misses another. Compounded by the R2 bucket being nearly empty (~11 words) until the 2026-07-02 export (298,767 terms / 431,993 files) which is **still not uploaded** — so "audio works" depended on data that was never there; live words (e.g. 保有) still fall back to JapanesePod101. Evidence: `codex-cycles.json` rank 5, `[thread 019f2149]` (BLOCKED on bulk upload), MEMORY `yomu-hosted-audio-fallback`.

### Cycle 6 — Subtitle drawer / panel across surfaces (P1)
- [ ] **P1 — Define one drawer layout contract + per-host adapter; add a control-overflow snapshot test across the host matrix {YouTube overlay, hosted video, Netflix DOM, uploaded file, fullscreen top-layer, mobile}.** 93 sessions / 30 days. Root cause: **the drawer serves too many surfaces through shared CSS/DOM whose specificity and layout assumptions collide with each host.** Each host fix (Netflix caption populate, iPad MIME, fullscreen reparent, mobile wrap) is added without a shared contract, so control clipping/wrapping and duplicate-button issues recur; drawer CSS also fights a `reader-root :where(button)` reset needing ≥(0,1,1) specificity. Evidence: `codex-cycles.json` rank 6, MEMORY `yomu-subtitle-panel-options`.

### Cycle 7 — Furigana / ruby alignment (P2)
- [ ] **P2 — Extract one ruby rendering helper; add a per-surface visual-alignment snapshot suite treating "furigana stays aligned under wrap / overflow / vertical" as an explicit invariant.** 76 sessions / 26 days. Root cause: **no shared ruby-layout primitive** — alignment is hand-tuned per surface (dictionary, card, hero, settings popover, OCR overlay, vertical text) and each surface's CSS drifts independently. Because ruby interacts with `white-space` / `overflow-wrap` / container width / vertical writing mode, a fix for one surface breaks another (hero furigana vs `pre-wrap` — MEMORY `yomu-hero-furigana-prewrap`). Evidence: `codex-cycles.json` rank 7, swept once as `[v1.4.111]`.

### Cycle 8 — Pitch / decoration (underline / colour / passive words) (P2)
- [ ] **P2 — Scope decoration to a guarded container, keep the class re-assert observer, and enforce `smoke:passive-decoration` + a pitch-count test in the gate.** 98 sessions / 29 days (count inflated by shared colour/branding threads; genuine core = partial-underline + passive-word decoration + pitch fallback). Root cause: decoration is expressed via root-level colour-channel classes that hostile SPAs (Discord/ChatGPT) clobber, plus per-word CSS a single blanket rule can strip across all words (the 1.5.4 blanket-strip → hover-flicker regression, fixed 1.6.1). Dual pitch-enrichment paths (local uncapped vs YouTube paced) drop items differently (12-cap drop, fixed 1.4.32). Both invariant smokes already exist — just enforce them. Evidence: `codex-cycles.json` rank 8, MEMORY `yomu-passive-decoration-split`, `yomu-spa-root-class-clobber`, `yomu-pitch-enrichment-paths`.

### Cycle 9 — Parse / dictionary / provider resolution (P1)
- [ ] **P1 — Finish the provider-adapter consolidation: move popup/card actions off the `ApiSrsProviderId = jpdb|jiten` enum onto the provider-neutral adapter (jpdb / jiten / bunpro / anki / local / dictionary).** 229 sessions / 32 days (highest raw count but largely feature-building; the recurring-bug sub-core is provider-resolution order + popover hover flicker). Root cause: **providers are hard-coded in ~8 places** (`srs-providers.ts`, `review-targets.ts`, `grade-queue.ts`, `popover-renderer.ts`, stats, settings) rather than behind one adapter, so altering a provider (esp. Bunpro) leaks across layers and reopens resolution/grading bugs. The study rework started "provider-neutral SRS adapter interfaces" but left popup/card actions on the old enum. Evidence: `codex-cycles.json` rank 9 + systemic finding 4, MEMORY `yomu-bunpro-grading-parity`. **Note:** two symptoms of this cycle were converged in `[v1.6.14]` (jiten-fallback lookup module unified; Bunpro-only "Never forget/Blacklist" buttons gated) — the adapter itself is still half-done.

### Cycle 10 — Release / CI / bundle-size / Greasy Fork (P1)
- [ ] **P1 — Enforce a build-time size budget that fails fast well under the 2 MB GF cap (not just the late verify gate).** 190 sessions / 36 days / 22 GF-specific. Root cause 1 (bundle size): core sits permanently ~1-2% under the hard 2 MB cap, so every feature triggers a size firefight → another companion split → more `@require`/SRI publish fragility. There is no early budget, only a late gate, so work repeatedly overshoots then gets shed. Evidence: `codex-cycles.json` rank 10, MEMORY `yomu-bundle-size-companions`.
- [ ] **P1 — Fix the New Tab generated-test check so the core `Release` workflow is green and publishes automatically; stop manual publishing.** Root cause 2 (publish pipeline): the `Release` workflow has been RED at a New Tab generated-test check (elementFromPoint / BroadcastChannel flake) for many releases (v1.5.5, v1.5.20, others published MANUALLY). **A permanently-red release gate hides real release breakage and normalizes manual publishing.** Evidence: `codex-cycles.json` unfinishedThreads, MEMORY `yomu-codex-thread-sweep-1411` (Release workflow flakes gate the release page). The SRI-annotate-after-trim ordering fix already landed `[v1.6.5]` / `[thread 019f251b]` — keep it under test.

### Cycle 11 — Yomu Gaming / Electron (P2, at-risk-of-becoming-a-cycle)
- [ ] **P2 — Route gaming's inline lookup through the existing reader `boot` + `collectScanTargets` instead of a parallel overlay implementation.** 17 sessions / 4-day BUILD burst (not yet a long cycle, but re-audited repeatedly within the burst: Audit onboarding → Fix onboarding → Audit app → Polish → Audit release blockers → Fix startup UI). Root cause: **the Electron surface reimplements reader/overlay concerns instead of reusing them**, so it re-hits problems the web reader already solved (inline lookup, vertical text, chrome exclusion, 1920 cap). Build mocks OCR so real behaviour is unverified in CI. Evidence: `codex-cycles.json` rank 11, MEMORY `yomu-gaming-electron` ("inline reader feasible via reader/app/boot + collectScanTargets").

---

## Wishlist triage

Every user-raised item from `wishlist-items.json`, triaged against the shipped index. **Done** = fully covered by a shipped release (struck through, version noted). **Done but needs UX polish** = the capability shipped but a user does not actually get a good experience — the gap is specified. **Not yet actioned** = genuinely open. `askCount` = how many times users raised it.

### Done

- [ ] ~~Local/offline parsing (don't require jiten to parse)~~ — **[v1.6.0]** `parserProvider 'local'` default for new installs, short-circuits before jiten/jpdb when term dicts confirmed. `[wl:local-parsing]` (Iov + tk, askCount 3), MEMORY `yomu-local-parsing`.
- [ ] ~~Single-word lookup vs full-sentence translation, both as independent toggles~~ — resolved via install-dictionary + disable-sentence-translation; **[v1.6.13]** further hides the translation section when nothing is meaningfully Japanese. `[wl:single-word-vs-sentence-translation]` (Canna).
- [ ] ~~Real (non-AI) audio sources by default, fast, on hover~~ — **[v1.5.0 / v1.5.18 / v1.5.19]** hosted audio worker + R2 manifest + jpod101 fallback as default source. `[wl:real-audio-sources]` (henry hosting audio.yomureader.com). **Caveat:** the R2 data is not fully uploaded — see Cycle 5 and "Incomplete features."
- [ ] ~~Frequency dictionary pill on word popups by default~~ — **[v1.4.215 / v1.4.37 / v1.4.147]** frequency merged into lookup pills, shown by default. `[wl:frequency-on-by-default]` (tk "im having to click on jiten to see").
- [ ] ~~Frequency rendered as a pill, not a naked `#18447` heading~~ — **[v1.4.147 / v1.4.215]**. `[thread 019f14cd]` original ask.
- [ ] ~~Version number shown in Help~~ — **[v1.4.137 / v1.4.199-206]** Help shows version / latest / duplicate-script / update link. `[wl:version-in-help]`.
- [ ] ~~Generic annotation containment breaking Discord display names (e.g. Canna波蘭)~~ — **[v1.4.127]** (+OKLab dark-surface [v1.4.158]), no hardcoded Discord logic. `[wl:discord-name-broken]`, MEMORY `yomu-spa-root-class-clobber`.
- [ ] ~~Premature TTS fallback replaced by real audio on next gesture~~ — **[v1.4.130]**. `[wl:real-audio-sources]` sub-item.
- [ ] ~~Apple Pencil / stylus taps activate popup links/buttons like finger/mouse~~ — **[v1.4.133 / v1.4.142 / v1.4.39]**. `[wl]` pencil activation.
- [ ] ~~Batch mining (auto-mine unknown words from an episode, list at the end) — the Migaku killer feature~~ — **[v1.4.242 / v1.4.245 / v1.5.20]** Batch Mine tab compares against known vocab, compiles cards, per-row or batch grade. `[wl:batch-mining]` (Arka, strategic vs Migaku).
- [ ] ~~Grading for accountless users (local queued SRS)~~ — **[v1.5.0]** local queued grading + local SRS mining provider. `[wl:grading-without-account]`. **Caveat:** no visible import/mine UI into `yomu:srs-local` — see "Done but needs UX polish."
- [ ] ~~Offline / queued SRS reviews that sync on reconnect~~ — **[v1.4.220 / v1.4.135 / v1.4.137]** warm cards up front, queue grades, sync on reconnect, status UI. `[wl:offline-queued-reviews]` (tk walks 20 min for data), MEMORY confirms eventually-consistent model.
- [ ] ~~SRS sync/queue status indicator ("a small ball is enough")~~ — shipped as part of offline status UI **[v1.4.220]**. `[wl:srs-status-indicator]` (tk).
- [ ] ~~Pass/Fail two-point grading in Study settings~~ — **[v1.4.137 / v1.4.145]**. `[wl:pass-fail-2point-grading]` (tk + Arka).
- [ ] ~~Study page shows reading/furigana for the word~~ — **[v1.4.137 / v1.4.220 / v1.4.145]** answer backs surface furigana/pitch/frequency/audio. `[wl:study-page-furigana-reading]` (tk + Canna). **Caveat:** front-vs-back placement — see "Done but needs UX polish."
- [ ] ~~Dedicated listening-heavy study audio mode + pitch-accent flashcard mode~~ — **[v1.4.233 / v1.4.235]** Listen mode Perceive/Recall/Shadow over local SRS deck. `[wl:pitch-training-mode]` (Arka), `[wl]` listening mode. **Caveat:** pitch prompts flagged pointless — see polish.
- [ ] ~~Shadowing / listening practice workflow~~ — **[v1.4.225 / v1.4.228 / v1.4.233 / v1.5.5]** Shadow tab + mic recording + line-aware controls + loop/reveal. `[wl:shadowing-tool]` (Arka + Canna). **Caveat:** record-and-playback only, not the requested automatic pronunciation scoring — see "Incomplete features."
- [ ] ~~Appearance/color settings resetting on update~~ — **[v1.4.239]** settings recovery restores theme/accent under prior storage keys. `[wl:settings-reset-on-update]` (tk). **Caveat:** factory-reset completeness is a separate open cycle (Cycle 3).
- [ ] ~~Mining words into a jiten deck (not only jpdb decks in the picker)~~ — jiten mining path shipped; Canna found it after updating. `[wl:mine-to-jiten-deck]` (tk + Canna). **Verify** the picker actually lists jiten decks with no jpdb account.
- [ ] ~~YouTube hidden-video notice two useful buttons only (no truncated "よむ s…" label)~~ — **[v1.4.128]** + auto-dismiss 10s **[v1.5.22]**. `[wl]` youtube notice.
- [ ] ~~Mokuro "no space above text" swap/blink glitch~~ — **[v1.3.21 / v1.3.27 / v1.4.135]** offscreen cleanup + tight-panel handling. `[wl:glitch-no-space-above-text]` (Canna, early mokuro.moe).
- [ ] ~~BookWalker two-page/double-spread OCR~~ — **[v1.3.11 / v1.5.1]** OCRs both pages. `[wl:bookwalker-other-view-mode]` (henry "I can fix double"). **Caveat:** cty=2 vertical/continuous still has open bugs — see Cycle 1 and Deep verification.
- [ ] ~~Improve yomuyomu support (yomu was breaking it)~~ — **[v1.4.140 / v1.4.218]** YomuYomu reader parser native-first + passive lookup. `[wl:yomuyomu-tadoku-graded-readers]` (henry "yomu breaks yomuyomu").
- [ ] ~~Steam Deck / PC gaming guide + first-party gaming app~~ — **[v1.4.144 / v1.4.178]** replaced third-party guide; Electron app with in-place OCR. `[wl:steamdeck-gaming-overlay]`, `[wl:yomininja-docs]` (tk + henry). **Caveat:** usability + Steam Deck game-mode not proven — see Deep verification.
- [ ] ~~AnkiConnect setup help panel (CORS/mobile/Brave guidance)~~ — **[v1.4.137 / v1.4.199-206]**. `[wl:anki-import-words]` (Canna). **Caveat:** actual import is still high-friction — see polish.
- [ ] ~~Homepage hero "Install" + Watch + Read CTAs~~ — **[v1.4.137 / v1.5.2]**. `[wl]` homepage hero.

### Done but needs UX polish (what shipped vs what a user actually experiences)

- [x] **P0 — Study front-vs-back furigana. VERIFIED FIXED 2026-08-03, shipped v1.6.269 (2026-07-21).**
      tk's complaint — "now we have furigana on the front… tuff to study when I already know the
      answer" — is closed. CHANGELOG 1.6.269: *"Review card fronts no longer spoil the answer: the
      word you are being tested on stays a plain prompt on the question side, with no furigana and no
      pitch underline, and is annotated as usual once you reveal the answer."* The front-detection
      predicate is `isJitenStudyFrontPrompt` wired through `isReviewCardFrontPromptTarget` ->
      `shouldRejectProfileScanTarget` in `src/reader/app/site-parsers.ts`, and it is pinned by
      `tests/reader/jiten-study-front-annotation.test.ts`,
      `tests/reader/jpdb-review-front-targets.test.ts` and
      `tests/reader/bunpro-review-front-annotation.test.ts` — 9 tests, run green on this commit.
      The hosted Study page always behaved correctly; the fix brought the native sites in line.
- [ ] **P1 — Auto-read/auto-audio on hover default.** Shipped: hover audio works and is toggleable. Experienced: it fires on **every** hover and Canna "had to turn off the automatic reading every time I hover smt… I just turned it off bc it was annoying." Polish: make the off-state discoverable (welcome splash + puck quick-toggle), consider default-off or a modifier-gated quiet mode. `[wl:autoread-on-hover-annoying]` (askCount 2).
- [ ] **P1 — Accountless / local SRS has no visible entry point.** Shipped: local queued grading + `yomu:srs-local` store **[v1.5.0]**. Experienced: there is **no visible UI action** to import or mine into the local deck, and "auto" source only loads JPDB+Anki, not yomu-local. Polish: add a visible mine/import button; make "auto" actually local-first; sync-on-account-creation and hide connect hints once synced. `[thread 019f14cd]` GAP 5, line 2904.
- [ ] **P1 — Shadowing is playback-only, not scoring.** Shipped: Shadow tab + mic record/playback **[v1.5.5]**. Experienced: no feedback on whether your pronunciation/pitch was right (Arka wanted kotu.io-style scoring; henry "I want to make the first one"). Polish: real pronunciation/pitch-contour scoring (references: `references/PitchDetect`, `references/onsei`, `references/pitchfinder`, `references/kotu.kez.io`) OR hide "scoring" affordances until it exists. `[wl:shadowing-tool]`, `[thread 019f14cd]` GAP 3 (line 13694 P0).
- [ ] **P1 — Listen/pitch mode prompts are noise.** Shipped: Listen mode **[v1.4.233/235]**. Experienced: henry himself flagged "'2 pitch due' — this is pointless", "'Recall the pitch accent' — the users do not need this", "again and got it can be removed". Polish: strip the pointless stats/prompts. `[thread 019f14cd]` original ask.
- [ ] **P1 — Anki import still needs a PC + Tailscale.** Shipped: AnkiConnect help panel **[v1.4.137]** + jiten vocabulary import path. Experienced: Canna "can connect my progress anki with this?" → the path needs a running PC and Tailscale for mobile, and AnkiConnect sync is slow. Polish: a lower-friction known-words import (file upload / bulk paste). Ties to `import-known-words-bulk`. `[wl:anki-import-words]`.
- [ ] **P1 — Final study reveal is too thin.** Shipped: reveal shows first meaning + composed-of. Experienced: henry wants **all dictionary entries like the Search tab**, a JPDB `#frequency` pill, and jiten frequency shown only in pills (currently doubled). Polish per `[thread 019f14cd]` GAP 8.
- [ ] **P2 — Dark mode contrast bugs.** Shipped: dark surfaces largely handled **[v1.4.127/158]**. Experienced: Canna "the white is unreadable" on the dark menu; only fixable by switching to light. Polish: audit dark-menu text contrast (settings/menus specifically). `[wl:dark-mode-unreadable-text]`.
- [ ] **P2 — Default new-word color.** Shipped: per-user color settings. Experienced: Canna "better to have white as new word… less disturbing than blue." Polish: change the default (she notes users can override). `[wl:default-new-word-color]`.
- [ ] **P2 — "Japanese page" mode is invisible.** Shipped: prefer-Japanese-site redirect **[v1.4.46+]**. Experienced: Canna "forgot I had the Japanese page option on and was confused with Japanese on ur site." Polish: a visible indicator that the mode is active. `[wl:japanese-page-mode-obvious]`.
- [ ] **P2 — Install downloads a raw `.js` instead of launching the manager.** Shipped: GF install endpoint. Experienced: tk "it downloads a .js file instead of launching scriptcat" (dragging in worked); Canna hit a non-Tampermonkey popup blocking the PC update. Polish: fix the install/update content-type and the new-domain popup. `[wl:scriptcat-install-js-download]`, `[wl:pc-update-blocked-popup]`.
- [ ] **P2 — BookWalker OCR overlay always visible + no per-page retry (spans ALL sites).** Shipped: OCR overlay + hover reveal **[v1.5.7/13]**. Experienced (post-1.5.16, unverified): overlay shows even when NOT hovering on all sites; no manual "retry OCR for this page" control; misaligned when the user zooms. Polish detailed in Deep verification (BookWalker). `[thread 019f066b]` remaining work.

### Not yet actioned

- [ ] **P1 — Keyboard word-to-word navigation** through selected text (step word-to-word via shortcuts, no mouse hover). henry agreed ("I can set that up"). Not shipped. `[wl:keyboard-word-navigation]` (アミン).
- [ ] **P1 — Compound-word component lookup** (跳梁跋扈 → 跳梁 + 跋扈): a "composed of" section OR Yomitan-style secondary-match popup, since once the longest match is chosen there's no way to look up components. henry "I'll get this implemented." Not shipped. `[wl:compound-word-components]` (Iov, long thoughtful ask).
- [ ] **P1 — Configurable popup font (JPDB-like default)** — the bold popup font is hard to read for complex kanji; アミン wants jpdb's font. Not shipped. `[wl:popup-font-config]` (askCount 2).
- [ ] **P1 — Popup position flips to top when the word is near the bottom** (translation currently covers the bottom of a manga page). Not shipped. `[wl:popup-position-over-content]` (Canna).
- [ ] **P1 — YouTube "disable subtitles" quick toggle** — JP auto-subs invade English videos and aren't easy to turn off. henry agreed. Partial: a subtitle rail eye toggle shipped **[v1.6.7]**; verify it satisfies tk's "quick toggle." `[wl:youtube-disable-subs-toggle]` (tk).
- [ ] **P1 — Auto-hide subtitle panel; show line info only on pause** (optionally AI grammar/context). This is アミン's original video-player request and the root of tk's "subtitles disappear after hiding sidebar" bug. Partial: auto-hide-when-scrolled + open-on-pause toggle **[v1.4.143/1.6.4/1.6.7]**; the "paused-info side tab explains the line" experience is not delivered. `[wl:videoplayer-autohide-onpause-ai]`, `[wl:videoplayer-subs-disappear]`.
- [ ] **P1 — Netflix support** (subtitle parsing + fix furigana glitch on JP soft-subs; Alice in Borderland has JP subs to test). Partial: Netflix-shaped reactive caption hardening **[v1.4.135/1.5.3]**; real-Netflix furigana-overlap reverify open. `[wl:netflix-support]` (Canna, askCount 3).
- [ ] **P1 — Yomu-video subtitle upload actually works (.ass especially)** — Canna "nothing can be uploaded… maybe it has smt to do with .ass." Partial: mobile/iPad MIME + multifile **[v1.5.3]**, `.ass` parser hardened **[v1.4.135]**; the `[Events]` `Format:`-line fix and real upload path need reverify. `[wl:subs-upload-ass-fail]`, `[wl:videoplayer-ass-parser]` (tk root-caused: two `Format:` lines, code grabbed the styles one; needs per-line guard).
- [ ] **P1 — Reuse installed Yomitan dictionaries** (avoid 2× storage) — tk "any way it can read these… I get 2x more storage." Not shipped (only "export from Yomitan" docs implied). `[wl:reuse-yomitan-dictionaries]`. Ties to "Incomplete: dictionary storage migration."
- [ ] **P2 — OCR misses some kanji** (e.g. 事 not detected on mokuro). Not individually confirmed fixed. `[wl:ocr-missing-kanji]` (Canna).
- [ ] **P2 — Prescan/auto-OCR next pages** so it updates automatically (no manual re-trigger); Canna "I wish it updated automatically on iPad." henry "ill see if we can prescan the next pages." Canvas prefetch exists **[v1.1.0 OCR prefetch]** (MEMORY) — verify it covers BookWalker vertical. `[wl:ocr-prescan-next-pages]`.
- [ ] **P2 — Generalize OCR to other manga apps/sites** once BookWalker is solid. Blocked on Cycle 1. `[wl:ocr-double-spread-general]`.
- [ ] **P2 — 4-point grade mapping for jiten** (jiten does 4, jpdb 5). Partial: provider toggle + settings select **[v1.4.4/1.6.3]**; explicit native 4-point scale mapping not confirmed. `[wl:pass-fail-2point-grading]` (Arka's sub-ask).
- [ ] **P2 — Import/mark known words in bulk** (instead of grading each). Not shipped. `[wl:import-known-words-bulk]` (henry "I can do that in future").
- [ ] **P2 — Grading on the immersion-kit reading test without a jiten account.** Not confirmed. `[wl:grading-without-account]` sub-case.
- [ ] **P2 — Yomu-video subtitle options: pause-on-hover, lower opacity, font, position.** Partial via compact controls **[v1.4.121/124/134]**; confirm pause-on-**hover** (not click) exists. `[wl:videoplayer-subtitle-options]` (tk).
- [ ] **P2 — Yomu-video subtitles on fullscreen video.** Partial: fullscreen subs shipped for hosted/YT **[v1.4.122/134]**; confirm on the local player fullscreen. `[wl:videoplayer-fullscreen-subs]` (tk).
- [ ] **P2 — Crunchyroll support** — forces the app / won't play in a website window. Low priority per henry (app-forced blocker). `[wl:crunchyroll-support]` (Canna).
- [ ] **P2 — Officially support one anime site with auto-added JP subs** (reanime.to candidate; wotaku list). Partial: broadened player detection **[v1.4.135/146]**; no named site individually confirmed. `[wl:anime-site-autosubs]` (henry).
- [ ] **P2 — Hoshi Reader support** — best novel reader on Android/iOS but a native app; ties into whole-device shortcut plan. Blocked (native app). `[wl:hoshi-reader-support]` (tk "life changing").
- [ ] **P2 — Live transcription (ASMR/audio-only)** — henry has a prior 1000+ user tool to fold in; needs GPU/Apple M or cloud server. Not shipped (long-term). `[wl:live-transcription-asmr]`.
- [ ] **P2 — PWA on Firefox Android** — tk "no pwa"; henry "that is easy." PWA shells shipped for study/video/pdf **[v1.4.135/140]**; confirm Firefox-Android installability. `[wl:pwa]`.
- [ ] **P2 — Get listed on wotaku.wiki / themoeway lists.** Growth/distribution, owner-driven. `[wl:recommend-on-wiki]`.

### Blocked on owner credentials / external (captured, not active)

- [ ] **P2 — Ship as a proper app (App Store / easier install)** — the single biggest adoption blocker across ALL users (Canna "make it a proper app," henry "I know its really hard to install rn so people dont wanna try," askCount 6). Needs store accounts, packaging, review. `[wl:native-app-store]`.
- [ ] **P2 — Whole-device parsing via Apple Shortcuts (screenshot → app, on-screen button, à la TapTranslate)** — tk & Canna; needs App Store presence first. `[wl:whole-phone-parsing-shortcut]`.

---

## Deep verification targets

These are empirical walks/audits the squad must actually perform (browser / device / computer-use evidence, not unit tests). Flagged by the user as where confidence is lowest.

### DV-1 — Study tab, all-modes UX walk (P0, USER'S TOP PRIORITY)
- [ ] **P0 — Walk every study mode end-to-end as a real learner and record what actually happens vs the spec.** Modes: word / recall / kanji / listen / perceive / shadow / speak → the intended single merged card graded once at the end. This is the top priority. Evidence: `[thread 019f14cd]` (101 MB study rework) — the merge was *never truly delivered* (Cycle 2). Specific nuance gaps to verify/close from that thread:
  - [x] **P0** — merged into ONE flow. **VERIFIED 2026-08-03:** `type NewTabMode` and `state.mode`
        branching both have zero matches in src/; the order is kanji-doodle -> word -> type-word ->
        recall-cloze -> listen-pitch -> speaking -> final-reveal (`study-session.ts:115-127`) (GAP 1).
  - [x] **P0** — single final reveal. **VERIFIED 2026-08-03**, shipped v1.6.269: review card fronts
        stay a plain prompt with no furigana and no pitch underline; pinned by
        jiten-study-front-annotation / jpdb-review-front-targets / bunpro-review-front-annotation,
        9 tests green (GAP 2).
  - [x] **P0** — multi-kanji words test every kanji. **VERIFIED 2026-08-03:** pinned by
        new-tab-study-session.test.ts "creates one kanji drawing step for each kanji in a word", and
        kana-only cards are covered by "omits listen and speak steps for a kana-only card" (GAP 6).
  - [x] **P0** — every study step is toggleable. **VERIFIED 2026-08-03 — the earlier finding was a
        misread.** The unconditional append in `normalizedChallengeStepOrder` builds the step ORDERING
        (so a saved partial order still positions every kind); the enable/disable filter is
        `disabled.has(kind)` in `mergedStudyStepsForCard`, which does exclude `word` — and disabling it
        correctly drops `type-word` with it. Pinned by the test named for this exact complaint,
        "honors a disabled word step instead of forcing it back into the flow" (GAP 6).
  - [ ] **P1** — make learning as **visual** as possible; staged reveal; show kanji mnemonics/Uchisen/Heisig AFTER a kanji step but NOT word-list/dictionary entries that give the reading away ("keep it clean and minimal, I am super torn," line 1291; lines 1218/1259).
  - [ ] **P1** — Speak is Rosetta-Stone-style automatic pronunciation/pitch-contour grading, and applies to YouTube/video shadowing too (line 13694 P0; GAP 3) — or is hidden until real scoring exists.
  - [ ] **P1** — hosted audio is default-ON as first source for everyone in study, all other audio sources default-off (line 14973; GAP 7).
  - [ ] **P1** — no-account users can do full SRS in local storage; on account creation it syncs and connect-hints disappear (line 2904; GAP 5).
  - [ ] **P1** — final reveal shows full dictionary entries (Search-tab style), JPDB `#frequency` pill, jiten frequency only in pills (dedupe the doubled jiten frequency) (GAP 8).
  - [ ] **P1** — replace the giant Replay button with the speaker icon; keyboard hints match the user's own settings and show on PC only (original ask, largely shipped [v1.5.5] — confirm).

### DV-2 — Yomu Gaming usability + Steam Deck compatibility (P1)
- [ ] **P1 — Run the Yomu Gaming Electron app against real games and the Steam Deck game-mode flow; compare against `references/`.** References available locally: `references/YomiNinja` (game OCR + experimental browser/PWA overlay), Tango Lens (Decky integration, tk's liked selection layout — may go paid), Decky-Translator, GameSentenceMiner, translumo. Verify/close the known blockers `[thread WS6]` / MEMORY `yomu-gaming-electron`:
  - [ ] **P1** — macOS screen-recording permission gate does not make the app DOA on first launch.
  - [ ] **P1** — area capture does not composite Yomu's own chrome into the OCR frame.
  - [ ] **P1** — vertical text is not truncated; the 1920 capture cap does not clip larger displays.
  - [ ] **P1** — lookup opens an **inline** reader (not a deep-link OUT to a browser) — the web reader never deep-links, gaming should match; route via `reader/app/boot` + `collectScanTargets` (Cycle 11).
  - [ ] **P1** — Steam Deck game-mode: works on the overlay without manual alt-tab/shortcut (tk "turbo opening browser kills me… on the overlay would be perfect"; `[wl:gaming-no-shortcut-overlay]`); Decky path documented.
  - [ ] **P2** — onboarding is stable (it was audited-then-fixed-then-re-audited repeatedly in 2 days — confirm it's actually settled).

### DV-3 — Docs + screenshots + onboarding refresh (P1)
- [ ] **P1 — Refresh docs, screenshots, and onboarding so a cold user reaches immersion + SRS without asking anything.** henry's own admission: docs "are a bit eh rn… super unhelpful." `[wl:docs-overhaul]`, `[wl:yomininja-docs]`, `[wl:install-instructions]`.
  - [ ] **P1** — replace `/guides/read-games-on-steam-deck` (reads like advertising competitors where Yomu doesn't work) with a Yomu-app implementation guide backed by the working gaming path (competitor refs → research notes only).
  - [ ] **P1** — capture **current** screenshots (many docs screenshots predate the 1.4.x–1.6.x UI); verify the newtab HTML is edited at the source template `public/newtab/index.html` (docs copy is generated — MEMORY `yomu-newtab-html-generated`).
  - [ ] **P1** — simplify the whole onboarding/settings flow — repeated meta-feedback "i am so confused" / henry "Jeeez I made it too hard"; mining setup, API keys, word colors, furigana toggles all confused Canna. `[wl:settings-too-confusing]` (askCount 2).
  - [ ] **P1** — guided jiten setup (what an API key is, where to click in jiten, paste, test connection, choose/create deck) — Canna didn't know what an API key is. Partial [v1.6.0/1.6.3]; full step-by-step not shipped.
  - [ ] **P2** — natural-language donation copy (no jargon like "CORS fallback / edge cache"); monthly goal from real costs, £10/month floor, Stripe not PayPal, dismissible + reappear ~weekly (`[thread 019f14cd]` line 15351). See "Incomplete: Stripe."
  - [ ] **P2** — every latest-CHANGELOG bullet needs verbatim ja copy in `docs/.vitepress/theme/index.ts` (i18n test gates it — MEMORY `yomu-changelog-ja-docs-test`).

### DV-4 — Rendering / performance empirical sweep across sites (P1)
- [ ] **P1 — Empirically sweep rendering + perf on real sites and record where it lags or breaks.** The whole point of the recurring-cycle work is caught here, live. Sites/surfaces with standing evidence: YouTube (freeze/lag until reload — Canna "froze," `[wl:youtube-performance-freeze]`); Discord/ChatGPT (framework-owned DOM, root-class clobber); BookWalker vertical (severe scroll lag); Netflix; Polymarket/compact controls; Wikibooks; Reddit; Google Search.
  - [ ] **P1** — YouTube with subtitle panel open stays responsive (virtualization landed [v1.4.229/237/1.6.8] — reconfirm live, signed-in, via `scripts/yt-live-harness.mjs`).
  - [ ] **P1** — no DOM-thrash re-scan loops (YouTube channel/title "writes whitespace into itself"; BookWalker rescan-every-scroll — Cycle 1).
  - [ ] **P2** — first-render highlights match hover-corrected paint (no blown-out white flash); grey/no-pitch hero settles without interaction.
  - [ ] **P2** — use the `web-perf` skill (Chrome DevTools MCP: LCP/INP/CLS) on the hosted reader/newtab/pdf/video apps.

### DV-5 — BookWalker leftover bugs (P0, from `[thread 019f066b]`)
- [ ] **P0 — Close the EXACT bugs the user listed after saying "release!" — the 1.5.17 fix was pushed but NEVER live-verified (session aborted mid-verification).**
      **TRIAGED 2026-08-03 — deliberately NOT closed.** Every sub-item below has shipped code, and
      marking them fixed on that basis would repeat the exact error this ticket exists to record: a
      fix was pushed and never live-verified. The deliverable here is VERIFICATION, not more code, so
      each sub-item now names what shipped and when, so the next session verifies instead of
      re-implementing.
      What blocks verification is not effort: it needs a signed-in BookWalker session, and the NFBR
      viewer never paints under an automated browser unless `navigator.webdriver` is masked — without
      that mask a live harness tests a dead viewer and reports false green. It is therefore owner-gated
      on account access, like the donations P0. From `[thread 019f066b]` remaining work (user verdict arc 39955→52376):
  - [x] **P0** — [ALL sites] OCR overlay visible without hover. **VERIFIED FIXED 2026-08-03, shipped
        v1.5.7 (2026-07-01).** CHANGELOG 1.5.7: *"Kept OCR text overlays hidden until the user hovers
        or focuses OCR hit targets, including automatic reader-raster OCR, so recognized text no
        longer remains visibly painted over pages."* The rule is
        `.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active)`
        (`src/reader/styles/reader-words-ocr.css:1670`), asserted at
        `tests/reader/styles.test.ts:402` — which also forbids bare `:focus`, so keyboard users get it
        without a mouse-only regression sneaking back (`41045`).
  - [ ] **P0** — Y-coordinate of the OCR hitbox is wrong while X is correct, especially vertical.
        **STILL OPEN, but code has shipped — do not re-implement before verifying.** v1.5.14
        re-captures ready frames after viewer zoom/reflow "so hover hit targets do not keep a stale
        vertical coordinate map"; a separate register bug with the same symptom was root-caused and
        fixed in v1.8.23 (safeBottomInset moving text off its own glyphs). Whether either closes THIS
        report is unverified. ("the x coordinate is fine the y is wrong," `52376`; pinned root cause = vertical hitbox height expansion; 1.5.17 fix unverified).
  - [ ] **P0** — BookWalker rescans previously-scanned images on every scroll. **STILL OPEN, but
        v1.5.16 claims exactly this**: "Keeps manually cropped BookWalker OCR frames aligned during
        ordinary scroll without rescanning, while re-capturing them when the underlying canvas scale
        changes." Verify against that before writing anything — same as Cycle 1 invariant.
  - [ ] **P0** — flashes between "Scanning" and "Could not read text". **STILL OPEN, and THREE
        separate causes have already been fixed** — v1.5.17 (bitmap cache by canonical asset URL, so a
        retry stops re-requesting expired signed URLs), v1.6.127 (Firefox rebuilds from BookWalker's
        own signed images), v1.6.143 (the scan deadline had reused the 6-second audio timeout, killing
        healthy-but-slow iPad scans and remembering the page as permanently failed; now a 30-second
        floor plus one retry). If it still flashes, it is a FOURTH cause — measure before assuming
        (`41045`, `52332` "actually a lot worse than earlier versions").
  - [ ] **P1** — some pages still don't fully OCR (unknown root cause) and there is **no manual "retry OCR for this page" control** — user explicitly asked for one (`40075`).
  - [ ] **P1** — OCR overlay is not aligned when the user **zooms** the page — alignment must survive zoom (`40075`; recapture-after-zoom shipped [v1.5.14/16/17] — reverify).
  - [ ] **P1** — verify homepage layout containment on the BookWalker homepage AND reader modes specifically (`storefront_carousel_containment`).
  - [ ] **P1** — confirm whether 1.5.17's fixes are actually live on GF today (unconfirmed by the aborted session); reconcile the dirty `bookwalker-firefox-live-fix` worktree (25 changes, unmerged — see Dedup).

---

## Dedup / convergence

Duplicated-but-diverged implementations that cause "works for henry, not for the user" and re-open bugs. Unifying these is the durable fix.

- [x] **P0 — VERIFIED FIXED 2026-08-03. The Study 2.0 collapse is done; this entry read as open because the ROUTE switcher still uses `mode` naming.** Measured against origin/main: `type NewTabMode` has ZERO matches in src/, `state.mode` branching has ZERO matches, and the only remaining `jpdb-reader-newtab-mode` group (`controller.ts:1259`) is the Study/Library/Stats ROUTE switcher, not the legacy word|recall|kanji|listen step tabs. `state.ts` keeps `legacyStudyIntent` solely as a one-way migration of stored preferences, which must stay. The merged step order is exactly the one this ticket specifies — kanji-doodle -> word -> type-word -> recall-cloze -> listen-pitch -> speaking -> final-reveal (`study-session.ts:115-127`). Pinned by tests/reader/new-tab-study-session.test.ts, 11 tests green, including "migrates legacy modes into route-only persisted state" which asserts `mode` and `listenSubMode` are stripped. Anyone grepping for "mode" will still find the route switcher and conclude otherwise — that is why this survived. ORIGINAL TEXT FOLLOWS:
      **P0 — Study step model vs legacy mode system.** `study-session.ts` (new stepper) layered on `state.ts NewTabMode` (legacy word|recall|kanji|listen) in `controller.ts`; controller renders one legacy mode and maps steps back. Converge to one surface + one `activeStudyStepIndex`. This is Cycle 2. Evidence: `[thread 019f14cd]` GAP 1.
- [ ] **P1 — Provider handling scattered across ~8 files** (`srs-providers.ts`, `review-targets.ts`, `grade-queue.ts`, `popover-renderer.ts`, stats, settings) vs the started provider-neutral adapter. Trust bug: queued **bunpro/yomu-local** grades FALL THROUGH to `submitJpdbApiGrade`. Converge onto one adapter; extend `ApiSrsProviderId` beyond `jpdb|jiten`. This is Cycle 9. Evidence: `codex-cycles.json` systemic finding 4, `[thread 019f14cd]` GAP 4. Partial convergence landed [v1.6.14] (lookup module unified).
- [ ] **P1 — Factory-reset key enumeration exists ≥4 ways** (`GM_listValues`, prefix scan, `KNOWN_MANAGED_STORAGE_KEYS`, `MANAGED_INDEXED_DB_NAMES`). Converge to one registry. This is Cycle 3.
- [ ] **P1 — Canvas page-identity re-derived ad hoc in the OCR controller** (scroll offset / global epoch / node ref). Converge to one content-hash identity module. This is Cycle 1.
- [ ] **P1 — Yomu-video player has its own settings store that desyncs from the yomu-script settings and fights it** — this is the root of the dark-mode-toggle freeze/memory-leak (tk "legit memory leaks") and dark-mode-not-persisting. Converge yomu-video settings onto the shared settings. `[wl:videoplayer-darkmode-freeze]`, `[wl:videoplayer-darkmode-persist]`, MEMORY `yomu-video-player-layout`.
- [ ] **P1 — Docs/homepage subtitle demo panel is a stale fork of the runtime panel** (missing target button, left-aligned demo especially broken). Unify demo and runtime panel/control-rail components. Backlog "Docs homepage demo regression."
- [ ] **P1 — Keyless public-lookup fallback WAS duplicated between reader and new tab (drifting).** ✅ Converged [v1.6.14] into one lookup module (task #8, `cec546e7d`). Kept here as the pattern to watch — audit for the next drift. Evidence: shipped-index `keyless_public_lookup_module_converged`.
- [ ] **P2 — Subtitle drawer shares CSS/DOM across 6 hosts without a contract** (Cycle 6). Converge to one layout contract + per-host adapters.
- [ ] **P2 — Ruby alignment hand-tuned per surface** (Cycle 7). Converge to one ruby helper.
- [ ] **P2 — Gaming Electron overlay reimplements reader concerns** (Cycle 11). Converge onto `reader/app/boot` + `collectScanTargets`.
- [ ] **P1 — Dirty unmerged worktrees / the un-landed v1.5 study+audio+bunpro batch.** ~33 worktrees; local main is ahead 1 / **behind 92** with unique commit `3ff00d4d` "integration: consolidate reader fixes"; **19 of 62 branches unmerged.** The recurring "took a vertical slice in a clean throwaway worktree" pattern ships fixes AROUND this batch, never landing it — a root of duplicated effort and accreting test hacks. Decide fate of: `bookwalker-firefox-live-fix` (dirty 25), `yomu-reader-listen-main` (dirty 22, the audio/listen batch every session reports as "unrelated dirty… still untouched"), `yomu-reader-nhk-release` (+v168) (dirty 17 each), `settings-storage-recovery-20260629` (+v236) (dirty 13/14), and branches `codex/ws2-bookwalker-homepage-containment-20260627`, `codex/discord-oklab-release`, `codex/ocr-overlay-a11y-release-1.4.229`, `codex/yomuyomu-native-overlay-20260628`, `backup/local-main-batch-mining-3ff00d4d`. Evidence: `codex-cycles.json` unfinishedThreads + systemic finding 2.

---

## Incomplete features (with completion criteria)

Features that are wired but not done. Each has explicit done-criteria.

- [x] **P0 — VERIFIED FIXED 2026-08-03. The Study 2.0 collapse is done; this entry read as open because the ROUTE switcher still uses `mode` naming.** Measured against origin/main: `type NewTabMode` has ZERO matches in src/, `state.mode` branching has ZERO matches, and the only remaining `jpdb-reader-newtab-mode` group (`controller.ts:1259`) is the Study/Library/Stats ROUTE switcher, not the legacy word|recall|kanji|listen step tabs. `state.ts` keeps `legacyStudyIntent` solely as a one-way migration of stored preferences, which must stay. The merged step order is exactly the one this ticket specifies — kanji-doodle -> word -> type-word -> recall-cloze -> listen-pitch -> speaking -> final-reveal (`study-session.ts:115-127`). Pinned by tests/reader/new-tab-study-session.test.ts, 11 tests green, including "migrates legacy modes into route-only persisted state" which asserts `mode` and `listenSubMode` are stripped. Anyone grepping for "mode" will still find the route switcher and conclude otherwise — that is why this survived. ORIGINAL TEXT FOLLOWS:
      **P0 — Study 2.0 merged flow.** *Done when:* one Study surface, single `activeStudyStepIndex`, legacy mode buttons/state deleted, session stepper fixed before the card starts, default order Kanji→Word→Recall→Listen→Speak→Reveal, disabled steps omitted, one final-reveal boundary (invariant-tested), multi-kanji tests every kanji. (= Cycle 2 + DV-1.) Evidence: `[thread 019f14cd]` line 16941 acceptance.
- [ ] **P1 — Yomu SRS state (provider-neutral).** Currently: `ApiSrsProviderId` stayed `jpdb|jiten`; Bunpro & yomu-local are missing from My Cards / browse pool (jpdb|jiten|anki only); queued bunpro/yomu-local reviews fall through to `submitJpdbApiGrade` (trust bug); "auto" source claims local-first but loads JPDB+Anki only; no visible mine/import UI into `yomu:srs-local`. *Done when:* one SRS adapter serves popup add/review/batch-mining/dictionary-enrichment/settings-validation for {jpdb, jiten, bunpro, anki, yomu-local}; each provider's grades route to that provider (no fall-through); browse pool + filters include all; local no-account SRS has a visible mine/import action and syncs on account creation. Evidence: `[thread 019f14cd]` GAP 4/5, `codex-cycles.json` systemic finding 4.
- [ ] **P1 — Bunpro as a full SRS provider.** "Full support is required for version 1.5" (line 523) but shipped only new-tab queue/review/stats plumbing + lookup pill + token settings [v1.5.0/1.6.3]. Currently gated behind the default-OFF mining toggle, so a pasted token still doesn't enable Bunpro. *Done when:* popup add/review/batch mining + dictionary enrichment + settings 401/expiry validation all support Bunpro; Bunpro un-gated when a token is present; 4-vs-5 grade mapping correct. Evidence: `[thread 019f14cd]` GAP 4, MEMORY `yomu-bunpro-grading-parity`. Partial: mining-button gating landed [v1.6.14].
- [ ] **P1 — Bunpro auto-token importer** (copy-cookie helper on bunpro.jp/settings/api, since users don't know how to get `frontend_api_token`). Currently mounts but is (a) hidden behind the settings-modal z-index, (b) only installs once at boot so SPA-nav to /settings/api never retries, (c) may always see "no token" on Firefox/HttpOnly (no `GM_cookie`). *Done when:* mounts into the settings dialog above the modal, retries on SPA nav, and handles Firefox/HttpOnly (GM_cookie or a documented manual path). Evidence: `[thread 019f14cd]` GAP 9, lines 1001/16150.
- [ ] **P1 — Real speaking/shadowing assessment.** Currently record-and-playback + Continue only; no pronunciation/pitch scoring; no YouTube/video shadowing feedback. *Done when:* automatic pitch-contour/pronunciation scoring in Study + video shadowing (references: `references/PitchDetect`, `references/onsei`, `references/pitchfinder`, `references/kotu.kez.io`), OR the "scoring" affordance is hidden until it exists. Evidence: `[thread 019f14cd]` GAP 3 (line 13694 P0).
- [ ] **P1 — Hosted audio R2 data upload (data gap behind Cycle 5).** Worker deployed and exporter generated the full index (298,767 terms / 431,993 files / 65 MB index). *Done when:* the user creates a bucket-scoped `yomu-audio` R2 R&W token, the ~6.1 GB / ~436k-PUT bulk S3 upload runs, the token is revoked, and a live word that has a local clip (e.g. 保有) is served from R2 not jpod101. *Owner action required* (Wrangler OAuth can't create the token). Evidence: `[thread 019f2149]`.
- [ ] **P1 — Stripe donations in production.** `codex/fix-stripe-sandbox-donations` deployed a worker that refuses test-mode secrets and returns 503 (so /donate is currently **blocking all donations**). *Done when:* the branch is merged to main AND the owner replaces `STRIPE_SECRET_KEY` with a LIVE key (`npx wrangler secret put STRIPE_SECRET_KEY --config workers/yomu-support/wrangler.jsonc`); /donate then completes a real checkout. *Owner action required.* Evidence: `[thread 019f2561]`, sandbox-guard shipped [v1.6.8].
- [ ] **P1 — Green, automatic core `Release` workflow.** Currently RED at the New Tab generated-test check → recent releases published MANUALLY. *Done when:* the New Tab generated-test (elementFromPoint/BroadcastChannel flake) is fixed and the `Release` workflow publishes GH release + GF sync without manual intervention. (= Cycle 10.) Evidence: `codex-cycles.json` unfinishedThreads, MEMORY `yomu-release-gate-stabilization`.
- [ ] **P2 — Dictionary storage migration / read installed Yomitan dicts.** No shared-source or import-from-Yomitan shipped. *Done when:* users can either point Yomu at existing Yomitan dictionaries (no 2× storage) or follow a one-click export→import path; extension-coexistence overlap is detected and explained. Evidence: `[wl:reuse-yomitan-dictionaries]` (tk), backlog "Extension coexistence."
- [ ] **P2 — User dictionaries as SRS sources.** Not shipped. *Done when:* users can add their own dictionaries/sources to study flows (like jiten), or the dictionary-only path is documented if SRS-source is out of scope.
- [ ] **P2 — Queued 'YouTube iPad video player controls' thread.** Left QUEUED (never started) by the heartbeat automation; an open YouTube-layout item feeding Cycle 4. *Done when:* iPad YouTube player controls verified against the single-column full-bleed player (MEMORY `yomu-youtube-single-column-fullbleed-player`). Evidence: `[thread 019f2142]`.

---

## Appendix — preserved release/QA history (do not re-open; kept for provenance)

These shipped and were verified; retained so the squad doesn't re-litigate them. Full verdicts in `shipped-index.json`.

- Yomu Video subtitle layout + virtualization sweep: `[v1.4.118–1.4.143, 1.4.152, 1.4.174, 1.4.195, 1.4.206, 1.4.224, 1.4.229, 1.4.237, 1.6.4, 1.6.7, 1.6.8]` — side-panel placement (L/R/bottom no longer distorts player), fullscreen-while-playing geometry, subtitles-hide-in-comments, stable caption typography, half-width-controls snap, transcript auto-scroll + jump-back + cue-boundary flicker, reset-to-defaults, slider-drag popover stability, iPhone/iPad fullscreen subs + tappable paused OCR. All STALE-DONE (were listed as open P0/P1 dated 2026-06-27; resolved by the 1.4.13x–1.4.24x sweep).
- BookWalker/OCR/PDF: `[v1.3.7–1.5.17]` — cross-origin tainted-canvas OCR, Firefox/iPad realm, stale-OCR-after-page-turn, both movement directions, continuous-scroll iPad, cty=2 vertical rescan/settle, normal-mode decay, interactivity/selectable, dark-mode readability, reader-metadata after DOM guard, storefront carousel containment, OCR overlay hidden-until-hover, recapture-after-zoom; PDF text-vs-scanned split, multipage nav, empty-drop-area responsive. (Residual live bugs → DV-5.)
- Study/SRS: `[v1.4.137, 1.4.145, 1.4.199-206, 1.4.207, 1.4.220, 1.4.222, 1.4.224, 1.4.233, 1.4.235, 1.4.239–246, 1.5.0–1.5.6]` — reverse-answer minimal card, readings/furigana recovery, proxied audio, PWA/overflow-menu parity, pass/fail mobile, offline queue, Listen/Shadow/Recall modes, settings recovery, Help/version/duplicate-script. (Residual → Cycle 2, DV-1.)
- Reader/web styling: `[v1.4.127, 1.4.147, 1.4.158, 1.4.175, 1.4.190, 1.4.211–219, 1.4.231]` — compact-label containment, OKLab dark surfaces, framework-owned DOM mirror, ChatGPT/Wikibooks/Claude containment, YouTube chrome/whitespace/title-metadata, frequency pills, first-render contrast.
- Newer bug-fix work: `[v1.6.11]` local dictionary engine → Settings-Surface companion; `[v1.6.12]` restore hosted OCR companions + fallow CI guard; `[v1.6.13]` OCR Latin-spacing + translation-garbage gating (task #16); `[v1.6.14]` deck-state button gating + jiten-fallback convergence (task #8).


## Added 2026-07-03 (owner asks, session 5d668c75)

- [ ] **P0 — Donations: dynamic goal from real operating forecast (£10/month floor), shown in the user's local currency; add PayPal / Ko-fi / Buy Me a Coffee / Patreon alongside Stripe; homepage status bar aggregates ALL providers.** Engineering shipped in **[v1.8.57]**: the £10.20 checked-in forecast rounds only for display, local currency uses fresh FX plus `Intl.NumberFormat`, all five authenticated provider shapes aggregate, and unready links stay absent. Production activation remains owner-queued: apply support migrations `0005`–`0007`, deploy `yomu-support`, then configure Buy Me a Coffee, PayPal, and Patreon's campaign identifiers in a supervised session. No account or credential work was attempted. Evidence: owner ask 2026-07-03; thread 019f14cd donation-copy asks.
- [ ] **P0 — Study flow: pitch-accent selection + shadow step integration.** THREE OF THE FOUR ASKS
      HERE SHIPPED — verified 2026-08-03. See the earlier annotation for the ＿み物 cloze, progressive
      hints, and both steps existing in the session model (all v1.6.21, 23 tests green).

      **LEARNER WALKTHROUGH DONE 2026-08-03 on the live hosted Study page, and it names the
      integration problem concretely: a learner never reaches either step.**
      Driving https://yomureader.com/study/ , the step rail renders
      `1 Kanji 1 → 2 Kanji 2 → 3 Word → 4 Type → 5 Reveal` with "One review, a few quick checks. Grade
      once at the reveal." That live-confirms two other GAP items — the flow really is merged rather
      than mode-tabbed, and a two-kanji word really does produce one drawing step per kanji. But
      **Listen and Speak are absent from the rail entirely**: the words do not appear anywhere in the
      page, and there is no control, count or hint suggesting steps 6 and 7 exist.

      Root cause, and it is a deliberate gate rather than a bug: `mergedStudyStepsForCard` adds both
      steps only `if (options.pitchAvailable)`, which the controller derives from
      `pitchSeedFromCard(card, …) !== null` (`controller.ts:4606`). That returns null unless the card
      has BOTH a resolvable pronunciation reading AND a pitch number for it
      (`newtab/pitch-srs.ts:169-174`). The default hosted card has neither — the page's only
      "pitch"-named element is the `jpdb-reader-word-underline-pitch` display class on `<html>`, not a
      datum. The comment in study-session.ts is sound ("Listen/Speak drill pitch accent, so they only
      make sense once pitch has actually resolved"), so DO NOT force them on: without pitch they would
      render empty.

      What this leaves as the real question, which is a product call rather than a code one: *does
      pitch ever resolve on the hosted Study surface?* If it needs an installed dictionary or a
      provider the no-install page does not have, then two of the seven steps are dead for every
      learner who arrives via the website, and the honest fixes are either a source that supplies
      pitch there or a visible "needs pitch data" affordance so the steps are discoverable rather than
      silently missing. Measure which before building either.

- [ ] **P1 — UserScript-Compiler generic UX/DX audit** (github.com/HRussellZFAC023/UserScript-Compiler): stays generic for any userscript; simple, intuitive, customizable; new-user walkthrough of README/CLI/config/templates.


## Session close-out 2026-07-03 (quality-squad, session 5d668c75)

Shipped 1.6.7-resurrection through 1.6.24 (twenty releases, each gated + verified). Cycles broken: Cycle 2 study merge (1.6.17/1.6.20), Cycle 3 factory-reset registry + invariant test (1.6.22). Extension made real + gated (1.6.17, smoke:extension-boot). Docs refreshed to shipped product (1.6.23). Mobile 44px floor (1.6.24).

**Residuals owned by the owner (runbooks committed):**
- [ ] Donations production activation — follow `workers/yomu-support/PROVIDER-SETUP.md`: preflight Stripe receipt identities, apply migrations `0005`–`0007`, deploy the support Worker, then configure Buy Me a Coffee, PayPal, and Patreon's campaign identifiers with the owner present. ~30 min supervised.
- [ ] Steam Deck hardware checklist — src/gaming/MANUAL-DECK-TEST.md (gamescope capture, Steam Input, AppImage launch, overlay top-layer). ~20 min on-device.
- [ ] Real-iPhone spot checks — safe-area insets on bottom bars, Userscripts-app @require/SRI loading, doodle draw gesture (chromium emulation blind spots, from the 2026-07-03 mobile matrix).

**Residual engineering (chips filed / parked):**
- [ ] Cycle 1 canvas-page-identity primitive — agent was paused by the owner mid-implementation; re-launch when wanted (design + invariant matrix spec in this file).
- [ ] Onboarding welcome-panel word parsing (chip task_99ff9e13 — pre-existing red smoke on main).
- [ ] Profiler yomitan DB_VERSION seed (chip task_54e84541).
- [ ] BookWalker tap-smoke browser flake (chip started by owner earlier — verify landed).
- [ ] Live-YouTube screenshot of the subtitle panel-options popover for docs; extension-store copy revision when a store submission lands.

---

# 2026-07-26 — OWNER BRIEF: simplify, refresh, and present Yomu properly

Added by Claude at the owner's request ("make sure you are tracking all these tasks in your backlog").
None started. Threading constraint: the **multilanguage rewrite is in flight (32 target languages)**,
so no UX, docs or store copy written now may bake in Japanese as the only target.

## B1. Settings overload → plug and play  [owner: recurring user complaint]
Users want it to **work out of the box**. Minimal setup **≤5 minutes**, simple and intuitive, with the
advanced settings still available for those who want them later. Progressive disclosure and better
defaults — NOT feature removal. Ties to the dictionary browse panel (186 entries) already being
redesigned for the same reason.

## B2. Homepage + docs are stale
Much is out of date, or longer than it needs to be. Rewrite around what learners actually need.
Answer explicitly, and let the answers drive the IA:
  - What do we really need on the homepage?
  - What should the nav buttons be?
  - For each doc page: do we really need it?
  - **What makes Yomu special?**

## B3. UX reference: lean, not Migaku
Research competitors — **Bunpro named as the reference for clean UX** — plus well-designed sites
outside language learning. **Explicitly NOT Migaku-style; leaner.** For mining and SRS UX, review
GitHub projects and capture Migaku screenshots for comparison. **Keep Yomu's existing look and feel** —
this is simplification, not a redesign.

## B4. Store listings do not convey what Yomu is
Rewrite text + images for **addons.mozilla.org**, **Chrome Web Store**, and the **Greasyfork**
description. Note: **Firefox Classic (not Developer Edition) is signed into the addon store**, so that
profile can update the AMO listing.

## B5. Academy → "coming soon"
Mark Yomu Academy as coming soon wherever it is presented.

## B6. Support options are overwhelming
Patreon + Ko-fi + Stripe are all surfaced at once. Replace with **one support entry point** that opens
a dialog to choose — or move it to the bottom of the page. One affordance, not three.

## B7. Patreon posts (ghostwriting for the owner's own account)
Draft an initial post as Henry, creator of Yomu, and a "Thank you" reply to existing subscribers.
**Drafts only — the owner publishes.**

---

# 2026-07-26 — USER RESEARCH FROM DISCORD (verbatim, 26/06–25/07/2026)

Owner: "All their comments and suggestions must be implemented in full no corners cut."
Users: canna98 (day-one, iPad/BookWalker), noteliana (Patreon subscriber #1, jiten+anki),
bdlance (iOS/Safari, jpdb→jiten), sagamsil (Korean speaker, first international user),
coffeentacos (desktop Safari), vvvvtk (Steam Deck/VN), woozlez (ttsu dark mode, made homepage video),
ivorytwelve, mnbm, babybnuy.

## U-BUGS — reported, reproduce each before closing

- **U1. Settings are PER-SITE not global** [bdlance 06/07] — every new site re-asks setup + API key.
- **U2. Settings lost on update** [vvvvtk 07/07] — "my colors got defaulted as I updated".
- **U3. "Prefer Japanese site and language" defaults ON** [coffeentacos 24/07] — must be turned off on
  every new page. Owner agreed it should default OFF. Turning it off ALSO leaves `/?locale=ja-JP` in
  the URL (owner diagnosed, unfixed). Desktop Safari.
- **U4. Safari iOS crashes/OOM the whole page ~every 5 min** [bdlance 08/07]. Also: extension
  interferes with copy/paste, and the startup overlay shows on every website.
- **U5. Must hard-refresh (Ctrl+Shift+R) for Yomu to activate on YouTube** [sagamsil 25/07].
- **U6. Must reload on every page** [canna98 09–10/07, repeatedly] — BookWalker/OCR.
- **U7. Discord is broken by Yomu** [canna98 07/07, 14/07] — "eating words", spaces growing, usernames
  broken. Recurred after a fix.
- **U8. Cannot attach/upload subtitle files** [canna98 30/06] — `.ass` suspected; "nothing can be
  uploaded". Netflix + anime sites.
- **U9. Adding a card to jpdb returns 400** [bdlance 06/07] on a new empty deck (non-patron account).
- **U10. Annotations do not resume** after toggling off/on [bdlance 06/07].
- **U11. Immersion-kit panel does not update when switching cards** [noteliana 21/07]; after review it
  hides, then reappears on the next card [22/07].
- **U12. "Text not detected" on BookWalker** [canna98 09/07].
- **U13. Batch mining is very slow on longer videos** [owner, 25/07 — confirms user reports].
- **U14. Chrome Web Store search for "yomu" finds nothing** — only よむ works [owner 25/07].

## U-WISHES — features users explicitly asked for

- **U15. TARGET-LANGUAGE DEFINITIONS** [sagamsil 23/07] — the single biggest ask. Non-native English
  speakers must trigger DeepL manually on every popup. Wants a target-language setting so EN
  definitions are auto-translated on render (Korean, Spanish, Chinese…). He judges AI machine
  translation of English the practical route while no JP→KR dictionary exists.
  **This is the user-facing face of the multilanguage work.**
- **U16. "Composed of" in the popup** [ivorytwelve 01/07] — 跳梁跋扈 should also surface 跳梁 and 跋扈.
  Either a JPDB-style "composed of" section, or Yomitan-style multiple matches rather than only the
  longest. Owner agreed.
- **U17. Fully local parsing** [ivorytwelve 01/07] — no jiten/remote unless explicitly asked.
- **U18. Add to deck WITHOUT scheduling a review** [bdlance 23/07] — 200 reviews/day became 1600 due.
  Wants: "Nothing" = collect only; anything else = counts as a review. **Separate "collect words"
  from "study new words".** Owner: "I actually like this idea a lot."
- **U19. Bulk resume** [bdlance 24/07] — bulk suspend exists, resume does not.
- **U20. Export/import settings as plain JSON** [bdlance 10/07] — for iOS via the file picker.
- **U21. Use the Userscripts app storage API** instead of localStorage [bdlance 10/07].
- **U22. Per-type colour toggles** [woozlez 06/07] — disable highlighting for types you do not need
  (e.g. known words). Had to set highlights near-black for ttsu dark mode. Owner agreed.
- **U23. Default "not in deck" to NO colour** [sagamsil 25/07] — jpdb's grey is intrusive and cannot
  be customised; jiten shows unadded words cleanly white. Also **canna98 26/06: white is better than
  blue for new words.** Change the DEFAULTS.
- **U24. Toggle to disable YouTube's own subtitles** [vvvvtk 30/06] — they invade English videos.
- **U25. Read Yomitan's already-installed dictionaries** [vvvvtk 26/06] — avoid 2× storage.
- **U26. Furigana on the study card ANSWER side, not the front** [vvvvtk 29/06, canna98 26/06] —
  "it's tough to study when I already know the answer". Study page shows no furigana at all in places.
- **U27. Yomu audio inside jiten reviews** [noteliana 25/07] — NHK/daijisen/Forvo instead of jiten's
  AI voice. Also wants local ankiconnect audio reachable from Yomu on Firefox Mobile.
- **U28. Pre-episode / post-episode mining list** [noteliana 25/07] — show every word you might mine,
  each with mine / don't mine / already-known.
- **U29. Shadowing speed control is too slow to change** [noteliana 22/07] — jpdb's was quicker.
- **U30. Reposition the video during review** [noteliana 22/07] so reviews stay usable.
- **U31. Turn off jpdb/bunpro surfaces** [noteliana 22/07] — they are on by default and unwanted.
- **U32. Grading scale mismatch** [noteliana 25/07] — Yomu uses 5 points, jiten uses 4; unclear how
  that maps. Needs a decision and an explanation in the UI.
- **U33. Kanji cards optional** [noteliana 25/07] — she doesn't want them (can already toggle).
- **U34. Best-of-both parser** [sagamsil 25/07] — JPDB deconjugates to dictionary form and blacklists
  katakana/conjunctions well; jiten groups idioms and compounds better (油を売る as one entry). Owner's
  stated goal: best of both, done locally.
- **U35. Batch-mine buttons have no visual feedback** [sagamsil 25/07] — he could not tell what
  "add selected" vs "Nothing/Hard/Okay" did until told. Needs to be self-evident.
- **U36. Mobile app** [noteliana, bdlance, owner] — React Native, same on web/Android/iOS, offline SRS.
  Owner has the Safari extension ready but has not paid the £100 Apple fee.

## U-UX — the recurring theme is FRICTION

- **U37. "My biggest feedback for yomu would be easier navigation, after that I think it could really
  be promoted"** [noteliana 25/07 15:57].
- **U38. Settings need to be understandable** [noteliana 25/07 15:44] — "beginners could be at a loss
  with what to adjust". Wants a **(?) help icon per setting**. Owner agreed: "I don't want people to
  spend half an hour trying to figure out how to use this — they should just add it and everything
  should work out the box."
- **U39. Yomu Study must be comfier than jiten's** [noteliana 25/07] — "jiten is compact, and the
  reviews are crazy fast especially on laptop". Owner: "there is too much going on rn?"
- **U40. Chrome Web Store listing does not highlight the features** [noteliana 25/07 15:40].

## WHAT USERS SAY YOMU IS GOOD AT — use this for the store copy and homepage
- "Reduced friction makes it so much easier to focus on learning" [coffeentacos] — and noteliana:
  "it's all about reducing friction". **This is the positioning.**
- "The amount of things this lets you do that you'd need multiple other things" [coffeentacos].
- Instant Nadeshiko example sentences on click — "no other one does that" [noteliana].
- Attaches video AND image to mined Anki cards [noteliana, didn't know it existed → discoverability].
- "Genuinely unmatched for books" (BookWalker) [noteliana].
- Kanji data: "so much unique information I didn't even know existed, yet seamlessly integrated…
  provides exactly what's needed without feeling cluttered" [sagamsil].
- Yomu-hosted audio on the Cloudflare edge is near-instant vs Yomitan's [owner/noteliana].

## U41. YOMU GAMING IS INCOMPLETE — simplify toward YomiNinja
[owner 2026-07-26] "yomu game is incomplete or not working how we would expect for such an app —
compare to something like yomininja in references and get it simplified to be more like that."

AS-IS: `src/gaming/**` + `npm run smoke:gaming` (an Electron build). Users have not reported using it
successfully. vvvvtk instead uses **Tango Lens** (https://tango.acorntalk.com/) on a Steam Deck via
**Decky** (https://decky.xyz/) and called it "insane, life changing" — it takes screenshots of the
game and OCRs them. He also expects it to go paid eventually, which is the opening.

TO-BE: a lean full-screen OCR overlay in the YomiNinja mould — capture the screen region, OCR it,
annotate in place, look up and mine — rather than a bespoke game client. Owner's word: SIMPLIFIED.

Do the same as-is/to-be/path treatment as the rest, and check the reference implementations
(YomiNinja, Tango Lens, Decky integration) before designing. vvvvtk is the user to validate with —
he owns the Steam Deck, has already done the research, and offered to test ("when u will be ready
lemme know I will gladly test it").
Related user context: `src/gaming/shared.ts` still carries 6 direct HAS_JAPANESE calls with its own
local regex, so gaming is also un-migrated for the multilanguage work.

---

# 2026-07-26 — ARCHITECTURE INPUT FROM THE SAME USER RESEARCH (not marketing — engineering)

Owner: "there is actually really thoughtful comments about how the parsing varies depending on the
different backends… for the current task of multilingual and the offline-first goal as well as
defining the server backend capabilities all this needs to be included."

## A1. PARSER BEHAVIOUR DIFFERS BY BACKEND — with reproducible cases [sagamsil 25/07]
This is comparative research, and the cases are testable. Turn them into fixtures.

**JPDB is better at:** deconjugating verb forms back to dictionary base form; auto-blacklisting
conjunctions and katakana loanwords, which gives cleaner visual separation and readability.
  - `ことがなかった。` → JPDB correctly yields **ことがない**. Jiten parses **なか** and pops the
    dictionary entry for "inside" — plainly wrong.

**Jiten (and the offline JMdict parser) are better at:** idioms, proverbs and compound grouping.
Jiten uses Nazeka-derived deconjugation plus compound grouping.
  - `油を売る` → grouped as ONE entry by Jiten; JPDB splits it into 油 + を + 売る.
  - `いつまでも殻に閉じこもっていない` → the **offline parser (JMdict) AND Jiten** both group
    **殻に閉じこもる** correctly; **JPDB breaks it into separate words.**

**The goal the owner already stated: best of both, computed LOCALLY.** "Eventually I would like to do
almost everything locally on device so we don't send so much traffic to JPDB and Jiten, or to host a
better parser on the yomu servers."
→ So the local parser must acquire JPDB-grade deconjugation AND Jiten-grade compound/idiom grouping.
Both example sets above become regression fixtures. This is also the multilingual segmentation
problem restated: per-target morphology plus per-target compound grouping.

**Presentation follows from the parser choice too:** JPDB marks every unadded word grey "not in deck"
and offers no colour control; Jiten shows unadded words as "New", cleanly white. See U23 — default
"not in deck" to NO colour.

## A2. USERS MUST NEVER CHOOSE BETWEEN SRS BACKENDS
Owner: "we also don't want the users to have to pick between anki or yomu srs or jpdb or jiten etc —
there should be a seamless and simple way to handle all of it."

This is the architectural centre of the next phase. It has to hold from ONBOARDING through to
STEADY STATE, and it must work with **N simultaneous sources**, not a selected one:
  - Onboarding must not ask the user to pick a backend before they understand the difference.
  - Known-state, card state and reviews must reconcile across sources rather than diverge.
    Live evidence this is unsolved: bdlance's due count went 200/day → **1600** because adding words
    in Yomu inserted reviews in Jiten (U18); noteliana keeps Anki as "mastered on jiten" and needs
    both consistent; sagamsil runs Anki + Jiten together and the owner had to ask him whether "having
    both enabled at the same time" does "crazy things".
  - **Grading scales differ** — Yomu 5-point vs Jiten 4-point (U32). A shared model needs one
    canonical scale plus per-backend mapping, and the UI must explain it.
  - Yomu SRS is to be PRIMARY (see [[yomu-batch-mining-ux-spec]]); the others become sources/sinks.

## A3. OFFLINE-FIRST
Ties directly to A1 (local parser), U17 (local-only parsing), U21 (Userscripts storage API),
U20 (export/import settings as JSON), U25 (reuse Yomitan's installed dictionaries), and U36 (offline
mobile SRS app). Reviews, lookups and annotation should work with no network; the network becomes an
accelerator and a sync channel, not a dependency.
Counter-evidence to weigh: users LIKE the hosted audio precisely because it is fast
("I hosted it on the cloudflare edge network so it's on a server super close to you"). So
offline-first must not mean self-hosted-only — it means degrade to local, prefer edge when present.

## A4. DEFINE THE SERVER BACKEND CAPABILITIES
Currently implicit and spread across jiten/jpdb/bunpro/wanikani plus our own workers (dictionaries R2,
audio, academy). Needs an explicit statement of what the Yomu backend owns:
account + auth, SRS state and sync, dictionary distribution, audio, parsing (if hosted), and the
multilingual catalogue. Latency budgets per capability — see A5.

## A5. LATENCY OF BACKEND REQUESTS IS A FIRST-CLASS REQUIREMENT
Users measure it and say so:
  - noteliana switched to LOCAL audio because "local audio gives me the audio instantly" — then found
    Yomu's hosted audio acceptable ("this audio is fast as hell").
  - The owner's own complaint about Yomitan: "the speed thing annoyed me too".
  - "Jiten is compact, and the reviews are crazy fast especially on laptop" — the bar for Yomu Study.
  - Batch mining is slow on long videos (U13); the Anki integration is slow (owner).
→ Set explicit budgets per interaction (popup lookup, audio start, review grade, batch-mine commit)
and treat a miss as a bug, not a tuning preference.

## A6. MULTI-PLATFORM REQUIREMENTS (from the same research — capture in full)
Yomu already ships on more surfaces than any plan has accounted for. Each has different constraints
and a different update cadence, and the multilingual/SRS/offline work must hold on all of them.

**Shipping today**
- **Userscript** (Tampermonkey / ScriptCat / Greasyfork / yomureader.com) — the owner's fast channel:
  "the userscript version I will keep doing daily updates to."
- **Chrome Web Store extension** — approved 22/07, but lags the userscript. Store search for "yomu"
  fails; only よむ works (U14).
- **Firefox AMO extension** — works on **Android** today ("you can use the firefox extension on
  android already").
- **iOS Safari via the Userscripts app** — bdlance and babybnuy use it. Crashes/OOM every ~5 min (U4),
  copy/paste interference, startup overlay on every site. Has its own storage API we should use (U21).
- **iPad Safari** — canna98's primary device, BookWalker reading. Several bugs are iPad-only.
- **Desktop Safari** — coffeentacos.
- **Electron gaming build** — see U41; to be simplified toward YomiNinja.

**Explicitly planned, not shipped**
- **iOS Safari extension**: "I actually have it ready as a Safari extension, but I have to pay the
  annual apple charge of £100 to list it." → a cost decision, not an engineering one.
- **React Native app**: "it will be the same on the website, android and ios" — offline-capable SRS.
  Driven by "the worst thing about phones is their lack of ability to be used for focused immersion
  with mining" [noteliana] and "an iPhone app for your SRS that works fully offline and is just nice
  to use" [owner]. A first prototype exists: "you can really do your reviews for jiten without using
  jiten".
- **Steam Deck** — vvvvtk's device; Decky-integrated overlay is the reference (U41).

**Release-channel policy the owner already stated — make it explicit and honour it**
Userscript = daily/experimental. Browser extensions = ~weekly/stable. noteliana asked directly
whether the Chrome store build is the most current; the answer was "yes and no". Users need to know
which channel they are on and what that means.

**Cross-cutting requirement:** settings/state must survive moving between these surfaces — hence
U20 (export/import JSON), U21 (Userscripts storage API), U1 (settings are per-site not global) and
U2 (settings lost on update). Multi-platform is exactly why A2 (never make the user choose an SRS
backend) and A3 (offline-first) matter: the same account, state and decks must behave the same on a
Steam Deck, an iPad and a laptop.

## A7. WHY PEOPLE DON'T USE YOMU STUDY — the evidence, and the Anki issue
[owner 2026-07-26: "have you noted exactly what is wrong with the current version of yomu study and
why people don't use it compared to jiten or anki"]

**They say it plainly. Every complaint is about DENSITY and SPEED, not missing features.**
- noteliana: *"Jiten is compact, and the reviews are crazy fast especially on laptop."* ← the bar.
- noteliana: *"I just am already so comfortable with jiten srs though"* — switching cost is the real
  competitor, not a feature gap. Beating jiten means being obviously faster, not merely equal.
- Owner, unprompted: *"what would it take to make yomu study more comfy than the jiten one? — I am
  thinking there is too much going on rn?"* ← he already knows. Trust that instinct.
- noteliana: *"I don't care about kanji cards even though we can turn it off"* — the DEFAULT is wrong,
  not the capability.
- noteliana: *"yomu uses a five point scale when jiten has a 4 so I'm unsure how that will affect
  things"* — an unexplained difference becomes a reason not to trust it (see A2).

**Two contradictory furigana bugs, which together make Study unusable as a test:**
- vvvvtk: furigana appear on the FRONT — *"it's tough to study when I already know the answer"*, and
  *"didn't find how to disable it"*. The card gives away its own answer.
- vvvvtk AND canna98, days earlier: *"study page has no way to know how to read the word"* /
  *"on study page there is no furigana"*. So furigana are absent where needed and present where they
  spoil the test. **Rule: reading hidden on the front, shown on the answer** (U26).

**The owner has been telling users not to use it:** *"Don't use study rn… it's gonna change a lot.
Study 2.0 coming soon"* (29/06) and *"the study page also needs a bit more work to get it how I would
like"* (10/07). Study 2.0 is promised and unfinished — that is why nobody uses it.

**Also observed:** jiten decks did not show in Study while showing elsewhere [vvvvtk 07/07].

### The Anki GitHub issue — #31, mirrormc, opened 18/07, CLOSED 21/07
*"Mining settings don't visually update selected Anki note type."* The saved note type was respected
when creating cards, but Settings always redisplayed **Kaishi 1.5k** instead of the user's **Lapis** —
so the UI lied about its own state, and the user could not tell which note type was in force.
Fixed and released in **v1.6.270**; that release also parallelised Anki-backed Study startup, dropped
a redundant note-type query, and paged card details.
**Status: genuinely closed.** Worth keeping because it is the same class as U1/U2 — *settings display
diverging from settings state* — and because Anki-backed Study startup was slow enough to need
optimising once already, which corroborates the owner's "the Anki integration is slow" (A5).

## A8. ACCOUNT/SRS INVESTIGATION RESULT — sign-in is NOT broken; three other things are
[2026-07-26, verified against origin/main]

**Sign-in could NOT be reproduced as broken.** 36/36 account tests pass; the live worker is healthy;
client↔server route tables agree with no mismatches; full OAuth start verified by curl —
`POST /auth/google/reader → 201`, `GET /auth/google/start → 302` to Google with a valid client_id and
redirect_uri, and Google returns 200 with no `redirect_uri_mismatch|invalid_client|access blocked`.
Signed-out API responses are coherent (401s with correct messages), not failures.
**Untested leg:** everything after Google CONSENT (callback → linkGoogleSubject → `?account=linked`
→ Academy handoff), because completing consent creates an account. **The owner signing in once with
DevTools Network open would localise it in seconds** — that is the fastest next step.

### The likely source of the "it's all broken" impression — U42
**There is no account control on `/academy/` or `/study/` at all.** Both are standalone SPAs; the
hosted account control only mounts into VitePress pages (`academy-account.ts:220-236`).
**You cannot sign in from the two surfaces where SRS actually lives.** Plus the reader sign-in chain
is ~7 steps (donate → class code → session → Google link → profile key init → pairing code on site →
paste into reader), each able to fail independently, and reader device state is silently dropped on
any 401. And Academy is entitlement-gated behind a DONATION (`support.yomureader.com/donate`) with no
free path — which contradicts the owner's own statement that "anyone in the discord I will give
access to the academy".

### U43. PROXY ALLOWLIST GAPS — reproduced, 400 `target-not-allowlisted`
`https://yomureader.com/study/` throws 6 console errors from these:
- **jiten example sentences dead.** `workers/jpdb-public-proxy/src/index.ts:502-544` admits only
  `/^\/api\/vocabulary\/\d+\/\d+\/info$/`, but `src/reader/dictionaries/jiten.ts:754` requests
  `…/random-example-sentences` → **400**. This kills the feature noteliana calls Yomu's best:
  *"instant nadeshiko examples when you click on a word — no other one does that."*
- **ImmersionKit MEDIA host never allowlisted.** Only the API hosts are; `immersion/kit.ts:18` fetches
  media from `us-southeast-1.linodeobjects.com/immersionkit/…` → every mp3/jpg **400s**. Search
  succeeds, media dies. **This also kills the batch-mining spec's "sentence audio + screenshot per
  line" on the hosted surface.**
- **Bunpro reviewables CORS-blocked on hosted Study** (`bunpro.ts:185`) — works in the userscript via
  GM_xmlhttpRequest, not on the site; only the Bunpro audio CDN is proxied.
Also noted: `proxy.yomureader.com` does not resolve (harmless today — recognition set, not fallback).

### U44. SRS CARD MODEL HAS NO LANGUAGE FIELD — DO THIS BEFORE DECKS FILL UP
`StoredYomuSrsCard` (`src/reader/srs/local-yomu-deck.ts:11-32`) is `expression` + `reading` +
`meanings`. `reading` is a Japanese concept, and across 32 targets identical Latin strings
(es/fr/de) would collide in one undifferentiated deck.
The SERVER side is fine — `reader_srs_events` stores opaque ciphertext and is language-agnostic.
**So the discriminator must be added to the CARD MODEL, and it must land before decks are populated:
retrofitting it onto already-synced E2EE events means a migration that cannot be run server-side.**
This is the most time-critical item in the whole multilanguage effort.

## U45. YOMU IS NOT SEARCHABLE — discoverability, and it is cheap to fix
Owner: users cannot find it. Concretely, from the research: **searching "yomu" on the Chrome Web
Store returns nothing — only よむ works.** The extension's store NAME is the Japanese よむ, so Latin-
script search misses it entirely, and every English-speaking user who is told "search for yomu" fails
at step one.
Fix across every listing: Chrome Web Store, addons.mozilla.org, Greasy Fork — the name/title must
contain **"Yomu"** in Latin script (e.g. `Yomu (よむ)`), plus keywords people actually type: japanese,
furigana, dictionary, popup dictionary, immersion, mining, anki, srs, reader, yomitan.
Then verify by searching each store, not by assuming. Also relevant: noteliana said the Chrome listing
"could better highlight the features" (U40), and the owner wanted Yomitan's resource-sharing pages and
the community wikis to list Yomu — a separate discoverability channel worth pursuing.

## U46. IMMERSIONKIT EQUIVALENTS FOR THE OTHER 31 TARGET LANGUAGES
ImmersionKit is Japanese-only (anime/drama sentence search returning sentence + audio + screenshot).
It is central to two things users love — "instant nadeshiko examples when you click on a word — no
other one does that" — and to the batch-mining spec's "sentence audio + screenshot per line".
**So a per-target EXAMPLE-SENTENCE + MEDIA source is a required capability of the language contract**,
alongside dictionaries/audio/grammar (see [[yomu-multilang-all-targets-goal]]).

Research per language and record what actually exists, with URL shapes, coverage and whether media
(audio/image) accompanies the sentence:
- **Tatoeba** — multilingual sentence bank, ~400 languages, some audio, CC-licensed, has an API.
  The obvious baseline for text examples; weak on media.
- **YouGlish** — real pronunciation from video, many languages; check embeddability.
- **Playphrase.me** — film/TV clip search, several languages.
- **Reverso Context / Linguee** — bilingual usage examples, broad coverage; check terms.
- **Wiktionary/Wikisource usage examples** — already in the WTY dictionaries we plan to mirror.
- **Common Voice / Lingua Libre / Wikimedia Commons** — per-word audio for many languages (already
  noted as the audio route in A6).
- Per-language corpora (e.g. Leipzig collections) that our own `languages.json` already cites.
Deliverable: a table of target → example source(s) → has audio? → has image? → API shape, and an
explicit list of targets with NO usable source, so the affordance can degrade visibly per A2/A3.

**OWNER REDIRECTION 2026-07-30, verbatim: "for U46 - find existing websites and hotlink to it like we
do for immersion kit please", "you need to do some research what is availible", "do not worry about
liscencing".** This supersedes the adapter/hosting half of the ticket above. Hotlinking a public site
needs no adapter, no mirror and no licence review, and the mechanism has existed since the first
Japanese defaults: `DictionaryLookupLink.urlTemplate` with a query token in it.

- [x] **U46.a — SHIPPED 1.8.43: per-target lookup hotlinks for all 32 non-Japanese targets.**
      Data lives in `config/multilingual/lookup-links.json`; `src/reader/settings/lookup-links.ts`
      resolves it. Japanese keeps `DEFAULT_DICTIONARY_LOOKUP_LINKS` byte-identical (asserted).
      A shared site reaches a target **only if that target lists the site's code**, so there is no
      per-language branch anywhere and every omission is a measured one. Component labels
      (definitions / example sentences / audio / images) are claimed only where measured, and the
      components **no** site in a target's set can supply are stated in the editor rather than hidden —
      the same reversal 1.8.41 applied to the example panels. The verifier's non-blocking live-site
      follow-ups remain open under A41.
- [ ] **U46.b — still open: the adapter-side work the hotlinks do not cover.** Hotlinks open a tab;
      they do not put a sentence, a recording or an image *inside* the popup. The in-popup example
      source contract landed in 1.8.41 (ImmersionKit for ja, Tatoeba for the 32) and is unchanged by
      this pass. Sentence audio remains licence-checked per file and no target has a licensed
      sentence-paired image source.

## U47. ACADEMY ACCESS — keep the donation gate, ADD grantable codes, and FIX the missed donors
[owner 2026-07-26] "for academy - keep it gated by donation but also have codes I can give them.
Also for some of our current donators they didn't even get keys despite donating."

Corrects A8's note: the donation gate is INTENTIONAL and stays. Two things are missing.

**a) OWNER-GRANTABLE CODES.** Henry needs to hand access to people directly — he has already promised
it publicly in Discord ("anyone in the discord I will give access to the academy", and to the first
Patreon subscriber "it will give you access to the academy once it's ready"). Needs a way to mint
and issue codes outside the donation flow, and to see who holds what.

**b) BUG — PAYING DONORS RECEIVED NO KEY.** Some people donated and never got access. That is the
worst class of bug in the product: they paid, and nothing arrived. Investigate the donation →
entitlement → code-issue path end to end (`support.yomureader.com/donate`, the entitlement gate at
`/academy/`, migrations `0007_invite_account_requirement` / `0008_all_invites_require_account`), find
where issuance drops, and **reconcile retroactively** — identify every donor without a key and issue
one. Then add a check so a completed donation without an issued key is detectable rather than silent.
Note the related unknown from A8: the leg AFTER Google consent is untested, and that is exactly where
account linking and entitlement would fail quietly.

Also still true and worth fixing alongside: **there is no account control on `/academy/` or `/study/`
at all** (U42) — so even a donor with a valid key has nowhere to sign in on the surfaces that need it.

## U48. SIGN-IN IS BROKEN (owner confirms) + ACADEMY SIGN-UP IS TOO HARD — TOP PRIORITY
[owner 2026-07-26, after the investigation] "sign in is broken and things like that academy sign up
is too hard"

**Correct the record on A8.** The investigation proved only that everything UP TO Google consent is
healthy (36/36 tests, worker live, OAuth start returns a valid Google redirect). It explicitly could
NOT test anything after consent, because completing consent creates an account. **The owner
experiences it as broken, so the fault is in the untested leg.** Do not treat "tests pass" as
evidence against the owner's direct experience — the tests do not cover this path.

**Where to look, in order:**
1. `handleGoogleCallback` → `linkGoogleSubject` (`workers/yomu-academy/src/oauth.ts:154-160`) — the
   first thing that runs after consent, and untested end to end.
2. The redirect back: reader sessions → `${origin}/?account=linked`; Academy → `/academy/?account=failed`
   (oauth.ts:160/165). A silent `failed` here would look exactly like "sign-in is broken".
3. **The entitlement gate** — U47 says donors were issued no key. If entitlement fails after a
   successful link, the user signs in and still gets nothing, which reads as sign-in failing.
4. Reader device state is silently dropped on ANY 401 (`account-sync.ts`), so one bad response
   discards the pairing with no message.
5. `__Host-academy_oidc` has `Max-Age=600` — a slow sign-in (reading the consent screen, switching
   devices to fetch a code) expires the flow. Ten minutes is tight for a 7-step process.

**FASTEST DIAGNOSIS:** owner signs in once with DevTools Network open and captures the requests from
the consent click onward. That localises it in seconds and needs no guessing.

**ACADEMY SIGN-UP IS TOO HARD — redesign it, do not just fix it.** Current chain is ~7 steps:
donate → receive class code → create session → link Google → initialise profile key → generate a
pairing code on the site → paste it into the reader. Each step can fail independently and several
give no feedback. Against the owner's own ≤5-minute target (B1) this is the worst offender in the
product. Combine with U42 (no account control on `/academy/` or `/study/` at all) and U47 (grantable
codes + donors who never received keys): **sign-up, entitlement and account UI should be redesigned
as one piece of work, not three tickets.**
TO-BE worth aiming at: sign in with Google, and be done — code redemption optional and inline,
entitlement resolved server-side, reader pairing automatic or one click, and every failure visible.

## U49. THE USER JOURNEYS AND FLOWS THEMSELVES NEED REDESIGN
[owner 2026-07-26] "I don't like the user journeys and flows at the moment"

Treat this as a mandate to REDESIGN the flows, not to tune the screens. Every complaint recorded
tonight is downstream of a flow that was never designed end to end — features were added and each
grew its own entry point. The journeys to redesign, with the evidence that each is broken:

1. **Install → first annotated page.** Owner's target: ≤5 min (B1). Today: settings overload (U38),
   "Prefer Japanese site" wrongly defaulting on (U3), a hard refresh needed on YouTube (U5), reload
   on every page (U6). A user should not meet a settings dialog before they see a reading.
2. **Sign up / sign in / entitlement.** ~7 steps, broken (U48), no account control on the surfaces
   that need it (U42), donors with no key (U47). Target: sign in with Google, done.
3. **Choosing what to study with.** Users must currently pick between Anki / Yomu SRS / jpdb / jiten
   and live with the consequences (A2). Target: never make them choose; N sources reconcile.
4. **Mining an episode.** Batch mining is slow (U13), the buttons give no feedback (U35), and the
   filters that make it work (i+1) are the spec's best idea and not surfaced.
5. **Mining a text page.** Exists but is weaker than the video path; the competitor LOST this and
   Yomu should own it.
6. **Reviewing.** Study is denser and slower than jiten (A7), furigana appear on the wrong side,
   scales differ (U32), and the owner tells people not to use it.
7. **Finding and installing dictionaries.** 116 of 186 reachable; the panel needs progressive
   disclosure (dictionary browse work in flight).
8. **Getting help / changing a setting.** No per-setting explanation (U38); navigation is the single
   biggest complaint (U37).
9. **Supporting the project.** Three payment options at once (B6).
10. **Moving between devices.** Settings per-site not global (U1), lost on update (U2), no export
    (U20) — see A6 multi-platform.

METHOD: for each, write AS-IS (with the friction named and counted in steps), TO-BE, and the PATH of
independently-shippable steps. Do not design them in isolation — several share a root cause (state
that does not persist, entry points that multiplied, defaults that were never revisited).
This supersedes "map the journeys" in the simplify workflow: the answer is not documentation of the
current flows, it is better flows.

## U50. "PROFILE & SYNC" (Class journal) IS WAY TOO COMPLEX — the worked example of U48/U49
[owner 2026-07-26, screenshot of https://yomureader.com/academy/?view=profile-sync] "this is WAY too
complex"

A SIGNED-IN user, trying to use Academy, is shown ALL of this on ONE screen:
- "Pairing required — Use a one-time code from a device that already has your encrypted history."
- Account: **Learner#406049** ← generic label + random number, not who they are (U51)
- Academy access: **No paid code**
- A whole "Activate a paid code" section explaining that paid codes must be linked to Google, can be
  activated once, and one Google account holds one paid code
- "Paid Academy code" input + Activate
- FOUR more buttons: **Start as first device · Sign out · Delete cloud learning data · Delete account**
- "Pair this device to continue" + "One-time pairing code" input + Connect this device
- "Reader devices: No connected Reader devices"

**That is seven actions, two of them destructive (delete data, delete account), plus end-to-end
encryption pairing jargon — presented to someone who just wants to open Academy.** It reads as an
admin console, not an onboarding step. Nothing tells the user what to do FIRST.

TO-BE: a signed-in user with no devices should see ONE thing — "Start here" — and nothing else.
Pairing only appears when there IS another device. Code activation only when they have a code.
Destructive actions move behind an "Advanced" or account-settings disclosure. E2EE is explained in
one sentence at most, or not at all until it matters. Everything else is progressive disclosure.

Also visible in that same screenshot, to fix alongside:
- **403 on Academy media**: `GET .../academy/media/audio/v1/persona/no-more-what-ifs-instrumental.flac`
  → **HTTP 403**, load failed. Academy audio is broken.
- CSP is blocking an inline script (`script-src-elem`, nonce mismatch) on the Academy page.
- Repeated `Error: Not allowed to define cross-origin object as property on [Object]` from
  content-script (x3, twice) — the reader injecting into the Academy page.
- The preloaded `yomu.user.js?v=1.8.13` was "not used within a few seconds" — a wasted preload.

## U51. IDENTITY SHOWS AS "Learner", NOT THE USER
Signed in with Google, the account control says **"Signed in as Learner"** and the profile page shows
**Learner#406049**. `academy-account.ts:42` renders `Signed in as ${displayName}` and displayName is
falling back to a generic role label rather than the Google account's name or email. After signing in
with Google, a user should see themselves — this alone makes a working sign-in feel broken.

## U52. USERS WHO SIGNED UP ARE NOT RECEIVING CODES — BLOCKER, fix before anything else
[owner 2026-07-26] "also users are not getting codes even if they did sign up"

Broader than U47 (which was donors specifically). **Signing up does not deliver a code at all.**
So the funnel is: user signs up → receives nothing → cannot access Academy → the product looks dead.
The owner's own screenshot corroborates it: signed in, and `Academy access: No paid code`.

This is the top of the queue, above every UX and multilanguage item. Sequence:
1. **Trace the issuance path end to end** — sign-up/donation → entitlement → code minted → code
   DELIVERED (email? on-screen? Patreon message?). Establish which step drops it, and whether a code
   is even generated. Note nobody has confirmed the delivery CHANNEL exists — when the owner asked
   the first Patreon subscriber "what happened when you subscribed on patreon, did it give you an
   email or anything?", the answer was only "Yes I got it… nothing personalized". That is not
   confirmation a code was sent.
2. **Reconcile retroactively** — list every account that signed up or donated and has no code, and
   issue one. These are real people who already paid or joined.
3. **Add owner-grantable codes** (U47a) so Henry can hand access out directly, as he has already
   promised publicly in Discord.
4. **Add a detector** — a completed sign-up or donation with no issued code must raise an alert, not
   fail silently. This has now gone unnoticed long enough to affect multiple users.
5. **Make it visible in the UI** — `Academy access: No paid code` tells the user nothing about what
   to do. It should say how to get one, and whether one is already owed to them.

Related and probably the same root cause: U47 (donors with no keys), U48 (post-consent leg untested —
`handleGoogleCallback` → `linkGoogleSubject` → entitlement is exactly where issuance would sit).

## U53. BACK BUTTON DOES NOT WORK on the Academy profile/sync view
[owner 2026-07-26] Browser Back from `https://yomureader.com/academy/?view=profile-sync` does not
return the user to where they came from. The Academy SPA reads `?view=` on load
(`src/academy/app.ts:148`) and routes internally (`app.ts:164` `route: 'profile-sync'`), but it does
not appear to participate in history — so Back either does nothing or leaves the user stranded in the
same view. A user who opens Profile & sync (already too complex, U50) then cannot get out of it.
Fix: push/replace real history entries for internal routes and handle `popstate`, so Back and Forward
behave normally. Check every other `?view=` route in the Academy SPA for the same defect, and the
Study SPA too — both are standalone SPAs (U42) and likely share the pattern.

## U54. "AI SLOP" COPY — concrete inventory, all on the account/profile surface
[owner 2026-07-26] "can you fix any 'ai slop' odd things"

Found in `src/academy/ui/profile-sync-screen.ts` and `src/reader/app/academy-copy.ts`:

1. **"Class journal" is the page heading above "Profile & sync"** (`academy-copy.ts:252,285`). It is a
   fictional Academy world-location name (`world-locations.ts:2105`, `moodle:class-journal`) leaking
   onto an ACCOUNT settings screen. A user clicking "Profile & sync" lands on "Class journal" and has
   no idea why. **Rename the account screen to what it is.**
2. **"Learning events are encrypted on this device before sync."** (:43) — "learning events" is
   internal vocabulary. Users have reviews, words and progress, not events.
3. **"Start as first device"** (:174) with the caveat "Continue only if this account has never synced
   on another device. Otherwise, use a pairing code." (:177) — asks the user to reason about
   distributed state before they can proceed.
4. **Two names for one action**: "Turn on encrypted sync" (:154, :187) and "Sync now" (:187) depending
   on state, alongside "Pair another device" (:209), "Connect this device" (:322), "Recover another
   account" (:201), "Link Google account" (:206), "Export encrypted data" (:215). Seven device/account
   verbs on one screen (see U50).
5. **"No paid code"** as a status line — states a lack, offers no next step.
6. **"Learner#406049"** as identity (U51).

RULE for the rewrite: name things after what the USER is doing, not after the mechanism. "Encrypted",
"events", "device pairing", "first device" are implementation. The user is signing in, and getting
their words onto another device.

NOT ATTEMPTED IN THIS SESSION, deliberately: this is a multi-file copy change across an en/ja
localized surface, and `tests/reader/settings-form/07-localization-mining-japanese.test.ts` fails on
any English leaking into the ja rendering. Doing it half-way would leave the tree red. It needs a
session with room to run the localization gate after each edit.

## U55. DONATION EMAIL ≠ GOOGLE EMAIL — the probable ROOT CAUSE of U47/U52
[owner 2026-07-26] "also what if they donate with a different email to their gmail"

**This is very likely why donors and sign-ups get no code.** Entitlement is bound to the GOOGLE
identity (`linkGoogleSubject`, `workers/yomu-academy/src/oauth.ts:154-160`), while the money arrives
through Patreon / Ko-fi / Stripe carrying **whatever email that platform holds**. Patreon accounts are
routinely not Gmail; Stripe uses the card's billing email; Ko-fi its own. If issuance matches on
email, every mismatched donor silently gets nothing — which is exactly the reported symptom, and it
explains why it affects *some* donors and not others.

Verify first (cheap): take a donor known to have received nothing and compare the donation email
against their Google account email. One case confirms or kills the theory.

Fix direction — do NOT keep email as the join key:
1. **Issue the code to the PAYMENT platform's own channel** — the Patreon/Ko-fi/Stripe receipt or DM,
   at the moment of payment. Then it reaches them regardless of which email they use, and does not
   depend on a later Google link. This alone fixes the funnel.
2. **Redeem, don't match.** The user activates the code against whichever Google account they sign in
   with. Entitlement then belongs to the account that redeemed it, and email never has to agree.
3. **Fallback for the already-affected:** owner-grantable codes (U47a) plus a way to look up a
   donation by email OR platform handle and issue a code manually.
4. Support **multiple emails per account** so a donation email can be attached after the fact.
Note the same class of problem exists for Patreon-tier → entitlement generally: no linkage exists
between "supporter on Patreon" and "account in Yomu".

## U56. SUPPORT USERNAMES
[owner 2026-07-26] "and can you support usernames"

Replaces the generated `Learner#406049` (U51). A user picks a username; it becomes their display name
everywhere ("Signed in as …", profile, any future social/leaderboard surface), and it decouples
identity from the Google account's real name and from email entirely — which also helps U55, since a
username is a stable handle to grant a code against.
Needs: uniqueness + reservation, a change path, validation (length, charset — allow non-Latin, this
is a Japanese-learning product), moderation for abusive handles, and a sensible default at sign-up
(suggest from the Google name rather than `Learner#406049`, but let them edit it before it sticks).
Store it on the account, not the device, so it survives the multi-device pairing flow.

## U57. PROPER ACCOUNT FEATURES — use JITEN as the reference implementation
[owner 2026-07-26] "Support proper account features as per the jiten reference"

jiten.moe is the benchmark, and users already prefer it ("I'm already so comfortable with jiten srs",
"jiten is compact, and the reviews are crazy fast"). Study what its account actually offers and match
it. Known from this research alone:
- **Vocabulary management** — `jiten.moe/settings/vocabulary`: manage the whole known-word set,
  **import from Anki**, **import from JPDB** (the owner used it and called it "a little hidden").
- **Deck management** and per-deck review control.
- **Review history** the user can inspect, and **undo/regrade** of a mistaken grade.
- **Suspend and resume in bulk** — bdlance found bulk suspend and asked for bulk resume (U19).
- **New-first review sessions** to control how many new words enter per day (bdlance's whole reason
  for wanting collect-without-review, U18).
- A settings surface a user can reason about without a manual.

Against that, Yomu today has: no account control on `/study/` or `/academy/` at all (U42), a ~7-step
pairing flow (U48), a generated `Learner#406049` identity (U51/U56), no bulk resume, and no
collect-without-review. **Do the comparison properly**: enumerate every account-level capability jiten
exposes, mark Yomu has / partial / missing, and treat the gaps as the account backlog.
Two things to carry over deliberately rather than copy blindly: jiten's **4-point grading** vs Yomu's
5 (U32 — pick one and explain it), and its **compactness**, which is the thing users actually praise.
Yomu's advantage to preserve while matching features: it is free, and it does not require a server
round trip for everything (A3 offline-first).

---

# 2026-07-26 — SWEEP: everything diagnosed this session but not yet a backlog item

## U58. CLAMPED-HOST MIRROR TRUNCATION — diagnosed, measured, NOT YET FIXED
The owner's iPad report (`登録チャン…` in the YouTube sidebar; also the Shorts heart icon, so it is
generic). **Root-caused by A/B against native at the same profile/width/browser:**
    native:  登録チャンネル  client:64 scroll:64 overflow:false   (it fits)
    yomu:    span.title      cw:64 sw:64  ch:16 sh:32  lineClamp:1  inFlowRuby:0 detached:1
Width is fine. **HEIGHT doubles.** Clipped-row detection works correctly (detached channel, zero
in-flow ruby). The defect: the ADDITIVE TEXT MIRROR is a child of the clamped host, its content is two
lines tall (reading + text), so `scrollHeight` 16→32 inside `-webkit-line-clamp:1` and the engine
truncates the HOST's own text. マイページ shows the same signature.
FIX: the mirror must not contribute to the host's scroll height inside a clamped/ellipsis host —
take it out of flow, or keep it entirely in the overlay. NOTE: `position:absolute` alone may not
suffice, since absolutely-positioned children still count toward an ancestor's scrollHeight when that
ancestor is their containing block. Verify by measurement, and cover it with a REAL-BROWSER smoke —
jsdom cannot see this.

## U59. SUBTITLE READING-SHADOW BLEED — owner's aesthetic call still open
Kanji carrying furigana render measurably darker than the okurigana beside them. Em-relative radii
landed in 1.8.12 and 32/32 legibility cells now beat pre-fix, but an independent re-measure found the
reduction OVERSTATED at large cues (51% not 81% at chromium 40px, 53% not 73% at 60px). At and below
the default it is genuinely gone; at large cues it is roughly halved. Owner should look at real
footage and decide whether that is enough.

## U60. iPad STICKY :hover MAY LEAVE THE NATIVE CAPTION UN-BLURRED
`subtitles-youtube.css:227` un-blurs the platform caption on `:hover`; iPad Safari's sticky hover means
the first tap can leave it stuck un-blurred after the blur toggle (1.8.13) does its job.

## U61. LANGUAGE-SEAM WORK LEFT BEHIND (from the audit + verification)
- **33** direct `HAS_JAPANESE` sites remain outside `languages/` (was ~90). Heaviest: `gaming/shared.ts`
  (6, own regex), `academy/ui/vn-stage.ts` (5, own regex), `newtab/runtime.ts`, `dictionaries/learner-glossary.ts`,
  `sources/definition-render.ts`.
- **34** lines still carrying raw kana/kanji Unicode ranges (was ~129) — `anki/*`, `subtitles/*`,
  `audio/candidates.ts`, `dictionaries/yomitan/*`.
- **`deinflectJapaneseTerm` is STILL imported by `dictionaries/yomitan/index.ts:508`** — the
  language-agnostic dictionary engine applies Japanese verb morphology to every language. The exact
  one-line change is written up in that workflow's report.
- **5 capability domains still have zero consumers**: `lookupCandidates`, `featureSemantics`,
  `capabilities.*`, `typography.readingAnnotationMode`, `typography.supportsVerticalWriting`.
- **No UI to pick a target language**: `settings/form.ts:145` renders a hardcoded
  `<span>日本語 — Japanese</span>` beside a HIDDEN input; `settings/form-read.ts:242` would revert a
  non-`ja` value on save. Two small edits, and the seam becomes user-reachable.
- Learning-target `'ja'` literals still unrouted: `audio/player.ts:1283` (TTS voice pick),
  `newtab/browse-view.ts:128` + popup origin-graph (collation), `app/preferred-site-language-impl.ts`,
  `study/tools-impl.ts:285`, `settings/index.ts:441` (`ocrLanguage: 'ja-JP'`).

## U62. DICTIONARY MIRROR RESIDUALS
- **13 published entries have DEAD Drive source URLs** (upstream re-uploaded words.hk, CC-Canto,
  jitendex, JMnedict, KANJIDIC…). Served objects fine; `acquire.mjs` can no longer re-fetch them.
- **`languages.json` now has measured readiness.** All 32 targets have published terms supply; each row
  records published-entry, term, pronunciation, definition-language and missing-upstream coverage.
- **Kanjium pitch + WTY JA-JA are offered as curated cards pointing OFF-MIRROR** — users see install
  cards for dictionaries we do not host.
- **135 zips across 6 linked Drive folders** unmirrored; 7 Proton folders unenumerable (key in URL
  fragment); 7 GitHub collection repos not cloned.
- **The Lao gap was stale.** The frozen WTY release contains 29 Lao archives across 16 definition
  languages, including 16 term dictionaries and 13 pronunciation dictionaries.

## U63. RELEASE/TOOLING RESIDUALS
- `npm run fallow:dead-code` still exits non-zero (4 pre-existing rows).
- **voiceworks-toolkit**: the duplicate-translation fix is on main (`3fdba5c`) but the userscript still
  advertises `@version 170`, so **nobody auto-updates onto it**. Needs a bump + release.
- `prepare-release.mjs` shelf durability has one residual conditional gap.
- The gate runs `test:ci` BEFORE `docs:build`, so a stale stamped `docs/public/study/index.html` fails
  a test that a later stage would fix. Either stamp earlier or make the test tolerate it.

## U64. GRADING SCALE MUST MATCH THE SOURCE — supersedes U32 and part of A2
[owner 2026-07-26] "don't explain — actually fix. Always match whatever the source is. For example,
if jiten has 4 then so should yomu, if jpdb has 5 so should jpdb."

**Correction to what I previously wrote.** Do NOT define a canonical Yomu scale and map other
backends onto it, and do NOT explain the mismatch in the UI. The grading control **adapts to the
backend being graded into**:
- grading into **jiten** → show **jiten's 4 buttons**, with jiten's labels and semantics;
- grading into **jpdb** → show **jpdb's 5**;
- grading into **Anki** → Anki's Again/Hard/Good/Easy;
- grading into **Yomu SRS** → Yomu's own scale.
No lossy translation, no user-facing explanation, no surprise: what the user presses is exactly what
the destination records. noteliana's worry ("yomu uses a five point scale when jiten has a 4 so I'm
unsure how that will affect things") then simply cannot arise.

Implications to design for:
- The grading component becomes **source-driven** — scale, labels, keyboard shortcuts and colours all
  come from the destination adapter, not from Yomu's own constants.
- With N simultaneous sources (A2), a review destined for more than one backend needs a defined rule.
  Prefer: grade in the destination's own scale and let each adapter translate INTERNALLY where it must,
  rather than showing the user a compromise control.
- Yomu SRS's own scale should then be chosen on its merits (FSRS-compatible), not as a lowest common
  denominator.

---

# GOVERNING PRINCIPLE — "Everything should always be automatic and seamless"
[owner, 2026-07-26]

This supersedes and explains most of the items above. Apply it as a TEST, not a slogan: for any
screen, setting or step, ask **"why is the user doing this at all?"** If the answer is that the
software could have done it, or could have chosen a sensible default, or could have waited until it
actually mattered — then remove the step.

Everything recorded tonight is a violation of it:
- **Grading scales** (U64) — don't explain the mismatch; match the source automatically.
- **Audio sources** (1.8.6) — detection became automatic, the button disappeared. That is the pattern.
- **Codes and entitlement** (U47/U52/U55) — a donation should grant access automatically, not require
  a code to be delivered, found, and pasted, with email as a fragile join key.
- **Sign-up** (U48) — 7 steps. Should be: sign in with Google, done.
- **Device pairing** (U50) — "Start as first device" asks the user to reason about distributed state.
  The software knows whether other devices exist.
- **Settings** (B1/U38) — should work out of the box; advanced options exist but are never required.
- **Target language / dictionaries** (U15) — pick a language once, get the right dictionaries; don't
  make people trigger DeepL on every popup.
- **Known-word seeding** (U28) — import automatically from whatever the user already has.
- **Multiple SRS backends** (A2) — never make the user choose; reconcile them.
- **Parser choice** (A1/U17) — best result automatically, not a backend the user must select.
- **Updates and channels** (A6) — the user should not have to know which build they are on.

Corollary for defaults: a default that most users must change is a bug (U3 "Prefer Japanese site" on,
U23 not-in-deck colour, U31 jpdb/bunpro surfaces on, U26 furigana on the wrong side of a study card).

Corollary for failure: when something cannot be automatic, it must be VISIBLE — degrade honestly and
say so, never silently do nothing (U52's silent non-delivery is the worst case of this).

## U65. ACADEMY PEDAGOGY NOTES from the same user research — keep these, they are good
(Academy stays Japanese-only and "coming soon", but the teaching design is worth capturing now.)

**"Razor speak" — the strongest idea in the whole conversation.**
canna98 learns grammar from "a smart guy that explains it to me in razor language" — Razor being the
Genshin Impact character who speaks in short, broken, plain sentences. Her reasoning:
*"because textbooks make sure that u will not understand it."* Owner: *"For academy I am definitely
using razor speak — what a brilliant idea."*
The principle: **explain grammar in deliberately simple, blunt language, not grammatical register.**
Not "the て-form conjunctive particle indicates sequential action" but something a tired person
understands on the first read. This is a house style for every Academy explanation, and it doubles as
a differentiator — noteliana: *"most grammar resources are boring asf."*
canna98 offered to write grammar explanations in razor language once she has learned more; take her
up on it. Her handwritten kanji notes were also praised by the owner — hand-drawn material has a
warmth that generated content lacks, and she is willing to contribute.

**Grammar is the most divided topic in the community** [noteliana] — Tae Kim vs Cure Dolly vs "don't
study grammar at all". So Academy should not pick a doctrinal side; teach through real examples and
let people use it alongside whatever they already believe.

**Real examples beat invented ones** [noteliana]: *"the biggest strength of yomu is that it will give
real examples too from nadeshiko"*, and the jlab grammar deck she liked *"used real examples"* for
every point (https://www.japanese-like-a-breeze.com/guide-for-beginners/). Academy should pull live
examples from the same sources the reader uses, not ship canned sentences.

**Graded answers, immediately** [owner]: *"you will be able to get your answers graded as you do it.
With Genki I would always have to write it out in the book and look it up in the answer sheet after —
it was hard."* Instant feedback is the feature; the textbook loop is the thing being replaced.

**The 50% rule** [owner, from "A Year to Learn Japanese" + drawabox.com/lesson/0/2/50percent]:
spend at most half your time on study-for-study's-sake, and the other half on what you actually enjoy
— reading what you like, using it for real. Owner: *"it's hard to do because my brain likes to lock
into one thing, but I do believe if you can balance both you will go so far."*
**Design consequence:** Academy should actively push learners back into immersion rather than
maximising time-in-Academy — e.g. surface "go read something" as a first-class action, and count
immersion alongside study rather than treating study as the only progress.

**Bunpro is the quality bar for grammar SRS** [owner]: *"I was trying out bunpro and it's really good…
We need to make something like that."* Pair with B3 (Bunpro also named as the clean-UX reference).

## U66. TEACH PEOPLE HOW TO LEARN JAPANESE — unbiased, not a Yomu advert
[owner 2026-07-26] "if yomu was to teach one thing it can be how to learn japanese, like with the
'A Year to Learn Japanese' guide — that can be something we outline. Use references like animecards
etc. **Don't bias it all towards yomu** — try and make genuinely useful content based on that."

The single best thing the docs could be. Not "how to use Yomu" — **how to actually learn the
language**, honestly, citing the community's real resources, including ones Yomu does not touch.
Why it is also good strategy (say it out loud, then ignore it while writing): honest guides get
LINKED. The owner already wants Yomu listed in the Yomitan resource-sharing page and the TMW wikis —
those communities link to useful writing, not to product pages. And noteliana's "when college starts
in September I'll recommend this to friends taking Japanese courses" is exactly this audience.

**Editorial rules**
- Recommend the best tool for each job even when it is not Yomu. If Anki+asbplayer is better for
  something today, say so. Credibility is the whole asset.
- No feature-pushing inside the guide. Mention Yomu only where it genuinely is the answer, and link
  out for the rest.
- Concrete over motivational. The audience has read enough "just immerse" posts.
- Should stay useful when the reader uses none of our software.

**Source material and references gathered from the community conversation**
- **A Year to Learn Japanese** — the guide the owner cites; opens with the 50% rule.
  https://docs.google.com/document/d/10bRzVblKVOsQJjTc2PIi1Gbj_LrsJCkMkh0SutXCZdI/edit
- **The 50% rule**, originally an art-practice idea: https://drawabox.com/lesson/0/2/50percent
- **animecards.site** — the mining methodology reference; also where our "ultimate audio source"
  pulls from: https://animecards.site/yomitan_audio/
- **Japanese Like a Breeze / jlab beginner guide** (grammar deck built on real examples):
  https://www.japanese-like-a-breeze.com/guide-for-beginners/
- **Grammar approaches, presented neutrally** — Tae Kim, Cure Dolly, Bunpro, Genki, or the
  "don't formally study grammar" camp. noteliana: it is "the most divided topic"; do not take a side.
- **Tools worth covering honestly**: Yomitan, Anki + AnkiConnect, asbplayer, Jiten, JPDB, Bunpro,
  WaniKani, ttsu reader, Hoshi reader (books), Language Reactor, Migaku, YAMA, Nadeshiko,
  ImmersionKit, KanjiVG, nihongokanji.com (Joyo), zimaku.cc (Japanese subtitles),
  Tango Lens + Decky and YomiNinja (game OCR), Tailscale (Anki on mobile), kanjiday.com.
- **Devices/contexts real users are in**: iPad + BookWalker (canna98), Steam Deck + VNs (vvvvtk),
  iOS Safari + Narou (bdlance), college Japanese courses (noteliana), evening classes (owner).

**Shape to consider**: a short spine — how the pieces fit (input, mining, SRS, grammar, output) — with
one honest page per stage, each ending in "what to actually do this week". Written so a beginner can
start today and an intermediate can find the one thing they are missing.
Ties to B2 (docs rewrite) and B4 (store copy): the guide is the homepage's reason to exist, and the
answer to "what makes Yomu special" should sit inside a genuinely useful site, not replace it.

---

# SCOPE DECISION 2026-07-26: ACADEMY IS POSTPONED
[owner] "lets postpone the academy tasks for now - but make a note of them for me - everything else
is in scope."

**POSTPONED (noted, not deleted):** U65 (Academy pedagogy — razor speak, 50% rule, graded answers,
Bunpro as the bar), the Academy VN build itself, `src/academy/**`, `docs/public/academy/**`, and the
Academy CONTENT work. Academy also stays marked "coming soon" (B5).

**STILL IN SCOPE even though it touches Academy** — these are account/product, not Academy content:
- U47 / U52 / U55 — codes not delivered, donors with no key, donation-email ≠ Google email.
  People have PAID and received nothing; that is not postponable.
- U48 — sign-in broken + sign-up too hard. U42 — no account control on `/study/` or `/academy/`.
- U50 / U51 / U53 / U54 — the Profile & sync screen's complexity, `Learner#406049`, the dead back
  button, and the odd copy. That screen is reached by READER users, not just Academy ones.
- U56 (usernames), U57 (jiten-grade account features), U64 (grading matches the source).
- The Academy media 403 and the CSP/content-script errors on that page, since they are infrastructure.

## U67. TAE KIM IS NOT DOWNLOADED — and it is the grammar style learners actually want
[owner 2026-07-26] "tae kim is not downloaded — but that is more of the style japanese learners
really like for grammar."
Tae Kim's Guide to Japanese is a community staple and is NOT in our mirrored material. Two separate
things follow:
1. **Acquire it** — check whether a Yomitan-format or otherwise importable build exists (Tae Kim has
   long been distributed as Anki decks and structured HTML), and mirror it like the rest.
2. **Adopt the STYLE, which is the more valuable half.** Tae Kim explains grammar the way learners
   like: plain, direct, example-first, no grammatical-register jargon. That is the same instinct as
   "razor speak" (U65) from a published source — so even with Academy postponed, **Tae Kim's register
   is the model for any grammar explanation Yomu ships**, including popover grammar notes and the
   learning guide (U66). noteliana's warning still applies: grammar is the community's most divided
   topic, so present it as one excellent approach, not the one true way.

## U68–U76. REMAINING DISCORD ITEMS (final sweep)

**U68. Install is unreliable across managers.**
- canna98 repeatedly hit *"can't install from this website"* on Chrome — not a Tampermonkey dialog;
  workaround was Tampermonkey → "install from URL" with `https://yomureader.com/yomu.user.js`.
- vvvvtk on ScriptCat: *"it downloads a .js file instead of launching scriptcat"*; had to drag the
  file in manually. Owner suspected the domain/served content type.
- canna98 also could not update on PC at all at one point.
Install is the first thing every user does and it fails for several of them. Fix the served
content-type/headers so each manager (Tampermonkey, Violentmonkey, ScriptCat, Userscripts) intercepts
properly, and test each.

**U69. A "previous versions" page.** Owner promised it: *"I'll also add a place where you can install
any previous version on the website — if it happens again you can switch to an older or different
version."* Directly mitigates U68 and the daily-userscript-channel risk (A6).

**U70. Sources setting is too hard to find.** Turning jpdb/bunpro off lives under Settings → Sources;
owner: *"you are not the first person to ask that so I will actually move that to somewhere easier to
find."* Pairs with U31 (they are on by default and unwanted) and B1.

**U71. Migrating decks and review history BETWEEN backends.** bdlance: *"does anyone happen to know a
way to transfer decks and review history from jpdb to jiten?"* Jiten has it, buried
(`jiten.moe/settings/vocabulary` → manage vocab → import from JPDB); owner called it *"a little
hidden"*. Yomu should own this — it is the natural companion to A2 (never make the user choose a
backend) and to U57.

**U72. YouTube filter is a liked, differentiating feature.** sagamsil: filtering the feed by title
data is *"great for preventing distractions"*, and with it Yomu *"could replace Language Reactor"*.
It is currently undocumented and undersold — put it in the store copy and the docs (B2/B4).

**U73. Study 2.0 — combine all study modes into one.** Owner's stated design: *"it's gonna combine
all the study modes into one… but you can pick and choose what you want."* This is the frame for the
Study rework (A7) rather than a separate project.

**U74. A lightweight word/kanji-a-day surface.** Owner, on kanjiday.com: *"I just liked the idea that
you can see a word each time… maybe I can make something more lightweight from it."* The new-tab
study page already does a version of this (*"if you wanted to set yomu study as your newtab"*), and
noteliana liked that it is *"very lightweight"*. Worth doing deliberately rather than as a side
effect of the new tab.

**U75. Improve jiten by swapping in Yomu's audio.** Owner: *"we can improve jiten by swapping the
audios"* — noteliana wants NHK/daijisen/Forvo instead of jiten's AI voice during jiten reviews (U27).
Yomu already hosts fast edge audio; this is a concrete, small, high-delight win for an existing user.

**U76. Promotion channels the owner identified.** Yomitan's resource-sharing page and the TMW
(themoeway) wikis: *"if we can get recommended in some of those wikis it could help."* Also
noteliana's *"when college starts in September I'll definitely recommend this to friends taking
japanese courses"*. Ties to U66 — an honest learning guide is what earns those links.
Credit due: **woozlez made the homepage video** (owner: "woozlez is a vip he made the video on the
homepage") — keep him in the loop on any homepage rewrite (B2).

---

# 2026-07-26 — UX BENCHMARK: measured against Bunpro, Yomitan, Migaku, uBlock

|  | Bunpro | Yomitan | Migaku | **Yomu today** |
|---|---|---|---|---|
| Top-nav destinations | 4 + 2 CTAs | — | 8 | **14** (Support listed **3×**) |
| Distinct primary CTA | 1, repeated 4× | — | 1 | **0** — five equal-weight hero buttons |
| First-run decisions | **4 fields** | 12 rows | — | **12 controls in one panel** |
| Settings rows | — | 125, **41% hidden** | 4 tabs | 9 tabs, 67 checkboxes + 30 selects, `form.ts` is 3,128 lines |
| Persisted settings keys | — | 105 | — | **286 fields on `ReaderSettings`** |

**Yomu's settings open on `appearance` (`settings/form.ts:231`), which holds 22 colour fields.
The first thing a new user sees is colour pickers.**

## U77. ONE GLOBAL "ADVANCED" SWITCH — the single highest-leverage settings change
Yomitan gates 51 of 125 rows behind ONE checkbox that sets `data-advanced` on `:root`; every advanced
control opts in by CSS class. **uBlock Origin independently converged on the same design** ("I am an
advanced user"). Two of the most-used power extensions in the world settled on one switch.
Yomu hides **0%** today. Target: ≤60% of rows visible by default.
Also from Yomitan and worth copying exactly: advanced rows stay **visually marked** even when revealed
(a 0.25em accent stripe), so you always know which switches are the dangerous ones.

## U78. EVERY SETTING NEEDS A ONE-SENTENCE DESCRIPTION — no naked toggles
Yomitan ships 83 descriptions for 125 rows in a fixed skeleton (label + description | control). This
IS noteliana's request for a (?) icon (U38), but better: always visible, no hover, no click.
Dependent options become CHILDREN of their parent control (Yomitan: 50 child blocks, 64 "More…"
toggles), hidden until the parent is on — not siblings in a flat list.

## U79. GATE BY LANGUAGE IN CSS — Yomitan already solved our multilang UI problem
`data-language` on the root plus `jp-only` / `jpzhyue-only` / `jpzhyueko-only` / `not-jpzhyueko`
classes. Concretely: "Reading mode" and "Parse sentences using" are `jp-only`; "Term display style" is
`jpzhyue-only`; "Scan resolution" is `not-jpzhyueko`.
**This is exactly the "degrade visibly and honestly" contract from our multilang goal, already
implemented in the codebase whose dictionaries we already import.** Copy the mechanism rather than
inventing one. Test: switch to a target with no reading annotation → furigana controls, `furiganaMode`,
pitch colouring, the pitch legend and the provider pills are ABSENT from the DOM, not greyed out.

## U80. FIRST RUN: ASK AT MOST 3 THINGS
Bunpro's signup is 4 fields and captures the timezone in a HIDDEN field rather than asking. Yomu's
`OnboardingController` asks 12: interface language, learner language, theme, accent colour (+6
swatches), YouTube immersion, prefer-Japanese-site, offline dictionaries, page-scan mode (3 radios),
OCR mode, manual scan shortcut, hover shortcut, and an API-key fork. **Nine of the twelve are
inferable or deferrable.**

## U81. ONBOARDING ENDS ON REAL CONTENT, NOT A CHANGELOG
Migaku's dashboard wastes its whole right column on patch notes — but its left column is right:
"Try Migaku with a video" / "Try Migaku with a website", each with Beginner/Intermediate/Advanced
picks. **Steal the left column, delete the right.** Yomu has the same smell: a `data-help-update-strip`
"Version" block inside settings. Last step of onboarding should open annotated content in a new tab.

## U82. NAVIGATION: 14 → ~5, and ONE primary CTA
Yomu has 14 nav destinations (6 + 8 under "More") with **Support appearing three times** — which is
B6 from a different angle — and **no distinct primary CTA**: five equal-weight hero buttons, so
nothing is the obvious next action. Bunpro has 4 destinations and repeats ONE CTA four times.
This is noteliana's "my biggest feedback would be easier navigation" (U37), now with a number on it.

## U83. SETTINGS LIVE WHERE THEIR EFFECT LIVES
Bunpro puts Quiz Settings and Styling Options *inside* the review screen, editing the same account
settings. You never leave the thing you are configuring. Yomu equivalent: the popover, subtitle
overlay, OCR overlay and study screen each get a gear that deep-links to their own panel and returns.

## U84. DENSE LISTS GET ≤4 CONTROLS ABOVE THE FOLD
Bunpro's Grammar Library sits above ~800 items behind exactly four: search, Select Items, Add Filters,
view toggle. Filters open in a popover, all on by default, applied live with **no Apply button**.
Apply to: the dictionary catalogue (186), the mining queue, the study queue, the word browser.

## U85. "≤5 MINUTES" MUST BE A MEASURED NUMBER
Script it: clean profile, cold install → first furigana rendered on a real page, with no account, no
API key and no dictionary picker. That number goes in CI and regressions fail the build.

---

# 2026-07-26 — COMPETITIVE + COMMUNITY RESEARCH: Migaku 1.30.8 teardown + r/LearnJapanese

Two research streams, both complete. **COMPETITIVE RESEARCH ONLY: no Migaku code, asset or copy
enters Yomu.** The artefact is at `references/migaku/` — `migaku.crx` (the real signed 155 MB
package, store id `lkhiljgmbeecmljiogckofcalncmfnfo`, v1.30.8.0 built 2026-07-13), `ext/` unpacked
(1.0 GB), `PROVENANCE.txt`, and `derived/en-ui-strings.txt` — **2,132 English UI strings as a flat
`key.path = value` map. Grep that file rather than re-deriving anything below.** `ext/core/` (982 MB)
is deletable; everything cited here is reproducible from `ext/assets/` + `ext/manifest.json` (~26 MB).
The community stream drove a real browser against old.reddit.com's JSON API — ~30 searches, 22 full
thread reads, plus the sub wiki, TheMoeWay, the JP Lazy Guide and Awesome-Japanese.

**Read this section for what the community wants, not for where Yomu ranks.** The research question
was what learners actually recommend, complain about and ask for — the golden path below, the four
recurring themes, and the tool-by-tool grievances are the payload. (One incidental measurement is
recorded in U88 because it changes a decision: five shipping products already use the name, so
"search for Yomu" is broken advice. It is a naming item, not a headline.)

## THE GOLDEN PATH AS THE COMMUNITY STATES IT (2026)
0 Kana — kana.pro/DJT · 1 Grammar — **Yokubi (yoku.bi)** then Misa, Cure Dolly, Tae Kim ·
2 Starter deck — Anki + **Kaishi 1.5k** (Core 2k/6k now called outdated) · 3 Lookup — **Yomitan**,
total dominance · 4 Wire mining — Anki + AnkiConnect + **Lapis** note type, guided by the
**JP Lazy Guide**; donkuri for methodology; animecards demoted · 5 Consume — asbplayer (video),
ttsu (books), mokuro + web-manga-ocr (manga), Textractor/YomiNinja (games), **physical manga and
consoles: no accepted answer** · 6 Difficulty — jpdb, **jiten.moe**, LearnNatively · 7 Survive your
reviews · 8 Stop optimising.

The whole market in two sentences, from the top-voted answer to "what browser extension do you use":
Yomitan + asbplayer + Anki is s-tier and takes about three hours to set up — *and if you don't want
to spend three hours, buy Migaku or use Language Reactor.* **That second sentence is the one Yomu
should be taking, and cannot take while its install is a `.user.js` download.**

## WHERE YOMU SITS TODAY — honest
| Stage | Community default | Yomu today | Verdict |
|---|---|---|---|
| 3 Lookup | Yomitan | userscript + Chrome + Firefox **incl. Android** + iOS Userscripts + Safari | **Strong — on more surfaces than Yomitan. Nobody knows.** |
| 4 Mining | Anki+AnkiConnect+Lapis, ~3h | mines to Anki *and* jpdb *and* jiten *and* own SRS, video+image auto-attached | **Best hand, played face-down** (noteliana didn't know video+image existed) |
| 5b/5c Books & manga | ttsu / mokuro | BookWalker OCR "genuinely unmatched" | **Best-in-class, uniquely differentiated** |
| 5a Video | asbplayer (zero complaints) | slow batch mining (U13), illegible buttons (U35), `.ass` upload broken (U8) | Serves badly |
| 5d Games | YomiNinja ("mad clunky"; its top search result is a **malware clone**, 375-pt warning) | Electron build incomplete (U41) | Badly served |
| 5e Physical/console | **no accepted answer** | not served | **Open goal** |
| 6 Difficulty | jpdb/jiten coverage % | data owned, `knownPct` only in deck stats (`newtab/stats-view.ts:254`) | Not served despite owning the data |
| 7 Reviews | Anki / jiten | Study — owner tells people not to use it | Badly served, known |
| 8 Stop optimising | — | no low-intervention mode | Not served; principle points the wrong way |

Where nobody would say "just use X instead": BookWalker/manga OCR on an iPad · instant
Nadeshiko/ImmersionKit examples on click · the kanji panel · Yomu-hosted edge audio · the YouTube
feed filter · **Yomitan-grade annotation + mining on Firefox Android**, which threads beg for and
whose only current answer is "pay ~$200 for Migaku."

## U86. ZERO-SETUP EVALUATION PATH — see it work before installing anything  [PRODUCT]
A visitor must see Yomu annotating real Japanese text before installing a userscript manager,
creating an account, or entering an API key. A live demo page on yomureader.com running the real
reader over a real passage — hover, popup, furigana, pitch, frequency, mine button — is enough.
**Evidence:** on a new batch-mining tool the top ask was *"can we get a demo video/gif of it? dont
want to set up all of that just to check it out"*. Setup friction is the **#1 complaint in every
tool thread**, ahead of every missing feature; a paid competitor's entire one-line pitch is "costs
money, zero setup". Ties B1, U68, U85 — but this is NOT "reduce setup", it is removing setup from
*evaluation* entirely.

## U87. A 30-SECOND DEMO CLIP IS THE PRIMARY ARTEFACT, NOT THE SCREENSHOT  [POSITIONING]
One clip — hover → popup → mine → card with video+image attached — reused verbatim on the Chrome Web
Store, AMO, Greasy Fork, the homepage hero and any community post. Every high-scoring tool post of
the last year led with a GIF (web-manga-ocr 399 pts, SubMiner 488 pts, DokiDokiDict 96–211 pts).
Yomu already HAS the asset — woozlez made the homepage video — and it is not being used where the
audience is. Ties B4, U40, U76.

## U88. THE NAME IS ALREADY OCCUPIED — decide the disambiguator  [POSITIONING]
U14/U45 treat this as a store-search bug; it is worse. Shipping products already called Yomu in this
exact category: **Yomu JP** (yomujp.com, graded readers — the top r/LearnJapanese hit for "yomu",
232 pts), **Yomu Yomu** (iOS), **Yomu – Japanese Reader** (iOS), **Yomu Reader** (Android),
yomuapp.jp, and **yomureader.app** — a manga reader one character from our own domain.
Needed: a permanent disambiguating tagline always used with the name, canonical SEO ownership of
yomureader.com over yomureader.app, and a store-search strategy that survives five namesakes.
"Search for Yomu" is broken advice today, even after the Latin-script listing fix.

## U89. NAME AND DEFAULT THE "COLLECT NOW, SCHEDULE LATER" MODE  [PRODUCT + POSITIONING]
U18 records bdlance's ask as a toggle. It should be the headline behaviour and it should have a name.
**Nobody in the market has productised this.** Review debt is the community's second-largest
recurring topic — "Anki Reviews are killing my Immersion time" (175 pts / **117 comments**),
"I lost my 1480 day Anki streak and it was the best thing to ever happen to me" (678 pts) — and the
only remedy on offer is manual restraint. Mining that collects without scheduling, with an explicit
later "promote to study" step, is the most defensible single product idea in this research, and
Migaku, jpdb, jiten and Anki all lack it. Live evidence: bdlance's due count went 200/day → 1600
because Yomu inserted reviews into jiten. Promote U18 accordingly.

## U90. SHIP THE TUNED SCHEDULER, NOT THE KNOBS  [PRODUCT]
Yomu Study ships FSRS on, presets optimised, leech auto-suspend enabled, a defensible new-cards/day
default — and does not expose those on the main path. **Evidence:** the community's own diagnosis of
review overload, repeated across the Anki-fatigue threads, is that most people's Anki is
*misconfigured* — FSRS off, presets never optimised, leeches never suspended; tuned users report
~4 s/card against ~20 s/card untuned. Distinct from U64 (grading SCALES match the destination); this
is the scheduler underneath Yomu's own SRS, and it is the governing principle applied to the one
place users cannot self-serve.

## U91. MINE-WORTHINESS GUIDANCE AT THE POINT OF DECISION  [PRODUCT]
Band words in the popup and the batch-mining list the way the community already does:
**<30k learn · 30–60k if it matters to you · 60–100k marginal · >100k probably a parse error, not a
word.** "Should I mine this rare word or skip it" is a top-5 recurring question (51-comment thread)
and the banding above is the community's own accepted answer, currently transmitted by word of mouth.
Nobody surfaces it at the moment of decision. The >100k band doubles as a free parser-quality signal
feeding A1.

## U92. ANY-SCREEN CAPTURE: PHYSICAL MANGA AND CONSOLES  [PRODUCT]
U41 scopes game OCR toward YomiNinja. The larger unmet need is capture from *anything that is not a
browser*: a phone photo of a paper page, a capture-card feed, a console screenshot. "How do I mine
from physical manga / console games" is asked roughly monthly — 83- and 51-comment threads in June
and July 2026 alone — with **no accepted answer**; current advice is capture cards, phone photos into
Google Lens, and hand-rolled iOS Shortcuts. Yomu already owns the hard half (canvas OCR + annotation
+ mining). The target is not a game client; it is any image. vvvvtk has offered to test.

## U93. LOW-INTERVENTION READING MODE — and a stated limit to "automatic and seamless"  [PRODUCT]
A legible "just read" mode: minimal decoration, no chips, lookups only on demand, nothing that
interrupts a line of text. A strong, well-upvoted counter-current argues that constant lookup and
card-making harms acquisition (top comment 106 pts on the jiten discovery thread; same sentiment in
the immersion-struggles and endless-flashcard threads). This is the owner's own 50% rule (U65)
pointed at the reader instead of at Academy.
**This item CHALLENGES the governing principle.** "Everything should always be automatic and
seamless" is right about friction and, on the community evidence, wrong about volume — more
annotation is not automatically more value. **Proposed amendment for the owner to accept or reject:**
*automatic where it removes friction, silent where it would interrupt reading.*

## U94. PUBLISH THROUGH THE COMMUNITY'S OWN CHANNELS  [POSITIONING]
U76 names the Yomitan resource page and the TMW wikis. Add the three that actually move:
r/LearnJapanese's weekly **"Material Recs and Self-Promo Wednesdays"** thread (the sanctioned route,
and the one every competing tool used), the **JP Lazy Guide**, and **Awesome-Japanese**
(github.com/EngJpDiscordExchange/Awesome-Japanese — checked, Yomu is absent).
**The owner must post these himself. Do not post on his behalf.** Prepare the artefacts (U87's clip,
U86's demo link, a plain-language what-it-does paragraph) and hand them over.

## U95. LEAD WITH MOBILE — the differentiator nobody knows exists  [POSITIONING]
Yomitan-grade annotation and mining on **Firefox Android** ships today. Threads asking for exactly
this end in "buy a second Android device" or "pay ~$200 for Migaku"; a direct "do any of these work
on iPad/iPhone?" went **unanswered**. Highest-leverage, lowest-cost positioning move available: one
sentence in the store copy, one line in every community post.
**Precondition: U4 (iOS Safari OOM every ~5 minutes) stops being a bug and becomes a launch
blocker** — you cannot lead with a differentiator that crashes.

## U96. i+1 MUST AUTO-TUNE — ours is three lines and misses the point  [PRODUCT]
Yomu today (`src/reader/subtitles/subtitle-batch-mining.ts:99`):
`sentenceCardCount >= 3 && unknownCardCount === 1` — minimum 3 tokens, **no upper bound, no frequency
gate at all.** Migaku's shipped constants: sentence length **5–20 tokens**
(`RECOMMENDED_SENTENCE_LENGTH = {MIN:5, MAX:20}`), exactly one unknown, and that word's frequency
must pass a threshold that **widens automatically with your known-word count** —
`RECOMMENDED_THRESHOLD_STEPS = {5★:1_000, 4★:3_000, 3★:5_000, 2★:10_000, 1★:1_000_000}` — with
filtering **switched off entirely above ~20,000 known words**. Zero configuration; it tunes itself as
the learner improves. This is the single most transferable idea in the teardown and it is the
governing principle made literal. **Adopt the shape** — a length window, one unknown, a frequency
threshold derived from known-word count — **and choose our own constants from our own data**; theirs
are one product's tuning against one user base and there is no evidence they are correct.

## U97. WORD IDENTITY IS A 4-TUPLE, AND STATUS IS THREE ORTHOGONAL FIELDS  [PRODUCT / ARCH]
U44 says the card model needs a language field before decks fill up. The stronger primitive:
identity = **(dictionary form, secondary reading, part of speech, language)** as the primary key,
with **knownStatus**, **hasCard** and **tracked** as three *independent* fields rather than members
of one enum. Migaku's DDL: `PRIMARY KEY (dictForm, secondary, partOfSpeech, language)`,
`knownStatus TEXT, hasCard INTEGER, tracked INTEGER`.
Two things fall out free: (a) it is language-neutral, which is what the 32-target rewrite needs;
(b) separating `hasCard` from `knownStatus` is exactly what makes U18/U89 ("collect without
scheduling") expressible instead of a special case. Yomu's `CardState` union
(`src/reader/app/types.ts:5-22`) conflates all three into 21 mutually-exclusive values.
**Land this before decks are populated — same deadline as U44, same reason.**

## U98. TOKEN RENDERING PRIMITIVE: column layout for readings, status in `data-*`  [PRODUCT / ARCH]
(a) **Reading above surface as a layout, not native ruby positioning.** Migaku's token is
`display:inline-flex; flex-direction:column; align-items:center`, reading as the first flex child.
That structurally eliminates the wrap / overflow / vertical-mode / `pre-wrap` alignment class that is
Cycle 7. Adopt the approach, write our own CSS. **Know the cost first:** ~5 DOM nodes per word,
`white-space:nowrap` per token, and per-token margins (`.migaku-token{margin:5px 0}`) that reflow the
host page — measure against Cycle 7's actual cost before committing.
(b) **Status on the token as `data-*`; only the display MODE in root classes.** Migaku ships
`data-mgk-known-status` / `data-mgk-tracking` / `data-mgk-freq-stars` on the token, with
`-mgk-active` / `-mgk-show-known-status` / `-mgk-show-coloring-on-hover` on the root. Yomu puts
colour channels on the root — the documented root cause of Cycle 8's SPA class clobbering.
Their underline is also a `::after` with `background-color`, not `text-decoration`, with a
vertical-writing variant flipping it to a left bar — deliberately, so it does not fight ruby.

## U99. COMPREHENSION SCORE PER PAGE, VIDEO AND BOOK  [PRODUCT]
Yomu has the parse, the known-state and the frequency data and surfaces a known-percentage only
inside deck stats (`src/reader/newtab/stats-view.ts:254`). Migaku scores every page and subtitle
track, labels it on a 7-tier plain-English scale (Ambitious → Challenging → Approachable → Good →
Great → Excellent → Exceptional), charts known/unknown/ignored unique words, counts recommended
sentences, and lets the library be **sorted by comprehension**.
"Is this content right for me?" is a stage of the golden path in its own right (jpdb, jiten,
LearnNatively and Jo-Mako's spreadsheet all exist to answer it), and beginners repeatedly report
understanding 0% of "N4-rated" material and concluding reading isn't for them. A number and a plain
word, computed from data we already have.

## U100. SITE-OUTAGE DETECTION WITH DIFFERENTIATED MESSAGING  [PRODUCT]
When a host site changes and breaks a surface, say so — and distinguish "broken right now, we know"
from "fixed, please update your extension". Migaku ships both messages plus a forced-update block for
versions known to corrupt data. Yomu's YouTube and BookWalker breakages currently surface as **silent
failure** — U5, U6, U12 — and each became a Discord thread starting from "is it broken for everyone?".
This converts a bug report into a status message: the "degrade honestly and visibly" corollary of the
governing principle applied to the one place it currently fails silently.

## U101. ONE-CLICK DIAGNOSTIC BUNDLE  [PRODUCT]
One button packaging logs, version, channel, host, settings snapshot and recent errors, with a
free-text description box, returning an ID the user pastes into Discord or a GitHub issue.
U4, U6 and U12 each consumed weeks of back-and-forth that one artefact would have collapsed.
Design note: **a support tool, not telemetry** — user-initiated, contents visible before sending.

## U102. PLAYER CONTROL VIA A TYPED MESSAGE BRIDGE, NOT DOM PINNING  [ARCH]
Cycle 4's stated fix is "a resilient observer that re-anchors on YT mutation". The teardown shows a
better shape, proven in production against the same hostile sites: a **main-world adapter speaking
~45 typed messages** (`mgk--GetSubtitles`, `mgk--SeekTo`, `mgk--SendVideoElementProxy`,
`mgk--SendOverlayRectProxy`, `mgk--GetYoutubePoToken`), talking to YouTube's **innertube API with a
poToken** rather than to YouTube's DOM, and reserving layout with a **stand-in element plus rect
proxies** instead of pinning to the site's structure. Take the architecture; take neither their code
nor their obfuscated-filename evasion (R7).

## U103. NAMED PRESETS OVER CONTROL MATRICES  [PRODUCT]
U77 (one Advanced switch) and U78 (a description per row) are two of the three containment devices
that make a dense settings surface survivable. The third: **named presets with plain-English
descriptions, shipped as the primary surface, "Custom" as the escape hatch.** Migaku collapses ~40
interacting video controls into 8 named play modes (Default · Primed Listening · Intensive Reading ·
Intensive Listening · Intensive Hybrid · Show on Pause · 1T Focus · Custom) and its recommendation
filters into 3 named *strategies* (Guided Learning / Focused Study / Advanced Customization) rather
than sliders. Yomu's candidates: the video/subtitle overlay panel, the decoration/colour matrix
(**22 colour fields open first — `settings/form.ts:231`**), and the mining field-source matrix.

## U104. COLD START: SEED KNOWN WORDS IN TWO MINUTES  [PRODUCT]
Yomu is useless until it knows what you already know, and today it asks the user to arrive with that
state. Migaku's answer — the best-designed moment in their onboarding — is an adaptive "select the
words you know" quiz over rising frequency bands that seeds thousands of known words in ~2 minutes,
with an honest note about why it adds fewer than it estimates.
Yomu's version should offer the **import route first** where it exists — Anki collection, jpdb,
jiten, Yomitan — and fall back to the quiz when the user has nothing. Ties U80/U81 (first run),
U71 (cross-backend migration), and the known-word seeding line under the governing principle.

## U105. THREE-TIER LANGUAGE MODEL: TARGET ≠ OUTPUT ≠ INTERFACE  [ARCH]
Make explicit what the rewrite leaves implicit, and what U15 actually asked for:
- **Target languages** — full parsing, morphology, readings. (Migaku ships 11.)
- **Output languages** — what definitions, translations and generated text COME OUT IN. (Migaku ~33,
  the DeepL set, split into two independent settings: `languageOutput.translation` and
  `languageOutput.gpt`.)
- **Interface languages** — UI chrome only. (Migaku ships exactly **3**: en, ja, es.)
**sagamsil does not need Yomu translated into Korean; he needs definitions rendered in Korean.**
Conflating these makes the 32-language goal look 3× larger than it is and makes U15 unimplementable.
Complements U79 (CSS gating by `data-language`, per-target UI *visibility*); this handles per-target
*content*.
**Also record the real per-target cost: not a dictionary — morphology PLUS a named-entity
gazetteer.** Migaku's Korean parser ships a Sejong-tagset statistical tagger (`observation.model`
37 MB, `irregular.model`, `transition.model`) plus gazetteers of K-pop artist names, addresses and
**5.6 MB of Korean Wikipedia titles**. That is what separates "油を売る is one entry" from garbage,
and it must be budgeted per target. Their five parser families (Chinese, European, Japanese, Korean,
Vietnamese) + a shared `Deconjugator` cover all 11 targets — that ratio is the useful planning number.

## U106. A QUALITY GATE THAT TEACHES ITS OWN BYPASS  [PRODUCT]
When a mined card would land with an empty back — no definition, no sentence, no media — warn once,
and **inside the warning** tell the user how to skip it permanently. Migaku's `lowInfoWarning`:
*"Is that all…? You're about to create a card that will be blank on the back!"* + *"Hold shift next
time to skip this check"*, plus a separate command that skips it forever. The pattern generalises:
good default protection that hands power users the escape hatch inside the interruption itself, so it
never becomes a permanent tax. Apply anywhere Yomu either nags forever or silently allows a bad
outcome.

## U107. CANONICAL LOCAL STORE WITH TOMBSTONES, AND A SYNC-CONFLICT UI  [ARCH]
A2 says users must never choose an SRS backend. The concrete schema that makes that survivable, from
a shipping implementation: every row in every synced table carries `mod`, `serverMod`, `del`
(tombstone), `serverVersion`, `isPendingEnqueue`, `isPendingApply` — offline-first by construction,
delta sync with tombstones and pending queues.
When it does conflict, show two cards — **Cloud vs This Device — each with last-updated, words known
and reviews due**, plus an explicit statement of what each choice destroys; plus a separate repair
path and a migration path with a documented fallback.
**Note the difference deliberately:** Migaku solved backend consistency by *exclusion* (own the SRS,
Anki is a paid export). Yomu's stated goal — reconciliation across N simultaneous sources — is harder
and is the actual differentiator. **Copy the storage schema; reject the exclusion.** See R11.

## U108. CONVENTION CONFORMANCE PASS — small, cheap, high-familiarity  [PRODUCT]
One sweep so a Yomitan/Anki/Migaku/jiten user's muscle memory works on day one. All verified against
the current tree:
- **Scan gate: default to Shift+hover on mouse, plain tap on touch/pen.** Yomitan's default
  (`include:"shift"`, `exclude:"mouse0"`) and Migaku's hyperlink gesture — two independent products
  converged. Yomu's `shortcuts.hoverLookup` defaults to `''` = plain hover, which is canna98's
  *"had to turn off the automatic reading every time I hover — I just turned it off bc it was annoying"*.
- **Hotkeys into the `Alt+` namespace**, aliasing Yomitan's exact bindings (Alt+E mine, Alt+P audio,
  Alt+↑/↓ entry, Alt+B/F history, Escape closes — Escape is already correct). Today Yomu binds bare
  letters and binds **`A` to both `playAudio` and `previousSubtitle`** (`settings/index.ts:549,553`).
- **Ctrl+Z as an undo alias** in Study alongside bare `U`; **Space-again = the recommended pass**
  after reveal, as in Anki.
- **Key 1 is always the failing grade**, whatever scale U64 selects for the destination — so the keys
  renumber with the scale: 1–4 for Anki/jiten, 1–5 for jpdb.
- **Add `kifuku` to the pitch palette** as purple (~`#8d4bf6`). Yomu's four pitch colours already
  match the shared kotu-lineage palette within a few percent (heiban `#359eff` vs `#2880ff`,
  atamadaka `#fe4b74` vs `#fe4670`, nakadaka `#fba840` vs `#fba335`, odaka `#57ccb7` vs `#38b8a1`);
  the fifth is simply **missing** — `grep -rn kifuku src` → no matches — and Yomu ships an `unknown`
  grey in that slot. A kotu/Migaku user who reads purple as 起伏 gets nothing from Yomu.
- **`new` at rest becomes transparent, not `#ffffff`** (`theme/color-tokens.ts:46`). White is a
  *colour*: invisible on white pages, glaring on dark ones — which is why woozlez had to set his
  highlights near-black for ttsu dark mode. This is what U23 and canna98 actually asked for.
- **Frequency rendered as `#18447`** — jpdb's format, the token people compare across tools.
- **Study counts strip = new / learning / due**, in Anki's order and colours.
- **Vocabulary:** keep **mine** (jpdb/jiten use it); adopt **scan** for the trigger and **popup
  dictionary** for the surface (the phrase people search); adopt **Priority** for source ordering
  (Yomu already has `…DefinitionsPriority` fields). **Never use "collection"** for a mining list — in
  Anki that word means the entire database; say **queue** or **mining list**.
- Adopt these words, already in users' mouths: Known / Learning / Unknown / Ignored / Tracked ·
  **Recommended sentence** · **Comprehension** · **Card Creator** · **low-info card**.
**The tension to hold:** conforming to four tools' conventions is not inheriting four tools' surface
area. Adopt *bindings, colours, words and gestures* — constants, near-zero cost — and refuse the
*screens* those tools grew around them. Migaku's 2,132 UI strings are what happens when you don't.

## U109. TRUST SIGNALS ON DISTRIBUTION  [POSITIONING]
"Download this file from a website and paste it into your script manager" now carries an active trust
penalty here: a **malware clone of yomininja.com outranked the real project in search** and drew a
375-point warning thread in June 2026. So U68 (install fails across managers) and U69 (previous-
versions page) are not only ergonomics — they are the credibility surface. Add: signed releases with
published checksums, one canonical install origin, an explicit statement of what the userscript can
access and why, and a **visible release channel** (A6) so "which build am I on" is answerable from
the UI.

## U110. CORRECT THE GRAMMAR-REFERENCE RANKING IN U66/U67  [CONTENT]
The community's ranked default has moved. **Yokubi (yoku.bi) is now first**, then Misa, then Cure
Dolly, then **Tae Kim fourth** — and the sub's own starter's guide lists Yokubi and morg.systems'
Japanese Primer *above* TheMoeWay. U67's **style** argument (plain, direct, example-first, no
grammatical register) remains exactly right and is the valuable half; but citing Tae Kim as *the
community default* is now wrong. Update U66's reference list too: the **JP Lazy Guide** and
**donkuri's mining guide** have largely displaced animecards as the linked setup references, and the
note type to name is **Lapis**, not JPMN. Add Yokubi, morg.systems, LearnNatively, Jo-Mako's
spreadsheet, comprehensiblegames.com, cijapanese.com. noteliana's warning stands — present approaches
neutrally, take no side.

## U111. YOMU STUDY'S MARKET IS ANKI-REFUSERS, NOT JITEN-SWITCHERS  [POSITIONING]
A7 frames Study against jiten, on jiten's terms, for a user who says she is "already so comfortable
with jiten srs". The research surfaces a larger and more winnable audience: **people who bounce off
Anki and are actively shamed for it.** "Can you recommend me an app to learn vocabulary (NOT Anki)"
drew **77 comments of near-uniform hostility at 0 points**; a long anti-Anki post five days later
drew 102 more of the same. That population exists, is sizeable, is underserved, and does not come
back to ask twice.
**Consequence: Study must not look like Anki.** Both goals — beat jiten on speed, serve people who
refuse Anki — point the same way (fewer decisions, faster reviews, no scheduler exposed, see U90),
but the second is the bigger prize and it changes what "done" means: not feature parity with a review
app, but the thing someone reaches for *instead of quitting*.

## REJECT LIST — the price of Migaku's density (decide once, hold)
| # | Reject | Why |
|---|---|---|
| R1 | **Injecting the app into every page** — 20-module, **9.7 MB** static-import closure at `document_idle` + 1.7 MB CSS: Kotlin core, SQLite, player store, full Vue kit, i18n for 3 locales | Yomu fights a 2 MB Greasy Fork cap. Non-negotiable, and it is the root of their performance reputation. Heavy core in the worker/app; content script stays a thin renderer. |
| R2 | **Bundling all language resources** — 1.0 GB installed; `core/es.json` alone **349 MB**; a Japanese-only learner carries the Spanish inflection tables | Yomu's companion-split / on-demand model is already better. Ship the parser, download the language. |
| R3 | **A mandatory always-open app window** — a 1350×820 popup owning the DB and parser; *"The Migaku Extension Window needs to be open at all times"* is a shipped string, with a reopen button on every surface | The exact opposite of "it should just work out of the box"; a permanent taskbar tenant and a whole class of failure state. Use worker / offscreen document / side panel. |
| R4 | **~61 hotkeys, many bare single letters** (`q e r c b g l x j w n . ,` on every page) | Collides with host sites, hazardous near inputs, needs a five-section help screen. Yomu already has the seed of this: `A` bound twice. Small default set in the Alt namespace (U108); everything else opt-in. |
| R5 | **Requiring login before any value** — their paid signup is step 4 of 12 | Yomu is free and must be useful before an account exists. **The one sentence a paid competitor structurally cannot copy.** Don't give it away. |
| R6 | **Two shipping channels + a legacy build**, needing `management.getAll` and a modal telling users to disable one | A6 has Yomu heading here (userscript-daily vs store-weekly). Make the channel visible in the UI *now*, before it becomes a conflict-detection feature. |
| R7 | **Obfuscated filenames to evade site detection** — a web-accessible resource literally named `OBFUSCATED_NAME`, exposed only to nine video hosts | An arms race Yomu cannot win, should not start, and which makes user bug reports unreadable. Take U102's bridge without it. |
| R8 | **Two SQLite engines** (`sql-wasm` 613 KB *and* `wa-sqlite` 558 KB) **and a 32 MB ffmpeg core** | Nobody chose that; it accreted. Pick one storage engine. Use MediaRecorder / WebCodecs before shipping a transcoder. |
| R9 | **Settings that force a page reload** — five distinct apology toasts (`refresh.parsedLangChange`, `refresh.readingsPinyin`, …) | Five apologies is five bugs, same class as U1/U2/U3. Every setting applies live. |
| R10 | **The 120-string, ~40-control video panel as a primary surface** | Take the presets (U103); leave the matrix behind "Custom". |
| R11 | **Anki as a second-class, paid-only export** (free trial won't write Anki cards) | Yomu's own users run Anki *and* jiten *and* jpdb simultaneously. Copy their storage implementation (U107); reject the exclusion — it is the differentiator. |
| R12 | **Per-session media-capture permission** | Right on privacy, wrong ergonomically — they built a toast, a tooltip, an icon state and a shortcut just to manage friction they created. Once-per-site, never once-per-session. |
| R13 | **Ceremony around slow parsing** — "Parsing {{count}}% complete", "Analysis Complete", a hard "page exceeds the word limit" ceiling, a separate selection-length limit | An approach slow enough to need a progress bar is one to replace, not decorate. Parse latency is a budget (A5); a miss is a bug. |

**From community fashion — decline these too.**
- **Do not build a fifth SRS.** Ship the one Yomu has, tuned (U90), and reconcile with the others.
  The market for "another flashcard app" is hostile; the market for "the thing that keeps my four
  existing tools consistent" is empty.
- **Do not take a side in the grammar wars.** Most divided topic in the sub; U66's editorial rule
  already handles it — hold it even when a doctrine is winning.
- **Do not chase per-site special cases.** The community celebrates single-site tools; Yomu's
  standing directive (fix bug classes in core machinery) is correct and the sites will keep changing.
- **Do not add AI because everyone else is.** Migaku ships Whisper subtitle generation, DeepL,
  ChatGPT explanations, two TTS vendors and user-editable prompts — each a quota, a cost centre and a
  failure mode. Yomu's edge audio and **real** Nadeshiko examples are better than generated ones and
  users say so. Add AI only where there is no real source.
- **Do not maximise annotation.** See U93.
- **Do not build a native game client.** Even YomiNinja is called "mad clunky". The winning shape is
  capture-anything (U92), not a client.

## THE ONE-LINE POSITIONING
> **Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings,
> pitch and mining — and keeps your Anki, jpdb and jiten in step, on desktop and on your phone.
> Free, no account, nothing to configure.**

Every clause is defended: *"any page, video, manga or game screen"* ← coffeentacos, *"the amount of
things this lets you do that you'd need multiple other things"*; *manga* named explicitly ← "genuinely
unmatched for books" + the 399-pt thread whose author found nothing; *"keeps your Anki, jpdb and jiten
in step"* ← the anti-walled-garden line (Migaku's real sin in users' eyes is **lock-in, not
density**); *"on your phone"* ← U95; *"free, no account"* ← R5, structurally uncopyable by a paid
competitor; *"nothing to configure"* ← the #1 complaint in every tool thread.
**Where it fails the eye-roll test today:** a redditor would accept every clause **except "nothing to
configure"** — install is a `.user.js` download that fails on Chrome and ScriptCat (U68), onboarding
asks 12 questions (U80), settings open on 22 colour pickers. **That clause is a promise the product
must earn.** U86, U80, U103 and U108 earn it. **Until then, ship the sentence without the last three
words.** Store short form once earned: *Read Japanese anywhere. One tool instead of five. Free.*
Deliberately omitted: "AI", "immersion" (exhausted), "Academy" (postponed), and any comparison to
Migaku — naming a competitor in your own tagline concedes the frame.

## UNRESOLVED — the owner should decide, both sides have evidence
**Which words are marked AT REST.** Migaku marks *unknown* loudly and makes **known and ignored
transparent**, so the page visibly cleans up as you learn — motivating, but on a beginner's page it
is a sea of red. Yomu's own users asked for the opposite emphasis: sagamsil wants unadded words
undecorated (jpdb's grey "is intrusive"), canna98 says white beats blue for new words.
**Proposed resolution (not a finding):** keep new/unknown undecorated at rest per Yomu's users, and
spend the loud treatment on **recommended (i+1) words only** — Migaku's two-level hierarchy
(underline = status, filled chip with a frequency-star bar = "mine this one") repurposed. Note this
must be reconciled with the standing rule in [[yomu-chrome-annotated-at-rest]].

## HONEST GAPS IN THIS RESEARCH
- **No live Migaku run.** Everything is static reading of the shipped 1.30.8 package. The visual
  side-by-side B3 asks for still needs an install with a paid account.
- **Migaku's domain blacklist** (the "don't run on banking/Docs/Discord" list, relevant to U7) was
  not isolated — `isDomainBlacklisted` exists but the literal list is inside the Kotlin-compiled
  bundle. Needs a live instrumented run. Same for their default for "Full Migaku Power" on an unseen
  domain.
- **Yomu's actual install → first-furigana time is still unmeasured** (U85). "≤5 minutes" remains an
  aspiration and the positioning claim above is unverified until it is measured.
- **Whether jiten's grading is genuinely 4-button** — asserted by noteliana, carried into U32/U64,
  not independently confirmed.
- **Hoshi Reader:** zero r/LearnJapanese mentions; **not community-validated**, but it *is*
  user-validated (tk: "life changing", on his real device). Keep it on the reference list; do not
  weight it as a community expectation.
- **Theme rankings are qualitative** — ordering across ~30 searches and 22 full thread reads, not
  counts. "Setup friction is #1" is a strong signal, not a statistic.
- **Yomu was not audited against all 13 rejection items.**

---

# 2026-07-26 — EARLIER DISCORD LOG MINED (27/05 – 25/07/2026)

Owner-supplied, older than the July research already captured as U1–U46, so **much of this has since
shipped**. Triage below is marked **[SHIPPED?]** (code exists, needs a behaviour check),
**[PARTIAL]** (exists but the complaint stands), **[OPEN]** (no evidence in tree).
Spot-checks run against `src/` this session are noted inline; everything unmarked is a documentation
claim, not a verification.

**Store listings now have concrete targets (B4/U40):**
Chrome `https://chromewebstore.google.com/detail/よむ/bbaickgfdgnecdnkcplaoiopnfghlkna` ·
AMO `https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/`. Note the Chrome listing name is
literally **よむ**, which is exactly why "even searching yomu does not work on the chrome store"
(henry, 25/07) — this is U14/U45/U88 with the URL attached.

## D1. Fully local parsing — no jiten round-trip  [SHIPPED? → verify quality]
"Fully local parsing (faster and won't need jiten)" (01/07); ivorytwelve asked for it 01/07.
`src/reader/lookup/parser.ts` carries an offline path, and sagamsil later compared "the offline
parser (JMdict)" against jiten and jpdb — so it EXISTS. What is open is A1: it is a third parser with
its own grouping behaviour, and nobody has said which is authoritative. Fold into A1, not a new item.

## D2. Bunpro usable as the mining backend, not just an enrichment source  [PARTIAL]
"Bunpro should be able to use instead of jpdb or jiten" (29/06). `bunproDeck`/`bunproMining` exist in
`settings/form.ts`, but Bunpro is wired as a *source* (freq/pitch/audio, per the standing rule), not
as a card destination on equal footing with jiten/jpdb/Anki. Belongs to A2 and U64: if Bunpro is a
destination, its grading scale governs the buttons.

## D3. Docs: YomiNinja / Steam Deck / game reading need real step-by-step  [OPEN]
26/06. vvvvtk offered to write the Steam Deck section himself ("um you can make steam deck
section!"), and the owner agreed the existing page could be deleted:
`yomureader.com/guides/read-games-with-yomininja`. vvvvtk also identified the mechanism — YomiNinja
and Tango Lens both work through **decky.xyz** on Steam Deck, screenshotting and OCRing the game.
Ties U41, U92. **vvvvtk volunteered to write this — take him up on it.**

## D4. Yomitan → Yomu dictionary import, or stop double-storing  [OPEN]
"Avoid duplicate dictionary storage or document Yomitan → Yomu dictionary import clearly" (26/06),
from vvvvtk: "any way it can read these… instead of reinstalling them on yomu and I get 2x more
storage used". This is U25 with the storage cost named. Migaku ships "most Yomichan dictionaries are
also supported" — the import path is the expected convention, not a luxury.

## D5. BookWalker/OCR vertical overlays: furigana completeness + less text covering  [PARTIAL]
26/06, and canna98 21/06: "it would be good as the translation covers the bottom", with a concrete
ask — "if u are checking the word on bottom the translation appears on top". A popover flip that
avoids covering the text being read. Cycle 1 territory.

## D6. Dark-mode word-highlight contrast, and a per-surface theme split  [OPEN — real design ask]
"Dark mode word highlights need contrast fixes… you can choose to have the light mode for the ocr but
dark mode for everything else in settings" (26/06). Two distinct things: (a) contrast, which is
woozlez's "had to set a lot of the highlight colors to near black for ttsu dark mode" and is U108's
`new: #ffffff` → transparent finding; (b) **an independent theme per surface** (OCR light, chrome
dark) which is not in the backlog anywhere. canna98 also: "I use dark mode but have to switch it on
basically every page" — theme not persisting, same class as U1/U2/U3.

## D7. Pass/Fail buttons fill mobile width, centred  [OPEN]
26/06. Small, concrete, mobile. `twoButtonReviews` exists so the mode is real; the layout ask isn't.

## D8. Study: readings/furigana on the main card AND in example sentences  [SHIPPED — verified 2026-07-26]
**RESOLVED.** `newtab/controller.ts:6944` renders the headword with
`furiganaMode: revealAnswer ? 'all' : 'off'`, `showFurigana: revealAnswer` — ruby is FORCED on the
answer side even for furigana-off users, and the prompt stays bare for recall. That is exactly the
corrected ask ("i want the furigana to appear on the other side"), and the comment says it is
codified in a card-front test suite. Immersion examples force `furiganaMode:'all'` the same way
(`controller.ts:6252`). My earlier PARTIAL was a bad grep (`studyFurigana` is not the symbol name).
Kept below for the history, because the sequence is instructive: the first fix put furigana on the
PROMPT and made the card unstudyable, and the second moved it to the answer.
Original triage follows.
Reported FOUR times by three people: vvvvtk "study page has no way to know how to read the word"
(26/06 08:17) and "no info on the reading" (26/06 00:13); canna98 "on study page there is no
furigana" (26/06 08:20) and again "furigana on study page" (26/06 08:06); owner 26/06 00:15.
Also 29/06 vvvvtk: "now we have furigana on the front… but its tuff to study when I already know the
answer" — **so the fix overshot: furigana must be on the ANSWER side, not the prompt.** canna98 said
it exactly: "so i want the furigana to appear on the other side". No `studyFurigana`/`studyShowReading`
symbol found in `src/` this session. This is the single most-repeated complaint in the whole log and
it feeds A7/U111 (why nobody uses Yomu Study).

## D9. Appearance settings must survive an update  [OPEN]
"Preserve Appearance settings after updating" (26/06) — vvvvtk: "it seems my colors got defaulted as
I updated… hopefully not everytime". Settings loss on update is a trust bug, and it is why woozlez's
careful dark-mode palette work is fragile. Related but distinct from bdlance's per-site settings bug.

## D10. Explain word colours in-app + one-click disable/presets  [PARTIAL]
26/06. canna98, live: "what the blue even means here" / "can i get rid off the blue". Owner's answer
was to walk her through settings. The ask is a legend at the point of confusion plus presets — this
is U38 (`(?)` icons), U78 (a description per row) and U103 (named presets) converging. **Note the
colour-meaning confusion is the same root as U23 and the unresolved at-rest question above.**

## D11. "Mining deck" and "add reviewed words automatically" must be legible per backend  [OPEN]
26/06. The wording is shared across jiten and jpdb but the behaviour differs. Ties A2.

## D12. Jiten setup needs a beginner flow  [OPEN]
26/06: what an API key is, where to get it, paste + **test** it, then choose or create a deck.
canna98, verbatim: "i have no idea whats api" / "i am the best tester bc i am dumb". The owner
hand-held her through five messages. That transcript IS the onboarding spec. Ties U80, U104.

## D13. Help must show current version, latest version, and how to update  [SHIPPED? → verify]
26/06. `latestVersion`/`updateAvailable` present in `settings/dialog-controller.ts`. Owner promised
"im gonna start putting version numbers in the help section just for you" (25/06). Verify it shows
BOTH numbers and that the update path works on every manager — U68 says install is still unreliable.

## D14. PDF drop area is off-centre; scanned books should use Yomu OCR, not the embedded text layer  [OPEN]
25/06 23:54. Two things: cosmetic drop-zone centring, and a real one — **detect scanned PDFs and
prefer our own OCR**, because the publisher's garbage text layer overlays and makes it unreadable.
Detection is the interesting half.

## D15. Anime site support + automatic anime/subtitle detection  [PARTIAL]
25/06 23:43, with a site list the owner gathered: kaa.lt, miruro.to, anime.uniquestream.net,
animeverse.to, reanime.to, anizone.to (plus wotaku.wiki as the index, and jimaku.cc for subs).
Asks: fuzzy-match the title + page heuristics to identify the show, then fetch subs automatically.
canna98's grievance is the manual step: "I just don't know how to make subs for other animes".
**Standing directive applies — this must be generic detection, not six site profiles.**

## D16. Yomu Video player bugs (four, reported with repro steps)  [OPEN — scoped 2026-07-26]
**Scope note:** `docs/public/video-player/index.html` is only the host page — it delegates the
subtitle drawer and overlay to the Yomu runtime's subtitle controller (see its own comments at
lines 470, 591, 612 about drawer inset classes and "defensive reset for drawer transitions").
So all four bugs live in `src/reader/subtitles/`, not in that file, and the drawer-inset root classes
are the prime suspect for "subtitles vanish after hiding the sidebar". Needs a repro before a fix.
Original report follows.
All 25/06, from vvvvtk, who was using Yomu Video daily:
- **Dark-mode toggle freezes the tab** — load video → load subs → hide the subtitle panel (progress
  bar shrinks) → toggle dark mode → browser freezes. He reproduced it twice ("did it again").
- **Subtitles vanish after hiding the sidebar** — the clean-viewing mode has no subtitles at all.
  He was unsure they had ever worked: "I am not sure if they ever appeared".
- **Dark-mode preference does not persist** across navigation/reload.
- **"OCR video when paused" breaks playback** — the timeline jumps forward, the progress bar
  misbehaves, and OCR renders above the subtitle overlay and the progress bar.
He also said the player only worked "1 every 10 tries", and rebuilt his own single-file replacement
(tk-anime.netlify.app) because of it. That replacement is worth reading — the owner said "maybe lets
steal it" and vvvvtk agreed ("if u can make it good its 100% yours"). **His .ass parser fix is a real
diagnosis: ASS files have TWO `Format:` lines and the parser was reading the [V4+ Styles] one instead
of [Events]** — which is almost certainly U8 ("subtitle upload broken for .ass"). Check that first.

## D17. Subtitle font selector + options as dropdowns near the player  [OPEN]
25/06 23:31, and amine_75173 30/05 asked for popup font control too: "the bold font is hard to read
for complex kanji", wanting jpdb's font. Two separate surfaces, same ask.

## D18. Subtitles on FULLSCREEN video  [OPEN]
25/06 23:27. Fullscreen is where immersion actually happens; this is not cosmetic.

## D19. Drop anime + subs straight into the player  [OPEN]
25/06 23:25. vvvvtk's own prompt to Claude was literally "I can just drop my anime and subs to watch"
— he built it because Yomu didn't do it.

## D20. Batch mining as a whole-episode/chapter pass  [PARTIAL → this is the spec]
25/06 23:22, and noteliana 25/07 independently: "show you all the words you might need to batch mine
before or after an episode and you can click whether to mine, not mine, or master it". **Note the
three-way choice — mine / skip / already-know — which is richer than what U28 records.** Batch mining
now exists but is slow (U13) and its buttons gave sagamsil no feedback (U35).

## D21. edewakaru.com as a grammar-explanation model  [OPEN — content]
Twice: owner 25/06 23:22 and noteliana 25/06 20:28, who added the caveat: "the only barrier is that
its all in japanese, so an english based approach similar to it could be good". Add to U110's
reference set alongside Yokubi. noteliana also named **JLab** (grammar deck using real examples) and
japanese-like-a-breeze.com.

## D22. Study audio mode  [SHIPPED? → verify]
25/06 23:18, from noteliana, a listening-first learner. `audioMode`/`listenMode` symbols exist in
`newtab/controller.ts`. Verify it is reachable and that it is a real mode rather than a toggle.

## D23. Custom Yomitan pitch-accent dictionaries display immediately and completely  [OPEN]
25/06 23:18. Owner was candid at the time: "I don't know if it will work fully yet though".

## D24. Host and integrate the ultimate audio source  [SHIPPED]
25/06 23:18; delivered — noteliana 25/07: "Yo this audio is fast as hell". Keep as evidence for
positioning (edge-hosted real audio beats generated audio), not as work.

## D25. Live transcription (Whisper)  [OPEN]
25/06 23:18. The owner already built one before Yomu — "somehow it got popular, over 1000 people
downloaded that and I never shared it" — and notes it needs a GPU or an Apple M chip, or a server.
**Ties the ASR line in the batch-mining spec; also the one place the "don't add AI" rule (R-list)
does not apply, because there is no real source when captions don't exist.**

## D26. kotu.io as the reference for pitch-accent testing  [OPEN]
25/06 23:17, from noteliana and "someone really knowledgable abt pitch" on TheMoeWay. Pairs with
U108's finding that Yomu's pitch palette is already the kotu lineage.

## D27. Grading for people without an account  [OPEN]
25/06 23:07. canna98 was reviewing with no jiten account and nothing recorded. This is the free-tier
path and it is R5 ("useful before an account exists") stated by a user a month earlier.

## D28. Study-page audio broken by CORS after the proxies were removed  [SHIPPED? → verify]
25/06 23:06. Regression-shaped; confirm the study surface plays audio today.

## D29. Furigana distorts the YouTube layout / whitespace gaps where videos are hidden  [PARTIAL]
25/06 23:03 ×2. The filter hides non-Japanese videos and leaves holes in the grid; furigana makes
panes "look strange". Cycle 4 and the recycler work. canna98 also hit a hard freeze on the YT home
feed ("Lagged / Froze / like I was not able to click anything").

## D30. Black text with no highlight on Discord and on the Crunchyroll cookie consent  [PARTIAL]
25/06 23:02, explicitly flagged **"(generic way)"** by the owner — matching the standing directive.
canna98 reported Discord breakage repeatedly over three weeks: "yomu is now eating words on discord",
"the spaces are getting bigger and bigger", her username rendering broken. Worth confirming closed;
it was the longest-running host-site complaint in the log.

## D31. Support yomuyomu and other reading apps  [OPEN]
25/06 23:02. Owner, 25/06 22:17: "**I just realised yomu breaks yomuyomu**" — a name-adjacent
graded-reader site that Yomu breaks. Also tadoku. Ties U88 (the name is crowded) and the
"do not break the host" contract.

## D32. Pitch-accent study mode as a flashcard queue  [OPEN]
25/06 23:01, requested by noteliana who studies pitch seriously and rates Migaku's trainer "not good
at all". A named gap in a competitor, in a domain where Yomu already has the data and the palette.

## D33. Frequency pill on the popup by default  [SHIPPED? → verify default]
25/06 23:00. vvvvtk: "im having to click on jiten to see" frequency. `frequencyPill`/`showFrequency`
exist in `sources/word-pills.ts`; the owner said "Ill make that on by default in the future".
**Verify the DEFAULT, not the capability.** Ties U91 (frequency banding) and U108 (`#18447` format).

## D34. Pass/Fail (2-point) grading exposed in the Study settings tab  [SHIPPED? → verify placement]
25/06 23:00 and vvvvtk 25/06 22:43. `twoButtonReviews` exists; the ask was about WHERE it lives —
U83, settings live where their effect lives.

## D35. Offline Study/SRS with later sync  [OPEN — strongly motivated]
25/06 22:58. vvvvtk walks 20 extra minutes to a different gym to get signal for his reviews: "idk why
my gym seems to be in a bunker". Owner proposed the right shape — an eventually-consistent queue.
This is A3 with a user story attached, and it is also U107's storage schema.

## D36. Native standalone app / whole-device reading  [OPEN — long-term, repeatedly requested]
25/06 22:58 and throughout. Concrete sub-asks: an **iOS share-sheet/Shortcuts screen translator**
modelled on Tap Translate (owner: "I know how they did it so can do the same"); **App Store listing**
so users skip userscripts (blocked on the £100 Apple fee, which the owner said he'd pay); React
Native for web/Android/iOS parity (25/07). vvvvtk: "if there was a magic way to work on the entire
phone… it would be life changin". Ties U95, A6.

## D37. PWA  [DONE — 2026-07-28]
The 2026-07-26 note claimed the video player was installable and "what is missing is a PWA for the
Study/newtab surface". The second half was WRONG: `public/newtab/manifest.webmanifest` and
`public/newtab/sw.js` were already in the tree, `scripts/sync-docs-userscript.cjs` was already
deploying both to `docs/public/study/`, and the Study client already had an "Install app" button in
its overflow menu. What was actually missing was installability plumbing and discovery, repaired under
A16: PNG icons at 192/512 plus an inset maskable 512 (no raster icon reached 192px before, which can
fail Android installability outright), a `screenshots` member for narrow and wide, `theme_color`
matching the HTML meta, and a line in the FAQ's "Does it work on my phone?" answer. The `?mode=`
shortcuts were NOT broken — `newTabRoute()` still reads `mode` and accepts word/search/stats — and a
test now checks them against the shipped route set instead of a second copy of the list.
Original triage follows.
25/06 22:50, vvvvtk; owner agreed it is the cheap version of D36 ("ok that is easy… pwa"). Nothing
matching a webmanifest found in `src/` this session. **Lowest-cost step toward the mobile
positioning in U95.**

## D38. BookWalker second view mode  [PARTIAL]
canna98 25/06 22:52, and the whole 17/06–25/06 arc: OCR worked only in single-page portrait, not
double spreads; the owner said "Ill get the other mode working". Also from that arc, still worth
confirming closed: **OCR from the previous page persisting after a page turn** (25/06 23:40, canna98
also 25/06 21:55), and BookWalker's own reader setting that had to be changed before Yomu worked at
all — canna98 found it herself and the owner's response was "**u have to mention it in manual**".
That last one is a documentation bug that cost two full days of debugging.

## D39. Keyboard word-to-word navigation over a text selection  [SHIPPED? → verify]
amine_75173, 30/05: "select a piece of text and move from word to word using shortcuts instead of
using the mouse to hover". `previousLookupWord`/`nextLookupWord` are bound (Shift+←/→). Verify it
works over a selection, which is what was asked.

## D40. Video player: leave subtitles alone, reveal analysis only on pause  [OPEN]
amine_75173, 30/05: "the subtitles always by side is annoying unless you're deciphering everything" —
watch normally, and when you pause, the side panel explains the current line. Owner agreed auto-hide
is simple and was rightly sceptical of the AI-explanation half.
**This is U93 (low-intervention mode) proposed by a user two months earlier, for video.**

## WHAT THIS LOG CHANGES ABOUT THE EXISTING BACKLOG
1. **D8 (Study readings) is the most-repeated complaint in the entire history** — four reports, three
   people, plus a follow-up saying the first fix put furigana on the wrong side. A7/U111 should open
   with it.
2. **D16's .ass diagnosis is probably the fix for U8** — two `Format:` lines, wrong one parsed. That
   is a free bug fix sitting in a user's Discord message.
3. **vvvvtk volunteered to write the Steam Deck guide (D3) and offered "ANYTHING"**; canna98 called
   herself the tester. There is unused contributor capacity here — U94 is about reaching strangers,
   but these three are already inside.
4. **The 50% rule and the "year to learn Japanese" doc** (25/07 16:23) are already captured as U65 —
   but note the owner's framing is that it comes from **drawabox**, an art curriculum, not a language
   one. Keep that provenance in U66; it is a genuinely good story.
5. **Two independent users asked for low-intervention reading** (D40 amine 30/05, and the community
   counter-current behind U93). That is no longer a single data point.

---

# 2026-07-26 — OWNER BRIEF (late): iOS, Academy vision, 32-language packs, disk

## E1. iOS — "still to come", but record the target now  [OPEN]
Not yet built; capture every stated expectation so the spec exists before the work does. From the
logs: App Store listing so users skip userscripts entirely (blocked only on the £100 Apple fee, which
the owner said he would pay); a **share-sheet / Shortcuts screen translator** modelled on Tap
Translate, to read ANY app not just Safari; React Native so web/Android/iOS share one build;
offline SRS on a train (D35); PWA as the cheap first step (D37 — already half-built for the video
player). Known iOS defects that gate any launch: U4 Safari OOM ~every 5 min, copy/paste
interference, the startup overlay appearing on every site, and settings saving per-site not globally.

## E2. ACADEMY — a full vision recovery is required before any more building  [OPEN — large]
**Not an as-is/to-be exercise.** The owner's ask is to reconstruct the vision IN FULL from history —
all past and current **Codex sessions** and past **Claude sessions** where it was brainstormed — and
then judge the existing work against it. Specifically required:
- What was already built, and **where it strayed** from what was expected.
- **The owner's disappointments, named.** Likely "AI slop" in the lessons rather than high-quality
  teaching — audit lesson content for it the same way U54 audits product copy.
- **Critical failures and downfalls**, not a feature list — including where it used its SOURCES badly.
- **Use of space:** stop making learners scroll inside small scraps of paper. Persona-like confident
  layout while keeping the theme. This is a UI failure, not a content one.
- **Story must adapt per language** once Academy generalises.
- **3D Tartarus-class experiences** — plural, "we should have more such experiences and a consistent
  world" — with genuinely good graphics, explicitly NOT what is currently in the works.
- **memoryOS principles were never integrated.** Research memoryOS properly and port its principles
  across; the owner considers this a miss, not a nice-to-have.
- **Review the ARCHITECTURE**, not just the content.
- Output: the distinct Academy requirements enumerated, and an honest assessment of how far off we are.
**Sequencing:** the owner also said "for now — fixing existing bugs and refreshing the website and
extensions is more important." So this is a research/spec task to run alongside, not ahead of, U68/
U48/U52 and the store-listing work.

## E3. Academy source material, and generalising it to 32 languages  [OPEN]
Japanese Academy is based on the **learning pack** (nyaa.si/view/1372367) plus **sensei's Moodle
courses**, already saved to Documents. Every other target language needs an equivalently
high-quality reference set, and those do not exist yet — finding them is a research task per language
(the owner asked for researcher threads on this). **An external SSD is plugged in for the packs** —
disk, not licensing, was the stated constraint. Licensing is closed entirely — see A22.4.

## E4. Disk: carefully trim Codex sessions — do NOT blindly delete  [OPEN]
Most of the machine's disk is `~/.codex/sessions`. The owner's position has CHANGED from "never
prune": a **careful trim** is now wanted, targeting duplicated sessions, ideally by compression
rather than deletion, with real work preserved. Explicitly: search GitHub for an existing tool that
does this rather than hand-rolling. An external HDD is available as an alternative to deleting.

## U43 CORRECTION (owner, 2026-07-26)
The proxy-coverage gaps are **less severe than recorded** — a proxy is not always needed, and
**not proxying is better where possible**. Re-rank U43 down and reframe it as "avoid the proxy by
default, use it only where an origin genuinely requires it" rather than "close the coverage gaps".

## D-LIST AUDIT RESULT (2026-07-26, re-run against origin/main — supersedes the inline marks)
**Method warning:** the first pass was greped against `apps/yomu-reader`, which is a SHARED tree
pinned at v1.6.228 and ~200 versions behind. Any triage done there is worthless. Re-run on a clean
`origin/main` worktree:

- **D22 audio/listen mode — SHIPPED.** `listenMode` is a real mode (`newtab/controller.ts:598,2083`).
- **D34 Pass/Fail scale — SHIPPED.** A `twoButtonReviews` select labelled "reviewRatingScale"
  (`settings/form.ts:498`). Only the placement question (U83) is open.
- **D39 keyboard word-to-word nav — SHIPPED.** Handled at `app/main.ts:3840`.
- **D8 Study readings — SHIPPED** (`newtab/controller.ts:6944`), verified earlier.
- **D13 version + latest version in Help — OPEN, NOT shipped.** `latestVersion` does not appear in
  `settings/dialog-controller.ts` on origin/main; my earlier SHIPPED? mark came from the stale tree.
  This is the "Help should show current Yomu version, latest version, and how to update" ask, and it
  is also what U69 (previous-versions page) and U109 (visible release channel) hang off.
- **D33 frequency pill by default — UNRESOLVED.** No `showFrequency`-style settings key exists, so
  the pill is likely driven by installed dictionaries rather than a default. Needs a behaviour check,
  not a grep.
**Everything still marked [OPEN] in the D-list above has NOT been re-verified against origin/main.**
Do that before working any of it.

## D41. ACADEMY ACCOUNT SYNC IS MISFILED UNDER "BACKUP & SYNC"  [OPEN — owner 2026-07-26]
Owner: "the ux is strange here putting it in the export". The screenshot shows ACADEMY ACCOUNT SYNC
nested inside the **Backup & sync** section, whose own description is "export and import settings as
plain JSON, back up dictionaries, or sync through Google Drive" — and it sits directly above the
Import/Export settings JSON and Import/Export dictionaries button grid.
Signing in to an account is not a backup operation. The word "sync" is doing double duty for two
unrelated things (file backup vs account pairing) and that collision is what makes the panel read
as incoherent. **Account/sign-in belongs in its own section**, not inside export tooling.
Ties U49 (journeys), U82 (nav/IA), U83 (settings live where their effect lives), U103 (presets).
Also in the same screenshot and already in flight (workflow): the "Manage account & pairing code"
CTA is ~590x210px with an unconstrained ~80px black link glyph, while its siblings (Connect,
Import/Export) are correctly sized — an element that opted out of the shared button contract.

## D42. SEO: WE DON'T KNOW WHAT USERS SEARCH FOR — do query research before optimising  [OPEN — owner 2026-07-26]
Owner: "its maybe not even clear what users are searching for". This reframes U88 and the whole SEO
effort and should be settled BEFORE any on-page work.
**The brand term is the wrong target.** Nobody searches "yomu reader" unless they already know it,
and that query is contested by five namesakes (U88). The reachable audience searches the PROBLEM:
"yomitan for manga", "read japanese on ipad", "mine anki from netflix", "furigana chrome extension",
"OCR manga dictionary", "yomitan mobile", "yomitan alternative iphone". Those have no brand
collision, and r/LearnJapanese shows them asked repeatedly with poor answers — several are questions
Yomu already answers better than anything else (BookWalker OCR, Firefox Android, YouTube filter).
**Method:** derive the query list from the community research already in this file (the recurring
"how do I…" questions in the r/LearnJapanese section are literally search queries in disguise), then
map each to a page that answers it. That is also the docs rewrite (B2) — "what do we really need on
the homepage" is answered by "the questions people actually type".
Ties U88 (naming), U94 (community channels), B2 (stale docs), B4 (store listings).
Note the store search problem is the same shape: the Chrome listing is named よむ, so it cannot be
found by any Latin-script query at all.

## ONBOARDING DIRECTION — OWNER DECISION 2026-07-26: TRY-FIRST WINS
Three onboarding designs were put to a judge panel (workflow wxaeknmvm): zero-question,
three-question, and **try-first**. **The owner has chosen TRY-FIRST.** This decision OVERRIDES the
judge panel's verdict — if the panel picked differently, graft its best ideas INTO try-first rather
than re-litigating the choice.

**Try-first means:** the first thing a new user sees is Yomu working on real Japanese text — hover a
word, get the reading, meaning, pitch, audio — with **zero configuration and no account**. Setup is
offered only AFTER value has been demonstrated, and is skippable forever. Everything not needed for
that first lookup is inferred or deferred to the moment it actually matters.

**Why it fits the evidence:** setup friction is the #1 complaint about every tool in this category,
ahead of every missing feature; the community's own words on a rival tool were "can we get a demo
video/gif of it? dont want to set up all of that just to check it out"; and a paid competitor's
entire one-line pitch is "costs money, zero setup". Yomu is free and needs no account, which is the
one thing that competitor structurally cannot copy — try-first is how that advantage gets used
instead of buried behind 12 questions.

**Consequences to hold when implementing:**
- This subsumes U86 (zero-setup evaluation path) — the demo is not a separate marketing page, it is
  the first run itself.
- U80 (ask at most 3 things) becomes "ask ZERO up front"; the ≤3 becomes the ceiling for what may
  be asked later, in context.
- U81 (end on real content) is satisfied by construction.
- The 22-colour appearance tab (`settings/form.ts:231`) must not be anywhere near first run.
- Must not hardcode Japanese — the demo text is per target language (33 targets in flight).
- Existing users must NOT be re-onboarded on upgrade.
- The ≤5-minute claim (U85) should become a much smaller number and be measured in CI: clean
  profile → first furigana rendered, no account, no API key, no dictionary picker.

## D43. FULL UI LOCALISATION FOR EVERY TARGET LANGUAGE  [OPEN — owner 2026-07-26]
Owner: "full localisations to every language is needed - currently it just toggles between en and jp".
Today `interfaceLanguage` is a two-way en/ja switch (`app/i18n.ts` holds one English map and one
Japanese map). The ask is a real interface locale per supported language, not a toggle.

**Architecture slice prepared 2026-08-08:** the public VitePress site now has static root-English and
reviewed `/ja/` routes, build-time prose localisation, locale-owned navigation/metadata, a rendered
publication gate, and hydration/SPA gates. Seventeen Japanese bodies are publishable; API Reference,
Local Audio, Privacy, and the generated Settings Reference remain fail-closed pending native review.
The other 31 Website Locales likewise remain unavailable pending the native-review, RTL, and
maintainer-acceptance boundary in ADR 0011. This is D43 infrastructure, not D43 completion.

**Do not confuse this with U105's three tiers — but note the owner has now decided the interface
tier explicitly.** U105 recorded that Migaku ships only 3 interface languages (en/ja/es) and argued
Korean users want Korean *definitions*, not a Korean UI. The owner is overriding that scoping: he
wants full UI localisation as well. Both are now in scope — output-language rendering AND interface
localisation. Do not quietly drop one for the other.

**What makes this expensive, and must be planned before starting:**
- `app/i18n.ts` is a hand-maintained flat map. There is already a CI test asserting the Japanese map
  covers the latest CHANGELOG bullets verbatim, and another asserting hosted docs copy is covered —
  so every new locale multiplies a maintenance surface that is ALREADY a release-gate tripwire
  (see [[yomu-changelog-ja-docs-test]]).
- The docs site has its own separate ja map in `docs/.vitepress/theme/index.ts`. Two parallel
  translation systems exist; unify or explicitly decide not to before adding 30 more locales.
- Machine translation is the only realistic first pass at this volume, but the copy-voice rules
  apply (short, positive framing) and MT will not honour them — needs a review pass per locale.
- Locale ≠ target language: a learner studying Japanese may want a Korean interface. The two axes
  must stay independent (this is exactly U105's point, still valid).
- RTL: Arabic and Farsi are in the 33-language roster. Full localisation implies RTL layout support,
  which the reader overlay and popover geometry have never been tested against. Scope it explicitly
  or exclude it deliberately — do not discover it late.
- Plural rules, date/number formats, and font stacks per script.

**Sequencing:** this is a large piece of the multilanguage rewrite gated on 1.9.0, not a patch item.
Ties U15 (Korean definitions), U79 (CSS gating by data-language), U105 (three-tier model).

## D44. RECONCILIATION EDGE CASES — the hard part of multi-backend Study  [OPEN — owner 2026-07-26]
Owner: "think of edge cases like how to handle anki conflicts etc". This is the risk that sinks A2
(never make the user choose a backend) if it is not designed up front. Migaku avoided it by
EXCLUSION — own the SRS, treat Anki as a paid export. Yomu's stated goal is reconciliation across N
simultaneous sources, which is strictly harder and is the actual differentiator. Design it, don't
discover it.

**Enumerate and decide each of these BEFORE Study sync ships:**
- **Same word graded in two places.** Reviewed in Anki on the laptop and in Yomu on the phone, both
  offline, both since last sync. Which wins? Last-write-wins loses real work; "most advanced
  interval" punishes a legitimate lapse. Needs a stated rule the user can predict.
- **Scale mismatch on merge.** A card graded 5-point in jpdb and 4-point in jiten — U64 says the
  scale follows the destination, so a synced review must be TRANSLATED between scales. State the
  mapping, and note it is lossy in one direction.
- **Card exists in one backend only.** Mined to Anki but absent from jiten. Do we create it, ignore
  it, or surface it? bdlance's due count went 200/day -> 1600 because Yomu inserted reviews into
  jiten — silent creation is a known harm.
- **Deletion vs never-existed.** Requires tombstones; without them a delete on one device is undone
  by the next sync from another. (U107: every synced row carries mod/serverMod/del/serverVersion.)
- **Anki is simply not running.** AnkiConnect is localhost-only and frequently absent. Queue and
  retry, or fail loudly? Must never block a review.
- **Anki edited by hand.** Users reorganise decks, suspend, and bulk-edit outside Yomu. Yomu must
  not clobber that, and must tolerate a card whose note type or fields changed underneath it.
- **Duplicate detection across backends.** Same word, different note types/readings/POS — this is
  exactly why U97's 4-tuple identity (dictForm, secondary, POS, language) matters. Without it,
  reconciliation has no stable key.
- **Suspended / buried / leech states** have no common vocabulary across Anki, jpdb and jiten.
  Decide what maps and what is dropped, and say so in the UI.
- **Clock skew and timezones** across devices; "due today" is timezone-dependent.
- **Partial sync failure** mid-batch: must be resumable, never half-applied.

**Non-negotiable UX rule:** when a conflict cannot be resolved automatically, show the user the two
sides with enough information to choose (U107's Cloud vs This Device pattern: last updated, words
known, reviews due) and state plainly what each choice destroys. Silent resolution of a real
conflict is how people lose review history and stop trusting the tool.
Ties A2, A3, U44, U97, U107, U71. Feeds the Study rebuild in release-worktrees/study-cross-platform.

## S0. DOCS REWRITE + YOMU GAMING REMOTION + PERSONA STYLE REFERENCE  [OPEN — owner 2026-07-26]

### Every docs page gets rewritten — precisely and deliberately
Not edited, rewritten. The triage workflow (wgjgr9h9j) rules KEEP/CUT/MERGE/REWRITE per page; the
survivors are then written from scratch against one test: **after reading this, does the reader know
what Yomu is and what to do next?** Users currently finish the docs "still not knowing what yomu is
or if it should be kept around" — that is the failure being fixed, not staleness.
Rules that bind every page: short; state what Yomu DOES, never what it never does
(see [[yomu-copy-voice-rules]]); no Japanese-only assumptions (33 targets in flight); Academy is
"coming soon"; one primary CTA.

### Yomu Gaming needs a FULL REMOTION VIDEO
Owner: "For things like yomu gaming - I expect a full remotion". **Remotion** (React-based
programmatic video, remotion.dev) — a produced demo video, not a static screenshot page. It should
be built from REAL Japanese game screenshots showing the OCR → lookup → mine loop on game text.
Why this matters commercially: every high-scoring tool post on r/LearnJapanese in the last year led
with a GIF or clip (web-manga-ocr 399 pts, SubMiner 488 pts) — see U87, which asks for a 30-second
clip as the PRIMARY artefact for store listings and community posts. A Remotion pipeline makes that
repeatable per feature rather than a one-off screen recording.
Ties U41 (gaming build), U87 (demo clip), B4 (store listings), S-series (docs).

### Persona 5 Royal screenshots — dual-purpose reference
Owner supplied P5R screenshots (Leblanc attic/booth scene with the party; Kasumi at a summer
festival stall). Save to `references/style-persona/`. They serve TWO purposes:
1. **Japanese game screenshots** for the Yomu Gaming docs and the Remotion video — real in-game
   Japanese text (dialogue boxes, speaker name plates, UI chrome like 早送り / オート / ログ) is
   exactly the content the gaming OCR path must handle, and exactly what a demo should show.
2. **THE ACADEMY STYLE REFERENCE.** This is the concrete answer to E2's "Persona-like use of space"
   complaint. What to actually take from these frames:
   - **Confident full-bleed composition.** The scene owns the whole screen; UI sits ON it, not in a
     scrolling box. This is the direct fix for "scrolling inside small scraps of paper".
   - **Angled, energetic framing** — nothing is axis-aligned; the date/time chip (5/21 SATURDAY 土 /
     放課後) is a rotated stamp, not a header bar.
   - **Speaker portrait bleeding off the bottom-left corner**, oversized, breaking its own frame.
   - **Jagged speech-bubble geometry with a hard black keyline**, name plate in its own tab.
   - **A tiny, calm, corner-anchored control legend** (OPTIONS 早送り / オート / L3 ログ) — dense
     information without clutter; the opposite of Yomu's current settings surface.
   - **Saturated, limited palette** (red/black/white) applied with total conviction.
   Note the diegetic Japanese in-scene (両替, 乳生クリーム posters) — Academy should place learnable
   text IN the world, not only in lesson panels.
Ties E2 (Academy vision recovery), U41, U87.
