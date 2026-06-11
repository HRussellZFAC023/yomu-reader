# Study Hub Parity — gap analysis and tickets

Source of truth: live signed-in journeys captured 2026-06-11 via Playwright MCP on the
user's accounts (jpdb.io Learn/deck-browse/review, jiten.moe Study/Cards/History), plus
the user's screenshots of `jpdb.io/deck?id=global` and a review front/back.
The trust contract, in the user's words: *"if I press Learn in jpdb, it will show me
their SRS queue in a certain order, with certain informations on the front and back of
the cards… our tab in the study page should behave in the exact same ways, just with an
additional superset of features."*

## Reference anatomy (captured live)

### JPDB Learn page (`/learn`)
- Learning-progress table — columns `Learning | You know`, rows `Words (direct)`,
  `Kanji (direct)`, `Words (indirect)`, `Kanji (indirect)`, each `total | learning |
  known (pct)`; then **"Total known non-redundant vocabulary: N"**.
- Due summary sentence: *"You have 112 due items (20 vocabulary and 92 kanji) and 3181
  new items (2843 vocabulary and 338 kanji) available for review."*
- "Start reviewing" (`POST /review`, `new_session=1`).
- Deck list in **priority order** with per-deck vocab/kanji progress + coverage and
  reorder arrows (`POST /change_deck_priority`, `delta=±1`).
- Deck management: new empty deck / from text / from top vocabulary / from database /
  Anki import. Special decks: All vocabulary (`global`), Blacklisted, Never-forget.

### JPDB deck browse (`/deck?id=…`)
- Header stats (vocab/kanji progress + coverage bars).
- Sort: Chronologically · By frequency (within deck) · By frequency (whole corpus).
- **Show only** filters: New, Known, Due, Suspended, Locked, Learning, Never forget,
  Failed, Blacklisted, Redundant.
- "Search by spelling…", pagination ("Showing 1..50 from 34208 entries", Next page).
- Entry rows: furigana spelling, meanings, state badge ("Known (lvl 6)"), frequency
  ("Top 5900"), occurrence count, per-entry "…" menu.

### JPDB review (front/back, `/review`)
- Front: kind label ("Vocabulary"), the **source sentence** with the target word
  highlighted; `#show-answer`.
- Back: sentence with **furigana on non-target words** (per user settings), Meanings
  with part-of-speech tags, "Composed of" component glosses, **"Part of the Persona 5
  deck (3x)"** membership/occurrence line, optional image/audio; grade bar `✘ Nothing ✘
  Something / ✔ Hard ✔ Okay ✔ Easy` (`#grade-1..5`) plus collapsible `Blacklist` /
  `I'll never forget`.

### Jiten study hub (`/srs/decks`, `/settings/cards`, `/srs/history`)
- Tabs: **Decks · Cards · History · Settings** + persistent "Study (N)" button.
- Today panel: "N to do", done today (reviews/new), Due now (Reviews/New), next review
  countdown, day streak (longest, days studied), review activity forecast ("Next 7d: 2,
  Next 30d: 3"), upcoming-reviews list.
- Cards browser: state chips with counts (**All · Due · Learning · Review · Relearning ·
  Mastered · Suspended · Blacklisted**), "Search cards…", select-page checkbox with bulk
  actions, rows showing spelling + frequency rank (#46,155) + due-in ("Overdue 4d",
  "In 3w") + state.

## Where Yomu's study page stands (0.6.88)

Has: Word/Kanji/Search/Stats modes; queue from jpdb-live / jpdb-api / jiten / anki /
local with deterministic source toggle; JPDB-order live reviews via the review bridge;
grade bar with per-grade intervals (jpdb-api/anki/jiten); session progress + timer;
review fallback notice; offline cache; per-card source lights; cross-tab state bus;
stats heatmap/streak via Anki history, Jiten daily cache, JPDB export import.

Missing vs the references — the tickets below.

## Simulated user research (2026-06-11)

Five personas walked the captured journeys; their asks, mapped to tickets:

1. **Mobile-first learner (iPhone, YouTube + study page)** — wants an at-a-glance
   "what's left today" before committing on a commute; big touch targets; one-handed
   deck switch (shipped 0.6.97); swipe grading (shipped). Ask → SH-7 Today panel.
2. **Anki power user (1k+ cards)** — wants a due forecast before starting ("is tonight
   heavy?"), trustworthy due counts, post-mining sync affordance. Ask → SH-7 forecast
   (only Anki exposes due timestamps — keep other providers honest), backlog
   `forgetCards`/`sync` adoption ticket.
3. **JPDB loyalist (trust-focused)** — wants the exact Learn anatomy: stats table
   (0.6.89), due split (0.6.90), JPDB-first card content (0.6.91), deck entry points
   (0.6.97), JPDB grade copy (existing). Remaining ask → SH-4 composed-of + queue-order
   exactness audit.
4. **Jiten user** — wants the Cards browser select-page bulk actions and the
   upcoming-reviews list; day streak labelled like Jiten ("Longest / Days studied").
   Ask → SH-3 v2 bulk actions, SH-7 streak labels.
5. **iPad split-view user** — keyboard digit grading (0.6.94), trackpad hover lookups
   (existing), two-column landscape cards. Ask → SHIPPED 0.6.104: coarse-pointer landscape tablets split the study card into prompt-left / answer-right columns (verified with a real 1180x820 screenshot, qa-artifacts/ipad-landscape-study.png).

Synthesis: the highest-leverage unshipped item is a **Today panel** (every persona
referenced "what's due / what did I do today" before trusting the page as their one
stop); second is SH-3 v2 bulk actions; third is composed-of on card backs.

## Tickets (ranked)

### SH-1: Learning-progress table in Stats (JPDB shape) — SHIPPED 0.6.89 (Words row + total-known line per provider; kanji/indirect rows remain provider-side data gaps, see Non-goals)
Render the `Learning | You know` table — `Words (direct)`, `Kanji (direct)` rows first —
plus **Total known non-redundant vocabulary**, for each connected provider.
Feasibility: JPDB API `list user decks` + `global` deck card states give direct word
counts by state (known = young/mature/known/mastered/never-forget; non-redundant
excludes `redundant`); kanji via locked/known kanji states from deck cards. Indirect
rows need jpdb-only data — render the rows we can compute and label the table with the
provider; do NOT fake indirect numbers. Anki: counts from status index by queue. Jiten:
counts from study-batch/cards API.

### SH-2: Due summary sentence — SHIPPED 0.6.90 (session label now adds the due words/kanji split and unseen-new count when they add information beyond the snapshot's Due N; start-button copy unchanged by design)
"You have N due items (X vocabulary and Y kanji) and M new items…" above the queue,
computed from the active source's queue metadata; one primary button starts the session
(already exists implicitly — make the copy/shape match).

### SH-3: Card browser ("My Cards") — v1 SHIPPED 0.6.92 (idle Search tab shows the SRS pool with JPDB Show-only-order state chips + counts, 50-row pages, state badge + Top-N frequency per row, row click opens the full superset lookup; JPDB+Jiten pools). v2 search-within-pool SHIPPED 0.6.95 (typing with a state chip active searches MY cards; the All chip returns to dictionary search). Anki pool rows SHIPPED 0.6.100 (browser spans JPDB+Jiten+Anki; Anki joins the browse pool only, never the JPDB stats source). Show-only state filters on the Word tab itself SHIPPED 0.6.101 (the user's explicit ask: Study/All/New/Learning/Due/Failed/Known/Never-forget/Suspended/Locked/Blacklisted/Redundant select beside the deck scope; non-study filters merge the full browse pool in since the scheduled loader drops settled states). Select-page bulk actions SHIPPED 0.6.102 (Jiten parity: select-page checkbox + Blacklist/Never-forget fan through the shared performCardAction path — provider mapping stays in one place — then the pool reloads to recolor; exact-parity 'Total known non-redundant vocabulary' label also landed). Still remaining: due-in column (per-adapter timestamps: Anki nextReviews exists, Jiten interval labels only, JPDB none)
New "Browse" surface (or extend Search mode): chips with live counts (All/New/Learning/
Due/Known/Failed/Suspended·Blacklisted/Never-forget/Locked/Redundant — union of JPDB and
Jiten vocab), search by spelling, paginated rows (furigana spelling, first meaning,
state badge with level/interval when known, frequency rank, due-in), per-row actions
(grade-independent: open popover, deck add/remove, blacklist, never-forget), select-page
bulk actions (Jiten parity). Backed by: jpdb `list deck cards` (global), Jiten cards
API, Anki status index.

### SH-4: Review back fidelity — deck-membership line SHIPPED 0.6.93 (the live JPDB bridge scrapes jpdb.io's own 'Part of the X deck (3x)' line and the study card back renders it). Composed-of SHIPPED 0.6.98 (component-kanji chips with RTK/JPDB keywords on revealed word backs, kanji-popover drilldown, kana-only words skip it). jpdb-api membership SHIPPED 0.6.105 (deck-scoped queues stamp 'Part of the X deck' on every card; live-bridge scrape still wins). Anki+Jiten membership SHIPPED 0.6.106 (Anki: owning ankiDeckNames; Jiten: study-batch sourceDeckName)
Back of vocabulary cards should show the composed-of component glosses (we already
segment expressions for pitch — reuse for component glosses from local dictionaries /
JPDB), and the "Part of the X deck (3x)" line (jpdb deck membership already loadable;
occurrences from deck data when available; Jiten deck names from study deck list).

### SH-5: Review front fidelity — AUDITED + FIXED 0.6.91 (front-sentence default on ✓; provider-fidelity inversion fixed: JPDB-backed cards now front JPDB's own example sentence with Immersion Kit as fallback, not replacement; kind label covered by the mode tabs)
JPDB fronts show the sentence with the target highlighted (when the card has one).
`newTabFrontSentenceEnabled` exists — verify it defaults to match JPDB behavior for
jpdb-sourced cards, that the highlight styling matches (target blue, rest plain), and
the kind label ("Vocabulary" / "Kanji") is present like JPDB's.

### SH-6: Deck management parity — v1 SHIPPED 0.6.97 (in-page JPDB deck selector on the Word tab: All vocabulary + user decks via the API, selection persists in new-tab state and rescopes the queue through the existing scheduled-only deck loader; mobile-safe 16px select). Per-deck progress SHIPPED 0.6.103 (deck entries show vocabulary count + known coverage from list-user-decks, jpdb Learn shape). Jiten deck scoping PROBED 2026-06-11 and parked: srs/study-batch silently accepts deckId/userStudyDeckId/studyDeckId params (200, same payload) but both the test account and the user's account have zero study decks (srs/study-decks returns []), so scoping is unverifiable until one exists — revisit when the user enrolls a Jiten study deck. Anki deck scoping for the queue + deck creation remain; JPDB priority reorder stays page-only (no API endpoint)
List the user's decks (JPDB: listDecks; Jiten: study decks; Anki: deck names) inside the
study page with per-deck progress, reorder (JPDB API permitting — page uses
`change_deck_priority`; API has no priority endpoint → JPDB reorder is OUT of scope,
note it), create-empty/add-from-search where the API allows, and per-deck "study only
this deck" filtering of the queue.

### SH-7: Today panel — core SHIPPED 0.6.95 (Due-now tile with time estimate + reviews-today '+N new' detail beside the existing streak metrics). Remaining: 7d/30d forecast (only honest for Anki — needs due timestamps from the status index; JPDB API exposes none)
"Done today (reviews/new), due now, next review countdown, streak, next 7d/30d
forecast." Anki: `getNumCardsReviewedByDay` + due forecast from status index;
Jiten: study-batch metadata + daily cache; JPDB API: no forecast — show due-now only and
label the limitation.

### SH-8: Keyboard/grade-shortcut parity — AUDITED + SHIPPED 0.6.94 (Space/Enter reveal and arrow navigation already existed; added jpdb's 1..5 digit grading on revealed cards, mapped to the rendered grade-button order so two-button bars get 1=Fail 2=Pass; inputs/selects keep capture immunity)
JPDB: space=show answer, 1..5=grades; Jiten equivalents. Verify the new tab matches and
documents them (some shortcuts exist; audit + align).

## With-userscript journey findings (headless test accounts, 2026-06-11)

- jiten.moe `/srs/study` with the built userscript: Yomu's study addons mount on the
  real page (Immersion Kit panel, imported-dictionaries section, headword wrapped) —
  the "enhance their pages" half of the superset promise holds on the current build.
  Jiten's grade bar is Again/Hard/Good/Easy with a visible **"Show Answer — Space"**
  key hint → adopted: the study page now advertises Space + digit keys on its own
  controls (0.6.99); hidden on touch.
- jpdb.io headless login bounces silently back to /login (bot protection suspected;
  not retried to protect the test account) — JPDB with-userscript review capture
  remains covered by the signed-in MCP session (grade ids #show-answer/#grade-1..5
  captured live earlier; see Non-goals for the interval verdict).

## UX-evaluation directive (user, 2026-06-11)

When evaluating journeys in Playwright, always ask "what is this from a user
experience?" / "how would a user feel about this screen?" and file the findings here
for the next pass. First two findings, from the user's own screenshots:

- FIXED 0.6.107: on jiten.moe/srs/study the addon (Immersion Kit + the user's
  dictionaries) mounted detached at the top of the page — and during the question
  phase, where dictionary entries spoil the answer. It now mounts INSIDE the revealed
  card after Jiten's own sections, and produces no target at all until reveal
  (live-verified on the signed-in study page: front addonCount 0, back addonCount 1
  insideCard true).
- PARTIAL 0.6.108: Anki review cards now show Hard/Good/Easy due-ins on the study grade
  bar, computed exactly like Anki's own answer buttons (interval x 1.2 / x ease / x1.3 —
  cardsInfo never sends the GUI's nextReviews strings); learning/new cards and Again stay
  blank rather than guessing deck step config. Jiten intervals were already wired;
  jpdb has none (verified live 0.6.85). Popover grade-row intervals SHIPPED 0.6.109 (renderReviewButtons takes the card's reviewGradeIntervals — Anki existing notes get the computed previews too via ankiExistingNoteFromInfo). Learning-step previews SHIPPED 0.6.110 (new cards derive Again/Hard/Good/Easy from the deck's getDeckConfig learning steps — Anki's own first-answer numbers; one config fetch per distinct deck; mid-learning cards stay blank since cardsInfo lacks step position). The due-in story is now COMPLETE across providers and surfaces.

## Undocumented-endpoint technique (user direction, 2026-06-11)

Jiten's full API surface is browsable at https://api.jiten.moe/index.html, and features
missing from the documented API can still be used from the authenticated context: run
the journey in Playwright, capture the network requests the site itself makes, and call
the same endpoints from the extension with the user's session. Use this to unblock the
remaining Jiten lanes (per-deck study scoping, richer due data) — capture
`jiten.moe/srs/*` traffic in the signed-in MCP browser when it's free.

## Non-goals / verified impossibilities
- JPDB next-review intervals for live-bridge reviews: jpdb.io renders no interval data
  (verified live 2026-06-11).
- JPDB deck priority reorder via API: no endpoint; page-side forms only.
- Jiten media attach: no API (toast note shipped 0.6.86).
