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

## Tickets (ranked)

### SH-1: Learning-progress table in Stats (JPDB shape)
Render the `Learning | You know` table — `Words (direct)`, `Kanji (direct)` rows first —
plus **Total known non-redundant vocabulary**, for each connected provider.
Feasibility: JPDB API `list user decks` + `global` deck card states give direct word
counts by state (known = young/mature/known/mastered/never-forget; non-redundant
excludes `redundant`); kanji via locked/known kanji states from deck cards. Indirect
rows need jpdb-only data — render the rows we can compute and label the table with the
provider; do NOT fake indirect numbers. Anki: counts from status index by queue. Jiten:
counts from study-batch/cards API.

### SH-2: Due summary sentence + "Start reviewing" parity on the Word tab header
"You have N due items (X vocabulary and Y kanji) and M new items…" above the queue,
computed from the active source's queue metadata; one primary button starts the session
(already exists implicitly — make the copy/shape match).

### SH-3: Card browser with state filter chips + search + bulk actions ("My Cards")
New "Browse" surface (or extend Search mode): chips with live counts (All/New/Learning/
Due/Known/Failed/Suspended·Blacklisted/Never-forget/Locked/Redundant — union of JPDB and
Jiten vocab), search by spelling, paginated rows (furigana spelling, first meaning,
state badge with level/interval when known, frequency rank, due-in), per-row actions
(grade-independent: open popover, deck add/remove, blacklist, never-forget), select-page
bulk actions (Jiten parity). Backed by: jpdb `list deck cards` (global), Jiten cards
API, Anki status index.

### SH-4: Review back fidelity — "Composed of" + deck membership/occurrence line
Back of vocabulary cards should show the composed-of component glosses (we already
segment expressions for pitch — reuse for component glosses from local dictionaries /
JPDB), and the "Part of the X deck (3x)" line (jpdb deck membership already loadable;
occurrences from deck data when available; Jiten deck names from study deck list).

### SH-5: Review front fidelity audit — sentence-first front
JPDB fronts show the sentence with the target highlighted (when the card has one).
`newTabFrontSentenceEnabled` exists — verify it defaults to match JPDB behavior for
jpdb-sourced cards, that the highlight styling matches (target blue, rest plain), and
the kind label ("Vocabulary" / "Kanji") is present like JPDB's.

### SH-6: Deck management parity
List the user's decks (JPDB: listDecks; Jiten: study decks; Anki: deck names) inside the
study page with per-deck progress, reorder (JPDB API permitting — page uses
`change_deck_priority`; API has no priority endpoint → JPDB reorder is OUT of scope,
note it), create-empty/add-from-search where the API allows, and per-deck "study only
this deck" filtering of the queue.

### SH-7: Today panel + forecast (Jiten shape)
"Done today (reviews/new), due now, next review countdown, streak, next 7d/30d
forecast." Anki: `getNumCardsReviewedByDay` + due forecast from status index;
Jiten: study-batch metadata + daily cache; JPDB API: no forecast — show due-now only and
label the limitation.

### SH-8: Keyboard/grade-shortcut parity audit
JPDB: space=show answer, 1..5=grades; Jiten equivalents. Verify the new tab matches and
documents them (some shortcuts exist; audit + align).

## Non-goals / verified impossibilities
- JPDB next-review intervals for live-bridge reviews: jpdb.io renders no interval data
  (verified live 2026-06-11).
- JPDB deck priority reorder via API: no endpoint; page-side forms only.
- Jiten media attach: no API (toast note shipped 0.6.86).
