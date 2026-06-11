# Community Intel Backlog

Captured: 2026-06-11.

This is a non-prioritized backlog seed from the Jiten Discord, public JPDB research, Jiten/JitenReader source checks, and the current Yomu codebase. Items are grouped only so they are easier to scan. Adjacent Jiten/Japanese-learning workflow issues are included because a userscript can often patch or augment upstream behavior.

## Evidence Coverage

- Discord server: Jiten, `1352716079734198362`.
- Discord channels sampled this pass:
  - `#jiten-suggestions`: 48 visible forum posts.
  - `#jiten-bugs-issues`: 55 recent chat messages.
  - `#misparses`: 55 recent chat messages.
  - `#resources-scripts`: 11 resource/script posts plus thread references.
  - `#jiten-reader`: 33 recent chat messages.
  - `#srs-preview`: 55 recent chat messages.
  - `#jiten-discussions`: 55 recent chat messages.
  - `#development`: 55 recent chat messages.
- Discord extraction method: signed-in browser DOM extraction and panel scrolling. The page sandbox did not expose `fetch`/XHR from read-only evaluate, so this pass used rendered channel/forum content rather than Discord API pagination.
- Jiten source verification:
  - Local `resources/JitenReader` is stale relative to upstream `Sirush/JitenReader` v1.2.1.
  - Local `resources/Jiten` is stale relative to upstream `Sirush/Jiten`, which merged parser fixes on 2026-06-11.
- Yomu cross-reference baseline:
  - Active app: `apps/yomu-reader`.
  - Current app version observed: `0.6.122`.
  - Existing modified files before this artifact: `CHANGELOG.md`, `docs/refactor-backlog.md`, `package.json`, `src/reader/anki/index.ts`, `tests/reader/anki.test.ts`.

## Already Fixed Or Do Not Add As New Jiten Bugs

- JitenReader v1.2.1 already fixed or shipped several items visible in older reports: redundant-word controls/styling, auto-mine on review, mass-review keybind behavior, settings textarea overflow, Yatsu/Ttsu furigana fixes, and custom-domain syntax confusion.
- Jiten issue `#191` deconjugation HashSet ordering was closed by the maintainer as fixed.
- Jiten `#jiten-bugs-issues` included a select-page checkbox/bulk action report that Sirus answered with "Fixed both issues" on 2026-06-07.
- Jiten suggestions already tagged Implemented should not be re-added as Jiten bugs without retesting: +deck membership indicator, AnkiConnect parent deck import, AnkiConnect API key/password support, Kanken/JLPT kanji display choice, similar-media default type, personal occurrence export, daily review scheduling, request edit functionality, and comparison-system improvements.
- Yomu already has core support for many common asks: Yomitan dictionary import, custom word/pitch colors, JPDB/Jiten/Anki/local review sources, new-tab Word/Kanji/Search/Stats modes, swipe grading, blurred example translations, subtitle mining, OCR, and Jiten redundant state mapping.

## Backlog Items

### Review, SRS, And Card State

- Hide selected meanings/senses during vocabulary review.
  - Evidence: `#jiten-suggestions`, "Hide meanings for vocabulary review", 2026-06-11.
  - User behavior: learners want to learn only meanings encountered during immersion, not every dictionary sense at once.
  - Yomu cross-reference: Anki fronts can hide reading/sentence/image and examples can blur translations, but Yomu does not appear to store per-sense encountered meanings for JPDB/Jiten review cards.

- Make compound decks or compound word cards learnable, not only master/blacklist.
  - Evidence: `#jiten-suggestions`, "Compound decks", 2026-06-10.
  - Yomu cross-reference: Yomu can review provider cards, but has no Jiten compound-deck learner lane or compound-specific card model.

- Add stop-at-end-of-batch review mode.
  - Evidence: `#jiten-suggestions`, "Srs stop at the end of batch", 2026-06-09.
  - Yomu cross-reference: Yomu has session progress and queues in `src/reader/newtab/session-progress.ts` and `src/reader/newtab/study-queue.ts`; no explicit "do not fetch next batch after current batch" mode was confirmed.

- Separate vocabulary and kanji SRS intervals for the same word/media.
  - Evidence: `#jiten-suggestions`, "Separate vocab and kanji study"; separate request "being able to srs kanji".
  - User behavior: some learners deliberately study kanji slower than vocabulary and want furigana-bearing vocab cards separate from kanji recall.
  - Yomu cross-reference: Yomu has Word and Kanji modes, kanji drilldown, stroke practice, and kanji study cards, but not two independent Jiten intervals for the same vocabulary item.

- Explain review count and schedule changes during reviews/imports.
  - Evidence: `#srs-preview` users did not understand scheduling graphs, "mastered" semantics, retention changes, and JPDB-import state behavior; JPDB public research shows recurring due-counter confusion.
  - Yomu cross-reference: `docs/study-hub-parity.md` says Yomu has stats/due summaries, but count explanations and "why this changed" copy are still a product opportunity.

- Add safer import state overwrite controls.
  - Evidence: `#srs-preview`: JPDB reimport can unblacklist words if "overwrite card state" is left enabled; users rely on full backups to recover.
  - Yomu cross-reference: Yomu imports JPDB review exports for stats and has settings import/export, but not a dedicated destructive-state preview/diff for JPDB/Jiten imports.

- Model suspended/blacklisted/redundant state precedence explicitly.
  - Evidence: `#jiten-bugs-issues`: suspended and blacklisted cards still showed overdue; due color beat suspended state; redundant/due/young cards had no grading buttons but users still wanted at least blacklist controls.
  - Yomu cross-reference: `CardState` includes `due`, `blacklisted`, `suspended`, and `redundant` in `src/reader/app/types.ts`; Jiten maps `6` to `redundant` in `src/reader/dictionaries/jiten.ts`; `assertReviewableApiCardState` blocks review for blacklisted/never-forget/redundant in `src/reader/cards/action-controller.ts`. Yomu should still audit visual priority and fallback actions when multiple states are present.

- Add Jiten batch-review or mass-review visible words.
  - Evidence: JitenReader v1.2.0 upstream added mass review using Jiten `srs/batch-review`; `#jiten-reader` users discussed mass review and backup anxiety.
  - Yomu cross-reference: Yomu Jiten client exposes `srs/review` only in `src/reader/dictionaries/jiten.ts`. `docs/refactor-backlog.md` already has "mass-review visible words" under Jiten v1.2.x remaining.

- Add review session modes borrowed from JPDB user workarounds.
  - Evidence: public JPDB research: requests for reviews-only, new-only, review-ahead, focus deck/list, short block, no-new-after-due queue; scripts mask huge review counts to make sessions feel manageable.
  - Yomu cross-reference: Yomu has provider selection and browse filters, but no explicit review-load masking or full session mode matrix.

- Add typed answer / production review modes.
  - Evidence: JPDB type-in-answer browser extension exists; users add objective grading outside JPDB.
  - Yomu cross-reference: no typed-answer production mode found in new-tab review controls.

- Add repeat-audio shortcut.
  - Evidence: `#srs-preview`: request for `R` shortcut to repeat word audio.
  - Yomu cross-reference: Yomu has `playAudio` shortcut in `ReaderSettings.shortcuts`, but no dedicated repeat-last-word-audio binding was confirmed.

- Add swipe-regression fixture for problematic cards.
  - Evidence: `#srs-preview`: swipe gesture failed for `見張り`.
  - Yomu cross-reference: Yomu has `tests/reader/new-tab-swipe-gesture.test.ts`; add a fixture if the same card shape reproduces.

### Reader, Popup, And Parser

- Add parser correction and misparse-report workflow.
  - Evidence: `#misparses` is active and high-signal; examples include `などしておける`, `探しました`, `あらざる`, `全機`, `数度`, `よって`, `についてきている`, `間違っちゃいない`, `ぶっ壊れた`, `錯誤して`, `撃ち漏らし`, and wrong Jiten vocabulary IDs.
  - User behavior: users can identify exact desired segmentation/reading, but the correction lives in Discord rather than the reader.
  - Yomu cross-reference: Yomu parser can fall back to local segmentation and dictionaries in `src/reader/lookup/parser.ts`, but no persistent per-user parser override/correction store was found.

- Add parser confidence and "suspected misparse" UI.
  - Evidence: JPDB public research and Jiten Discord misparses both show wrong names/readings winning over common readings.
  - Yomu cross-reference: Yomu displays parsed tokens, but no confidence marker was found.

- Use source furigana/ruby as parse evidence where available.
  - Evidence: JPDB public research notes generated furigana mistakes and desire to use source furigana; Jiten source has recent parser/furigana fixes upstream.
  - Yomu cross-reference: Yomu has ruby-aware parsing helpers and tests, but this should be audited against Jiten/Jpdb parser calls.

- Handle names and proper nouns as user/community corrections.
  - Evidence: `#jiten-suggestions`, user-submitted names for characters/places; examples where character names split into kanji or wrong readings.
  - Yomu cross-reference: Yomu can display local dictionaries, but no community correction submission or local name override lane was found.

- Improve popup auto-hide and pointer containment.
  - Evidence: `#jiten-reader`: popup closes even while the mouse is inside; auto-hide after leave seems bugged.
  - Yomu cross-reference: Yomu has popover/sheet modes and hover logic in `src/reader/app/main.ts`; add tests around pointer entering popup and delayed close.

- Add invisible/minimal popup or coexistence mode for Yomitan/Jiten workflows.
  - Evidence: `#jiten-reader`: users pair Jiten Reader with Yomitan/auto-fail and ask for an invisible popup or key conflict workaround.
  - Yomu cross-reference: Yomu has configurable popup modes and colors, but no intentional invisible "status/action only" mode.

- Add long-press suppression for mobile coexistence with Yomitan.
  - Evidence: `#jiten-suggestions`: prevent popup when long pressing because Yomitan and Jiten Reader both appear.
  - Yomu cross-reference: Yomu has mobile/touch popup behavior, but no explicit long-press threshold suppression was confirmed.

- Audit stale status-color cache and "monochrome/off" semantics.
  - Evidence: `#jiten-reader`: deleting color settings returned words to red; workaround was CSS or setting words to black.
  - Yomu cross-reference: Yomu has color source modes (`status`, `jpdb`, `anki`, `pitch`, `off`) and custom color settings; add regression coverage for clearing custom colors and turning channels off.

- Add parser performance guardrails for VN/text-hooker pages.
  - Evidence: `#jiten-reader`: parsing freezes Yatsu VN stats tracker for 3-5 seconds.
  - Yomu cross-reference: `docs/refactor-backlog.md` already has abortable visible-work scheduler and idle CPU lanes; add Yatsu/Ttsu style text-hooker fixtures if possible.

- Add constructed-word indicators for obvious prefix/suffix forms.
  - Evidence: `#jiten-suggestions`: users want `お` prefix and similar constructed forms marked without treating them as entirely separate unknowns.
  - Yomu cross-reference: Yomu has fallback/deinflection logic, but no constructed-word badge or base-word known-state rollup was confirmed.

### Examples, Grammar, And Context

- Rank example sentences by difficulty and usefulness.
  - Evidence: `#development`: users dislike generic JPDB examples and want sentence difficulty based on length, word frequency, and possibly knownness; they want common target words to have understandable surrounding words.
  - Yomu cross-reference: Yomu has Immersion Kit/Nadeshiko/JPDB examples and filters for category, length, image/translation visibility, and blur. It does not yet appear to score examples by known words or frequency.

- Add example source/genre filters.
  - Evidence: `#development`: users asked to include/exclude tags or prioritize adventure/action; request to filter out visual novel examples.
  - Yomu cross-reference: Yomu supports Immersion Kit category filters (`anime`, `drama`, `games`, `all`) but not arbitrary media tags, genre preferences, or Jiten media source filters.

- Add spoiler-aware example controls.
  - Evidence: `#development`: example sentences from media have spoiler risk; Jiten blurs by default.
  - Yomu cross-reference: Yomu has blurred example translations, but not a spoiler-sensitive source/media progress control.

- Add favorite/add-own/mined example sentences.
  - Evidence: `#development`: Jiten discussion mentions users being able to favorite sentences or add their own manually/via mining.
  - Yomu cross-reference: Yomu stores mining context and can mine Immersion Kit context, but no multi-context/favorite examples store was confirmed.

- Improve grammar discovery as "catch what I do not know".
  - Evidence: `#jiten-discussions`: users often do not know which grammar point they are missing; idioms/colloquialisms can look like normal sentences.
  - Yomu cross-reference: Yomu has optional grammar hints and known/hidden grammar controls, but should focus on subtle pattern detection and explanations that keep reading moving.

- Add sense/meaning provenance from immersion.
  - Evidence: hide-meanings request wants meanings learned from actual immersion only.
  - Yomu cross-reference: mining context stores sentence/source, but not meaning-sense provenance per occurrence.

### Frequency, Deck Membership, And Personalization

- Add custom frequency source selection and badges.
  - Evidence: `#jiten-suggestions`: request for conversational frequency like CC100; `#resources-scripts`: custom Yomitan frequency dictionaries from Jiten media/goals.
  - Yomu cross-reference: Yomu imports Yomitan frequency dictionaries and has `frequencyRank`, but no first-class per-profile frequency source selector or "common in my target media" badges.

- Add explicit Jiten deck/word-list membership UI.
  - Evidence: `#jiten-suggestions`: +deck membership indicator was tagged Implemented in Jiten; Jiten source now returns study deck IDs and lookup decks.
  - Yomu cross-reference: Yomu card type has `sourceDeckName` and `jpdbDeckMembership`, but no general Jiten `deckIds`; `docs/refactor-backlog.md` already notes explicit checkmark UI as undecided.

- Add deck-based word styling.
  - Evidence: Jiten source subagent found upstream JitenReader uses deck IDs to style words by media deck/frequency deck/word list.
  - Yomu cross-reference: `docs/refactor-backlog.md` already lists deck-based word styling under Jiten v1.2.x remaining.

- Add commonness gates for mining/review.
  - Evidence: JPDB public research: users request limiting new card introductions by commonness.
  - Yomu cross-reference: Yomu has frequency data and local dictionaries; no commonness gate by source/frequency threshold found.

### Imports, Sync, And External Integrations

- Add guided JPDB-to-Jiten/Yomu migration.
  - Evidence: `#jiten-discussions`: new users switching from JPDB find import convenient only after discovering it; `#srs-preview` shows import state confusion.
  - Yomu cross-reference: Yomu can parse JPDB review export text for stats; not a full guided migration wizard.

- Add Migaku known-word sync.
  - Evidence: `#resources-scripts`: user made a Migaku Memory known-words sync to Jiten API.
  - Yomu cross-reference: no Migaku integration found.

- Add AniList planning import / media planning sync.
  - Evidence: `#resources-scripts`: userscript imports AniList planning list to Jiten.
  - Yomu cross-reference: Yomu has no media library/planning model.

- Add WaniKani and Bunpro vocabulary import.
  - Evidence: `#jiten-suggestions`: request to import known vocab from WaniKani/Bunpro API keys.
  - Yomu cross-reference: no WaniKani/Bunpro import found. Public JPDB research also found Bunpro integration demand.

- Add Anki package import to SRS or safer Anki/Jiten import bridge.
  - Evidence: `#jiten-suggestions`: import `.apkg`/`.colpkg` into Jiten SRS.
  - Yomu cross-reference: Yomu integrates live AnkiConnect and can mine to Anki; it does not import Anki packages into its own SRS.

- Add raw API/debug response link for media and cards.
  - Evidence: `#resources-scripts`: userscript adds raw API-response links to Jiten media entries because useful fields disappeared from UI.
  - Yomu cross-reference: no user-facing raw/debug data link found.

- Add iPad/Safari path that avoids Orion.
  - Evidence: `#development`: "for all the jiten ipad users out there so they dont have to go through orion".
  - Yomu cross-reference: Yomu already supports iPhone/iPad via userscript managers and has mobile docs; still keep Safari install friction in scope.

### Media Library And Discovery

- Add notifications when ongoing/completed media receives new material.
  - Evidence: `#jiten-suggestions`: users marking a series complete may not notice when new books/episodes are added.
  - Yomu cross-reference: Yomu has no media library status tracker.

- Add richer media metadata: release date, score, author, source-specific ratings.
  - Evidence: `#jiten-suggestions`: metadata proposal for sorting/filtering across anime, manga, VNs, games, books.
  - Yomu cross-reference: adjacent only unless Yomu grows a media planning surface.

- Add sentence search across Jiten corpus.
  - Evidence: `#jiten-suggestions`: request for Massif-like search over sentence chunks.
  - Yomu cross-reference: Yomu has lookup/search in the new tab, but not corpus sentence search.

- Add speech-density and i+1/i+0 sentence percentage to media difficulty.
  - Evidence: `#jiten-suggestions`: requests for percent speech and sentence unknown-word distribution.
  - Yomu cross-reference: Yomu has page coverage summaries and parsed tokens; no media-level speech density/i+1 distribution found.

- Add media-by-status dashboard and saved sorting/filter states.
  - Evidence: `#jiten-suggestions`: view media by status, save custom sorting states, separate favorites from status, anime movie filters.
  - Yomu cross-reference: adjacent unless Yomu adds media library planning.

- Add media request management affordances.
  - Evidence: `#jiten-suggestions`: voted-on tab/filter, community-made database entries, user-submitted names, voice-acting tags.
  - Yomu cross-reference: adjacent; useful if Yomu/Jiten augmentation adds request or correction overlays.

- Add comparison undo/back.
  - Evidence: `#jiten-suggestions`: comparison screen back button.
  - Yomu cross-reference: no pairwise media comparison feature.

### JPDB-Specific Lessons For Yomu/Jiten

- Keep JPDB live-review bridge as the trust path and label approximations.
  - Evidence: public JPDB research and `docs/refactor-backlog.md`: JPDB API lacks due timestamps/review-order endpoint; Yomu already labels API vocabulary as deck-order approximation.
  - Yomu cross-reference: already handled in `docs/refactor-backlog.md`; retain as principle for future JPDB work.

- Add better review-state explanations than JPDB.
  - Evidence: JPDB users are confused by due counters, unlocking, `Something`/`Nothing`, kanji/vocab dependencies, and count changes mid-session.
  - Yomu cross-reference: opportunity for explanatory copy around review source lights and due summary.

- Build first-class rich-context cards.
  - Evidence: JPDB userscripts add Immersion Kit examples, images/audio, sentence cards, favorites, and media support.
  - Yomu cross-reference: Yomu already has Immersion Kit/Nadeshiko/audio/context images, but can improve multi-context and favorite/history handling.

- Add leech/fail analytics.
  - Evidence: JPDB stats notebooks analyze exported review JSON for fail counts and leeches.
  - Yomu cross-reference: Yomu stats exist, but leech/confusion-cluster actions were not found.

- Add stable export/API affordances for user data.
  - Evidence: JPDB deck export, frequency list, stats, and Anki-conversion scripts exist because API/export surfaces are incomplete.
  - Yomu cross-reference: Yomu is local-first; future user data should stay exportable and scriptable.

## Source Pointers

- Yomu feature docs: `docs/features.md`.
- Existing Yomu engineering backlog: `docs/refactor-backlog.md`.
- Existing JPDB/Jiten study parity analysis: `docs/study-hub-parity.md`.
- Yomu Jiten API client: `src/reader/dictionaries/jiten.ts`.
- Yomu parser: `src/reader/lookup/parser.ts`.
- Yomu card/state types: `src/reader/app/types.ts`.
- Yomu card action controller: `src/reader/cards/action-controller.ts`.
- Yomu new-tab controller: `src/reader/newtab/controller.ts`.
- Local Jiten references: `../../resources/Jiten`, `../../resources/JitenReader`.
- Upstream Jiten: https://github.com/Sirush/Jiten
- Upstream JitenReader: https://github.com/Sirush/JitenReader
- JPDB public API docs: https://jpdb.stoplight.io/docs/jpdb/mgsimhgxpjpqe-jpdb-io-public-api
- JPDB site/FAQ: https://jpdb.io/ and https://jpdb.io/faq
- JPDB script/workaround examples:
  - https://github.com/max-kamps/jpd-breader
  - https://github.com/Kagu-chan/anki-jpdb.reader
  - https://github.com/Kagu-chan/jpdb.io
  - https://greasyfork.org/en/scripts/by-site/jpdb.io
  - https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples
  - https://github.com/felix-ops/JPDB-Media-Support
  - https://github.com/sujalwastaken/typeinjpdb.io
  - https://github.com/JaiWWW/jpdb-ease-review-load
  - https://github.com/JaiWWW/JPDB-Export
  - https://github.com/MarvNC/jpdb-freq-list
  - https://github.com/daryll-ko/jpdb-stats
  - https://github.com/Raffaelbdl/jpdb-anki
